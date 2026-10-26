import { env } from 'cloudflare:workers';
import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import {
	ADMIN_SESSION_COOKIE,
	isAdminAuthConfigured,
	verifyAdminSession
} from '../../lib/server/admin-auth';
import type { Ga4Reports } from '../../lib/server/ga4-reporting';

const ALLOWED_PERIODS = [7, 30, 90] as const;

function formatDate(date: Date): string {
	return date.toISOString().slice(0, 10);
}

export const load: PageServerLoad = async ({ cookies, fetch, setHeaders, url }) => {
	setHeaders({
		'cache-control': 'private, no-store',
		'x-content-type-options': 'nosniff',
		'x-frame-options': 'DENY',
		'referrer-policy': 'no-referrer'
	});

	if (
		!isAdminAuthConfigured(env) ||
		!(await verifyAdminSession(cookies.get(ADMIN_SESSION_COOKIE), env.ADMIN_SESSION_SECRET))
	) {
		redirect(303, '/admin/login');
	}

	const requestedDays = Number(url.searchParams.get('days') ?? 30);
	const days = ALLOWED_PERIODS.includes(requestedDays as (typeof ALLOWED_PERIODS)[number])
		? requestedDays
		: 30;
	const end = new Date();
	const start = new Date(end);
	start.setUTCDate(start.getUTCDate() - days + 1);
	const dateRange = { startDate: formatDate(start), endDate: formatDate(end) };

	if (!env.GA4_DASHBOARD_TOKEN) {
		return { state: 'pending' as const, days, dateRange };
	}

	const query = new URLSearchParams(dateRange);
	const response = await fetch(`/api/analytics/report?${query}`, {
		headers: { authorization: `Bearer ${env.GA4_DASHBOARD_TOKEN}` }
	});
	if (response.status === 503) {
		return { state: 'pending' as const, days, dateRange };
	}
	if (!response.ok) {
		return {
			state: 'error' as const,
			days,
			dateRange,
			message:
				'Não foi possível consultar o GA4. Verifique as credenciais e as permissões da propriedade.'
		};
	}

	const payload = (await response.json()) as { reports: Ga4Reports };
	return { state: 'ready' as const, days, dateRange, reports: payload.reports };
};
