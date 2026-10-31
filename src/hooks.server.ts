import type { Handle } from '@sveltejs/kit/hooks';
import { wwwRedirectTarget } from './lib/canonical-host';

function isAdminPath(pathname: string): boolean {
	return pathname === '/admin' || pathname.startsWith('/admin/');
}

export const handle: Handle = async ({ event, resolve }) => {
	const target = wwwRedirectTarget(event.url, event.request.method);
	if (target) return new Response(null, { status: 301, headers: { location: target } });

	const response = await resolve(event);
	if (isAdminPath(event.url.pathname)) {
		response.headers.set('x-robots-tag', 'noindex, nofollow');
	}
	return response;
};
