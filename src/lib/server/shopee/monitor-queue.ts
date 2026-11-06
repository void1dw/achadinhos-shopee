import { toProduct, type ProductRow } from '../product-store';
import type { AuditTarget } from './monitor-store';

const HOUR_MS = 60 * 60 * 1000;
/** Deve coincidir com `triggers.crons` em wrangler.jsonc (verificado por teste). */
export const MONITOR_CRON_MINUTES = 15;
const D1_CHUNK = 50;
const MAX_BACKOFF_MS = 48 * HOUR_MS;
/** Espera após a 1ª, 2ª, 3ª... falha consecutiva; a última se repete até o teto de 48 h. */
const BACKOFF_STEPS_MS = [30 * 60 * 1000, 2 * HOUR_MS, 6 * HOUR_MS, 24 * HOUR_MS];

export type QueueOutcome = 'ok' | 'unavailable' | 'review' | 'unresolved' | 'api_error' | 'link_error';

const FAILURE_OUTCOMES: ReadonlySet<QueueOutcome> = new Set([
	'unresolved',
	'api_error',
	'link_error'
]);

export const isFailureOutcome = (outcome: QueueOutcome): boolean => FAILURE_OUTCOMES.has(outcome);

export function backoffMs(consecutiveFailures: number): number {
	const step = BACKOFF_STEPS_MS[Math.min(Math.max(consecutiveFailures, 1), BACKOFF_STEPS_MS.length) - 1]!;
	return Math.min(step, MAX_BACKOFF_MS);
}

/** Produto com algum caminho de identificação: vínculo, URL com IDs ou link curto de afiliado. */
export const ELIGIBLE_SQL = `(p.item_id IS NOT NULL
	OR p.url LIKE 'https://s.shopee.com.br/%'
	OR p.url LIKE '%shopee.com.br/product/%'
	OR p.url LIKE '%shopee.com.br/%-i.%')`;

/**
 * Próximo lote da fila. Nunca verificados primeiro; depois os vencidos, do mais atrasado ao menos.
 * `force` ignora a data de vencimento (execução manual), mas mantém a mesma ordem de rodízio.
 */
export async function selectQueueBatch(
	db: D1Database,
	now: Date,
	limit: number,
	force = false
): Promise<AuditTarget[]> {
	if (limit <= 0) return [];
	const result = await db
		.prepare(
			`SELECT p.* FROM products p LEFT JOIN product_monitor_state s ON s.product_id = p.id
			WHERE ${ELIGIBLE_SQL} AND (? = 1 OR s.product_id IS NULL OR s.next_check_at <= ?)
			ORDER BY (s.product_id IS NOT NULL), s.next_check_at ASC, p.id ASC LIMIT ?`
		)
		.bind(force ? 1 : 0, now.toISOString(), limit)
		.all<ProductRow>();
	return result.results.map((row) => ({
		product: toProduct(row),
		itemId: row.item_id,
		shopId: row.shop_id
	}));
}

export type QueueCheck = {
	productId: string;
	outcome: QueueOutcome;
	errorCode?: string | null;
	errorDetail?: string | null;
};

/** Grava o resultado de cada verificação e agenda a próxima (intervalo normal ou recuo por falha). */
export async function recordQueueChecks(
	db: D1Database,
	checks: readonly QueueCheck[],
	now: Date,
	intervalHours: number
): Promise<void> {
	if (checks.length === 0) return;
	const nowIso = now.toISOString();
	const previous = new Map<string, number>();
	for (let start = 0; start < checks.length; start += D1_CHUNK) {
		const ids = checks.slice(start, start + D1_CHUNK).map((check) => check.productId);
		const rows = await db
			.prepare(
				`SELECT product_id, consecutive_failures FROM product_monitor_state
				WHERE product_id IN (${ids.map(() => '?').join(', ')})`
			)
			.bind(...ids)
			.all<{ product_id: string; consecutive_failures: number }>();
		for (const row of rows.results) previous.set(row.product_id, row.consecutive_failures);
	}
	const statement = db.prepare(
		`INSERT INTO product_monitor_state
			(product_id, next_check_at, last_checked_at, last_success_at, last_outcome,
			last_error_code, last_error_detail, consecutive_failures, total_checks, updated_at,
			audit_completed_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
		ON CONFLICT(product_id) DO UPDATE SET
			audit_completed_at = COALESCE(product_monitor_state.audit_completed_at, excluded.audit_completed_at),
			next_check_at = excluded.next_check_at, last_checked_at = excluded.last_checked_at,
			last_success_at = COALESCE(excluded.last_success_at, product_monitor_state.last_success_at),
			last_outcome = excluded.last_outcome, last_error_code = excluded.last_error_code,
			last_error_detail = excluded.last_error_detail,
			consecutive_failures = excluded.consecutive_failures,
			total_checks = product_monitor_state.total_checks + 1, updated_at = excluded.updated_at`
	);
	const batch = checks.map((check) => {
		const failed = isFailureOutcome(check.outcome);
		const failures = failed ? (previous.get(check.productId) ?? 0) + 1 : 0;
		const next = new Date(
			now.getTime() + (failed ? backoffMs(failures) : intervalHours * HOUR_MS)
		).toISOString();
		return statement.bind(
			check.productId,
			next,
			nowIso,
			failed ? null : nowIso,
			check.outcome,
			failed ? (check.errorCode ?? null) : null,
			failed ? (check.errorDetail ?? null) : null,
			failures,
			nowIso,
			failed ? null : nowIso
		);
	});
	for (let start = 0; start < batch.length; start += D1_CHUNK) {
		await db.batch(batch.slice(start, start + D1_CHUNK));
	}
}

export type CoverageStats = {
	total: number;
	/** Já vinculados a itemId/shopId. */
	identified: number;
	/** Podem ser identificados (link curto ou URL com IDs) mas ainda não têm itemId/shopId. */
	pendingIdentification: number;
	/** Sem nenhum caminho de identificação: fora da fila automática. */
	noIdentifier: number;
	/** Produtos na fila (identificados ou identificáveis). */
	eligible: number;
	/** Verificados com sucesso dentro do ciclo atual (próxima verificação ainda no futuro). */
	monitored: number;
	neverChecked: number;
	/** Verificados antes, com a próxima verificação já vencida. */
	due: number;
	failing: number;
	/** monitored / eligible, 0–100. */
	coveragePercent: number;
	nextCheckAt: string | null;
};

export async function getCoverageStats(db: D1Database, now: Date): Promise<CoverageStats> {
	const nowIso = now.toISOString();
	const row = await db
		.prepare(
			`SELECT
				COUNT(*) AS total,
				COALESCE(SUM(p.item_id IS NOT NULL), 0) AS identified,
				COALESCE(SUM(${ELIGIBLE_SQL}), 0) AS eligible,
				COALESCE(SUM(${ELIGIBLE_SQL} AND s.product_id IS NULL), 0) AS never_checked,
				COALESCE(SUM(${ELIGIBLE_SQL} AND s.product_id IS NOT NULL AND s.consecutive_failures = 0 AND s.next_check_at > ?), 0) AS monitored,
				COALESCE(SUM(${ELIGIBLE_SQL} AND s.product_id IS NOT NULL AND s.consecutive_failures = 0 AND s.next_check_at <= ?), 0) AS due,
				COALESCE(SUM(${ELIGIBLE_SQL} AND s.consecutive_failures > 0), 0) AS failing,
				MIN(CASE WHEN ${ELIGIBLE_SQL} THEN s.next_check_at END) AS next_check_at
			FROM products p LEFT JOIN product_monitor_state s ON s.product_id = p.id`
		)
		.bind(nowIso, nowIso)
		.first<{
			total: number;
			identified: number;
			eligible: number;
			never_checked: number;
			monitored: number;
			due: number;
			failing: number;
			next_check_at: string | null;
		}>();
	const total = row?.total ?? 0;
	const eligible = row?.eligible ?? 0;
	const monitored = row?.monitored ?? 0;
	return {
		total,
		identified: row?.identified ?? 0,
		pendingIdentification: Math.max(0, eligible - (row?.identified ?? 0)),
		noIdentifier: Math.max(0, total - eligible),
		eligible,
		monitored,
		neverChecked: row?.never_checked ?? 0,
		due: row?.due ?? 0,
		failing: row?.failing ?? 0,
		coveragePercent: eligible > 0 ? Math.round((monitored / eligible) * 1000) / 10 : 0,
		nextCheckAt: row?.next_check_at ?? null
	};
}

export type FailingProduct = {
	product_id: string;
	name: string;
	last_outcome: QueueOutcome;
	last_error_code: string | null;
	last_error_detail: string | null;
	consecutive_failures: number;
	last_checked_at: string | null;
	next_check_at: string;
};

export async function listFailingProducts(db: D1Database, limit = 25): Promise<FailingProduct[]> {
	const result = await db
		.prepare(
			`SELECT s.product_id, p.name, s.last_outcome, s.last_error_code, s.last_error_detail,
				s.consecutive_failures, s.last_checked_at, s.next_check_at
			FROM product_monitor_state s JOIN products p ON p.id = s.product_id
			WHERE s.consecutive_failures > 0
			ORDER BY s.consecutive_failures DESC, s.last_checked_at DESC LIMIT ?`
		)
		.bind(limit)
		.all<FailingProduct>();
	return result.results;
}

export async function countFailuresByCode(db: D1Database): Promise<Array<{ code: string; count: number }>> {
	const result = await db
		.prepare(
			`SELECT COALESCE(last_error_code, 'desconhecido') AS code, COUNT(*) AS count
			FROM product_monitor_state WHERE consecutive_failures > 0
			GROUP BY code ORDER BY count DESC LIMIT 20`
		)
		.all<{ code: string; count: number }>();
	return result.results;
}

/** Zera as falhas para que produtos em recuo voltem à fila na próxima execução. */
export async function requeueFailedProducts(db: D1Database, now: Date): Promise<number> {
	const result = await db
		.prepare(
			`UPDATE product_monitor_state SET next_check_at = ?, updated_at = ?
			WHERE consecutive_failures > 0 AND next_check_at > ?`
		)
		.bind(now.toISOString(), now.toISOString(), now.toISOString())
		.run();
	return Number(result.meta.changes ?? 0);
}

export type SchedulerHeartbeat = { lastTickAt: string; lastResult: string; lastRunId: number | null };

export async function recordSchedulerHeartbeat(
	db: D1Database,
	result: string,
	runId: number | null,
	now: Date
): Promise<void> {
	await db
		.prepare(
			`INSERT INTO monitor_scheduler_heartbeat (id, last_tick_at, last_result, last_run_id)
			VALUES (1, ?, ?, ?)
			ON CONFLICT(id) DO UPDATE SET last_tick_at = excluded.last_tick_at,
				last_result = excluded.last_result, last_run_id = excluded.last_run_id`
		)
		.bind(now.toISOString(), result.slice(0, 120), runId)
		.run();
}

export async function getSchedulerHeartbeat(db: D1Database): Promise<SchedulerHeartbeat | null> {
	const row = await db
		.prepare('SELECT last_tick_at, last_result, last_run_id FROM monitor_scheduler_heartbeat WHERE id = 1')
		.first<{ last_tick_at: string; last_result: string; last_run_id: number | null }>();
	return row
		? { lastTickAt: row.last_tick_at, lastResult: row.last_result, lastRunId: row.last_run_id }
		: null;
}
