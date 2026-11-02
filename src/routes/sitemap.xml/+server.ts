import { PUBLIC_SITE_URL } from '../../lib/config';
import { buildSitemapIndex, PAGES_SITEMAP_PATH, SITEMAP_HEADERS } from '../../lib/sitemap';
import type { RequestHandler } from './$types';

/** Índice: novos sitemaps (ex.: produtos, em partes de 50 mil URLs) entram aqui. */
export const GET: RequestHandler = () => {
	const children = [PAGES_SITEMAP_PATH].map((path) => new URL(path, PUBLIC_SITE_URL).toString());
	return new Response(buildSitemapIndex(children), { headers: SITEMAP_HEADERS });
};
