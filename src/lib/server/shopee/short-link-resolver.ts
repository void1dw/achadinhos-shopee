import { extractShopeeIdsFromUrl, type ShopeeIds } from './product-match';

export const SHORT_LINK_HOST = 's.shopee.com.br';
export const DEFAULT_SHORT_LINK_LIMIT = 10;
export const SHORT_LINK_TIMEOUT_MS = 5000;
const MAX_URL_LENGTH = 2048;
const MAX_LOCATION_LENGTH = 8192;
export const SHORT_LINK_INTERMEDIATE_HOST = 'shope.ee';
const FINAL_HOST = 'shopee.com.br';
const MAX_HOPS = 2;

export type ShortLinkFailure =
	| 'invalid_url'
	| 'timeout'
	| 'request_failed'
	| `http_${number}`
	| 'invalid_redirect'
	| 'ids_not_found';

export type ShortLinkResolution =
	{ ok: true; ids: ShopeeIds } | { ok: false; code: ShortLinkFailure; detail?: string };

export type ShortLinkResolverOptions = {
	fetcher?: typeof fetch;
	timeoutMs?: number;
};

export function isShortLinkUrl(rawUrl: string): boolean {
	if (rawUrl.length > MAX_URL_LENGTH) return false;
	try {
		const url = new URL(rawUrl);
		return (
			url.protocol === 'https:' &&
			url.hostname.toLowerCase() === SHORT_LINK_HOST &&
			url.port === '' &&
			url.username === '' &&
			url.password === ''
		);
	} catch {
		return false;
	}
}

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

type Failure = { ok: false; code: ShortLinkFailure; detail?: string };

const invalidRedirect = (detail: string): Failure => ({ ok: false, code: 'invalid_redirect', detail });

function parseLocation(location: string | null, allowedHosts: string[]): URL | Failure {
	if (!location) return invalidRedirect('sem_location');
	if (location.length > MAX_LOCATION_LENGTH) return invalidRedirect('location_longo');
	let target: URL;
	try {
		target = new URL(location);
	} catch {
		return invalidRedirect(location.startsWith('/') ? 'location_relativo' : 'location_invalido');
	}
	if (target.protocol !== 'https:') return invalidRedirect('protocolo_nao_https');
	if (target.port !== '' || target.username !== '' || target.password !== '') {
		return invalidRedirect('porta_ou_credenciais');
	}
	const host = target.hostname.toLowerCase();
	if (!allowedHosts.includes(host)) {
		// Só o nome do host é registrado (nunca caminho nem query).
		return invalidRedirect(`host:${host.slice(0, 80)}`);
	}
	return target;
}

/**
 * Resolve um link curto de afiliado seguindo redirects manualmente, no máximo duas requisições:
 * `s.shopee.com.br` → `shopee.com.br` ou `s.shopee.com.br` → `shope.ee` → `shopee.com.br`. Cada salto
 * só pode ir para o host previsto (HTTPS, sem porta nem credenciais) e os IDs saem exclusivamente do
 * destino final em `shopee.com.br`. Um único prazo vale para a resolução inteira. Não envia
 * credenciais e não lê corpos de resposta.
 */
export async function resolveShortLink(
	rawUrl: string,
	options: ShortLinkResolverOptions = {}
): Promise<ShortLinkResolution> {
	if (!isShortLinkUrl(rawUrl)) return { ok: false, code: 'invalid_url' };
	const fetcher = options.fetcher ?? fetch;
	const timeoutMs = options.timeoutMs ?? SHORT_LINK_TIMEOUT_MS;

	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeoutMs);
	try {
		let current = rawUrl;
		for (let hop = 0; hop < MAX_HOPS; hop += 1) {
			let response: Response;
			try {
				response = await fetcher(current, {
					method: 'GET',
					redirect: 'manual',
					headers: { accept: 'text/html' },
					signal: controller.signal
				});
			} catch (error) {
				const timedOut =
					controller.signal.aborted || (error instanceof Error && error.name === 'AbortError');
				return { ok: false, code: timedOut ? 'timeout' : 'request_failed' };
			}
			if (controller.signal.aborted) return { ok: false, code: 'timeout' };
			void response.body?.cancel().catch(() => undefined);

			if (!REDIRECT_STATUSES.has(response.status)) {
				return {
					ok: false,
					code: response.status === 200 ? 'ids_not_found' : `http_${response.status}`
				};
			}
			const allowed = hop === 0 ? [FINAL_HOST, SHORT_LINK_INTERMEDIATE_HOST] : [FINAL_HOST];
			const target = parseLocation(response.headers.get('location'), allowed);
			if (!(target instanceof URL)) return target;
			if (target.hostname.toLowerCase() === FINAL_HOST) {
				const ids = extractShopeeIdsFromUrl(target.href);
				return ids ? { ok: true, ids } : { ok: false, code: 'ids_not_found' };
			}
			current = target.href;
		}
		return invalidRedirect('redirecionamentos_excedidos');
	} finally {
		clearTimeout(timer);
	}
}
