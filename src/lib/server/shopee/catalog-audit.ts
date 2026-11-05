import { linkProductToShopee } from '../product-store';
import { createD1CallControl, type ShopeeCallControl } from './call-control';
import {
	getProductOffers,
	getProductOffersBatch,
	MAX_OFFER_BATCH_QUERIES,
	ShopeeApiError
} from './client';
import {
	finishMonitorRun,
	getApiUsage,
	getAudits,
	getLatestObservations,
	getMonitorSettings,
	listMonitorRuns,
	saveAuditResults,
	selectDiscoveryTargets,
	selectLinkedTargets,
	selectShortLinkTargets,
	selectUrlTargets,
	startMonitorRun,
	type AuditTarget,
	type MonitorEventInput,
	type MonitorRunTotals,
	type MonitorTrigger,
	type StoredAudit
} from './monitor-store';
import {
	classifyIdentifiedProduct,
	classifyNameSearch,
	extractShopeeIdsFromUrl,
	searchKeywordFor,
	type AuditResult,
	type ShopeeIds
} from './product-match';
import type { ShopeeProductOfferV2 } from './types';
import { DEFAULT_SHORT_LINK_LIMIT, resolveShortLink } from './short-link-resolver';

export const MAX_DISCOVERY_SEARCHES_PER_RUN = 10;
const MAX_CONSECUTIVE_CHUNK_FAILURES = 3;
const RETRY_DELAYS_MS = [500, 1500];
const HOUR_MS = 60 * 60 * 1000;

type Credentials = Pick<Cloudflare.Env, 'SHOPEE_APP_ID' | 'SHOPEE_APP_SECRET'>;

export type CatalogAuditOptions = {
	trigger: MonitorTrigger;
	/** Produtos com itemId/shopId (vínculo ou URL completa) a revalidar, em lotes de 10 por chamada. */
	linkedLimit: number;
	/** Buscas por nome (uma chamada cada) para produtos sem identificadores. */
	discoveryLimit: number;
	/** Ignora o intervalo mínimo entre verificações (execução manual explícita). */
	force?: boolean;
	/**
	 * Máximo de links curtos s.shopee.com.br resolvidos por HTTP nesta execução (padrão 10).
	 * Independe do orçamento de chamadas da API de afiliados.
	 */
	shortLinkLimit?: number;
};

export type CatalogAuditDeps = {
	fetcher?: typeof fetch;
	/** Fetch usado apenas para resolver links curtos (nunca para a API GraphQL). */
	resolveFetcher?: typeof fetch;
	now?: () => Date;
	sleep?: (ms: number) => Promise<void>;
};

export type ShortLinkSummary = {
	attempted: number;
	resolved: number;
	linked: number;
	failed: number;
	/** Falhas por etapa; somam failed. */
	stageFailures: { resolve: number; api: number; link: number };
	/** Contagem por código de falha (sem URLs nem IDs). */
	failures: Record<string, number>;
};

export type CatalogAuditOutcome =
	| { state: 'busy' }
	| { state: 'skipped'; reason: 'paused' | 'interval' }
	| { state: 'blocked'; code: string; message: string }
	| {
			state: 'finished';
			runId: number;
			status: 'completed' | 'partial' | 'failed';
			totals: MonitorRunTotals;
			errorCode: string | null;
			errorMessage: string | null;
			shortLinks: ShortLinkSummary;
	  };

const cents = (value: number) => Math.round(value * 100);

/** Eventos só para produtos com identidade confirmada (vínculo ou ID da URL). */
export function buildMonitorEvents(
	runId: number | null,
	result: AuditResult,
	previous: StoredAudit | undefined
): MonitorEventInput[] {
	if (result.matchLevel !== 'linked' && result.matchLevel !== 'url_id') return [];
	const events: MonitorEventInput[] = [];
	const event = (
		eventType: MonitorEventInput['eventType'],
		previousPrice: number | null,
		previousPriceMax: number | null,
		currentPrice: number | null,
		currentPriceMax: number | null
	): MonitorEventInput => ({
		runId,
		productId: result.productId,
		itemId: result.itemId,
		shopId: result.shopId,
		eventType,
		previousPrice,
		previousPriceMax,
		currentPrice,
		currentPriceMax
	});

	if (result.status === 'unavailable') {
		if (previous?.status !== 'unavailable') {
			events.push(
				event(
					'unavailable',
					previous?.api_price_min ?? result.sheetPrice,
					previous?.api_price_max ?? result.sheetPriceMax,
					null,
					null
				)
			);
		}
		return events;
	}
	if (previous?.status === 'unavailable' && result.apiPriceMin !== null) {
		events.push(event('available_again', null, null, result.apiPriceMin, result.apiPriceMax));
	}
	if (result.apiPriceMin === null) return events;

	const previousMin = previous?.api_price_min ?? null;
	if (previousMin !== null) {
		const previousMax = previous?.api_price_max ?? previousMin;
		const currentMax = result.apiPriceMax ?? result.apiPriceMin;
		if (
			cents(previousMin) !== cents(result.apiPriceMin) ||
			cents(previousMax) !== cents(currentMax)
		) {
			events.push(
				event(
					'price_changed',
					previousMin,
					previous?.api_price_max ?? null,
					result.apiPriceMin,
					result.apiPriceMax
				)
			);
		}
	} else if (result.status === 'price_changed') {
		events.push(
			event(
				'price_changed',
				result.sheetPrice,
				result.sheetPriceMax,
				result.apiPriceMin,
				result.apiPriceMax
			)
		);
	}
	return events;
}

type RunState = {
	control: ShopeeCallControl;
	totals: MonitorRunTotals;
	sleep: (ms: number) => Promise<void>;
};

function isRetryable(error: unknown): boolean {
	if (!(error instanceof ShopeeApiError)) return false;
	if (error.kind === 'timeout') return true;
	return error.kind === 'upstream' && /^SHOPEE_(HTTP_5\d\d|REQUEST_FAILED)$/.test(error.code);
}

/**
 * Cada tentativa é uma requisição HTTP reservada pelo controle central (as retentativas usam
 * `forRetry()`); rate limit e bloqueio de orçamento nunca são repetidos.
 */
async function callWithRetries<T>(
	state: RunState,
	call: (control: ShopeeCallControl) => Promise<T>
): Promise<T> {
	for (let attempt = 0; ; attempt += 1) {
		try {
			return await call(attempt === 0 ? state.control : state.control.forRetry());
		} catch (error) {
			if (!isRetryable(error) || attempt >= RETRY_DELAYS_MS.length) throw error;
			await state.sleep(RETRY_DELAYS_MS[attempt]!);
		}
	}
}

function chunk<T>(items: readonly T[], size: number): T[][] {
	const result: T[][] = [];
	for (let start = 0; start < items.length; start += size)
		result.push(items.slice(start, start + size));
	return result;
}

type Identified = { target: AuditTarget; ids: ShopeeIds; level: 'linked' | 'url_id' };

function safeError(error: unknown): { code: string; message: string } {
	if (error instanceof ShopeeApiError) {
		if (error.code === 'SHOPEE_BUDGET_EXHAUSTED') {
			return {
				code: 'BUDGET_EXHAUSTED',
				message: 'O orçamento de chamadas por hora foi atingido; a execução foi interrompida.'
			};
		}
		return { code: error.code, message: error.message };
	}
	return { code: 'CATALOG_AUDIT_FAILED', message: 'A verificação não pôde ser concluída.' };
}

const isStopError = (error: unknown): boolean =>
	error instanceof ShopeeApiError &&
	(error.kind === 'rate_limit' || error.kind === 'graphql' || error.kind === 'budget');

/**
 * Verifica produtos do catálogo contra a Shopee. Só grava em tabelas de auditoria,
 * monitoramento e uso da API; a tabela `products` nunca é alterada.
 */
export async function runCatalogAudit(
	db: D1Database,
	credentials: Credentials,
	options: CatalogAuditOptions,
	deps: CatalogAuditDeps = {}
): Promise<CatalogAuditOutcome> {
	const fetcher = deps.fetcher ?? fetch;
	const clock = deps.now ?? (() => new Date());
	const startedAt = clock();
	const settings = await getMonitorSettings(db);
	const usage = await getApiUsage(db, startedAt);
	if (settings.hourlyCallBudget - usage.callsLastHour <= 0) {
		return {
			state: 'blocked',
			code: 'BUDGET_EXHAUSTED',
			message: `O orçamento de ${settings.hourlyCallBudget} chamadas por hora foi atingido. Aguarde para executar novamente.`
		};
	}

	const runId = await startMonitorRun(db, options.trigger, startedAt);
	if (runId === null) return { state: 'busy' };

	const state: RunState = {
		control: createD1CallControl(db, 'catalog-audit', { now: clock }),
		totals: {
			products_checked: 0,
			discovery_searches: 0,
			api_calls: 0,
			price_changes: 0,
			unavailable: 0,
			failures: 0,
			retries: 0
		},
		sleep: deps.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)))
	};
	let stopError: { code: string; message: string } | null = null;
	let saved = 0;
	const shortLinks: ShortLinkSummary = {
		attempted: 0,
		resolved: 0,
		linked: 0,
		failed: 0,
		stageFailures: { resolve: 0, api: 0, link: 0 },
		failures: {}
	};
	const countShortFailure = (code: string, stage: 'resolve' | 'api' | 'link') => {
		shortLinks.failed += 1;
		shortLinks.stageFailures[stage] += 1;
		shortLinks.failures[code] = (shortLinks.failures[code] ?? 0) + 1;
	};

	try {
		const linkedLimit = Math.max(0, Math.min(options.linkedLimit, settings.batchSize));
		const discoveryLimit = Math.max(
			0,
			Math.min(options.discoveryLimit, MAX_DISCOVERY_SEARCHES_PER_RUN)
		);
		const cutoff = options.force
			? startedAt
			: new Date(startedAt.getTime() - settings.intervalHours * HOUR_MS);

		const identified: Identified[] = [];
		for (const target of await selectLinkedTargets(db, cutoff, linkedLimit)) {
			identified.push({
				target,
				ids: { itemId: target.itemId!, shopId: target.shopId! },
				level: 'linked'
			});
		}
		if (identified.length < linkedLimit) {
			for (const target of await selectUrlTargets(db, cutoff, linkedLimit - identified.length)) {
				const ids = extractShopeeIdsFromUrl(target.product.url);
				if (ids) identified.push({ target, ids, level: 'url_id' });
			}
		}
		const shortLinkProductIds = new Set<string>();
		const unresolvedResults: AuditResult[] = [];
		const shortLinkAttemptedIds = new Set<string>();
		const shortLinkLimit = Math.max(
			0,
			Math.min(options.shortLinkLimit ?? DEFAULT_SHORT_LINK_LIMIT, 50)
		);
		for (const target of await selectShortLinkTargets(db, cutoff, shortLinkLimit)) {
			shortLinks.attempted += 1;
			shortLinkAttemptedIds.add(target.product.id);
			const resolution = await resolveShortLink(target.product.url, {
				fetcher: deps.resolveFetcher
			});
			if (!resolution.ok) {
				countShortFailure(resolution.code, 'resolve');
				// Registra a tentativa para que o rodízio avance e estes links não bloqueiem os demais.
				unresolvedResults.push({
					productId: target.product.id,
					status: 'uncertain',
					matchLevel: 'none',
					itemId: null,
					shopId: null,
					sheetPrice: target.product.price,
					sheetPriceMax: target.product.priceMax ?? null,
					apiPriceMin: null,
					apiPriceMax: null,
					apiProductName: null,
					detail: {
						reasons: ['Não foi possível resolver o link curto para identificar o anúncio.']
					},
					lastObservedAt: null
				});
				continue;
			}
			shortLinks.resolved += 1;
			shortLinkProductIds.add(target.product.id);
			identified.push({ target, ids: resolution.ids, level: 'url_id' });
		}
		const discovery = (await selectDiscoveryTargets(db, cutoff, discoveryLimit)).filter(
			(target) => !shortLinkAttemptedIds.has(target.product.id)
		);

		const results: AuditResult[] = [];
		const credentialsForCalls = credentials;
		// Compartilhado entre grupos e descoberta: só um sucesso o zera.
		let consecutiveFailures = 0;

		for (const group of chunk(identified, MAX_OFFER_BATCH_QUERIES)) {
			try {
				const pages = await callWithRetries(state, (control) =>
					getProductOffersBatch(
						credentialsForCalls,
						group.map(({ ids }) => ({ ...ids, page: 1, limit: 1, listType: 0 })),
						fetcher,
						control
					)
				);
				consecutiveFailures = 0;
				group.forEach(({ target, ids, level }, index) => {
					const nodes: ShopeeProductOfferV2[] = pages[index]!.offers.map((offer) => offer.product);
					results.push(classifyIdentifiedProduct(target.product, ids, level, nodes));
				});
			} catch (error) {
				const safe = safeError(error);
				const fatal = isStopError(error);
				if (fatal) {
					stopError = safe;
					break;
				}
				state.totals.failures += group.length;
				consecutiveFailures += 1;
				stopError ??= safe;
				if (consecutiveFailures >= MAX_CONSECUTIVE_CHUNK_FAILURES) break;
			}
		}

		// O vínculo só é gravado quando a API devolveu exatamente o itemId e o shopId resolvidos.
		const shortLinkAnswered = new Set(results.map((result) => result.productId));
		// Resolvidos cuja consulta em lote falhou (ou foi interrompida): uma falha cada.
		for (const productId of shortLinkProductIds) {
			if (!shortLinkAnswered.has(productId)) countShortFailure('api_failed', 'api');
		}
		for (const result of results) {
			if (!shortLinkProductIds.has(result.productId)) continue;
			if (result.status !== 'valid' && result.status !== 'price_changed') {
				countShortFailure('not_confirmed', 'api');
				result.detail.reasons.push('Link curto resolvido, mas a API não confirmou o anúncio.');
				continue;
			}
			try {
				await linkProductToShopee(db, result.productId, result.itemId!, result.shopId!);
				shortLinks.linked += 1;
			} catch {
				countShortFailure('link_rejected', 'link');
				result.detail.reasons.push(
					'Link curto resolvido, mas o vínculo não foi gravado (conflito ou falha no banco).'
				);
			}
		}

		const discoveryResults: AuditResult[] = [];
		if (!stopError || !isFatal(stopError)) {
			for (const target of discovery) {
				if (consecutiveFailures >= MAX_CONSECUTIVE_CHUNK_FAILURES) break;
				try {
					const page = await callWithRetries(state, (control) =>
						getProductOffers(
							credentialsForCalls,
							{
								keyword: searchKeywordFor(target.product.name),
								page: 1,
								limit: 10,
								listType: 0,
								sortType: 1
							},
							fetcher,
							control
						)
					);
					consecutiveFailures = 0;
					discoveryResults.push(
						classifyNameSearch(
							target.product,
							page.offers.map((offer) => offer.product)
						)
					);
				} catch (error) {
					const safe = safeError(error);
					if (isStopError(error)) {
						stopError = safe;
						break;
					}
					state.totals.failures += 1;
					consecutiveFailures += 1;
					stopError ??= safe;
				}
			}
		}

		const allResults = [...results, ...discoveryResults, ...unresolvedResults];
		if (allResults.length > 0) {
			const pairs = results.map((result) => ({ itemId: result.itemId!, shopId: result.shopId! }));
			const [previous, observations] = await Promise.all([
				getAudits(
					db,
					allResults.map((result) => result.productId)
				),
				getLatestObservations(db, pairs)
			]);
			const events: MonitorEventInput[] = [];
			for (const result of results) {
				const observation = observations.get(`${result.itemId}\u0000${result.shopId}`);
				if (observation) {
					result.lastObservedAt = observation.observedAt;
					result.detail.history = {
						observedPrice: observation.price,
						observedAt: observation.observedAt,
						apiVsObservedPercent:
							observation.price !== null && result.apiPriceMin !== null
								? ((result.apiPriceMin - observation.price) / observation.price) * 100
								: null
					};
				}
			}
			for (const result of allResults) {
				events.push(...buildMonitorEvents(runId, result, previous.get(result.productId)));
			}
			await saveAuditResults(db, allResults, events, clock());
			saved = allResults.length;
			state.totals.products_checked = results.length;
			state.totals.discovery_searches = discoveryResults.length;
			state.totals.price_changes = events.filter(
				(event) => event.eventType === 'price_changed'
			).length;
			state.totals.unavailable = allResults.filter(
				(result) => result.status === 'unavailable'
			).length;
		}
	} catch (error) {
		console.error('Catalog audit failed:', error instanceof Error ? error.message : String(error));
		stopError = { code: 'CATALOG_AUDIT_FAILED', message: 'A verificação não pôde ser concluída.' };
	}

	const status: 'completed' | 'partial' | 'failed' =
		!stopError && state.totals.failures === 0 ? 'completed' : saved > 0 ? 'partial' : 'failed';
	const finishedAt = clock();
	state.totals.api_calls = state.control.counters.reserved;
	state.totals.retries = state.control.counters.retries;
	try {
		await finishMonitorRun(db, runId, status, state.totals, stopError, finishedAt);
	} catch (error) {
		console.error(
			'Catalog audit bookkeeping failed:',
			error instanceof Error ? error.message : String(error)
		);
	}
	return {
		state: 'finished',
		runId,
		status,
		totals: state.totals,
		errorCode: stopError?.code ?? null,
		errorMessage: stopError?.message ?? null,
		shortLinks
	};
}

function isFatal(error: { code: string }): boolean {
	return (
		error.code === 'BUDGET_EXHAUSTED' ||
		error.code === 'SHOPEE_CALL_CONTROL_UNAVAILABLE' ||
		error.code === 'SHOPEE_CALL_CONTROL_REQUIRED' ||
		error.code === 'SHOPEE_RATE_LIMIT' ||
		error.code.startsWith('SHOPEE_INVALID_CREDENTIAL') ||
		error.code === 'SHOPEE_API_ACCESS_DENIED' ||
		error.code === 'SHOPEE_QUERY_PARSE_ERROR' ||
		error.code === 'SHOPEE_INVALID_PARAMETERS' ||
		error.code === 'SHOPEE_GRAPHQL_ERROR'
	);
}

/**
 * Ponto de entrada para um agendador (Cron Trigger). Respeita a pausa e o intervalo configurados,
 * não faz buscas por nome e só revalida produtos já identificados. Ainda não está ligado a
 * nenhum agendamento: o Worker gerado pelo adaptador SvelteKit não exporta `scheduled`.
 */
export async function runScheduledCatalogMonitor(
	db: D1Database,
	credentials: Credentials,
	deps: CatalogAuditDeps = {}
): Promise<CatalogAuditOutcome> {
	const clock = deps.now ?? (() => new Date());
	const settings = await getMonitorSettings(db);
	if (settings.paused) return { state: 'skipped', reason: 'paused' };
	const [lastRun] = await listMonitorRuns(db, 1);
	const lastStart = lastRun ? Date.parse(lastRun.started_at) : NaN;
	if (
		Number.isFinite(lastStart) &&
		clock().getTime() - lastStart < settings.intervalHours * HOUR_MS
	) {
		return { state: 'skipped', reason: 'interval' };
	}
	return runCatalogAudit(
		db,
		credentials,
		{ trigger: 'scheduled', linkedLimit: settings.batchSize, discoveryLimit: 0, shortLinkLimit: 0 },
		deps
	);
}
