import { env } from 'cloudflare:workers';
import type { RequestHandler } from './$types';
import {
	ADMIN_SESSION_COOKIE,
	isAdminAuthConfigured,
	verifyAdminSession
} from '../../../lib/server/admin-auth';
import { SHEET_PRODUCTS_CSV_URL } from '../../../lib/config';
import { auditProducts } from '../../../lib/server/sheets';
import { formatProductReport } from '../../../lib/server/product-report';

const headers = {
	'cache-control': 'private, no-store',
	'content-type': 'text/plain; charset=utf-8',
	'x-content-type-options': 'nosniff'
};

export const GET: RequestHandler = async ({ cookies, fetch, url }) => {
	if (
		!isAdminAuthConfigured(env) ||
		!(await verifyAdminSession(cookies.get(ADMIN_SESSION_COOKIE), env.ADMIN_SESSION_SECRET))
	) {
		return new Response('Acesso negado. Entre em /admin/login e abra este endereço novamente.', {
			status: 401,
			headers
		});
	}

	const outcome = await auditProducts(fetch, SHEET_PRODUCTS_CSV_URL);
	if (!outcome) {
		return new Response('Não foi possível ler a planilha agora. Tente novamente em instantes.', {
			status: 502,
			headers
		});
	}

	return new Response(formatProductReport(outcome, { details: url.searchParams.has('detalhes') }), {
		headers: {
			...headers,
			'content-disposition': 'inline; filename="produtos-inconsistentes.txt"'
		}
	});
};
