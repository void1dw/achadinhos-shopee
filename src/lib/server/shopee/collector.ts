import type { ShopeeCallControl } from './call-control';
import {
	getProductOffers,
	ShopeeApiError,
	type ShopeeProductOfferQuery,
	type ShopeeProductOfferRecord
} from './client';
import {
	recordCollectionFinish,
	recordCollectionStart,
	upsertCandidates,
	type CandidateSearchType
} from './candidate-store';
import { matchesDiscoveryFilters, type DiscoveryFilters } from './discovery-filters';

export const MAX_COLLECTION_PAGES = 3;
export const MAX_PRODUCTS_PER_PAGE = 20;

export type CandidateCollectionInput = {
	searchType: CandidateSearchType;
	keyword?: string;
	productCatId?: number;
	pages: number;
	pageLimit: number;
	/** Filtros aplicados antes de salvar; candidatos fora dos critérios não são gravados. */
	filters?: DiscoveryFilters;
};

type ValidatedCandidateCollectionInput =
	| { searchType: 'general'; pages: number; pageLimit: number }
	| { searchType: 'keyword'; keyword: string; pages: number; pageLimit: number }
	| { searchType: 'category'; productCatId: number; pages: number; pageLimit: number };

export type CandidateCollectionSummary = {
	status: 'completed' | 'partial' | 'failed';
	searchType: CandidateSearchType;
	searchTerm: string | null;
	pagesRequested: number;
	pageLimit: number;
	queriesPerformed: number;
	productsFound: number;
	filteredOut?: number;
	newCandidates: number;
	updatedCandidates: number;
	failures: number;
	errorCode: string | null;
	errorMessage: string | null;
};

export class CandidateCollectionInputError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'CandidateCollectionInputError';
	}
}

function isCandidateSearchType(value: unknown): value is CandidateSearchType {
	return value === 'general' || value === 'keyword' || value === 'category';
}

export function validateCandidateCollectionInput(
	input: CandidateCollectionInput
): ValidatedCandidateCollectionInput {
	if (!isCandidateSearchType(input.searchType)) {
		throw new CandidateCollectionInputError('Selecione um tipo de busca válido.');
	}
	const searchType =
		input.searchType === 'general' && input.keyword?.trim() ? 'keyword' : input.searchType;
	if (!Number.isInteger(input.pages) || input.pages < 1 || input.pages > MAX_COLLECTION_PAGES) {
		throw new CandidateCollectionInputError(
			`A coleta aceita de 1 a ${MAX_COLLECTION_PAGES} páginas por execução.`
		);
	}
	if (
		!Number.isInteger(input.pageLimit) ||
		input.pageLimit < 1 ||
		input.pageLimit > MAX_PRODUCTS_PER_PAGE
	) {
		throw new CandidateCollectionInputError(
			`A coleta aceita de 1 a ${MAX_PRODUCTS_PER_PAGE} produtos por página.`
		);
	}
	if (searchType === 'keyword') {
		const keyword = input.keyword?.trim();
		if (!keyword || keyword.length > 100) {
			throw new CandidateCollectionInputError(
				'A busca por palavra-chave exige um termo de até 100 caracteres.'
			);
		}
		return { searchType: 'keyword', keyword, pages: input.pages, pageLimit: input.pageLimit };
	}
	if (searchType === 'category') {
		const productCatId = input.productCatId;
		if (typeof productCatId !== 'number' || !Number.isInteger(productCatId) || productCatId <= 0) {
			throw new CandidateCollectionInputError('Informe um ID de categoria positivo.');
		}
		return {
			searchType: 'category',
			productCatId,
			pages: input.pages,
			pageLimit: input.pageLimit
		};
	}
	return { searchType: 'general', pages: input.pages, pageLimit: input.pageLimit };
}

function productKey(itemId: string | number, shopId: string | number): string {
	return `${itemId}\u0000${shopId}`;
}

function usableOffer(offer: ShopeeProductOfferRecord): offer is ShopeeProductOfferRecord & {
	product: ShopeeProductOfferRecord['product'] & {
		itemId: string | number;
		shopId: string | number;
	};
} {
	return (
		offer.product.itemId !== null &&
		offer.product.itemId !== undefined &&
		/^\d+$/.test(String(offer.product.itemId)) &&
		offer.product.shopId !== null &&
		offer.product.shopId !== undefined &&
		/^\d+$/.test(String(offer.product.shopId))
	);
}

function safeError(error: unknown): { code: string; message: string } {
	if (error instanceof ShopeeApiError) {
		return { code: error.code, message: error.message };
	}
	return {
		code: 'SHOPEE_COLLECTION_FAILED',
		message: 'A consulta à Shopee não pôde ser concluída.'
	};
}

export async function collectShopeeCandidates(
	db: D1Database,
	credentials: Pick<Cloudflare.Env, 'SHOPEE_APP_ID' | 'SHOPEE_APP_SECRET'>,
	unvalidatedInput: CandidateCollectionInput,
	fetcher: typeof fetch = fetch,
	control?: ShopeeCallControl
): Promise<CandidateCollectionSummary> {
	const input = validateCandidateCollectionInput(unvalidatedInput);
	const searchTerm =
		input.searchType === 'keyword'
			? input.keyword
			: input.searchType === 'category'
				? String(input.productCatId)
				: null;
	const runId = await recordCollectionStart(
		db,
		input.searchType,
		searchTerm,
		input.pages,
		input.pageLimit
	);
	const summary: CandidateCollectionSummary = {
		status: 'completed',
		searchType: input.searchType,
		searchTerm,
		pagesRequested: input.pages,
		pageLimit: input.pageLimit,
		queriesPerformed: 0,
		productsFound: 0,
		newCandidates: 0,
		updatedCandidates: 0,
		failures: 0,
		errorCode: null,
		errorMessage: null
	};
	const seen = new Set<string>();
	let pagesSucceeded = 0;

	try {
		for (let pageNumber = 1; pageNumber <= input.pages; pageNumber += 1) {
			const query: ShopeeProductOfferQuery = {
				page: pageNumber,
				limit: input.pageLimit,
				listType: 0,
				sortType: 1,
				...(input.searchType === 'keyword' ? { keyword: input.keyword } : {}),
				...(input.searchType === 'category' ? { productCatId: input.productCatId } : {})
			};
			let result: Awaited<ReturnType<typeof getProductOffers>>;
			summary.queriesPerformed += 1;
			try {
				result = await getProductOffers(credentials, query, fetcher, control);
			} catch (error) {
				// Bloqueio local pelo controle de consumo não gera chamada HTTP.
				if (error instanceof ShopeeApiError && error.kind === 'budget')
					summary.queriesPerformed -= 1;
				summary.failures += 1;
				const safe = safeError(error);
				summary.errorCode = safe.code;
				summary.errorMessage = safe.message;
				break;
			}

			pagesSucceeded += 1;
			summary.productsFound += result.offers.length;
			const validOffers: ShopeeProductOfferRecord[] = [];
			let missingIds = 0;
			for (const offer of result.offers) {
				if (!usableOffer(offer)) {
					missingIds += 1;
					continue;
				}
				const key = productKey(offer.product.itemId, offer.product.shopId);
				if (seen.has(key)) continue;
				seen.add(key);
				if (!matchesDiscoveryFilters(offer.product, unvalidatedInput.filters)) {
					summary.filteredOut = (summary.filteredOut ?? 0) + 1;
					continue;
				}
				validOffers.push(offer);
			}
			if (missingIds > 0) {
				summary.failures += missingIds;
				summary.errorCode ??= 'SHOPEE_PRODUCT_ID_MISSING';
				summary.errorMessage ??= 'Alguns resultados sem itemId ou shopId foram ignorados.';
			}

			try {
				const counts = await upsertCandidates(db, runId, validOffers);
				summary.newCandidates += counts.newCandidates;
				summary.updatedCandidates += counts.updatedCandidates;
			} catch {
				summary.failures += 1;
				summary.errorCode = 'CANDIDATE_STORAGE_FAILED';
				summary.errorMessage = 'Não foi possível salvar os candidatos no banco local.';
				break;
			}

			if (result.pageInfo?.hasNextPage === false || result.offers.length === 0) break;
		}
	} catch (error) {
		// Exceção inesperada: a execução não pode ficar pendente; o detalhe original não é exposto.
		summary.failures += 1;
		const safe = safeError(error);
		summary.errorCode = safe.code;
		summary.errorMessage = safe.message;
	}

	if (summary.failures > 0) {
		summary.status = pagesSucceeded > 0 ? 'partial' : 'failed';
	}
	await recordCollectionFinish(db, runId, summary);
	return summary;
}
