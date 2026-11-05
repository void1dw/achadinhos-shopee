import type { Product } from '../types';

export type ProductShopeeLink = { itemId: string; shopId: string };

export type ProductRow = {
	id: string;
	name: string;
	category: string;
	category_id: string | null;
	auto_rule: string | null;
	price: number;
	price_max: number | null;
	previous_price: number | null;
	previous_price_max: number | null;
	image: string;
	url: string;
	published_at: string | null;
	item_id: string | null;
	shop_id: string | null;
};

const PRODUCT_COLUMNS = `id, name, category, category_id, auto_rule, price, price_max,
	previous_price, previous_price_max, image, url, published_at, item_id, shop_id`;

const SHOPEE_ID_PATTERN = /^[1-9]\d{0,19}$/;

export function toProduct(row: ProductRow): Product {
	const product: Product = {
		id: row.id,
		name: row.name,
		price: row.price,
		category: row.category,
		image: row.image,
		url: row.url
	};
	if (row.price_max !== null) product.priceMax = row.price_max;
	if (row.previous_price !== null) product.previousPrice = row.previous_price;
	if (row.previous_price_max !== null) product.previousPriceMax = row.previous_price_max;
	if (row.category_id !== null) product.categoryId = row.category_id;
	if (row.auto_rule !== null) product.autoRule = row.auto_rule;
	if (row.published_at !== null) product.publishedAt = row.published_at;
	return product;
}

function editableValues(product: Product) {
	return [
		product.name,
		product.category,
		product.categoryId ?? null,
		product.autoRule ?? null,
		product.price,
		product.priceMax ?? null,
		product.previousPrice ?? null,
		product.previousPriceMax ?? null,
		product.image,
		product.url,
		product.publishedAt ?? null
	];
}

function assertShopeeId(value: string, label: string): void {
	if (!SHOPEE_ID_PATTERN.test(value))
		throw new Error(`${label} must be a positive numeric string.`);
}

const INSERT_SQL = `INSERT INTO products
	(id, name, category, category_id, auto_rule, price, price_max, previous_price,
	previous_price_max, image, url, published_at)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

const IMPORT_BATCH_SIZE = 25;

export async function insertProduct(db: D1Database, product: Product): Promise<Product> {
	await db
		.prepare(INSERT_SQL)
		.bind(product.id, ...editableValues(product))
		.run();
	const stored = await getProductById(db, product.id);
	if (!stored) throw new Error('Product was not found after insert.');
	return stored;
}

export async function listProductIds(db: D1Database): Promise<Set<string>> {
	const result = await db.prepare('SELECT id FROM products').all<{ id: string }>();
	return new Set(result.results.map((row) => row.id));
}

/** IDs do lote já presentes no D1; null se a consulta de reconciliação também falhar. */
async function persistedIds(db: D1Database, ids: string[]): Promise<Set<string> | null> {
	try {
		const result = await db
			.prepare(`SELECT id FROM products WHERE id IN (${ids.map(() => '?').join(', ')})`)
			.bind(...ids)
			.all<{ id: string }>();
		return new Set(result.results.map((row) => row.id));
	} catch {
		console.error('Product import reconciliation query failed.');
		return null;
	}
}

/**
 * Insere só IDs que ainda não existem no D1; nunca atualiza registros existentes.
 * Usa INSERT normal: violações de CHECK/NOT NULL/UNIQUE fazem o lote falhar, nunca são ignoradas.
 * `ignored` = produtos já existentes ou duplicados na entrada; `failed` = produtos de lotes que
 * falharam e que, após consulta ao D1, não constam gravados. Se a consulta de reconciliação
 * também falhar, o lote inteiro é contado como falho (sem afirmar que nada foi gravado).
 */
export async function insertMissingProducts(
	db: D1Database,
	products: Product[]
): Promise<{ inserted: number; ignored: number; failed: number }> {
	const existingIds = await listProductIds(db);
	const seen = new Set<string>();
	const missing: Product[] = [];
	let ignored = 0;
	for (const product of products) {
		if (existingIds.has(product.id) || seen.has(product.id)) {
			ignored += 1;
			continue;
		}
		seen.add(product.id);
		missing.push(product);
	}

	const statement = db.prepare(INSERT_SQL);
	let inserted = 0;
	let failed = 0;
	for (let start = 0; start < missing.length; start += IMPORT_BATCH_SIZE) {
		const batch = missing.slice(start, start + IMPORT_BATCH_SIZE);
		try {
			await db.batch(
				batch.map((product) => statement.bind(product.id, ...editableValues(product)))
			);
			inserted += batch.length;
		} catch (error) {
			console.error(
				'Product import batch failed:',
				error instanceof Error ? error.message : String(error)
			);
			// O resultado do lote é incerto; o D1 é a fonte de verdade para separar gravados de falhos.
			const persisted = await persistedIds(
				db,
				batch.map((product) => product.id)
			);
			if (persisted) {
				inserted += persisted.size;
				failed += batch.length - persisted.size;
			} else {
				failed += batch.length;
			}
		}
	}
	return { inserted, ignored, failed };
}

/** True se algum campo editorial difere; ignora o vínculo Shopee, que nunca vem da planilha. */
export function productsDiffer(a: Product, b: Product): boolean {
	const x = editableValues(a);
	const y = editableValues(b);
	return x.some((value, index) => value !== y[index]);
}

export async function getProductById(db: D1Database, id: string): Promise<Product | null> {
	const row = await db
		.prepare(`SELECT ${PRODUCT_COLUMNS} FROM products WHERE id = ?`)
		.bind(id)
		.first<ProductRow>();
	return row ? toProduct(row) : null;
}

export async function listProducts(db: D1Database): Promise<Product[]> {
	const result = await db
		.prepare(`SELECT ${PRODUCT_COLUMNS} FROM products ORDER BY published_at DESC, id ASC`)
		.all<ProductRow>();
	return result.results.map(toProduct);
}

/** Atualiza os dados editoriais; o ID legado e o vínculo Shopee não mudam. */
export async function updateProduct(db: D1Database, product: Product): Promise<Product | null> {
	const result = await db
		.prepare(
			`UPDATE products SET
				name = ?, category = ?, category_id = ?, auto_rule = ?, price = ?, price_max = ?,
				previous_price = ?, previous_price_max = ?, image = ?, url = ?, published_at = ?,
				updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
			WHERE id = ?`
		)
		.bind(...editableValues(product), product.id)
		.run();
	if (result.meta.changes === 0) return null;
	return getProductById(db, product.id);
}

export async function getProductShopeeLink(
	db: D1Database,
	id: string
): Promise<ProductShopeeLink | null> {
	const row = await db
		.prepare('SELECT item_id, shop_id FROM products WHERE id = ?')
		.bind(id)
		.first<{ item_id: string | null; shop_id: string | null }>();
	return row?.item_id && row.shop_id ? { itemId: row.item_id, shopId: row.shop_id } : null;
}

/**
 * Retorna false se o produto não existir; um vínculo duplicado lança erro (índice único).
 * Repetir o mesmo par é idempotente; trocar por outro par lança erro e preserva o original.
 */
export async function linkProductToShopee(
	db: D1Database,
	id: string,
	itemId: string,
	shopId: string
): Promise<boolean> {
	assertShopeeId(itemId, 'itemId');
	assertShopeeId(shopId, 'shopId');
	const result = await db
		.prepare(
			`UPDATE products SET item_id = ?, shop_id = ?,
				updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
			WHERE id = ?
				AND ((item_id IS NULL AND shop_id IS NULL) OR (item_id = ? AND shop_id = ?))`
		)
		.bind(itemId, shopId, id, itemId, shopId)
		.run();
	if (result.meta.changes > 0) return true;

	const current = await db
		.prepare('SELECT item_id, shop_id FROM products WHERE id = ?')
		.bind(id)
		.first<{ item_id: string | null; shop_id: string | null }>();
	if (!current) return false;
	if (current.item_id === itemId && current.shop_id === shopId) return true;
	throw new Error('O produto já possui um vínculo Shopee diferente; desvincule antes de trocar.');
}

export async function unlinkProductFromShopee(db: D1Database, id: string): Promise<boolean> {
	const result = await db
		.prepare(
			`UPDATE products SET item_id = NULL, shop_id = NULL,
				updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
			WHERE id = ?`
		)
		.bind(id)
		.run();
	return result.meta.changes > 0;
}
