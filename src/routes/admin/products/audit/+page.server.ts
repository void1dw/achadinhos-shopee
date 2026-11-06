import { env } from 'cloudflare:workers';
import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import {
	ADMIN_SESSION_COOKIE,
	isAdminSessionValid,
	isSameOrigin
} from '../../../../lib/server/admin-auth';
import { linkProductToShopee } from '../../../../lib/server/product-store';
import { runCatalogAudit } from '../../../../lib/server/shopee/catalog-audit';
import {
	getApiUsage,
	getAudits,
	getAuditCounts,
	getMonitorSettings,
	listAudits
} from '../../../../lib/server/shopee/monitor-store';
import { getCoverageStats, listFailingProducts } from '../../../../lib/server/shopee/monitor-queue';
import {
	MAX_BATCH_SIZE,
	cancelBatch,
	getAuditStats,
	getOpenBatch,
	releaseExhausted,
	resumeBatch,
	runBatchStep,
	startOrResumeBatch
} from '../../../../lib/server/shopee/audit-batch';
import {
	AUDIT_STATUSES,
	AUDIT_STATUS_LABELS,
	MATCH_LEVEL_LABELS,
	type AuditStatus
} from '../../../../lib/server/shopee/product-match';

const responseHeaders = {
	'cache-control': 'private, no-store',
	'x-content-type-options': 'nosniff'
};
const PAGE_SIZE = 25;
const MAX_PAGE = 1000;

async function authenticated(cookies: { get(name: string): string | undefined }): Promise<boolean> {
	return isAdminSessionValid(cookies.get(ADMIN_SESSION_COOKIE), env);
}

function parseStatus(value: string | null): AuditStatus | undefined {
	return AUDIT_STATUSES.find((status) => status === value);
}

async function guardBatchAction(
	cookies: { get(name: string): string | undefined },
	request: Request,
	setHeaders: (headers: Record<string, string>) => void,
	needsShopee = false
) {
	setHeaders(responseHeaders);
	if (!(await authenticated(cookies))) return fail(401, { message: 'Sessão administrativa inválida.' });
	if (!isSameOrigin(request)) return fail(403, { message: 'Origem da requisição inválida.' });
	if (!env.CANDIDATES_DB) return fail(503, { message: 'O banco D1 não está disponível.' });
	if (needsShopee && (!env.SHOPEE_APP_ID || !env.SHOPEE_APP_SECRET)) {
		return fail(503, { message: 'As credenciais da Shopee não estão configuradas.' });
	}
	return null;
}

function parseCount(value: FormDataEntryValue | null, fallback: number, max: number): number {
	if (typeof value !== 'string' || !/^\d{1,3}$/.test(value)) return fallback;
	return Math.min(Number(value), max);
}

export const load: PageServerLoad = async ({ cookies, request, setHeaders, url }) => {
	if (request.method === 'GET') setHeaders(responseHeaders);
	if (!(await authenticated(cookies))) redirect(303, '/admin/login');
	const db = env.CANDIDATES_DB;
	if (!db) return { state: 'unavailable' as const };

	const status = parseStatus(url.searchParams.get('status'));
	const search = (url.searchParams.get('q') ?? '').trim().slice(0, 100);
	const pageParam = Number(url.searchParams.get('page') ?? '1');
	const page = Number.isInteger(pageParam) && pageParam >= 1 ? Math.min(pageParam, MAX_PAGE) : 1;

	try {
		const [counts, rows, settings, usage, coverage, failing, auditStats, openBatch] = await Promise.all([
			getAuditCounts(db),
			listAudits(db, { status, search, limit: PAGE_SIZE + 1, offset: (page - 1) * PAGE_SIZE }),
			getMonitorSettings(db),
			getApiUsage(db),
			getCoverageStats(db, new Date()),
			listFailingProducts(db, 15),
			getAuditStats(db),
			getOpenBatch(db)
		]);
		return {
			state: 'ready' as const,
			counts,
			coverage,
			failing,
			auditStats,
			openBatch,
			maxBatchSize: MAX_BATCH_SIZE,
			filters: { status: status ?? '', q: search, page },
			hasNextPage: rows.length > PAGE_SIZE,
			audits: rows.slice(0, PAGE_SIZE),
			statusLabels: AUDIT_STATUS_LABELS,
			matchLabels: MATCH_LEVEL_LABELS,
			statuses: [...AUDIT_STATUSES],
			shopeeConfigured: Boolean(env.SHOPEE_APP_ID && env.SHOPEE_APP_SECRET),
			apiCallsLastHour: usage.callsLastHour,
			batchSize: settings.batchSize
		};
	} catch (error) {
		console.error(
			'Catalog audit read failed:',
			error instanceof Error ? error.message : String(error)
		);
		return { state: 'db-error' as const };
	}
};

export const actions: Actions = {
	startBatch: async ({ cookies, request, setHeaders }) => {
		const guard = await guardBatchAction(cookies, request, setHeaders);
		if (guard) return guard;
		try {
			const result = await startOrResumeBatch(env.CANDIDATES_DB!, new Date());
			if (result.state === 'empty') {
				return { batchStep: { state: 'empty' as const, batch: null, message: null } };
			}
			return { batchStep: { state: result.state, batch: result.batch, message: null } };
		} catch (error) {
			console.error('Audit batch start failed:', error instanceof Error ? error.message : String(error));
			return fail(500, { message: 'Não foi possível iniciar o lote de auditoria.' });
		}
	},

	step: async ({ cookies, request, setHeaders }) => {
		const guard = await guardBatchAction(cookies, request, setHeaders, true);
		if (guard) return guard;
		try {
			const form = await request.formData();
			if (form.get('resume') === '1') await resumeBatch(env.CANDIDATES_DB!, new Date());
			const result = await runBatchStep(env.CANDIDATES_DB!, env);
			return {
				batchStep: {
					state: result.state,
					batch: 'batch' in result ? result.batch : null,
					message: result.state === 'blocked' ? result.message : null
				}
			};
		} catch (error) {
			console.error('Audit batch step failed:', error instanceof Error ? error.message : String(error));
			return fail(500, { message: 'O bloco não pôde ser processado; o lote foi preservado e pode ser retomado.' });
		}
	},

	cancelBatch: async ({ cookies, request, setHeaders }) => {
		const guard = await guardBatchAction(cookies, request, setHeaders);
		if (guard) return guard;
		const cancelled = await cancelBatch(env.CANDIDATES_DB!, new Date());
		return { batchStep: { state: cancelled ? ('cancelled' as const) : ('none' as const), batch: null, message: null } };
	},

	releaseExhausted: async ({ cookies, request, setHeaders }) => {
		const guard = await guardBatchAction(cookies, request, setHeaders);
		if (guard) return guard;
		const released = await releaseExhausted(env.CANDIDATES_DB!);
		return { released };
	},

	run: async ({ cookies, request, setHeaders }) => {
		setHeaders(responseHeaders);
		if (!(await authenticated(cookies)))
			return fail(401, { message: 'Sessão administrativa inválida.' });
		if (!isSameOrigin(request)) return fail(403, { message: 'Origem da requisição inválida.' });
		const db = env.CANDIDATES_DB;
		if (!db) return fail(503, { message: 'O banco D1 não está disponível.' });
		if (!env.SHOPEE_APP_ID || !env.SHOPEE_APP_SECRET) {
			return fail(503, { message: 'As credenciais da Shopee não estão configuradas.' });
		}

		const form = await request.formData();
		const limit = parseCount(form.get('limit'), 20, 50);
		const discoveryLimit = parseCount(form.get('discoveryLimit'), 0, 10);
		try {
			const outcome = await runCatalogAudit(db, env, {
				trigger: 'manual',
				limit,
				discoveryLimit,
				force: form.get('force') === 'on'
			});
			if (outcome.state === 'busy') {
				return fail(409, { message: 'Já existe uma verificação em andamento.' });
			}
			if (outcome.state === 'blocked') return fail(429, { message: outcome.message });
			if (outcome.state === 'skipped') {
				return fail(409, {
					message:
						'Nenhum produto vencido na fila. Marque "reverificar mesmo em dia" para forçar uma nova leitura; nada foi consultado.'
				});
			}
			return {
				runSummary: {
					status: outcome.status,
					totals: outcome.totals,
					shortLinks: outcome.shortLinks,
					priceUpdates: outcome.priceUpdates,
					errorCode: outcome.errorCode,
					errorMessage: outcome.errorMessage
				}
			};
		} catch (error) {
			console.error(
				'Catalog audit run failed:',
				error instanceof Error ? error.message : String(error)
			);
			return fail(500, { message: 'Não foi possível executar a verificação.' });
		}
	},

	link: async ({ cookies, request, setHeaders }) => {
		setHeaders(responseHeaders);
		if (!(await authenticated(cookies)))
			return fail(401, { message: 'Sessão administrativa inválida.' });
		if (!isSameOrigin(request)) return fail(403, { message: 'Origem da requisição inválida.' });
		const db = env.CANDIDATES_DB;
		if (!db) return fail(503, { message: 'O banco D1 não está disponível.' });

		const form = await request.formData();
		const productId = form.get('productId');
		const itemId = form.get('itemId');
		const shopId = form.get('shopId');
		if (typeof productId !== 'string' || typeof itemId !== 'string' || typeof shopId !== 'string') {
			return fail(400, { message: 'Dados do vínculo inválidos.' });
		}

		// Só aceita um par que a própria auditoria apontou como candidato deste produto.
		const audit = (await getAudits(db, [productId])).get(productId);
		const allowed = audit?.detail.candidates?.some(
			(candidate) => candidate.itemId === itemId && candidate.shopId === shopId
		);
		if (!allowed) {
			return fail(400, { message: 'O par informado não é um candidato desta auditoria.' });
		}
		try {
			const linked = await linkProductToShopee(db, productId, itemId, shopId);
			if (!linked) return fail(404, { message: 'Produto não encontrado.' });
		} catch (error) {
			console.error('Product link failed:', error instanceof Error ? error.message : String(error));
			return fail(409, {
				message: 'Não foi possível vincular: o par já está associado a outro produto ou é inválido.'
			});
		}
		return { linked: { productId, itemId, shopId } };
	}
};
