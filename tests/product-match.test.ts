import assert from 'node:assert/strict';
import test from 'node:test';
import type { Product } from '../src/lib/types.ts';
import { buildMonitorEvents } from '../src/lib/server/shopee/catalog-audit.ts';
import {
	computeMonitorAlerts,
	DEFAULT_MONITOR_SETTINGS,
	validateMonitorSettings,
	MonitorSettingsError,
	type MonitorRunRow,
	type StoredAudit
} from '../src/lib/server/shopee/monitor-store.ts';
import {
	classifyIdentifiedProduct,
	classifyNameSearch,
	extractShopeeIdsFromUrl,
	nameSimilarity,
	searchKeywordFor
} from '../src/lib/server/shopee/product-match.ts';

const product = (overrides: Partial<Product> = {}): Product =>
	({
		id: 'p1',
		name: 'Fone Bluetooth Sem Fio Pro',
		category: 'Eletrônicos',
		price: 50,
		image: '',
		url: 'https://s.shopee.com.br/abc',
		...overrides
	}) as Product;

const ids = { itemId: '100', shopId: '200' };
const node = (extra: Record<string, unknown> = {}) =>
	({
		itemId: '100',
		shopId: '200',
		productName: 'Fone Bluetooth Sem Fio Pro',
		priceMin: '50.00',
		priceMax: '50.00',
		...extra
	}) as never;

test('extrai IDs apenas de URLs completas, nunca de links curtos', () => {
	assert.deepEqual(extractShopeeIdsFromUrl('https://shopee.com.br/product/200/100'), {
		shopId: '200',
		itemId: '100'
	});
	assert.deepEqual(extractShopeeIdsFromUrl('https://shopee.com.br/opaanlp/200/100?utm_source=affiliate'), {
                shopId: '200',
                itemId: '100'
        });
        assert.deepEqual(extractShopeeIdsFromUrl('https://shopee.com.br/Fone-i.200.100'), {
		shopId: '200',
		itemId: '100'
	});
	assert.equal(extractShopeeIdsFromUrl('https://s.shopee.com.br/abc'), null);
	assert.equal(extractShopeeIdsFromUrl('https://example.com/product/200/100'), null);
	assert.equal(extractShopeeIdsFromUrl('nao-e-url'), null);
});

test('similaridade de nomes é apenas evidência', () => {
	assert.equal(nameSimilarity('Fone Bluetooth', 'fone bluetooth'), 1);
	assert.equal(nameSimilarity('Fone Bluetooth', 'Cadeira Gamer'), 0);
});

test('produto identificado: valido, preço alterado, indisponível e divergente', () => {
	assert.equal(classifyIdentifiedProduct(product(), ids, 'linked', [node()]).status, 'valid');

	const changed = classifyIdentifiedProduct(product(), ids, 'linked', [
		node({ priceMin: '45.00', priceMax: '45.00' })
	]);
	assert.equal(changed.status, 'price_changed');
	assert.equal(changed.apiPriceMin, 45);

	assert.equal(classifyIdentifiedProduct(product(), ids, 'linked', []).status, 'unavailable');
	assert.equal(
		classifyIdentifiedProduct(product(), ids, 'linked', [node({ itemId: '101' })]).status,
		'unavailable'
	);
	assert.equal(
		classifyIdentifiedProduct(product(), ids, 'url_id', [
			node({ productName: 'Cadeira Gamer Preta' })
		]).status,
		'needs_review'
	);
	assert.equal(
		classifyIdentifiedProduct(product(), ids, 'linked', [node({ priceMin: null, priceMax: null })])
			.status,
		'needs_review'
	);
});

test('busca por nome nunca confirma, mesmo com nome idêntico', () => {
	const result = classifyNameSearch(product(), [node()]);
	assert.equal(result.status, 'uncertain');
	assert.equal(result.matchLevel, 'name_search');
	assert.equal(result.itemId, null);
	assert.equal(result.shopId, null);
	assert.equal(result.detail.candidates?.[0]?.itemId, '100');

	const none = classifyNameSearch(product(), [node({ productName: 'Cadeira Gamer Preta' })]);
	assert.equal(none.status, 'needs_review');
	assert.equal(none.matchLevel, 'none');
});

test('palavra-chave respeita o limite de 100 caracteres', () => {
	assert.ok(searchKeywordFor('palavra '.repeat(40)).length <= 100);
});

const stored = (overrides: Partial<StoredAudit> = {}) =>
	({ status: 'valid', api_price_min: 50, api_price_max: 50, ...overrides }) as StoredAudit;

test('eventos: só para identidade confirmada e só quando algo muda', () => {
	const changed = classifyIdentifiedProduct(product(), ids, 'linked', [
		node({ priceMin: '45.00', priceMax: '45.00' })
	]);
	assert.equal(buildMonitorEvents(1, changed, stored())[0]?.eventType, 'price_changed');
	assert.equal(
		buildMonitorEvents(1, changed, stored({ api_price_min: 45, api_price_max: 45 })).length,
		0
	);
	// sem auditoria anterior, compara com a planilha
	assert.equal(buildMonitorEvents(1, changed, undefined)[0]?.previousPrice, 50);

	const gone = classifyIdentifiedProduct(product(), ids, 'linked', []);
	assert.equal(buildMonitorEvents(1, gone, stored())[0]?.eventType, 'unavailable');
	assert.equal(buildMonitorEvents(1, gone, stored({ status: 'unavailable' })).length, 0);

	const back = classifyIdentifiedProduct(product(), ids, 'linked', [node()]);
	assert.equal(
		buildMonitorEvents(1, back, stored({ status: 'unavailable' }))[0]?.eventType,
		'available_again'
	);

	assert.equal(buildMonitorEvents(1, classifyNameSearch(product(), [node()]), undefined).length, 0);
});

const run = (overrides: Partial<MonitorRunRow> = {}) =>
	({
		status: 'completed',
		finished_at: '2026-01-01T00:00:00.000Z',
		error_code: null,
		...overrides
	}) as MonitorRunRow;
const now = new Date('2026-01-01T01:00:00.000Z');
const usage = (callsLastHour: number, rateLimitedLast24h = 0) => ({
	callsLastHour,
	rateLimitedLast24h,
	lastRateLimitAt: null
});

test('alertas de orçamento, rate limit, falha e pausa', () => {
	const settings = { ...DEFAULT_MONITOR_SETTINGS, paused: false, hourlyCallBudget: 100 };
	const codes = (u: ReturnType<typeof usage>, last: MonitorRunRow | null, s = settings) =>
		computeMonitorAlerts({ settings: s, usage: u, lastRun: last, now }).map((a) => a.code);

	assert.deepEqual(codes(usage(10), run()), []);
	assert.deepEqual(codes(usage(80), run()), ['BUDGET_NEAR_LIMIT']);
	assert.deepEqual(codes(usage(100), run()), ['BUDGET_EXHAUSTED']);
	assert.ok(codes(usage(0, 1), run()).includes('RATE_LIMIT_RECENT'));
	assert.ok(codes(usage(0), run({ status: 'failed' })).includes('LAST_RUN_PROBLEM'));
	assert.ok(codes(usage(0), null).includes('ROUTINE_STALE'));
	assert.ok(codes(usage(0), run(), { ...settings, paused: true }).includes('ROUTINE_PAUSED'));
});

test('validação das configurações do monitor', () => {
	assert.deepEqual(validateMonitorSettings({ paused: false, intervalHours: 12 }), {
		paused: false,
		intervalHours: 12
	});
	for (const bad of [
		{ intervalHours: 0 },
		{ batchSize: 51 },
		{ hourlyCallBudget: 1.5 },
		{ paused: 'x' as never }
	]) {
		assert.throws(() => validateMonitorSettings(bad), MonitorSettingsError);
	}
});
