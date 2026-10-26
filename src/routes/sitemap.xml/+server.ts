import { CATEGORY_PAGES } from '../../lib/category-pages';
import { PUBLIC_SITE_URL } from '../../lib/config';

function escapeXml(value: string): string {
	return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function GET(): Response {
	const categoryUrls = CATEGORY_PAGES.map((category) =>
		new URL(`/categoria/${category.slug}`, PUBLIC_SITE_URL).toString()
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
}
