import { PUBLIC_SITE_URL } from './config';

/**
 * Só vira `true` depois de confirmar, no Google Search Console ou numa pesquisa manual, que o site
 * está indexado. Até lá o rodapé não menciona a Pesquisa Google.
 */
export const GOOGLE_INDEXING_CONFIRMED = true;

/** O selo de HTTPS só vale quando a conexão do visitante realmente usa HTTPS. */
export function isSecureConnection(protocol: string): boolean {
	return protocol === 'https:';
}

/** Pesquisa pelo domínio público no Google (operador `site:`). */
export function googleSiteSearchUrl(siteUrl: string = PUBLIC_SITE_URL): string {
	const query = `site:${new URL(siteUrl).hostname}`;
	return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
}
