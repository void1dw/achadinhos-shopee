import { splitProducts } from '../catalog';
import { SHOW_DEMO_DATA } from '../config';
import { demoProducts } from '../data/demo-data';
import { toShowcase } from '../products';
import type { Product, ShowcaseProduct } from '../types';
import { listProducts } from './product-store';

export type AchadinhoFeed = {
	products: Product[];
	/** O D1 está ausente ou a consulta falhou: não há produtos confiáveis. */
	unavailable: boolean;
};

/**
 * Catálogo público: o D1 (tabela products) é a única fonte. Sem fallback para a planilha e
 * sem cache em memória, para que alterações administrativas apareçam já na próxima leitura
 * (o cache de 5 minutos fica no HTTP/CDN).
 */
export async function loadFeed(
	db: D1Database | null | undefined,
	options: { demo?: boolean } = {}
): Promise<AchadinhoFeed> {
	if (options.demo ?? SHOW_DEMO_DATA) return { products: demoProducts, unavailable: false };
	if (!db) return { products: [], unavailable: true };
	try {
		return { products: await listProducts(db), unavailable: false };
	} catch {
		console.error('Public product query failed.');
		return { products: [], unavailable: true };
	}
}

/** Cabeçalho de cache das páginas públicas: sem cache quando o catálogo está indisponível. */
export function publicCacheControl(unavailable: boolean): string {
	return unavailable ? 'no-store' : 'public, max-age=0, s-maxage=300';
}

/** Achadinhos já classificados para a vitrine. */
export function achadinhoShowcase(products: Product[]): ShowcaseProduct[] {
	return toShowcase(splitProducts(products).achadinhos);
}
