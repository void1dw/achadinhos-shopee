-- Auditoria incremental do catalogo: estado de auditoria por produto e lotes persistentes.
-- Aditiva: nao altera linhas de products. Reversao manual (nao automatica):
--   DROP TABLE audit_batch_items;
--   DROP TABLE audit_batches;
--   ALTER TABLE product_monitor_state DROP COLUMN audit_attempts;
--   ALTER TABLE product_monitor_state DROP COLUMN audit_completed_at;
-- audit_completed_at so e preenchido quando a verificacao terminou sem falha tecnica (ok, unavailable ou review).
-- Falhas tecnicas nunca o preenchem. Sem linha em product_monitor_state = nunca auditado.

ALTER TABLE product_monitor_state ADD COLUMN audit_completed_at TEXT;
ALTER TABLE product_monitor_state ADD COLUMN audit_attempts INTEGER NOT NULL DEFAULT 0 CHECK (audit_attempts >= 0);

UPDATE product_monitor_state SET audit_completed_at = last_success_at WHERE last_success_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS audit_batches (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	number INTEGER NOT NULL,
	requested INTEGER NOT NULL CHECK (requested BETWEEN 1 AND 1000),
	selected INTEGER NOT NULL DEFAULT 0 CHECK (selected >= 0),
	status TEXT NOT NULL CHECK (status IN ('open', 'completed', 'cancelled')),
	stalled_chunks INTEGER NOT NULL DEFAULT 0 CHECK (stalled_chunks >= 0),
	created_at TEXT NOT NULL,
	updated_at TEXT NOT NULL,
	completed_at TEXT
);

-- No maximo um lote aberto: um segundo clique ou aba retoma o mesmo lote em vez de criar outro.
CREATE UNIQUE INDEX IF NOT EXISTS idx_audit_batches_single_open ON audit_batches (status) WHERE status = 'open';

CREATE TABLE IF NOT EXISTS audit_batch_items (
	batch_id INTEGER NOT NULL REFERENCES audit_batches(id) ON DELETE CASCADE,
	product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
	status TEXT NOT NULL CHECK (status IN ('pending', 'processing', 'done', 'failed', 'cancelled')),
	outcome TEXT,
	error_code TEXT,
	claim_token TEXT,
	claimed_at TEXT,
	updated_at TEXT NOT NULL,
	PRIMARY KEY (batch_id, product_id)
);

-- Um produto pertence a no maximo um item ativo (pendente ou em processamento) em todo o sistema.
CREATE UNIQUE INDEX IF NOT EXISTS idx_audit_batch_items_active_product
	ON audit_batch_items (product_id) WHERE status IN ('pending', 'processing');
CREATE INDEX IF NOT EXISTS idx_audit_batch_items_status ON audit_batch_items (batch_id, status);
