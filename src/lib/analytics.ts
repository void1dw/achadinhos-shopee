import type { ShowcaseProduct } from './types';

type AnalyticsParameters = Record<string, unknown>;

declare global {
	interface Window {
		gtag?: (command: 'event', eventName: string, parameters: AnalyticsParameters) => void;
	}
}

const CURRENCY = 'BRL';

function sendEvent(eventName: string, parameters: AnalyticsParameters): void {
	if (typeof window === 'undefined') return;
	window.gtag?.('event', eventName, parameters);
}

function isShopeeLink(url: string): boolean {
	try {
		const hostname = new URL(url).hostname.toLowerCase();
		return (
			hostname === 'shopee.com.br' || hostname.endsWith('.shopee.com.br') || hostname === 'shope.ee'
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
