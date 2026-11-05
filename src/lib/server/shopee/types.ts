export type ShopeeProductOfferV2 = {
	itemId?: string | number | null;
	shopId?: string | number | null;
	productName?: string | null;
	productLink?: string | null;
	offerLink?: string | null;
	imageUrl?: string | null;
	price?: string | number | null;
	priceMin?: string | number | null;
	priceMax?: string | number | null;
	priceDiscountRate?: string | number | null;
	sales?: string | number | null;
	ratingStar?: number | null;
	commissionRate?: string | null;
	productCatIds?: number[] | null;
};

export type ShopeeGraphQLError = {
	message?: string;
	extensions?: {
		code?: string | number;
	};
};

export type ShopeeGraphQLResponse<T> = {
	data?: T | null;
	errors?: ShopeeGraphQLError[];
};

export type ShopeeProductOfferResponse = {
	productOfferV2?: {
		nodes?: ShopeeProductOfferV2[] | null;
		pageInfo?: {
			page?: number | null;
			limit?: number | null;
			hasNextPage?: boolean | null;
			scrollId?: string | null;
		} | null;
	} | null;
};
