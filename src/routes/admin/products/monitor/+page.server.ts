import { env } from 'cloudflare:workers';
import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import {
	ADMIN_SESSION_COOKIE,
	isAdminSessionValid,
	isSameOrigin
} from '../../../../lib/server/admin-auth';
import { runCatalogAudit } from '../../../../lib/server/shopee/catalog-audit';
import {
	computeMonitorAlerts,
	getApiControlStats,
	getApiUsage,
	getMonitorSettings,
	listMonitorEvents,
	listMonitorRuns,
	MonitorSettingsError,
	updateMonitorSettings
} from '../../../../lib/server/shopee/monitor-store';

const responseHeaders = {
	'cache-control': 'private, no-store',
	'x-content-type-options': 'nosniff'
};

async function authenticated(cookies: { get(name: string): string | undefined }): Promise<boolean> {
	return isAdminSessionValid(cookies.get(ADMIN_SESSION_COOKIE), env);
}

function toInt(value: FormDataEntryValue | null): number | undefined {
	return typeof value === 'string' && /^\d{1,6}$/.test(value) ? Number(value) : undefined;
}

export const load: PageServerLoad = async ({ cookies, request, setHeaders }) => {
	if (request.method === 'GET') setHeaders(responseHeaders);
	if (!(await authenticated(cookies))) redirect(303, '/admin/login');
	const db = env.CANDIDATES_DB;
	if (!db) return { state: 'unavailable' as const };
	try {
		const now = new Date();
		const [settings, usage, runs, events, controlStats] = await Promise.all([
			getMonitorSettings(db),
			getApiUsage(db, now),
			listMonitorRuns(db, 20),
			listMonitorEvents(db, 50),
			getApiControlStats(db, now)
		]);
		const alerts = computeMonitorAlerts({ settings, usage, lastRun: runs[0] ?? null, now });
		return { state: 'ready' as const, settings, usage, controlStats, runs, events, alerts };
	} catch (error) {
		console.error('Falha ao carregar monitor', error instanceof Error ? error.message : 'erro');
		return { state: 'db-error' as const };
	}
};

export const actions: Actions = {
	settings: async ({ cookies, request, setHeaders }) => {
		setHeaders(responseHeaders);
		if (!(await authenticated(cookies))) return fail(401, { message: 'Sessão expirada.' });
		if (!isSameOrigin(request)) return fail(403, { message: 'Origem não permitida.' });
		const db = env.CANDIDATES_DB;
		if (!db) return fail(503, { message: 'Banco indisponível.' });
		const form = await request.formData();
		try {
			await updateMonitorSettings(db, {
				paused: form.get('paused') === 'on',
				intervalHours: toInt(form.get('intervalHours')),
				batchSize: toInt(form.get('batchSize')),
				hourlyCallBudget: toInt(form.get('hourlyCallBudget'))
			});
			return { saved: true };
		} catch (error) {
			if (error instanceof MonitorSettingsError) return fail(400, { message: error.message });
			console.error(
				'Falha ao salvar configurações',
				error instanceof Error ? error.message : 'erro'
			);
			return fail(500, { message: 'Não foi possível salvar as configurações.' });
		}
	},

	run: async ({ cookies, request, setHeaders }) => {
		setHeaders(responseHeaders);
		if (!(await authenticated(cookies))) return fail(401, { message: 'Sessão expirada.' });
		if (!isSameOrigin(request)) return fail(403, { message: 'Origem não permitida.' });
		const db = env.CANDIDATES_DB;
		if (!db) return fail(503, { message: 'Banco indisponível.' });
		if (!env.SHOPEE_APP_ID || !env.SHOPEE_APP_SECRET) {
			return fail(503, { message: 'Credenciais da Shopee não configuradas.' });
		}
		try {
			const settings = await getMonitorSettings(db);
			const outcome = await runCatalogAudit(db, env, {
				trigger: 'manual',
				linkedLimit: settings.batchSize,
				discoveryLimit: 0,
				force: false
			});
			if (outcome.state === 'busy')
				return fail(409, { message: 'Já existe uma execução em andamento.' });
			if (outcome.state === 'blocked') return fail(429, { message: outcome.message });
			if (outcome.state === 'skipped') return fail(409, { message: 'Execução ignorada.' });
			return {
				ran: { status: outcome.status, errorMessage: outcome.errorMessage }
			};
		} catch (error) {
			console.error('Falha na execução manual', error instanceof Error ? error.message : 'erro');
			return fail(500, { message: 'A execução falhou. Consulte o histórico.' });
		}
	}
};
