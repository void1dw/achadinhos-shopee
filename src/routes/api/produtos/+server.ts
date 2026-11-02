import { error, json } from '@sveltejs/kit';
import { categoryProducts, findCategoryPage } from '../../../lib/category-pages';
import { byNewest } from '../../../lib/products';
import { achadinhoShowcase, loadFeed } from '../../../lib/server/feed';
import type { RequestHandler } from './$types';

/** Lista completa de Achadinhos (ou de uma categoria) carregada depois do HTML inicial. */
export const GET: RequestHandler = async ({ fetch, url }) => {
	const slug = url.searchParams.get('categoria');
	const category = slug ? findCategoryPage(slug) : undefined;
	if (slug && !category) error(404, 'Categoria não encontrada');

	const feed = await loadFeed(fetch);
	if (feed.unavailable) {
		return json([], { status: 503, headers: { 'cache-control': 'no-store', 'retry-after': '60' } });
	}

	const showcase = achadinhoShowcase(feed.products);
	const items = (category ? categoryProducts(showcase, category) : showcase).sort(byNewest);
	return json(items, {
		headers: {
			'cache-control': feed.stale ? 'no-store' : 'public, max-age=60, s-maxage=300',
			'x-robots-tag': 'noindex'
		}
	});
};
