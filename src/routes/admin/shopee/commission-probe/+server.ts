import { env } from 'cloudflare:workers';
import type { RequestHandler } from './$types';
import { ADMIN_SESSION_COOKIE } from '../../../../lib/server/admin-auth';
import { createD1CallControl } from '../../../../lib/server/shopee/call-control';
import { handleShopeeCommissionProbe } from '../../../../lib/server/shopee/commission-probe';

// Sem D1, o controle fica indefinido e o cliente bloqueia a chamada (SHOPEE_CALL_CONTROL_REQUIRED).
export const GET: RequestHandler = async ({ cookies, url }) =>
	handleShopeeCommissionProbe(
		cookies.get(ADMIN_SESSION_COOKIE),
		env,
		fetch,
		url,
		env.CANDIDATES_DB ? createD1CallControl(env.CANDIDATES_DB, 'commission-probe') : undefined
	);
