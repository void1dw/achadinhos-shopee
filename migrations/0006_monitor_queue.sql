-- Fila persistente de monitoramento do catalogo, sinal de vida do agendador e opcao de atualizar precos.
-- Aditiva: nao altera linhas de products. Reversao manual (nao automatica):
--   DROP TABLE product_monitor_state;
--   DROP TABLE monitor_scheduler_heartbeat;
--   ALTER TABLE monitor_settings DROP COLUMN update_prices;
-- A ausencia de linha em product_monitor_state significa "nunca verificado" (maior prioridade).

CREATE TABLE IF NOT EXISTS product_monitor_state (
	product_id TEXT PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE,
	next_check_at TEXT NOT NULL,
	last_checked_at TEXT,
	last_success_at TEXT,
	last_outcome TEXT NOT NULL CHECK (last_outcome IN ('ok', 'unavailable', 'review', 'unresolved', 'api_error', 'link_error')),
	last_error_code TEXT,
	last_error_detail TEXT,
	consecutive_failures INTEGER NOT NULL DEFAULT 0 CHECK (consecutive_failures >= 0),
	total_checks INTEGER NOT NULL DEFAULT 0 CHECK (total_checks >= 0),
	updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_product_monitor_state_next ON product_monitor_state (next_check_at);

CREATE TABLE IF NOT EXISTS monitor_scheduler_heartbeat (
	id INTEGER PRIMARY KEY CHECK (id = 1),
	last_tick_at TEXT NOT NULL,
	last_result TEXT NOT NULL,
	last_run_id INTEGER
);

ALTER TABLE monitor_settings ADD COLUMN update_prices INTEGER NOT NULL DEFAULT 0 CHECK (update_prices IN (0, 1));

-- Remove registros artificiais "incerto" gerados quando o link curto nao podia ser resolvido:
-- eram falhas tecnicas gravadas como falta de correspondencia. O motivo real passa a viver em product_monitor_state.
DELETE FROM product_audits WHERE status = 'uncertain' AND match_level = 'none' AND detail LIKE '%resolver o link curto%';
