import { env } from 'cloudflare:workers';
import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import {
	ADMIN_SESSION_COOKIE,
	ADMIN_SESSION_SECONDS,
	createAdminSession,
	isAdminAuthConfigured,
	isSameOrigin,
	verifyAdminCredentials,
	verifyAdminSession
} from '../../../lib/server/admin-auth';

export const load: PageServerLoad = async ({ cookies, setHeaders }) => {
	setHeaders({
		'cache-control': 'private, no-store',
		'x-content-type-options': 'nosniff',
		'x-frame-options': 'DENY',
		'referrer-policy': 'no-referrer'
	});

	if (
		isAdminAuthConfigured(env) &&
		(await verifyAdminSession(cookies.get(ADMIN_SESSION_COOKIE), env.ADMIN_SESSION_SECRET))
	) {
		redirect(303, '/admin');
	}
	return { authConfigured: isAdminAuthConfigured(env) };
};

export const actions: Actions = {
	default: async ({ request, cookies, setHeaders, url }) => {
		setHeaders({
			'cache-control': 'private, no-store',
			'x-content-type-options': 'nosniff',
			'x-frame-options': 'DENY',
			'referrer-policy': 'no-referrer'
		});
		if (!isSameOrigin(request)) return fail(403, { message: 'Origem da requisição inválida.' });
		if (!isAdminAuthConfigured(env)) {
			return fail(503, {
				message: 'A autenticação administrativa ainda não foi configurada.'
			});
		}

		const form = await request.formData();
		const username = String(form.get('username') ?? '');
		const password = String(form.get('password') ?? '');
		if (!verifyAdminCredentials(username, password, env)) {
			return fail(401, { message: 'Usuário ou senha inválidos.' });
		}

		const sessionSecret = env.ADMIN_SESSION_SECRET;
		if (!sessionSecret) {
			return fail(503, {
				message: 'A autenticação administrativa ainda não está configurada corretamente.'
			});
		}
		const session = await createAdminSession(sessionSecret);
		cookies.set(ADMIN_SESSION_COOKIE, session, {
			path: '/admin',
			httpOnly: true,
			secure: url.protocol === 'https:',
			sameSite: 'strict',
			maxAge: ADMIN_SESSION_SECONDS
		});
		redirect(303, '/admin');
	}
};
