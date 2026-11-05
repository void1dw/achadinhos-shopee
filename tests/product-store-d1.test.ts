import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createTestPlatformProxy } from './helpers/d1.ts';
import {
	getProductById,
	getProductShopeeLink,
	insertMissingProducts,
	insertProduct,
	linkProductToShopee,
	listProducts,
	productsDiffer,
	unlinkProductFromShopee,
	updateProduct
} from '../src/lib/server/product-store.ts';
import type { Product } from '../src/lib/types.ts';

function uniqueSuffix(): string {
	const random = new Uint32Array(2);
	crypto.getRandomValues(random);
	return `${random[0]}${random[1]}`;
}

test('D1 products repository', async (context) => {
	const platform = await createTestPlatformProxy();
	const db = platform.env.CANDIDATES_DB;
	const ids: string[] = [];
	try {
		const suffix = uniqueSuffix();
		const newId = (label: string) => {
			const id = `test-${label}-${suffix}`;
			ids.push(id);
			return id;
		};
		const base = (id: string, values: Partial<Product> = {}): Product => ({
			id,
			name: 'Produto de teste',
			price: 19.9,
			category: 'Casa',
			image: 'https://example.com/a.jpg',
			url: 'https://example.com/a',
			...values
		});
		const rejects = (promise: Promise<unknown>) => assert.rejects(promise);

		try {
			await context.test(
				'inserts and reads required-only products without optional keys',
				async () => {
					const id = newId('min');
					const stored = await insertProduct(db, base(id));
					assert.deepEqual(stored, base(id));
					assert.deepEqual(await getProductById(db, id), base(id));
					assert.equal(await getProductById(db, `${id}-missing`), null);
				}
			);

			await context.test('preserves optional fields', async () => {
				const id = newId('full');
				const full = base(id, {
					priceMax: 29.9,
					previousPrice: 39.9,
					previousPriceMax: 49.9,
					categoryId: 'casa',
					autoRule: 'regra-x',
					publishedAt: '2024-05-01T10:00:00.000Z'
				});
				assert.deepEqual(await insertProduct(db, full), full);
			});

			await context.test('updates without duplicating and keeps the legacy id', async () => {
				const id = newId('upd');
				await insertProduct(db, base(id));
				const updated = await updateProduct(
					db,
					base(id, { name: 'Novo nome', price: 9.5, categoryId: 'casa' })
				);
				assert.equal(updated?.id, id);
				assert.equal(updated?.name, 'Novo nome');
				assert.equal(updated?.price, 9.5);
				const count = await db
					.prepare('SELECT COUNT(*) AS total FROM products WHERE id = ?')
					.bind(id)
					.first<{ total: number }>();
				assert.equal(count?.total, 1);
				assert.equal(await updateProduct(db, base(`${id}-missing`)), null);
			});

			await context.test('lists by most recent publication', async () => {
				const older = newId('old');
				const newer = newId('new');
				await insertProduct(db, base(older, { publishedAt: '2020-01-01T00:00:00.000Z' }));
				await insertProduct(db, base(newer, { publishedAt: '2099-01-01T00:00:00.000Z' }));
				const listed = (await listProducts(db)).map((product) => product.id);
				assert.ok(listed.indexOf(newer) < listed.indexOf(older));
			});

			await context.test('links, unlinks and rejects duplicate Shopee links', async () => {
				const first = newId('lnk1');
				const second = newId('lnk2');
				await insertProduct(db, base(first));
				await insertProduct(db, base(second));
				const itemId = `9${suffix.slice(0, 15)}`;
				const shopId = `8${suffix.slice(0, 15)}`;

				assert.equal(await linkProductToShopee(db, first, itemId, shopId), true);
				assert.deepEqual(await getProductShopeeLink(db, first), { itemId, shopId });
				assert.equal(await linkProductToShopee(db, first, itemId, shopId), true);
				assert.deepEqual(await getProductShopeeLink(db, first), { itemId, shopId });
				const otherItem = `7${suffix.slice(0, 15)}`;
				const otherShop = `6${suffix.slice(0, 15)}`;
				await rejects(linkProductToShopee(db, first, otherItem, otherShop));
				await rejects(linkProductToShopee(db, first, otherItem, shopId));
				await rejects(linkProductToShopee(db, first, itemId, otherShop));
				assert.deepEqual(await getProductShopeeLink(db, first), { itemId, shopId });
				await rejects(linkProductToShopee(db, second, itemId, shopId));
				assert.equal(await getProductShopeeLink(db, second), null);
				await rejects(linkProductToShopee(db, second, 'abc', shopId));
				assert.equal(await linkProductToShopee(db, `${first}-missing`, itemId, shopId), false);

				assert.equal(await unlinkProductFromShopee(db, first), true);
				assert.equal(await getProductShopeeLink(db, first), null);
				assert.equal(await linkProductToShopee(db, second, itemId, shopId), true);
			});

			await context.test(
				'productsDiffer detects changes and update keeps the Shopee link',
				async () => {
					const id = newId('diff');
					const original = base(id);
					await insertProduct(db, original);
					assert.equal(productsDiffer(original, { ...original }), false);
					assert.equal(productsDiffer(original, { ...original, price: original.price + 1 }), true);
					assert.equal(
						productsDiffer(original, { ...original, url: 'https://s.shopee.com.br/x' }),
						true
					);
					const itemId = `5${suffix.slice(0, 15)}`;
					const shopId = `4${suffix.slice(0, 15)}`;
					await linkProductToShopee(db, id, itemId, shopId);
					const updated = await updateProduct(db, { ...original, price: original.price + 1 });
					assert.equal(updated?.price, original.price + 1);
					assert.deepEqual(await getProductShopeeLink(db, id), { itemId, shopId });
				}
			);

			await context.test('rejects item_id without shop_id at the database level', async () => {
				const id = newId('half');
				await insertProduct(db, base(id));
				await rejects(
					db.prepare('UPDATE products SET item_id = ? WHERE id = ?').bind('123', id).run()
				);
				await rejects(
					db.prepare('UPDATE products SET shop_id = ? WHERE id = ?').bind('123', id).run()
				);
			});

			await context.test('enforces price constraints', async () => {
				await rejects(insertProduct(db, base(newId('p0'), { price: 0 })));
				await rejects(insertProduct(db, base(newId('pneg'), { price: -1 })));
				await rejects(insertProduct(db, base(newId('pmax'), { price: 10, priceMax: 9 })));
				await rejects(insertProduct(db, base(newId('prev0'), { previousPrice: 0 })));
				await rejects(insertProduct(db, base(newId('prevmax'), { previousPriceMax: -5 })));
				await insertProduct(db, base(newId('peq'), { price: 10, priceMax: 10 }));
				for (const id of ids.filter((value) => /-(p0|pneg|pmax|prev0|prevmax)-/.test(value))) {
					assert.equal(await getProductById(db, id), null);
				}
			});
		} finally {
			for (const id of ids) await db.prepare('DELETE FROM products WHERE id = ?').bind(id).run();
		}
	} finally {
		await platform.dispose();
	}
});

const product = (id: string, price = 10): Product => ({
	id,
	name: 'Produto de importação',
	price,
	category: 'Casa',
	image: 'https://example.com/i.jpg',
	url: 'https://example.com/i'
});

test('insertMissingProducts: duplicados, existentes e lote falho (D1 descartável)', async () => {
	const platform = await createTestPlatformProxy();
	const db = platform.env.CANDIDATES_DB;
	try {
		await insertProduct(db, product('existing'));
		const first = await insertMissingProducts(db, [
			product('existing', 99),
			product('new-1'),
			product('new-1'),
			product('new-2')
		]);
		assert.deepEqual(first, { inserted: 2, ignored: 2, failed: 0 });
		assert.equal((await getProductById(db, 'existing'))?.price, 10);

		// O lote de 25 com um preço inválido é revertido por inteiro; o lote seguinte é gravado.
		const many = Array.from({ length: 30 }, (_, index) =>
			product(`bulk-${index}`, index === 3 ? 0 : 10)
		);
		const outcome = await insertMissingProducts(db, many);
		assert.deepEqual(outcome, { inserted: 5, ignored: 0, failed: 25 });
		const stored = new Set((await listProducts(db)).map((item) => item.id));
		assert.equal(stored.has('bulk-3'), false);
		assert.equal(stored.has('bulk-0'), false);
		assert.equal(stored.has('bulk-29'), true);
	} finally {
		await platform.dispose();
	}
});

function reconcilingDb(options: { persisted: string[]; reconcileFails?: boolean }) {
	const statement = {
		bind() {
			return statement;
		},
		async all() {
			return { results: [] };
		}
	};
	const db = {
		prepare(sql: string) {
			if (!sql.includes('WHERE id IN')) return statement;
			return {
				bind() {
					return this;
				},
				async all() {
					if (options.reconcileFails) throw new Error('reconcile down');
					return { results: options.persisted.map((id) => ({ id })) };
				}
			};
		},
		async batch() {
			throw new Error('batch failed');
		}
	} as unknown as D1Database;
	return db;
}

test('insertMissingProducts: reconcilia com o D1 após falha de lote', async () => {
	const original = console.error;
	console.error = () => {};
	try {
		const products = ['a', 'b', 'c'].map((id) => product(id));
		const partial = await insertMissingProducts(reconcilingDb({ persisted: ['a', 'c'] }), products);
		assert.deepEqual(partial, { inserted: 2, ignored: 0, failed: 1 });

		const none = await insertMissingProducts(reconcilingDb({ persisted: [] }), products);
		assert.deepEqual(none, { inserted: 0, ignored: 0, failed: 3 });

		const unknown = await insertMissingProducts(
			reconcilingDb({ persisted: ['a'], reconcileFails: true }),
			products
		);
		assert.deepEqual(unknown, { inserted: 0, ignored: 0, failed: 3 });
	} finally {
		console.error = original;
	}
});
