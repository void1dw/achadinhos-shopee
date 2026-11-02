import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PUBLIC_SITE_URL } from '../src/lib/config.ts';
import {
	buildSitemapIndex,
	buildUrlset,
	chunkUrls,
	escapeXml,
	PAGES_SITEMAP_PATH
} from '../src/lib/sitemap.ts';
import { GET as index } from '../src/routes/sitemap.xml/+server.ts';

test('urlset escapa XML e lista cada URL', () => {
	const xml = buildUrlset(['https://achadinhoslia.com.br/?a=1&b=2']);
	assert.match(xml, /<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/);
	assert.match(xml, /<loc>https:\/\/achadinhoslia\.com\.br\/\?a=1&amp;b=2<\/loc>/);
	assert.equal(escapeXml('<"&>'), '&lt;&quot;&amp;&gt;');
});

test('índice de sitemaps lista os arquivos filhos', () => {
	const xml = buildSitemapIndex(['https://achadinhoslia.com.br/sitemap-paginas.xml']);
	assert.match(xml, /<sitemapindex /);
	assert.match(
		xml,
		/<sitemap>\s*<loc>https:\/\/achadinhoslia\.com\.br\/sitemap-paginas\.xml<\/loc>/
	);
});

test('chunkUrls respeita o limite por arquivo', () => {
	const urls = Array.from({ length: 5 }, (_, i) => `https://achadinhoslia.com.br/${i}`);
	assert.deepEqual(
		chunkUrls(urls, 2).map((part) => part.length),
		[2, 2, 1]
	);
	assert.deepEqual(chunkUrls([]), []);
});

test('/sitemap.xml é um índice que aponta para o sitemap de páginas no domínio oficial', async () => {
	const response = await index();
	const body = await response.text();
	assert.match(response.headers.get('content-type') ?? '', /application\/xml/);
	assert.ok(body.includes(`<loc>${new URL(PAGES_SITEMAP_PATH, PUBLIC_SITE_URL)}</loc>`));
	assert.doesNotMatch(body, /<loc>http:\/\/|workers\.dev/);
});
