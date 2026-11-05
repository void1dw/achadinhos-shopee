import { env } from 'cloudflare:workers';
import type { PageServerLoad } from './$types';
import { CATEGORY_BY_ID } from '../../lib/categories';
import { categoryPagesWithProducts } from '../../lib/category-pages';
import { parseCatalogQuery, queryCatalog } from '../../lib/catalog';
import { isAchadinho, toShowcase } from '../../lib/products';
import { loadFeed, publicCacheControl } from '../../lib/server/feed';

export const load: PageServerLoad = async ({ setHeaders, url }) => {
	const feed = await loadFeed(env.CANDIDATES_DB);
	const products = feed.products;
	const unavailable = feed.unavailable;

	setHeaders({ 'cache-control': publicCacheControl(unavailable) });

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
		unavailable
	};
};
