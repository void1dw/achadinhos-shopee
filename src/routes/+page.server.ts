import type { PageServerLoad } from './$types';
import { categoryPagesWithProducts } from '../lib/category-pages';
import { SHOW_DEMO_DATA } from '../lib/config';
import { INITIAL_PRODUCT_COUNT } from '../lib/product-feed';
import { byNewest, pickHighlights } from '../lib/products';
import { splitProducts } from '../lib/catalog';
import { achadinhoShowcase, loadFeed } from '../lib/server/feed';

export const load: PageServerLoad = async ({ fetch, setHeaders }) => {
	const feed = await loadFeed(fetch);

	if (!SHOW_DEMO_DATA) {
		setHeaders({
			'cache-control':
				feed.unavailable || feed.stale ? 'no-store' : 'public, max-age=0, s-maxage=300'
		});
	}

	const showcase = achadinhoShowcase(feed.products);
	const ordered = [...showcase].sort(byNewest);
	// Só os primeiros produtos vão no HTML; a lista completa é carregada depois (ver product-feed.ts).
	return {
		products: ordered.slice(0, INITIAL_PRODUCT_COUNT),
		total: showcase.length,
		complete: showcase.length <= INITIAL_PRODUCT_COUNT,
		highlights: pickHighlights(showcase),
		categories: categoryPagesWithProducts(showcase),
		counts: splitProducts(feed.products).counts,
		sheetsUnavailable: feed.unavailable,
		productsStale: feed.stale
	};
};
