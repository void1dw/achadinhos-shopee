import type { ShowcaseProduct } from './types';

type AnalyticsParameters = Record<string, unknown>;

declare global {
	interface Window {
		gtag?: (command: 'event', eventName: string, parameters: AnalyticsParameters) => void;
	}
}

const CURRENCY = 'BRL';

/** Verifica se um caminho pertence à área administrativa. */
export function isAdminPath(pathname?: string): boolean {
	if (typeof window === 'undefined' && pathname === undefined) return false;
	const path = pathname ?? (typeof window !== 'undefined' ? (window.location?.pathname ?? '') : '');
	return path === '/admin' || path.startsWith('/admin/');
}

function sendEvent(eventName: string, parameters: AnalyticsParameters): void {
	if (typeof window === 'undefined') return;
	if (isAdminPath()) return;
	try {
		window.gtag?.('event', eventName, parameters);
	} catch (error) {
		console.warn('Falha silenciosa ao despachar evento para o GA4:', error);
	}
}

export function isShopeeLink(url: string): boolean {
	try {
		const hostname = new URL(url).hostname.toLowerCase();
		return (
			hostname === 'shopee.com.br' ||
			hostname.endsWith('.shopee.com.br') ||
			hostname === 'shope.ee' ||
			hostname === 'shp.ee' ||
			hostname.endsWith('.shp.ee')
		);
	} catch {
		return false;
	}
}

function sendAffiliateClick(product: ShowcaseProduct): void {
	if (!isShopeeLink(product.url)) return;

	const linkDomain = new URL(product.url).hostname.toLowerCase();
	sendEvent('affiliate_click', {
		currency: CURRENCY,
		link_domain: linkDomain,
		affiliate_product_id: product.id,
		affiliate_product_name: product.name,
		affiliate_product_category: product.categoryLabel,
		transport_type: 'beacon',
		items: [
			{
				item_id: product.id,
				item_name: product.name,
				item_category: product.categoryLabel,
				price: product.price
			}
		]
	});
}

export function trackProductListClick(
	product: ShowcaseProduct,
	itemListId: string,
	itemListName: string
): void {
	sendEvent('select_item', {
		item_list_id: itemListId,
		item_list_name: itemListName,
		currency: CURRENCY,
		transport_type: 'beacon',
		items: [
			{
				item_id: product.id,
				item_name: product.name,
				item_category: product.categoryLabel,
				price: product.price
			}
		]
	});

	sendAffiliateClick(product);
}

export function trackAffiliateClick(product: ShowcaseProduct): void {
	sendAffiliateClick(product);
}

export function trackCategorySelection(categoryName: string): void {
	sendEvent('select_category', { category_name: categoryName });
}

/**
 * Indica se o evento representa uma abertura legítima do link do produto.
 * `click` cobre botão esquerdo, Ctrl/Cmd + clique e Enter no teclado (button 0);
 * `auxclick` só conta para o botão do meio (button 1), ignorando o botão direito.
 * O navegador não dispara `click` e `auxclick` para a mesma ação, então não há duplicação.
 */
export function isCountableProductClick(event: { type: string; button?: number }): boolean {
	const button = event.button ?? 0;
	if (event.type === 'auxclick') return button === 1;
	return event.type === 'click' && button === 0;
}

export function handleProductAffiliateClick(
	event: { type: string; button?: number },
	product: ShowcaseProduct,
	itemListId: string,
	itemListName: string
): void {
	if (!isCountableProductClick(event)) return;
	trackProductListClick(product, itemListId, itemListName);
}
