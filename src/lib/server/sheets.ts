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
	let afterQuote = false;
	const input = text.replace(/^\uFEFF/, '');

	for (let i = 0; i < input.length; i += 1) {
		const char = input[i];
		if (char === '"') {
			if (quoted && input[i + 1] === '"') {
				field += '"';
				i += 1;
			} else if (quoted) {
				quoted = false;
				afterQuote = true;
			} else if (field === '' && !afterQuote) {
				quoted = true;
			} else {
				throw new Error('O CSV contém aspas em uma posição inválida.');
			}
		} else if (char === ',' && !quoted) {
			row.push(field.trim());
			field = '';
			afterQuote = false;
		} else if ((char === '\n' || char === '\r') && !quoted) {
			if (char === '\r' && input[i + 1] === '\n') i += 1;
			row.push(field.trim());
			if (row.some((cell) => cell !== '')) rows.push(row);
			row = [];
			field = '';
			afterQuote = false;
		} else if (afterQuote && !/\s/.test(char)) {
			throw new Error('O CSV contém conteúdo após o fechamento de aspas.');
		} else if (!afterQuote) {
			field += char;
		} else {
			continue;
		}
	}
	if (quoted) throw new Error('O CSV contém um campo com aspas não fechadas.');
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
	if (!headerRow) throw new Error('O CSV não contém uma linha de cabeçalho.');
	const headers = headerRow.map(normalizeHeader);
	if (new Set(headers).size !== headers.length) {
		throw new Error('O CSV contém cabeçalhos duplicados.');
	}
	const requiredHeaders = [
		['nome', 'name'],
		['preco', 'price'],
		['preco_anterior', 'previous_price', 'precoanterior'],
		['categoria', 'category'],
		['imagem', 'image'],
		['url', 'link']
	];
	if (requiredHeaders.some((aliases) => !aliases.some((alias) => headers.includes(alias)))) {
		throw new Error('O CSV não contém todos os cabeçalhos obrigatórios de produtos.');
	}
	if (body.some((cells) => cells.length !== headers.length)) {
		throw new Error('O CSV contém linhas com quantidade de colunas inconsistente.');
	}
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
	const value = raw.trim().replace(/^R\$\s*/i, '');
	const validPrice =
		/^\d+$/.test(value) ||
		/^\d+[.,]\d{1,2}$/.test(value) ||
		/^\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?$/.test(value) ||
		/^\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?$/.test(value);
	if (!validPrice) return undefined;

	const normalizedValue = /^\d{1,3}(?:,\d{3})+$/.test(value)
		? value.replace(/,/g, '')
		: value;
	return parseAmount(normalizedValue);
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
		if (skipped > 0 && items.length === 0) {
			console.error('A planilha contém linhas de produtos, mas nenhuma é válida.');
			return { items: [], skipped, failed: true };
		}
		return { items, skipped, failed: false };
	} catch (error) {
		console.error('Falha ao validar ou processar o CSV da planilha de produtos:', error);
		return { items: [], skipped: 0, failed: true };
	}
}
