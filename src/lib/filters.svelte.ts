import { normalizeText, parsePrice } from './format';
import { byNewest } from './products';
import type { ShowcaseProduct } from './types';

export type Sort = 'recentes' | 'menor-preco' | 'maior-preco' | 'maior-desconto';

/** Estado dos filtros da vitrine + a regra que aplica tudo sobre a lista de produtos. */
export class Filters {
	query = $state('');
	sort = $state<Sort>('recentes');
	discountOnly = $state(false);
	minPrice = $state('');
	maxPrice = $state('');
	panelOpen = $state(false);
	favoritesOnly = $state(false);

	/** Quantos filtros do painel estão ligados (aparece no selo do botão). */
	get activeCount(): number {
		return [
			this.discountOnly,
			this.favoritesOnly,
			this.minPrice.trim() !== '',
			this.maxPrice.trim() !== ''
		].filter(Boolean).length;
	}

	get dirty(): boolean {
		return this.query.trim() !== '' || this.activeCount > 0;
	}

	apply(items: ShowcaseProduct[], favoriteIds: string[] = []): ShowcaseProduct[] {
		// Cada palavra da busca precisa aparecer, em qualquer ordem ("fone bluetooth" = "bluetooth fone").
		const terms = normalizeText(this.query).split(/\s+/).filter(Boolean);
		const min = parsePrice(this.minPrice);
		const max = parsePrice(this.maxPrice);

		const result = items.filter(
			(p) =>
				terms.every((term) => p.searchText.includes(term)) &&
				(!this.favoritesOnly || favoriteIds.includes(p.id)) &&
				(!this.discountOnly || p.discountPercent !== null) &&
				(min === undefined || p.price >= min) &&
				(max === undefined || p.price <= max)
		);

		switch (this.sort) {
			case 'menor-preco':
				return result.sort((a, b) => a.price - b.price);
			case 'maior-preco':
				return result.sort((a, b) => b.price - a.price);
			case 'maior-desconto':
				return result.sort((a, b) => (b.discountPercent ?? -1) - (a.discountPercent ?? -1));
			default:
				return result.sort(byNewest);
		}
	}

	clear(): void {
		this.query = '';
		this.favoritesOnly = false;
		this.discountOnly = false;
		this.minPrice = '';
		this.maxPrice = '';
		this.sort = 'recentes';
	}
}
