import type { ShopeeProductOfferRecord } from './client';
import { scoreCandidate, type CandidateScore } from './candidate-scoring';
import { discoveryFilterSql, type DiscoveryFilters } from './discovery-filters';

const MIN_REFERENCE_INTERVAL_MS = 12 * 60 * 60 * 1000;

export type CandidateStatus = 'pending' | 'approved' | 'rejected';
export type CandidateSearchType = 'general' | 'keyword' | 'category';
export type CandidateDecision = Exclude<CandidateStatus, 'pending'>;

export type CandidateFilters = {
	status?: CandidateStatus;
	search?: string;
	discovery?: DiscoveryFilters;
};

export type CandidateHistory = {
	observation_count: number;
	first_observed_at: string | null;
	last_observed_at: string | null;
	min_observed_price: number | null;
	max_observed_price: number | null;
	current_price: string | null;
	previous_price: string | null;
	price_change_percent: number | null;
	previous_sales: string | null;
	current_sales: string | null;
	sales_change: string | null;
	latest_commission_rate: string | null;
	/** Observação mais recente com pelo menos 12h de distância da atual, e variação até ela. */
	reference_observed_at: string | null;
	reference_price: string | null;
	reference_price_change_percent: number | null;
};

export type CandidateView = {
	item_id: string;
	shop_id: string;
	product_name: string | null;
	product_link: string | null;
	offer_link: string | null;
	image_url: string | null;
	price: string | null;
	price_min: string | null;
	price_max: string | null;
	price_discount_rate: string | null;
	commission_rate: string | null;
	sales: string | null;
	rating_star: string | null;
	product_cat_ids: number[] | null;
	status: CandidateStatus;
	rejection_reason: string | null;
	first_seen_at: string;
	last_seen_at: string;
	created_at: string;
	updated_at: string;
	history: CandidateHistory;
	score: CandidateScore;
};

export type CandidateUpsertCounts = {
	newCandidates: number;
	updatedCandidates: number;
};

function scalarText(value: string | number | null | undefined): string | null {
	return value === null || value === undefined ? null : String(value);
}

function categoryIdsText(value: number[] | null | undefined): string | null {
	return value === null || value === undefined ? null : JSON.stringify(value);
}

function candidateKey(itemId: string, shopId: string): string {
	return `${itemId}\u0000${shopId}`;
}

export type CandidateObservation = {
	id: number;
	item_id: string;
	shop_id: string;
	observed_at: string;
	price: string | null;
	sales: string | null;
	commission_rate: string | null;
};

function numericValue(value: string | number | null): number | null {
	if (value === null || (typeof value === 'string' && !value.trim())) return null;
	if (
		typeof value === 'string' &&
		!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim())
	) {
		return null;
	}
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : null;
}

function integerValue(value: string | null): bigint | null {
	if (value === null || !/^[+-]?\d+$/.test(value.trim())) return null;
	return BigInt(value.trim());
}

export function summarizeCandidateObservations(
	observations: readonly CandidateObservation[]
): CandidateHistory {
	const ordered = [...observations].sort(
		(a, b) =>
			(a.observed_at === b.observed_at ? 0 : a.observed_at < b.observed_at ? 1 : -1) || b.id - a.id
	);
	const latest = ordered[0];
	const previous = ordered[1];
	let minObservedPrice: number | null = null;
	let maxObservedPrice: number | null = null;
	for (const observation of ordered) {
		const price = numericValue(observation.price);
		if (price === null) continue;
		minObservedPrice = minObservedPrice === null ? price : Math.min(minObservedPrice, price);
		maxObservedPrice = maxObservedPrice === null ? price : Math.max(maxObservedPrice, price);
	}
	const previousPriceValue = previous ? numericValue(previous.price) : null;
	const latestPriceValue = latest ? numericValue(latest.price) : null;
	const previousSalesValue = previous ? integerValue(previous.sales) : null;
	const currentSalesValue = latest ? integerValue(latest.sales) : null;
	const commission = ordered.find((observation) =>
		observation.commission_rate?.trim()
	)?.commission_rate;

	const latestTime = latest ? Date.parse(latest.observed_at) : NaN;
	const referenceCandidates =
		Number.isFinite(latestTime) && latestPriceValue !== null && latestPriceValue > 0
			? ordered.slice(1)
			: [];
	const reference = referenceCandidates.find((observation) => {
		const time = Date.parse(observation.observed_at);
		const price = numericValue(observation.price);
		return (
			Number.isFinite(time) &&
			latestTime - time >= MIN_REFERENCE_INTERVAL_MS &&
			price !== null &&
			price > 0
		);
	});
	const referencePriceValue = reference ? numericValue(reference.price) : null;
	const referenceChange =
		referencePriceValue !== null &&
		referencePriceValue > 0 &&
		latestPriceValue !== null &&
		latestPriceValue > 0
			? ((latestPriceValue - referencePriceValue) / referencePriceValue) * 100
			: null;

	return {
		observation_count: ordered.length,
		first_observed_at: ordered.at(-1)?.observed_at ?? null,
		last_observed_at: latest?.observed_at ?? null,
		min_observed_price: minObservedPrice,
		max_observed_price: maxObservedPrice,
		current_price: latest?.price ?? null,
		previous_price: previous?.price ?? null,
		price_change_percent:
			previousPriceValue !== null &&
			previousPriceValue > 0 &&
			latestPriceValue !== null &&
			latestPriceValue > 0
				? ((latestPriceValue - previousPriceValue) / previousPriceValue) * 100
				: null,
		previous_sales: previousSalesValue === null ? null : (previous?.sales ?? null),
		current_sales: currentSalesValue === null ? null : (latest?.sales ?? null),
		sales_change:
			previousSalesValue !== null && currentSalesValue !== null
				? (currentSalesValue - previousSalesValue).toString()
				: null,
		latest_commission_rate: commission ?? null,
		reference_observed_at: reference?.observed_at ?? null,
		reference_price: reference?.price ?? null,
		reference_price_change_percent: referenceChange
	};
}

export async function upsertCandidates(
	db: D1Database,
	runId: number,
	offers: ShopeeProductOfferRecord[]
): Promise<CandidateUpsertCounts> {
	const uniqueOffers = new Map<string, ShopeeProductOfferRecord>();
	for (const offer of offers) {
		const itemId = scalarText(offer.product.itemId);
		const shopId = scalarText(offer.product.shopId);
		if (!itemId || !shopId) continue;
		uniqueOffers.set(candidateKey(itemId, shopId), offer);
	}

	const records = [...uniqueOffers.values()];
	if (records.length === 0) return { newCandidates: 0, updatedCandidates: 0 };

	const pairs = records.map(() => '(?, ?)').join(', ');
	const existingQuery = db
		.prepare(`SELECT item_id, shop_id FROM candidates WHERE (item_id, shop_id) IN (${pairs})`)
		.bind(
			...records.flatMap((offer) => [String(offer.product.itemId), String(offer.product.shopId)])
		);
	const writes = records.flatMap(({ product, rawData }) => {
		const itemId = String(product.itemId);
		const shopId = String(product.shopId);
		const upsert = db
			.prepare(
				`INSERT INTO candidates (
					item_id, shop_id, product_name, product_link, offer_link, image_url,
					price, price_min, price_max, price_discount_rate, commission_rate,
					sales, rating_star, product_cat_ids, raw_data
				) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
				ON CONFLICT (item_id, shop_id) DO UPDATE SET
					product_name = excluded.product_name,
					product_link = excluded.product_link,
					offer_link = excluded.offer_link,
					image_url = excluded.image_url,
					price = excluded.price,
					price_min = excluded.price_min,
					price_max = excluded.price_max,
					price_discount_rate = excluded.price_discount_rate,
					commission_rate = excluded.commission_rate,
					sales = excluded.sales,
					rating_star = excluded.rating_star,
					product_cat_ids = excluded.product_cat_ids,
					raw_data = excluded.raw_data,
					last_seen_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
					updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`
			)
			.bind(
				itemId,
				shopId,
				scalarText(product.productName),
				scalarText(product.productLink),
				scalarText(product.offerLink),
				scalarText(product.imageUrl),
				scalarText(product.price),
				scalarText(product.priceMin),
				scalarText(product.priceMax),
				scalarText(product.priceDiscountRate),
				scalarText(product.commissionRate),
				scalarText(product.sales),
				scalarText(product.ratingStar),
				categoryIdsText(product.productCatIds),
				JSON.stringify(rawData)
			);
		const observation = db
			.prepare(
				`INSERT INTO candidate_price_observations (
					item_id, shop_id, collection_run_id, price, price_min, price_max,
					price_discount_rate, commission_rate, sales, rating_star
				) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
				ON CONFLICT (collection_run_id, item_id, shop_id) DO NOTHING`
			)
			.bind(
				itemId,
				shopId,
				runId,
				scalarText(product.price),
				scalarText(product.priceMin),
				scalarText(product.priceMax),
				scalarText(product.priceDiscountRate),
				scalarText(product.commissionRate),
				scalarText(product.sales),
				scalarText(product.ratingStar)
			);
		return [upsert, observation];
	});

	const existingRows = await existingQuery.all<{ item_id: string; shop_id: string }>();
	const existingKeys = new Set(
		existingRows.results.map((row) => candidateKey(row.item_id, row.shop_id))
	);
	await db.batch(writes);
	return {
		newCandidates: records.length - existingKeys.size,
		updatedCandidates: existingKeys.size
	};
}

const OBSERVATION_QUERY_BATCH_SIZE = 50;

export async function listCandidates(
	db: D1Database,
	filters: CandidateFilters
): Promise<CandidateView[]> {
	const clauses: string[] = [];
	const values: (string | number)[] = [];
	if (filters.status) {
		clauses.push('status = ?');
		values.push(filters.status);
	}
	const search = filters.search?.trim().slice(0, 100);
	if (search) {
		clauses.push('(instr(lower(product_name), lower(?)) > 0 OR item_id LIKE ? OR shop_id LIKE ?)');
		values.push(search, `%${search}%`, `%${search}%`);
	}

	const discovery = discoveryFilterSql(filters.discovery);
	clauses.push(...discovery.clauses);
	values.push(...discovery.values);

	const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
	const result = await db
		.prepare(
			`SELECT item_id, shop_id, product_name, product_link, offer_link, image_url,
				price, price_min, price_max, price_discount_rate, commission_rate, sales,
				rating_star, product_cat_ids, status, rejection_reason, first_seen_at,
				last_seen_at, created_at, updated_at
			FROM candidates ${where}
			ORDER BY last_seen_at DESC
			LIMIT 100`
		)
		.bind(...values)
		.all<Omit<CandidateView, 'product_cat_ids' | 'history'> & { product_cat_ids: string | null }>();

	if (result.results.length === 0) return [];

	// D1 permite no máximo 100 parâmetros por consulta; 50 candidatos x 2 = 100.
	const allObservations: CandidateObservation[] = [];
	for (let start = 0; start < result.results.length; start += OBSERVATION_QUERY_BATCH_SIZE) {
		const batch = result.results.slice(start, start + OBSERVATION_QUERY_BATCH_SIZE);
		const observationPairs = batch.map(() => '(?, ?)').join(', ');
		const observationsResult = await db
			.prepare(
				`SELECT id, item_id, shop_id, observed_at, price, sales, commission_rate
				FROM candidate_price_observations
				WHERE (item_id, shop_id) IN (${observationPairs})
				ORDER BY observed_at DESC, id DESC`
			)
			.bind(...batch.flatMap((row) => [row.item_id, row.shop_id]))
			.all<CandidateObservation>();
		allObservations.push(...observationsResult.results);
	}
	const observationsByCandidate = new Map<string, CandidateObservation[]>();
	for (const observation of allObservations) {
		const key = candidateKey(observation.item_id, observation.shop_id);
		const observations = observationsByCandidate.get(key) ?? [];
		observations.push(observation);
		observationsByCandidate.set(key, observations);
	}

	return result.results.map((row) => {
		let productCatIds: number[] | null = null;
		if (row.product_cat_ids) {
			const parsed: unknown = JSON.parse(row.product_cat_ids);
			if (
				Array.isArray(parsed) &&
				parsed.every((value) => typeof value === 'number' && Number.isInteger(value))
			) {
				productCatIds = parsed;
			}
		}
		const history = summarizeCandidateObservations(
			observationsByCandidate.get(candidateKey(row.item_id, row.shop_id)) ?? []
		);
		return {
			...row,
			product_cat_ids: productCatIds,
			history,
			score: scoreCandidate({
				sales: row.sales,
				rating: row.rating_star,
				commissionRate: row.commission_rate,
				priceChangePercent: history.reference_price_change_percent
			})
		};
	});
}

export async function recordCollectionStart(
	db: D1Database,
	searchType: CandidateSearchType,
	searchTerm: string | null,
	requestedPages: number,
	pageLimit: number
): Promise<number> {
	const result = await db
		.prepare(
			`INSERT INTO candidate_collection_runs
				(search_type, search_term, requested_pages, page_limit)
			VALUES (?, ?, ?, ?)
			RETURNING id`
		)
		.bind(searchType, searchTerm, requestedPages, pageLimit)
		.first<{ id: number }>();
	if (!result) throw new Error('D1 did not return the collection run ID.');
	return result.id;
}

export async function recordCollectionFinish(
	db: D1Database,
	runId: number,
	summary: {
		queriesPerformed: number;
		productsFound: number;
		newCandidates: number;
		updatedCandidates: number;
		failures: number;
		errorCode: string | null;
		errorMessage: string | null;
	}
): Promise<void> {
	await db
		.prepare(
			`UPDATE candidate_collection_runs SET
				queries_performed = ?, products_found = ?, new_candidates = ?,
				updated_candidates = ?, failures = ?, error_code = ?, error_message = ?,
				finished_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
			WHERE id = ?`
		)
		.bind(
			summary.queriesPerformed,
			summary.productsFound,
			summary.newCandidates,
			summary.updatedCandidates,
			summary.failures,
			summary.errorCode,
			summary.errorMessage,
			runId
		)
		.run();
}

export type CandidateDecisionResult = 'decided' | 'not_found' | 'already_decided';

/**
 * Registra a decisão somente se o candidato estiver `pending`. As duas gravações ficam no mesmo
 * `db.batch` (transação do D1) e ambas filtram por `status = 'pending'`, então requisições
 * concorrentes não geram decisões repetidas ou contraditórias.
 */
export async function decideCandidate(
	db: D1Database,
	itemId: string,
	shopId: string,
	decision: CandidateDecision,
	rejectionReason: string | null
): Promise<CandidateDecisionResult> {
	const reason = decision === 'rejected' ? rejectionReason?.trim() || null : null;
	if (decision === 'rejected' && !reason) {
		throw new Error('Informe um motivo para rejeitar o candidato.');
	}

	const results = await db.batch([
		db
			.prepare(
				`INSERT INTO candidate_decisions (item_id, shop_id, decision, rejection_reason)
				SELECT item_id, shop_id, ?, ? FROM candidates
				WHERE item_id = ? AND shop_id = ? AND status = 'pending'`
			)
			.bind(decision, reason, itemId, shopId),
		db
			.prepare(
				`UPDATE candidates SET status = ?, rejection_reason = ?,
					updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
				WHERE item_id = ? AND shop_id = ? AND status = 'pending'`
			)
			.bind(decision, reason, itemId, shopId)
	]);
	if ((results[0]?.meta.changes ?? 0) > 0 && (results[1]?.meta.changes ?? 0) > 0) {
		return 'decided';
	}

	const existing = await db
		.prepare('SELECT status FROM candidates WHERE item_id = ? AND shop_id = ?')
		.bind(itemId, shopId)
		.first<{ status: CandidateStatus }>();
	return existing ? 'already_decided' : 'not_found';
}
