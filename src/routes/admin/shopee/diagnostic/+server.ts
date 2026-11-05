import { env } from 'cloudflare:workers';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	ADMIN_SESSION_COOKIE,
	isAdminAuthConfigured,
	verifyAdminSession
} from '../../../../lib/server/admin-auth';
import { createD1CallControl } from '../../../../lib/server/shopee/call-control';
import {
	runShopeeDiagnostic,
	ShopeeApiError,
	shopeeErrorHttpStatus
} from '../../../../lib/server/shopee/client';

const headers = {
	'cache-control': 'private, no-store',
	'x-content-type-options': 'nosniff'
};

export const GET: RequestHandler = async ({ cookies }) => {
	if (
		!isAdminAuthConfigured(env) ||
		!(await verifyAdminSession(cookies.get(ADMIN_SESSION_COOKIE), env.ADMIN_SESSION_SECRET))
	) {
		return json(
			{
				status: 'error',
				code: 'ADMIN_AUTH_REQUIRED',
				error: 'Autenticação administrativa necessária.'
			},
			{ status: 401, headers }
		);
	}

	if (!env.SHOPEE_APP_ID || !env.SHOPEE_APP_SECRET) {
		return json(
			{
				status: 'error',
				code: 'SHOPEE_CREDENTIALS_NOT_CONFIGURED',
				error: 'As credenciais da Shopee não estão configuradas.'
			},
			{ status: 503, headers }
		);
	}

	if (!env.CANDIDATES_DB) {
		return json(
			{
				status: 'error',
				code: 'SHOPEE_CALL_CONTROL_UNAVAILABLE',
				error: 'O banco D1 do controle de consumo não está disponível; a chamada foi bloqueada.'
			},
			{ status: 503, headers }
		);
	}

	try {
		const control = createD1CallControl(env.CANDIDATES_DB, 'diagnostic');
		return json(
			{ status: 'completed', ...(await runShopeeDiagnostic(env, fetch, control)) },
			{ headers }
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
					headers
				}
			);
		}

		console.error('Unexpected Shopee diagnostic request failure.');
		return json(
			{ status: 'error', code: 'SHOPEE_DIAGNOSTIC_FAILED', error: 'Shopee diagnostic failed.' },
			{ status: 502, headers }
		);
	}
};
