import type { Handle } from '@sveltejs/kit/hooks';

function isAdminPath(pathname: string): boolean {
	return pathname === '/admin' || pathname.startsWith('/admin/');
}

export const handle: Handle = async ({ event, resolve }) => {
	const response = await resolve(event);
	if (isAdminPath(event.url.pathname)) {
		response.headers.set('x-robots-tag', 'noindex, nofollow');
	}
	return response;
};
