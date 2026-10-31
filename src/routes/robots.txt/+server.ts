import { PUBLIC_SITE_URL } from '../../lib/config';

export function GET(): Response {
	return new Response(
		`User-agent: *\nAllow: /\nDisallow: /admin\n\nSitemap: ${PUBLIC_SITE_URL}sitemap.xml\n`,
		{
			headers: {
				'content-type': 'text/plain; charset=utf-8',
				'cache-control': 'public, max-age=3600'
			}
		}
	);
}
