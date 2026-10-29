import { resolveCategory } from './categories';
import { normalizeText } from './format';
import type { Product, ShowcaseProduct } from './types';

/**
 * Desconto em %, só entre valores comparáveis: preço atual e original ambos únicos ou ambos
 * intervalos (compara mínimo com mínimo). Caso contrário, ou sem preço original, não há desconto.
 */
export function discountPercent(product: Product): number | null {
	const { price, priceMax, previousPrice, previousPriceMax } = product;
	if (previousPrice === undefined || !(previousPrice > price)) return null;
	if ((priceMax === undefined) !== (previousPriceMax === undefined)) return null;
	const percent = Math.round((1 - price / previousPrice) * 100);
	return percent > 0 ? percent : null;
}

/**
 * Classifica cada produto na taxonomia e pré-calcula desconto e texto de busca (feito uma vez,
 * não a cada filtro). Produtos sem categoria aprovada não entram na vitrine.
 */
export function toShowcase(products: Product[]): ShowcaseProduct[] {
	return products.flatMap((product) => {
		const resolution = resolveCategory(product.category);
		if (resolution.status !== 'ok') return [];
		const { category, path } = resolution;
		const names = path.map((node) => node.name).join(' ');

		return {
			...product,
			categoryKey: category.id,
			categoryLabel: category.name,
			categoryPath: path.map((node) => node.id),
			searchText: normalizeText(`${product.name} ${names}`),
			discountPercent: discountPercent(product)
		};
	});
}

/** Do mais novo para o mais antigo (datas em formato ISO ordenam como texto). */
export function byNewest(a: Product, b: Product): number {
	const first = a.publishedAt ?? '';
	const second = b.publishedAt ?? '';
	return first < second ? 1 : first > second ? -1 : 0;
}

/** Os melhores achados: mais novos primeiro, desempate pelo maior desconto. */
export function pickHighlights(items: ShowcaseProduct[], count = 30): ShowcaseProduct[] {
	return [...items]
		.sort((a, b) => byNewest(a, b) || (b.discountPercent ?? 0) - (a.discountPercent ?? 0))
		.slice(0, count);
}
