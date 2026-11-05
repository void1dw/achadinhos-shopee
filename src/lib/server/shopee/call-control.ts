/**
 * Controle central das chamadas HTTP à Shopee Affiliate API.
 *
 * Cada requisição HTTP GraphQL reserva uma unidade do orçamento horário (autoimposto,
 * configurável em `monitor_settings`; não é um limite oficial da Shopee) de forma atômica no D1
 * antes de ser enviada. A reserva nunca é devolvida: após timeout ou falha de transporte a Shopee
 * pode ter recebido a requisição.
 */

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const PENDING_STALE_MS = 5 * 60 * 1000;
const RETENTION_MS = 7 * DAY_MS;
const CLEANUP_INTERVAL_MS = 6 * HOUR_MS;
const DEFAULT_HOURLY_BUDGET = 100;

export type CallOutcome =
	| 'success'
	| 'rate_limited'
	| 'timeout'
	| 'transport_error'
	| 'http_error'
	| 'graphql_error'
	| 'invalid_response';

export type CallSettlement = { outcome: CallOutcome; httpStatus?: number; errorCode?: string };

export type CallReservation =
	| { ok: true; id: number | null }
	| { ok: false; reason: 'budget_exhausted' | 'control_unavailable' };

export interface ShopeeCallControl {
	reserve(): Promise<CallReservation>;
	/** Nunca lança: falhas de contabilização são registradas em best effort. */
	settle(reservationId: number | null, settlement: CallSettlement): Promise<void>;
	/** Controle derivado cujas reservas contam como retentativas; compartilha os contadores. */
	forRetry(): ShopeeCallControl;
	readonly counters: { reserved: number; retries: number };
}

// Throttle por banco: instancias que compartilham o mesmo D1 dividem o intervalo;
// bancos distintos sao independentes.
const lastCleanupByDb = new WeakMap<D1Database, number>();

async function recordControlEvent(
	db: D1Database,
	kind: 'reserve_denied' | 'reserve_failed' | 'settle_failed',
	source: string,
	detail: string | null,
	now: Date
): Promise<void> {
	try {
		await db
			.prepare(
				'INSERT INTO shopee_api_control_events (kind, source, occurred_at, detail) VALUES (?, ?, ?, ?)'
			)
			.bind(kind, source, now.toISOString(), detail)
			.run();
	} catch {
		console.error('Shopee API control event recording failed.');
	}
}

/** Marca reservas antigas sem desfecho como abandonadas e remove registros além da retenção. */
export async function cleanupCallControl(db: D1Database, now = new Date()): Promise<void> {
	await db.batch([
		db
			.prepare(
				"UPDATE shopee_api_calls SET outcome = 'abandoned', settled_at = ? WHERE outcome = 'pending' AND reserved_at < ?"
			)
			.bind(now.toISOString(), new Date(now.getTime() - PENDING_STALE_MS).toISOString()),
		db
			.prepare('DELETE FROM shopee_api_calls WHERE reserved_at < ?')
			.bind(new Date(now.getTime() - RETENTION_MS).toISOString()),
		db
			.prepare('DELETE FROM shopee_api_control_events WHERE occurred_at < ?')
			.bind(new Date(now.getTime() - RETENTION_MS).toISOString())
	]);
}

async function maybeCleanup(db: D1Database, now: Date): Promise<void> {
	if (now.getTime() - (lastCleanupByDb.get(db) ?? 0) < CLEANUP_INTERVAL_MS) return;
	lastCleanupByDb.set(db, now.getTime());
	try {
		await cleanupCallControl(db, now);
	} catch {
		lastCleanupByDb.delete(db);
		console.error('Shopee API control cleanup failed.');
	}
}

export function createD1CallControl(
	db: D1Database,
	source: string,
	options: { now?: () => Date } = {}
): ShopeeCallControl {
	const clock = options.now ?? (() => new Date());
	const counters = { reserved: 0, retries: 0 };

	const build = (isRetry: boolean): ShopeeCallControl => ({
		counters,
		forRetry: () => build(true),
		async reserve() {
			const now = clock();
			try {
				await maybeCleanup(db, now);
				const since = new Date(now.getTime() - HOUR_MS).toISOString();
				// Um único statement: a checagem do saldo e a inserção são atômicas no D1.
				const result = await db
					.prepare(
						`INSERT INTO shopee_api_calls (source, reserved_at, is_retry)
						SELECT ?, ?, ?
						WHERE (SELECT COUNT(*) FROM shopee_api_calls WHERE reserved_at >= ?)
							+ (SELECT COALESCE(SUM(calls), 0) FROM shopee_api_usage WHERE occurred_at >= ?)
							< COALESCE((SELECT hourly_call_budget FROM monitor_settings WHERE id = 1), ?)`
					)
					.bind(source, now.toISOString(), isRetry ? 1 : 0, since, since, DEFAULT_HOURLY_BUDGET)
					.run();
				if (result.meta.changes !== 1) {
					await recordControlEvent(db, 'reserve_denied', source, null, now);
					return { ok: false, reason: 'budget_exhausted' };
				}
				const rowId = Number(result.meta.last_row_id);
				if (!Number.isSafeInteger(rowId) || rowId <= 0) {
					// Sem identificador a reserva não pode ser liquidada; a chamada não é autorizada.
					await recordControlEvent(db, 'reserve_failed', source, 'invalid_reservation_id', now);
					return { ok: false, reason: 'control_unavailable' };
				}
				counters.reserved += 1;
				if (isRetry) counters.retries += 1;
				return { ok: true, id: rowId };
			} catch {
				await recordControlEvent(db, 'reserve_failed', source, null, now);
				return { ok: false, reason: 'control_unavailable' };
			}
		},
		async settle(reservationId, settlement) {
			if (reservationId === null) return;
			try {
				const result = await db
					.prepare(
						"UPDATE shopee_api_calls SET outcome = ?, http_status = ?, error_code = ?, settled_at = ? WHERE id = ? AND outcome = 'pending'"
					)
					.bind(
						settlement.outcome,
						settlement.httpStatus ?? null,
						settlement.errorCode ?? null,
						clock().toISOString(),
						reservationId
					)
					.run();
				if (result.meta.changes !== 1) {
					await recordControlEvent(
						db,
						'settle_failed',
						source,
						`no_pending_row:${settlement.outcome}`,
						clock()
					);
				}
			} catch {
				await recordControlEvent(db, 'settle_failed', source, settlement.outcome, clock());
			}
		}
	});
	return build(false);
}

/** Controle em memória para testes unitários (sem D1). */
export function createMemoryCallControl(options: { budget: number }): ShopeeCallControl & {
	readonly settlements: CallSettlement[];
	readonly retryFlags: boolean[];
} {
	const counters = { reserved: 0, retries: 0 };
	const settlements: CallSettlement[] = [];
	const retryFlags: boolean[] = [];
	const build = (isRetry: boolean): ShopeeCallControl => ({
		counters,
		forRetry: () => build(true),
		async reserve() {
			if (counters.reserved >= options.budget) return { ok: false, reason: 'budget_exhausted' };
			counters.reserved += 1;
			if (isRetry) counters.retries += 1;
			retryFlags.push(isRetry);
			return { ok: true, id: counters.reserved };
		},
		async settle(_id, settlement) {
			settlements.push(settlement);
		}
	});
	return Object.assign(build(false), { settlements, retryFlags });
}
