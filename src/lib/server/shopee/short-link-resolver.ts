import { extractShopeeIdsFromUrl, type ShopeeIds } from './product-match';

export const SHORT_LINK_HOST = 's.shopee.com.br';
export const DEFAULT_SHORT_LINK_LIMIT = 10;
export const SHORT_LINK_TIMEOUT_MS = 5000;
const MAX_URL_LENGTH = 2048;

export type ShortLinkFailure =
	| 'invalid_url'
	| 'timeout'
	| 'request_failed'
	| `http_${number}`
	| 'invalid_redirect'
	| 'ids_not_found';

export type ShortLinkResolution =
	{ ok: true; ids: ShopeeIds } | { ok: false; code: ShortLinkFailure };

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

/**
 * Resolve um link curto de afiliado com no máximo um redirecionamento, tratado manualmente. O
 * destino precisa ser uma URL absoluta HTTPS em `shopee.com.br` (host exato, sem credenciais nem
 * porta) com caminho de produto reconhecido; nada além disso é seguido. Não envia credenciais e
 * não lê o corpo da resposta.
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
	let response: Response;
	try {
		response = await fetcher(rawUrl, {
			method: 'GET',
			redirect: 'manual',
			headers: { accept: 'text/html' },
			signal: controller.signal
		});
	} catch (error) {
		const timedOut =
			controller.signal.aborted || (error instanceof Error && error.name === 'AbortError');
		return { ok: false, code: timedOut ? 'timeout' : 'request_failed' };
	} finally {
		clearTimeout(timer);
	}
	void response.body?.cancel().catch(() => undefined);

	if (!REDIRECT_STATUSES.has(response.status)) {
		return {
			ok: false,
			code: response.status === 200 ? 'ids_not_found' : `http_${response.status}`
		};
	}
	const location = response.headers.get('location');
	if (!location || location.length > MAX_URL_LENGTH) return { ok: false, code: 'invalid_redirect' };
	let target: URL;
	try {
		target = new URL(location);
	} catch {
		return { ok: false, code: 'invalid_redirect' };
	}
	if (
		target.protocol !== 'https:' ||
		target.hostname.toLowerCase() !== 'shopee.com.br' ||
		target.port !== '' ||
		target.username !== '' ||
		target.password !== ''
	) {
		return { ok: false, code: 'invalid_redirect' };
	}
	const ids = extractShopeeIdsFromUrl(target.href);
	return ids ? { ok: true, ids } : { ok: false, code: 'ids_not_found' };
}
