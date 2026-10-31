const WWW_HOST = 'www.achadinhoslia.com.br';
const ROOT_HOST = 'achadinhoslia.com.br';

/** Retorna a URL do domínio raiz para requisições GET/HEAD vindas do `www`; caso contrário, null. */
export function wwwRedirectTarget(url: URL, method: string): string | null {
	if (url.hostname !== WWW_HOST) return null;
	if (method !== 'GET' && method !== 'HEAD') return null;
	return `https://${ROOT_HOST}${url.pathname}${url.search}`;
}
