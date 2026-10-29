import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import {
	CATEGORY_PAGES,
	categoryPagesWithProducts,
	categoryProducts,
	categoryTree,
	findCategoryPage,
	isDescendantOf,
	legacyRedirectTarget
} from '../../../lib/category-pages';
import { SHEET_PRODUCTS_CSV_URL, SHOW_DEMO_DATA } from '../../../lib/config';
import { demoProducts } from '../../../lib/data/demo-data';
import { toShowcase } from '../../../lib/products';
import { loadProducts } from '../../../lib/server/sheets';
import type { Product } from '../../../lib/types';

export const load: PageServerLoad = async ({ fetch, params, setHeaders, url }) => {
	const legacy = legacyRedirectTarget(params.slug);
	if (legacy) {
		redirect(301, `/categoria/${legacy.primary}?sub=${legacy.sub}`);
	}

	const category = findCategoryPage(params.slug);
	if (!category) {
		setHeaders({ 'cache-control': 'no-store' });
		error(404, 'Categoria não encontrada');
	}

	let products: Product[];
	let stale = false;
	let productsUnavailable = false;
	if (SHOW_DEMO_DATA) {
		products = demoProducts;
	} else {
		const result = await loadProducts(fetch, SHEET_PRODUCTS_CSV_URL);
		if (result.failed && !result.stale) {
			products = [];
			productsUnavailable = true;
		} else {
			products = result.items;
			stale = result.stale ?? false;
		}
	}

	const showcaseProducts = toShowcase(products);
	const availableCategories = categoryPagesWithProducts(showcaseProducts);
	const items = categoryProducts(showcaseProducts, category);
	const subTree = categoryTree(items, category.slug);
	const requestedSub = url.searchParams.get('sub') ?? '';
	const initialSub = isDescendantOf(requestedSub, category.slug) ? requestedSub : '';
	const relatedCategories = category.related
		.map((slug) => {
			const availableCategory = availableCategories.find((candidate) => candidate.slug === slug);
			if (availableCategory || !productsUnavailable) return availableCategory;

			const categoryPage = CATEGORY_PAGES.find((candidate) => candidate.slug === slug);
			return categoryPage
				? { slug: categoryPage.slug, label: categoryPage.label, count: 0, children: [] }
				: undefined;
		})
		.filter((candidate) => candidate !== undefined);

	setHeaders({
		'cache-control': productsUnavailable || stale ? 'no-store' : 'public, max-age=0, s-maxage=300'
	});

	return {
		category,
		items,
		subTree,
		initialSub,
		empty: items.length === 0 && !productsUnavailable,
		relatedCategories,
		productsStale: stale,
		productsUnavailable
	};
};
