/* eslint-disable @typescript-eslint/no-explicit-any -- dados serializados de loaders sem tipo estático */
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { env } from '../scripts/cloudflare-workers-stub.mjs';
import { PUBLIC_SITE_URL } from '../src/lib/config.ts';
import { demoProducts } from '../src/lib/data/demo-data.ts';
import { achadinhoShowcase, loadFeed, publicCacheControl } from '../src/lib/server/feed.ts';
import { loadPublicPageUrls } from '../src/lib/server/public-pages.ts';
import { toProduct, type ProductRow } from '../src/lib/server/product-store.ts';
import { load as loadHome } from '../src/routes/+page.server.ts';
import { GET as getProducts } from '../src/routes/api/produtos/+server.ts';
import { load as loadCatalog } from '../src/routes/catalogo/+page.server.ts';
import { load as loadCategory } from '../src/routes/categoria/[slug]/+page.server.ts';
import { GET as getSitemap } from '../src/routes/sitemap-paginas.xml/+server.ts';

function row(id: string, overrides: Partial<ProductRow> = {}): ProductRow {
	return {
		id,
		name: `Produto ${id}`,
		category: 'Eletrônicos',
		category_id: null,
		auto_rule: null,
		price: 50,
		price_max: null,
		previous_price: 100,
		previous_price_max: null,
		image: `https://img.example/${id}.jpg`,
		url: `https://s.shopee.com.br/${id}`,
		published_at: '2026-10-20',
		item_id: '123',
		shop_id: '456',
		...overrides
	};
}

const ROWS: ProductRow[] = [
	...['a', 'b', 'c', 'd', 'e', 'f'].map((id, index) =>
		row(id, { published_at: `2026-10-${10 + index}` })
	),
	row('plain', { previous_price: null, price_max: 60 })
];

type FakeDb = { db: D1Database; queries: string[] };

function fakeD1(rows: ProductRow[] | Error): FakeDb {
	const queries: string[] = [];
	const db = {
		prepare(sql: string) {
			queries.push(sql);
			return {
				async all() {
					if (rows instanceof Error) throw rows;
					return { results: rows };
				}
			};
		}
	} as unknown as D1Database;
	return { db, queries };
}

function event(db: D1Database | undefined, extra: Record<string, unknown> = {}) {
	const headers: Record<string, string> = {};
	// Os loaders leem o D1 por 'cloudflare:workers' (stub de testes).
	(env as Record<string, unknown>).CANDIDATES_DB = db;
	return {
		headers,
		event: {
			setHeaders: (values: Record<string, string>) => Object.assign(headers, values),
			url: new URL('https://achadinhoslia.com.br/'),
			params: {},
			fetch: () => {
				throw new Error('Nenhuma rota pública pode buscar a planilha.');
			},
			...extra
		} as never
	};
}

test('loadFeed devolve os produtos do D1 pelo mapeamento existente, sem perdas', async () => {
	const { db, queries } = fakeD1(ROWS);
	const feed = await loadFeed(db, { demo: false });
	assert.equal(feed.unavailable, false);
	assert.deepEqual(feed.products, ROWS.map(toProduct));
	assert.equal(feed.products.length, ROWS.length);
	assert.equal(queries.length, 1);
	assert.match(queries[0], /FROM products/);
});

test('loadFeed não usa cache em memória: cada leitura consulta o D1', async () => {
	const { db, queries } = fakeD1(ROWS);
	await loadFeed(db, { demo: false });
	await loadFeed(db, { demo: false });
	assert.equal(queries.length, 2);
});

test('D1 ausente ou com erro é indisponibilidade explícita, sem fallback', async () => {
	const original = console.error;
	console.error = () => {};
	try {
		assert.deepEqual(await loadFeed(undefined, { demo: false }), {
			products: [],
			unavailable: true
		});
		assert.deepEqual(await loadFeed(null, { demo: false }), { products: [], unavailable: true });
		assert.deepEqual(await loadFeed(fakeD1(new Error('d1 down')).db, { demo: false }), {
			products: [],
			unavailable: true
		});
	} finally {
		console.error = original;
	}
});

test('modo demo funciona sem D1 e sem consultá-lo', async () => {
	const { db, queries } = fakeD1(ROWS);
	assert.deepEqual(await loadFeed(undefined, { demo: true }), {
		products: demoProducts,
		unavailable: false
	});
	assert.deepEqual((await loadFeed(db, { demo: true })).products, demoProducts);
	assert.equal(queries.length, 0);
});

test('cache: 5 minutos no CDN, no-store quando indisponível', () => {
	assert.equal(publicCacheControl(false), 'public, max-age=0, s-maxage=300');
	assert.equal(publicCacheControl(true), 'no-store');
});

test('home carrega do D1', async () => {
	const { db } = fakeD1(ROWS);
	const { event: e, headers } = event(db);
	const data = (await loadHome(e)) as Record<string, any>;
	assert.equal(data.productsUnavailable, false);
	assert.equal(data.total, 6);
	assert.deepEqual(data.counts, { catalog: 7, achadinhos: 6 });
	assert.equal(data.products[0].id, 'f');
	assert.equal(headers['cache-control'], 'public, max-age=0, s-maxage=300');
	assert.equal('sheetsUnavailable' in data, false);
});

test('home sem D1 sinaliza indisponibilidade e no-store', async () => {
	const { event: e, headers } = event(undefined);
	const data = (await loadHome(e)) as Record<string, any>;
	assert.equal(data.productsUnavailable, true);
	assert.equal(data.total, 0);
	assert.equal(headers['cache-control'], 'no-store');
});

test('catálogo carrega do D1 incluindo produtos fora dos Achadinhos', async () => {
	const { db } = fakeD1(ROWS);
	const { event: e, headers } = event(db);
	const data = (await loadCatalog(e)) as Record<string, any>;
	assert.equal(data.unavailable, false);
	assert.equal(data.total, 7);
	assert.deepEqual(data.counts, { catalog: 7, achadinhos: 6 });
	assert.equal(headers['cache-control'], 'public, max-age=0, s-maxage=300');
});

test('catálogo com erro de consulta fica indisponível', async () => {
	const original = console.error;
	console.error = () => {};
	try {
		const { event: e, headers } = event(fakeD1(new Error('boom')).db);
		const data = (await loadCatalog(e)) as Record<string, any>;
		assert.equal(data.unavailable, true);
		assert.equal(data.total, 0);
		assert.equal(headers['cache-control'], 'no-store');
	} finally {
		console.error = original;
	}
});

test('categoria carrega do D1', async () => {
	const { db } = fakeD1(ROWS);
	const { event: e, headers } = event(db, { params: { slug: 'eletronicos' } });
	const data = (await loadCategory(e)) as Record<string, any>;
	assert.equal(data.productsUnavailable, false);
	assert.equal(data.total, 6);
	assert.equal(data.indexable, true);
	assert.equal(data.empty, false);
	assert.equal(headers['cache-control'], 'public, max-age=0, s-maxage=300');
});

test('categoria sem D1 fica indisponível, não indexável como vazia e sem cache', async () => {
	const { event: e, headers } = event(undefined, { params: { slug: 'eletronicos' } });
	const data = (await loadCategory(e)) as Record<string, any>;
	assert.equal(data.productsUnavailable, true);
	assert.equal(data.empty, false);
	assert.equal(headers['cache-control'], 'no-store');
});

test('/api/produtos usa o D1 e mantém o formato e o filtro de categoria', async () => {
	const { db } = fakeD1(ROWS);
	const all = await getProducts(
		event(db, { url: new URL('https://achadinhoslia.com.br/api/produtos') }).event
	);
	assert.equal(all.status, 200);
	assert.equal(all.headers.get('x-robots-tag'), 'noindex');
	assert.equal(all.headers.get('cache-control'), 'public, max-age=60, s-maxage=300');
	const items = (await all.json()) as Array<Record<string, any>>;
	const expected = achadinhoShowcase(ROWS.map(toProduct));
	assert.equal(items.length, 6);
	assert.deepEqual(
		items.map((item) => item.id),
		['f', 'e', 'd', 'c', 'b', 'a']
	);
	assert.deepEqual(
		items.slice().sort((x, y) => x.id.localeCompare(y.id)),
		JSON.parse(JSON.stringify(expected)).sort((x: any, y: any) => x.id.localeCompare(y.id))
	);

	const filtered = await getProducts(
		event(db, { url: new URL('https://achadinhoslia.com.br/api/produtos?categoria=eletronicos') })
			.event
	);
	assert.equal(((await filtered.json()) as unknown[]).length, 6);
	const other = await getProducts(
		event(db, { url: new URL('https://achadinhoslia.com.br/api/produtos?categoria=casa') }).event
	);
	assert.equal(((await other.json()) as unknown[]).length, 0);
});

test('/api/produtos responde 503 no-store sem D1', async () => {
	const response = await getProducts(
		event(undefined, { url: new URL('https://achadinhoslia.com.br/api/produtos') }).event
	);
	assert.equal(response.status, 503);
	assert.equal(response.headers.get('cache-control'), 'no-store');
});

test('sitemap usa o D1 e inclui categorias elegíveis', async () => {
	const { db } = fakeD1(ROWS);
	const response = await getSitemap(event(db).event);
	assert.equal(response.status, 200);
	const xml = await response.text();
	assert.match(xml, /categoria\/eletronicos/);
	assert.match(xml, /achadinhoslia\.com\.br\/catalogo/);
	const urls = await loadPublicPageUrls(db, { demo: false });
	assert.ok(urls?.includes(new URL('/categoria/eletronicos', PUBLIC_SITE_URL).toString()));
});

test('sitemap sem D1 ou com erro devolve 503 no-store, sem gerar sitemap parcial', async () => {
	const original = console.error;
	console.error = () => {};
	try {
		for (const db of [undefined, fakeD1(new Error('boom')).db]) {
			const response = await getSitemap(event(db).event);
			assert.equal(response.status, 503);
			assert.equal(response.headers.get('cache-control'), 'no-store');
		}
		assert.equal(await loadPublicPageUrls(undefined, { demo: false }), null);
	} finally {
		console.error = original;
	}
});

test('sitemap em modo demo funciona sem D1', async () => {
	const urls = await loadPublicPageUrls(undefined, { demo: true });
	assert.ok(urls?.includes(PUBLIC_SITE_URL));
});

function sourceFiles(dir: string): string[] {
	return readdirSync(dir).flatMap((name) => {
		const path = join(dir, name);
		if (statSync(path).isDirectory()) return name === 'admin' ? [] : sourceFiles(path);
		return /\.(ts|svelte)$/.test(name) ? [path] : [];
	});
}

test('nenhum consumidor público depende da planilha', () => {
	const files = [
		...sourceFiles('src/routes'),
		'src/lib/server/feed.ts',
		'src/lib/server/public-pages.ts'
	];
	assert.ok(files.length > 5);
	for (const file of files) {
		const content = readFileSync(file, 'utf8');
		assert.doesNotMatch(content, /loadProducts|SHEET_PRODUCTS_CSV_URL|server\/sheets/, file);
	}
});
