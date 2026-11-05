import { env } from 'cloudflare:workers';
import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import type { Product } from '../../../../lib/types';
import { SHEET_PRODUCTS_CSV_URL } from '../../../../lib/config';
import {
	ADMIN_SESSION_COOKIE,
	isAdminSessionValid,
	isSameOrigin
} from '../../../../lib/server/admin-auth';
import {
	insertMissingProducts,
	listProducts,
	productsDiffer,
	updateProduct
} from '../../../../lib/server/product-store';
import { auditProducts } from '../../../../lib/server/sheets';

const responseHeaders = {
	'cache-control': 'private, no-store',
	'x-content-type-options': 'nosniff'
};
const MAX_LISTED_ISSUES = 100;

async function authenticated(cookies: { get(name: string): string | undefined }): Promise<boolean> {
	return isAdminSessionValid(cookies.get(ADMIN_SESSION_COOKIE), env);
}

/** Lê e processa a planilha no servidor e compara com os IDs já existentes no D1. */
async function buildPlan(fetcher: typeof fetch, db: D1Database) {
	const outcome = await auditProducts(fetcher, SHEET_PRODUCTS_CSV_URL);
	if (!outcome) return { state: 'sheet-error' as const };

	let existing: Map<string, Product>;
	try {
		existing = new Map((await listProducts(db)).map((product) => [product.id, product]));
	} catch (error) {
		console.error(
			'Product import D1 read failed:',
			error instanceof Error ? error.message : String(error)
		);
		return { state: 'db-error' as const };
	}

	const toInsert = outcome.items.filter((product) => !existing.has(product.id));
	const toUpdate = outcome.items.filter((product) => {
		const current = existing.get(product.id);
		return current !== undefined && productsDiffer(current, product);
	});
	const rejections = outcome.issues.filter(
		(issue) => issue.kind === 'reject' && !issue.hasValidTwin
	);
	return {
		state: 'ready' as const,
		toInsert,
		toUpdate,
		report: {
			wouldUpdate: toUpdate.length,
			rows: outcome.counts.rows,
			valid: outcome.counts.valid,
			rejected: outcome.counts.rejected,
			warnings: outcome.counts.warnings,
			existing: outcome.items.length - toInsert.length,
			wouldInsert: toInsert.length,
			rejections: rejections
				.slice(0, MAX_LISTED_ISSUES)
				.map(({ id, row, name, message, column, field }) => ({
					id,
					row,
					name,
					message,
					column,
					field
				})),
			unclassified: [...outcome.unclassified.entries()]
				.map(([category, rows]) => ({ category, rows }))
				.sort((a, b) => b.rows - a.rows)
		}
	};
}

export const load: PageServerLoad = async ({ cookies, fetch, request, setHeaders }) => {
	if (request.method === 'GET') setHeaders(responseHeaders);
	if (!(await authenticated(cookies))) redirect(303, '/admin/login');
	if (!env.CANDIDATES_DB) return { state: 'unavailable' as const };

	const plan = await buildPlan(fetch, env.CANDIDATES_DB);
	if (plan.state !== 'ready') return { state: plan.state };
	return { state: plan.state, report: plan.report };
};

export const actions: Actions = {
	import: async ({ cookies, fetch, request, setHeaders }) => {
		setHeaders(responseHeaders);
		if (!(await authenticated(cookies)))
			return fail(401, { message: 'Sessão administrativa inválida.' });
		if (!isSameOrigin(request)) return fail(403, { message: 'Origem da requisição inválida.' });
		if (!env.CANDIDATES_DB) {
			return fail(503, { message: 'O banco D1 não está disponível.' });
		}

		const plan = await buildPlan(fetch, env.CANDIDATES_DB);
		if (plan.state === 'sheet-error') {
			return fail(502, { message: 'Não foi possível ler a planilha de produtos.' });
		}
		if (plan.state === 'db-error') {
			return fail(500, { message: 'Não foi possível consultar a tabela de produtos no D1.' });
		}

		const result = await insertMissingProducts(env.CANDIDATES_DB, plan.toInsert);
		// Atualização é opt-in: sobrescreve ajustes editoriais feitos no D1 com os dados da planilha.
		let updated = 0;
		let updateFailed = 0;
		if ((await request.formData()).get('updateExisting') === 'on') {
			for (const product of plan.toUpdate) {
				try {
					if (await updateProduct(env.CANDIDATES_DB, product)) updated += 1;
					else updateFailed += 1;
				} catch (error) {
					updateFailed += 1;
					console.error(
						'Product import update failed:',
						error instanceof Error ? error.message : String(error)
					);
				}
			}
		}
		return {
			importSummary: {
				inserted: result.inserted,
				ignored: plan.report.existing + result.ignored,
				failed: result.failed + updateFailed,
				rejected: plan.report.rejected,
				updated
			}
		};
	}
};
