CREATE TABLE IF NOT EXISTS products (
	id TEXT PRIMARY KEY NOT NULL,
	name TEXT NOT NULL,
	category TEXT NOT NULL,
	category_id TEXT,
	auto_rule TEXT,
	price REAL NOT NULL CHECK (price > 0),
	price_max REAL,
	previous_price REAL,
	previous_price_max REAL,
	image TEXT NOT NULL,
	url TEXT NOT NULL,
	published_at TEXT,
	item_id TEXT,
	shop_id TEXT,
	created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	CHECK (price_max IS NULL OR price_max >= price),
	CHECK (previous_price IS NULL OR previous_price > 0),
	CHECK (previous_price_max IS NULL OR previous_price_max > 0),
	CHECK ((item_id IS NULL) = (shop_id IS NULL))
);

CREATE INDEX IF NOT EXISTS idx_products_category_id ON products (category_id);

CREATE INDEX IF NOT EXISTS idx_products_published_at ON products (published_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_products_shopee_item
	ON products (item_id, shop_id)
	WHERE item_id IS NOT NULL AND shop_id IS NOT NULL;
