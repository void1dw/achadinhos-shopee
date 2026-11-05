import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createTestPlatformProxy } from './helpers/d1.ts';
import {
	runCatalogAudit,
	runScheduledCatalogMonitor
} from '../src/lib/server/shopee/catalog-audit.ts';
import {
	getAuditCounts,
	getAudits,
	getMonitorSettings,
	listMonitorEvents,
	listMonitorRuns,
	startMonitorRun,
	updateMonitorSettings
} from '../src/lib/server/shopee/monitor-store.ts';
import { insertProduct, linkProductToShopee } from '../src/lib/server/product-store.ts';

const credentials = { SHOPEE_APP_ID: 'test-app-id', SHOPEE_APP_SECRET: 'test-app-secret' };

test('D1 catalog audit and monitor', async (context) => {
	const platform = await createTestPlatformProxy();
	const db = platform.env.CANDIDATES_DB;
	const productIds: string[] = [];
	const savedSettings = {
		ready: false,
		value: null as Awaited<ReturnType<typeof getMonitorSettings>> | null
	};
	try {
		savedSettings.value = await getMonitorSettings(db);
		savedSettings.ready = true;

		const random = new Uint32Array(2);
		crypto.getRandomValues(random);
		const suffix = `${random[0]}${random[1]}`;
		// IDs altos e únicos por execução, sem colidir com dados reais.
		const itemA = `9${random[0]}01`;
		const itemB = `9${random[0]}02`;
		const shop = `9${random[1]}`;

		const add = async (label: string, price: number, name: string) => {
			const id = `audit-${label}-${suffix}`;
			productIds.push(id);
			await insertProduct(db, {
				id,
				name,
				price,
				category: 'Casa',
				image: 'https://example.com/a.jpg',
				url: `https://s.shopee.com.br/${label}${suffix}`
			});
			return id;
		};
		const idValid = await add('valid', 50, 'Garrafa Termica Inox 500ml');
		const idChanged = await add('changed', 100, 'Luminaria de Mesa LED Recarregavel');
		await linkProductToShopee(db, idValid, itemA, shop);
		await linkProductToShopee(db, idChanged, itemB, shop);

		const offers: Record<string, string> = {
			[itemA]: '50.00',
			[itemB]: '80.00'
		};
		const names: Record<string, string> = {
			[itemA]: 'Garrafa Termica Inox 500ml',
			[itemB]: 'Luminaria de Mesa LED Recarregavel'
		};
		let calls = 0;
		const fetcher = (async (_url: unknown, init?: RequestInit) => {
			calls += 1;
			const body = JSON.parse(String(init?.body)) as { query: string };
			const data: Record<string, unknown> = {};
			for (const match of body.query.matchAll(/(p\d+): productOfferV2\([^)]*?itemId: (\d+)/g)) {
				const item = match[2]!;
				data[match[1]!] = {
					nodes:
						item in offers
							? [
									{
										itemId: item,
										shopId: shop,
										productName: names[item],
										priceMin: offers[item],
										priceMax: offers[item]
									}
								]
							: [],
					pageInfo: { page: 1, limit: 1, hasNextPage: false }
				};
			}
			return Response.json({ data });
		}) as typeof fetch;
		const sleep = async () => {};

		await updateMonitorSettings(db, {
			paused: false,
			intervalHours: 12,
			batchSize: 50,
			hourlyCallBudget: 2000
		});

		await context.test('audita produtos vinculados e registra eventos', async () => {
			const outcome = await runCatalogAudit(
				db,
				credentials,
				{ trigger: 'manual', linkedLimit: 50, discoveryLimit: 0, shortLinkLimit: 0, force: true },
				{ fetcher, sleep }
			);
			assert.equal(outcome.state, 'finished');
			if (outcome.state !== 'finished') return;
			assert.equal(outcome.status, 'completed');
			assert.ok(calls >= 1);

			const audits = await getAudits(db, [idValid, idChanged]);
			assert.equal(audits.get(idValid)?.status, 'valid');
			assert.equal(audits.get(idValid)?.match_level, 'linked');
			assert.equal(audits.get(idChanged)?.status, 'price_changed');
			assert.equal(audits.get(idChanged)?.api_price_min, 80);

			const events = (await listMonitorEvents(db, 200)).filter(
				(event) => event.product_id === idChanged
			);
			assert.equal(events.length, 1);
			assert.equal(events[0]?.event_type, 'price_changed');
			assert.equal((await getAuditCounts(db)).audited >= 2, true);
		});

		await context.test('segunda execução sem mudança não duplica eventos', async () => {
			await runCatalogAudit(
				db,
				credentials,
				{ trigger: 'manual', linkedLimit: 50, discoveryLimit: 0, shortLinkLimit: 0, force: true },
				{ fetcher, sleep }
			);
			const events = (await listMonitorEvents(db, 200)).filter(
				(event) => event.product_id === idChanged
			);
			assert.equal(events.length, 1);
		});

		await context.test('produto que some da API vira indisponível e depois volta', async () => {
			delete offers[itemA];
			await runCatalogAudit(
				db,
				credentials,
				{ trigger: 'manual', linkedLimit: 50, discoveryLimit: 0, shortLinkLimit: 0, force: true },
				{ fetcher, sleep }
			);
			assert.equal((await getAudits(db, [idValid])).get(idValid)?.status, 'unavailable');
			offers[itemA] = '50.00';
			await runCatalogAudit(
				db,
				credentials,
				{ trigger: 'manual', linkedLimit: 50, discoveryLimit: 0, shortLinkLimit: 0, force: true },
				{ fetcher, sleep }
			);
			const types = (await listMonitorEvents(db, 200))
				.filter((event) => event.product_id === idValid)
				.map((event) => event.event_type)
				.sort();
			assert.deepEqual(types, ['available_again', 'unavailable']);
		});

		await context.test('nunca altera o catálogo de produtos', async () => {
			const row = await db
				.prepare('SELECT price, name, url FROM products WHERE id = ?')
				.bind(idChanged)
				.first<{ price: string; name: string; url: string }>();
			assert.equal(Number(row?.price), 100);
		});

		await context.test('rate limit interrompe sem retentativa e registra uso', async () => {
			let attempts = 0;
			const limited = (async () => {
				attempts += 1;
				return Response.json({ errors: [{ message: 'rate', extensions: { code: 10030 } }] });
			}) as typeof fetch;
			const outcome = await runCatalogAudit(
				db,
				credentials,
				{ trigger: 'manual', linkedLimit: 50, discoveryLimit: 0, shortLinkLimit: 0, force: true },
				{ fetcher: limited, sleep }
			);
			assert.equal(outcome.state, 'finished');
			if (outcome.state !== 'finished') return;
			assert.equal(outcome.errorCode, 'SHOPEE_RATE_LIMIT');
			assert.equal(outcome.status, 'failed');
			assert.ok(attempts >= 1);
			const usage = await db
				.prepare(
					"SELECT COUNT(*) AS n FROM shopee_api_calls WHERE outcome = 'rate_limited' AND source = 'catalog-audit'"
				)
				.first<{ n: number }>();
			assert.ok((usage?.n ?? 0) >= 1);
		});

		await context.test('erro temporário é repetido e orçamento esgotado bloqueia', async () => {
			let attempts = 0;
			const flaky = (async (url: unknown, init?: RequestInit) => {
				attempts += 1;
				if (attempts === 1) return new Response('boom', { status: 503 });
				return fetcher(url as never, init);
			}) as typeof fetch;
			const outcome = await runCatalogAudit(
				db,
				credentials,
				{ trigger: 'manual', linkedLimit: 50, discoveryLimit: 0, shortLinkLimit: 0, force: true },
				{ fetcher: flaky, sleep }
			);
			assert.equal(outcome.state, 'finished');
			if (outcome.state === 'finished') assert.ok(outcome.totals.retries >= 1);

			await updateMonitorSettings(db, { hourlyCallBudget: 1 });
			let blockedCalls = 0;
			const blocked = await runCatalogAudit(
				db,
				credentials,
				{ trigger: 'manual', linkedLimit: 50, discoveryLimit: 0, shortLinkLimit: 0, force: true },
				{
					fetcher: (async () => {
						blockedCalls += 1;
						return Response.json({});
					}) as typeof fetch,
					sleep
				}
			);
			assert.equal(blocked.state, 'blocked');
			assert.equal(blockedCalls, 0);
			await updateMonitorSettings(db, { hourlyCallBudget: 2000 });
		});

		await context.test(
			'execução simultânea é recusada e a rotina pausada não executa',
			async () => {
				const first = await startMonitorRun(db, 'manual', new Date());
				assert.notEqual(first, null);
				assert.equal(await startMonitorRun(db, 'manual', new Date()), null);
				const busy = await runCatalogAudit(
					db,
					credentials,
					{ trigger: 'manual', linkedLimit: 1, discoveryLimit: 0, shortLinkLimit: 0 },
					{ fetcher, sleep }
				);
				assert.equal(busy.state, 'busy');
				await db
					.prepare("UPDATE monitor_runs SET status = 'failed', finished_at = ? WHERE id = ?")
					.bind(new Date().toISOString(), first)
					.run();

				await updateMonitorSettings(db, { paused: true });
				const skipped = await runScheduledCatalogMonitor(db, credentials, { fetcher, sleep });
				assert.deepEqual(skipped, { state: 'skipped', reason: 'paused' });
				await updateMonitorSettings(db, { paused: false });
				const recent = await runScheduledCatalogMonitor(db, credentials, { fetcher, sleep });
				assert.deepEqual(recent, { state: 'skipped', reason: 'interval' });
				assert.ok((await listMonitorRuns(db, 5)).length > 0);
			}
		);
	} finally {
		try {
			if (productIds.length > 0) {
				const marks = productIds.map(() => '?').join(', ');
				await db
					.prepare(`DELETE FROM product_monitor_events WHERE product_id IN (${marks})`)
					.bind(...productIds)
					.run();
				await db
					.prepare(`DELETE FROM product_audits WHERE product_id IN (${marks})`)
					.bind(...productIds)
					.run();
				await db
					.prepare(`DELETE FROM products WHERE id IN (${marks})`)
					.bind(...productIds)
					.run();
			}
			await db.prepare("DELETE FROM shopee_api_calls WHERE source = 'catalog-audit'").run();
			await db
				.prepare(
					"DELETE FROM monitor_runs WHERE trigger IN ('manual','scheduled') AND started_at >= ?"
				)
				.bind(new Date(Date.now() - 10 * 60 * 1000).toISOString())
				.run();
			if (savedSettings.ready && savedSettings.value) {
				const { paused, intervalHours, batchSize, hourlyCallBudget } = savedSettings.value;
				await updateMonitorSettings(db, { paused, intervalHours, batchSize, hourlyCallBudget });
			}
		} finally {
			await platform.dispose();
		}
	}
});

test('3 falhas consecutivas (HTTP 503) interrompem os grupos e a descoberta', async () => {
	const platform = await createTestPlatformProxy();
	const db = platform.env.CANDIDATES_DB;
	try {
		await updateMonitorSettings(db, {
			paused: false,
			intervalHours: 12,
			batchSize: 50,
			hourlyCallBudget: 2000
		});
		const shop = '987654321';
		const add = async (id: string, url: string) =>
			insertProduct(db, {
				id,
				name: `Produto ${id}`,
				price: 50,
				category: 'Casa',
				image: 'https://example.com/a.jpg',
				url
			});
		// 21 produtos vinculados = 3 grupos (10 + 10 + 1).
		for (let index = 0; index < 21; index += 1) {
			const id = `fail-linked-${index}`;
			await add(id, `https://s.shopee.com.br/fail${index}`);
			await linkProductToShopee(db, id, String(900000 + index), shop);
		}
		// Elegível para descoberta: sem vínculo e sem IDs na URL.
		await add('fail-discovery', 'https://s.shopee.com.br/fail-discovery');

		let calls = 0;
		const fetcher = (async () => {
			calls += 1;
			return new Response('unavailable', { status: 503 });
		}) as typeof fetch;
		const sleeps: number[] = [];
		const sleep = async (ms: number) => {
			sleeps.push(ms);
		};

		const outcome = await runCatalogAudit(
			db,
			credentials,
			{ trigger: 'manual', linkedLimit: 21, discoveryLimit: 5, shortLinkLimit: 0, force: true },
			{ fetcher, sleep }
		);
		assert.equal(outcome.state, 'finished');
		if (outcome.state !== 'finished') return;

		// Cada grupo: 1 tentativa + 2 retentativas; nenhuma chamada de descoberta.
		assert.equal(calls, 9);
		assert.deepEqual(sleeps, [500, 1500, 500, 1500, 500, 1500]);
		assert.equal(outcome.totals.retries, 6);
		assert.equal(outcome.totals.failures, 21);
		assert.equal(outcome.totals.discovery_searches, 0);
		assert.match(outcome.errorCode ?? '', /^SHOPEE_HTTP_5\d\d$/);
		assert.equal((await getAudits(db, ['fail-discovery'])).has('fail-discovery'), false);
	} finally {
		await platform.dispose();
	}
});
