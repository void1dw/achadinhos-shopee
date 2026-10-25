import { resolveCategory } from './categories';
import { normalizeText } from './format';
import type { Product, ShowcaseProduct } from './types';

export type CategorySummary = {
	key: string;
	label: string;
	emoji: string;
	count: number;
};

/** Padroniza a categoria e pré-calcula desconto e texto de busca (feito uma vez, não a cada filtro). */
export function toShowcase(products: Product[]): ShowcaseProduct[] {
	return products.map((product) => {
		const category = resolveCategory(product.category);
		const { previousPrice } = product;
		const percent =
			previousPrice !== undefined && previousPrice > product.price
				? Math.round((1 - product.price / previousPrice) * 100)
				: 0;

		return {
			...product,
			categoryKey: category.key,
			categoryLabel: category.label,
			categoryEmoji: category.emoji,
			searchText: normalizeText(`${product.name} ${category.label}`),
			discountPercent: percent > 0 ? percent : null
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

/** Categorias presentes na lista, da mais cheia para a mais vazia. */
export function summarizeCategories(items: ShowcaseProduct[]): CategorySummary[] {
	const map = new Map<string, CategorySummary>();
	for (const item of items) {
		const entry = map.get(item.categoryKey) ?? {
			key: item.categoryKey,
			label: item.categoryLabel,
			emoji: item.categoryEmoji,
			count: 0
		};
		entry.count += 1;
		map.set(item.categoryKey, entry);
	}
	return [...map.values()].sort((a, b) => b.count - a.count);
}
