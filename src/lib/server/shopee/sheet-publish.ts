import type { ShopeeCallControl } from './call-control';
import { getProductOffersBatch, MAX_OFFER_BATCH_QUERIES } from './client';
import type { SheetRow } from './google-sheets-writer';
import { extractShopeeIdsFromUrl, toNumber } from './product-match';
import type { ShopeeProductOfferV2 } from './types';
import { parseProducts } from '../sheets';

export const MAX_PUBLISH_SELECTION = MAX_OFFER_BATCH_QUERIES;

export type PublishSelection = { itemId: string; shopId: string; category: string };

export type BlockCode =
	| 'NOT_FOUND'
	| 'NOT_APPROVED'
	| 'UNAVAILABLE'
	| 'NO_AFFILIATE_LINK'
	| 'PLAIN_PRODUCT_LINK'
	| 'INVALID_DATA'
	| 'INVALID_CATEGORY'
	| 'ALREADY_PUBLISHED'
	| 'ALREADY_IN_CATALOG'
	| 'UNCERTAIN_MATCH'
	| 'DUPLICATE_SELECTION'
	| 'SHEET_FORMAT';

export type PreviewBlock = {
	itemId: string;
	shopId: string;
	name: string | null;
	code: BlockCode;
	message: string;
};

export type PreviewItem = {
	itemId: string;
	shopId: string;
	row: SheetRow;
	notes: string[];
};

export type PublishPreview = {
	items: PreviewItem[];
	blocked: PreviewBlock[];
	/** Assinatura das linhas da prévia; a confirmação só vale se coincidir com a revalidação. */
	hash: string;
};

export class PublishInputError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'PublishInputError';
	}
}

const SHOPEE_ID = /^[1-9]\d{0,19}$/;

export function validatePublishSelections(input: readonly PublishSelection[]): PublishSelection[] {
	if (input.length === 0) throw new PublishInputError('Selecione ao menos um candidato aprovado.');
	if (input.length > MAX_PUBLISH_SELECTION) {
		throw new PublishInputError(
			`Selecione no máximo ${MAX_PUBLISH_SELECTION} candidatos por operação.`
		);
	}
	return input.map((selection) => {
		if (!SHOPEE_ID.test(selection.itemId) || !SHOPEE_ID.test(selection.shopId)) {
			throw new PublishInputError('Identificadores de candidato inválidos.');
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

const key = (itemId: string, shopId: string) => `${itemId}\u0000${shopId}`;

export async function listPublishableCategories(db: D1Database): Promise<string[]> {
	const result = await db
		.prepare("SELECT DISTINCT category FROM products WHERE trim(category) <> '' ORDER BY category")
		.all<{ category: string }>();
	return result.results.map((row) => row.category);
}

function formatPrice(value: number): string {
	return `R$ ${value.toFixed(2).replace('.', ',')}`;
}

function isAffiliateHost(url: string): boolean {
	try {
		const parsed = new URL(url);
		return parsed.protocol === 'https:' && /(^|\.)shopee\.com\.br$/i.test(parsed.hostname);
	} catch {
		return false;
	}
}

function csvCell(value: string): string {
	return `"${value.replace(/"/g, '""')}"`;
}

/** Garante que a linha gerada é lida de volta pelo parser oficial exatamente como será publicada. */
function roundTrips(row: SheetRow): boolean {
	const header = 'id,nome,categoria,preco,preco_anterior,imagem,url,publicado_em';
	const line = [
		row.id,
		row.name,
		row.category,
		row.price,
		row.previous,
		row.image,
		row.url,
		row.date
	]
		.map(csvCell)
		.join(',');
	const outcome = parseProducts(`${header}\n${line}`);
	const parsed = outcome.items[0];
	return outcome.items.length === 1 && parsed?.url === row.url && parsed.name === row.name;
}

async function sha256Hex(text: string): Promise<string> {
	const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
	return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export type Revalidator = (
	pairs: ReadonlyArray<{ itemId: string; shopId: string }>
) => Promise<Map<string, ShopeeProductOfferV2>>;

/** Revalida candidatos na Shopee numa única chamada em lote (até 10). */
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
	const [candidates, published, linked, uncertain] = await Promise.all([
		db
			.prepare(
				`SELECT item_id, shop_id, status, product_name, offer_link, product_link, price, price_min, last_seen_at
				FROM candidates WHERE (item_id, shop_id) IN (${marks})`
			)
			.bind(...flat)
			.all<CandidateRow>(),
		db
			.prepare(
				`SELECT item_id, shop_id FROM sheet_published_candidates WHERE (item_id, shop_id) IN (${marks})`
			)
			.bind(...flat)
			.all<{ item_id: string; shop_id: string }>(),
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
		published: new Set(published.results.map((row) => key(row.item_id, row.shop_id))),
		linked: new Set(linked.results.map((row) => key(row.item_id, row.shop_id))),
		uncertain: new Set(uncertain.filter((value): value is string => value !== null))
	};
}

/**
 * Monta a prévia de publicação: revalida na Shopee, confere duplicidade (por itemId/shopId,
 * URL e id; nunca por nome) e bloqueia o que não for seguro. Não grava nada.
 */
export async function buildPublishPreview(
	db: D1Database,
	input: readonly PublishSelection[],
	revalidate: Revalidator,
	now: Date = new Date()
): Promise<PublishPreview> {
	const selections = validatePublishSelections(input);
	const [existing, categories, fresh] = await Promise.all([
		listExisting(db, selections),
		listPublishableCategories(db),
		revalidate(selections)
	]);
	const validCategories = new Set(categories);
	const items: PreviewItem[] = [];
	const blocked: PreviewBlock[] = [];
	const seen = new Set<string>();
	const date = now.toISOString().slice(0, 10);

	for (const selection of selections) {
		const k = key(selection.itemId, selection.shopId);
		const candidate = existing.candidates.get(k);
		const block = (code: BlockCode, message: string) =>
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
			block('NOT_APPROVED', 'Somente candidatos aprovados podem ser publicados.');
			continue;
		}
		if (existing.published.has(k)) {
			block('ALREADY_PUBLISHED', 'Este anúncio já foi publicado por este fluxo.');
			continue;
		}
		if (existing.linked.has(k)) {
			block(
				'ALREADY_IN_CATALOG',
				'Já existe um produto do catálogo vinculado a este itemId/shopId.'
			);
			continue;
		}
		if (existing.uncertain.has(k)) {
			block(
				'UNCERTAIN_MATCH',
				'A auditoria sugeriu este anúncio como possível correspondência de um produto existente. Resolva o vínculo antes de publicar.'
			);
			continue;
		}
		if (!validCategories.has(selection.category)) {
			block('INVALID_CATEGORY', 'Escolha uma categoria já utilizada na planilha.');
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
				'O link disponível não é um link de afiliado; um link comum de produto nunca é publicado.'
			);
			continue;
		}

		const priceMin = toNumber(node.priceMin) ?? toNumber(node.price);
		const priceMax = toNumber(node.priceMax);
		const name = node.productName?.replace(/\s+/g, ' ').trim();
		const image = node.imageUrl?.trim();
		if (!name || priceMin === null || !image || !/^https:\/\//i.test(image)) {
			block('INVALID_DATA', 'Nome, preço ou imagem inválidos na revalidação.');
			continue;
		}

		const row: SheetRow = {
			id: `shopee-${selection.shopId}-${selection.itemId}`,
			name,
			category: selection.category,
			price:
				priceMax !== null && priceMax > priceMin
					? `${formatPrice(priceMin)} - ${formatPrice(priceMax)}`
					: formatPrice(priceMin),
			previous: '',
			image,
			url: offerLink,
			date
		};
		if (!roundTrips(row)) {
			block('SHEET_FORMAT', 'A linha gerada não é aceita pelo parser da planilha.');
			continue;
		}
		const sameUrlInCatalog = await db
			.prepare('SELECT 1 AS hit FROM products WHERE url = ? OR id = ? LIMIT 1')
			.bind(row.url, row.id)
			.first<{ hit: number }>();
		if (sameUrlInCatalog) {
			block('ALREADY_IN_CATALOG', 'Já existe um produto com o mesmo link ou id no catálogo.');
			continue;
		}

		const notes: string[] = [];
		const seenPrice = toNumber(candidate.price_min) ?? toNumber(candidate.price);
		if (seenPrice !== null && Math.round(seenPrice * 100) !== Math.round(priceMin * 100)) {
			notes.push(
				`O preço mudou desde a última coleta (${formatPrice(seenPrice)} → ${formatPrice(priceMin)}).`
			);
		}
		items.push({ itemId: selection.itemId, shopId: selection.shopId, row, notes });
	}

	const hash = await sha256Hex(
		JSON.stringify(items.map(({ itemId, shopId, row }) => [itemId, shopId, row]))
	);
	return { items, blocked, hash };
}

export type PublishOperationStatus = 'blocked' | 'completed' | 'failed';

export async function recordPublishOperation(
	db: D1Database,
	input: {
		status: PublishOperationStatus;
		requestedRows: number;
		writtenRows: number;
		payload: unknown;
		errorCode?: string | null;
		errorMessage?: string | null;
	},
	now: Date = new Date()
): Promise<number> {
	const result = await db
		.prepare(
			`INSERT INTO sheet_publish_operations
			(status, requested_rows, written_rows, payload, error_code, error_message, created_at, finished_at)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
		)
		.bind(
			input.status,
			input.requestedRows,
			input.writtenRows,
			JSON.stringify(input.payload),
			input.errorCode ?? null,
			input.errorMessage ?? null,
			now.toISOString(),
			now.toISOString()
		)
		.run();
	return result.meta.last_row_id;
}

export async function markCandidatesPublished(
	db: D1Database,
	operationId: number,
	items: ReadonlyArray<Pick<PreviewItem, 'itemId' | 'shopId' | 'row'>>
): Promise<void> {
	await db.batch(
		items.map((item) =>
			db
				.prepare(
					`INSERT INTO sheet_published_candidates (item_id, shop_id, product_id, operation_id)
					VALUES (?, ?, ?, ?)`
				)
				.bind(item.itemId, item.shopId, item.row.id, operationId)
		)
	);
}

export type PublishOperationRow = {
	id: number;
	status: PublishOperationStatus;
	requested_rows: number;
	written_rows: number;
	error_code: string | null;
	error_message: string | null;
	created_at: string;
};

export async function listPublishOperations(
	db: D1Database,
	limit = 20
): Promise<PublishOperationRow[]> {
	const result = await db
		.prepare(
			`SELECT id, status, requested_rows, written_rows, error_code, error_message, created_at
			FROM sheet_publish_operations ORDER BY id DESC LIMIT ?`
		)
		.bind(limit)
		.all<PublishOperationRow>();
	return result.results;
}

export async function listApprovedCandidates(db: D1Database, limit = 50) {
	const result = await db
		.prepare(
			`SELECT c.item_id, c.shop_id, c.product_name, c.price, c.price_min, c.price_max, c.last_seen_at
			FROM candidates c
			WHERE c.status = 'approved'
				AND NOT EXISTS (
					SELECT 1 FROM sheet_published_candidates p WHERE p.item_id = c.item_id AND p.shop_id = c.shop_id
				)
			ORDER BY c.last_seen_at DESC LIMIT ?`
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
