import type { PageServerLoad } from './$types';
import { CATEGORY_BY_ID } from '../../lib/categories';
import { categoryPagesWithProducts } from '../../lib/category-pages';
import { parseCatalogQuery, queryCatalog } from '../../lib/catalog';
import { SHEET_PRODUCTS_CSV_URL, SHOW_DEMO_DATA } from '../../lib/config';
import { demoProducts } from '../../lib/data/demo-data';
import { isAchadinho, toShowcase } from '../../lib/products';
import { loadProducts } from '../../lib/server/sheets';
import type { Product } from '../../lib/types';

export const load: PageServerLoad = async ({ fetch, setHeaders, url }) => {
	let products: Product[];
	let stale = false;
	let unavailable = false;
	if (SHOW_DEMO_DATA) {
		products = demoProducts;
	} else {
		const result = await loadProducts(fetch, SHEET_PRODUCTS_CSV_URL);
		if (result.failed && !result.stale) {
			products = [];
			unavailable = true;
		} else {
			products = result.items;
			stale = result.stale ?? false;
		}
	}

	setHeaders({
		'cache-control': unavailable || stale ? 'no-store' : 'public, max-age=0, s-maxage=300'
	});

	const query = parseCatalogQuery(url.searchParams);
	if (query.category && !CATEGORY_BY_ID.has(query.category)) query.category = '';

	// Todos os produtos ficam no servidor; o navegador recebe só a página pedida.
	const showcase = toShowcase(products);
	const result = queryCatalog(showcase, query);

	return {
		query: { ...query, page: result.page },
		items: result.items,
		total: result.total,
		pageCount: result.pageCount,
		counts: { catalog: showcase.length, achadinhos: showcase.filter(isAchadinho).length },
		categories: categoryPagesWithProducts(showcase),
		unavailable,
		stale
	};
};
