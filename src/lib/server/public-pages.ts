import { sitemapCategorySlugs } from '../category-pages';
import { PUBLIC_SITE_URL } from '../config';
import { achadinhoShowcase, loadFeed } from './feed';

/** URLs públicas indexáveis (home, catálogo e categorias elegíveis); null se o D1 está indisponível. */
export async function loadPublicPageUrls(
	db: D1Database | null | undefined,
	options: { demo?: boolean } = {}
): Promise<string[] | null> {
	const feed = await loadFeed(db, options);
	if (feed.unavailable) return null;

	const categoryUrls = sitemapCategorySlugs(achadinhoShowcase(feed.products)).map((slug) =>
		new URL(`/categoria/${slug}`, PUBLIC_SITE_URL).toString()
	);
	return [PUBLIC_SITE_URL, new URL('/catalogo', PUBLIC_SITE_URL).toString(), ...categoryUrls];
}
