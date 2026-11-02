import { sitemapCategorySlugs } from '../category-pages';
import { PUBLIC_SITE_URL, SHEET_PRODUCTS_CSV_URL, SHOW_DEMO_DATA } from '../config';
import { splitProducts } from '../catalog';
import { demoProducts } from '../data/demo-data';
import { toShowcase } from '../products';
import { loadProducts } from './sheets';

/** URLs públicas indexáveis (home, catálogo e categorias elegíveis); null se a planilha falhou. */
export async function loadPublicPageUrls(fetcher: typeof fetch): Promise<string[] | null> {
	let products = demoProducts;
	if (!SHOW_DEMO_DATA) {
		const result = await loadProducts(fetcher, SHEET_PRODUCTS_CSV_URL);
		if (result.failed && !result.stale) return null;
		products = result.items;
	}

	const categoryUrls = sitemapCategorySlugs(toShowcase(splitProducts(products).achadinhos)).map(
		(slug) => new URL(`/categoria/${slug}`, PUBLIC_SITE_URL).toString()
	);
	return [PUBLIC_SITE_URL, new URL('/catalogo', PUBLIC_SITE_URL).toString(), ...categoryUrls];
}
