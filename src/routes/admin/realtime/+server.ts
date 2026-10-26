import { env } from 'cloudflare:workers';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	ADMIN_SESSION_COOKIE,
	isAdminAuthConfigured,
	verifyAdminSession
} from '../../../lib/server/admin-auth';
import { Ga4ReportingError, getGa4Realtime } from '../../../lib/server/ga4-reporting';

const headers = {
	'cache-control': 'private, no-store',
	'x-content-type-options': 'nosniff'
};

export const GET: RequestHandler = async ({ cookies }) => {
	if (
		!isAdminAuthConfigured(env) ||
		!(await verifyAdminSession(cookies.get(ADMIN_SESSION_COOKIE), env.ADMIN_SESSION_SECRET))
	) {
		return json({ error: 'Unauthorized.' }, { status: 401, headers });
	}

	try {
		return json({ realtime: await getGa4Realtime(env) }, { headers });
	} catch (error) {
		if (error instanceof Ga4ReportingError) {
			if (error.status === 502) console.error(error.message);
			return json({ error: error.message }, { status: error.status, headers });
		}
		console.error('Unexpected GA4 realtime failure.');
		return json({ error: 'GA4 realtime request failed.' }, { status: 502, headers });
	}
};
