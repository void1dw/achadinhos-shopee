import type { Product } from '../types';
import { parsePrice as parseAmount } from '../format';
import { categoryChain, resolveCategory } from '../categories';
import { classifyByRules, isGenericCategory, TITLE_CONFIRMED_PRIMARIES } from '../category-rules';

const isApproved = (node: { status: string }): boolean => node.status === 'approved';

export type SheetResult<T> = {
	items: T[];
	skipped: number;
	failed: boolean;
	stale?: boolean;
};

/** Problema encontrado em uma linha da planilha. `reject` tira o produto da vitrine. */
export type ProductIssue = {
	id: string;
	/** Número da linha na planilha (a linha 1 é o cabeçalho). */
	row: number;
	name: string;
	category: string;
	kind: 'reject' | 'warn';
	message: string;
	/** Letra da coluna na planilha ("D"), ou "?" se o cabeçalho não existe. */
	column: string;
	field: string;
	/** Outra linha com o mesmo ID foi aceita; este problema não tira o produto do site. */
	hasValidTwin?: boolean;
};

export type AutoClassified = {
	id: string;
	row: number;
	name: string;
	/** Categoria escrita na planilha. */
	category: string;
	categoryId: string;
	pathNames: string[];
	rule: string;
	/** Por que a categoria da planilha não bastou. */
	origin: 'generic' | 'unknown' | 'pending' | 'confirmation';
};

export type ParseOutcome = {
	items: Product[];
	issues: ProductIssue[];
	counts: {
		rows: number;
		valid: number;
		rejected: number;
		warnings: number;
		emptyPreviousPrice: number;
		duplicateRows: number;
		autoClassified: number;
		viaSheet: number;
	};
	/** Produtos aceitos por regra de título (só as linhas vencedoras). */
	autoClassified: AutoClassified[];
	/** Categoria da planilha que não foi classificada -> quantidade de linhas. */
	unclassified: Map<string, number>;
};

const PRODUCT_CACHE_TTL_MS = 5 * 60 * 1000;
const productCache = new Map<string, { result: SheetResult<Product>; expiresAt: number }>();
const productLoads = new Map<string, Promise<SheetResult<Product>>>();

type CsvRow = { cells: string[]; row: number };

// Parser CSV que respeita vírgulas dentro de campos entre aspas e aspas escapadas.
// `row` é o número real da linha na planilha (linhas vazias contam, mas não são devolvidas).
function parseCsv(text: string): CsvRow[] {
	const rows: CsvRow[] = [];
	let row: string[] = [];
	let field = '';
	let quoted = false;
	let afterQuote = false;
	let record = 1;
	const input = text.replace(/^\uFEFF/, '');

	const endRecord = () => {
		row.push(field.trim());
		if (row.some((cell) => cell !== '')) rows.push({ cells: row, row: record });
		record += 1;
		row = [];
		field = '';
		afterQuote = false;
	};

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
			endRecord();
		} else if (afterQuote && !/\s/.test(char)) {
			throw new Error('O CSV contém conteúdo após o fechamento de aspas.');
		} else if (!afterQuote) {
			field += char;
		} else {
			continue;
		}
	}
	if (quoted) throw new Error('O CSV contém um campo com aspas não fechadas.');
	if (field !== '' || row.length > 0) endRecord();
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

const FIELDS = {
	id: ['id', 'id_produto', 'product_id'],
	name: ['nome', 'name'],
	category: ['categoria', 'category'],
	price: ['preco', 'price'],
	previous: [
		'preco_anterior',
		'previous_price',
		'precoanterior',
		'preco_original',
		'original_price'
	],
	image: ['imagem', 'image'],
	url: ['url', 'link'],
	date: ['publicado_em', 'published_at', 'data_publicacao']
} as const;

type FieldKey = keyof typeof FIELDS;

function columnLetter(index: number): string {
	if (index < 0) return '?';
	let letters = '';
	let n = index;
	do {
		letters = String.fromCharCode(65 + (n % 26)) + letters;
		n = Math.floor(n / 26) - 1;
	} while (n >= 0);
	return letters;
}

type Parsed = { rows: CsvRow[]; columns: Record<FieldKey, number> };

function readTable(text: string): Parsed {
	const [header, ...body] = parseCsv(text);
	if (!header) throw new Error('O CSV não contém uma linha de cabeçalho.');
	const headers = header.cells.map(normalizeHeader);
	if (new Set(headers).size !== headers.length) {
		throw new Error('O CSV contém cabeçalhos duplicados.');
	}
	const columns = Object.fromEntries(
		(Object.keys(FIELDS) as FieldKey[]).map((key) => [
			key,
			headers.findIndex((name) => (FIELDS[key] as readonly string[]).includes(name))
		])
	) as Record<FieldKey, number>;
	// O preço anterior e a data são opcionais; os demais cabeçalhos são obrigatórios.
	const required: FieldKey[] = ['name', 'category', 'price', 'image', 'url'];
	if (required.some((key) => columns[key] < 0)) {
		throw new Error('O CSV não contém todos os cabeçalhos obrigatórios de produtos.');
	}
	if (body.some((line) => line.cells.length !== headers.length)) {
		throw new Error('O CSV contém linhas com quantidade de colunas inconsistente.');
	}
	return { rows: body, columns };
}

function strictAmount(raw: string): number | undefined {
	const value = raw.trim().replace(/^R\$\s*/i, '');
	const validPrice =
		/^\d+$/.test(value) ||
		/^\d+[.,]\d{1,2}$/.test(value) ||
		/^\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?$/.test(value) ||
		/^\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?$/.test(value);
	if (!validPrice) return undefined;

	const normalizedValue = /^\d{1,3}(?:,\d{3})+$/.test(value) ? value.replace(/,/g, '') : value;
	const amount = parseAmount(normalizedValue);
	return amount !== undefined && amount > 0 ? amount : undefined;
}

export type PriceField = { min: number; max?: number };

/**
 * Lê um campo de preço: valor único ("R$ 27,97") ou intervalo ("R$ 27,97 - R$ 56,90").
 * Cada ponta é validada separadamente (nunca se juntam dígitos). Devolve undefined se inválido.
 */
export function parsePriceField(raw: string): PriceField | undefined {
	const parts = raw.split(/\s*[-–—]\s*/);
	if (parts.length > 2) return undefined;
	const values = parts.map(strictAmount);
	if (values.some((value) => value === undefined)) return undefined;
	const [a, b] = values as number[];
	if (b === undefined || a === b) return { min: a };
	return { min: Math.min(a, b), max: Math.max(a, b) };
}

function normalizeDate(raw: string): string | undefined {
	const value = raw.trim();
	if (!value) return undefined;
	const br = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
	const iso = br ? `${br[3]}-${br[2].padStart(2, '0')}-${br[1].padStart(2, '0')}` : value;
	return /^\d{4}-\d{2}-\d{2}/.test(iso) && !Number.isNaN(Date.parse(iso)) ? iso : undefined;
}

function slug(value: string, row: number): string {
	const result = value
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '');
	return result || `linha-${row}`;
}

function isHttpUrl(value: string): boolean {
	try {
		const protocol = new URL(value).protocol;
		return protocol === 'http:' || protocol === 'https:';
	} catch {
		return false;
	}
}

/**
 * Valida a planilha inteira, sem rede e sem cache. Coleta todos os problemas de cada linha e
 * escolhe uma única linha por ID (a de categoria mais específica; empate vale a primeira).
 */
export function parseProducts(text: string): ParseOutcome {
	const { rows, columns } = readTable(text);
	const issues: ProductIssue[] = [];
	const unclassified = new Map<string, number>();
	let emptyPreviousPrice = 0;

	if (columns.previous < 0) {
		issues.push({
			id: '(PLANILHA)',
			row: 1,
			name: '',
			category: '',
			kind: 'warn',
			message: 'COLUNA DE PREÇO ORIGINAL AUSENTE (NENHUM DESCONTO SERÁ EXIBIDO)',
			column: '?',
			field: 'preco_anterior'
		});
	}

	type Candidate = {
		product: Product;
		depth: number;
		row: number;
		issueStart: number;
		origin?: AutoClassified['origin'];
	};
	const candidates = new Map<string, Candidate[]>();
	const rejectedById = new Map<string, number[]>();

	for (const { cells, row } of rows) {
		const get = (key: FieldKey) => (columns[key] >= 0 ? (cells[columns[key]] ?? '').trim() : '');
		const name = get('name');
		const category = get('category');
		const rawId = get('id');
		const id = rawId || slug(name, row);
		const rowIssues: ProductIssue[] = [];
		const add = (kind: ProductIssue['kind'], field: FieldKey, label: string, message: string) =>
			rowIssues.push({
				id,
				row,
				name,
				category,
				kind,
				message,
				column: columnLetter(columns[field]),
				field: label
			});

		if (!rawId) {
			add('warn', 'id', 'id', 'ID AUSENTE (GERADO AUTOMATICAMENTE A PARTIR DO NOME)');
		}
		if (!name) add('reject', 'name', 'nome', 'NOME VAZIO');

		const rawPrice = get('price');
		const price = rawPrice ? parsePriceField(rawPrice) : undefined;
		if (!rawPrice) add('reject', 'price', 'preco', 'PREÇO ATUAL VAZIO');
		else if (!price) add('reject', 'price', 'preco', `PREÇO ATUAL INVÁLIDO: "${rawPrice}"`);

		const rawPrevious = get('previous');
		let previous: PriceField | undefined;
		if (!rawPrevious) {
			emptyPreviousPrice += 1;
		} else {
			previous = parsePriceField(rawPrevious);
			if (!previous) {
				add(
					'warn',
					'previous',
					'preco_anterior',
					`PREÇO ORIGINAL INVÁLIDO IGNORADO: "${rawPrevious}"`
				);
			}
		}

		let resolvedDepth = 0;
		let categoryId: string | undefined;
		let autoRule: string | undefined;
		let origin: AutoClassified['origin'] | undefined;
		if (!category) {
			add('reject', 'category', 'categoria', 'CATEGORIA VAZIA');
		} else {
			const resolution = resolveCategory(category);
			const needsTitle =
				resolution.status !== 'ambiguous' &&
				resolution.status !== 'unknown' &&
				resolution.path.length === 1 &&
				TITLE_CONFIRMED_PRIMARIES.includes(resolution.category.id);
			if (resolution.status === 'ok' && !needsTitle) {
				resolvedDepth = resolution.path.length;
			} else {
				const eligible = resolution.status !== 'ambiguous';
				const hint = 'path' in resolution ? resolution.path[0]?.id : undefined;
				const result = eligible ? classifyByRules(name, { categoryHint: hint }) : undefined;
				const chain = result?.status === 'matched' ? categoryChain(result.categoryId) : [];
				if (result?.status === 'matched' && chain.length > 0 && chain.every(isApproved)) {
					categoryId = result.categoryId;
					autoRule = result.ruleId;
					resolvedDepth = chain.length;
					origin = needsTitle
						? 'confirmation'
						: resolution.status === 'pending'
							? 'pending'
							: isGenericCategory(category)
								? 'generic'
								: 'unknown';
				} else {
					const reason = needsTitle
						? 'CATEGORIA EXIGE CONFIRMAÇÃO PELO TÍTULO'
						: resolution.status === 'pending'
							? 'CATEGORIA AGUARDANDO APROVAÇÃO'
							: resolution.status === 'ambiguous'
								? 'CATEGORIA AMBÍGUA (USE O CAMINHO COMPLETO, EX.: MODA FEMININA > CALÇAS)'
								: isGenericCategory(category)
									? 'CATEGORIA GENÉRICA'
									: 'CATEGORIA DESCONHECIDA';
					const detail =
						result?.status === 'ambiguous'
							? ` | TÍTULO AMBÍGUO ENTRE AS REGRAS ${result.ruleIds.join(', ')} (REVISÃO MANUAL)`
							: eligible
								? ' | NENHUMA REGRA DE TÍTULO COM CORRESPONDÊNCIA CLARA (REVISÃO MANUAL)'
								: '';
					add('reject', 'category', 'categoria', `${reason}: "${category}"${detail}`);
					unclassified.set(category, (unclassified.get(category) ?? 0) + 1);
				}
			}
		}

		const image = get('image');
		if (!image) add('reject', 'image', 'imagem', 'IMAGEM VAZIA');
		else if (!isHttpUrl(image)) add('reject', 'image', 'imagem', `IMAGEM COM URL INVÁLIDA`);

		const url = get('url');
		if (!url) add('reject', 'url', 'url', 'LINK DE AFILIADO VAZIO');
		else if (!isHttpUrl(url)) add('reject', 'url', 'url', `LINK DE AFILIADO COM URL INVÁLIDA`);

		const rawDate = get('date');
		const publishedAt = normalizeDate(rawDate);
		if (rawDate && !publishedAt) {
			add('warn', 'date', 'publicado_em', `DATA DE PUBLICAÇÃO INVÁLIDA IGNORADA: "${rawDate}"`);
		}

		const issueStart = issues.length;
		issues.push(...rowIssues);

		if (rowIssues.some((issue) => issue.kind === 'reject') || !price) {
			rejectedById.set(id, [...(rejectedById.get(id) ?? []), row]);
			continue;
		}
		const product: Product = {
			id,
			name,
			price: price.min,
			...(price.max !== undefined ? { priceMax: price.max } : {}),
			...(previous ? { previousPrice: previous.min } : {}),
			...(previous?.max !== undefined ? { previousPriceMax: previous.max } : {}),
			category,
			...(categoryId ? { categoryId, autoRule } : {}),
			image,
			url,
			...(publishedAt ? { publishedAt } : {})
		};
		const list = candidates.get(id) ?? [];
		list.push({ product, depth: resolvedDepth, row, issueStart, origin });
		candidates.set(id, list);
	}

	// Um produto por ID: a categoria mais específica vence; as demais linhas viram aviso.
	const winners: Array<{ row: number; product: Product; origin?: AutoClassified['origin'] }> = [];
	let duplicateRows = 0;
	for (const [id, list] of candidates) {
		const winner = list.reduce((best, item) => (item.depth > best.depth ? item : best));
		winners.push({ row: winner.row, product: winner.product, origin: winner.origin });
		for (const item of list) {
			if (item === winner) continue;
			duplicateRows += 1;
			issues.push({
				id,
				row: item.row,
				name: item.product.name,
				category: item.product.category,
				kind: 'warn',
				message: `ID DUPLICADO: LINHA IGNORADA (MANTIDA A LINHA ${winner.row})`,
				column: columnLetter(columns.id),
				field: 'id'
			});
		}
	}
	for (const issue of issues) {
		if (issue.kind === 'reject' && candidates.has(issue.id)) issue.hasValidTwin = true;
	}
	winners.sort((a, b) => a.row - b.row);
	const items = winners.map((winner) => winner.product);
	const autoClassified: AutoClassified[] = winners.flatMap((winner) => {
		const { product, origin } = winner;
		if (!product.categoryId || !product.autoRule || !origin) return [];
		return {
			id: product.id,
			row: winner.row,
			name: product.name,
			category: product.category,
			categoryId: product.categoryId,
			pathNames: categoryChain(product.categoryId).map((node) => node.name),
			rule: product.autoRule,
			origin
		};
	});

	const rejectedIds = [...rejectedById.keys()].filter((id) => !candidates.has(id));
	return {
		items,
		issues,
		unclassified,
		autoClassified,
		counts: {
			rows: rows.length,
			valid: items.length,
			rejected: rejectedIds.length,
			warnings: issues.filter((issue) => issue.kind === 'warn').length,
			emptyPreviousPrice,
			duplicateRows,
			autoClassified: autoClassified.length,
			viaSheet: items.length - autoClassified.length
		}
	};
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

async function fetchCsv(fetcher: typeof fetch, url: string): Promise<string | undefined> {
	const response = await fetcher(url);
	if (!response.ok) {
		console.error(`Falha ao carregar a planilha de produtos (HTTP ${response.status}).`);
		return undefined;
	}
	const text = await response.text();
	if (text.trimStart().startsWith('<!DOCTYPE html') || text.trimStart().startsWith('<html')) {
		console.error('A planilha retornou HTML em vez de CSV publicado.');
		return undefined;
	}
	return text;
}

async function fetchProducts(fetcher: typeof fetch, url: string): Promise<SheetResult<Product>> {
	try {
		const text = await fetchCsv(fetcher, url);
		if (text === undefined) return { items: [], skipped: 0, failed: true };
		const { items, counts } = parseProducts(text);
		const skipped = counts.rows - items.length;
		if (skipped > 0) {
			console.warn(`${skipped} linha(s) da planilha foram ignoradas (inválidas ou duplicadas).`);
		}
		if (items.length === 0 && counts.rows > 0) {
			console.error('A planilha contém linhas de produtos, mas nenhuma é válida.');
			return { items: [], skipped, failed: true };
		}
		return { items, skipped, failed: false };
	} catch (error) {
		console.error('Falha ao validar ou processar o CSV da planilha de produtos:', error);
		return { items: [], skipped: 0, failed: true };
	}
}

/** Leitura nova da planilha para o relatório: não usa nem altera o cache da vitrine. */
export async function auditProducts(
	fetcher: typeof fetch,
	url: string
): Promise<ParseOutcome | undefined> {
	try {
		const text = await fetchCsv(fetcher, url);
		return text === undefined ? undefined : parseProducts(text);
	} catch (error) {
		console.error('Falha ao auditar o CSV da planilha de produtos:', error);
		return undefined;
	}
}
