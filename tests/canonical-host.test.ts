import assert from 'node:assert/strict';
import { test } from 'node:test';
import { wwwRedirectTarget } from '../src/lib/canonical-host.ts';
import { PUBLIC_SITE_URL } from '../src/lib/config.ts';

test('redireciona www para o domínio raiz preservando caminho e query', () => {
	const url = new URL('https://www.achadinhoslia.com.br/categoria/casa?sub=cozinha');
	assert.equal(
		wwwRedirectTarget(url, 'GET'),
		'https://achadinhoslia.com.br/categoria/casa?sub=cozinha'
	);
});

test('não redireciona domínio raiz, workers.dev, localhost nem métodos não seguros', () => {
	assert.equal(wwwRedirectTarget(new URL('https://achadinhoslia.com.br/'), 'GET'), null);
	assert.equal(wwwRedirectTarget(new URL('https://x.workers.dev/'), 'GET'), null);
	assert.equal(wwwRedirectTarget(new URL('http://localhost:5173/'), 'GET'), null);
	assert.equal(wwwRedirectTarget(new URL('https://www.achadinhoslia.com.br/'), 'POST'), null);
});

test('URL pública oficial usa o domínio próprio', () => {
	assert.equal(PUBLIC_SITE_URL, 'https://achadinhoslia.com.br/');
});
