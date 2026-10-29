import { sitemapCategorySlugs } from '../../lib/category-pages';
import { PUBLIC_SITE_URL, SHEET_PRODUCTS_CSV_URL, SHOW_DEMO_DATA } from '../../lib/config';
import { demoProducts } from '../../lib/data/demo-data';
import { toShowcase } from '../../lib/products';
import { loadProducts } from '../../lib/server/sheets';
import type { RequestHandler } from './$types';

function escapeXml(value: string): string {
	return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export const GET: RequestHandler = async ({ fetch }) => {
	let products = demoProducts;
	if (!SHOW_DEMO_DATA) {
		const result = await loadProducts(fetch, SHEET_PRODUCTS_CSV_URL);
		if (result.failed && !result.stale) {
			// Sem dados confiáveis, é melhor pedir nova tentativa do que publicar um sitemap incompleto.
			return new Response('Sitemap temporariamente indisponível.', {
				status: 503,
				headers: { 'cache-control': 'no-store', 'retry-after': '300' }
			});
		}
		products = result.items;
	}

	const categoryUrls = sitemapCategorySlugs(toShowcase(products)).map((slug) =>
		new URL(`/categoria/${slug}`, PUBLIC_SITE_URL).toString()
	);
	const locations = [PUBLIC_SITE_URL, ...categoryUrls]
		.map((url) => `\t<url>\n\t\t<loc>${escapeXml(url)}</loc>\n\t</url>`)
		.join('\n');

	return new Response(
		`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${locations}\n</urlset>\n`,
		{
			headers: {
				'content-type': 'application/xml; charset=utf-8',
				'cache-control': 'public, max-age=3600, s-maxage=86400'
			}
		}
	);
};
