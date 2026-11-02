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

test('o selo de HTTPS é condicionado à conexão e o rodapé não exibe a Pesquisa Google', () => {
	assert.equal(GOOGLE_INDEXING_CONFIRMED, true);
	assert.match(footer, /\{#if secure\}/);
	assert.doesNotMatch(footer, /Pesquisa Google|googleSiteSearchUrl/);
});

test('o rodapé traz os textos de confiança exigidos e nenhuma marca indevida', () => {
	assert.match(footer, /Conexão protegida por HTTPS/);
	assert.match(footer, /Você compra diretamente na Shopee\./);
	assert.match(footer, /Podemos receber comissão pelas compras realizadas, sem custo/);
	assert.doesNotMatch(footer, /mercado\s*livre/i);
	assert.doesNotMatch(footer, /certificad|aprovad[oa] pel/i);
});

test('o rodapé cita a Cloudflare em texto, sem imitar o logotipo', () => {
	assert.match(footer, /serviços da Cloudflare/);
	assert.doesNotMatch(footer, /cloudflare-badge/);
});
