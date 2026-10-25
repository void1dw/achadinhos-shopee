const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

export const money = (value: number): string => brl.format(value);

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
