import { json } from '@sveltejs/kit';
import { isAdminAuthConfigured, verifyAdminSession } from '../admin-auth';
import type { ShopeeCallControl } from './call-control';
import {
	MAX_COMMISSION_PROBE_TARGETS,
	probeCommissionFieldsBatch,
	ShopeeApiError,
	shopeeErrorHttpStatus,
	type CommissionProbeTarget
} from './client';

const responseHeaders = {
	'cache-control': 'private, no-store',
	'x-content-type-options': 'nosniff'
};

export const COMMISSION_PROBE_TARGET = { itemId: '46459381683', shopId: '1398191099' } as const;

type CommissionProbeEnv = Pick<
	Cloudflare.Env,
	| 'ADMIN_USERNAME'
	| 'ADMIN_PASSWORD'
	| 'ADMIN_SESSION_SECRET'
	| 'SHOPEE_APP_ID'
	| 'SHOPEE_APP_SECRET'
>;

/** Lê `items=itemId:shopId,itemId:shopId`; sem o parâmetro usa o produto de teste padrão. */
export function parseCommissionProbeTargets(url: URL): CommissionProbeTarget[] | null {
	const raw = url.searchParams.get('items');
	if (raw === null) return [COMMISSION_PROBE_TARGET];

	const entries = raw.split(',').map((entry) => entry.trim());
	if (entries.length === 0 || entries.length > MAX_COMMISSION_PROBE_TARGETS) return null;
	const targets: CommissionProbeTarget[] = [];
	for (const entry of entries) {
		const match = /^(\d{1,20}):(\d{1,20})$/.exec(entry);
		if (!match || !/[1-9]/.test(match[1]!) || !/[1-9]/.test(match[2]!)) return null;
		targets.push({ itemId: match[1]!, shopId: match[2]! });
	}
	return targets;
}

export async function handleShopeeCommissionProbe(
	sessionToken: string | undefined,
	env: CommissionProbeEnv,
	fetcher: typeof fetch = fetch,
	url: URL = new URL('https://example.invalid/admin/shopee/commission-probe'),
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

	const targets = parseCommissionProbeTargets(url);
	if (!targets) {
		return json(
			{
				status: 'error',
				code: 'SHOPEE_COMMISSION_PROBE_INVALID_PARAMETERS',
				error: `Informe de 1 a ${MAX_COMMISSION_PROBE_TARGETS} pares itemId:shopId numéricos separados por vírgula em "items".`
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
		const products = await probeCommissionFieldsBatch(env, targets, fetcher, control);
		return json(
			{
				status: 'completed',
				productCount: products.length,
				products,
				// Campos de nível superior mantidos para a consulta de um único produto.
				...(products.length === 1 ? products[0] : {})
			},
			{ headers: responseHeaders }
		);
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

		console.error('Unexpected Shopee commission probe failure.');
		return json(
			{
				status: 'error',
				code: 'SHOPEE_COMMISSION_PROBE_FAILED',
				error: 'O teste de campos de comissão não pôde ser concluído.'
			},
			{ status: 502, headers: responseHeaders }
		);
	}
}
