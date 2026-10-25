import type { PageServerLoad } from './$types';
import { SHEET_PRODUCTS_CSV_URL, SHOW_DEMO_DATA } from '../lib/config';
import { demoProducts } from '../lib/data/demo-data';
import { loadProducts } from '../lib/server/sheets';

export const load: PageServerLoad = async ({ fetch, setHeaders }) => {
	if (SHOW_DEMO_DATA) {
		return { products: demoProducts, sheetsUnavailable: false, productsStale: false };
	}

	const result = await loadProducts(fetch, SHEET_PRODUCTS_CSV_URL);

	if (result.failed || result.stale) {
		setHeaders({ 'cache-control': 'no-store' });
	} else {
		setHeaders({ 'cache-control': 'public, max-age=0, s-maxage=300' });
	}

	return {
		products: result.items,
		sheetsUnavailable: result.failed,
		productsStale: result.stale ?? false
	};
};
