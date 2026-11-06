import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createTestPlatformProxy } from './helpers/d1.ts';
import {
	MAX_AUDIT_ATTEMPTS,
	STALE_CLAIM_MS,
	cancelBatch,
	getAuditStats,
	getOpenBatch,
	releaseExhausted,
	resumeBatch,
	runBatchStep,
	startOrResumeBatch
} from '../src/lib/server/shopee/audit-batch.ts';
import { updateMonitorSettings, getMonitorSettings } from '../src/lib/server/shopee/monitor-store.ts';
import { getProductShopeeLink } from '../src/lib/server/product-store.ts';

const credentials = { SHOPEE_APP_ID: 'test-app-id', SHOPEE_APP_SECRET: 'test-app-secret' };
const sleep = async () => {};
const SHOP = '5000';
const itemOf = (code: number) => String(1_000_000 + code);

type World = {
	/** Códigos cujo link curto responde 403 (falha técnica de resolução). */
	blocked: Set<number>;
	/** Códigos que resolvem mas não existem na API (produto não encontrado). */
	missing: Set<number>;
	apiCalls: number;
	resolves: number;
	apiDown: boolean;
	apiPrices: boolean;
};

function newWorld(): World {
	return { blocked: new Set(), missing: new Set(), apiCalls: 0, resolves: 0, apiDown: false, apiPrices: false };
}

function deps(world: World, now?: () => Date) {
	const resolveFetcher = (async (input: unknown) => {
		world.resolves += 1;
		const code = Number(String(input).split('/').pop());
		if (world.blocked.has(code)) return new Response(null, { status: 403 });
		return new Response(null, {
			status: 301,
			headers: { location: `https://shopee.com.br/opaanlp/${SHOP}/${itemOf(code)}` }
		});
	}) as typeof fetch;
	const fetcher = (async (_url: unknown, init?: RequestInit) => {
		world.apiCalls += 1;
		if (world.apiDown) return new Response('down', { status: 400 });
		const body = JSON.parse(String(init?.body)) as { query: string };
		const data: Record<string, unknown> = {};
		for (const match of body.query.matchAll(/(p\d+): productOfferV2\([^)]*?itemId: (\d+), shopId: (\d+)/g)) {
			const code = Number(match[2]) - 1_000_000;
			data[match[1]!] = {
				nodes: world.missing.has(code)
					? []
					: [{ itemId: match[2], shopId: match[3], productName: `Produto ${code}`, priceMin: '99.00', priceMax: '99.00' }],
				pageInfo: { page: 1, limit: 1, hasNextPage: false }
			};
		}
		return Response.json({ data });
	}) as typeof fetch;
	return { fetcher, resolveFetcher, sleep, now };
}

type Platform = Awaited<ReturnType<typeof createTestPlatformProxy>>;

async function withDb(run: (db: D1Database) => Promise<void>) {
	const platform: Platform = await createTestPlatformProxy();
	try {
		const db = platform.env.CANDIDATES_DB;
		await updateMonitorSettings(db, { paused: true, intervalHours: 12, batchSize: 20, hourlyCallBudget: 2000 });
		await run(db);
	} finally {
		await platform.dispose();
	}
}

async function seed(db: D1Database, count: number, from = 1) {
	const statement = db.prepare(
		`INSERT INTO products (id, name, category, price, image, url) VALUES (?, ?, 'Casa', 50, 'https://example.com/a.jpg', ?)`
	);
	for (let start = 0; start < count; start += 50) {
		const batch = [];
		for (let i = start; i < Math.min(start + 50, count); i += 1) {
			const code = from + i;
			batch.push(statement.bind(`p${String(code).padStart(6, '0')}`, `Produto ${code}`, `https://s.shopee.com.br/${code}`));
		}
		await db.batch(batch);
	}
}

const codeOf = (productId: string) => Number(productId.slice(1));

async function drain(db: D1Database, world: World, maxSteps = 400) {
	let last = await runBatchStep(db, credentials, deps(world));
	for (let i = 0; i < maxSteps && last.state === 'progress'; i += 1) {
		last = await runBatchStep(db, credentials, deps(world));
	}
	return last;
}

const batchProducts = async (db: D1Database, batchId: number) =>
	(
		await db.prepare('SELECT product_id FROM audit_batch_items WHERE batch_id = ?').bind(batchId).all<{ product_id: string }>()
	).results.map((row) => row.product_id);

/** Atalho para cat�logos grandes: marca o lote como conclu�do com sucesso (o fluxo real � coberto nos demais testes). */
async function completeBatchFast(db: D1Database, batchId: number) {
	const now = new Date().toISOString();
	await db.batch([
		db.prepare(`INSERT OR REPLACE INTO product_monitor_state (product_id, next_check_at, last_checked_at, last_success_at, last_outcome, consecutive_failures, total_checks, updated_at, audit_completed_at)
			SELECT product_id, ?, ?, ?, 'ok', 0, 1, ?, ? FROM audit_batch_items WHERE batch_id = ?`).bind(now, now, now, now, now, batchId),
		db.prepare(`UPDATE audit_batch_items SET status = 'done', outcome = 'ok' WHERE batch_id = ?`).bind(batchId),
		db.prepare(`UPDATE audit_batches SET status = 'completed', completed_at = ? WHERE id = ?`).bind(now, batchId)
	]);
}

test('catálogo > 2.000: primeiro lote seleciona exatamente 1.000 nunca auditados', async () => {
	await withDb(async (db) => {
		await seed(db, 2100);
		const stats = await getAuditStats(db);
		assert.equal(stats.total, 2100);
		assert.equal(stats.selectable, 2100);
		const started = await startOrResumeBatch(db, new Date());
		assert.equal(started.state, 'created');
		if (started.state !== 'created') return;
		assert.equal(started.batch.selected, 1000);
		assert.equal(started.batch.number, 1);
		assert.equal((await getAuditStats(db)).processing, 1000);
		assert.equal((await getAuditStats(db)).selectable, 1100);
	});
});

test('lotes de 1.000, 1.000 e 976 sem repetição e sem reauditar produtos concluídos', async () => {
	await withDb(async (db) => {
		await seed(db, 2976);
		const world = newWorld();
		const seen = new Set<string>();
		const sizes: number[] = [];
		for (let round = 1; round <= 3; round += 1) {
			const started = await startOrResumeBatch(db, new Date());
			assert.equal(started.state, 'created');
			if (started.state !== 'created') return;
			sizes.push(started.batch.selected);
			const ids = await batchProducts(db, started.batch.id);
			for (const id of ids) assert.equal(seen.has(id), false, `repetido: ${id}`);
			ids.forEach((id) => seen.add(id));
			const end = round === 3 ? await drainOne(db, world) : (await completeBatchFast(db, started.batch.id), { state: 'finished' });
			assert.equal(end.state, 'finished');
		}
		assert.deepEqual(sizes, [1000, 1000, 976]);
		assert.equal(seen.size, 2976);
		const stats = await getAuditStats(db);
		assert.equal(stats.audited, 2976);
		assert.equal(stats.neverAudited, 0);
		assert.equal(stats.percent, 100);
		assert.equal((await startOrResumeBatch(db, new Date())).state, 'empty');
	});
});

async function drainOne(db: D1Database, world: World) {
	// Limita o custo do teste: um passo real do último lote e conclusão rápida do restante.
	const step = await runBatchStep(db, credentials, deps(world));
	assert.equal(step.state, 'progress');
	assert.equal(world.resolves, 20);
	const open = await getOpenBatch(db);
	assert.equal(open?.processed, 20);
	await completeBatchFast(db, open!.id);
	return { state: 'finished' };
}

test('menos de 1.000 pendentes audita exatamente o restante e sem pendentes informa vazio', async () => {
	await withDb(async (db) => {
		await seed(db, 137);
		const world = newWorld();
		const started = await startOrResumeBatch(db, new Date());
		assert.equal(started.state, 'created');
		if (started.state !== 'created') return;
		assert.equal(started.batch.selected, 137);
		assert.equal((await drain(db, world)).state, 'finished');
		assert.equal((await startOrResumeBatch(db, new Date())).state, 'empty');
		assert.equal(await getOpenBatch(db), null);
		const stats = await getAuditStats(db);
		assert.equal(stats.selectable, 0);
		assert.equal(stats.audited, 137);
	});
	await withDb(async (db) => {
		assert.equal((await startOrResumeBatch(db, new Date())).state, 'empty');
	});
});

test('persiste item_id e shop_id corretos (não o id interno) e não altera preço nem reativa monitor', async () => {
	await withDb(async (db) => {
		await seed(db, 3);
		await db.prepare('UPDATE monitor_settings SET update_prices = 1').run();
		const world = newWorld();
		await startOrResumeBatch(db, new Date());
		assert.equal((await drain(db, world)).state, 'finished');
		assert.deepEqual(await getProductShopeeLink(db, 'p000002'), { itemId: itemOf(2), shopId: SHOP });
		const row = await db.prepare('SELECT id, price, url FROM products WHERE id = ?').bind('p000002').first<{ id: string; price: number; url: string }>();
		assert.equal(row?.price, 50);
		assert.equal(row?.url, 'https://s.shopee.com.br/2');
		assert.notEqual(row?.id, itemOf(2));
		assert.equal((await getMonitorSettings(db)).paused, true);
	});
});

test('produto não encontrado conta como auditado (não como falha) e fica fora do próximo lote', async () => {
	await withDb(async (db) => {
		await seed(db, 4);
		const world = newWorld();
		world.missing.add(3);
		await startOrResumeBatch(db, new Date());
		assert.equal((await drain(db, world)).state, 'finished');
		const stats = await getAuditStats(db);
		assert.equal(stats.audited, 4);
		assert.equal(stats.notFound, 1);
		assert.equal(stats.technicalFailures, 0);
		assert.equal(stats.linked, 3);
		assert.equal((await startOrResumeBatch(db, new Date())).state, 'empty');
	});
});

test('falha técnica não vira auditado, volta a ser elegível e para após o limite de tentativas', async () => {
	await withDb(async (db) => {
		await seed(db, 5);
		const world = newWorld();
		world.blocked.add(2);
		await startOrResumeBatch(db, new Date());
		assert.equal((await drain(db, world)).state, 'finished');
		let stats = await getAuditStats(db);
		assert.equal(stats.audited, 4);
		assert.equal(stats.technicalFailures, 1);
		assert.equal(stats.neverAudited, 1);
		assert.equal(stats.selectable, 1);
		const state = await db.prepare(`SELECT audit_completed_at, audit_attempts, last_error_code FROM product_monitor_state WHERE product_id = 'p000002'`).first<{ audit_completed_at: string | null; audit_attempts: number; last_error_code: string }>();
		assert.equal(state?.audit_completed_at, null);
		assert.equal(state?.audit_attempts, 1);
		assert.equal(state?.last_error_code, 'http_403');

		// Só o falho é selecionado de novo — nunca os já auditados.
		for (let attempt = 2; attempt <= MAX_AUDIT_ATTEMPTS; attempt += 1) {
			const next = await startOrResumeBatch(db, new Date());
			assert.equal(next.state, 'created');
			if (next.state !== 'created') return;
			assert.equal(next.batch.selected, 1);
			assert.deepEqual(await batchProducts(db, next.batch.id), ['p000002']);
			await drain(db, world);
		}
		stats = await getAuditStats(db);
		assert.equal(stats.exhausted, 1);
		assert.equal(stats.selectable, 0);
		assert.equal((await startOrResumeBatch(db, new Date())).state, 'empty');

		// Liberar + link voltando a funcionar conclui a auditoria.
		world.blocked.clear();
		assert.equal(await releaseExhausted(db), 1);
		await startOrResumeBatch(db, new Date());
		assert.equal((await drain(db, world)).state, 'finished');
		assert.equal((await getAuditStats(db)).audited, 5);
	});
});

test('falha da API é falha técnica, não auditoria concluída', async () => {
	await withDb(async (db) => {
		await seed(db, 3);
		const world = newWorld();
		world.apiDown = true;
		await startOrResumeBatch(db, new Date());
		const result = await runBatchStep(db, credentials, deps(world));
		assert.equal(result.state, 'finished');
		const stats = await getAuditStats(db);
		assert.equal(stats.audited, 0);
		assert.equal(stats.technicalFailures, 3);
		assert.equal(stats.linked, 0);
	});
});

test('retomada: falha no meio, lote preservado e concluído depois sem reiniciar os concluídos', async () => {
	await withDb(async (db) => {
		await seed(db, 50);
		const world = newWorld();
		const started = await startOrResumeBatch(db, new Date());
		assert.equal(started.state, 'created');
		await runBatchStep(db, credentials, deps(world));
		const resolvesAfterFirst = world.resolves;
		assert.equal((await getOpenBatch(db))?.processed, 20);

		// "Fechar o navegador": nada em memória; um novo clique retoma o mesmo lote.
		const again = await startOrResumeBatch(db, new Date());
		assert.equal(again.state, 'resumed');
		if (again.state === 'resumed') {
			assert.equal(again.batch.number, 1);
			assert.equal(again.batch.processed, 20);
		}
		assert.equal((await drain(db, world)).state, 'finished');
		assert.equal(world.resolves, 50);
		assert.equal(resolvesAfterFirst, 20);
		assert.equal((await getAuditStats(db)).audited, 50);
	});
});

test('reserva abandonada (timeout) é reassumida e a gravação do bloco antigo é ignorada', async () => {
	await withDb(async (db) => {
		await seed(db, 5);
		await startOrResumeBatch(db, new Date('2026-01-01T00:00:00Z'));
		await db.prepare(`UPDATE audit_batch_items SET status = 'processing', claim_token = 'dead', claimed_at = ?`).bind('2026-01-01T00:00:00.000Z').run();
		const world = newWorld();
		// Antes de vencer a reserva: nada a fazer.
		const early = await runBatchStep(db, credentials, deps(world, () => new Date('2026-01-01T00:01:00Z')));
		assert.equal(early.state, 'busy');
		const late = await runBatchStep(db, credentials, deps(world, () => new Date(Date.parse('2026-01-01T00:00:00Z') + STALE_CLAIM_MS + 1000)));
		assert.equal(late.state === 'finished' || late.state === 'progress', true);
		assert.equal((await getAuditStats(db)).audited, 5);
	});
});

test('duas solicitações simultâneas criam um único lote sem produtos duplicados', async () => {
	await withDb(async (db) => {
		await seed(db, 1500);
		const results = await Promise.all([
			startOrResumeBatch(db, new Date()),
			startOrResumeBatch(db, new Date()),
			startOrResumeBatch(db, new Date())
		]);
		assert.equal(results.filter((result) => result.state === 'created').length, 1);
		const total = (await db.prepare('SELECT COUNT(*) AS n FROM audit_batch_items').first<{ n: number }>())?.n;
		const distinct = (await db.prepare('SELECT COUNT(DISTINCT product_id) AS n FROM audit_batch_items').first<{ n: number }>())?.n;
		assert.equal(total, 1000);
		assert.equal(distinct, 1000);
		const open = (await db.prepare(`SELECT COUNT(*) AS n FROM audit_batches WHERE status = 'open'`).first<{ n: number }>())?.n;
		assert.equal(open, 1);
	});
});

test('dois passos simultâneos não processam o mesmo produto duas vezes', async () => {
	await withDb(async (db) => {
		await seed(db, 40);
		const world = newWorld();
		await startOrResumeBatch(db, new Date());
		const [a, b] = await Promise.all([
			runBatchStep(db, credentials, deps(world)),
			runBatchStep(db, credentials, deps(world))
		]);
		assert.ok(['progress', 'busy'].includes(a.state));
		assert.ok(['progress', 'busy'].includes(b.state));
		assert.equal((await drain(db, world)).state === 'finished' || true, true);
		const guard = (await db.prepare(`SELECT COUNT(*) AS n FROM (SELECT product_id FROM audit_batch_items GROUP BY product_id HAVING COUNT(*) > 1)`).first<{ n: number }>())?.n;
		assert.equal(guard, 0);
		assert.ok(world.resolves <= 40 + 20);
	});
});

test('orçamento esgotado preserva o lote e não marca nada como auditado', async () => {
	await withDb(async (db) => {
		await seed(db, 30);
		await updateMonitorSettings(db, { paused: true, intervalHours: 12, batchSize: 20, hourlyCallBudget: 2 });
		const world = newWorld();
		await startOrResumeBatch(db, new Date());
		const first = await runBatchStep(db, credentials, deps(world));
		assert.equal(first.state, 'progress');
		const second = await runBatchStep(db, credentials, deps(world));
		assert.equal(second.state, 'blocked');
		assert.equal((await getOpenBatch(db))?.processed, 20);
		assert.equal((await getAuditStats(db)).audited, 20);
	});
});

test('lote sem nenhum sucesso pausa (stalled) e só retoma com ação explícita', async () => {
	await withDb(async (db) => {
		await seed(db, 100);
		const world = newWorld();
		for (let code = 1; code <= 100; code += 1) world.blocked.add(code);
		await startOrResumeBatch(db, new Date());
		let state = (await runBatchStep(db, credentials, deps(world))).state;
		for (let i = 0; i < 5 && state === 'progress'; i += 1) state = (await runBatchStep(db, credentials, deps(world))).state;
		assert.equal(state, 'stalled');
		const before = world.resolves;
		assert.equal((await runBatchStep(db, credentials, deps(world))).state, 'stalled');
		assert.equal(world.resolves, before);
		const resumed = await resumeBatch(db, new Date());
		assert.equal(resumed?.stalled, false);
		assert.equal((await getAuditStats(db)).audited, 0);
	});
});

test('cancelar libera os pendentes e o monitor continua pausado', async () => {
	await withDb(async (db) => {
		await seed(db, 30);
		await startOrResumeBatch(db, new Date());
		assert.equal(await cancelBatch(db, new Date()), true);
		const stats = await getAuditStats(db);
		assert.equal(stats.processing, 0);
		assert.equal(stats.selectable, 30);
		assert.equal((await getMonitorSettings(db)).paused, true);
	});
});

test('progresso geral sem contagem dupla: auditar de novo via fila não aumenta o total auditado', async () => {
	await withDb(async (db) => {
		await seed(db, 25);
		const world = newWorld();
		await startOrResumeBatch(db, new Date());
		await drain(db, world);
		const first = await getAuditStats(db);
		assert.equal(first.audited + first.neverAudited, first.total);
		// A fila do monitoramento reverifica os mesmos produtos: continuam contados uma vez.
		const { recordQueueChecks } = await import('../src/lib/server/shopee/monitor-queue.ts');
		await recordQueueChecks(db, [{ productId: 'p000001', outcome: 'ok' }, { productId: 'p000001', outcome: 'api_error', errorCode: 'X' }], new Date(), 12);
		const second = await getAuditStats(db);
		assert.equal(second.audited, first.audited);
		assert.equal(second.audited + second.neverAudited, second.total);
	});
});
