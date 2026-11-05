CREATE TABLE IF NOT EXISTS candidates (
	item_id TEXT NOT NULL,
	shop_id TEXT NOT NULL,
	product_name TEXT,
	product_link TEXT,
	offer_link TEXT,
	image_url TEXT,
	price TEXT,
	price_min TEXT,
	price_max TEXT,
	price_discount_rate TEXT,
	commission_rate TEXT,
	sales TEXT,
	rating_star TEXT,
	product_cat_ids TEXT,
	raw_data TEXT NOT NULL,
	status TEXT NOT NULL DEFAULT 'pending'
		CHECK (status IN ('pending', 'approved', 'rejected')),
	rejection_reason TEXT,
	first_seen_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	last_seen_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	PRIMARY KEY (item_id, shop_id)
);

CREATE INDEX IF NOT EXISTS candidates_status_last_seen
	ON candidates (status, last_seen_at DESC);
CREATE INDEX IF NOT EXISTS candidates_product_name
	ON candidates (product_name);

CREATE TABLE IF NOT EXISTS candidate_collection_runs (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	search_type TEXT NOT NULL CHECK (search_type IN ('general', 'keyword', 'category')),
	search_term TEXT,
	requested_pages INTEGER NOT NULL,
	page_limit INTEGER NOT NULL,
	queries_performed INTEGER NOT NULL DEFAULT 0,
	products_found INTEGER NOT NULL DEFAULT 0,
	new_candidates INTEGER NOT NULL DEFAULT 0,
	updated_candidates INTEGER NOT NULL DEFAULT 0,
	failures INTEGER NOT NULL DEFAULT 0,
	error_code TEXT,
	error_message TEXT,
	started_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	finished_at TEXT
);

CREATE TABLE IF NOT EXISTS candidate_decisions (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	item_id TEXT NOT NULL,
	shop_id TEXT NOT NULL,
	decision TEXT NOT NULL CHECK (decision IN ('approved', 'rejected')),
	rejection_reason TEXT,
	decided_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	FOREIGN KEY (item_id, shop_id) REFERENCES candidates (item_id, shop_id)
);
