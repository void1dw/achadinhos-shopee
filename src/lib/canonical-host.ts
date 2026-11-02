const WWW_HOST = 'www.achadinhoslia.com.br';
const ROOT_HOST = 'achadinhoslia.com.br';

/** Retorna a URL do domínio raiz para requisições GET/HEAD vindas do `www`; caso contrário, null. */
export function wwwRedirectTarget(url: URL, method: string): string | null {
	if (url.hostname !== WWW_HOST) return null;
	if (method !== 'GET' && method !== 'HEAD') return null;
	return `https://${ROOT_HOST}${url.pathname}${url.search}`;
}

function isProductionHost(hostname: string): boolean {
	return hostname === ROOT_HOST || hostname === WWW_HOST;
}

/** Destino https para GET/HEAD em http nos hosts de produção; localhost e workers.dev ficam de fora. */
export function httpsRedirectTarget(url: URL, method: string): string | null {
	if (url.protocol !== 'http:' || !isProductionHost(url.hostname)) return null;
	if (method !== 'GET' && method !== 'HEAD') return null;
	return `https://${ROOT_HOST}${url.pathname}${url.search}`;
}

/** Hostnames *.workers.dev servem o mesmo site, mas não devem ser indexados. */
export function isWorkersDevHost(hostname: string): boolean {
	return hostname.endsWith('.workers.dev');
}

/** HSTS de 6 meses, sem includeSubDomains/preload, só em https no domínio de produção. */
export const HSTS_HEADER = 'max-age=15552000';

export function shouldSendHsts(url: URL): boolean {
	return url.protocol === 'https:' && isProductionHost(url.hostname);
}
