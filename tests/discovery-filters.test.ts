import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createTestPlatformProxy } from './helpers/d1.ts';
import { listCandidates } from '../src/lib/server/shopee/candidate-store.ts';
import { collectShopeeCandidates } from '../src/lib/server/shopee/collector.ts';
import {
	DiscoveryFilterError,
	discoveryFilterSql,
	hasDiscoveryFilters,
	matchesDiscoveryFilters,
	parseDiscoveryFilters
} from '../src/lib/server/shopee/discovery-filters.ts';

const sample = {
	commissionRate: '0.12',
	sales: '500',
	ratingStar: 4.7,
	price: '60.00',
	priceMin: '49.90',
	priceDiscountRate: 35
};

test('converte o formulário: comissão em %, vírgula decimal e campos vazios', () => {
	assert.deepEqual(
		parseDiscoveryFilters({
			minCommissionPercent: '10',
			minSales: '100',
			minRating: '4,5',
			minPrice: '',
			maxPrice: ' ',
			minDiscountPercent: '30'
		}),
		{ minCommissionRate: 0.1, minSales: 100, minRating: 4.5, minDiscountPercent: 30 }
	);
	assert.deepEqual(parseDiscoveryFilters({}), {});
	assert.equal(hasDiscoveryFilters({}), false);
	assert.equal(hasDiscoveryFilters(undefined), false);
});

test('rejeita filtros inválidos', () => {
	for (const bad of [
		{ minCommissionPercent: '101' },
		{ minRating: '5.5' },
		{ minSales: 'abc' },
		{ minSales: '-1' },
		{ minPrice: '50', maxPrice: '10' },
		{ minDiscountPercent: '1e2' }
	]) {
		assert.throws(() => parseDiscoveryFilters(bad), DiscoveryFilterError);
	}
});

test('predicado: cada critério isolado', () => {
	assert.equal(matchesDiscoveryFilters(sample, undefined), true);
	assert.equal(matchesDiscoveryFilters(sample, { minCommissionRate: 0.12 }), true);
	assert.equal(matchesDiscoveryFilters(sample, { minCommissionRate: 0.13 }), false);
	assert.equal(matchesDiscoveryFilters(sample, { minSales: 501 }), false);
	assert.equal(matchesDiscoveryFilters(sample, { minRating: 4.8 }), false);
	assert.equal(matchesDiscoveryFilters(sample, { minDiscountPercent: 30 }), true);
	assert.equal(matchesDiscoveryFilters(sample, { minDiscountPercent: 40 }), false);
	assert.equal(matchesDiscoveryFilters(sample, { minPrice: 50 }), false, 'usa priceMin');
	assert.equal(matchesDiscoveryFilters(sample, { maxPrice: 49.9 }), true);
	assert.equal(matchesDiscoveryFilters(sample, { maxPrice: 49 }), false);
});

test('dados ausentes ou inválidos reprovam o critério pedido, nunca viram zero', () => {
	const missing = { commissionRate: null, sales: undefined, ratingStar: null, price: 'x' };
	assert.equal(matchesDiscoveryFilters(missing, { minCommissionRate: 0 }), false);
	assert.equal(matchesDiscoveryFilters(missing, { minSales: 0 }), false);
	assert.equal(matchesDiscoveryFilters(missing, { minRating: 0 }), false);
	assert.equal(matchesDiscoveryFilters(missing, { minDiscountPercent: 30 }), false);
	assert.equal(matchesDiscoveryFilters(missing, { maxPrice: 100 }), false);
	assert.equal(matchesDiscoveryFilters(missing, {}), true, 'sem filtros, tudo passa');
});

test('SQL gera uma cláusula por critério ativo', () => {
	const { clauses, values } = discoveryFilterSql({ minSales: 10, maxPrice: 99 });
	assert.equal(clauses.length, 2);
	assert.deepEqual(values, [10, 99]);
	assert.deepEqual(discoveryFilterSql(undefined), { clauses: [], values: [] });
});

test('D1: coleta filtra antes de salvar e a listagem aplica a mesma regra', async () => {
	const platform = await createTestPlatformProxy();
	const db = platform.env.CANDIDATES_DB;
	const random = new Uint32Array(1);
	crypto.getRandomValues(random);
	const base = `8${random[0]}`;
	const token = `zzprobe${random[0]}`;
	const node = (index: number, extra: Record<string, unknown>) => ({
		itemId: `${base}${index}`,
		shopId: `${base}9`,
		productName: `${token} produto ${index}`,
		priceMin: '40.00',
		priceMax: '40.00',
		commissionRate: '0.10',
		sales: '300',
		ratingStar: 4.5,
		priceDiscountRate: 35,
		...extra
	});
	try {
		const nodes = [
			node(1, {}),
			node(2, { priceDiscountRate: 5 }),
			node(3, { sales: '2', commissionRate: '0.01' }),
			node(4, { priceDiscountRate: 31 })
		];
		const fetcher = (async () =>
			Response.json({
				data: { offers: { nodes, pageInfo: { page: 1, limit: 20, hasNextPage: false } } }
			})) as typeof fetch;

		const summary = await collectShopeeCandidates(
			db,
			{ SHOPEE_APP_ID: 'id', SHOPEE_APP_SECRET: 'secret' },
			{
				searchType: 'general',
				pages: 1,
				pageLimit: 20,
				filters: parseDiscoveryFilters({ minDiscountPercent: '30', minSales: '100' })
			},
			fetcher
		);
		assert.equal(summary.status, 'completed');
		assert.equal(summary.productsFound, 4);
		assert.equal(summary.filteredOut, 2);
		assert.equal(summary.newCandidates, 2);

		const stored = await listCandidates(db, { search: token });
		assert.deepEqual(stored.map((c) => c.item_id).sort(), [`${base}1`, `${base}4`]);

		// Listagem: mesma regra em SQL, sobre dados já salvos.
		const strict = await listCandidates(db, {
			search: token,
			discovery: parseDiscoveryFilters({ minDiscountPercent: '33' })
		});
		assert.deepEqual(
			strict.map((c) => c.item_id),
			[`${base}1`]
		);
		const none = await listCandidates(db, {
			search: token,
			discovery: parseDiscoveryFilters({ minCommissionPercent: '50' })
		});
		assert.equal(none.length, 0);

		// Sem filtros o fluxo antigo segue idêntico: tudo é salvo.
		const unfiltered = await collectShopeeCandidates(
			db,
			{ SHOPEE_APP_ID: 'id', SHOPEE_APP_SECRET: 'secret' },
			{ searchType: 'general', pages: 1, pageLimit: 20 },
			fetcher
		);
		assert.equal(unfiltered.filteredOut, undefined);
		assert.equal((await listCandidates(db, { search: token })).length, 4);
	} finally {
		try {
			const like = `${base}%`;
			await db
				.prepare('DELETE FROM candidate_price_observations WHERE item_id LIKE ?')
				.bind(like)
				.run();
			await db.prepare('DELETE FROM candidates WHERE item_id LIKE ?').bind(like).run();
		} finally {
			await platform.dispose();
		}
	}
});
