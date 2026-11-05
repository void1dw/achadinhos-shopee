import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createTestPlatformProxy } from './helpers/d1.ts';
import { insertProduct } from '../src/lib/server/product-store.ts';
import {
	buildPublishPreview,
	listPublishOperations,
	markCandidatesPublished,
	recordPublishOperation,
	type Revalidator
} from '../src/lib/server/shopee/sheet-publish.ts';
import type { ShopeeProductOfferV2 } from '../src/lib/server/shopee/types.ts';

test('D1 publish preview, blocks and operation log', async () => {
	const platform = await createTestPlatformProxy();
	const db = platform.env.CANDIDATES_DB;
	const random = new Uint32Array(2);
	crypto.getRandomValues(random);
	const suffix = `${random[0]}${random[1]}`;
	const shop = `8${random[1]}`;
	const items = {
		ok: `8${random[0]}1`,
		pending: `8${random[0]}2`,
		plain: `8${random[0]}3`,
		gone: `8${random[0]}4`
	};
	const category = 'Casa';
	const productId = `publish-${suffix}`;
	let operationId: number | null = null;
	try {
		await insertProduct(db, {
			id: productId,
			name: 'Produto de teste',
			price: 10,
			category,
			image: 'https://example.com/a.jpg',
			url: `https://s.shopee.com.br/exist${suffix}`
		});

		const add = (item: string, status: string, offer: string | null, product: string) =>
			db
				.prepare(
					`INSERT INTO candidates (item_id, shop_id, product_name, product_link, offer_link, price_min, raw_data, status)
					VALUES (?, ?, 'Nome', ?, ?, '50', '{}', ?)`
				)
				.bind(item, shop, product, offer, status)
				.run();
		await add(
			items.ok,
			'approved',
			`https://s.shopee.com.br/ok${suffix}`,
			`https://shopee.com.br/product/${shop}/${items.ok}`
		);
		await add(
			items.pending,
			'pending',
			`https://s.shopee.com.br/p${suffix}`,
			'https://shopee.com.br/x'
		);
		await add(
			items.plain,
			'approved',
			`https://shopee.com.br/product/${shop}/${items.plain}`,
			`https://shopee.com.br/product/${shop}/${items.plain}`
		);
		await add(
			items.gone,
			'approved',
			`https://s.shopee.com.br/g${suffix}`,
			'https://shopee.com.br/y'
		);

		const node = (item: string, offerLink: string) =>
			({
				itemId: item,
				shopId: shop,
				productName: 'Produto Novo',
				imageUrl: 'https://example.com/n.jpg',
				priceMin: '49.9',
				priceMax: '49.9',
				offerLink,
				productLink: `https://shopee.com.br/product/${shop}/${item}`
			}) as unknown as ShopeeProductOfferV2;
		const revalidate: Revalidator = async () =>
			new Map([
				[`${items.ok}\u0000${shop}`, node(items.ok, `https://s.shopee.com.br/ok${suffix}`)],
				[
					`${items.pending}\u0000${shop}`,
					node(items.pending, `https://s.shopee.com.br/p${suffix}`)
				],
				[
					`${items.plain}\u0000${shop}`,
					node(items.plain, `https://shopee.com.br/product/${shop}/${items.plain}`)
				]
			]);

		const selection = (itemId: string, cat = category) => ({ itemId, shopId: shop, category: cat });
		const preview = await buildPublishPreview(
			db,
			[
				selection(items.ok),
				selection(items.pending),
				selection(items.plain),
				selection(items.gone),
				selection(items.ok)
			],
			revalidate,
			new Date('2026-02-03T12:00:00Z')
		);
		assert.equal(preview.items.length, 1, JSON.stringify(preview.blocked));
		assert.equal(preview.items[0]!.row.price, 'R$ 49,90');
		assert.equal(preview.items[0]!.row.date, '2026-02-03');
		assert.equal(preview.items[0]!.row.url, `https://s.shopee.com.br/ok${suffix}`);
		const codes = Object.fromEntries(preview.blocked.map((b) => [b.itemId, b.code]));
		assert.equal(codes[items.pending], 'NOT_APPROVED');
		assert.equal(codes[items.plain], 'PLAIN_PRODUCT_LINK');
		assert.equal(codes[items.gone], 'UNAVAILABLE');
		assert.equal(preview.blocked.filter((b) => b.code === 'DUPLICATE_SELECTION').length, 1);

		const again = await buildPublishPreview(db, [selection(items.ok)], revalidate);
		assert.equal(again.items.length, 1);
		const invalidCategory = await buildPublishPreview(
			db,
			[selection(items.ok, 'Inexistente')],
			revalidate
		);
		assert.equal(invalidCategory.blocked[0]!.code, 'INVALID_CATEGORY');

		operationId = await recordPublishOperation(db, {
			status: 'completed',
			requestedRows: 1,
			writtenRows: 1,
			payload: []
		});
		await markCandidatesPublished(db, operationId, preview.items);
		const after = await buildPublishPreview(db, [selection(items.ok)], revalidate);
		assert.equal(after.blocked[0]!.code, 'ALREADY_PUBLISHED');
		assert.ok((await listPublishOperations(db, 5)).some((op) => op.id === operationId));
	} finally {
		if (operationId !== null) {
			await db
				.prepare('DELETE FROM sheet_published_candidates WHERE operation_id = ?')
				.bind(operationId)
				.run();
			await db.prepare('DELETE FROM sheet_publish_operations WHERE id = ?').bind(operationId).run();
		}
		await db.prepare('DELETE FROM candidates WHERE shop_id = ?').bind(shop).run();
		await db.prepare('DELETE FROM products WHERE id = ?').bind(productId).run();
		await platform.dispose();
	}
});
