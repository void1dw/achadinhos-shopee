import { env } from 'cloudflare:workers';
import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import {
	ADMIN_SESSION_COOKIE,
	isAdminSessionValid,
	isSameOrigin
} from '../../../../lib/server/admin-auth';
import { createD1CallControl } from '../../../../lib/server/shopee/call-control';
import { ShopeeApiError, shopeeErrorHttpStatus } from '../../../../lib/server/shopee/client';
import {
	addCandidatesToCatalog,
	buildCatalogAddPreview,
	CatalogAddInputError,
	listApprovedCandidates,
	listCatalogCategories,
	matchesCatalogAddPreviewHash,
	shopeeRevalidator,
	type CatalogAddSelection
} from '../../../../lib/server/shopee/catalog-add';

const responseHeaders = {
	'cache-control': 'private, no-store',
	'x-content-type-options': 'nosniff'
};
async function authenticated(cookies: { get(name: string): string | undefined }): Promise<boolean> {
	return isAdminSessionValid(cookies.get(ADMIN_SESSION_COOKIE), env);
}
function readSelections(form: FormData): CatalogAddSelection[] {
	return form
		.getAll('selected')
		.filter((value): value is string => typeof value === 'string')
		.map((value) => {
			const [itemId = '', shopId = ''] = value.split(':');
			const category = form.get(`category:${value}`);
			return { itemId, shopId, category: typeof category === 'string' ? category : '' };
		});
}

export const load: PageServerLoad = async ({ cookies, request, setHeaders }) => {
	if (request.method === 'GET') setHeaders(responseHeaders);
	if (!(await authenticated(cookies))) redirect(303, '/admin/login');
	const db = env.CANDIDATES_DB;
	if (!db) return { state: 'unavailable' as const };
	try {
		const [approved, categories] = await Promise.all([
			listApprovedCandidates(db),
			listCatalogCategories(db)
		]);
		return { state: 'ready' as const, approved, categories };
	} catch (error) {
		console.error(
			'Falha ao carregar candidatos para o catálogo',
			error instanceof Error ? error.message : 'erro'
		);
		return { state: 'error' as const };
	}
};

export const actions: Actions = {
	preview: async ({ cookies, request, setHeaders }) => {
		setHeaders(responseHeaders);
		if (!(await authenticated(cookies))) return fail(401, { message: 'Sessão expirada.' });
		if (!isSameOrigin(request)) return fail(403, { message: 'Origem não permitida.' });
		const db = env.CANDIDATES_DB;
		if (!db) return fail(503, { message: 'Banco indisponível.' });
		if (!env.SHOPEE_APP_ID || !env.SHOPEE_APP_SECRET)
			return fail(503, { message: 'Credenciais da Shopee não configuradas.' });
		try {
			const preview = await buildCatalogAddPreview(
				db,
				readSelections(await request.formData()),
				shopeeRevalidator(env, fetch, createD1CallControl(db, 'catalog-add'))
			);
			return { preview };
		} catch (error) {
			if (error instanceof CatalogAddInputError) return fail(400, { message: error.message });
			if (error instanceof ShopeeApiError && error.kind === 'budget')
				return fail(shopeeErrorHttpStatus(error), { message: error.message });
			console.error('Falha na prévia do catálogo', error instanceof Error ? error.message : 'erro');
			return fail(502, { message: 'Não foi possível montar a prévia.' });
		}
	},
	confirm: async ({ cookies, request, setHeaders }) => {
		setHeaders(responseHeaders);
		if (!(await authenticated(cookies))) return fail(401, { message: 'Sessão expirada.' });
		if (!isSameOrigin(request)) return fail(403, { message: 'Origem não permitida.' });
		const db = env.CANDIDATES_DB;
		if (!db) return fail(503, { message: 'Banco indisponível.' });
		if (!env.SHOPEE_APP_ID || !env.SHOPEE_APP_SECRET)
			return fail(503, { message: 'Credenciais da Shopee não configuradas.' });
		const form = await request.formData();
		if (form.get('confirm') !== 'yes')
			return fail(400, { message: 'Marque a confirmação explícita para adicionar ao catálogo.' });
		let preview;
		try {
			preview = await buildCatalogAddPreview(
				db,
				readSelections(form),
				shopeeRevalidator(env, fetch, createD1CallControl(db, 'catalog-add'))
			);
		} catch (error) {
			if (error instanceof CatalogAddInputError) return fail(400, { message: error.message });
			if (error instanceof ShopeeApiError && error.kind === 'budget')
				return fail(shopeeErrorHttpStatus(error), { message: error.message });
			console.error(
				'Falha ao revalidar candidatos',
				error instanceof Error ? error.message : 'erro'
			);
			return fail(502, { message: 'Não foi possível revalidar os candidatos.' });
		}
		if (preview.items.length === 0)
			return fail(400, { message: 'Nenhum candidato elegível.', preview });
		const expectedHash = form.get('hash');
		if (!matchesCatalogAddPreviewHash(expectedHash, preview)) {
			return fail(409, {
				message: 'Os dados mudaram desde a prévia. Revise a nova prévia antes de confirmar.',
				preview
			});
		}
		const result = await addCandidatesToCatalog(db, preview.items);
		return { added: result.added, failures: result.failed };
	}
};
