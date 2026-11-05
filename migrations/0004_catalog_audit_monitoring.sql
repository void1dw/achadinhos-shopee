-- Auditoria, monitoramento e publicação do catálogo. Não altera tabelas existentes.

CREATE TABLE IF NOT EXISTS product_audits (
	product_id TEXT PRIMARY KEY NOT NULL,
	status TEXT NOT NULL
		CHECK (status IN ('valid', 'price_changed', 'unavailable', 'uncertain', 'needs_review')),
	match_level TEXT NOT NULL CHECK (match_level IN ('linked', 'url_id', 'name_search', 'none')),
	item_id TEXT,
	shop_id TEXT,
	sheet_price REAL NOT NULL,
	sheet_price_max REAL,
	api_price_min REAL,
	api_price_max REAL,
	api_product_name TEXT,
	detail TEXT NOT NULL DEFAULT '{}',
	last_observed_at TEXT,
	verified_at TEXT NOT NULL,
	updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	FOREIGN KEY (product_id) REFERENCES products (id)
);

CREATE INDEX IF NOT EXISTS product_audits_status_verified
	ON product_audits (status, verified_at DESC);
CREATE INDEX IF NOT EXISTS product_audits_verified
	ON product_audits (verified_at);

CREATE TABLE IF NOT EXISTS monitor_runs (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	trigger TEXT NOT NULL CHECK (trigger IN ('manual', 'scheduled')),
	status TEXT NOT NULL CHECK (status IN ('running', 'completed', 'partial', 'failed')),
	products_checked INTEGER NOT NULL DEFAULT 0,
	discovery_searches INTEGER NOT NULL DEFAULT 0,
	api_calls INTEGER NOT NULL DEFAULT 0,
	price_changes INTEGER NOT NULL DEFAULT 0,
	unavailable INTEGER NOT NULL DEFAULT 0,
	failures INTEGER NOT NULL DEFAULT 0,
	retries INTEGER NOT NULL DEFAULT 0,
	error_code TEXT,
	error_message TEXT,
	started_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	finished_at TEXT
);

-- Só pode existir uma execução em andamento: protege contra execuções simultâneas.
CREATE UNIQUE INDEX IF NOT EXISTS monitor_runs_single_running
	ON monitor_runs (status) WHERE status = 'running';
CREATE INDEX IF NOT EXISTS monitor_runs_started ON monitor_runs (started_at DESC);

CREATE TABLE IF NOT EXISTS product_monitor_events (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	run_id INTEGER,
	product_id TEXT NOT NULL,
	item_id TEXT,
	shop_id TEXT,
	event_type TEXT NOT NULL CHECK (event_type IN ('price_changed', 'unavailable', 'available_again')),
	previous_price REAL,
	current_price REAL,
	previous_price_max REAL,
	current_price_max REAL,
	detected_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	FOREIGN KEY (run_id) REFERENCES monitor_runs (id),
	FOREIGN KEY (product_id) REFERENCES products (id)
);

CREATE INDEX IF NOT EXISTS product_monitor_events_detected
	ON product_monitor_events (detected_at DESC);
CREATE INDEX IF NOT EXISTS product_monitor_events_product
	ON product_monitor_events (product_id, detected_at DESC);

-- Rotina nasce pausada: nada roda automaticamente até o administrador ativá-la.
CREATE TABLE IF NOT EXISTS monitor_settings (
	id INTEGER PRIMARY KEY CHECK (id = 1),
	paused INTEGER NOT NULL DEFAULT 1 CHECK (paused IN (0, 1)),
	interval_hours INTEGER NOT NULL DEFAULT 12 CHECK (interval_hours BETWEEN 1 AND 168),
	batch_size INTEGER NOT NULL DEFAULT 20 CHECK (batch_size BETWEEN 1 AND 50),
	hourly_call_budget INTEGER NOT NULL DEFAULT 100 CHECK (hourly_call_budget BETWEEN 1 AND 2000),
	updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

INSERT OR IGNORE INTO monitor_settings (id) VALUES (1);

CREATE TABLE IF NOT EXISTS shopee_api_usage (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	source TEXT NOT NULL,
	calls INTEGER NOT NULL CHECK (calls > 0),
	rate_limited INTEGER NOT NULL DEFAULT 0 CHECK (rate_limited IN (0, 1)),
	occurred_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS shopee_api_usage_occurred ON shopee_api_usage (occurred_at DESC);

CREATE TABLE IF NOT EXISTS sheet_publish_operations (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	status TEXT NOT NULL CHECK (status IN ('blocked', 'completed', 'failed')),
	requested_rows INTEGER NOT NULL,
	written_rows INTEGER NOT NULL DEFAULT 0,
	payload TEXT NOT NULL,
	error_code TEXT,
	error_message TEXT,
	created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	finished_at TEXT
);

-- Um anúncio Shopee só entra na planilha uma vez.
CREATE TABLE IF NOT EXISTS sheet_published_candidates (
	item_id TEXT NOT NULL,
	shop_id TEXT NOT NULL,
	product_id TEXT NOT NULL,
	operation_id INTEGER NOT NULL,
	published_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	PRIMARY KEY (item_id, shop_id),
	FOREIGN KEY (operation_id) REFERENCES sheet_publish_operations (id)
);
