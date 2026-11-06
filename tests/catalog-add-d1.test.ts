import assert from 'node:assert/strict';
import { test } from 'node:test';
import { insertProduct } from '../src/lib/server/product-store.ts';
import { createD1CallControl } from '../src/lib/server/shopee/call-control.ts';
import { ShopeeApiError } from '../src/lib/server/shopee/client.ts';
import {
	addCandidatesToCatalog,
	buildCatalogAddPreview,
	listCatalogCategories,
	type CatalogAddSelection,
	type Revalidator,
	shopeeRevalidator
} from '../src/lib/server/shopee/catalog-add.ts';
import type { Product } from '../src/lib/types.ts';
import type { ShopeeProductOfferV2 } from '../src/lib/server/shopee/types.ts';
import { createTestPlatformProxy } from './helpers/d1.ts';

const candidateSql = `INSERT INTO candidates (item_id, shop_id, product_name, product_link, offer_link, price_min, price_max, raw_data, status)
	VALUES (?, ?, ?, ?, ?, ?, ?, '{}', ?)`;
const pairKey = (itemId: string, shopId: string) => `${itemId}\u0000${shopId}`;
const candidate = (
	db: D1Database,
	itemId: string,
	shopId: string,
	status = 'approved',
	offerLink: string | null = null,
	productLink = 'https://shopee.com.br/product/3/4'
) =>
	db
		.prepare(candidateSql)
		.bind(itemId, shopId, 'Candidato', productLink, offerLink, '10', '12', status)
		.run();
const offer = (itemId: string, shopId: string, changes: Partial<ShopeeProductOfferV2> = {}) =>
	({
		itemId,
		shopId,
		productName: '  Produto   normalizado  ',
		imageUrl: 'https://img.example.test/photo.jpg',
		priceMin: '10.5',
		priceMax: '12.75',
		offerLink: 'https://s.shopee.com.br/affiliate',
		productLink: `https://shopee.com.br/product/${shopId}/${itemId}`,
		...changes
	}) as unknown as ShopeeProductOfferV2;
const revalidator =
	(nodes: ShopeeProductOfferV2[]): Revalidator =>
	async () =>
		new Map(nodes.map((node) => [pairKey(String(node.itemId), String(node.shopId)), node]));
const product = (id: string, url: string, link?: { itemId: string; shopId: string }): Product => ({
	id,
	name: 'Existing',
	category: 'Casa',
	price: 4,
	image: 'https://img.example.test/existing.jpg',
	url,
	...(link ? { publishedAt: '2026-01-01' } : {})
});

async function setup() {
	const platform = await createTestPlatformProxy();
	const db = platform.env.CANDIDATES_DB;
	const random = new Uint32Array(2);
	crypto.getRandomValues(random);
	const base = `${10000 + (random[0] % 90000)}${10000 + (random[1] % 90000)}`;
	const shopId = `8${random[1]}`;
	const id = (index: number) => `${base}${index}`;
	await insertProduct(db, product(`seed-${base}`, `https://example.test/seed-${base}`));
	return { platform, db, base, shopId, id };
}

test('adds an approved offer to D1 with Shopee ids and mapped fields', async () => {
	const { platform, db, base, shopId, id } = await setup();
	const itemId = id(1);
	const offerLink = `https://s.shopee.com.br/affiliate-${base}`;
	try {
		await candidate(db, itemId, shopId, 'approved', offerLink);
		const preview = await buildCatalogAddPreview(
			db,
			[{ itemId, shopId, category: 'Casa' }],
			revalidator([offer(itemId, shopId, { offerLink, priceMin: '10.5', priceMax: '12.75' })]),
			new Date('2026-02-03T12:00:00Z')
		);
		assert.equal(preview.items.length, 1);
		const result = await addCandidatesToCatalog(db, preview.items);
		assert.equal(result.added, 1);
		assert.deepEqual(result.failed, []);
		const stored = await db
			.prepare(
				'SELECT id, name, category, price, price_max, image, url, published_at, item_id, shop_id FROM products WHERE id = ?'
			)
			.bind(`shopee-${shopId}-${itemId}`)
			.first<Record<string, unknown>>();
		assert.deepEqual(stored, {
			id: `shopee-${shopId}-${itemId}`,
			name: 'Produto normalizado',
			category: 'Casa',
			price: 10.5,
			price_max: 12.75,
			image: 'https://img.example.test/photo.jpg',
			url: offerLink,
			published_at: '2026-02-03',
			item_id: itemId,
			shop_id: shopId
		});
		const repeated = await addCandidatesToCatalog(db, preview.items);
		assert.equal(repeated.added, 0);
		assert.equal(repeated.failed[0]?.code, 'UNIQUE_CONFLICT');
	} finally {
		await db.prepare('DELETE FROM candidates WHERE shop_id = ?').bind(shopId).run();
		await db.prepare('DELETE FROM products WHERE id LIKE ?').bind(`%${base}%`).run();
		await platform.dispose();
	}
});

test('preview blocks unsafe, duplicate, and already-catalogued selections', async () => {
	const { platform, db, base, shopId, id } = await setup();
	const names = {
		pending: id(1),
		plain: id(2),
		gone: id(3),
		invalidCategory: id(4),
		pair: id(5),
		url: id(6),
		productId: id(7),
		uncertain: id(8),
		duplicate: id(9)
	};
	const pairOfferUrl = `https://s.shopee.com.br/pair-${base}`;
	const urlOfferUrl = `https://s.shopee.com.br/url-${base}`;
	const idOfferUrl = `https://s.shopee.com.br/id-${base}`;
	const uncertainOfferUrl = `https://s.shopee.com.br/uncertain-${base}`;
	const duplicateOfferUrl = `https://s.shopee.com.br/duplicate-${base}`;
	try {
		await candidate(
			db,
			names.pending,
			shopId,
			'pending',
			`https://s.shopee.com.br/pending-${base}`
		);
		await candidate(
			db,
			names.plain,
			shopId,
			'approved',
			`https://shopee.com.br/product/${shopId}/${names.plain}`,
			`https://shopee.com.br/product/${shopId}/${names.plain}`
		);
		await candidate(db, names.gone, shopId);
		await candidate(
			db,
			names.invalidCategory,
			shopId,
			'approved',
			`https://s.shopee.com.br/category-${base}`
		);
		await candidate(db, names.pair, shopId, 'approved', pairOfferUrl);
		await candidate(db, names.url, shopId, 'approved', urlOfferUrl);
		await candidate(db, names.productId, shopId, 'approved', idOfferUrl);
		await candidate(db, names.uncertain, shopId, 'approved', uncertainOfferUrl);
		await candidate(db, names.duplicate, shopId, 'approved', duplicateOfferUrl);
		await insertProduct(db, {
			...product(`pair-${base}`, `https://example.test/pair-${base}`),
			item_id: undefined
		} as Product);
		await db
			.prepare('UPDATE products SET item_id = ?, shop_id = ? WHERE id = ?')
			.bind(names.pair, shopId, `pair-${base}`)
			.run();
		await insertProduct(db, product(`url-${base}`, urlOfferUrl));
		await insertProduct(
			db,
			product(`shopee-${shopId}-${names.productId}`, `https://example.test/id-${base}`)
		);
		await insertProduct(db, product(`uncertain-${base}`, `https://example.test/uncertain-${base}`));
		await db
			.prepare(
				`INSERT INTO product_audits (product_id, status, match_level, item_id, shop_id, sheet_price, verified_at, detail)
			VALUES (?, 'uncertain', 'name_search', ?, ?, 4, '2026-01-01', ?)`
			)
			.bind(
				`uncertain-${base}`,
				names.uncertain,
				shopId,
				JSON.stringify({ itemId: names.uncertain, shopId })
			)
			.run();
		const selections: CatalogAddSelection[] = [
			{ itemId: names.pending, shopId, category: 'Casa' },
			{ itemId: names.plain, shopId, category: 'Casa' },
			{ itemId: names.gone, shopId, category: 'Casa' },
			{ itemId: names.invalidCategory, shopId, category: 'Nova' },
			{ itemId: names.pair, shopId, category: 'Casa' },
			{ itemId: names.url, shopId, category: 'Casa' },
			{ itemId: names.productId, shopId, category: 'Casa' },
			{ itemId: names.uncertain, shopId, category: 'Casa' },
			{ itemId: names.duplicate, shopId, category: 'Casa' },
			{ itemId: names.duplicate, shopId, category: 'Casa' }
		];
		const fresh = [
			offer(names.pending, shopId),
			offer(names.plain, shopId, {
				offerLink: `https://shopee.com.br/product/${shopId}/${names.plain}`
			}),
			offer(names.invalidCategory, shopId),
			offer(names.pair, shopId),
			offer(names.url, shopId, { offerLink: urlOfferUrl }),
			offer(names.productId, shopId),
			offer(names.uncertain, shopId),
			offer(names.duplicate, shopId, { offerLink: duplicateOfferUrl })
		];
		const preview = await buildCatalogAddPreview(db, selections, revalidator(fresh));
		const codes = Object.fromEntries(preview.blocked.map((block) => [block.itemId, block.code]));
		assert.equal(codes[names.pending], 'NOT_APPROVED');
		assert.equal(codes[names.plain], 'PLAIN_PRODUCT_LINK');
		assert.equal(codes[names.gone], 'UNAVAILABLE');
		assert.equal(codes[names.invalidCategory], 'INVALID_CATEGORY');
		assert.equal(codes[names.pair], 'ALREADY_IN_CATALOG');
		assert.equal(codes[names.url], 'ALREADY_IN_CATALOG');
		assert.equal(codes[names.productId], 'ALREADY_IN_CATALOG');
		assert.equal(codes[names.uncertain], 'UNCERTAIN_MATCH');
		assert.equal(preview.blocked.filter((block) => block.code === 'DUPLICATE_SELECTION').length, 1);
		assert.equal(preview.items.length, 1);
		assert.deepEqual(await listCatalogCategories(db), ['Casa']);
	} finally {
		await db.prepare('DELETE FROM product_audits WHERE product_id LIKE ?').bind(`%${base}%`).run();
		await db.prepare('DELETE FROM candidates WHERE shop_id = ?').bind(shopId).run();
		await db.prepare('DELETE FROM products WHERE id LIKE ?').bind(`%${base}%`).run();
		await platform.dispose();
	}
});

test('catalog add revalidates preview hash and reports a racing unique violation', async () => {
	const { platform, db, base, shopId, id } = await setup();
	const itemId = id(1);
	const url = `https://s.shopee.com.br/race-${base}`;
	try {
		await candidate(db, itemId, shopId, 'approved', url);
		const selection = [{ itemId, shopId, category: 'Casa' }];
		const first = await buildCatalogAddPreview(
			db,
			selection,
			revalidator([offer(itemId, shopId, { offerLink: url, priceMin: '10' })])
		);
		const changed = await buildCatalogAddPreview(
			db,
			selection,
			revalidator([offer(itemId, shopId, { offerLink: url, priceMin: '11' })])
		);
		assert.notEqual(first.hash, changed.hash);
		await insertProduct(
			db,
			product(`shopee-${shopId}-${itemId}`, `https://example.test/race-${base}`)
		);
		const result = await addCandidatesToCatalog(db, first.items);
		assert.equal(result.added, 0);
		assert.equal(result.failed[0]?.code, 'UNIQUE_CONFLICT');
	} finally {
		await db.prepare('DELETE FROM candidates WHERE shop_id = ?').bind(shopId).run();
		await db.prepare('DELETE FROM products WHERE id LIKE ?').bind(`%${base}%`).run();
		await platform.dispose();
	}
});

test('blocks missing candidates, missing affiliate links, and invalid product data', async () => {
	const { platform, db, shopId, id } = await setup();
	const missing = id(1);
	const noLink = id(2);
	const invalid = id(3);
	try {
		await candidate(db, noLink, shopId, 'approved', null);
		await candidate(db, invalid, shopId, 'approved', 'https://s.shopee.com.br/invalid');
		const preview = await buildCatalogAddPreview(
			db,
			[
				{ itemId: missing, shopId, category: 'Casa' },
				{ itemId: noLink, shopId, category: 'Casa' },
				{ itemId: invalid, shopId, category: 'Casa' }
			],
			revalidator([
				offer(noLink, shopId, { offerLink: null }),
				offer(invalid, shopId, {
					offerLink: 'https://s.shopee.com.br/invalid',
					imageUrl: 'http://img.example.test/photo.jpg'
				})
			])
		);
		assert.deepEqual(
			preview.blocked.map((block) => block.code),
			['NOT_FOUND', 'NO_AFFILIATE_LINK', 'INVALID_DATA']
		);
		assert.equal(preview.items.length, 0);
	} finally {
		await db.prepare('DELETE FROM candidates WHERE shop_id = ?').bind(shopId).run();
		await db.prepare('DELETE FROM products WHERE id LIKE ?').bind('%Casa%').run();
		await platform.dispose();
	}
});
