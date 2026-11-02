import type { ShowcaseProduct } from './types';

/** Quantos produtos vão no HTML inicial; o restante chega pelo endpoint depois da hidratação. */
export const INITIAL_PRODUCT_COUNT = 40;

/** Busca a lista completa de Achadinhos (opcionalmente de uma categoria primária). */
export async function fetchProductFeed(
	fetcher: typeof fetch,
	category?: string
): Promise<ShowcaseProduct[]> {
	const query = category ? `?categoria=${encodeURIComponent(category)}` : '';
	const response = await fetcher(`/api/produtos${query}`);
	if (!response.ok) throw new Error(`Falha ao carregar produtos (${response.status}).`);
	const body: unknown = await response.json();
	if (!Array.isArray(body)) throw new TypeError('Resposta inválida do feed de produtos.');
	return body as ShowcaseProduct[];
}
