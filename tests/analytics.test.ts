import assert from 'node:assert/strict';
import { test } from 'node:test';
import { trackProductListClick } from '../src/lib/analytics.ts';
import type { ShowcaseProduct } from '../src/lib/types.ts';

const product: ShowcaseProduct = {
	id: '123',
	name: 'Produto de teste',
	price: 29.9,
	category: 'Eletrônicos',
	image: 'https://img.example/product.jpg',
	url: 'https://shope.ee/abc123',
	categoryKey: 'eletronicos',
	categoryLabel: 'Eletrônicos',
	categoryPath: ['eletronicos'],
	searchText: 'produto de teste eletronicos',
	discountPercent: null
};

function track(url: string): string[] {
	const events: string[] = [];
	Object.defineProperty(globalThis, 'window', {
		configurable: true,
		value: {
			gtag: (_command: string, eventName: string) => events.push(eventName)
		}
	});
	trackProductListClick({ ...product, url }, 'test_list', 'Lista de teste');
	return events;
}

test('links curtos oficiais da Shopee registram clique afiliado', () => {
	assert.deepEqual(track('https://shope.ee/abc123'), ['select_item', 'affiliate_click']);
});

test('links fora da Shopee não registram clique afiliado', () => {
	assert.deepEqual(track('https://example.com/product'), ['select_item']);
});
