import { env } from 'cloudflare:workers';
import { buildUrlset, SITEMAP_HEADERS } from '../../lib/sitemap';
import { loadPublicPageUrls } from '../../lib/server/public-pages';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
	const urls = await loadPublicPageUrls(env.CANDIDATES_DB);
	if (!urls) {
		// Sem dados confiáveis, é melhor pedir nova tentativa do que publicar um sitemap incompleto (D1 ausente ou com erro).
		return new Response('Sitemap temporariamente indisponível.', {
			status: 503,
			headers: { 'cache-control': 'no-store', 'retry-after': '300' }
		});
	}
	return new Response(buildUrlset(urls), { headers: SITEMAP_HEADERS });
};
