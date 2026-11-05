import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createAdminSession } from '../src/lib/server/admin-auth.ts';
import { handleShopeeItemLookup } from '../src/lib/server/shopee/item-lookup.ts';

const env = {
	ADMIN_USERNAME: 'lia-admin',
	ADMIN_PASSWORD: 'local-password-with-more-than-thirty-two-characters',
	ADMIN_SESSION_SECRET: 'local-session-secret-with-more-than-thirty-two-characters',
	SHOPEE_APP_ID: 'test-app-id',
	SHOPEE_APP_SECRET: 'test-app-secret'
};

const requested = { itemId: '12345678901234567890', shopId: '98765432109876543210' };

async function session(): Promise<string> {
	return createAdminSession(env.ADMIN_SESSION_SECRET);
}

function requestUrl(params: Record<string, string> = requested): URL {
	const url = new URL('https://example.test/admin/shopee/item-lookup');
	for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
	return url;
}

function offersResponse(nodes: unknown[]) {
	return Response.json({
		data: {
			offers: {
				nodes,
				pageInfo: { page: 1, limit: 1, hasNextPage: false }
			}
		}
	});
}

function product(itemId: string, shopId: string, productName = 'Produto de teste') {
	return { itemId, shopId, productName };
}

test('exige a sessão administrativa e não consulta Shopee sem autenticação', async () => {
	let fetchCalls = 0;
	const response = await handleShopeeItemLookup(requestUrl(), undefined, env, async () => {
		fetchCalls += 1;
		return offersResponse([]);
	});

	assert.equal(response.status, 401);
	assert.equal(fetchCalls, 0);
	assert.equal(response.headers.get('cache-control'), 'private, no-store');
	assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
	assert.equal((await response.json()).code, 'ADMIN_AUTH_REQUIRED');
});

test('valida ambos os IDs como parâmetros numéricos presentes', async () => {
	const token = await session();
	for (const params of [
		{ itemId: requested.itemId },
		{ shopId: requested.shopId },
		{ itemId: '12x', shopId: requested.shopId },
		{ itemId: requested.itemId, shopId: ' ' },
		{ itemId: '0', shopId: requested.shopId },
		{ itemId: requested.itemId, shopId: '000' }
	]) {
		const response = await handleShopeeItemLookup(requestUrl(params), token, env);
		assert.equal(response.status, 400);
		assert.equal((await response.json()).code, 'SHOPEE_ITEM_LOOKUP_INVALID_PARAMETERS');
	}
});

test('retorna nome somente quando os dois IDs retornados correspondem exatamente', async () => {
	const token = await session();
	let query = '';
	const response = await handleShopeeItemLookup(requestUrl(), token, env, async (_input, init) => {
		query = JSON.parse(String(init?.body)).query;
		return offersResponse([product(requested.itemId, requested.shopId, 'Produto encontrado')]);
	});

	assert.equal(response.status, 200);
	assert.match(
		query,
		/productOfferV2\(page: 1, limit: 1, listType: 0, itemId: 12345678901234567890, shopId: 98765432109876543210\)/
	);
	assert.deepEqual(await response.json(), {
		status: 'completed',
		matchFound: true,
		itemId: requested.itemId,
		shopId: requested.shopId,
		returnedItemId: requested.itemId,
		returnedShopId: requested.shopId,
		productName: 'Produto encontrado'
	});
});

test('não considera correspondência quando um dos IDs retornados diverge', async () => {
	const response = await handleShopeeItemLookup(requestUrl(), await session(), env, async () =>
		offersResponse([product(requested.itemId, '11111111111111111111', 'Não expor')])
	);

	assert.equal(response.status, 200);
	assert.deepEqual(await response.json(), {
		status: 'completed',
		matchFound: false,
		itemId: requested.itemId,
		shopId: requested.shopId,
		returnedItemId: requested.itemId,
		returnedShopId: '11111111111111111111'
	});
});

test('retorna ausência de produto sem inventar identificadores retornados', async () => {
	const response = await handleShopeeItemLookup(requestUrl(), await session(), env, async () =>
		offersResponse([])
	);

	assert.equal(response.status, 200);
	assert.deepEqual(await response.json(), {
		status: 'completed',
		matchFound: false,
		itemId: requested.itemId,
		shopId: requested.shopId
	});
});

test('converte rate limit em 429 e não expõe o corpo bruto da Shopee', async () => {
	const response = await handleShopeeItemLookup(requestUrl(), await session(), env, async () =>
		Response.json({
			errors: [{ message: 'private upstream response', extensions: { code: 10030 } }]
		})
	);
	const body = await response.json();

	assert.equal(response.status, 429);
	assert.equal(body.code, 'SHOPEE_RATE_LIMIT');
	assert.doesNotMatch(JSON.stringify(body), /private upstream response|test-secret/);
});
