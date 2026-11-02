import { splitProducts } from '../catalog';
import { SHEET_PRODUCTS_CSV_URL, SHOW_DEMO_DATA } from '../config';
import { demoProducts } from '../data/demo-data';
import { toShowcase } from '../products';
import type { Product, ShowcaseProduct } from '../types';
import { loadProducts } from './sheets';

export type AchadinhoFeed = {
	products: Product[];
	/** Os dados vieram do cache porque a planilha falhou na última atualização. */
	stale: boolean;
	/** A planilha falhou e não há cache: não há produtos confiáveis. */
	unavailable: boolean;
};

/** Produtos brutos da planilha (ou demo), sem dividir entre Achadinhos e Catálogo. */
export async function loadFeed(fetcher: typeof fetch): Promise<AchadinhoFeed> {
	if (SHOW_DEMO_DATA) return { products: demoProducts, stale: false, unavailable: false };
	const result = await loadProducts(fetcher, SHEET_PRODUCTS_CSV_URL);
	if (result.failed && !result.stale) return { products: [], stale: false, unavailable: true };
	return { products: result.items, stale: result.stale ?? false, unavailable: false };
}

/** Achadinhos já classificados para a vitrine. */
export function achadinhoShowcase(products: Product[]): ShowcaseProduct[] {
	return toShowcase(splitProducts(products).achadinhos);
}
