const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

export const money = (value: number): string => brl.format(value);

const commissionPercent = new Intl.NumberFormat('pt-BR', {
	style: 'percent',
	maximumFractionDigits: 2
});

/** Taxa de comissão da Shopee (fração decimal: "0.03" = 3%) para exibição; null se ausente ou inválida. */
export function formatCommissionRate(value: string | number | null | undefined): string | null {
	if (value === null || value === undefined) return null;
	const text = typeof value === 'string' ? value.trim() : String(value);
	if (!text) return null;
	const rate = Number(text);
	if (!Number.isFinite(rate) || rate < 0) return null;
	return commissionPercent.format(rate);
}

/** Minúsculas, sem acento e sem espaços nas pontas ("Eletrônicos " -> "eletronicos"). */
export function normalizeText(value: string): string {
	return value
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.toLocaleLowerCase('pt-BR')
		.trim();
}

/**
 * Lê um preço escrito de qualquer jeito ("R$ 1.299,90", "1299.9", "29,90", "1.299").
 * Serve tanto para a planilha quanto para os campos de preço mín./máx. do site.
 */
export function parsePrice(raw: string): number | undefined {
	let value = raw.replace(/[^\d,.]/g, '');
	if (!value) return undefined;

	if (value.includes(',') && value.includes('.')) {
		// O último separador é o decimal: "1.299,90" (BR) ou "1,299.90" (US).
		value =
			value.lastIndexOf(',') > value.lastIndexOf('.')
				? value.replace(/\./g, '').replace(',', '.')
				: value.replace(/,/g, '');
	} else if (value.includes(',')) {
		value = value.replace(',', '.');
	} else if (/^\d{1,3}(\.\d{3})+$/.test(value)) {
		// "1.299" ou "2.500.000": só ponto agrupando milhares, como no Brasil.
		value = value.replace(/\./g, '');
	}

	const number = Number(value);
	return Number.isFinite(number) ? number : undefined;
}

/** Preço para exibição; em faixas de preço (priceMax) indica que o valor é o menor da faixa. */
export const priceLabel = (product: { price: number; priceMax?: number }): string =>
	product.priceMax !== undefined ? `A partir de ${money(product.price)}` : money(product.price);
