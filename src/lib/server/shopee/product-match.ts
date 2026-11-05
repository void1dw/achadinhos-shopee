import { normalizeText } from '../../format';
import type { Product } from '../../types';
import type { ShopeeProductOfferV2 } from './types';

export type AuditStatus = 'valid' | 'price_changed' | 'unavailable' | 'uncertain' | 'needs_review';
export type MatchLevel = 'linked' | 'url_id' | 'name_search' | 'none';

export const AUDIT_STATUSES: readonly AuditStatus[] = [
	'valid',
	'price_changed',
	'unavailable',
	'uncertain',
	'needs_review'
];

export const AUDIT_STATUS_LABELS: Record<AuditStatus, string> = {
	valid: 'Válido',
	price_changed: 'Preço alterado',
	unavailable: 'Indisponível ou não localizado',
	uncertain: 'Correspondência incerta',
	needs_review: 'Precisa de revisão'
};

export const MATCH_LEVEL_LABELS: Record<MatchLevel, string> = {
	linked: 'Vínculo confirmado (itemId/shopId)',
	url_id: 'IDs extraídos da URL da planilha',
	name_search: 'Busca por nome (não confirmada)',
	none: 'Sem correspondência'
};

export type ShopeeIds = { itemId: string; shopId: string };

export type NameCandidate = {
	itemId: string;
	shopId: string;
	productName: string | null;
	priceMin: number | null;
	priceMax: number | null;
	similarity: number;
};

export type AuditDetail = {
	reasons: string[];
	priceChangePercent?: number | null;
	candidates?: NameCandidate[];
	history?: {
		observedPrice: number | null;
		observedAt: string;
		apiVsObservedPercent: number | null;
	};
};

export type AuditResult = {
	productId: string;
	status: AuditStatus;
	matchLevel: MatchLevel;
	itemId: string | null;
	shopId: string | null;
	sheetPrice: number;
	sheetPriceMax: number | null;
	apiPriceMin: number | null;
	apiPriceMax: number | null;
	apiProductName: string | null;
	detail: AuditDetail;
	lastObservedAt: string | null;
};

const SHOPEE_ID = /^[1-9]\d{0,19}$/;
const NAME_MATCH_THRESHOLD = 0.5;
const NAME_DIVERGENCE_THRESHOLD = 0.2;
const MAX_NAME_CANDIDATES = 5;

/**
 * Extrai shopId/itemId de URLs completas de produto (`/product/{shopId}/{itemId}` ou
 * `...-i.{shopId}.{itemId}`). Links curtos de afiliado (s.shopee.com.br) não carregam IDs.
 */
export function extractShopeeIdsFromUrl(rawUrl: string): ShopeeIds | null {
	let url: URL;
	try {
		url = new URL(rawUrl);
	} catch {
		return null;
	}
	const host = url.hostname.toLowerCase();
	if (host !== 'shopee.com.br' && !host.endsWith('.shopee.com.br')) return null;
	if (host === 's.shopee.com.br') return null;
	const match =
		/\/product\/(\d+)\/(\d+)\/?$/.exec(url.pathname) ?? /\/opaanlp\/(\d+)\/(\d+)\/?$/.exec(url.pathname) ?? /-i\.(\d+)\.(\d+)\/?$/.exec(url.pathname);
	if (!match) return null;
	const [, shopId, itemId] = match;
	return SHOPEE_ID.test(shopId!) && SHOPEE_ID.test(itemId!)
		? { itemId: itemId!, shopId: shopId! }
		: null;
}

function nameTokens(value: string): Set<string> {
	return new Set(
		normalizeText(value)
			.split(/[^a-z0-9]+/)
			.filter((token) => token.length >= 2)
	);
}

/** Coeficiente de Dice entre os conjuntos de palavras (0 a 1). Apenas evidência, nunca prova. */
export function nameSimilarity(a: string, b: string): number {
	const left = nameTokens(a);
	const right = nameTokens(b);
	if (left.size === 0 || right.size === 0) return 0;
	let common = 0;
	for (const token of left) if (right.has(token)) common += 1;
	return (2 * common) / (left.size + right.size);
}

export function toNumber(value: string | number | null | undefined): number | null {
	if (value === null || value === undefined) return null;
	if (typeof value === 'string' && !/^\s*\d+(?:\.\d+)?\s*$/.test(value)) return null;
	const parsed = Number(value);
	return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

const cents = (value: number) => Math.round(value * 100);

function nodeIds(node: ShopeeProductOfferV2): ShopeeIds | null {
	if (node.itemId === null || node.itemId === undefined) return null;
	if (node.shopId === null || node.shopId === undefined) return null;
	const itemId = String(node.itemId);
	const shopId = String(node.shopId);
	return SHOPEE_ID.test(itemId) && SHOPEE_ID.test(shopId) ? { itemId, shopId } : null;
}

function nodePrices(node: ShopeeProductOfferV2): { min: number | null; max: number | null } {
	const min = toNumber(node.priceMin) ?? toNumber(node.price);
	const max = toNumber(node.priceMax) ?? min;
	return { min, max };
}

function base(product: Product, ids: ShopeeIds | null, matchLevel: MatchLevel) {
	return {
		productId: product.id,
		matchLevel,
		itemId: ids?.itemId ?? null,
		shopId: ids?.shopId ?? null,
		sheetPrice: product.price,
		sheetPriceMax: product.priceMax ?? null
	};
}

/**
 * Classifica um produto cuja identidade (itemId/shopId) já é conhecida, comparando-o com o
 * que a API retornou. Exige igualdade exata dos dois IDs.
 */
export function classifyIdentifiedProduct(
	product: Product,
	ids: ShopeeIds,
	matchLevel: 'linked' | 'url_id',
	nodes: readonly ShopeeProductOfferV2[]
): AuditResult {
	const common = base(product, ids, matchLevel);
	const node = nodes.find((candidate) => {
		const nodeId = nodeIds(candidate);
		return nodeId?.itemId === ids.itemId && nodeId.shopId === ids.shopId;
	});
	if (!node) {
		return {
			...common,
			status: 'unavailable',
			apiPriceMin: null,
			apiPriceMax: null,
			apiProductName: null,
			detail: {
				reasons: [
					'A consulta de afiliados da Shopee não retornou este itemId/shopId. O anúncio pode estar indisponível ou fora do programa de afiliados.'
				]
			},
			lastObservedAt: null
		};
	}

	const { min, max } = nodePrices(node);
	const apiProductName = node.productName ?? null;
	const reasons: string[] = [];
	const result = {
		...common,
		apiPriceMin: min,
		apiPriceMax: max,
		apiProductName,
		lastObservedAt: null
	};

	if (min === null) {
		return {
			...result,
			status: 'needs_review',
			detail: { reasons: ['A API não retornou um preço válido para este anúncio.'] }
		};
	}
	if (apiProductName && nameSimilarity(product.name, apiProductName) < NAME_DIVERGENCE_THRESHOLD) {
		return {
			...result,
			status: 'needs_review',
			detail: {
				reasons: ['O nome retornado pela API diverge muito do nome da planilha; confira o vínculo.']
			}
		};
	}

	const sheetMax = product.priceMax ?? product.price;
	const changed =
		cents(min) !== cents(product.price) || (max !== null && cents(max) !== cents(sheetMax));
	if (changed) {
		reasons.push(
			`Preço na planilha: ${product.price.toFixed(2)}${
				product.priceMax !== undefined ? ` – ${product.priceMax.toFixed(2)}` : ''
			}; preço atual na API: ${min.toFixed(2)}${max !== null && max !== min ? ` – ${max.toFixed(2)}` : ''}.`
		);
		return {
			...result,
			status: 'price_changed',
			detail: {
				reasons,
				priceChangePercent: ((min - product.price) / product.price) * 100
			}
		};
	}
	return {
		...result,
		status: 'valid',
		detail: { reasons: ['Preço e identificação conferem com a API.'] }
	};
}

/**
 * Produto sem IDs: a busca por nome só gera candidatos a revisão. Nunca confirma identidade,
 * mesmo com nomes idênticos.
 */
export function classifyNameSearch(
	product: Product,
	nodes: readonly ShopeeProductOfferV2[]
): AuditResult {
	const candidates: NameCandidate[] = [];
	for (const node of nodes) {
		const ids = nodeIds(node);
		if (!ids || !node.productName) continue;
		const similarity = nameSimilarity(product.name, node.productName);
		if (similarity < NAME_MATCH_THRESHOLD) continue;
		const { min, max } = nodePrices(node);
		candidates.push({
			...ids,
			productName: node.productName,
			priceMin: min,
			priceMax: max,
			similarity: Math.round(similarity * 100) / 100
		});
	}
	candidates.sort((a, b) => b.similarity - a.similarity);
	const top = candidates.slice(0, MAX_NAME_CANDIDATES);
	const common = base(product, null, top.length > 0 ? 'name_search' : 'none');
	const empty = {
		apiPriceMin: null,
		apiPriceMax: null,
		apiProductName: null,
		lastObservedAt: null
	};
	if (top.length === 0) {
		return {
			...common,
			...empty,
			status: 'needs_review',
			detail: {
				reasons: [
					'O produto não possui itemId/shopId e a busca por nome não retornou resultados semelhantes.'
				]
			}
		};
	}
	return {
		...common,
		...empty,
		status: 'uncertain',
		detail: {
			reasons: [
				'Sem itemId/shopId na planilha. Os resultados abaixo são apenas semelhantes pelo nome e exigem confirmação manual.'
			],
			candidates: top
		}
	};
}

/** Termo de busca derivado do nome (limite de 100 caracteres da consulta). */
export function searchKeywordFor(name: string): string {
	const clean = name.replace(/\s+/g, ' ').trim();
	if (clean.length <= 100) return clean;
	const cut = clean.slice(0, 100);
	const lastSpace = cut.lastIndexOf(' ');
	return (lastSpace > 40 ? cut.slice(0, lastSpace) : cut).trim();
}
