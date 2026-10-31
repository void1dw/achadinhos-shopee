import type { Handle } from '@sveltejs/kit/hooks';
import { wwwRedirectTarget } from './lib/canonical-host';

function isAdminPath(pathname: string): boolean {
	return pathname === '/admin' || pathname.startsWith('/admin/');
}

export const handle: Handle = async ({ event, resolve }) => {
	const target = wwwRedirectTarget(event.url, event.request.method);
	// O cache do Workers não inclui o host na chave; um 301 guardado para "/" seria servido também na raiz.
	if (target) {
		return new Response(null, {
			status: 301,
			headers: { location: target, 'cache-control': 'no-store' }
		});
	}

	const response = await resolve(event);
	if (isAdminPath(event.url.pathname)) {
		response.headers.set('x-robots-tag', 'noindex, nofollow');
	}
	return response;
};
