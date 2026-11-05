import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getProductOfferTest, ShopeeApiError } from '../src/lib/server/shopee/client.ts';

const credentials = { SHOPEE_APP_ID: '12345', SHOPEE_APP_SECRET: 'test-secret' };

function graphQLError(code: number, includeExtension = true): Response {
	return Response.json({
		data: { productOfferV2: { nodes: [] } },
		errors: [
			{
				message: `error [${code}]: private upstream details`,
				...(includeExtension ? { extensions: { code } } : {})
			}
		]
	});
}

test('assina o JSON exato enviado e consulta a oferta com os parâmetros de validação', async () => {
	let sentBody = '';
	let authorization = '';
	let endpoint = '';
	let method = '';
	let contentType = '';
	const products = await getProductOfferTest(credentials, async (input, init) => {
		endpoint = String(input);
		method = String(init?.method);
		sentBody = String(init?.body);
		const headers = new Headers(init?.headers);
		authorization = headers.get('authorization') ?? '';
		contentType = headers.get('content-type') ?? '';
		return Response.json({
			data: {
				productOfferV2: {
					nodes: [
						{
							itemId: 1,
							shopId: 2,
							productName: 'Produto teste',
							productLink: 'https://example.com/product',
							offerLink: 'https://example.com/offer',
							imageUrl: 'https://example.com/image.jpg',
							priceMin: 10,
							priceMax: 20,
							priceDiscountRate: 0.1,
							sales: 3,
							ratingStar: 4.8,
							commissionRate: '0.05'
						}
					]
				}
			}
		});
	});

	const [, timestamp, signature] =
		authorization.match(/^SHA256 Credential=12345, Timestamp=(\d+), Signature=([a-f0-9]{64})$/) ??
		[];
	assert.ok(timestamp);
	const expected = await crypto.subtle.digest(
		'SHA-256',
		new TextEncoder().encode(`12345${timestamp}${sentBody}test-secret`)
	);
	assert.equal(
		signature,
		Array.from(new Uint8Array(expected), (byte) => byte.toString(16).padStart(2, '0')).join('')
	);
	assert.equal(endpoint, 'https://open-api.affiliate.shopee.com.br/graphql');
	assert.equal(method, 'POST');
	assert.equal(contentType, 'application/json');
	assert.match(sentBody, /page: 1, limit: 1, listType: 0, sortType: 1/);
	assert.equal(products[0]?.itemId, 1);
});

test('mapeia códigos GraphQL conhecidos para diagnósticos seguros', async (context) => {
	const knownErrors = [
		{
			upstreamCode: 10020,
			code: 'SHOPEE_INVALID_CREDENTIAL',
			kind: 'graphql'
		},
		{
			upstreamCode: 10035,
			code: 'SHOPEE_API_ACCESS_DENIED',
			kind: 'graphql'
		},
		{
			upstreamCode: 10010,
			code: 'SHOPEE_QUERY_PARSE_ERROR',
			kind: 'graphql'
		},
		{
			upstreamCode: 11001,
			code: 'SHOPEE_INVALID_PARAMETERS',
			kind: 'graphql'
		},
		{
			upstreamCode: 10030,
			code: 'SHOPEE_RATE_LIMIT',
			kind: 'rate_limit'
		}
	] as const;

	for (const expected of knownErrors) {
		await context.test(`código ${expected.upstreamCode}`, async () => {
			await assert.rejects(
				getProductOfferTest(credentials, async () =>
					graphQLError(expected.upstreamCode, expected.upstreamCode !== 10020)
				),
				(error: unknown) => {
					assert.ok(error instanceof ShopeeApiError);
					assert.equal(error.kind, expected.kind);
					assert.equal(error.code, expected.code);
					assert.deepEqual(error.upstreamCodes, [expected.upstreamCode]);
					assert.doesNotMatch(error.message, /private upstream details|test-secret/);
					return true;
				}
			);
		});
	}
});

test('preserva os erros GraphQL mesmo quando a resposta também contém data', async () => {
	await assert.rejects(
		getProductOfferTest(credentials, async () => graphQLError(11001)),
		(error: unknown) =>
			error instanceof ShopeeApiError &&
			error.code === 'SHOPEE_INVALID_PARAMETERS' &&
			error.upstreamCodes?.includes(11001) === true
	);
});

test('reconhece rate limit no texto seguro do erro GraphQL', async () => {
	await assert.rejects(
		getProductOfferTest(credentials, async () =>
			Response.json({ errors: [{ message: 'Too many requests' }] })
		),
		(error: unknown) =>
			error instanceof ShopeeApiError &&
			error.kind === 'rate_limit' &&
			error.code === 'SHOPEE_RATE_LIMIT'
	);
});

test('trata rate limit HTTP sem consultar o corpo', async () => {
	await assert.rejects(
		getProductOfferTest(credentials, async () => new Response(null, { status: 429 })),
		(error: unknown) =>
			error instanceof ShopeeApiError &&
			error.kind === 'rate_limit' &&
			error.code === 'SHOPEE_RATE_LIMIT'
	);
});

test('aceita campos omitidos, nulos e escalares documentados', async () => {
	const products = await getProductOfferTest(credentials, async () =>
		Response.json({
			data: {
				productOfferV2: {
					nodes: [
						{
							itemId: '9007199254740993',
							shopId: 42,
							productName: null,
							productLink: null,
							offerLink: null,
							imageUrl: null,
							priceMin: '10',
							priceMax: 20,
							priceDiscountRate: null,
							sales: null,
							ratingStar: 4.5,
							commissionRate: null
						},
						{ itemId: 3, shopId: 4 }
					]
				}
			}
		})
	);

	assert.equal(products.length, 2);
	assert.equal(products[0]?.productName, null);
	assert.equal(products[0]?.priceMin, '10');
	assert.equal(products[1]?.offerLink, undefined);
});

test('normaliza ratingStar number e string numérica, preservando null e avaliações ausentes/inválidas', async () => {
	const products = await getProductOfferTest(credentials, async () =>
		Response.json({
			data: {
				productOfferV2: {
					nodes: [
						{ itemId: 1, shopId: 10, ratingStar: 4.8 },
						{ itemId: 2, shopId: 20, ratingStar: '4.7' },
						{ itemId: 3, shopId: 30, ratingStar: null },
						{ itemId: 4, shopId: 40 },
						{ itemId: 5, shopId: 50, ratingStar: 'indisponível' }
					]
				}
			}
		})
	);

	assert.equal(products.length, 5);
	assert.equal(products[0]?.ratingStar, 4.8);
	assert.equal(products[1]?.ratingStar, 4.7);
	assert.equal(products[2]?.ratingStar, null);
	assert.equal(products[3]?.ratingStar, undefined);
	assert.equal(products[4]?.itemId, 5);
	assert.equal(products[4]?.ratingStar, undefined);
});

test('identifica nomes de campos incompatíveis sem incluir seus valores', async () => {
	await assert.rejects(
		getProductOfferTest(credentials, async () =>
			Response.json({
				data: {
					productOfferV2: {
						nodes: [{ itemId: 3, shopId: 4, sales: 'sensitive-value', commissionRate: 0.05 }]
					}
				}
			})
		),
		(error: unknown) => {
			assert.ok(error instanceof ShopeeApiError);
			assert.equal(error.code, 'SHOPEE_INVALID_PRODUCT_FIELDS');
			assert.deepEqual(error.fields, ['sales', 'commissionRate']);
			assert.match(error.message, /sales, commissionRate/);
			assert.doesNotMatch(error.message, /sensitive-value|0\.05/);
			return true;
		}
	);
});

test('falha antes de chamar a API quando faltam credenciais', async () => {
	let requested = false;
	await assert.rejects(
		getProductOfferTest({}, async () => {
			requested = true;
			return Response.json({});
		}),
		(error: unknown) =>
			error instanceof ShopeeApiError && error.code === 'SHOPEE_CREDENTIALS_NOT_CONFIGURED'
	);
	assert.equal(requested, false);
});
