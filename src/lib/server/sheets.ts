import type { Product } from '../types';
import { parsePrice as parseAmount } from '../format';

export type SheetResult<T> = {
	items: T[];
	skipped: number;
	failed: boolean;
	stale?: boolean;
};

const PRODUCT_CACHE_TTL_MS = 5 * 60 * 1000;
const productCache = new Map<string, { result: SheetResult<Product>; expiresAt: number }>();
const productLoads = new Map<string, Promise<SheetResult<Product>>>();

// Parser CSV que respeita vírgulas dentro de campos entre aspas e aspas escapadas.
function parseCsv(text: string): string[][] {
	const rows: string[][] = [];
	let row: string[] = [];
	let field = '';
	let quoted = false;
	const input = text.replace(/^\uFEFF/, '');

	for (let i = 0; i < input.length; i += 1) {
		const char = input[i];
		if (char === '"') {
			if (quoted && input[i + 1] === '"') {
				field += '"';
				i += 1;
			} else {
				quoted = !quoted;
			}
		} else if (char === ',' && !quoted) {
			row.push(field.trim());
			field = '';
		} else if ((char === '\n' || char === '\r') && !quoted) {
			if (char === '\r' && input[i + 1] === '\n') i += 1;
			row.push(field.trim());
			if (row.some((cell) => cell !== '')) rows.push(row);
			row = [];
			field = '';
		} else {
			field += char;
		}
	}
	row.push(field.trim());
	if (row.some((cell) => cell !== '')) rows.push(row);
	return rows;
}

function normalizeHeader(value: string): string {
	return value
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.toLowerCase()
		.trim()
		.replace(/[\s-]+/g, '_');
}

function records(text: string): Array<Record<string, string>> {
	const [headerRow, ...body] = parseCsv(text);
	if (!headerRow || !body.length) return [];
	const headers = headerRow.map(normalizeHeader);
	return body.map((cells) =>
		Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? '']))
	);
}

function first(record: Record<string, string>, ...keys: string[]): string {
	for (const key of keys) {
		const value = record[key]?.trim();
		if (value) return value;
	}
	return '';
}

function parsePrice(raw: string): number | undefined {
	const amounts = raw
		.match(/\d[\d.,]*/g)
		?.map(parseAmount)
		.filter((value) => value !== undefined);
	if (!amounts?.length) return undefined;
	return amounts.reduce((sum, amount) => sum + amount, 0) / amounts.length;
}

function normalizeDate(raw: string): string | undefined {
	const value = raw.trim();
	if (!value) return undefined;
	const br = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
	if (br) return `${br[3]}-${br[2].padStart(2, '0')}-${br[1].padStart(2, '0')}`;
	return value;
}

function slug(value: string, index: number): string {
	const result = value
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '');
	return result || `linha-${index + 1}`;
}

function isHttpUrl(value: string): boolean {
	try {
		const protocol = new URL(value).protocol;
		return protocol === 'http:' || protocol === 'https:';
	} catch {
		return false;
	}
}

export function loadProducts(fetcher: typeof fetch, url: string): Promise<SheetResult<Product>> {
	const cached = productCache.get(url);
	if (cached && cached.expiresAt > Date.now()) return Promise.resolve(cached.result);

	const pending = productLoads.get(url);
	if (pending) return pending;

	const request = fetchProducts(fetcher, url)
		.then((result) => {
			if (!result.failed) {
				productCache.set(url, { result, expiresAt: Date.now() + PRODUCT_CACHE_TTL_MS });
				return result;
			}
			return cached ? { ...cached.result, stale: true } : result;
		})
		.finally(() => productLoads.delete(url));
	productLoads.set(url, request);
	return request;
}

async function fetchProducts(fetcher: typeof fetch, url: string): Promise<SheetResult<Product>> {
	try {
		const response = await fetcher(url);
		if (!response.ok) {
			console.error(`Falha ao carregar a planilha de produtos (HTTP ${response.status}).`);
			return { items: [], skipped: 0, failed: true };
		}
		const text = await response.text();
		if (text.trimStart().startsWith('<!DOCTYPE html') || text.trimStart().startsWith('<html')) {
			console.error('A planilha retornou HTML em vez de CSV publicado.');
			return { items: [], skipped: 0, failed: true };
		}
		let skipped = 0;
		const items: Product[] = [];
		const usedIds = new Set<string>();
		records(text).forEach((record, index) => {
			const name = first(record, 'nome', 'name');
			const price = parsePrice(first(record, 'preco', 'price'));
			const previousPrice = parsePrice(
				first(record, 'preco_anterior', 'previous_price', 'precoanterior')
			);
			const category = first(record, 'categoria', 'category');
			const image = first(record, 'imagem', 'image');
			const productUrl = first(record, 'url', 'link');
			if (
				!name ||
				price === undefined ||
				previousPrice === undefined ||
				!category ||
				!isHttpUrl(image) ||
				!isHttpUrl(productUrl)
			) {
				skipped += 1;
				return;
			}
			const baseId = first(record, 'id') || slug(name, index);
			let id = baseId;
			let duplicateSuffix = 2;
			while (usedIds.has(id)) {
				id = `${baseId}-${duplicateSuffix}`;
				duplicateSuffix += 1;
			}
			usedIds.add(id);
			items.push({
				id,
				name,
				price,
				previousPrice,
				category,
				image,
				url: productUrl,
				...(normalizeDate(first(record, 'publicado_em', 'published_at', 'data_publicacao'))
					? {
							publishedAt: normalizeDate(
								first(record, 'publicado_em', 'published_at', 'data_publicacao')
							)
						}
					: {})
			});
		});
		if (skipped > 0) {
			console.warn(
				`${skipped} linha(s) da planilha foram ignoradas por dados obrigatórios inválidos.`
			);
		}
		return { items, skipped, failed: false };
	} catch (error) {
		console.error('Erro inesperado ao processar a planilha de produtos:', error);
		return { items: [], skipped: 0, failed: true };
	}
}
