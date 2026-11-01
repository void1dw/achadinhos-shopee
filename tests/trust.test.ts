import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
	GOOGLE_INDEXING_CONFIRMED,
	googleSiteSearchUrl,
	isSecureConnection
} from '../src/lib/trust.ts';

const footer = readFileSync(
	new URL('../src/lib/components/SiteFooter.svelte', import.meta.url),
	'utf8'
);

test('o selo de HTTPS só vale para conexões https', () => {
	assert.equal(isSecureConnection('https:'), true);
	assert.equal(isSecureConnection('http:'), false);
	assert.equal(isSecureConnection(''), false);
});

test('a pesquisa no Google usa o operador site: com o domínio público', () => {
	const url = new URL(googleSiteSearchUrl('https://achadinhoslia.com.br/'));
	assert.equal(url.origin, 'https://www.google.com');
	assert.equal(url.pathname, '/search');
	assert.equal(url.searchParams.get('q'), 'site:achadinhoslia.com.br');
	assert.equal(new URL(googleSiteSearchUrl()).searchParams.get('q'), 'site:achadinhoslia.com.br');
});

test('a menção ao Google está ativa e condicionada à flag de indexação', () => {
	assert.equal(GOOGLE_INDEXING_CONFIRMED, true);
	assert.match(footer, /\{#if GOOGLE_INDEXING_CONFIRMED\}/);
	assert.match(footer, /\{#if secure\}/);
});

test('o rodapé traz os textos de confiança exigidos e nenhuma marca indevida', () => {
	assert.match(footer, /Conexão protegida por HTTPS/);
	assert.match(footer, /Você compra diretamente na Shopee\./);
	assert.match(footer, /podemos receber comissão pelas compras realizadas, sem custo/);
	assert.match(footer, /Este site utiliza serviços da Cloudflare\./);
	assert.match(footer, /Encontre a Achadinhos da Lia na Pesquisa Google\./);
	assert.doesNotMatch(footer, /mercado\s*livre/i);
	assert.doesNotMatch(footer, /certificad|aprovad[oa] pel/i);
});

test('o badge da Cloudflare é o arquivo oficial, sem redimensionar a proporção', () => {
	const png = readFileSync(new URL('../static/cloudflare-badge.png', import.meta.url));
	assert.equal(png.subarray(1, 4).toString('ascii'), 'PNG');
	const [width, height] = [png.readUInt32BE(16), png.readUInt32BE(20)];
	assert.deepEqual([width, height], [761, 264]);
	assert.match(footer, /width="761"\s+height="264"/);
});
