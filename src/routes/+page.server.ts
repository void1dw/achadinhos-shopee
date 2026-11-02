import type { PageServerLoad } from './$types';
import { splitProducts } from '../lib/catalog';
import { SHEET_PRODUCTS_CSV_URL, SHOW_DEMO_DATA } from '../lib/config';
import { demoProducts } from '../lib/data/demo-data';
import { loadProducts } from '../lib/server/sheets';

export const load: PageServerLoad = async ({ fetch, setHeaders }) => {
	if (SHOW_DEMO_DATA) {
		const { achadinhos, counts } = splitProducts(demoProducts);
		return { products: achadinhos, counts, sheetsUnavailable: false, productsStale: false };
	}

	const result = await loadProducts(fetch, SHEET_PRODUCTS_CSV_URL);

	if (result.failed || result.stale) {
		setHeaders({ 'cache-control': 'no-store' });
	} else {
		setHeaders({ 'cache-control': 'public, max-age=0, s-maxage=300' });
	}

	// Só os Achadinhos vão para a home; os demais produtos ficam no servidor até alguém abrir /catalogo.
	const { achadinhos, counts } = splitProducts(result.items);
	return {
		products: achadinhos,
		counts,
		sheetsUnavailable: result.failed,
		productsStale: result.stale ?? false
	};
};
