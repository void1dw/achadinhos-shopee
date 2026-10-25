import { categoryPagesWithProducts } from '../../lib/category-pages';
import { PUBLIC_SITE_URL, SHEET_PRODUCTS_CSV_URL, SHOW_DEMO_DATA } from '../../lib/config';
import { demoProducts } from '../../lib/data/demo-data';
import { toShowcase } from '../../lib/products';
import { loadProducts } from '../../lib/server/sheets';

function escapeXml(value: string): string {
	return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export async function GET({ fetch }: { fetch: typeof globalThis.fetch }): Promise<Response> {
	const result = SHOW_DEMO_DATA
		? { items: demoProducts, failed: false, stale: false }
		: await loadProducts(fetch, SHEET_PRODUCTS_CSV_URL);
	if (result.failed && !result.stale) {
		return new Response('Não foi possível gerar o sitemap agora.\n', {
			status: 503,
			headers: {
				'content-type': 'text/plain; charset=utf-8',
				'cache-control': 'no-store'
			}
		});
	}

	const products = toShowcase(result.items);
	const categoryUrls = categoryPagesWithProducts(products).map((category) =>
		new URL(`/categoria/${category.slug}`, PUBLIC_SITE_URL).toString()
	);
	const locations = [PUBLIC_SITE_URL, ...categoryUrls]
		.map((url) => `\t<url>\n\t\t<loc>${escapeXml(url)}</loc>\n\t</url>`)
		.join('\n');
	const cacheControl =
		!SHOW_DEMO_DATA && (result.failed || result.stale)
			? 'no-store'
			: 'public, max-age=0, s-maxage=300';

	return new Response(
		`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${locations}\n</urlset>\n`,
		{
			headers: {
				'content-type': 'application/xml; charset=utf-8',
				'cache-control': cacheControl
			}
		}
	);
}
