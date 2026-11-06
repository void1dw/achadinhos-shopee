import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createTestPlatformProxy } from './helpers/d1.ts';
import { runCatalogAudit } from '../src/lib/server/shopee/catalog-audit.ts';
import { getAudits, updateMonitorSettings } from '../src/lib/server/shopee/monitor-store.ts';
import {
	getProductShopeeLink,
	insertProduct,
	linkProductToShopee
} from '../src/lib/server/product-store.ts';

const credentials = { SHOPEE_APP_ID: 'test-app-id', SHOPEE_APP_SECRET: 'test-app-secret' };
const redirect = (location: string) => new Response(null, { status: 302, headers: { location } });

type Platform = Awaited<ReturnType<typeof createTestPlatformProxy>>;

async function withDb(run: (db: D1Database) => Promise<void>) {
	const platform: Platform = await createTestPlatformProxy();
	try {
		const db = platform.env.CANDIDATES_DB;
		await updateMonitorSettings(db, {
			paused: false,
			intervalHours: 12,
			batchSize: 50,
			hourlyCallBudget: 2000
		});
		await run(db);
	} finally {
		await platform.dispose();
	}
}

const addProduct = (db: D1Database, id: string, url: string) =>
	insertProduct(db, {
		id,
		name: `Garrafa Termica ${id}`,
		price: 50,
		category: 'Casa',
		image: 'https://example.com/a.jpg',
		url
	});

/** API simulada: devolve nós conforme `known` (chave itemId:shopId); `override` troca os IDs devolvidos. */
function apiFetcher(
	known: Set<string>,
	override: Record<string, { itemId: string; shopId: string }> = {}
) {
	const state = { calls: 0 };
	const fetcher = (async (_url: unknown, init?: RequestInit) => {
		state.calls += 1;
		const body = JSON.parse(String(init?.body)) as { query: string };
		const data: Record<string, unknown> = {};
		for (const match of body.query.matchAll(
			/(p\d+): productOfferV2\([^)]*?itemId: (\d+), shopId: (\d+)/g
		)) {
			const key = `${match[2]}:${match[3]}`;
			const ids = override[key] ?? { itemId: match[2]!, shopId: match[3]! };
			data[match[1]!] = {
				nodes: known.has(key)
					? [
							{
								...ids,
								productName: 'Garrafa Termica',
								priceMin: '50.00',
								priceMax: '50.00'
							}
						]
					: [],
				pageInfo: { page: 1, limit: 1, hasNextPage: false }
			};
		}
		return Response.json({ data });
	}) as typeof fetch;
	return { fetcher, state };
}

const options = { trigger: 'manual', limit: 50, discoveryLimit: 0, force: true } as const;
const sleep = async () => {};

test('link curto confirmado pela API grava o vínculo e preserva products.url', async () => {
	await withDb(async (db) => {
		const url = 'https://s.shopee.com.br/ok1';
		await addProduct(db, 'sl-ok', url);
		const resolved: string[] = [];
		const resolveFetcher = (async (input: unknown) => {
			resolved.push(String(input));
			return redirect('https://shopee.com.br/opaanlp/5555/777001');
		}) as typeof fetch;
		const api = apiFetcher(new Set(['777001:5555']));

		const outcome = await runCatalogAudit(db, credentials, options, {
			fetcher: api.fetcher,
			resolveFetcher,
			sleep
		});
		assert.equal(outcome.state, 'finished');
		if (outcome.state !== 'finished') return;
		assert.deepEqual(outcome.shortLinks, {
			attempted: 1,
			resolved: 1,
			linked: 1,
			failed: 0,
			stageFailures: { resolve: 0, api: 0, link: 0 },
			failures: {},
			details: {}
		});
		assert.deepEqual(resolved, [url]);
		assert.equal(api.state.calls, 1);
		assert.deepEqual(await getProductShopeeLink(db, 'sl-ok'), {
			itemId: '777001',
			shopId: '5555'
		});
		const row = await db.prepare('SELECT url FROM products WHERE id = ?').bind('sl-ok').first<{
			url: string;
		}>();
		assert.equal(row?.url, url);
		assert.equal((await getAudits(db, ['sl-ok'])).get('sl-ok')?.status, 'valid');

		// Já vinculado: a segunda execução não resolve de novo.
		const again = await runCatalogAudit(db, credentials, options, {
			fetcher: api.fetcher,
			resolveFetcher,
			sleep
		});
		assert.equal(again.state, 'finished');
		assert.equal(resolved.length, 1);
		if (again.state === 'finished') assert.equal(again.shortLinks.attempted, 0);
	});
});

test('divergência entre IDs resolvidos e IDs da API não grava vínculo', async () => {
	await withDb(async (db) => {
		await addProduct(db, 'sl-diverge', 'https://s.shopee.com.br/div');
		const resolveFetcher = (async () =>
			redirect('https://shopee.com.br/opaanlp/5555/777002')) as typeof fetch;
		const api = apiFetcher(new Set(['777002:5555']), {
			'777002:5555': { itemId: '777002', shopId: '9999' }
		});
		const outcome = await runCatalogAudit(db, credentials, options, {
			fetcher: api.fetcher,
			resolveFetcher,
			sleep
		});
		assert.equal(outcome.state, 'finished');
		if (outcome.state !== 'finished') return;
		assert.equal(outcome.shortLinks.linked, 0);
		assert.equal(outcome.shortLinks.failures.not_confirmed, 1);
		assert.equal(await getProductShopeeLink(db, 'sl-diverge'), null);
	});
});

test('anúncio não retornado pela API não grava vínculo', async () => {
	await withDb(async (db) => {
		await addProduct(db, 'sl-missing', 'https://s.shopee.com.br/miss');
		const resolveFetcher = (async () =>
			redirect('https://shopee.com.br/opaanlp/5555/777003')) as typeof fetch;
		const api = apiFetcher(new Set());
		const outcome = await runCatalogAudit(db, credentials, options, {
			fetcher: api.fetcher,
			resolveFetcher,
			sleep
		});
		assert.equal(outcome.state, 'finished');
		if (outcome.state !== 'finished') return;
		assert.equal(outcome.shortLinks.resolved, 1);
		assert.equal(outcome.shortLinks.linked, 0);
		assert.equal(outcome.shortLinks.failed, 1);
		assert.equal(outcome.shortLinks.failures.not_confirmed, 1);
		assert.deepEqual(outcome.shortLinks.stageFailures, { resolve: 0, api: 1, link: 0 });
		assert.equal(await getProductShopeeLink(db, 'sl-missing'), null);
	});
});

test('link curto que falha na resolução não cai na descoberta por nome', async () => {
	await withDb(async (db) => {
		await addProduct(db, 'sl-nodisc', 'https://s.shopee.com.br/nd');
		const resolveFetcher = (async () => new Response(null, { status: 404 })) as typeof fetch;
		let searches = 0;
		const api = apiFetcher(new Set());
		const fetcher = (async (url: unknown, init?: RequestInit) => {
			if (String(init?.body).includes('keyword')) searches += 1;
			return api.fetcher(url as string, init);
		}) as typeof fetch;
		const outcome = await runCatalogAudit(
			db,
			credentials,
			{ ...options, discoveryLimit: 5 },
			{ fetcher, resolveFetcher, sleep }
		);
		assert.equal(outcome.state, 'finished');
		if (outcome.state !== 'finished') return;
		assert.equal(outcome.shortLinks.failed, 1);
		assert.deepEqual(outcome.shortLinks.stageFailures, { resolve: 1, api: 0, link: 0 });
		assert.deepEqual(outcome.shortLinks.failures, { http_404: 1 });
		assert.equal(searches, 0);
		assert.equal(api.state.calls, 0);
		assert.equal(outcome.totals.discovery_searches, 0);
		// Falha técnica não vira auditoria "incerta" artificial; fica só no estado da fila, com backoff.
		assert.equal((await getAudits(db, ['sl-nodisc'])).has('sl-nodisc'), false);
		const state = await db
			.prepare(
				'SELECT last_outcome, last_error_code, consecutive_failures, next_check_at FROM product_monitor_state WHERE product_id = ?'
			)
			.bind('sl-nodisc')
			.first<{ last_outcome: string; consecutive_failures: number }>();
		assert.equal(state?.last_outcome, 'unresolved');
		assert.equal(state?.consecutive_failures, 1);
	});
});

test('consulta em lote que falha conta cada link resolvido uma única vez', async () => {
	await withDb(async (db) => {
		await addProduct(db, 'sl-b1', 'https://s.shopee.com.br/b1');
		await addProduct(db, 'sl-b2', 'https://s.shopee.com.br/b2');
		const resolveFetcher = (async (input: unknown) =>
			redirect(
				`https://shopee.com.br/opaanlp/5555/${String(input).endsWith('/b1') ? 777011 : 777012}`
			)) as typeof fetch;
		const fetcher = (async () => new Response('unavailable', { status: 503 })) as typeof fetch;
		const outcome = await runCatalogAudit(db, credentials, options, {
			fetcher,
			resolveFetcher,
			sleep
		});
		assert.equal(outcome.state, 'finished');
		if (outcome.state !== 'finished') return;
		assert.equal(outcome.shortLinks.resolved, 2);
		assert.equal(outcome.shortLinks.failed, 2);
		assert.equal(outcome.shortLinks.failures.api_failed, 2);
		assert.deepEqual(outcome.shortLinks.stageFailures, { resolve: 0, api: 2, link: 0 });
		assert.equal(outcome.shortLinks.linked, 0);
		assert.equal(await getProductShopeeLink(db, 'sl-b1'), null);
		assert.equal(await getProductShopeeLink(db, 'sl-b2'), null);
	});
});

test('timeout, link inválido e redirect externo contam falhas sem chamar a API', async () => {
	await withDb(async (db) => {
		await addProduct(db, 'sl-timeout', 'https://s.shopee.com.br/t1');
		await addProduct(db, 'sl-external', 'https://s.shopee.com.br/t2');
		await addProduct(db, 'sl-http', 'http://s.shopee.com.br/t3');
		const resolveFetcher = (async (input: unknown) => {
			if (String(input).endsWith('/t1')) throw new DOMException('aborted', 'AbortError');
			return redirect('https://evil.example/opaanlp/1/2');
		}) as typeof fetch;
		const api = apiFetcher(new Set());
		const outcome = await runCatalogAudit(db, credentials, options, {
			fetcher: api.fetcher,
			resolveFetcher,
			sleep
		});
		assert.equal(outcome.state, 'finished');
		if (outcome.state !== 'finished') return;
		assert.equal(outcome.shortLinks.attempted, 2);
		assert.equal(outcome.shortLinks.resolved, 0);
		assert.equal(outcome.shortLinks.failures.timeout, 1);
		assert.equal(outcome.shortLinks.failures.invalid_redirect, 1);
		assert.deepEqual(outcome.shortLinks.stageFailures, { resolve: 2, api: 0, link: 0 });
		assert.equal(outcome.shortLinks.failed, 2);
		assert.equal(api.state.calls, 0);
		assert.equal(await getProductShopeeLink(db, 'sl-timeout'), null);
	});
});

test('respeita o limite de resoluções por execução', async () => {
	await withDb(async (db) => {
		for (let index = 0; index < 4; index += 1) {
			await addProduct(db, `sl-lim-${index}`, `https://s.shopee.com.br/lim${index}`);
		}
		let resolves = 0;
		const resolveFetcher = (async () => {
			resolves += 1;
			return new Response(null, { status: 404 });
		}) as typeof fetch;
		const outcome = await runCatalogAudit(
			db,
			credentials,
			{ ...options, limit: 2 },
			{ fetcher: apiFetcher(new Set()).fetcher, resolveFetcher, sleep }
		);
		assert.equal(resolves, 2);
		assert.equal(outcome.state === 'finished' && outcome.shortLinks.attempted, 2);
	});
});

test('par já usado por outro produto é rejeitado e o outro vínculo permanece', async () => {
	await withDb(async (db) => {
		await addProduct(db, 'sl-owner', 'https://example.com/owner');
		await linkProductToShopee(db, 'sl-owner', '777004', '5555');
		await addProduct(db, 'sl-dup', 'https://s.shopee.com.br/dup');
		const resolveFetcher = (async () =>
			redirect('https://shopee.com.br/opaanlp/5555/777004')) as typeof fetch;
		const outcome = await runCatalogAudit(db, credentials, options, {
			fetcher: apiFetcher(new Set(['777004:5555'])).fetcher,
			resolveFetcher,
			sleep
		});
		assert.equal(outcome.state, 'finished');
		if (outcome.state !== 'finished') return;
		assert.equal(outcome.shortLinks.linked, 0);
		assert.equal(outcome.shortLinks.failures.link_rejected, 1);
		assert.equal(await getProductShopeeLink(db, 'sl-dup'), null);
		assert.deepEqual(await getProductShopeeLink(db, 'sl-owner'), {
			itemId: '777004',
			shopId: '5555'
		});
	});
});

test('falha de banco ao vincular não derruba a auditoria nem expõe detalhes', async () => {
	await withDb(async (db) => {
		await addProduct(db, 'sl-dbfail', 'https://s.shopee.com.br/dbf');
		await db
			.prepare(
				"CREATE TRIGGER block_link BEFORE UPDATE OF item_id ON products BEGIN SELECT RAISE(ABORT, 'segredo-interno'); END"
			)
			.run();
		const resolveFetcher = (async () =>
			redirect('https://shopee.com.br/opaanlp/5555/777005')) as typeof fetch;
		const outcome = await runCatalogAudit(db, credentials, options, {
			fetcher: apiFetcher(new Set(['777005:5555'])).fetcher,
			resolveFetcher,
			sleep
		});
		assert.equal(outcome.state, 'finished');
		if (outcome.state !== 'finished') return;
		assert.equal(outcome.shortLinks.failures.link_rejected, 1);
		assert.equal(JSON.stringify(outcome).includes('segredo-interno'), false);
		assert.equal(await getProductShopeeLink(db, 'sl-dbfail'), null);
		assert.equal((await getAudits(db, ['sl-dbfail'])).has('sl-dbfail'), true);
	});
});

test('vínculo diferente existente nunca é substituído', async () => {
	await withDb(async (db) => {
		await addProduct(db, 'sl-linked', 'https://s.shopee.com.br/lk');
		await linkProductToShopee(db, 'sl-linked', '111', '222');
		let resolves = 0;
		const resolveFetcher = (async () => {
			resolves += 1;
			return redirect('https://shopee.com.br/opaanlp/5555/777006');
		}) as typeof fetch;
		await runCatalogAudit(db, credentials, options, {
			fetcher: apiFetcher(new Set(['111:222'])).fetcher,
			resolveFetcher,
			sleep
		});
		assert.equal(resolves, 0);
		assert.deepEqual(await getProductShopeeLink(db, 'sl-linked'), { itemId: '111', shopId: '222' });
	});
});
