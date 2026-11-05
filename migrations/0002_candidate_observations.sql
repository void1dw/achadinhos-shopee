CREATE TABLE IF NOT EXISTS candidate_price_observations (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	item_id TEXT NOT NULL,
	shop_id TEXT NOT NULL,
	collection_run_id INTEGER NOT NULL,
	price TEXT,
	price_min TEXT,
	price_max TEXT,
	price_discount_rate TEXT,
	commission_rate TEXT,
	sales TEXT,
	rating_star TEXT,
	observed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	UNIQUE (collection_run_id, item_id, shop_id),
	FOREIGN KEY (item_id, shop_id) REFERENCES candidates (item_id, shop_id),
	FOREIGN KEY (collection_run_id) REFERENCES candidate_collection_runs (id)
);

CREATE INDEX IF NOT EXISTS candidate_price_observations_product_date
	ON candidate_price_observations (item_id, shop_id, observed_at DESC);
CREATE INDEX IF NOT EXISTS candidate_price_observations_run
	ON candidate_price_observations (collection_run_id);
