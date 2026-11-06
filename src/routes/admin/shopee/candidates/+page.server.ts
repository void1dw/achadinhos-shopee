import { env } from 'cloudflare:workers';
import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import {
	ADMIN_SESSION_COOKIE,
	isAdminSessionValid,
	isSameOrigin
} from '../../../../lib/server/admin-auth';
import {
	decideCandidate,
	listCandidates,
	type CandidateDecision,
	type CandidateStatus
} from '../../../../lib/server/shopee/candidate-store';
import {
	CandidateCollectionInputError,
	collectShopeeCandidates
} from '../../../../lib/server/shopee/collector';
import {
	DiscoveryFilterError,
	parseDiscoveryFilters,
	type DiscoveryFilterInput
} from '../../../../lib/server/shopee/discovery-filters';
import { createD1CallControl } from '../../../../lib/server/shopee/call-control';

const responseHeaders = {
	'cache-control': 'private, no-store',
	'x-content-type-options': 'nosniff'
};

const FILTER_FIELDS = [
	'minCommissionPercent',
	'minSales',
	'minRating',
	'minPrice',
	'maxPrice',
	'minDiscountPercent'
] as const;

function filterInput(read: (name: string) => string | null): DiscoveryFilterInput {
	return Object.fromEntries(FILTER_FIELDS.map((name) => [name, read(name)]));
}

function isCandidateStatus(value: string | null): value is CandidateStatus {
	return value === 'pending' || value === 'approved' || value === 'rejected';
}

function parseInteger(value: FormDataEntryValue | null): number | undefined {
	if (typeof value !== 'string' || !/^\d+$/.test(value)) return undefined;
	const parsed = Number(value);
	return Number.isSafeInteger(parsed) ? parsed : undefined;
}

async function authenticated(cookies: { get(name: string): string | undefined }): Promise<boolean> {
	return isAdminSessionValid(cookies.get(ADMIN_SESSION_COOKIE), env);
}

export const load: PageServerLoad = async ({ cookies, request, setHeaders, url }) => {
	if (request.method === 'GET') {
		setHeaders(responseHeaders);
	}
	if (!(await authenticated(cookies))) redirect(303, '/admin/login');

	const statusValue = url.searchParams.get('status');
	const status = isCandidateStatus(statusValue) ? statusValue : undefined;
	const search = url.searchParams.get('q')?.trim().slice(0, 100) ?? '';
	const filterValues = filterInput((name) => url.searchParams.get(name));
	let discovery;
	let filterError: string | null = null;
	try {
		discovery = parseDiscoveryFilters(filterValues);
	} catch (error) {
		if (!(error instanceof DiscoveryFilterError)) throw error;
		filterError = error.message;
	}
	if (!env.CANDIDATES_DB) {
		return {
			state: 'unavailable' as const,
			candidates: [],
			status,
			search,
			filterValues,
			filterError
		};
	}

	try {
		const candidates = await listCandidates(env.CANDIDATES_DB, { status, search, discovery });
		return { state: 'ready' as const, candidates, status, search, filterValues, filterError };
	} catch (error) {
		console.error(
			'Candidate list query failed:',
			error instanceof Error ? error.message : String(error)
		);
		return { state: 'error' as const, candidates: [], status, search, filterValues, filterError };
	}
};

export const actions: Actions = {
	collect: async ({ cookies, request, setHeaders }) => {
		setHeaders(responseHeaders);
		if (!(await authenticated(cookies)))
			return fail(401, { message: 'Sessão administrativa inválida.' });
		if (!isSameOrigin(request)) return fail(403, { message: 'Origem da requisição inválida.' });
		if (!env.CANDIDATES_DB) {
			return fail(503, { message: 'O banco D1 de candidatos não está disponível.' });
		}
		if (!env.SHOPEE_APP_ID || !env.SHOPEE_APP_SECRET) {
			return fail(503, { message: 'As credenciais da Shopee não estão configuradas.' });
		}

		const form = await request.formData();
		const searchType = form.get('searchType');
		const pages = parseInteger(form.get('pages'));
		const pageLimit = parseInteger(form.get('pageLimit'));
		const productCatId = parseInteger(form.get('productCatId'));
		const keyword = form.get('keyword');
		try {
			if (typeof searchType !== 'string' || pages === undefined || pageLimit === undefined) {
				throw new CandidateCollectionInputError('Preencha os limites da coleta corretamente.');
			}
			if (searchType !== 'general' && searchType !== 'keyword' && searchType !== 'category') {
				throw new CandidateCollectionInputError('Selecione um tipo de busca válido.');
			}
			const filters = parseDiscoveryFilters(
				filterInput((name) => {
					const value = form.get(name);
					return typeof value === 'string' ? value : null;
				})
			);

			const summary = await collectShopeeCandidates(
				env.CANDIDATES_DB,
				env,
				{
					searchType,
					keyword: typeof keyword === 'string' ? keyword : undefined,
					productCatId,
					pages,
					pageLimit,
					filters
				},
				fetch,
				createD1CallControl(env.CANDIDATES_DB, 'candidate-collect')
			);
			return { collectionSummary: summary };
		} catch (error) {
			if (error instanceof CandidateCollectionInputError || error instanceof DiscoveryFilterError) {
				return fail(400, { message: error.message });
			}
			console.error('Candidate collection execution failed.');
			return fail(502, { message: 'A coleta não pôde ser concluída. Consulte o histórico do D1.' });
		}
	},
	approve: async ({ cookies, request, setHeaders }) => {
		return decideAction('approved', cookies, request, setHeaders);
	},
	reject: async ({ cookies, request, setHeaders }) => {
		return decideAction('rejected', cookies, request, setHeaders);
	}
};

async function decideAction(
	decision: CandidateDecision,
	cookies: { get(name: string): string | undefined },
	request: Request,
	setHeaders: (headers: Record<string, string>) => void
) {
	setHeaders(responseHeaders);
	if (!(await authenticated(cookies)))
		return fail(401, { message: 'Sessão administrativa inválida.' });
	if (!isSameOrigin(request)) return fail(403, { message: 'Origem da requisição inválida.' });
	if (!env.CANDIDATES_DB) {
		return fail(503, { message: 'O banco D1 de candidatos não está disponível.' });
	}

	const form = await request.formData();
	const rejectionReason =
		decision === 'rejected' ? String(form.get('rejectionReason') ?? '').trim() : null;
	if (decision === 'rejected' && (!rejectionReason || rejectionReason.length > 500)) {
		return fail(400, { message: 'Informe um motivo de rejeição com até 500 caracteres.' });
	}
	const itemId = String(form.get('itemId') ?? '');
	const shopId = String(form.get('shopId') ?? '');
	if (!/^\d{1,20}$/.test(itemId) || !/^\d{1,20}$/.test(shopId)) {
		return fail(400, { message: 'Identificadores de candidato inválidos.' });
	}
	try {
		const updated = await decideCandidate(
			env.CANDIDATES_DB,
			itemId,
			shopId,
			decision,
			rejectionReason
		);
		if (updated === 'not_found') return fail(404, { message: 'O candidato não foi encontrado.' });
		if (updated === 'already_decided') {
			return fail(409, {
				message: 'Este candidato já foi decidido e não pode receber uma nova decisão.'
			});
		}
		return {
			decisionMessage: decision === 'approved' ? 'Candidato aprovado.' : 'Candidato rejeitado.'
		};
	} catch {
		console.error('Candidate decision update failed.');
		return fail(500, { message: 'Não foi possível registrar a decisão no banco de candidatos.' });
	}
}
