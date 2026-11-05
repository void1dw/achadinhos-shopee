import type { ShopeeProductOfferV2 } from './types';

/** Filtros opcionais da descoberta. Comissão é fração decimal (0.1 = 10%); desconto é percentual. */
export type DiscoveryFilters = {
	minCommissionRate?: number;
	minSales?: number;
	minRating?: number;
	minPrice?: number;
	maxPrice?: number;
	/** Desconto anunciado pela Shopee; não prova redução real de preço. */
	minDiscountPercent?: number;
};

export class DiscoveryFilterError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'DiscoveryFilterError';
	}
}

export const DEFAULT_DISCOUNT_FILTER_PERCENT = 30;

function parseOptional(
	raw: string | null | undefined,
	label: string,
	min: number,
	max: number
): number | undefined {
	const text = (raw ?? '').trim().replace(',', '.');
	if (text === '') return undefined;
	if (!/^\d+(?:\.\d+)?$/.test(text)) {
		throw new DiscoveryFilterError(`${label} deve ser um número válido.`);
	}
	const value = Number(text);
	if (!Number.isFinite(value) || value < min || value > max) {
		throw new DiscoveryFilterError(`${label} deve estar entre ${min} e ${max}.`);
	}
	return value;
}

export type DiscoveryFilterInput = {
	minCommissionPercent?: string | null;
	minSales?: string | null;
	minRating?: string | null;
	minPrice?: string | null;
	maxPrice?: string | null;
	minDiscountPercent?: string | null;
};

/** Converte os campos do formulário (comissão em %, como o administrador digita). */
export function parseDiscoveryFilters(input: DiscoveryFilterInput): DiscoveryFilters {
	const commissionPercent = parseOptional(input.minCommissionPercent, 'A comissão mínima', 0, 100);
	const filters: DiscoveryFilters = {
		minCommissionRate: commissionPercent === undefined ? undefined : commissionPercent / 100,
		minSales: parseOptional(input.minSales, 'O mínimo de vendas', 0, 1_000_000_000),
		minRating: parseOptional(input.minRating, 'A avaliação mínima', 0, 5),
		minPrice: parseOptional(input.minPrice, 'O preço mínimo', 0, 1_000_000),
		maxPrice: parseOptional(input.maxPrice, 'O preço máximo', 0, 1_000_000),
		minDiscountPercent: parseOptional(input.minDiscountPercent, 'O desconto mínimo', 0, 100)
	};
	if (
		filters.minPrice !== undefined &&
		filters.maxPrice !== undefined &&
		filters.minPrice > filters.maxPrice
	) {
		throw new DiscoveryFilterError('O preço mínimo não pode ser maior que o máximo.');
	}
	return Object.fromEntries(
		Object.entries(filters).filter(([, value]) => value !== undefined)
	) as DiscoveryFilters;
}

export function hasDiscoveryFilters(filters: DiscoveryFilters | undefined): boolean {
	return filters !== undefined && Object.values(filters).some((value) => value !== undefined);
}

function numeric(value: string | number | null | undefined): number | null {
	if (value === null || value === undefined) return null;
	if (typeof value === 'string' && !/^\s*\d+(?:\.\d+)?\s*$/.test(value)) return null;
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : null;
}

/** Dados ausentes ou inválidos reprovam o critério pedido; nunca são tratados como zero. */
export function matchesDiscoveryFilters(
	product: Pick<
		ShopeeProductOfferV2,
		'commissionRate' | 'sales' | 'ratingStar' | 'price' | 'priceMin' | 'priceDiscountRate'
	>,
	filters: DiscoveryFilters | undefined
): boolean {
	if (!filters) return true;
	const atLeast = (value: number | null, minimum: number | undefined) =>
		minimum === undefined || (value !== null && value >= minimum);
	const price = numeric(product.priceMin) ?? numeric(product.price);
	return (
		atLeast(numeric(product.commissionRate), filters.minCommissionRate) &&
		atLeast(numeric(product.sales), filters.minSales) &&
		atLeast(numeric(product.ratingStar), filters.minRating) &&
		atLeast(numeric(product.priceDiscountRate), filters.minDiscountPercent) &&
		atLeast(price, filters.minPrice) &&
		(filters.maxPrice === undefined || (price !== null && price <= filters.maxPrice))
	);
}

const real = (column: string) => `CAST(NULLIF(trim(${column}), '') AS REAL)`;

/** Mesma regra de `matchesDiscoveryFilters`, para a listagem em SQL (colunas TEXT). */
export function discoveryFilterSql(filters: DiscoveryFilters | undefined): {
	clauses: string[];
	values: number[];
} {
	const clauses: string[] = [];
	const values: number[] = [];
	if (!filters) return { clauses, values };
	const price = `COALESCE(${real('price_min')}, ${real('price')})`;
	const add = (expression: string, operator: '>=' | '<=', value: number | undefined) => {
		if (value === undefined) return;
		clauses.push(`${expression} ${operator} ?`);
		values.push(value);
	};
	add(real('commission_rate'), '>=', filters.minCommissionRate);
	add(real('sales'), '>=', filters.minSales);
	add(real('rating_star'), '>=', filters.minRating);
	add(real('price_discount_rate'), '>=', filters.minDiscountPercent);
	add(price, '>=', filters.minPrice);
	add(price, '<=', filters.maxPrice);
	return { clauses, values };
}
