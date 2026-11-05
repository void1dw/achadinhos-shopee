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
	appendRowsToSheet,
	getSheetsWriteConfig,
	SheetsWriteError
} from '../../../../lib/server/shopee/google-sheets-writer';
import {
	buildPublishPreview,
	listApprovedCandidates,
	listPublishableCategories,
	listPublishOperations,
	markCandidatesPublished,
	PublishInputError,
	recordPublishOperation,
	shopeeRevalidator,
	type PublishSelection
} from '../../../../lib/server/shopee/sheet-publish';

const responseHeaders = {
	'cache-control': 'private, no-store',
	'x-content-type-options': 'nosniff'
};

async function authenticated(cookies: { get(name: string): string | undefined }): Promise<boolean> {
	return isAdminSessionValid(cookies.get(ADMIN_SESSION_COOKIE), env);
}

function writeStatus() {
	const result = getSheetsWriteConfig(env);
	return result.configured
		? { configured: true as const, missing: [] as string[], invalid: [] as string[] }
		: { configured: false as const, missing: result.missing, invalid: result.invalid };
}

function readSelections(form: FormData): PublishSelection[] {
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
		const [approved, categories, operations] = await Promise.all([
			listApprovedCandidates(db),
			listPublishableCategories(db),
			listPublishOperations(db)
		]);
		return { state: 'ready' as const, approved, categories, operations, sheets: writeStatus() };
	} catch (error) {
		console.error('Falha ao carregar publicação', error instanceof Error ? error.message : 'erro');
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
		if (!env.SHOPEE_APP_ID || !env.SHOPEE_APP_SECRET) {
			return fail(503, { message: 'Credenciais da Shopee não configuradas.' });
		}
		try {
			const form = await request.formData();
			const preview = await buildPublishPreview(
				db,
				readSelections(form),
				shopeeRevalidator(env, fetch, createD1CallControl(db, 'sheet-publish'))
			);
			return { preview };
		} catch (error) {
			if (error instanceof PublishInputError) return fail(400, { message: error.message });
			if (error instanceof ShopeeApiError && error.kind === 'budget') {
				return fail(shopeeErrorHttpStatus(error), { message: error.message });
			}
			console.error('Falha na prévia', error instanceof Error ? error.message : 'erro');
			return fail(502, { message: 'Não foi possível montar a prévia.' });
		}
	},

	confirm: async ({ cookies, request, setHeaders }) => {
		setHeaders(responseHeaders);
		if (!(await authenticated(cookies))) return fail(401, { message: 'Sessão expirada.' });
		if (!isSameOrigin(request)) return fail(403, { message: 'Origem não permitida.' });
		const db = env.CANDIDATES_DB;
		if (!db) return fail(503, { message: 'Banco indisponível.' });
		if (!env.SHOPEE_APP_ID || !env.SHOPEE_APP_SECRET) {
			return fail(503, { message: 'Credenciais da Shopee não configuradas.' });
		}

		const form = await request.formData();
		if (form.get('confirm') !== 'yes') {
			return fail(400, { message: 'Marque a confirmação explícita para gravar.' });
		}
		const expectedHash = form.get('hash');

		let preview;
		try {
			preview = await buildPublishPreview(
				db,
				readSelections(form),
				shopeeRevalidator(env, fetch, createD1CallControl(db, 'sheet-publish'))
			);
		} catch (error) {
			if (error instanceof PublishInputError) return fail(400, { message: error.message });
			if (error instanceof ShopeeApiError && error.kind === 'budget') {
				return fail(shopeeErrorHttpStatus(error), { message: error.message });
			}
			console.error('Falha ao revalidar', error instanceof Error ? error.message : 'erro');
			return fail(502, { message: 'Não foi possível revalidar os candidatos.' });
		}
		if (preview.items.length === 0) {
			return fail(400, { message: 'Nenhum candidato elegível.', preview });
		}
		if (typeof expectedHash !== 'string' || expectedHash !== preview.hash) {
			return fail(409, {
				message: 'Os dados mudaram desde a prévia. Revise a nova prévia antes de confirmar.',
				preview
			});
		}

		const payload = preview.items.map(({ itemId, shopId, row }) => ({ itemId, shopId, row }));
		const sheets = getSheetsWriteConfig(env);
		try {
			if (!sheets.configured) {
				await recordPublishOperation(db, {
					status: 'blocked',
					requestedRows: payload.length,
					writtenRows: 0,
					payload,
					errorCode: 'SHEETS_WRITE_NOT_CONFIGURED',
					errorMessage: `Variáveis ausentes ou inválidas: ${[...sheets.missing, ...sheets.invalid].join(', ')}`
				});
				return fail(503, {
					message:
						'Gravação bloqueada: a integração de escrita da planilha não está configurada. Nada foi gravado.',
					preview
				});
			}

			let written = 0;
			try {
				const result = await appendRowsToSheet(
					sheets.config,
					payload.map((item) => item.row)
				);
				written = result.appendedRows;
			} catch (error) {
				const code = error instanceof SheetsWriteError ? error.code : 'SHEETS_WRITE_FAILED';
				const message =
					error instanceof SheetsWriteError ? error.message : 'Falha desconhecida na gravação.';
				await recordPublishOperation(db, {
					status: 'failed',
					requestedRows: payload.length,
					writtenRows: 0,
					payload,
					errorCode: code,
					errorMessage: message
				});
				return fail(502, { message: `A gravação falhou: ${message}`, preview });
			}

			try {
				const operationId = await recordPublishOperation(db, {
					status: 'completed',
					requestedRows: payload.length,
					writtenRows: written,
					payload
				});
				await markCandidatesPublished(db, operationId, preview.items);
			} catch (error) {
				console.error(
					'Falha ao registrar operação',
					error instanceof Error ? error.message : 'erro'
				);
				return fail(500, {
					message: `Atenção: ${written} linha(s) FORAM gravadas na planilha, mas o registro local falhou. Não repita a operação.`
				});
			}
			return { published: written };
		} catch (error) {
			console.error('Falha na publicação', error instanceof Error ? error.message : 'erro');
			return fail(500, { message: 'Erro ao registrar a operação.' });
		}
	}
};
