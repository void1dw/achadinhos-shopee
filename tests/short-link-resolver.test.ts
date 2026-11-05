import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isShortLinkUrl, resolveShortLink } from '../src/lib/server/shopee/short-link-resolver.ts';

const redirect = (location: string, status = 302) =>
	new Response(null, { status, headers: { location } });

function sequence(...responses: Array<Response | Error>) {
	const urls: string[] = [];
	const inits: Array<RequestInit | undefined> = [];
	const fetcher = (async (url: unknown, init?: RequestInit) => {
		urls.push(String(url));
		inits.push(init);
		const next = responses.shift();
		if (!next) throw new Error('unexpected fetch');
		if (next instanceof Error) throw next;
		return next;
	}) as typeof fetch;
	return { fetcher, urls, inits };
}

test('resolve link curto com redirect manual e extrai itemId/shopId', async () => {
	const { fetcher, urls, inits } = sequence(
		redirect('https://shopee.com.br/opaanlp/123456/789012?utm_source=x')
	);
	const result = await resolveShortLink('https://s.shopee.com.br/abc', { fetcher });
	assert.deepEqual(result, { ok: true, ids: { shopId: '123456', itemId: '789012' } });
	assert.deepEqual(urls, ['https://s.shopee.com.br/abc']);
	assert.equal(inits[0]?.redirect, 'manual');
});

test('não segue um segundo redirecionamento', async () => {
	const { fetcher, urls } = sequence(
		redirect('https://shopee.com.br/universal-link/x'),
		redirect('https://shopee.com.br/opaanlp/11/22')
	);
	assert.deepEqual(await resolveShortLink('https://s.shopee.com.br/abc', { fetcher }), {
		ok: false,
		code: 'ids_not_found'
	});
	assert.equal(urls.length, 1);
});

test('rejeita URLs de entrada inválidas sem requisição', async () => {
	const { fetcher, urls } = sequence();
	for (const url of [
		'http://s.shopee.com.br/abc',
		'https://evil.example/abc',
		'https://s.shopee.com.br.evil.example/abc',
		'https://shopee.com.br/product/1/2',
		'not a url',
		`https://s.shopee.com.br/${'a'.repeat(3000)}`
	]) {
		assert.deepEqual(await resolveShortLink(url, { fetcher }), { ok: false, code: 'invalid_url' });
	}
	assert.equal(urls.length, 0);
	assert.equal(isShortLinkUrl('https://s.shopee.com.br/abc'), true);
});

test('rejeita redirecionamentos para host, protocolo ou formato inválidos', async () => {
	for (const location of [
		'https://evil.example/opaanlp/1/2',
		'https://shopee.com.br.evil.example/opaanlp/1/2',
		'http://shopee.com.br/opaanlp/1/2',
		'https://user:pw@shopee.com.br/opaanlp/1/2',
		'https://shopee.com.br:8443/opaanlp/1/2',
		'ftp://shopee.com.br/opaanlp/1/2'
	]) {
		const { fetcher } = sequence(redirect(location));
		assert.deepEqual(await resolveShortLink('https://s.shopee.com.br/abc', { fetcher }), {
			ok: false,
			code: 'invalid_redirect'
		});
	}
	const noLocation = sequence(new Response(null, { status: 302 }));
	assert.deepEqual(
		await resolveShortLink('https://s.shopee.com.br/abc', { fetcher: noLocation.fetcher }),
		{ ok: false, code: 'invalid_redirect' }
	);
});

test('rejeita IDs inválidos, ausentes e status inesperados', async () => {
	const invalidId = sequence(
		redirect('https://shopee.com.br/opaanlp/0/2'),
		new Response(null, { status: 200 })
	);
	assert.deepEqual(
		await resolveShortLink('https://s.shopee.com.br/a', { fetcher: invalidId.fetcher }),
		{ ok: false, code: 'ids_not_found' }
	);
	const ok200 = sequence(new Response('<html></html>', { status: 200 }));
	assert.deepEqual(
		await resolveShortLink('https://s.shopee.com.br/a', { fetcher: ok200.fetcher }),
		{
			ok: false,
			code: 'ids_not_found'
		}
	);
	const notFound = sequence(new Response(null, { status: 404 }));
	assert.deepEqual(
		await resolveShortLink('https://s.shopee.com.br/a', { fetcher: notFound.fetcher }),
		{ ok: false, code: 'http_404' }
	);
	for (const status of [403, 429]) {
		const blocked = sequence(new Response(null, { status }));
		assert.deepEqual(
			await resolveShortLink('https://s.shopee.com.br/a', { fetcher: blocked.fetcher }),
			{ ok: false, code: `http_${status}` }
		);
	}
});

test('aceita somente os status 301, 302, 303, 307 e 308', async () => {
	for (const status of [301, 302, 303, 307, 308]) {
		const { fetcher } = sequence(redirect('https://shopee.com.br/opaanlp/11/22', status));
		assert.deepEqual(await resolveShortLink('https://s.shopee.com.br/a', { fetcher }), {
			ok: true,
			ids: { shopId: '11', itemId: '22' }
		});
	}
	for (const status of [300, 304, 305, 399, 200, 404, 500]) {
		const { fetcher } = sequence(redirect('https://shopee.com.br/opaanlp/11/22', status));
		const result = await resolveShortLink('https://s.shopee.com.br/a', { fetcher });
		assert.equal(result.ok, false);
	}
});

test('rejeita destino relativo e subdomínios de shopee.com.br', async () => {
	for (const location of [
		'/opaanlp/11/22',
		'//shopee.com.br/opaanlp/11/22',
		'https://www.shopee.com.br/opaanlp/11/22',
		'https://s.shopee.com.br/opaanlp/11/22',
		'https://SHOPEE.COM.BR.evil.example/opaanlp/11/22'
	]) {
		const { fetcher } = sequence(redirect(location));
		assert.deepEqual(await resolveShortLink('https://s.shopee.com.br/a', { fetcher }), {
			ok: false,
			code: 'invalid_redirect'
		});
	}
});

test('classifica timeout e falha de transporte', async () => {
	const hanging = ((_url: unknown, init?: RequestInit) =>
		new Promise((_resolve, reject) => {
			init?.signal?.addEventListener('abort', () =>
				reject(new DOMException('aborted', 'AbortError'))
			);
		})) as typeof fetch;
	assert.deepEqual(
		await resolveShortLink('https://s.shopee.com.br/a', { fetcher: hanging, timeoutMs: 10 }),
		{ ok: false, code: 'timeout' }
	);
	const { fetcher } = sequence(new TypeError('network down'));
	assert.deepEqual(await resolveShortLink('https://s.shopee.com.br/a', { fetcher }), {
		ok: false,
		code: 'request_failed'
	});
});
