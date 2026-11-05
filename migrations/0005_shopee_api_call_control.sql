-- Controle central de chamadas HTTP à Shopee Affiliate API (aditivo; não altera tabelas existentes).
CREATE TABLE IF NOT EXISTS shopee_api_calls (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	source TEXT NOT NULL,
	reserved_at TEXT NOT NULL,
	is_retry INTEGER NOT NULL DEFAULT 0 CHECK (is_retry IN (0, 1)),
	outcome TEXT NOT NULL DEFAULT 'pending' CHECK (
		outcome IN (
			'pending',
			'success',
			'rate_limited',
			'timeout',
			'transport_error',
			'http_error',
			'graphql_error',
			'invalid_response',
			'abandoned'
		)
	),
	http_status INTEGER,
	error_code TEXT,
	settled_at TEXT
);

CREATE INDEX IF NOT EXISTS shopee_api_calls_reserved ON shopee_api_calls (reserved_at DESC);

CREATE TABLE IF NOT EXISTS shopee_api_control_events (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	kind TEXT NOT NULL CHECK (kind IN ('reserve_denied', 'reserve_failed', 'settle_failed')),
	source TEXT NOT NULL,
	occurred_at TEXT NOT NULL,
	detail TEXT
);

CREATE INDEX IF NOT EXISTS shopee_api_control_events_occurred ON shopee_api_control_events (occurred_at DESC);
