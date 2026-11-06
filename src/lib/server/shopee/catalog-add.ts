import type { Product } from '../../types';
import type { ShopeeCallControl } from './call-control';
import { getProductOffersBatch, MAX_OFFER_BATCH_QUERIES } from './client';
import { extractShopeeIdsFromUrl, toNumber } from './product-match';
import type { ShopeeProductOfferV2 } from './types';
import { insertProductWithShopeeLink } from '../product-store';

export const MAX_CATALOG_ADD_SELECTION = MAX_OFFER_BATCH_QUERIES;
export type CatalogAddSelection = { itemId: string; shopId: string; category: string };
export type CatalogAddBlockCode =
	| 'NOT_FOUND'
	| 'NOT_APPROVED'
	| 'UNAVAILABLE'
	| 'NO_AFFILIATE_LINK'
	| 'PLAIN_PRODUCT_LINK'
	| 'INVALID_DATA'
	| 'INVALID_CATEGORY'
	| 'ALREADY_IN_CATALOG'
	| 'UNCERTAIN_MATCH'
	| 'DUPLICATE_SELECTION';
export type CatalogAddBlock = {
	itemId: string;
	shopId: string;
	name: string | null;
	code: CatalogAddBlockCode;
	message: string;
};
export type CatalogAddItem = {
	itemId: string;
	shopId: string;
	product: Product;
	notes: string[];
};
export type CatalogAddPreview = {
	items: CatalogAddItem[];
	blocked: CatalogAddBlock[];
	hash: string;
};

export class CatalogAddInputError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'CatalogAddInputError';
	}
}

const SHOPEE_ID = /^[1-9]\d{0,19}$/;
const key = (itemId: string, shopId: string) => `${itemId}\u0000${shopId}`;

export function validateCatalogAddSelections(
	input: readonly CatalogAddSelection[]
): CatalogAddSelection[] {
	if (input.length === 0)
		throw new CatalogAddInputError('Selecione ao menos um candidato aprovado.');
	if (input.length > MAX_CATALOG_ADD_SELECTION) {
		throw new CatalogAddInputError(
			`Selecione no máximo ${MAX_CATALOG_ADD_SELECTION} candidatos por operação.`
		);
	}
	return input.map((selection) => {
		if (!SHOPEE_ID.test(selection.itemId) || !SHOPEE_ID.test(selection.shopId)) {
			throw new CatalogAddInputError('Identificadores de candidato inválidos.');
		}
		return { ...selection, category: selection.category.trim() };
	});
}

type CandidateRow = {
	item_id: string;
	shop_id: string;
	status: string;
	product_name: string | null;
	offer_link: string | null;
	product_link: string | null;
	price: string | null;
	price_min: string | null;
	last_seen_at: string;
};

export async function listCatalogCategories(db: D1Database): Promise<string[]> {
	const result = await db
		.prepare("SELECT DISTINCT category FROM products WHERE trim(category) <> '' ORDER BY category")
		.all<{ category: string }>();
	return result.results.map((row) => row.category);
}

export async function listApprovedCandidates(db: D1Database, limit = 50) {
	const result = await db
		.prepare(
			`SELECT c.item_id, c.shop_id, c.product_name, c.price, c.price_min, c.price_max, c.last_seen_at
			FROM candidates c
			WHERE c.status = 'approved'
				AND NOT EXISTS (
					SELECT 1 FROM products p WHERE
						(p.item_id = c.item_id AND p.shop_id = c.shop_id)
						OR p.id = ('shopee-' || c.shop_id || '-' || c.item_id)
						OR (c.offer_link IS NOT NULL AND p.url = c.offer_link)
				)
			ORDER BY c.last_seen_at DESC, c.item_id, c.shop_id LIMIT ?`
		)
		.bind(limit)
		.all<{
			item_id: string;
			shop_id: string;
			product_name: string | null;
			price: string | null;
			price_min: string | null;
			price_max: string | null;
			last_seen_at: string;
		}>();
	return result.results;
}

function isAffiliateHost(url: string): boolean {
	try {
		const parsed = new URL(url);
		return parsed.protocol === 'https:' && /(^|\.)shopee\.com\.br$/i.test(parsed.hostname);
	} catch {
		return false;
	}
}

function isHttpsUrl(value: string): boolean {
	try {
		const parsed = new URL(value);
		return parsed.protocol === 'https:' && parsed.hostname.length > 0;
	} catch {
		return false;
	}
}

async function sha256Hex(text: string): Promise<string> {
	const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
	return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export type Revalidator = (
	pairs: ReadonlyArray<{ itemId: string; shopId: string }>
) => Promise<Map<string, ShopeeProductOfferV2>>;

export function shopeeRevalidator(
	credentials: Pick<Cloudflare.Env, 'SHOPEE_APP_ID' | 'SHOPEE_APP_SECRET'>,
	fetcher: typeof fetch = fetch,
	control?: ShopeeCallControl
): Revalidator {
	return async (pairs) => {
		const pages = await getProductOffersBatch(
			credentials,
			pairs.map((pair) => ({ ...pair, page: 1, limit: 1, listType: 0 })),
			fetcher,
			control
		);
		const found = new Map<string, ShopeeProductOfferV2>();
		pairs.forEach((pair, index) => {
			const node = pages[index]?.offers
				.map((offer) => offer.product)
				.find(
					(product) =>
						String(product.itemId) === pair.itemId && String(product.shopId) === pair.shopId
				);
			if (node) found.set(key(pair.itemId, pair.shopId), node);
		});
		return found;
	};
}

async function listExisting(
	db: D1Database,
	pairs: ReadonlyArray<{ itemId: string; shopId: string }>
) {
	const marks = pairs.map(() => '(?, ?)').join(', ');
	const flat = pairs.flatMap((pair) => [pair.itemId, pair.shopId]);
	const [candidates, linked, uncertain] = await Promise.all([
		db
			.prepare(
				`SELECT item_id, shop_id, status, product_name, offer_link, product_link, price, price_min, last_seen_at
			FROM candidates WHERE (item_id, shop_id) IN (${marks})`
			)
			.bind(...flat)
			.all<CandidateRow>(),
		db
			.prepare(`SELECT item_id, shop_id FROM products WHERE (item_id, shop_id) IN (${marks})`)
			.bind(...flat)
			.all<{ item_id: string; shop_id: string }>(),
		Promise.all(
			pairs.map(async (pair) => {
				const hit = await db
					.prepare(
						"SELECT 1 AS hit FROM product_audits WHERE status = 'uncertain' AND instr(detail, ?) > 0 LIMIT 1"
					)
					.bind(`{"itemId":"${pair.itemId}","shopId":"${pair.shopId}"`)
					.first<{ hit: number }>();
				return hit ? key(pair.itemId, pair.shopId) : null;
			})
		)
	]);
	return {
		candidates: new Map(candidates.results.map((row) => [key(row.item_id, row.shop_id), row])),
		linked: new Set(linked.results.map((row) => key(row.item_id, row.shop_id))),
		uncertain: new Set(uncertain.filter((value): value is string => value !== null))
	};
}

/** Revalida em lote e monta uma prévia sem gravar; não usa nomes para detectar correspondências. */
export async function buildCatalogAddPreview(
	db: D1Database,
	input: readonly CatalogAddSelection[],
	revalidate: Revalidator,
	now: Date = new Date()
): Promise<CatalogAddPreview> {
	const selections = validateCatalogAddSelections(input);
	const [existing, categories, fresh] = await Promise.all([
		listExisting(db, selections),
		listCatalogCategories(db),
		revalidate(selections)
	]);
	const validCategories = new Set(categories);
	const items: CatalogAddItem[] = [];
	const blocked: CatalogAddBlock[] = [];
	const seen = new Set<string>();
	const date = now.toISOString().slice(0, 10);

	for (const selection of selections) {
		const k = key(selection.itemId, selection.shopId);
		const candidate = existing.candidates.get(k);
		const block = (code: CatalogAddBlockCode, message: string) =>
			blocked.push({
				itemId: selection.itemId,
				shopId: selection.shopId,
				name: candidate?.product_name ?? null,
				code,
				message
			});
		if (seen.has(k)) {
			block('DUPLICATE_SELECTION', 'O mesmo candidato foi selecionado mais de uma vez.');
			continue;
		}
		seen.add(k);
		if (!candidate) {
			block('NOT_FOUND', 'Candidato não encontrado.');
			continue;
		}
		if (candidate.status !== 'approved') {
			block('NOT_APPROVED', 'Somente candidatos aprovados podem entrar no catálogo.');
			continue;
		}
		if (existing.linked.has(k)) {
			block('ALREADY_IN_CATALOG', 'Já existe um produto vinculado a este itemId/shopId.');
			continue;
		}
		if (existing.uncertain.has(k)) {
			block(
				'UNCERTAIN_MATCH',
				'A auditoria indicou possível correspondência. Resolva o vínculo antes de adicionar.'
			);
			continue;
		}
		if (!validCategories.has(selection.category)) {
			block('INVALID_CATEGORY', 'Escolha uma categoria já utilizada no catálogo.');
			continue;
		}
		const node = fresh.get(k);
		if (!node) {
			block(
				'UNAVAILABLE',
				'A Shopee não retornou este anúncio na revalidação; ele pode estar indisponível.'
			);
			continue;
		}
		const offerLink = node.offerLink ?? candidate.offer_link;
		if (!offerLink) {
			block('NO_AFFILIATE_LINK', 'Não há link de afiliado (offerLink) para este anúncio.');
			continue;
		}
		if (
			!isAffiliateHost(offerLink) ||
			offerLink === node.productLink ||
			offerLink === candidate.product_link ||
			extractShopeeIdsFromUrl(offerLink) !== null
		) {
			block(
				'PLAIN_PRODUCT_LINK',
				'O link disponível não é de afiliado; links diretos de produto não são aceitos.'
			);
			continue;
		}
		const priceMin = toNumber(node.priceMin);
		const apiPriceMax = toNumber(node.priceMax);
		const name = node.productName?.replace(/\s+/g, ' ').trim();
		const image = node.imageUrl?.trim();
		if (!name || priceMin === null || !image || !isHttpsUrl(image)) {
			block('INVALID_DATA', 'Nome, preço ou imagem inválidos na revalidação.');
			continue;
		}
		const id = `shopee-${selection.shopId}-${selection.itemId}`;
		const sameProduct = await db
			.prepare('SELECT 1 AS hit FROM products WHERE url = ? OR id = ? LIMIT 1')
			.bind(offerLink, id)
			.first<{ hit: number }>();
		if (sameProduct) {
			block('ALREADY_IN_CATALOG', 'Já existe um produto com o mesmo link ou id no catálogo.');
			continue;
		}
		const priceMax = apiPriceMax !== null && apiPriceMax > priceMin ? apiPriceMax : undefined;
		const product: Product = {
			id,
			name,
			category: selection.category,
			price: priceMin,
			...(priceMax === undefined ? {} : { priceMax }),
			image,
			url: offerLink,
			publishedAt: date
		};
		const seenPrice = toNumber(candidate.price_min) ?? toNumber(candidate.price);
		const notes =
			seenPrice !== null && Math.round(seenPrice * 100) !== Math.round(priceMin * 100)
				? [
						`O preço mudou desde a última coleta (${seenPrice.toFixed(2)} → ${priceMin.toFixed(2)}).`
					]
				: [];
		items.push({ itemId: selection.itemId, shopId: selection.shopId, product, notes });
	}
	const hash = await sha256Hex(
		JSON.stringify(items.map(({ itemId, shopId, product }) => [itemId, shopId, product]))
	);
	return { items, blocked, hash };
}

export function matchesCatalogAddPreviewHash(
	expected: unknown,
	preview: CatalogAddPreview
): boolean {
	return typeof expected === 'string' && expected === preview.hash;
}
export type CatalogAddFailure = {
	itemId: string;
	shopId: string;
	code: 'UNIQUE_CONFLICT' | 'INSERT_FAILED';
	message: string;
};
export async function addCandidatesToCatalog(
	db: D1Database,
	items: ReadonlyArray<CatalogAddItem>
): Promise<{ added: number; failed: CatalogAddFailure[] }> {
	let added = 0;
	const failed: CatalogAddFailure[] = [];
	for (const item of items) {
		try {
			await insertProductWithShopeeLink(db, item.product, {
				itemId: item.itemId,
				shopId: item.shopId
			});
			added += 1;
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Falha ao inserir no catálogo.';
			const unique = /unique constraint|already exists/i.test(message);
			failed.push({
				itemId: item.itemId,
				shopId: item.shopId,
				code: unique ? 'UNIQUE_CONFLICT' : 'INSERT_FAILED',
				message: unique
					? 'Conflito de unicidade no catálogo; nenhum registro foi ignorado.'
					: message
			});
		}
	}
	return { added, failed };
}
