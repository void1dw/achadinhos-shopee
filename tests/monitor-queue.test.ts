import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { createTestPlatformProxy } from './helpers/d1.ts';
import { insertProduct, linkProductToShopee } from '../src/lib/server/product-store.ts';
import {
	MONITOR_CRON_MINUTES,
	backoffMs,
	getCoverageStats,
	getSchedulerHeartbeat,
	listFailingProducts,
	recordQueueChecks,
	recordSchedulerHeartbeat,
	requeueFailedProducts,
	selectQueueBatch
} from '../src/lib/server/shopee/monitor-queue.ts';
import { patchWorkerSource } from '../scripts/add-scheduled-handler.mjs';

const HOUR = 3_600_000;

async function withDb(run: (db: D1Database) => Promise<void>) {
	const platform = await createTestPlatformProxy();
	try {
		await run(platform.env.CANDIDATES_DB);
	} finally {
		await platform.dispose();
	}
}

async function add(db: D1Database, id: string, url = `https://s.shopee.com.br/${id}`) {
	await insertProduct(db, {
		id,
		name: `Produto ${id}`,
		price: 10,
		category: 'Casa',
		image: 'https://example.com/a.jpg',
		url
	});
}

test('rodízio: nunca verificados primeiro, sem repetir, e volta ao início no ciclo seguinte', async () => {
	await withDb(async (db) => {
		for (const id of ['a', 'b', 'c', 'd', 'e']) await add(db, id);
		const t0 = new Date('2030-01-01T00:00:00Z');
		const seen: string[] = [];
		for (let tick = 0; tick < 3; tick += 1) {
			const batch = await selectQueueBatch(db, t0, 2);
			assert.ok(batch.length > 0);
			seen.push(...batch.map((t) => t.product.id));
			await recordQueueChecks(
				db,
				batch.map((t) => ({ productId: t.product.id, outcome: 'ok' as const })),
				t0,
				12
			);
		}
		assert.equal(new Set(seen).size, 5);
		assert.equal(seen.length, 5);
		assert.deepEqual(await selectQueueBatch(db, t0, 2), []);

		const stats = await getCoverageStats(db, t0);
		assert.equal(stats.monitored, 5);
		assert.equal(stats.neverChecked, 0);
		assert.equal(stats.coveragePercent, 100);

		const later = new Date(t0.getTime() + 13 * HOUR);
		assert.equal((await selectQueueBatch(db, later, 10)).length, 5);
	});
});

test('falhas usam backoff, saem da fila até vencer e podem ser reenfileiradas', async () => {
	await withDb(async (db) => {
		await add(db, 'f1');
		await add(db, 'f2');
		const now = new Date('2030-01-01T00:00:00Z');
		await recordQueueChecks(db, [{ productId: 'f1', outcome: 'unresolved', errorCode: 'http_403' }], now, 12);
		await recordQueueChecks(db, [{ productId: 'f1', outcome: 'unresolved', errorCode: 'http_403' }], now, 12);
		const failing = await listFailingProducts(db);
		assert.equal(failing[0]?.consecutive_failures, 2);
		assert.equal(failing[0]?.last_error_code, 'http_403');
		const ids = (await selectQueueBatch(db, now, 10)).map((t) => t.product.id);
		assert.deepEqual(ids, ['f2']);
		assert.ok(backoffMs(2) > backoffMs(1));
		assert.ok(backoffMs(99) <= 48 * HOUR);
		assert.equal(await requeueFailedProducts(db, now), 1);
		assert.equal((await selectQueueBatch(db, now, 10)).length, 2);
		await recordQueueChecks(db, [{ productId: 'f1', outcome: 'ok' }], now, 12);
		assert.equal((await listFailingProducts(db)).length, 0);
	});
});

test('produtos sem nenhum caminho de identificação ficam fora da fila e da cobertura', async () => {
	await withDb(async (db) => {
		await add(db, 'x1', 'https://example.com/sem-id');
		await add(db, 'x2');
		await add(db, 'x3', 'https://example.com/outro');
		await linkProductToShopee(db, 'x3', '123456', '654321');
		const now = new Date();
		const ids = (await selectQueueBatch(db, now, 10)).map((t) => t.product.id).sort();
		assert.deepEqual(ids, ['x2', 'x3']);
		const stats = await getCoverageStats(db, now);
		assert.equal(stats.total, 3);
		assert.equal(stats.identified, 1);
		assert.equal(stats.noIdentifier, 1);
		assert.equal(stats.eligible, 2);
		assert.equal(stats.pendingIdentification, 1);
	});
});

test('sinal de vida do agendador é gravado e sobrescrito', async () => {
	await withDb(async (db) => {
		assert.equal(await getSchedulerHeartbeat(db), null);
		await recordSchedulerHeartbeat(db, 'paused', null, new Date('2030-01-01T00:00:00Z'));
		await recordSchedulerHeartbeat(db, 'finished', null, new Date('2030-01-01T00:15:00Z'));
		const beat = await getSchedulerHeartbeat(db);
		assert.equal(beat?.lastResult, 'finished');
		assert.equal(beat?.lastTickAt, '2030-01-01T00:15:00.000Z');
	});
});

test('intervalo do cron no wrangler corresponde a MONITOR_CRON_MINUTES', () => {
	const config = readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8');
	assert.ok(config.includes(`*/${MONITOR_CRON_MINUTES} * * * *`));
});

test('patch do Worker anexa scheduled sem perder fetch e é idempotente', () => {
	const source = "import x from 'y';\nexport default {\n\tasync fetch() {}\n};\n";
	const patched = patchWorkerSource(source);
	assert.match(patched, /const __app = \{/);
	assert.match(patched, /scheduled\(_controller, env, ctx\)/);
	assert.match(patched, /fetch: __app\.fetch/);
	assert.equal(patchWorkerSource(patched), patched);
	assert.throws(() => patchWorkerSource('export const a = 1;'));
});
