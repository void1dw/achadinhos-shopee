import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { handle } from '../src/hooks.server.ts';
import { PUBLIC_SITE_URL } from '../src/lib/config.ts';
import { GET as robots } from '../src/routes/robots.txt/+server.ts';

type HandleInput = Parameters<typeof handle>[0];

async function run(url: string, method = 'GET') {
	let resolved = false;
	const event = { url: new URL(url), request: { method } } as unknown as HandleInput['event'];
	const resolve = (async () => {
		resolved = true;
		return new Response('ok');
	}) as unknown as HandleInput['resolve'];
	const response = await handle({ event, resolve });
	return { response, resolved };
}

test('hook: www redireciona 301 para o domínio raiz preservando caminho e query', async () => {
	const { response, resolved } = await run(
		'https://www.achadinhoslia.com.br/categoria/casa?sub=cozinha&utm_source=ig'
	);
	assert.equal(response.status, 301);
	assert.equal(
		response.headers.get('location'),
		'https://achadinhoslia.com.br/categoria/casa?sub=cozinha&utm_source=ig'
	);
	assert.equal(response.headers.get('cache-control'), 'no-store');
	assert.equal(resolved, false);
});

test('hook: HEAD também redireciona; POST em www segue sem redirecionar', async () => {
	assert.equal((await run('https://www.achadinhoslia.com.br/', 'HEAD')).response.status, 301);
	const post = await run('https://www.achadinhoslia.com.br/admin/login', 'POST');
	assert.equal(post.resolved, true);
	assert.equal(post.response.status, 200);
});

test('hook: domínio raiz e workers.dev não são redirecionados', async () => {
	for (const url of ['https://achadinhoslia.com.br/', 'https://achadinholia.x.workers.dev/']) {
		const { response, resolved } = await run(url);
		assert.equal(resolved, true);
		assert.equal(response.status, 200);
	}
});

test('hook: /admin e subrotas recebem noindex, e a vitrine não', async () => {
	for (const path of ['/admin', '/admin/login', '/admin/realtime']) {
		const { response } = await run(`https://achadinhoslia.com.br${path}`);
		assert.equal(response.headers.get('x-robots-tag'), 'noindex, nofollow', path);
	}
	const home = await run('https://achadinhoslia.com.br/');
	assert.equal(home.response.headers.get('x-robots-tag'), null);
});

test('hook: http no domínio de produção redireciona 301 para https na raiz, preservando caminho e query', async () => {
	for (const host of ['achadinhoslia.com.br', 'www.achadinhoslia.com.br']) {
		const { response, resolved } = await run(`http://${host}/catalogo?pagina=2`);
		assert.equal(response.status, 301);
		assert.equal(
			response.headers.get('location'),
			'https://achadinhoslia.com.br/catalogo?pagina=2'
		);
		assert.equal(response.headers.get('cache-control'), 'no-store');
		assert.equal(resolved, false);
	}
	// localhost em http (dev) e métodos não idempotentes não são redirecionados.
	assert.equal((await run('http://localhost:5173/')).resolved, true);
	assert.equal((await run('http://achadinhoslia.com.br/api/x', 'POST')).resolved, true);
});

test('hook: HSTS só em https no domínio de produção, sem includeSubDomains/preload', async () => {
	const prod = await run('https://achadinhoslia.com.br/');
	assert.equal(prod.response.headers.get('strict-transport-security'), 'max-age=15552000');
	assert.equal(
		(await run('https://localhost/')).response.headers.get('strict-transport-security'),
		null
	);
	assert.equal(
		(await run('https://achadinholia.x.workers.dev/')).response.headers.get(
			'strict-transport-security'
		),
		null
	);
});

test('hook: workers.dev recebe noindex sem ser redirecionado', async () => {
	const { response, resolved } = await run('https://achadinholia.x.workers.dev/categoria/casa');
	assert.equal(resolved, true);
	assert.equal(response.headers.get('x-robots-tag'), 'noindex, nofollow');
	assert.equal(response.headers.get('cache-control'), 'no-store');
});

test('hook: domínio oficial não recebe no-store nem noindex do hook', async () => {
	const { response } = await run('https://achadinhoslia.com.br/categoria/casa');
	assert.equal(response.headers.get('cache-control'), null);
	assert.equal(response.headers.get('x-robots-tag'), null);
});

test('robots.txt aponta o sitemap do domínio oficial', async () => {
	const body = await robots().text();
	assert.match(body, /^User-agent: \*/);
	assert.match(body, /^Disallow: \/admin$/m);
	assert.match(body, /Sitemap: https:\/\/achadinhoslia\.com\.br\/sitemap\.xml$/m);
	assert.equal(PUBLIC_SITE_URL, 'https://achadinhoslia.com.br/');
});

test('o domínio oficial é consistente: sem workers.dev nem grafias erradas em src/ e docs/', () => {
	const root = fileURLToPath(new URL('..', import.meta.url));
	const files: string[] = [];
	const walk = (dir: string) => {
		for (const entry of readdirSync(dir, { withFileTypes: true })) {
			const full = join(dir, entry.name);
			if (entry.isDirectory()) walk(full);
			else if (/\.(ts|svelte|html|md)$/.test(entry.name)) files.push(full);
		}
	};
	walk(join(root, 'src'));
	walk(join(root, 'docs'));

	for (const file of files) {
		const text = readFileSync(file, 'utf8');
		// canonical-host.ts precisa citar o sufixo para marcar esses hosts como noindex.
		if (!file.endsWith('canonical-host.ts')) {
			assert.doesNotMatch(text, /\.workers\.dev/, `${file} referencia workers.dev`);
		}
		assert.doesNotMatch(text, /achadinholia\.com/, `${file} usa grafia errada do domínio`);
	}
});
