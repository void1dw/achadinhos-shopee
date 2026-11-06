import { toProduct, type ProductRow } from '../product-store';
import { runCatalogAudit, type CatalogAuditDeps } from './catalog-audit';
import { ELIGIBLE_SQL, isFailureOutcome, type QueueCheck } from './monitor-queue';
import type { AuditTarget } from './monitor-store';

/** Máximo de produtos por solicitação do painel (não é uma quantidade obrigatória). */
export const MAX_BATCH_SIZE = 1000;
/** Produtos por bloco interno: 2 chamadas de API (10 por consulta) e até 20 resoluções HTTP. */
export const BATCH_CHUNK_SIZE = 20;
/** Falhas técnicas por produto antes de ele sair da seleção automática. */
export const MAX_AUDIT_ATTEMPTS = 3;
/** Um bloco reservado há mais que isto é considerado abandonado (timeout ou aba fechada). */
export const STALE_CLAIM_MS = 3 * 60 * 1000;
/** Blocos seguidos sem nenhum sucesso antes de pausar o lote até o usuário retomar. */
export const MAX_STALLED_CHUNKS = 3;
const D1_CHUNK = 50;

type Credentials = Pick<Cloudflare.Env, 'SHOPEE_APP_ID' | 'SHOPEE_APP_SECRET'>;

export type AuditStats = {
	total: number;
	audited: number;
	neverAudited: number;
	processing: number;
	technicalFailures: number;
	exhausted: number;
	linked: number;
	notFound: number;
	/** Pendentes sem nenhum caminho de identificação (nem link curto, nem URL com IDs). */
	noIdentifier: number;
	/** Elegíveis para o próximo lote: não auditados, tentativas restantes e fora de lote ativo. */
	selectable: number;
	percent: number;
};

export type BatchView = {
	id: number;
	number: number;
	requested: number;
	selected: number;
	processed: number;
	failed: number;
	pending: number;
	stalled: boolean;
};

const NOT_AUDITED_SQL = `(s.product_id IS NULL OR s.audit_completed_at IS NULL)`;
const FAILURE_SQL = `s.last_outcome IN ('unresolved', 'api_error', 'link_error')`;

async function one(db: D1Database, sql: string, ...binds: unknown[]): Promise<number> {
	const row = await db.prepare(sql).bind(...binds).first<{ n: number }>();
	return row?.n ?? 0;
}

export async function getAuditStats(db: D1Database): Promise<AuditStats> {
	const base = `FROM products p LEFT JOIN product_monitor_state s ON s.product_id = p.id`;
	const [total, audited, processing, technicalFailures, exhausted, linked, notFound, noIdentifier, selectable] =
		await Promise.all([
			one(db, `SELECT COUNT(*) AS n FROM products`),
			one(db, `SELECT COUNT(*) AS n ${base} WHERE s.audit_completed_at IS NOT NULL`),
			one(db, `SELECT COUNT(*) AS n FROM audit_batch_items WHERE status IN ('pending', 'processing')`),
			one(db, `SELECT COUNT(*) AS n ${base} WHERE s.audit_completed_at IS NULL AND ${FAILURE_SQL}`),
			one(
				db,
				`SELECT COUNT(*) AS n ${base} WHERE s.audit_completed_at IS NULL AND s.audit_attempts >= ?`,
				MAX_AUDIT_ATTEMPTS
			),
			one(db, `SELECT COUNT(*) AS n FROM products WHERE item_id IS NOT NULL`),
			one(
				db,
				`SELECT COUNT(*) AS n ${base} WHERE s.audit_completed_at IS NOT NULL AND s.last_outcome = 'unavailable'`
			),
			one(db, `SELECT COUNT(*) AS n ${base} WHERE ${NOT_AUDITED_SQL} AND NOT ${ELIGIBLE_SQL}`),
			one(db, `SELECT COUNT(*) AS n ${base} WHERE ${SELECTABLE_SQL}`, MAX_AUDIT_ATTEMPTS)
		]);
	const neverAudited = Math.max(total - audited, 0);
	return {
		total,
		audited,
		neverAudited,
		processing,
		technicalFailures,
		exhausted,
		linked,
		notFound,
		noIdentifier,
		selectable,
		percent: total > 0 ? Math.floor((audited / total) * 1000) / 10 : 0
	};
}

const SELECTABLE_SQL = `${NOT_AUDITED_SQL}
	AND ${ELIGIBLE_SQL}
	AND COALESCE(s.audit_attempts, 0) < ?
	AND NOT EXISTS (
		SELECT 1 FROM audit_batch_items i
		WHERE i.product_id = p.id AND i.status IN ('pending', 'processing')
	)`;

type BatchRow = {
	id: number;
	number: number;
	requested: number;
	selected: number;
	stalled_chunks: number;
};

export async function getOpenBatch(db: D1Database): Promise<BatchView | null> {
	const batch = await db
		.prepare(
			`SELECT id, number, requested, selected, stalled_chunks FROM audit_batches WHERE status = 'open' LIMIT 1`
		)
		.first<BatchRow>();
	if (!batch) return null;
	const rows = await db
		.prepare(`SELECT status, COUNT(*) AS n FROM audit_batch_items WHERE batch_id = ? GROUP BY status`)
		.bind(batch.id)
		.all<{ status: string; n: number }>();
	const count = (status: string) => rows.results.find((row) => row.status === status)?.n ?? 0;
	const done = count('done');
	const failed = count('failed');
	return {
		id: batch.id,
		number: batch.number,
		requested: batch.requested,
		selected: batch.selected,
		processed: done + failed,
		failed,
		pending: count('pending') + count('processing'),
		stalled: batch.stalled_chunks >= MAX_STALLED_CHUNKS
	};
}

export type StartResult =
	| { state: 'created'; batch: BatchView }
	| { state: 'resumed'; batch: BatchView }
	| { state: 'empty' };

/**
 * Cria o próximo lote ou retoma o aberto. Um índice único parcial permite um único lote aberto, e outro
 * impede que um produto esteja em dois itens ativos; por isso dois cliques simultâneos nunca duplicam.
 */
export async function startOrResumeBatch(
	db: D1Database,
	now: Date,
	limit: number = MAX_BATCH_SIZE
): Promise<StartResult> {
	const existing = await getOpenBatch(db);
	if (existing) return { state: 'resumed', batch: existing };

	const size = Math.max(1, Math.min(Math.trunc(limit), MAX_BATCH_SIZE));
	const nowIso = now.toISOString();
	let batchId: number;
	try {
		const inserted = await db
			.prepare(
				`INSERT INTO audit_batches (number, requested, selected, status, created_at, updated_at)
				VALUES ((SELECT COALESCE(MAX(number), 0) + 1 FROM audit_batches), ?, 0, 'open', ?, ?)`
			)
			.bind(size, nowIso, nowIso)
			.run();
		batchId = Number(inserted.meta.last_row_id);
	} catch (error) {
		const winner = await getOpenBatch(db);
		if (winner) return { state: 'resumed', batch: winner };
		throw error;
	}

	await db
		.prepare(
			`INSERT INTO audit_batch_items (batch_id, product_id, status, updated_at)
			SELECT ?, p.id, 'pending', ?
			FROM products p LEFT JOIN product_monitor_state s ON s.product_id = p.id
			WHERE ${SELECTABLE_SQL}
			ORDER BY COALESCE(s.audit_attempts, 0), p.id
			LIMIT ?`
		)
		.bind(batchId, nowIso, MAX_AUDIT_ATTEMPTS, size)
		.run();
	const selected = await one(db, `SELECT COUNT(*) AS n FROM audit_batch_items WHERE batch_id = ?`, batchId);
	if (selected === 0) {
		await db.prepare(`DELETE FROM audit_batches WHERE id = ?`).bind(batchId).run();
		return { state: 'empty' };
	}
	await db
		.prepare(`UPDATE audit_batches SET selected = ?, updated_at = ? WHERE id = ?`)
		.bind(selected, nowIso, batchId)
		.run();
	const batch = await getOpenBatch(db);
	if (!batch) throw new Error('Lote criado não pôde ser lido.');
	return { state: 'created', batch };
}

export async function resumeBatch(db: D1Database, now: Date): Promise<BatchView | null> {
	await db
		.prepare(`UPDATE audit_batches SET stalled_chunks = 0, updated_at = ? WHERE status = 'open'`)
		.bind(now.toISOString())
		.run();
	return getOpenBatch(db);
}

export async function cancelBatch(db: D1Database, now: Date): Promise<boolean> {
	const nowIso = now.toISOString();
	const batch = await db.prepare(`SELECT id FROM audit_batches WHERE status = 'open'`).first<{ id: number }>();
	if (!batch) return false;
	await db.batch([
		db
			.prepare(
				`UPDATE audit_batch_items SET status = 'cancelled', claim_token = NULL, updated_at = ?
				WHERE batch_id = ? AND status IN ('pending', 'processing')`
			)
			.bind(nowIso, batch.id),
		db
			.prepare(`UPDATE audit_batches SET status = 'cancelled', completed_at = ?, updated_at = ? WHERE id = ?`)
			.bind(nowIso, nowIso, batch.id)
	]);
	return true;
}

/** Devolve ao lote os produtos que falharam três vezes, para uma nova rodada de tentativas. */
export async function releaseExhausted(db: D1Database): Promise<number> {
	const result = await db
		.prepare(
			`UPDATE product_monitor_state SET audit_attempts = 0
			WHERE audit_completed_at IS NULL AND audit_attempts >= ?`
		)
		.bind(MAX_AUDIT_ATTEMPTS)
		.run();
	return result.meta.changes ?? 0;
}

async function claimChunk(
	db: D1Database,
	batchId: number,
	now: Date,
	size: number
): Promise<{ token: string; targets: AuditTarget[] }> {
	const token = crypto.randomUUID();
	const nowIso = now.toISOString();
	const staleBefore = new Date(now.getTime() - STALE_CLAIM_MS).toISOString();
	await db
		.prepare(
			`UPDATE audit_batch_items SET status = 'processing', claim_token = ?, claimed_at = ?, updated_at = ?
			WHERE batch_id = ? AND product_id IN (
				SELECT product_id FROM audit_batch_items
				WHERE batch_id = ? AND (status = 'pending' OR (status = 'processing' AND claimed_at < ?))
				ORDER BY product_id LIMIT ?
			)`
		)
		.bind(token, nowIso, nowIso, batchId, batchId, staleBefore, size)
		.run();
	const rows = await db
		.prepare(
			`SELECT p.* FROM products p
			JOIN audit_batch_items i ON i.product_id = p.id
			WHERE i.batch_id = ? AND i.claim_token = ? AND i.status = 'processing'
			ORDER BY p.id`
		)
		.bind(batchId, token)
		.all<ProductRow>();
	return {
		token,
		targets: rows.results.map((row) => ({
			product: toProduct(row),
			itemId: row.item_id,
			shopId: row.shop_id
		}))
	};
}

async function releaseClaim(db: D1Database, batchId: number, token: string, now: Date) {
	await db
		.prepare(
			`UPDATE audit_batch_items SET status = 'pending', claim_token = NULL, updated_at = ?
			WHERE batch_id = ? AND claim_token = ? AND status = 'processing'`
		)
		.bind(now.toISOString(), batchId, token)
		.run();
}

/**
 * Grava o resultado do bloco. Só afeta itens ainda reservados por este token, então um bloco
 * reassumido por outro processo (reserva vencida) nunca é gravado duas vezes. Produtos sem
 * resultado voltam a pendente sem consumir tentativa; falhas técnicas consomem uma tentativa.
 */
async function finalizeChunk(
	db: D1Database,
	batchId: number,
	token: string,
	targets: readonly AuditTarget[],
	checks: readonly QueueCheck[],
	now: Date
): Promise<{ successes: number }> {
	const nowIso = now.toISOString();
	const byProduct = new Map(checks.map((check) => [check.productId, check]));
	const statements: D1PreparedStatement[] = [];
	let successes = 0;
	for (const { product } of targets) {
		const check = byProduct.get(product.id);
		if (!check) {
			statements.push(
				db
					.prepare(
						`UPDATE audit_batch_items SET status = 'pending', claim_token = NULL, updated_at = ?
						WHERE batch_id = ? AND product_id = ? AND claim_token = ?`
					)
					.bind(nowIso, batchId, product.id, token)
			);
			continue;
		}
		const failed = isFailureOutcome(check.outcome);
		if (!failed) successes += 1;
		statements.push(
			db
				.prepare(
					`UPDATE audit_batch_items SET status = ?, outcome = ?, error_code = ?, claim_token = NULL, updated_at = ?
					WHERE batch_id = ? AND product_id = ? AND claim_token = ? AND status = 'processing'`
				)
				.bind(failed ? 'failed' : 'done', check.outcome, failed ? (check.errorCode ?? null) : null, nowIso, batchId, product.id, token)
		);
		if (failed) {
			statements.push(
				db
					.prepare(
						`UPDATE product_monitor_state SET audit_attempts = audit_attempts + 1
						WHERE product_id = ? AND EXISTS (
							SELECT 1 FROM audit_batch_items
							WHERE batch_id = ? AND product_id = ? AND status = 'failed' AND updated_at = ?
						)`
					)
					.bind(product.id, batchId, product.id, nowIso)
			);
		}
	}
	for (let start = 0; start < statements.length; start += D1_CHUNK) {
		await db.batch(statements.slice(start, start + D1_CHUNK));
	}
	await db
		.prepare(
			`UPDATE audit_batches SET stalled_chunks = CASE WHEN ? > 0 THEN 0 ELSE stalled_chunks + 1 END, updated_at = ?
			WHERE id = ?`
		)
		.bind(successes, nowIso, batchId)
		.run();
	return { successes };
}

async function completeIfFinished(db: D1Database, batchId: number, now: Date): Promise<boolean> {
	const nowIso = now.toISOString();
	const result = await db
		.prepare(
			`UPDATE audit_batches SET status = 'completed', completed_at = ?, updated_at = ?
			WHERE id = ? AND status = 'open' AND NOT EXISTS (
				SELECT 1 FROM audit_batch_items WHERE batch_id = ? AND status IN ('pending', 'processing')
			)`
		)
		.bind(nowIso, nowIso, batchId, batchId)
		.run();
	return (result.meta.changes ?? 0) > 0;
}

export type StepResult =
	| { state: 'none' }
	| { state: 'finished'; batch: BatchView }
	| { state: 'progress'; batch: BatchView; chunk: { processed: number; failed: number } }
	| { state: 'busy'; batch: BatchView }
	| { state: 'stalled'; batch: BatchView }
	| { state: 'blocked'; batch: BatchView; code: string; message: string };

/**
 * Processa um bloco do lote aberto, reutilizando `runCatalogAudit` (mesma resolução de links,
 * mesmo controle de chamadas e mesma trava de execução do monitoramento). Não altera preços,
 * não troca links de afiliado e não reativa o monitoramento pausado.
 */
export async function runBatchStep(
	db: D1Database,
	credentials: Credentials,
	deps: CatalogAuditDeps = {},
	chunkSize: number = BATCH_CHUNK_SIZE
): Promise<StepResult> {
	const clock = deps.now ?? (() => new Date());
	const open = await getOpenBatch(db);
	if (!open) return { state: 'none' };
	if (open.stalled) return { state: 'stalled', batch: open };

	const { token, targets } = await claimChunk(db, open.id, clock(), chunkSize);
	if (targets.length === 0) {
		if (await completeIfFinished(db, open.id, clock())) {
			return { state: 'finished', batch: { ...open, pending: 0 } };
		}
		return { state: 'busy', batch: open };
	}

	let outcome: Awaited<ReturnType<typeof runCatalogAudit>>;
	try {
		outcome = await runCatalogAudit(db, credentials, { trigger: 'manual', targets }, deps);
	} catch (error) {
		await releaseClaim(db, open.id, token, clock());
		throw error;
	}
	if (outcome.state !== 'finished') {
		await releaseClaim(db, open.id, token, clock());
		const batch = (await getOpenBatch(db)) ?? open;
		if (outcome.state === 'blocked') {
			return { state: 'blocked', batch, code: outcome.code, message: outcome.message };
		}
		return { state: 'busy', batch };
	}

	const { successes } = await finalizeChunk(db, open.id, token, targets, outcome.checks, clock());
	const finished = await completeIfFinished(db, open.id, clock());
	const batch = (await getOpenBatch(db)) ?? { ...open, pending: 0, processed: open.selected };
	const failed = outcome.checks.length - successes;
	if (finished) return { state: 'finished', batch };
	if (outcome.errorCode && isFatalStop(outcome.errorCode) && outcome.checks.length === 0) {
		return { state: 'blocked', batch, code: outcome.errorCode, message: outcome.errorMessage ?? outcome.errorCode };
	}
	if (batch.stalled) return { state: 'stalled', batch };
	return { state: 'progress', batch, chunk: { processed: outcome.checks.length, failed } };
}

function isFatalStop(code: string): boolean {
	return (
		code === 'BUDGET_EXHAUSTED' ||
		code === 'SHOPEE_CALL_CONTROL_UNAVAILABLE' ||
		code === 'SHOPEE_CALL_CONTROL_REQUIRED' ||
		code === 'SHOPEE_API_ACCESS_DENIED' ||
		code === 'SHOPEE_QUERY_PARSE_ERROR' ||
		code === 'SHOPEE_INVALID_PARAMETERS' ||
		code === 'SHOPEE_GRAPHQL_ERROR' ||
		code === 'SHOPEE_RATE_LIMITED'
	);
}
