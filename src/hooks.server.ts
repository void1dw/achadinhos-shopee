import type { Handle } from '@sveltejs/kit/hooks';
import {
	HSTS_HEADER,
	httpsRedirectTarget,
	isWorkersDevHost,
	shouldSendHsts,
	wwwRedirectTarget
} from './lib/canonical-host';

function isAdminPath(pathname: string): boolean {
	return pathname === '/admin' || pathname.startsWith('/admin/');
}

export const handle: Handle = async ({ event, resolve }) => {
	const target =
		httpsRedirectTarget(event.url, event.request.method) ??
		wwwRedirectTarget(event.url, event.request.method);
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
	} else if (isWorkersDevHost(event.url.hostname)) {
		response.headers.set('x-robots-tag', 'noindex, nofollow');
		// O cache do Workers ignora o host: sem no-store, o noindex poderia ser servido no domínio oficial.
		response.headers.set('cache-control', 'no-store');
	}
	if (shouldSendHsts(event.url)) {
		response.headers.set('strict-transport-security', HSTS_HEADER);
	}
	return response;
};
