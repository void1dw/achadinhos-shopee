import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { categoryPagesWithProducts, categoryProducts, findCategoryPage } from '../../../lib/category-pages';
import { SHEET_PRODUCTS_CSV_URL, SHOW_DEMO_DATA } from '../../../lib/config';
import { demoProducts } from '../../../lib/data/demo-data';
import { toShowcase } from '../../../lib/products';
import { loadProducts } from '../../../lib/server/sheets';

export const load: PageServerLoad = async ({ fetch, params, setHeaders }) => {
	const category = findCategoryPage(params.slug);
	if (!category) {
		setHeaders({ 'cache-control': 'no-store' });
		error(404, 'Categoria não encontrada');
	}

	let products;
	let stale = false;
	if (SHOW_DEMO_DATA) {
		products = demoProducts;
	} else {
		const result = await loadProducts(fetch, SHEET_PRODUCTS_CSV_URL);
		if (result.failed && !result.stale) {
			setHeaders({ 'cache-control': 'no-store' });
			error(503, 'Não foi possível carregar as ofertas agora.');
		}
		products = result.items;
		stale = result.stale ?? false;
	}

	const showcaseProducts = toShowcase(products);
	const availableCategories = categoryPagesWithProducts(showcaseProducts);
	if (!availableCategories.some((availableCategory) => availableCategory.slug === category.slug)) {
		setHeaders({ 'cache-control': 'no-store' });
		error(404, 'Categoria não encontrada');
	}

	const items = categoryProducts(showcaseProducts, category);
	const relatedCategories = category.related
		.map((slug) => availableCategories.find((candidate) => candidate.slug === slug))
		.filter((candidate) => candidate !== undefined);

	setHeaders({
		'cache-control': stale ? 'no-store' : 'public, max-age=0, s-maxage=300'
	});

	return {
		category,
		items,
		relatedCategories,
		availableCategories,
		productsStale: stale
	};
};
