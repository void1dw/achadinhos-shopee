export type Product = {
	id: string;
	name: string;
	price: number;
	previousPrice?: number;
	category: string;
	image: string;
	url: string;
	publishedAt?: string;
};

/** Produto pronto para a vitrine: categoria padronizada e campos pré-calculados. */
export type ShowcaseProduct = Product & {
	categoryKey: string;
	categoryLabel: string;
	categoryEmoji: string;
	/** Nome + categoria sem acento e em minúsculas, usado na busca. */
	searchText: string;
	/** Desconto em %, ou null quando não há preço anterior maior que o atual. */
	discountPercent: number | null;
};
