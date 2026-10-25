import type { Product } from '../types';

// Exemplos fictícios opcionais para visualização local. Não são ofertas reais.
export const demoProducts: Product[] = [
	{
		id: 'demo-fone',
		name: '[DEMO] Fone Bluetooth',
		price: 89.9,
		previousPrice: 129.9,
		category: 'Eletrônicos',
		image: '/demo-products/fone.svg',
		url: 'https://shopee.com.br/',
		publishedAt: '2026-10-20'
	},
	{
		id: 'demo-luminaria',
		name: '[DEMO] Luminária de mesa',
		price: 54.9,
		previousPrice: 79.9,
		category: 'Casa',
		image: '/demo-products/luminaria.svg',
		url: 'https://shopee.com.br/',
		publishedAt: '2026-10-19'
	},
	{
		id: 'demo-organizador',
		name: '[DEMO] Organizador',
		price: 29.9,
		category: 'Casa',
		image: '/demo-products/organizador.svg',
		url: 'https://shopee.com.br/',
		publishedAt: '2026-10-18'
	}
];
