import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createAdminSession } from '../src/lib/server/admin-auth.ts';
import { handleShopeeCommissionProbe } from '../src/lib/server/shopee/commission-probe.ts';

const env = {
	ADMIN_USERNAME: 'lia-admin',
	ADMIN_PASSWORD: 'local-password-with-more-than-thirty-two-characters',
	ADMIN_SESSION_SECRET: 'local-session-secret-with-more-than-thirty-two-characters',
	SHOPEE_APP_ID: 'test-app-id',
	SHOPEE_APP_SECRET: 'test-app-secret'
};

function offersResponse(nodes: unknown[]) {
	return Response.json({ data: { p0: { nodes } } });
}

async function probe(fetcher: typeof fetch, query = '') {
	const token = await createAdminSession(env.ADMIN_SESSION_SECRET);
	const url = new URL(`https://example.test/admin/shopee/commission-probe${query}`);
	return handleShopeeCommissionProbe(token, env, fetcher, url);
}

const commissionNode = (itemId: string, shopId: string, extra: Record<string, unknown> = {}) => ({
	itemId,
	shopId,
	commissionRate: '0.08',
	sellerCommissionRate: '0.05',
	shopeeCommissionRate: '0.03',
	commission: '1.50',
	...extra
});

test('consulta vários produtos em uma única chamada com aliases distintos', async () => {
	const queries: string[] = [];
	const response = await probe(async (_input, init) => {
		queries.push((JSON.parse(String(init?.body)) as { query: string }).query);
		return Response.json({
			data: {
				p0: { nodes: [commissionNode('1', '2')] },
				p1: { nodes: [] },
				p2: { nodes: [commissionNode('5', '6', { commission: null })] }
			}
		});
	}, '?items=1:2,3:4,5:6');
	const body = await response.json();

	assert.equal(response.status, 200);
	assert.equal(queries.length, 1);
	for (const [alias, ids] of [
		['p0', 'itemId: 1, shopId: 2'],
		['p1', 'itemId: 3, shopId: 4'],
		['p2', 'itemId: 5, shopId: 6']
	]) {
		assert.match(queries[0]!, new RegExp(`${alias}: productOfferV2\\(${ids}, page: 1, limit: 1`));
	}
	assert.equal(body.productCount, 3);
	assert.equal(body.products[0].fields.commission, 'present');
	assert.equal(body.products[1].nodeCount, 0);
	assert.equal(body.products[1].rawNode, null);
	assert.equal(body.products[1].fields.commissionRate, 'missing');
	assert.equal(body.products[2].fields.commission, 'null');
	assert.equal(body.products[2].itemId, '5');
	assert.equal(body.itemId, undefined);
});

test('rejeita lista vazia, mais de 10 itens e IDs inválidos sem chamar a Shopee', async () => {
	let calls = 0;
	const fetcher: typeof fetch = async () => {
		calls += 1;
		return offersResponse([]);
	};
	const eleven = Array.from({ length: 11 }, (_, index) => `${index + 1}:9`).join(',');
	for (const query of [
		'?items=',
		`?items=${eleven}`,
		'?items=abc:2',
		'?items=1:',
		'?items=1:2,3',
		'?items=0:2',
		'?items=1:2,,3:4'
	]) {
		const response = await probe(fetcher, query);
		assert.equal(response.status, 400, query);
		assert.equal((await response.json()).code, 'SHOPEE_COMMISSION_PROBE_INVALID_PARAMETERS');
	}
	assert.equal(calls, 0);

	const ten = Array.from({ length: 10 }, (_, index) => `${index + 1}:9`).join(',');
	const ok = await probe(async () => {
		calls += 1;
		return Response.json({
			data: Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`p${i}`, { nodes: [] }]))
		});
	}, `?items=${ten}`);
	assert.equal(ok.status, 200);
	assert.equal(calls, 1);
});

test('erro GraphQL em consulta múltipla retorna erro legível', async () => {
	const response = await probe(
		async () =>
			Response.json({
				errors: [{ message: 'Cannot query field', extensions: { code: 10010 } }]
			}),
		'?items=1:2,3:4'
	);
	assert.equal(response.status, 502);
	assert.equal((await response.json()).code, 'SHOPEE_QUERY_PARSE_ERROR');
});

test('exige autenticação administrativa e não chama a Shopee sem sessão', async () => {
	let calls = 0;
	const response = await handleShopeeCommissionProbe(undefined, env, async () => {
		calls += 1;
		return offersResponse([]);
	});
	assert.equal(response.status, 401);
	assert.equal(calls, 0);
	assert.equal(response.headers.get('cache-control'), 'private, no-store');
});

test('retorna os quatro campos e faz uma única chamada para o produto informado', async () => {
	const queries: string[] = [];
	const response = await probe(async (_input, init) => {
		queries.push((JSON.parse(String(init?.body)) as { query: string }).query);
		return offersResponse([
			{
				itemId: '46459381683',
				shopId: '1398191099',
				commissionRate: '0.08',
				sellerCommissionRate: '0.05',
				shopeeCommissionRate: '0.03',
				commission: '1.50'
			}
		]);
	});
	const body = await response.json();

	assert.equal(response.status, 200);
	assert.equal(queries.length, 1);
	assert.match(queries[0]!, /itemId: 46459381683, shopId: 1398191099, page: 1, limit: 1/);
	for (const field of [
		'commissionRate',
		'sellerCommissionRate',
		'shopeeCommissionRate',
		'commission'
	]) {
		assert.match(queries[0]!, new RegExp(field));
		assert.equal(body.fields[field], 'present');
	}
	assert.equal(body.rawNode.commission, '1.50');
	assert.equal(body.nodeCount, 1);
	assert.doesNotMatch(JSON.stringify(body), /test-app-secret|Signature/i);
});

test('distingue campos ausentes de campos nulos e de produto não retornado', async () => {
	const partial = await (
		await probe(async () =>
			offersResponse([
				{ itemId: '46459381683', shopId: '1398191099', commissionRate: '0.08', commission: null }
			])
		)
	).json();
	assert.deepEqual(partial.fields, {
		commissionRate: 'present',
		sellerCommissionRate: 'missing',
		shopeeCommissionRate: 'missing',
		commission: 'null'
	});

	const empty = await (await probe(async () => offersResponse([]))).json();
	assert.equal(empty.nodeCount, 0);
	assert.equal(empty.rawNode, null);
	assert.equal(empty.fields.commissionRate, 'missing');
});

test('retorna erro GraphQL legível quando um campo não existe no schema', async () => {
	const response = await probe(async () =>
		Response.json({
			errors: [
				{ message: 'Cannot query field "sellerCommissionRate"', extensions: { code: 10010 } }
			]
		})
	);
	const body = await response.json();

	assert.equal(response.status, 502);
	assert.equal(body.status, 'error');
	assert.equal(body.code, 'SHOPEE_QUERY_PARSE_ERROR');
	assert.deepEqual(body.upstreamCodes, [10010]);
	assert.match(body.error, /GraphQL/);
});

test('trata rate limit como 429', async () => {
	const response = await probe(async () =>
		Response.json({ errors: [{ message: 'rate', extensions: { code: 10030 } }] })
	);
	assert.equal(response.status, 429);
	assert.equal((await response.json()).code, 'SHOPEE_RATE_LIMIT');
});
