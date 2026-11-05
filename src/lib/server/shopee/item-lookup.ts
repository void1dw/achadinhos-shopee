import { json } from '@sveltejs/kit';
import { ADMIN_SESSION_COOKIE, isAdminAuthConfigured, verifyAdminSession } from '../admin-auth';
import { getProductOffers, ShopeeApiError, shopeeErrorHttpStatus } from './client';
import type { ShopeeCallControl } from './call-control';

const responseHeaders = {
	'cache-control': 'private, no-store',
	'x-content-type-options': 'nosniff'
};

type ItemLookupEnv = Pick<
	Cloudflare.Env,
	| 'ADMIN_USERNAME'
	| 'ADMIN_PASSWORD'
	| 'ADMIN_SESSION_SECRET'
	| 'SHOPEE_APP_ID'
	| 'SHOPEE_APP_SECRET'
>;

type ItemLookupResponse = {
	status: 'completed' | 'error';
	matchFound?: boolean;
	itemId?: string;
	shopId?: string;
	returnedItemId?: string | null;
	returnedShopId?: string | null;
	productName?: string | null;
	code?: string;
	error?: string;
	upstreamCodes?: number[];
};

function isNumericIdentifier(value: string | null): value is string {
	return value !== null && /^\d{1,20}$/.test(value) && /[1-9]/.test(value);
}

export async function handleShopeeItemLookup(
	url: URL,
	sessionToken: string | undefined,
	env: ItemLookupEnv,
	fetcher: typeof fetch = fetch,
	control?: ShopeeCallControl
): Promise<Response> {
	if (
		!isAdminAuthConfigured(env) ||
		!(await verifyAdminSession(sessionToken, env.ADMIN_SESSION_SECRET))
	) {
		return json(
			{
				status: 'error',
				code: 'ADMIN_AUTH_REQUIRED',
				error: 'Autenticação administrativa necessária.'
			},
			{ status: 401, headers: responseHeaders }
		);
	}

	const itemId = url.searchParams.get('itemId');
	const shopId = url.searchParams.get('shopId');
	if (!isNumericIdentifier(itemId) || !isNumericIdentifier(shopId)) {
		return json(
			{
				status: 'error',
				code: 'SHOPEE_ITEM_LOOKUP_INVALID_PARAMETERS',
				error: 'Informe itemId e shopId como identificadores numéricos válidos.'
			},
			{ status: 400, headers: responseHeaders }
		);
	}

	if (!env.SHOPEE_APP_ID || !env.SHOPEE_APP_SECRET) {
		return json(
			{
				status: 'error',
				code: 'SHOPEE_CREDENTIALS_NOT_CONFIGURED',
				error: 'As credenciais da Shopee não estão configuradas.'
			},
			{ status: 503, headers: responseHeaders }
		);
	}

	try {
		const result = await getProductOffers(
			env,
			{ itemId, shopId, page: 1, limit: 1, listType: 0 },
			fetcher,
			control
		);
		const product = result.offers[0]?.product;
		const returnedItemId = product?.itemId == null ? null : String(product.itemId);
		const returnedShopId = product?.shopId == null ? null : String(product.shopId);
		const matchFound = returnedItemId === itemId && returnedShopId === shopId;

		const response: ItemLookupResponse = {
			status: 'completed',
			matchFound,
			itemId,
			shopId,
			...(product
				? {
						returnedItemId,
						returnedShopId,
						...(matchFound ? { productName: product.productName ?? null } : {})
					}
				: {})
		};
		return json(response, { headers: responseHeaders });
	} catch (error) {
		if (error instanceof ShopeeApiError) {
			return json(
				{
					status: 'error',
					code: error.code,
					error: error.message,
					...(error.upstreamCodes ? { upstreamCodes: error.upstreamCodes } : {})
				},
				{
					status: shopeeErrorHttpStatus(error),
					headers: responseHeaders
				}
			);
		}

		console.error('Unexpected Shopee item lookup request failure.');
		return json(
			{
				status: 'error',
				code: 'SHOPEE_ITEM_LOOKUP_FAILED',
				error: 'A consulta do produto não pôde ser concluída.'
			},
			{ status: 502, headers: responseHeaders }
		);
	}
}

export { ADMIN_SESSION_COOKIE };
