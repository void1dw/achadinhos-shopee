import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import {
	handleProductAffiliateClick,
	isAdminPath,
	isCountableProductClick,
	isShopeeLink,
	trackCategorySelection,
	trackProductListClick
} from '../src/lib/analytics.ts';
import type { ShowcaseProduct } from '../src/lib/types.ts';

const baseProduct: ShowcaseProduct = {
	id: 'prod-123',
	name: 'Fone de Ouvido Bluetooth',
	price: 59.9,
	category: 'Eletrônicos',
	image: 'https://img.example/fone.jpg',
	url: 'https://s.shopee.com.br/5q98WHYI13',
	categoryKey: 'eletronicos',
	categoryLabel: 'Eletrônicos',
	categoryPath: ['eletronicos'],
	searchText: 'fone de ouvido bluetooth eletronicos',
	discountPercent: 20
};

type CapturedCall = {
	command: string;
	eventName: string;
	parameters: Record<string, unknown>;
};

function setupMockWindow(pathname = '/'): CapturedCall[] {
	const calls: CapturedCall[] = [];
	Object.defineProperty(globalThis, 'window', {
		configurable: true,
		value: {
			location: { pathname, href: `https://achadinhoslia.com.br${pathname}` },
			gtag: (command: string, eventName: string, parameters: Record<string, unknown>) => {
				calls.push({ command, eventName, parameters });
			}
		}
	});
	return calls;
}

afterEach(() => {
	Reflect.deleteProperty(globalThis, 'window');
});

const click = (button = 0, type = 'click') => ({ type, button });
const names = (calls: CapturedCall[]) => calls.map((c) => c.eventName);

test('1. Clique esquerdo gera select_item e um único affiliate_click', () => {
	const calls = setupMockWindow('/');

	handleProductAffiliateClick(click(0), baseProduct, 'home_products', 'Home');

	assert.deepEqual(names(calls), ['select_item', 'affiliate_click']);
});

test('2. Ctrl/Cmd + clique (click com button 0) gera um único affiliate_click', () => {
	const calls = setupMockWindow('/');
	const event = { ...click(0), ctrlKey: true, metaKey: true };

	handleProductAffiliateClick(event, baseProduct, 'home_products', 'Home');

	assert.deepEqual(names(calls), ['select_item', 'affiliate_click']);
});

test('3. Botão do meio (auxclick, button 1) gera um único affiliate_click', () => {
	const calls = setupMockWindow('/');

	handleProductAffiliateClick(click(1, 'auxclick'), baseProduct, 'home_products', 'Home');

	assert.deepEqual(names(calls), ['select_item', 'affiliate_click']);
});

test('4. Botão direito e eventos inesperados não geram eventos', () => {
	const calls = setupMockWindow('/');

	handleProductAffiliateClick(click(2, 'auxclick'), baseProduct, 'home_products', 'Home');
	handleProductAffiliateClick(click(2, 'click'), baseProduct, 'home_products', 'Home');
	handleProductAffiliateClick(click(0, 'auxclick'), baseProduct, 'home_products', 'Home');
	handleProductAffiliateClick(click(1, 'click'), baseProduct, 'home_products', 'Home');
	handleProductAffiliateClick({ type: 'contextmenu', button: 2 }, baseProduct, 'l', 'L');

	assert.equal(calls.length, 0);
});

test('4b. Cliques legítimos repetidos no mesmo produto não são suprimidos', () => {
	const calls = setupMockWindow('/');

	handleProductAffiliateClick(click(0), baseProduct, 'home_products', 'Home');
	handleProductAffiliateClick(click(0), baseProduct, 'home_products', 'Home');
	handleProductAffiliateClick(click(1, 'auxclick'), baseProduct, 'recent_products', 'Recentes');

	assert.equal(calls.filter((c) => c.eventName === 'affiliate_click').length, 3);
	assert.equal(calls.filter((c) => c.eventName === 'select_item').length, 3);
});

test('4c. isCountableProductClick: Enter no teclado (click sem button) conta uma vez', () => {
	assert.equal(isCountableProductClick({ type: 'click' }), true);
	assert.equal(isCountableProductClick({ type: 'auxclick' }), false);
});

test('5. Links válidos da Shopee são reconhecidos', () => {
	assert.equal(isShopeeLink('https://s.shopee.com.br/5q98WHYI13'), true);
	assert.equal(isShopeeLink('https://shopee.com.br/produto-teste'), true);
	assert.equal(isShopeeLink('https://shope.ee/abc123xyz'), true);
	assert.equal(isShopeeLink('https://shp.ee/teste'), true);
	assert.equal(isShopeeLink('https://br.shp.ee/teste'), true);
});

test('6. Links inválidos ou externos não geram eventos de afiliados', () => {
	assert.equal(isShopeeLink('https://example.com/product'), false);
	assert.equal(isShopeeLink('https://mercadolivre.com.br/item'), false);
	assert.equal(isShopeeLink('invalid-url'), false);

	const calls = setupMockWindow('/');
	trackProductListClick({ ...baseProduct, url: 'https://example.com/externo' }, 'list_1', 'Lista');

	const affiliateCalls = calls.filter((c) => c.eventName === 'affiliate_click');
	assert.equal(affiliateCalls.length, 0);
	const selectCalls = calls.filter((c) => c.eventName === 'select_item');
	assert.equal(selectCalls.length, 1);
});

test('7. Parâmetros enviados contêm beacon e campos corretos para o GA4', () => {
	const calls = setupMockWindow('/');
	trackProductListClick(baseProduct, 'featured_products', 'Destaques');

	const affiliateCall = calls.find((c) => c.eventName === 'affiliate_click');
	assert.ok(affiliateCall);
	assert.equal(affiliateCall.parameters.transport_type, 'beacon');
	assert.equal(affiliateCall.parameters.currency, 'BRL');
	assert.equal(affiliateCall.parameters.link_domain, 's.shopee.com.br');
	assert.equal(affiliateCall.parameters.affiliate_product_id, 'prod-123');
	assert.equal(affiliateCall.parameters.affiliate_product_name, 'Fone de Ouvido Bluetooth');
	assert.equal(affiliateCall.parameters.affiliate_product_category, 'Eletrônicos');

	const items = affiliateCall.parameters.items as Array<Record<string, unknown>>;
	assert.equal(items.length, 1);
	assert.equal(items[0].item_id, 'prod-123');
	assert.equal(items[0].price, 59.9);

	const selectCall = calls.find((c) => c.eventName === 'select_item');
	assert.ok(selectCall);
	assert.equal(selectCall.parameters.transport_type, 'beacon');
});

test('8. O acesso ao /admin e subrotas não gera eventos', () => {
	for (const path of ['/admin', '/admin/', '/admin/login', '/admin/realtime']) {
		const calls = setupMockWindow(path);
		trackProductListClick(baseProduct, 'admin_list', 'Lista Admin');
		handleProductAffiliateClick(click(0), baseProduct, 'admin_list', 'Lista Admin');
		trackCategorySelection('Eletrônicos');
		assert.equal(calls.length, 0, `Nenhum evento em ${path}`);
	}
	assert.equal(isAdminPath('/admin'), true);
	assert.equal(isAdminPath('/admin/login'), true);
	assert.equal(isAdminPath('/administrador'), false);
	assert.equal(isAdminPath('/categoria/admin'), false);
});

test('9. Ao sair do /admin pela navegação SPA os eventos voltam (location é lida a cada envio)', () => {
	const calls = setupMockWindow('/admin');
	trackProductListClick(baseProduct, 'admin_list', 'Lista Admin');
	assert.equal(calls.length, 0);

	(
		globalThis as unknown as { window: { location: { pathname: string } } }
	).window.location.pathname = '/';
	trackProductListClick(baseProduct, 'home_products', 'Home');
	assert.deepEqual(names(calls), ['select_item', 'affiliate_click']);

	(
		globalThis as unknown as { window: { location: { pathname: string } } }
	).window.location.pathname = '/admin/login';
	trackCategorySelection('Casa');
	assert.equal(calls.length, 2);
});

test('10. Falhas de disponibilidade ou erros no gtag não quebram a navegação', () => {
	// Sem window.gtag
	Object.defineProperty(globalThis, 'window', {
		configurable: true,
		value: { location: { pathname: '/' } }
	});
	assert.doesNotThrow(() => {
		trackProductListClick(baseProduct, 'list', 'Lista');
	});

	// Com window.gtag que lança erro inesperado
	Object.defineProperty(globalThis, 'window', {
		configurable: true,
		value: {
			location: { pathname: '/' },
			gtag: () => {
				throw new Error('Falha simulada no SDK');
			}
		}
	});
	assert.doesNotThrow(() => {
		trackProductListClick(baseProduct, 'list', 'Lista');
	});
});

test('11. Os eventos select_item e select_category continuam funcionando', () => {
	const calls = setupMockWindow('/');
	trackCategorySelection('Casa e Decoração');

	const categoryCall = calls.find((c) => c.eventName === 'select_category');
	assert.ok(categoryCall);
	assert.equal(categoryCall.parameters.category_name, 'Casa e Decoração');
});
