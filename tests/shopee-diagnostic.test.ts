import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runShopeeDiagnostic } from '../src/lib/server/shopee/client.ts';

const credentials = { SHOPEE_APP_ID: '12345', SHOPEE_APP_SECRET: 'test-secret' };
const nodes = [
	{
		itemId: '9007199254740993',
		shopId: '9007199254740994',
		productName: 'Produto de teste',
		price: '29.90',
		priceMin: '29.90',
		priceMax: '49.90',
		commissionRate: '0.05',
		priceDiscountRate: 30,
		productCatIds: [1001]
	}
];

function offerPage(page: number, hasNextPage: boolean) {
	return {
		nodes,
		pageInfo: { page, limit: 5, hasNextPage, scrollId: 'cursor-for-test-only' }
	};
}

function parseQuery(init?: RequestInit): string {
	const payload = JSON.parse(String(init?.body)) as { query: string };
	return payload.query;
}

test('diagnóstico executa até cinco requisições e cobre filtros, paginação e item+loja', async () => {
	const queries: string[] = [];
	const result = await runShopeeDiagnostic(credentials, async (_input, init) => {
		const query = parseQuery(init);
		queries.push(query);

		if (query.includes('general:')) {
			return Response.json({ data: { general: offerPage(1, true) } });
		}
		if (query.includes('searchBluetooth:')) {
			return Response.json({ data: { searchBluetooth: offerPage(1, false) } });
		}
		if (query.includes('searchOrganizer:')) {
			return Response.json({ data: { searchOrganizer: offerPage(1, false) } });
		}
		if (query.includes('pageOne:') && query.includes('pageTwo:')) {
			return Response.json({
				data: {
					category: offerPage(1, true),
					pageOne: offerPage(1, true),
					pageTwo: offerPage(2, false)
				}
			});
		}
		if (query.includes('itemLookup:')) {
			return Response.json({ data: { itemLookup: offerPage(1, false) } });
		}
		throw new Error('Unexpected diagnostic query.');
	});

	assert.equal(result.httpCalls, 5);
	assert.equal(queries.length, 5);
	assert.match(queries[0]!, /general: productOfferV2\(page: 1, limit: 5, listType: 0\)/);
	assert.match(queries[1]!, /keyword: "fone bluetooth"/);
	assert.match(queries[2]!, /keyword: "organizador"/);
	assert.match(queries[3]!, /category: productOfferV2\(page: 1, limit: 5, productCatId: 1001\)/);
	assert.match(queries[3]!, /pageOne: productOfferV2\(page: 1, limit: 5, listType: 0\)/);
	assert.match(queries[3]!, /pageTwo: productOfferV2\(page: 2, limit: 5, listType: 0\)/);
	assert.doesNotMatch(queries[3]!, /scrollId\s*:/);
	assert.match(queries[4]!, /page: 1, limit: 1, listType: 0, itemId: 9007199254740993/);
	assert.match(queries[4]!, /shopId: 9007199254740994/);
	assert.equal(result.pagination.status, 'success');
	assert.equal(result.pagination.pageOne?.pageInfo.page, 1);
	assert.equal(result.pagination.pageTwo?.pageInfo.page, 2);
	assert.equal(result.pagination.pageOne?.pageInfo.hasNextPage, true);
	assert.equal(result.pagination.pageTwo?.pageInfo.scrollIdPresent, true);
	assert.equal(result.category.productCatId, 1001);
	assert.equal(result.itemLookup.matchFound, true);
	assert.equal(result.general.products[0]?.price, '29.90');
	assert.equal(result.general.products[0]?.priceDiscountRate, 30);
});

test('falha de busca por palavra-chave é sanitizada e não interrompe os demais testes', async () => {
	let calls = 0;
	const result = await runShopeeDiagnostic(credentials, async (_input, init) => {
		calls += 1;
		const query = parseQuery(init);
		if (query.includes('general:')) {
			return Response.json({ data: { general: offerPage(1, true) } });
		}
		if (query.includes('searchBluetooth:')) {
			return Response.json({
				data: { searchBluetooth: null },
				errors: [
					{
						message: 'private upstream response',
						extensions: { code: 11001 }
					}
				]
			});
		}
		if (query.includes('searchOrganizer:')) {
			return Response.json({ data: { searchOrganizer: offerPage(1, false) } });
		}
		if (query.includes('pageOne:')) {
			return Response.json({
				data: {
					category: offerPage(1, true),
					pageOne: offerPage(1, true),
					pageTwo: offerPage(2, false)
				}
			});
		}
		return Response.json({ data: { itemLookup: offerPage(1, false) } });
	});

	assert.equal(calls, 5);
	assert.equal(result.keywords['fone bluetooth'].status, 'error');
	if (result.keywords['fone bluetooth'].status === 'error') {
		assert.equal(result.keywords['fone bluetooth'].error.code, 'SHOPEE_INVALID_PARAMETERS');
		assert.doesNotMatch(
			result.keywords['fone bluetooth'].error.message,
			/private upstream response/
		);
	}
	assert.equal(result.keywords.organizador.status, 'success');
	assert.equal(result.itemLookup.status, 'success');
});

test('usa paginação por page e ignora scrollId como argumento', async () => {
	const result = await runShopeeDiagnostic(credentials, async (_input, init) => {
		const query = parseQuery(init);
		if (query.includes('general:')) {
			return Response.json({ data: { general: offerPage(1, false) } });
		}
		if (query.includes('searchBluetooth:')) {
			return Response.json({ data: { searchBluetooth: { nodes: [], pageInfo: null } } });
		}
		if (query.includes('searchOrganizer:')) {
			return Response.json({ data: { searchOrganizer: { nodes: [], pageInfo: null } } });
		}
		if (query.includes('pageOne:')) {
			return Response.json({
				data: {
					category: offerPage(1, true),
					pageOne: offerPage(1, true),
					pageTwo: offerPage(2, false)
				}
			});
		}
		return Response.json({ data: { itemLookup: offerPage(1, false) } });
	});

	assert.equal(result.pagination.status, 'success');
	assert.equal(result.pagination.sameQuery, true);
	assert.equal(result.category.status, 'success');
});
