/** Limite do protocolo de sitemaps por arquivo. */
export const SITEMAP_MAX_URLS = 50_000;

const NAMESPACE = 'http://www.sitemaps.org/schemas/sitemap/0.9';

export function escapeXml(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

export function buildUrlset(urls: string[]): string {
	const entries = urls.map((url) => `\t<url>\n\t\t<loc>${escapeXml(url)}</loc>\n\t</url>`);
	return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="${NAMESPACE}">\n${entries.join('\n')}\n</urlset>\n`;
}

export function buildSitemapIndex(sitemapUrls: string[]): string {
	const entries = sitemapUrls.map(
		(url) => `\t<sitemap>\n\t\t<loc>${escapeXml(url)}</loc>\n\t</sitemap>`
	);
	return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="${NAMESPACE}">\n${entries.join('\n')}\n</sitemapindex>\n`;
}

/** Divide uma lista grande em partes que respeitam o limite de URLs por sitemap. */
export function chunkUrls(urls: string[], size = SITEMAP_MAX_URLS): string[][] {
	const chunks: string[][] = [];
	for (let start = 0; start < urls.length; start += size) {
		chunks.push(urls.slice(start, start + size));
	}
	return chunks;
}

/**
 * Sitemaps filhos listados no índice. Páginas individuais de produto, quando existirem,
 * entram aqui como `sitemap-produtos-N.xml` (via chunkUrls) sem mudar a rota /sitemap.xml.
 */
export const PAGES_SITEMAP_PATH = '/sitemap-paginas.xml';

export const SITEMAP_HEADERS = {
	'content-type': 'application/xml; charset=utf-8',
	'cache-control': 'public, max-age=3600, s-maxage=3600'
};
