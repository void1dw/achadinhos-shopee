import type { Product } from '../../types';
import { toProduct, type ProductRow } from '../product-store';
import type { AuditDetail, AuditResult, AuditStatus, MatchLevel } from './product-match';

const STALE_RUN_MS = 15 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const D1_CHUNK = 50;

export type MonitorSettings = {
	paused: boolean;
	intervalHours: number;
	batchSize: number;
	hourlyCallBudget: number;
	updatePrices: boolean;
	updatedAt: string;
};

export const DEFAULT_MONITOR_SETTINGS: MonitorSettings = {
	paused: true,
	intervalHours: 12,
	batchSize: 20,
	hourlyCallBudget: 100,
	updatePrices: false,
	updatedAt: ''
};

export type MonitorSettingsInput = Partial<Omit<MonitorSettings, 'updatedAt'>>;

export class MonitorSettingsError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'MonitorSettingsError';
	}
}

function boundedInteger(value: unknown, label: string, min: number, max: number): number {
	if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
		throw new MonitorSettingsError(`${label} deve ser um inteiro entre ${min} e ${max}.`);
	}
	return value;
}

export function validateMonitorSettings(input: MonitorSettingsInput): MonitorSettingsInput {
	const result: MonitorSettingsInput = {};
	if (input.paused !== undefined) {
		if (typeof input.paused !== 'boolean') throw new MonitorSettingsError('Estado inválido.');
		result.paused = input.paused;
	}
	if (input.updatePrices !== undefined) {
		if (typeof input.updatePrices !== 'boolean') throw new MonitorSettingsError('Estado inválido.');
		result.updatePrices = input.updatePrices;
	}
	if (input.intervalHours !== undefined) {
		result.intervalHours = boundedInteger(input.intervalHours, 'O intervalo (horas)', 1, 168);
	}
	if (input.batchSize !== undefined) {
		result.batchSize = boundedInteger(input.batchSize, 'O lote por execução', 1, 50);
	}
	if (input.hourlyCallBudget !== undefined) {
		result.hourlyCallBudget = boundedInteger(
			input.hourlyCallBudget,
			'O orçamento de chamadas por hora',
			1,
			2000
		);
	}
	return result;
}

type SettingsRow = {
	paused: number;
	interval_hours: number;
	batch_size: number;
	hourly_call_budget: number;
	update_prices: number;
	updated_at: string;
};

export async function getMonitorSettings(db: D1Database): Promise<MonitorSettings> {
	const row = await db
		.prepare(
			'SELECT paused, interval_hours, batch_size, hourly_call_budget, update_prices, updated_at FROM monitor_settings WHERE id = 1'
		)
		.first<SettingsRow>();
	if (!row) return DEFAULT_MONITOR_SETTINGS;
	return {
		paused: row.paused === 1,
		intervalHours: row.interval_hours,
		batchSize: row.batch_size,
		hourlyCallBudget: row.hourly_call_budget,
		updatePrices: row.update_prices === 1,
		updatedAt: row.updated_at
	};
}

export async function updateMonitorSettings(
	db: D1Database,
	input: MonitorSettingsInput
): Promise<MonitorSettings> {
	const values = validateMonitorSettings(input);
	const current = await getMonitorSettings(db);
	const next = { ...current, ...values };
	await db
		.prepare(
			`INSERT INTO monitor_settings (id, paused, interval_hours, batch_size, hourly_call_budget, update_prices, updated_at)
			VALUES (1, ?, ?, ?, ?, ?, ?)
			ON CONFLICT(id) DO UPDATE SET paused = excluded.paused,
				interval_hours = excluded.interval_hours, batch_size = excluded.batch_size,
				hourly_call_budget = excluded.hourly_call_budget,
				update_prices = excluded.update_prices, updated_at = excluded.updated_at`
		)
		.bind(
			next.paused ? 1 : 0,
			next.intervalHours,
			next.batchSize,
			next.hourlyCallBudget,
			next.updatePrices ? 1 : 0,
			new Date().toISOString()
		)
		.run();
	return getMonitorSettings(db);
}

export type MonitorTrigger = 'manual' | 'scheduled';
export type MonitorRunStatus = 'running' | 'completed' | 'partial' | 'failed';

export type MonitorRunRow = {
	id: number;
	trigger: MonitorTrigger;
	status: MonitorRunStatus;
	products_checked: number;
	discovery_searches: number;
	api_calls: number;
	price_changes: number;
	unavailable: number;
	failures: number;
	retries: number;
	error_code: string | null;
	error_message: string | null;
	started_at: string;
	finished_at: string | null;
};

export type MonitorRunTotals = Pick<
	MonitorRunRow,
	| 'products_checked'
	| 'discovery_searches'
	| 'api_calls'
	| 'price_changes'
	| 'unavailable'
	| 'failures'
	| 'retries'
>;

/** Retorna o id da execução, ou null se outra já estiver em andamento (e não estiver expirada). */
export async function startMonitorRun(
	db: D1Database,
	trigger: MonitorTrigger,
	now: Date
): Promise<number | null> {
	const nowIso = now.toISOString();
	await db
		.prepare(
			`UPDATE monitor_runs SET status = 'failed', error_code = 'STALE_RUN',
				error_message = 'Execução anterior interrompida sem finalizar.', finished_at = ?
			WHERE status = 'running' AND started_at < ?`
		)
		.bind(nowIso, new Date(now.getTime() - STALE_RUN_MS).toISOString())
		.run();
	try {
		const result = await db
			.prepare(`INSERT INTO monitor_runs (trigger, status, started_at) VALUES (?, 'running', ?)`)
			.bind(trigger, nowIso)
			.run();
		return Number(result.meta.last_row_id);
	} catch (error) {
		if (error instanceof Error && /UNIQUE|constraint/i.test(error.message)) return null;
		throw error;
	}
}

export async function finishMonitorRun(
	db: D1Database,
	id: number,
	status: Exclude<MonitorRunStatus, 'running'>,
	totals: MonitorRunTotals,
	error: { code: string; message: string } | null,
	now: Date
): Promise<void> {
	await db
		.prepare(
			`UPDATE monitor_runs SET status = ?, products_checked = ?, discovery_searches = ?,
				api_calls = ?, price_changes = ?, unavailable = ?, failures = ?, retries = ?,
				error_code = ?, error_message = ?, finished_at = ?
			WHERE id = ?`
		)
		.bind(
			status,
			totals.products_checked,
			totals.discovery_searches,
			totals.api_calls,
			totals.price_changes,
			totals.unavailable,
			totals.failures,
			totals.retries,
			error?.code ?? null,
			error?.message ?? null,
			now.toISOString(),
			id
		)
		.run();
}

export async function listMonitorRuns(db: D1Database, limit = 20): Promise<MonitorRunRow[]> {
	const result = await db
		.prepare('SELECT * FROM monitor_runs ORDER BY started_at DESC, id DESC LIMIT ?')
		.bind(limit)
		.all<MonitorRunRow>();
	return result.results;
}

export async function recordApiUsage(
	db: D1Database,
	source: string,
	calls: number,
	rateLimited: boolean,
	now = new Date()
): Promise<void> {
	if (calls <= 0) return;
	await db
		.prepare(
			'INSERT INTO shopee_api_usage (source, calls, rate_limited, occurred_at) VALUES (?, ?, ?, ?)'
		)
		.bind(source, calls, rateLimited ? 1 : 0, now.toISOString())
		.run();
}

export type ApiUsage = {
	callsLastHour: number;
	rateLimitedLast24h: number;
	lastRateLimitAt: string | null;
};

export async function getApiUsage(db: D1Database, now = new Date()): Promise<ApiUsage> {
	const hourAgo = new Date(now.getTime() - HOUR_MS).toISOString();
	const dayAgo = new Date(now.getTime() - 24 * HOUR_MS).toISOString();
	// `shopee_api_usage` é o registro legado (anterior ao controle central) e segue somado.
	const [calls, legacy] = await Promise.all([
		db
			.prepare(
				`SELECT
					COALESCE(SUM(CASE WHEN reserved_at >= ? THEN 1 ELSE 0 END), 0) AS calls_last_hour,
					COALESCE(SUM(CASE WHEN outcome = 'rate_limited' THEN 1 ELSE 0 END), 0) AS rate_limited,
					MAX(CASE WHEN outcome = 'rate_limited' THEN reserved_at END) AS last_rate_limit
				FROM shopee_api_calls WHERE reserved_at >= ?`
			)
			.bind(hourAgo, dayAgo)
			.first<{ calls_last_hour: number; rate_limited: number; last_rate_limit: string | null }>(),
		db
			.prepare(
				`SELECT
					COALESCE(SUM(CASE WHEN occurred_at >= ? THEN calls ELSE 0 END), 0) AS calls_last_hour,
					COALESCE(SUM(CASE WHEN rate_limited = 1 THEN 1 ELSE 0 END), 0) AS rate_limited,
					MAX(CASE WHEN rate_limited = 1 THEN occurred_at END) AS last_rate_limit
				FROM shopee_api_usage WHERE occurred_at >= ?`
			)
			.bind(hourAgo, dayAgo)
			.first<{ calls_last_hour: number; rate_limited: number; last_rate_limit: string | null }>()
	]);
	const lastRateLimit = [calls?.last_rate_limit, legacy?.last_rate_limit]
		.filter((value): value is string => typeof value === 'string')
		.sort()
		.at(-1);
	return {
		callsLastHour: (calls?.calls_last_hour ?? 0) + (legacy?.calls_last_hour ?? 0),
		rateLimitedLast24h: (calls?.rate_limited ?? 0) + (legacy?.rate_limited ?? 0),
		lastRateLimitAt: lastRateLimit ?? null
	};
}

export type ApiControlStats = {
	bySource: { source: string; calls: number; retries: number }[];
	retriesLastHour: number;
	reserveDeniedLast24h: number;
	reserveFailedLast24h: number;
	settleFailedLast24h: number;
};

/** Estatísticas do controle central de chamadas (consumo por origem, retries e falhas). */
export async function getApiControlStats(
	db: D1Database,
	now = new Date()
): Promise<ApiControlStats> {
	const hourAgo = new Date(now.getTime() - HOUR_MS).toISOString();
	const dayAgo = new Date(now.getTime() - 24 * HOUR_MS).toISOString();
	const [sources, events] = await Promise.all([
		db
			.prepare(
				`SELECT source, COUNT(*) AS calls, COALESCE(SUM(is_retry), 0) AS retries
				FROM shopee_api_calls WHERE reserved_at >= ?
				GROUP BY source ORDER BY calls DESC, source`
			)
			.bind(hourAgo)
			.all<{ source: string; calls: number; retries: number }>(),
		db
			.prepare(
				'SELECT kind, COUNT(*) AS n FROM shopee_api_control_events WHERE occurred_at >= ? GROUP BY kind'
			)
			.bind(dayAgo)
			.all<{ kind: string; n: number }>()
	]);
	const count = (kind: string) => events.results.find((row) => row.kind === kind)?.n ?? 0;
	return {
		bySource: sources.results,
		retriesLastHour: sources.results.reduce((sum, row) => sum + row.retries, 0),
		reserveDeniedLast24h: count('reserve_denied'),
		reserveFailedLast24h: count('reserve_failed'),
		settleFailedLast24h: count('settle_failed')
	};
}

export type MonitorAlert = {
	level: 'critical' | 'warning' | 'info';
	code: string;
	message: string;
};

export function computeMonitorAlerts(input: {
	settings: MonitorSettings;
	usage: ApiUsage;
	lastRun: MonitorRunRow | null;
	now: Date;
}): MonitorAlert[] {
	const { settings, usage, lastRun, now } = input;
	const alerts: MonitorAlert[] = [];
	if (usage.rateLimitedLast24h > 0) {
		alerts.push({
			level: 'critical',
			code: 'RATE_LIMIT_RECENT',
			message: `A Shopee informou limite de chamadas ${usage.rateLimitedLast24h} vez(es) nas últimas 24 horas${
				usage.lastRateLimitAt ? ` (último em ${usage.lastRateLimitAt})` : ''
			}. Reduza o lote ou aumente o intervalo.`
		});
	}
	if (lastRun && (lastRun.status === 'failed' || lastRun.status === 'partial')) {
		alerts.push({
			level: 'warning',
			code: 'LAST_RUN_PROBLEM',
			message: `A última execução terminou como ${lastRun.status === 'failed' ? 'falha' : 'parcial'}${
				lastRun.error_code ? ` (${lastRun.error_code})` : ''
			}.`
		});
	}
	if (settings.paused) {
		alerts.push({
			level: 'info',
			code: 'ROUTINE_PAUSED',
			message: 'A rotina automática está pausada. Execuções manuais continuam disponíveis.'
		});
	} else {
		const last = lastRun?.finished_at ? Date.parse(lastRun.finished_at) : NaN;
		if (!Number.isFinite(last) || now.getTime() - last > settings.intervalHours * 2 * HOUR_MS) {
			alerts.push({
				level: 'warning',
				code: 'ROUTINE_STALE',
				message:
					'A rotina está ativa, mas não há execução recente. O agendamento Cloudflare ainda não está configurado: execute manualmente ou configure o Cron Trigger.'
			});
		}
	}
	return alerts;
}

export type MonitorEventType = 'price_changed' | 'unavailable' | 'available_again';

export type MonitorEventInput = {
	runId: number | null;
	productId: string;
	itemId: string | null;
	shopId: string | null;
	eventType: MonitorEventType;
	previousPrice: number | null;
	currentPrice: number | null;
	previousPriceMax: number | null;
	currentPriceMax: number | null;
};

export type MonitorEventRow = {
	id: number;
	run_id: number | null;
	product_id: string;
	product_name: string | null;
	item_id: string | null;
	shop_id: string | null;
	event_type: MonitorEventType;
	previous_price: number | null;
	current_price: number | null;
	previous_price_max: number | null;
	current_price_max: number | null;
	detected_at: string;
};

export async function listMonitorEvents(db: D1Database, limit = 50): Promise<MonitorEventRow[]> {
	const result = await db
		.prepare(
			`SELECT e.id, e.run_id, e.product_id, p.name AS product_name, e.item_id, e.shop_id,
				e.event_type, e.previous_price, e.current_price, e.previous_price_max,
				e.current_price_max, e.detected_at
			FROM product_monitor_events e LEFT JOIN products p ON p.id = e.product_id
			ORDER BY e.detected_at DESC, e.id DESC LIMIT ?`
		)
		.bind(limit)
		.all<MonitorEventRow>();
	return result.results;
}

type AuditRow = {
	product_id: string;
	status: AuditStatus;
	match_level: MatchLevel;
	item_id: string | null;
	shop_id: string | null;
	sheet_price: number;
	sheet_price_max: number | null;
	api_price_min: number | null;
	api_price_max: number | null;
	api_product_name: string | null;
	detail: string;
	last_observed_at: string | null;
	verified_at: string;
};

export type StoredAudit = Omit<AuditRow, 'detail'> & {
	detail: AuditDetail;
	product_name?: string;
	product_url?: string;
	product_category?: string;
};

function parseDetail(text: string): AuditDetail {
	try {
		const parsed: unknown = JSON.parse(text);
		if (
			typeof parsed === 'object' &&
			parsed !== null &&
			Array.isArray((parsed as AuditDetail).reasons)
		) {
			return parsed as AuditDetail;
		}
	} catch {
		// detalhe corrompido não deve derrubar a listagem
	}
	return { reasons: [] };
}

function chunks<T>(items: readonly T[], size: number): T[][] {
	const result: T[][] = [];
	for (let start = 0; start < items.length; start += size) {
		result.push(items.slice(start, start + size));
	}
	return result;
}

export async function getAudits(
	db: D1Database,
	productIds: readonly string[]
): Promise<Map<string, StoredAudit>> {
	const audits = new Map<string, StoredAudit>();
	for (const ids of chunks(productIds, D1_CHUNK)) {
		const result = await db
			.prepare(
				`SELECT * FROM product_audits WHERE product_id IN (${ids.map(() => '?').join(', ')})`
			)
			.bind(...ids)
			.all<AuditRow>();
		for (const row of result.results) {
			audits.set(row.product_id, { ...row, detail: parseDetail(row.detail) });
		}
	}
	return audits;
}

const UPSERT_AUDIT_SQL = `INSERT INTO product_audits
	(product_id, status, match_level, item_id, shop_id, sheet_price, sheet_price_max,
	api_price_min, api_price_max, api_product_name, detail, last_observed_at, verified_at, updated_at)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(product_id) DO UPDATE SET
	status = excluded.status, match_level = excluded.match_level, item_id = excluded.item_id,
	shop_id = excluded.shop_id, sheet_price = excluded.sheet_price,
	sheet_price_max = excluded.sheet_price_max, api_price_min = excluded.api_price_min,
	api_price_max = excluded.api_price_max, api_product_name = excluded.api_product_name,
	detail = excluded.detail, last_observed_at = excluded.last_observed_at,
	verified_at = excluded.verified_at, updated_at = excluded.updated_at`;

const WRITE_BATCH_SIZE = 25;

/** Grava auditorias e eventos de monitoramento. Nunca altera a tabela `products`. */
export async function saveAuditResults(
	db: D1Database,
	results: readonly AuditResult[],
	events: readonly MonitorEventInput[],
	now: Date
): Promise<void> {
	const nowIso = now.toISOString();
	const statements = [
		...results.map((result) =>
			db
				.prepare(UPSERT_AUDIT_SQL)
				.bind(
					result.productId,
					result.status,
					result.matchLevel,
					result.itemId,
					result.shopId,
					result.sheetPrice,
					result.sheetPriceMax,
					result.apiPriceMin,
					result.apiPriceMax,
					result.apiProductName,
					JSON.stringify(result.detail),
					result.lastObservedAt,
					nowIso,
					nowIso
				)
		),
		...events.map((event) =>
			db
				.prepare(
					`INSERT INTO product_monitor_events
					(run_id, product_id, item_id, shop_id, event_type, previous_price, current_price,
					previous_price_max, current_price_max, detected_at)
					VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
				)
				.bind(
					event.runId,
					event.productId,
					event.itemId,
					event.shopId,
					event.eventType,
					event.previousPrice,
					event.currentPrice,
					event.previousPriceMax,
					event.currentPriceMax,
					nowIso
				)
		)
	];
	for (const batch of chunks(statements, WRITE_BATCH_SIZE)) await db.batch(batch);
}

export type AuditFilters = { status?: AuditStatus; search?: string; limit: number; offset: number };

export async function listAudits(db: D1Database, filters: AuditFilters): Promise<StoredAudit[]> {
	const clauses: string[] = [];
	const values: (string | number)[] = [];
	if (filters.status) {
		clauses.push('a.status = ?');
		values.push(filters.status);
	}
	const search = filters.search?.trim().slice(0, 100);
	if (search) {
		clauses.push('(instr(lower(p.name), lower(?)) > 0 OR a.product_id = ? OR a.item_id = ?)');
		values.push(search, search, search);
	}
	const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
	const result = await db
		.prepare(
			`SELECT a.*, p.name AS product_name, p.url AS product_url, p.category AS product_category
			FROM product_audits a JOIN products p ON p.id = a.product_id ${where}
			ORDER BY a.verified_at DESC, a.product_id ASC LIMIT ? OFFSET ?`
		)
		.bind(...values, filters.limit, filters.offset)
		.all<AuditRow & { product_name: string; product_url: string; product_category: string }>();
	return result.results.map((row) => ({ ...row, detail: parseDetail(row.detail) }));
}

export type AuditCounts = {
	totalProducts: number;
	linkedProducts: number;
	audited: number;
	byStatus: Record<AuditStatus, number>;
	lastVerifiedAt: string | null;
};

export async function getAuditCounts(db: D1Database): Promise<AuditCounts> {
	const [totals, byStatus] = await Promise.all([
		db
			.prepare(
				`SELECT (SELECT count(*) FROM products) AS total,
					(SELECT count(*) FROM products WHERE item_id IS NOT NULL) AS linked,
					(SELECT max(verified_at) FROM product_audits) AS last_verified`
			)
			.first<{ total: number; linked: number; last_verified: string | null }>(),
		db
			.prepare('SELECT status, count(*) AS total FROM product_audits GROUP BY status')
			.all<{ status: AuditStatus; total: number }>()
	]);
	const counts: Record<AuditStatus, number> = {
		valid: 0,
		price_changed: 0,
		unavailable: 0,
		uncertain: 0,
		needs_review: 0
	};
	let audited = 0;
	for (const row of byStatus.results) {
		counts[row.status] = row.total;
		audited += row.total;
	}
	return {
		totalProducts: totals?.total ?? 0,
		linkedProducts: totals?.linked ?? 0,
		audited,
		byStatus: counts,
		lastVerifiedAt: totals?.last_verified ?? null
	};
}

export type AuditTarget = {
	product: Product;
	itemId: string | null;
	shopId: string | null;
};

type TargetRow = ProductRow;

const IDENTIFIABLE_URL_LIKE = ['%shopee.com.br/product/%', '%shopee.com.br/%-i.%'] as const;

function toTargets(rows: readonly TargetRow[]): AuditTarget[] {
	return rows.map((row) => ({ product: toProduct(row), itemId: row.item_id, shopId: row.shop_id }));
}

/** Produtos sem nenhum identificador: candidatos à descoberta por nome. */
export async function selectDiscoveryTargets(
	db: D1Database,
	cutoff: Date,
	limit: number
): Promise<AuditTarget[]> {
	if (limit <= 0) return [];
	const result = await db
		.prepare(
			`SELECT p.* FROM products p LEFT JOIN product_audits a ON a.product_id = p.id
			WHERE p.item_id IS NULL AND p.url NOT LIKE ? AND p.url NOT LIKE ?
				AND p.url NOT LIKE 'https://s.shopee.com.br/%'
				AND (a.verified_at IS NULL OR a.verified_at < ?)
			ORDER BY (a.verified_at IS NOT NULL), a.verified_at ASC, p.id ASC LIMIT ?`
		)
		.bind(...IDENTIFIABLE_URL_LIKE, cutoff.toISOString(), limit)
		.all<TargetRow>();
	return toTargets(result.results);
}

export type LatestObservation = { price: number | null; observedAt: string };

/** Observação de mercado mais recente por itemId/shopId (histórico dos candidatos). */
export async function getLatestObservations(
	db: D1Database,
	pairs: ReadonlyArray<{ itemId: string; shopId: string }>
): Promise<Map<string, LatestObservation>> {
	const observations = new Map<string, LatestObservation>();
	for (const batch of chunks(pairs, D1_CHUNK)) {
		const result = await db
			.prepare(
				`SELECT item_id, shop_id, price_min, price, max(observed_at) AS observed_at
				FROM candidate_price_observations
				WHERE (item_id, shop_id) IN (${batch.map(() => '(?, ?)').join(', ')})
				GROUP BY item_id, shop_id`
			)
			.bind(...batch.flatMap((pair) => [pair.itemId, pair.shopId]))
			.all<{
				item_id: string;
				shop_id: string;
				price_min: string | null;
				price: string | null;
				observed_at: string;
			}>();
		for (const row of result.results) {
			const raw = row.price_min ?? row.price;
			const price = raw !== null && /^\s*\d+(?:\.\d+)?\s*$/.test(raw) ? Number(raw) : null;
			observations.set(`${row.item_id}\u0000${row.shop_id}`, {
				price: price !== null && price > 0 ? price : null,
				observedAt: row.observed_at
			});
		}
	}
	return observations;
}
