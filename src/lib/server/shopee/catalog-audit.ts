import { applyObservedPrice, linkProductToShopee } from '../product-store';
import { createD1CallControl, type ShopeeCallControl } from './call-control';
import {
	getProductOffers,
	getProductOffersBatch,
	MAX_OFFER_BATCH_QUERIES,
	ShopeeApiError
} from './client';
import {
	finishMonitorRun,
	getAudits,
	getLatestObservations,
	getMonitorSettings,
	saveAuditResults,
	selectDiscoveryTargets,
	startMonitorRun,
	type AuditTarget,
	type MonitorEventInput,
	type MonitorRunTotals,
	type MonitorTrigger,
	type StoredAudit
} from './monitor-store';
import {
	isFailureOutcome,
	recordQueueChecks,
	recordSchedulerHeartbeat,
	selectQueueBatch,
	type QueueCheck
} from './monitor-queue';
import {
	classifyIdentifiedProduct,
	classifyNameSearch,
	extractShopeeIdsFromUrl,
	searchKeywordFor,
	type AuditResult,
	type ShopeeIds
} from './product-match';
import type { ShopeeProductOfferV2 } from './types';
import { resolveShortLink } from './short-link-resolver';

export const MAX_DISCOVERY_SEARCHES_PER_RUN = 10;
/** Teto de produtos por execução; o lote configurado (1–50) nunca ultrapassa isto. */
export const MAX_QUEUE_BATCH = 50;
/**
 * Resoluções HTTP de links curtos por execução. Cada uma é uma subrequisição do Worker (limite de
 * 50 no plano gratuito, somado às consultas D1); os demais produtos permanecem no início da fila.
 */
export const MAX_SHORT_LINK_RESOLUTIONS_PER_RUN = 25;
const SHORT_LINK_CONCURRENCY = 4;
const MAX_CONSECUTIVE_CHUNK_FAILURES = 3;
const RETRY_DELAYS_MS = [500, 1500];

type Credentials = Pick<Cloudflare.Env, 'SHOPEE_APP_ID' | 'SHOPEE_APP_SECRET'>;

export type CatalogAuditOptions = {
	trigger: MonitorTrigger;
	/** Produtos da fila nesta execução (limitado ao lote configurado e a 50). */
	limit?: number;
	/** Ignora a data de vencimento: reverifica os mais antigos (mesma ordem de rodízio da fila). */
	force?: boolean;
	/** Buscas por nome (uma chamada cada) para produtos sem identificador; só descoberta, nunca vínculo. */
	discoveryLimit?: number;
	/**
	 * Alvos explícitos (lote de auditoria incremental). Dispensam a fila e a busca por nome; o
	 * chamador define o tamanho, que continua sujeito ao teto de resoluções.
	 */
	targets?: AuditTarget[];
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
	/** Subdiagnóstico seguro de `invalid_redirect` (ex.: `host:exemplo.com`); nunca caminho nem query. */
	details: Record<string, number>;
};

export type CatalogAuditOutcome =
	| { state: 'busy' }
	| { state: 'skipped'; reason: 'paused' | 'empty' }
	| { state: 'blocked'; code: string; message: string }
	| {
			state: 'finished';
			runId: number;
			status: 'completed' | 'partial' | 'failed';
			totals: MonitorRunTotals;
			errorCode: string | null;
			errorMessage: string | null;
			shortLinks: ShortLinkSummary;
			/** Produtos que tiveram o preço atualizado a partir de uma observação válida da API. */
			priceUpdates: number;
			/** Resultado por produto efetivamente verificado (ausentes não foram processados). */
			checks: QueueCheck[];
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

async function mapPool<T, R>(
	items: readonly T[],
	concurrency: number,
	work: (item: T) => Promise<R>
): Promise<R[]> {
	const results = new Array<R>(items.length);
	let next = 0;
	const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
		while (next < items.length) {
			const index = next++;
			results[index] = await work(items[index]!);
		}
	});
	await Promise.all(workers);
	return results;
}

type Identified = {
	target: AuditTarget;
	ids: ShopeeIds;
	level: 'linked' | 'url_id';
	/** O vínculo itemId/shopId ainda não existe no produto e só é gravado após a API confirmar. */
	needsLink: boolean;
};

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
 * Processa o próximo lote da fila persistente de monitoramento: resolve links curtos (HTTP, sem
 * custo de API), consulta a Shopee em lotes de 10 e só confirma o vínculo quando a API devolve
 * exatamente o itemId/shopId resolvido. O preço do catálogo só é alterado quando a opção
 * "atualizar preços" está ligada e a API observou o anúncio confirmado. Nenhum produto é apagado.
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

	const limit = Math.max(
		0,
		Math.min(options.limit ?? settings.batchSize, settings.batchSize, MAX_QUEUE_BATCH)
	);
	const discoveryLimit = Math.max(
		0,
		Math.min(options.discoveryLimit ?? 0, MAX_DISCOVERY_SEARCHES_PER_RUN)
	);
	const targets =
		options.targets ?? (await selectQueueBatch(db, startedAt, limit, options.force ?? false));
	const discovery = options.targets
		? []
		: await selectDiscoveryTargets(
				db,
				options.force
					? startedAt
					: new Date(startedAt.getTime() - settings.intervalHours * 60 * 60 * 1000),
				discoveryLimit
			);
	if (targets.length === 0 && discovery.length === 0) return { state: 'skipped', reason: 'empty' };

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
	let priceUpdates = 0;
	const shortLinks: ShortLinkSummary = {
		attempted: 0,
		resolved: 0,
		linked: 0,
		failed: 0,
		stageFailures: { resolve: 0, api: 0, link: 0 },
		failures: {},
		details: {}
	};
	const countShortFailure = (code: string, stage: 'resolve' | 'api' | 'link', detail?: string) => {
		shortLinks.failed += 1;
		shortLinks.stageFailures[stage] += 1;
		shortLinks.failures[code] = (shortLinks.failures[code] ?? 0) + 1;
		if (detail) shortLinks.details[detail] = (shortLinks.details[detail] ?? 0) + 1;
	};
	const checks = new Map<string, QueueCheck>();
	const failureCodes: Record<string, number> = {};
	const recordCheck = (check: QueueCheck) => {
		checks.set(check.productId, check);
		if (isFailureOutcome(check.outcome)) {
			state.totals.failures += 1;
			const code = check.errorCode ?? 'desconhecido';
			failureCodes[code] = (failureCodes[code] ?? 0) + 1;
		}
	};

	try {
		const identified: Identified[] = [];
		const toResolve: AuditTarget[] = [];
		for (const target of targets) {
			if (target.itemId && target.shopId) {
				identified.push({
					target,
					ids: { itemId: target.itemId, shopId: target.shopId },
					level: 'linked',
					needsLink: false
				});
				continue;
			}
			const ids = extractShopeeIdsFromUrl(target.product.url);
			if (ids) identified.push({ target, ids, level: 'url_id', needsLink: true });
			else if (toResolve.length < MAX_SHORT_LINK_RESOLUTIONS_PER_RUN) toResolve.push(target);
		}

		shortLinks.attempted = toResolve.length;
		const resolutions = await mapPool(toResolve, SHORT_LINK_CONCURRENCY, (target) =>
			resolveShortLink(target.product.url, { fetcher: deps.resolveFetcher })
		);
		const shortLinkProductIds = new Set<string>();
		toResolve.forEach((target, index) => {
			const resolution = resolutions[index]!;
			if (!resolution.ok) {
				countShortFailure(
					resolution.code,
					'resolve',
					resolution.detail ? `${resolution.code}:${resolution.detail}` : undefined
				);
				recordCheck({
					productId: target.product.id,
					outcome: 'unresolved',
					errorCode: resolution.code,
					errorDetail: resolution.detail ?? null
				});
				return;
			}
			shortLinks.resolved += 1;
			shortLinkProductIds.add(target.product.id);
			identified.push({ target, ids: resolution.ids, level: 'url_id', needsLink: true });
		});

		const results: Array<{ result: AuditResult; item: Identified }> = [];
		// Compartilhado entre grupos e descoberta: só um sucesso o zera.
		let consecutiveFailures = 0;

		for (const group of chunk(identified, MAX_OFFER_BATCH_QUERIES)) {
			try {
				const pages = await callWithRetries(state, (control) =>
					getProductOffersBatch(
						credentials,
						group.map(({ ids }) => ({ ...ids, page: 1, limit: 1, listType: 0 })),
						fetcher,
						control
					)
				);
				consecutiveFailures = 0;
				group.forEach((item, index) => {
					const nodes: ShopeeProductOfferV2[] = pages[index]!.offers.map((offer) => offer.product);
					results.push({
						item,
						result: classifyIdentifiedProduct(item.target.product, item.ids, item.level, nodes)
					});
				});
			} catch (error) {
				const safe = safeError(error);
				if (isStopError(error)) {
					stopError = safe;
					break;
				}
				for (const item of group) {
					if (shortLinkProductIds.has(item.target.product.id)) countShortFailure('api_failed', 'api');
					recordCheck({
						productId: item.target.product.id,
						outcome: 'api_error',
						errorCode: safe.code
					});
				}
				consecutiveFailures += 1;
				stopError ??= safe;
				if (consecutiveFailures >= MAX_CONSECUTIVE_CHUNK_FAILURES) break;
			}
		}

		for (const { result, item } of results) {
			const productId = item.target.product.id;
			const confirmed = result.status === 'valid' || result.status === 'price_changed';
			const wasShortLink = shortLinkProductIds.has(productId);
			let outcome: QueueCheck['outcome'] = confirmed
				? 'ok'
				: result.status === 'unavailable'
					? 'unavailable'
					: 'review';
			let linkedNow = !item.needsLink;

			if (item.needsLink) {
				if (!confirmed) {
					if (wasShortLink) {
						countShortFailure('not_confirmed', 'api');
						result.detail.reasons.push('Link curto resolvido, mas a API não confirmou o anúncio.');
					}
				} else {
					try {
						await linkProductToShopee(db, productId, result.itemId!, result.shopId!);
						linkedNow = true;
						if (wasShortLink) shortLinks.linked += 1;
					} catch {
						outcome = 'link_error';
						if (wasShortLink) countShortFailure('link_rejected', 'link');
						result.detail.reasons.push(
							'Anúncio confirmado pela API, mas o vínculo não foi gravado (conflito ou falha no banco).'
						);
					}
				}
			}

			if (
				settings.updatePrices &&
				!options.targets &&
				linkedNow &&
				confirmed &&
				result.apiPriceMin !== null &&
				outcome === 'ok'
			) {
				try {
					if (await applyObservedPrice(db, productId, result.apiPriceMin, result.apiPriceMax)) {
						priceUpdates += 1;
					}
				} catch {
					result.detail.reasons.push('Não foi possível gravar o preço observado.');
				}
			}
			recordCheck({
				productId,
				outcome,
				errorCode: outcome === 'link_error' ? 'link_rejected' : null
			});
		}

		const discoveryResults: AuditResult[] = [];
		if (!stopError || !isFatal(stopError)) {
			for (const target of discovery) {
				if (consecutiveFailures >= MAX_CONSECUTIVE_CHUNK_FAILURES) break;
				try {
					const page = await callWithRetries(state, (control) =>
						getProductOffers(
							credentials,
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

		const allResults = [...results.map(({ result }) => result), ...discoveryResults];
		if (allResults.length > 0) {
			const pairs = results.map(({ result }) => ({
				itemId: result.itemId!,
				shopId: result.shopId!
			}));
			const [previous, observations] = await Promise.all([
				getAudits(
					db,
					allResults.map((result) => result.productId)
				),
				getLatestObservations(db, pairs)
			]);
			const events: MonitorEventInput[] = [];
			for (const { result } of results) {
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
		// Só depois dos resultados salvos: se algo acima falhar, a fila não avança em falso.
		await recordQueueChecks(db, [...checks.values()], clock(), settings.intervalHours);
	} catch (error) {
		console.error('Catalog audit failed:', error instanceof Error ? error.message : String(error));
		stopError = { code: 'CATALOG_AUDIT_FAILED', message: 'A verificação não pôde ser concluída.' };
	}

	const successes = [...checks.values()].filter((check) => !isFailureOutcome(check.outcome)).length;
	if (!stopError && state.totals.failures > 0) {
		const summary = Object.entries(failureCodes)
			.sort((a, b) => b[1] - a[1])
			.slice(0, 5)
			.map(([code, count]) => `${code} (${count})`)
			.join(', ');
		stopError = {
			code: 'PARTIAL_FAILURES',
			message: `${state.totals.failures} produto(s) com falha nesta execução: ${summary}.`
		};
	}
	const status: 'completed' | 'partial' | 'failed' = !stopError
		? 'completed'
		: successes > 0 || saved > 0
			? 'partial'
			: 'failed';
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
		shortLinks,
		priceUpdates,
		checks: [...checks.values()]
	};
}

/**
 * Ponto de entrada do Cron Trigger. Cada tick processa um lote da fila persistente; quem decide o
 * que está vencido é a própria fila (próxima verificação por produto), não o relógio global.
 * Respeita a pausa e sempre registra o sinal de vida do agendador, para o painel provar que o
 * cron realmente disparou.
 */
export async function runScheduledCatalogMonitor(
	db: D1Database,
	credentials: Credentials,
	deps: CatalogAuditDeps = {}
): Promise<CatalogAuditOutcome> {
	const clock = deps.now ?? (() => new Date());
	let outcome: CatalogAuditOutcome;
	try {
		const settings = await getMonitorSettings(db);
		outcome = settings.paused
			? { state: 'skipped', reason: 'paused' }
			: await runCatalogAudit(db, credentials, { trigger: 'scheduled' }, deps);
	} catch (error) {
		console.error('Scheduled monitor failed:', error instanceof Error ? error.message : String(error));
		outcome = {
			state: 'blocked',
			code: 'SCHEDULED_FAILED',
			message: 'A execução agendada falhou.'
		};
	}
	const label =
		outcome.state === 'finished'
			? outcome.status
			: outcome.state === 'skipped'
				? outcome.reason
				: outcome.state === 'blocked'
					? outcome.code
					: 'busy';
	try {
		await recordSchedulerHeartbeat(
			db,
			label,
			outcome.state === 'finished' ? outcome.runId : null,
			clock()
		);
	} catch (error) {
		console.error('Heartbeat failed:', error instanceof Error ? error.message : String(error));
	}
	return outcome;
}
