import { buildUrlset, SITEMAP_HEADERS } from '../../lib/sitemap';
import { loadPublicPageUrls } from '../../lib/server/public-pages';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ fetch }) => {
	const urls = await loadPublicPageUrls(fetch);
	if (!urls) {
		// Sem dados confiáveis, é melhor pedir nova tentativa do que publicar um sitemap incompleto.
		return new Response('Sitemap temporariamente indisponível.', {
			status: 503,
			headers: { 'cache-control': 'no-store', 'retry-after': '300' }
		});
	}
	return new Response(buildUrlset(urls), { headers: SITEMAP_HEADERS });
};
