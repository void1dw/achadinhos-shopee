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
		const result = await resolveShortLink('https://s.shopee.com.br/abc', { fetcher });
		assert.equal(!result.ok && result.code, 'invalid_redirect');
	}
	const noLocation = sequence(new Response(null, { status: 302 }));
	assert.deepEqual(
		await resolveShortLink('https://s.shopee.com.br/abc', { fetcher: noLocation.fetcher }),
		{ ok: false, code: 'invalid_redirect', detail: 'sem_location' }
	);
});

test('invalid_redirect traz um diagnóstico seguro (só host, nunca caminho/query)', async () => {
	const cases: Array<[string, string]> = [
		['https://evil.example/opaanlp/1/2?token=segredo', 'host:evil.example'],
		['http://shopee.com.br/opaanlp/1/2', 'protocolo_nao_https'],
		['https://shopee.com.br:8443/opaanlp/1/2', 'porta_ou_credenciais'],
		['/opaanlp/1/2', 'location_relativo'],
		[`https://shopee.com.br/opaanlp/1/2?x=${'a'.repeat(9000)}`, 'location_longo']
	];
	for (const [location, detail] of cases) {
		const { fetcher } = sequence(redirect(location));
		assert.deepEqual(await resolveShortLink('https://s.shopee.com.br/abc', { fetcher }), {
			ok: false,
			code: 'invalid_redirect',
			detail
		});
	}
	const long = sequence(redirect(`https://shopee.com.br/opaanlp/1/2?x=${'a'.repeat(3000)}`));
	assert.equal(
		(await resolveShortLink('https://s.shopee.com.br/abc', { fetcher: long.fetcher })).ok,
		true
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
		const result = await resolveShortLink('https://s.shopee.com.br/a', { fetcher });
		assert.equal(result.ok, false);
		assert.equal(!result.ok && result.code, 'invalid_redirect');
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

test('segue a cadeia s.shopee.com.br → shope.ee → shopee.com.br', async () => {
	const { fetcher, urls, inits } = sequence(
		redirect('https://shope.ee/abc123?token=x', 301),
		redirect('https://shopee.com.br/opaanlp/123456/789012?utm=1', 301)
	);
	assert.deepEqual(await resolveShortLink('https://s.shopee.com.br/a', { fetcher }), {
		ok: true,
		ids: { shopId: '123456', itemId: '789012' }
	});
	assert.deepEqual(urls, ['https://s.shopee.com.br/a', 'https://shope.ee/abc123?token=x']);
	assert.ok(inits.every((init) => init?.redirect === 'manual'));
});

test('não extrai IDs de shope.ee e rejeita intermediário que sai do domínio', async () => {
	const ids = sequence(redirect('https://shope.ee/opaanlp/11/22'), new Response(null, { status: 200 }));
	assert.deepEqual(await resolveShortLink('https://s.shopee.com.br/a', { fetcher: ids.fetcher }), {
		ok: false,
		code: 'ids_not_found'
	});
	for (const location of [
		'https://evil.example/opaanlp/11/22?token=segredo',
		'http://shopee.com.br/opaanlp/11/22',
		'https://shopee.com.br:8443/opaanlp/11/22',
		'https://user:pw@shopee.com.br/opaanlp/11/22',
		'/opaanlp/11/22',
		'https://s.shopee.com.br/opaanlp/11/22'
	]) {
		const { fetcher } = sequence(redirect('https://shope.ee/x'), redirect(location));
		const result = await resolveShortLink('https://s.shopee.com.br/a', { fetcher });
		assert.equal(!result.ok && result.code, 'invalid_redirect');
		assert.ok(!JSON.stringify(result).includes('segredo'));
	}
});

test('cadeia com destino final sem IDs retorna ids_not_found', async () => {
	const { fetcher } = sequence(
		redirect('https://shope.ee/x'),
		redirect('https://shopee.com.br/universal-link/x')
	);
	assert.deepEqual(await resolveShortLink('https://s.shopee.com.br/a', { fetcher }), {
		ok: false,
		code: 'ids_not_found'
	});
});

test('limita redirecionamentos: shope.ee → shope.ee não é seguido', async () => {
	const { fetcher, urls } = sequence(
		redirect('https://shope.ee/a'),
		redirect('https://shope.ee/b'),
		redirect('https://shopee.com.br/opaanlp/11/22')
	);
	const result = await resolveShortLink('https://s.shopee.com.br/a', { fetcher });
	assert.equal(!result.ok && result.code, 'invalid_redirect');
	assert.equal(urls.length, 2);
});

test('o intermediário só é aceito no primeiro salto e falhas dele são classificadas', async () => {
	const down = sequence(redirect('https://shope.ee/a'), new Response(null, { status: 403 }));
	assert.deepEqual(await resolveShortLink('https://s.shopee.com.br/a', { fetcher: down.fetcher }), {
		ok: false,
		code: 'http_403'
	});
	const noLoc = sequence(redirect('https://shope.ee/a'), new Response(null, { status: 302 }));
	assert.deepEqual(await resolveShortLink('https://s.shopee.com.br/a', { fetcher: noLoc.fetcher }), {
		ok: false,
		code: 'invalid_redirect',
		detail: 'sem_location'
	});
});

test('o timeout vale para a resolução inteira, não por salto', async () => {
	let calls = 0;
	const slow = ((_url: unknown, init?: RequestInit) => {
		calls += 1;
		if (calls === 1) {
			return new Promise((resolve) => setTimeout(() => resolve(redirect('https://shope.ee/a')), 30));
		}
		return new Promise((_resolve, reject) => {
			init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
		});
	}) as typeof fetch;
	const started = Date.now();
	assert.deepEqual(
		await resolveShortLink('https://s.shopee.com.br/a', { fetcher: slow, timeoutMs: 60 }),
		{ ok: false, code: 'timeout' }
	);
	assert.equal(calls, 2);
	assert.ok(Date.now() - started < 200);
});

test('cancela os corpos das respostas', async () => {
	let cancelled = 0;
	const withBody = (location: string) => {
		const response = redirect(location, 301);
		Object.defineProperty(response, 'body', {
			value: { cancel: async () => void (cancelled += 1) }
		});
		return response;
	};
	const { fetcher } = sequence(
		withBody('https://shope.ee/a'),
		withBody('https://shopee.com.br/opaanlp/11/22')
	);
	assert.equal((await resolveShortLink('https://s.shopee.com.br/a', { fetcher })).ok, true);
	assert.equal(cancelled, 2);
});
test('fetcher que ignora o AbortSignal e responde após o timeout resulta em timeout', async () => {
	let calls = 0;
	const late = (() => {
		calls += 1;
		return new Promise((resolve) =>
			setTimeout(() => resolve(redirect('https://shopee.com.br/opaanlp/11/22', 301)), 50)
		);
	}) as typeof fetch;
	assert.deepEqual(
		await resolveShortLink('https://s.shopee.com.br/a', { fetcher: late, timeoutMs: 10 }),
		{ ok: false, code: 'timeout' }
	);
	assert.equal(calls, 1);
});
