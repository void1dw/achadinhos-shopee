import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { ADMIN_SESSION_COOKIE, isSameOrigin } from '../../../lib/server/admin-auth';

export const POST: RequestHandler = async ({ request, cookies }) => {
	if (!isSameOrigin(request)) {
		return new Response('Forbidden', {
			status: 403,
			headers: { 'cache-control': 'private, no-store' }
		});
	}
	cookies.delete(ADMIN_SESSION_COOKIE, { path: '/admin' });
	redirect(303, '/admin/login');
};
