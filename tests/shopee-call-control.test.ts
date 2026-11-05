import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createTestPlatformProxy } from './helpers/d1.ts';
import {
	cleanupCallControl,
	createD1CallControl,
	createMemoryCallControl,
	type ShopeeCallControl
} from '../src/lib/server/shopee/call-control.ts';
import {
	getProductOffers,
	getProductOffersBatch,
	probeCommissionFieldsBatch,
	runShopeeDiagnostic,
	ShopeeApiError,
	shopeeErrorHttpStatus
} from '../src/lib/server/shopee/client.ts';
import { handleShopeeCommissionProbe } from '../src/lib/server/shopee/commission-probe.ts';
import { handleShopeeItemLookup } from '../src/lib/server/shopee/item-lookup.ts';
import { shopeeRevalidator } from '../src/lib/server/shopee/sheet-publish.ts';
import { createAdminSession } from '../src/lib/server/admin-auth.ts';
import { getApiControlStats, getApiUsage } from '../src/lib/server/shopee/monitor-store.ts';

const credentials = { SHOPEE_APP_ID: '12345', SHOPEE_APP_SECRET: 'test-secret' };
const query = { page: 1, limit: 1, listType: 0 };

function okFetcher(): { fetcher: typeof fetch; calls: () => number } {
	let calls = 0;
	const fetcher = (async (_url: unknown, init?: RequestInit) => {
		calls += 1;
		const body = JSON.parse(String(init?.body)) as { query: string };
		const aliases = [...body.query.matchAll(/(\w+): productOfferV2/g)].map((match) => match[1]!);
		return Response.json({
			data: Object.fromEntries(aliases.map((alias) => [alias, { nodes: [], pageInfo: {} }]))
		});
	}) as typeof fetch;
	return { fetcher, calls: () => calls };
}

test('uma chamada individual reserva e contabiliza uma chamada', async () => {
	const control = createMemoryCallControl({ budget: 5 });
	const { fetcher, calls } = okFetcher();
	await getProductOffers(credentials, query, fetcher, control);
	assert.equal(calls(), 1);
	assert.equal(control.counters.reserved, 1);
	assert.deepEqual(control.settlements, [{ outcome: 'success' }]);
});

test('um lote com 10 aliases conta como uma única chamada', async () => {
	const control = createMemoryCallControl({ budget: 5 });
	const { fetcher, calls } = okFetcher();
	const pages = await getProductOffersBatch(
		credentials,
		Array.from({ length: 10 }, (_, index) => ({
			...query,
			itemId: String(index + 1),
			shopId: '9'
		})),
		fetcher,
		control
	);
	assert.equal(pages.length, 10);
	assert.equal(calls(), 1);
	assert.equal(control.counters.reserved, 1);
});

test('retentativa usa forRetry e conta como nova chamada', async () => {
	const control = createMemoryCallControl({ budget: 5 });
	const { fetcher } = okFetcher();
	await getProductOffers(credentials, query, fetcher, control);
	await getProductOffers(credentials, query, fetcher, control.forRetry());
	assert.equal(control.counters.reserved, 2);
	assert.equal(control.counters.retries, 1);
	assert.deepEqual(control.retryFlags, [false, true]);
});

test('timeout e falha de transporte são contabilizados', async () => {
	const control = createMemoryCallControl({ budget: 5 });
	const aborting = ((_url: unknown, init?: RequestInit) =>
		new Promise((_resolve, reject) => {
			init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
		})) as typeof fetch;
	const originalSetTimeout = globalThis.setTimeout;
	globalThis.setTimeout = ((handler: () => void) => originalSetTimeout(handler, 1)) as never;
	try {
		await assert.rejects(
			getProductOffers(credentials, query, aborting, control),
			(error) => error instanceof ShopeeApiError && error.code === 'SHOPEE_TIMEOUT'
		);
	} finally {
		globalThis.setTimeout = originalSetTimeout;
	}
	await assert.rejects(
		getProductOffers(
			credentials,
			query,
			(async () => {
				throw new Error('network');
			}) as typeof fetch,
			control
		)
	);
	assert.equal(control.counters.reserved, 2);
	assert.deepEqual(
		control.settlements.map((item) => item.outcome),
		['timeout', 'transport_error']
	);
});

test('HTTP 429, HTTP 5xx e erro GraphQL de rate limit são registrados', async () => {
	const control = createMemoryCallControl({ budget: 10 });
	await assert.rejects(
		getProductOffers(
			credentials,
			query,
			(async () => new Response('x', { status: 429 })) as typeof fetch,
			control
		),
		(error) => error instanceof ShopeeApiError && error.kind === 'rate_limit'
	);
	await assert.rejects(
		getProductOffers(
			credentials,
			query,
			(async () => new Response('x', { status: 503 })) as typeof fetch,
			control
		)
	);
	await assert.rejects(
		getProductOffers(
			credentials,
			query,
			(async () =>
				Response.json({ errors: [{ message: 'r', extensions: { code: 10030 } }] })) as typeof fetch,
			control
		),
		(error) => error instanceof ShopeeApiError && error.kind === 'rate_limit'
	);
	assert.deepEqual(control.settlements, [
		{ outcome: 'rate_limited', errorCode: 'SHOPEE_RATE_LIMIT', httpStatus: 429 },
		{ outcome: 'http_error', errorCode: 'SHOPEE_HTTP_503', httpStatus: 503 },
		{ outcome: 'rate_limited', errorCode: 'SHOPEE_RATE_LIMIT' }
	]);
});

test('orçamento esgotado impede a chamada HTTP', async () => {
	const control = createMemoryCallControl({ budget: 0 });
	const { fetcher, calls } = okFetcher();
	await assert.rejects(getProductOffers(credentials, query, fetcher, control), (error) => {
		assert.ok(error instanceof ShopeeApiError);
		assert.equal(error.kind, 'budget');
		assert.equal(error.code, 'SHOPEE_BUDGET_EXHAUSTED');
		assert.equal(shopeeErrorHttpStatus(error), 429);
		return true;
	});
	assert.equal(calls(), 0);
});

test('falha no controle bloqueia a chamada sem autorização', async () => {
	const failing: ShopeeCallControl = {
		counters: { reserved: 0, retries: 0 },
		forRetry: () => failing,
		reserve: async () => ({ ok: false, reason: 'control_unavailable' }),
		settle: async () => {}
	};
	const { fetcher, calls } = okFetcher();
	await assert.rejects(getProductOffers(credentials, query, fetcher, failing), (error) => {
		assert.ok(error instanceof ShopeeApiError);
		assert.equal(error.code, 'SHOPEE_CALL_CONTROL_UNAVAILABLE');
		assert.equal(shopeeErrorHttpStatus(error), 503);
		return true;
	});
	assert.equal(calls(), 0);
});

test('fetch real sem controle é recusado; fetcher injetado sem controle segue funcionando', async () => {
	const originalFetch = globalThis.fetch;
	let realCalls = 0;
	globalThis.fetch = (async () => {
		realCalls += 1;
		return Response.json({});
	}) as typeof fetch;
	try {
		await assert.rejects(
			getProductOffers(credentials, query),
			(error) => error instanceof ShopeeApiError && error.code === 'SHOPEE_CALL_CONTROL_REQUIRED'
		);
		assert.equal(realCalls, 0);
	} finally {
		globalThis.fetch = originalFetch;
	}
	const { fetcher, calls } = okFetcher();
	await getProductOffers(credentials, query, fetcher);
	assert.equal(calls(), 1);
});

test('diagnóstico não faz novas chamadas após rate limit', async () => {
	const control = createMemoryCallControl({ budget: 50 });
	let calls = 0;
	const limited = (async () => {
		calls += 1;
		return new Response('x', { status: 429 });
	}) as typeof fetch;
	const result = await runShopeeDiagnostic(credentials, limited, control);
	assert.equal(calls, 1);
	assert.equal(result.httpCalls, 1);
	assert.equal(control.counters.reserved, 1);
});

test('diagnóstico sem orçamento não faz chamadas HTTP', async () => {
	const control = createMemoryCallControl({ budget: 0 });
	const { fetcher, calls } = okFetcher();
	const result = await runShopeeDiagnostic(credentials, fetcher, control);
	assert.equal(calls(), 0);
	assert.equal(result.httpCalls, 0);
});

test('probe de comissão, revalidador e consulta de item passam pelo controle', async () => {
	const control = createMemoryCallControl({ budget: 10 });
	const { fetcher, calls } = okFetcher();
	await probeCommissionFieldsBatch(credentials, [{ itemId: '1', shopId: '2' }], fetcher, control);
	await shopeeRevalidator(credentials, fetcher, control)([{ itemId: '1', shopId: '2' }]);
	assert.equal(calls(), 2);
	assert.equal(control.counters.reserved, 2);

	const secret = 'local-session-secret-with-more-than-thirty-two-characters';
	const env = {
		...credentials,
		ADMIN_USERNAME: 'lia-admin',
		ADMIN_PASSWORD: 'local-password-with-more-than-thirty-two-characters',
		ADMIN_SESSION_SECRET: secret
	};
	const token = await createAdminSession(secret);
	const lookup = await handleShopeeItemLookup(
		new URL('https://x.test/admin/shopee/item-lookup?itemId=1&shopId=2'),
		token,
		env,
		fetcher,
		control
	);
	assert.equal(lookup.status, 200);
	const probe = await handleShopeeCommissionProbe(
		token,
		env,
		fetcher,
		new URL('https://x.test/admin/shopee/commission-probe?items=1:2'),
		control
	);
	assert.equal(probe.status, 200);
	assert.equal(control.counters.reserved, 4);

	const exhausted = createMemoryCallControl({ budget: 0 });
	const blocked = await handleShopeeItemLookup(
		new URL('https://x.test/admin/shopee/item-lookup?itemId=1&shopId=2'),
		token,
		env,
		fetcher,
		exhausted
	);
	assert.equal(blocked.status, 429);
	assert.equal(calls(), 4);
});

test('controle D1: reservas atômicas, concorrência, contabilização e estatísticas', async () => {
	const platform = await createTestPlatformProxy();
	const db = platform.env.CANDIDATES_DB;
	const source = `ctl-test-${crypto.randomUUID()}`;
	const savedBudget = { value: null as number | null };
	try {
		const row = await db
			.prepare('SELECT hourly_call_budget AS b FROM monitor_settings WHERE id = 1')
			.first<{ b: number }>();
		savedBudget.value = row?.b ?? null;

		// Usa um relógio no futuro distante para isolar a janela de outras chamadas reais do teste.
		const base = Date.now() + 10 * 365 * 24 * 3600 * 1000;
		const control = createD1CallControl(db, source, { now: () => new Date(base) });
		const usedNow = async () => (await getApiUsage(db, new Date(base))).callsLastHour;

		const used = await usedNow();
		await db
			.prepare('UPDATE monitor_settings SET hourly_call_budget = ? WHERE id = 1')
			.bind(Math.max(used + 3, 1))
			.run();

		const results = await Promise.all(Array.from({ length: 8 }, () => control.reserve()));
		const granted = results.filter((result) => result.ok);
		assert.equal(granted.length, 3);
		assert.equal(await usedNow(), used + 3);
		assert.equal(control.counters.reserved, 3);

		const denied = await control.reserve();
		assert.deepEqual(denied, { ok: false, reason: 'budget_exhausted' });

		const first = granted[0];
		assert.ok(first?.ok);
		await control.settle(first.id, { outcome: 'rate_limited', httpStatus: 429 });
		const retry = control.forRetry();
		assert.deepEqual(await retry.reserve(), { ok: false, reason: 'budget_exhausted' });
		// Reserva consumida não é devolvida mesmo após timeout.
		const second = granted[1];
		assert.ok(second?.ok);
		await control.settle(second.id, { outcome: 'timeout' });
		assert.equal(await usedNow(), used + 3);

		const usage = await getApiUsage(db, new Date(base));
		assert.ok(usage.rateLimitedLast24h >= 1);
		const stats = await getApiControlStats(db, new Date(base));
		const mine = stats.bySource.find((item) => item.source === source);
		assert.equal(mine?.calls, 3);
		assert.ok(stats.reserveDeniedLast24h >= 2);

		// Orçamento ampliado: a retentativa passa a ser registrada como retry.
		await db
			.prepare('UPDATE monitor_settings SET hourly_call_budget = ? WHERE id = 1')
			.bind(used + 10)
			.run();
		assert.equal((await retry.reserve()).ok, true);
		assert.equal(control.counters.retries, 1);

		// Falha do D1 impede a reserva.
		const broken = createD1CallControl(
			{
				prepare: () => {
					throw new Error('d1 down');
				}
			} as unknown as D1Database,
			source
		);
		assert.deepEqual(await broken.reserve(), { ok: false, reason: 'control_unavailable' });
	} finally {
		try {
			await db.prepare('DELETE FROM shopee_api_calls WHERE source = ?').bind(source).run();
			await db.prepare('DELETE FROM shopee_api_control_events WHERE source = ?').bind(source).run();
			if (savedBudget.value !== null) {
				await db
					.prepare('UPDATE monitor_settings SET hourly_call_budget = ? WHERE id = 1')
					.bind(savedBudget.value)
					.run();
			}
		} finally {
			await platform.dispose();
		}
	}
});

function fakeResponse(json: () => Promise<unknown>): Response {
	return { ok: true, status: 200, json } as unknown as Response;
}

test('HTTP 200 com JSON inv�lido liquida como invalid_response', async () => {
	const control = createMemoryCallControl({ budget: 5 });
	await assert.rejects(
		getProductOffers(
			credentials,
			query,
			(async () =>
				fakeResponse(async () => {
					throw new SyntaxError('Unexpected token');
				})) as typeof fetch,
			control
		),
		(error) => error instanceof ShopeeApiError && error.code === 'SHOPEE_INVALID_RESPONSE'
	);
	assert.deepEqual(control.settlements, [
		{ outcome: 'invalid_response', errorCode: 'SHOPEE_INVALID_RESPONSE' }
	]);
});

test('resposta inv�lida no processamento GraphQL liquida como invalid_response', async () => {
	const control = createMemoryCallControl({ budget: 5 });
	await assert.rejects(
		getProductOffers(
			credentials,
			query,
			(async () => Response.json({ errors: 'formato inesperado' })) as typeof fetch,
			control
		),
		(error) => error instanceof ShopeeApiError && error.code === 'SHOPEE_INVALID_RESPONSE'
	);
	assert.equal(control.settlements.length, 1);
	assert.equal(control.settlements[0]?.outcome, 'invalid_response');
});

test('exce��o inesperada no parse liquida a reserva sem vazar detalhes', async () => {
	const control = createMemoryCallControl({ budget: 5 });
	const body = {};
	Object.defineProperty(body, 'errors', {
		enumerable: true,
		get() {
			throw new Error('detalhe interno sens�vel');
		}
	});
	await assert.rejects(
		getProductOffers(
			credentials,
			query,
			(async () => fakeResponse(async () => body)) as typeof fetch,
			control
		),
		(error) =>
			error instanceof ShopeeApiError &&
			error.code === 'SHOPEE_INVALID_RESPONSE' &&
			!error.message.includes('sens�vel')
	);
	assert.deepEqual(
		control.settlements.map((item) => item.outcome),
		['invalid_response']
	);
});

function fakeD1(options: { lastRowId: unknown; updateChanges: number }) {
	const events: string[] = [];
	const db = {
		prepare(sql: string) {
			return {
				bind: (...args: unknown[]) => ({
					async run() {
						if (sql.startsWith('INSERT INTO shopee_api_control_events')) {
							events.push(String(args[0]) + ':' + String(args[3]));
							return { meta: { changes: 1 } };
						}
						if (sql.startsWith('INSERT INTO shopee_api_calls')) {
							return { meta: { changes: 1, last_row_id: options.lastRowId } };
						}
						if (sql.startsWith('UPDATE shopee_api_calls')) {
							return { meta: { changes: options.updateChanges } };
						}
						return { meta: { changes: 0 } };
					}
				})
			};
		},
		async batch() {
			return [];
		}
	} as unknown as D1Database;
	return { db, events };
}

test('reserva com last_row_id inv�lido bloqueia a chamada e registra a falha', async () => {
	for (const lastRowId of [0, -1, 1.5, Number.NaN, null, undefined, Number.MAX_SAFE_INTEGER + 2]) {
		const { db, events } = fakeD1({ lastRowId, updateChanges: 1 });
		const control = createD1CallControl(db, 'test');
		const { fetcher, calls } = okFetcher();
		await assert.rejects(
			getProductOffers(credentials, query, fetcher, control),
			(error) => error instanceof ShopeeApiError && error.code === 'SHOPEE_CALL_CONTROL_UNAVAILABLE'
		);
		assert.equal(calls(), 0);
		assert.equal(control.counters.reserved, 0);
		assert.deepEqual(events, ['reserve_failed:invalid_reservation_id']);
	}
});

test('liquida��o sem linha pendente registra settle_failed e n�o autoriza novas chamadas', async () => {
	const { db, events } = fakeD1({ lastRowId: 7, updateChanges: 0 });
	const control = createD1CallControl(db, 'test');
	const { fetcher, calls } = okFetcher();
	await getProductOffers(credentials, query, fetcher, control);
	assert.equal(calls(), 1);
	assert.deepEqual(events, ['settle_failed:no_pending_row:success']);
	assert.equal(control.counters.reserved, 1);
});

const YEAR_MS = 365 * 24 * 3600 * 1000;
const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 3600 * 1000;

function cleanupFakeD1(options: { batchFails?: boolean; insertFails?: boolean } = {}) {
	const state = { batches: 0, events: [] as string[] };
	const db = {
		prepare(sql: string) {
			const statement = {
				bind: (...args: unknown[]) => ({
					async run() {
						if (sql.startsWith('INSERT INTO shopee_api_control_events')) {
							state.events.push(String(args[0]));
							return { meta: { changes: 1 } };
						}
						if (sql.startsWith('INSERT INTO shopee_api_calls')) {
							if (options.insertFails) throw new Error('d1 down');
							return { meta: { changes: 1, last_row_id: 9 } };
						}
						return { meta: { changes: 1 } };
					}
				})
			};
			return statement;
		},
		async batch() {
			state.batches += 1;
			if (options.batchFails) throw new Error('cleanup failed');
			return [];
		}
	} as unknown as D1Database;
	return { db, state };
}

test('cleanupCallControl abandona reservas pending antigas e preserva as recentes', async () => {
	const platform = await createTestPlatformProxy();
	const db = platform.env.CANDIDATES_DB;
	const source = `cl-${crypto.randomUUID().slice(0, 8)}`;
	try {
		// Data fixa no ano 2000: a limpeza (global) s� alcan�a registros anteriores a ela,
		// portanto nunca afeta dados reais do banco local.
		const now = new Date('2000-06-01T12:00:00.000Z');
		const at = (offsetMs: number) => new Date(now.getTime() + offsetMs).toISOString();
		const insertCall = async (label: string, offsetMs: number, outcome = 'pending') => {
			const result = await db
				.prepare(
					'INSERT INTO shopee_api_calls (source, reserved_at, is_retry, outcome) VALUES (?, ?, 0, ?)'
				)
				.bind(`${source}:${label}`, at(offsetMs), outcome)
				.run();
			return Number(result.meta.last_row_id);
		};
		const insertEvent = (label: string, offsetMs: number) =>
			db
				.prepare(
					"INSERT INTO shopee_api_control_events (kind, source, occurred_at, detail) VALUES ('reserve_denied', ?, ?, NULL)"
				)
				.bind(`${source}:${label}`, at(offsetMs))
				.run();
		const outcomeOf = async (id: number) =>
			(await db
				.prepare('SELECT outcome, settled_at FROM shopee_api_calls WHERE id = ?')
				.bind(id)
				.first<{ outcome: string; settled_at: string | null }>()) ?? null;

		const stale = await insertCall('stale', -6 * MINUTE_MS);
		const recent = await insertCall('recent', -2 * MINUTE_MS);
		const settledOld = await insertCall('settled-old', -30 * MINUTE_MS, 'success');
		const expiredCall = await insertCall('expired', -8 * DAY_MS, 'success');
		const keptCall = await insertCall('kept', -6 * DAY_MS, 'success');
		await insertEvent('expired', -8 * DAY_MS);
		await insertEvent('kept', -6 * DAY_MS);

		await cleanupCallControl(db, now);

		const staleRow = await outcomeOf(stale);
		assert.equal(staleRow?.outcome, 'abandoned');
		assert.equal(staleRow?.settled_at, now.toISOString());
		assert.equal((await outcomeOf(recent))?.outcome, 'pending');
		assert.equal((await outcomeOf(settledOld))?.outcome, 'success');
		assert.equal(await outcomeOf(expiredCall), null);
		assert.equal((await outcomeOf(keptCall))?.outcome, 'success');

		const events = await db
			.prepare('SELECT source FROM shopee_api_control_events WHERE source LIKE ?')
			.bind(`${source}:%`)
			.all<{ source: string }>();
		assert.deepEqual(
			events.results.map((row) => row.source),
			[`${source}:kept`]
		);
	} finally {
		try {
			await db
				.prepare('DELETE FROM shopee_api_calls WHERE source LIKE ?')
				.bind(`${source}:%`)
				.run();
			await db
				.prepare('DELETE FROM shopee_api_control_events WHERE source LIKE ?')
				.bind(`${source}:%`)
				.run();
		} finally {
			await platform.dispose();
		}
	}
});

test('maybeCleanup: limpeza oportunista com intervalo de 6h (via reserve)', async () => {
	// Rel�gios injetados bem � frente dos usados nos outros testes (o estado � do m�dulo).
	const base = Date.now() + 30 * YEAR_MS;
	const { db, state } = cleanupFakeD1();
	const control = createD1CallControl(db, 'cleanup-throttle', {
		now: () => new Date(clockValue)
	});
	let clockValue = base;
	assert.equal((await control.reserve()).ok, true);
	assert.equal(state.batches, 1);
	clockValue = base + 5 * 60 * MINUTE_MS;
	assert.equal((await control.reserve()).ok, true);
	assert.equal(state.batches, 1);
	clockValue = base + 6 * 60 * MINUTE_MS + 1;
	assert.equal((await control.reserve()).ok, true);
	assert.equal(state.batches, 2);
});

test('falha na limpeza n�o bloqueia nem dispensa a reserva; sem reserva v�lida n�o h� HTTP', async () => {
	const base = Date.now() + 31 * YEAR_MS;
	const failing = cleanupFakeD1({ batchFails: true });
	let clockValue = base;
	const control = createD1CallControl(failing.db, 'cleanup-failure', {
		now: () => new Date(clockValue)
	});
	const { fetcher, calls } = okFetcher();
	await getProductOffers(credentials, query, fetcher, control);
	assert.equal(calls(), 1);
	assert.equal(control.counters.reserved, 1);
	assert.equal(failing.state.batches, 1);

	// A falha reinicia o controle de intervalo: a pr�xima reserva tenta limpar de novo.
	clockValue = base + MINUTE_MS;
	await getProductOffers(credentials, query, fetcher, control);
	assert.equal(failing.state.batches, 2);

	const broken = cleanupFakeD1({ batchFails: true, insertFails: true });
	const blockedControl = createD1CallControl(broken.db, 'cleanup-failure', {
		now: () => new Date(base + 2 * MINUTE_MS)
	});
	const before = calls();
	await assert.rejects(
		getProductOffers(credentials, query, fetcher, blockedControl),
		(error) => error instanceof ShopeeApiError && error.code === 'SHOPEE_CALL_CONTROL_UNAVAILABLE'
	);
	assert.equal(calls(), before);
	assert.equal(blockedControl.counters.reserved, 0);
	assert.deepEqual(broken.state.events, ['reserve_failed']);
});

test('maybeCleanup: o intervalo de limpeza e independente por banco D1', async () => {
	const base = Date.now() + 32 * YEAR_MS;
	const a = cleanupFakeD1();
	const b = cleanupFakeD1();
	const controlA = createD1CallControl(a.db, 'isolation-a', { now: () => new Date(base) });
	const controlB = createD1CallControl(b.db, 'isolation-b', {
		now: () => new Date(base + MINUTE_MS)
	});
	await controlA.reserve();
	await controlB.reserve();
	assert.equal(a.state.batches, 1);
	assert.equal(b.state.batches, 1);

	// Cada banco mantem seu proprio intervalo de 6h.
	await controlA.reserve();
	await controlB.reserve();
	assert.equal(a.state.batches, 1);
	assert.equal(b.state.batches, 1);

	const controlBLater = createD1CallControl(b.db, 'isolation-b', {
		now: () => new Date(base + 7 * 60 * MINUTE_MS)
	});
	await controlBLater.reserve();
	assert.equal(a.state.batches, 1);
	assert.equal(b.state.batches, 2);
});

test('maybeCleanup: instancias do mesmo banco nao repetem a limpeza dentro do intervalo', async () => {
	const base = Date.now() + 33 * YEAR_MS;
	const shared = cleanupFakeD1();
	const first = createD1CallControl(shared.db, 'same-db-1', { now: () => new Date(base) });
	const second = createD1CallControl(shared.db, 'same-db-2', {
		now: () => new Date(base + MINUTE_MS)
	});
	await first.reserve();
	await second.reserve();
	assert.equal(shared.state.batches, 1);
});

test('maybeCleanup: falha em um banco nao afeta o intervalo de outro', async () => {
	const base = Date.now() + 34 * YEAR_MS;
	const failing = cleanupFakeD1({ batchFails: true });
	const healthy = cleanupFakeD1();
	const failingControl = createD1CallControl(failing.db, 'fail-a', { now: () => new Date(base) });
	const healthyControl = createD1CallControl(healthy.db, 'fail-b', { now: () => new Date(base) });
	await failingControl.reserve();
	await healthyControl.reserve();
	await failingControl.reserve();
	await healthyControl.reserve();
	assert.equal(failing.state.batches, 2);
	assert.equal(healthy.state.batches, 1);
});
