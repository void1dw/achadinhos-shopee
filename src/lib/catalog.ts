import { isInCategory } from './categories';
import { normalizeText } from './format';
import { byNewest, isAchadinho, toShowcase } from './products';
import type { Product, ShowcaseProduct } from './types';

export const CATALOG_PAGE_SIZE = 48;
export const CATALOG_PATH = '/catalogo';

export type CatalogSort = 'recentes' | 'menor-preco' | 'maior-preco';
const SORTS: readonly CatalogSort[] = ['recentes', 'menor-preco', 'maior-preco'];

export type CatalogQuery = {
	q: string;
	category: string;
	sort: CatalogSort;
	page: number;
};

export type CatalogCounts = {
	/** Produtos exibidos no Catálogo Completo (inclui os Achadinhos). */
	catalog: number;
	achadinhos: number;
};

/**
 * Separa a base nas duas áreas. `achadinhos` é o único conjunto enviado à home e às categorias;
 * os demais produtos só chegam ao navegador pela rota /catalogo.
 */
export function splitProducts(products: Product[]): {
	achadinhos: Product[];
	counts: CatalogCounts;
} {
	const showcase = toShowcase(products);
	return {
		achadinhos: products.filter(isAchadinho),
		counts: { catalog: showcase.length, achadinhos: showcase.filter(isAchadinho).length }
	};
}

export function parseCatalogQuery(params: URLSearchParams): CatalogQuery {
	const sort = params.get('ordem') as CatalogSort;
	const page = Number.parseInt(params.get('pagina') ?? '', 10);
	return {
		q: (params.get('q') ?? '').trim().slice(0, 100),
		category: params.get('categoria') ?? '',
		sort: SORTS.includes(sort) ? sort : 'recentes',
		page: Number.isFinite(page) && page > 0 ? page : 1
	};
}

/** Link do catálogo com os filtros atuais; valores padrão ficam fora da URL. */
export function catalogHref(query: CatalogQuery, overrides: Partial<CatalogQuery> = {}): string {
	const next = { ...query, ...overrides };
	const params = new URLSearchParams();
	if (next.q) params.set('q', next.q);
	if (next.category) params.set('categoria', next.category);
	if (next.sort !== 'recentes') params.set('ordem', next.sort);
	if (next.page > 1) params.set('pagina', String(next.page));
	const search = params.toString();
	return search ? `${CATALOG_PATH}?${search}` : CATALOG_PATH;
}

export function queryCatalog(
	items: ShowcaseProduct[],
	query: CatalogQuery,
	pageSize = CATALOG_PAGE_SIZE
): { items: ShowcaseProduct[]; total: number; page: number; pageCount: number } {
	// Cada palavra da busca precisa aparecer, em qualquer ordem (igual à busca da home).
	const terms = normalizeText(query.q).split(/\s+/).filter(Boolean);
	const result = items.filter(
		(product) =>
			(query.category === '' || isInCategory(product.categoryPath, query.category)) &&
			terms.every((term) => product.searchText.includes(term))
	);

	if (query.sort === 'menor-preco') result.sort((a, b) => a.price - b.price);
	else if (query.sort === 'maior-preco') result.sort((a, b) => b.price - a.price);
	else result.sort(byNewest);

	const pageCount = Math.max(1, Math.ceil(result.length / pageSize));
	const page = Math.min(query.page, pageCount);
	return {
		items: result.slice((page - 1) * pageSize, page * pageSize),
		total: result.length,
		page,
		pageCount
	};
}
