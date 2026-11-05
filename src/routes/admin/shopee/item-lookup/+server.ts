import { env } from 'cloudflare:workers';
import type { RequestHandler } from './$types';
import {
	ADMIN_SESSION_COOKIE,
	handleShopeeItemLookup
} from '../../../../lib/server/shopee/item-lookup';
import { createD1CallControl } from '../../../../lib/server/shopee/call-control';

// Sem D1, o controle fica indefinido e o cliente bloqueia a chamada (SHOPEE_CALL_CONTROL_REQUIRED).
export const GET: RequestHandler = async ({ cookies, url }) =>
	handleShopeeItemLookup(
		url,
		cookies.get(ADMIN_SESSION_COOKIE),
		env,
		fetch,
		env.CANDIDATES_DB ? createD1CallControl(env.CANDIDATES_DB, 'item-lookup') : undefined
	);
