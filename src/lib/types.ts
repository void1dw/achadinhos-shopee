export type Product = {
	id: string;
	name: string;
	/** Preço atual; em intervalos ("R$ 27,97 - R$ 56,90") é o menor valor. */
	price: number;
	/** Maior valor do intervalo de preço atual, quando a planilha traz uma faixa. */
	priceMax?: number;
	/** Preço original; em intervalos é o menor valor. Opcional. */
	previousPrice?: number;
	/** Maior valor do intervalo de preço original, quando houver. */
	previousPriceMax?: number;
	/** Categoria como veio da planilha (a classificação fica em ShowcaseProduct). */
	category: string;
	image: string;
	url: string;
	publishedAt?: string;
};

/** Produto pronto para a vitrine: categoria padronizada e campos pré-calculados. */
export type ShowcaseProduct = Product & {
	/** Id da categoria mais específica em que o produto foi classificado. */
	categoryKey: string;
	/** Nome da categoria mais específica (exibido no card e enviado ao GA4). */
	categoryLabel: string;
	/** Ids da categoria primária até a mais específica, ex.: ['moda', 'moda-feminina']. */
	categoryPath: string[];
	/** Nome + categoria sem acento e em minúsculas, usado na busca. */
	searchText: string;
	/** Desconto em %, ou null quando não há preço anterior maior que o atual. */
	discountPercent: number | null;
};
