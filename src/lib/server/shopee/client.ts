import type { CallSettlement, ShopeeCallControl } from './call-control';
import type { ShopeeGraphQLError, ShopeeProductOfferV2 } from './types';

const SHOPEE_GRAPHQL_ENDPOINT = 'https://open-api.affiliate.shopee.com.br/graphql';
const REQUEST_TIMEOUT_MS = 10_000;

const PRODUCT_OFFER_FIELDS = `{
	nodes {
		itemId
		shopId
		productName
		productLink
		offerLink
		imageUrl
		price
		priceMin
		priceMax
		priceDiscountRate
		sales
		ratingStar
		commissionRate
		productCatIds
	}
	pageInfo {
		page
		limit
		hasNextPage
		scrollId
	}
}`;
const PRODUCT_OFFER_QUERY = `query {
	productOfferV2(page: 1, limit: 1, listType: 0, sortType: 1) {
		nodes {
			itemId
			shopId
			productName
			productLink
			offerLink
			imageUrl
			priceMin
			priceMax
			priceDiscountRate
			sales
			ratingStar
			commissionRate
		}
		pageInfo {
			page
			limit
			hasNextPage
		}
	}
}`;

type ShopeeCredentials = Pick<Cloudflare.Env, 'SHOPEE_APP_ID' | 'SHOPEE_APP_SECRET'>;

export type ShopeeApiErrorKind = 'rate_limit' | 'timeout' | 'graphql' | 'upstream' | 'budget';

/** Status HTTP usado pelas rotas administrativas para erros da Shopee. */
export function shopeeErrorHttpStatus(error: ShopeeApiError): number {
	if (error.kind === 'rate_limit') return 429;
	if (error.kind === 'budget') return error.code === 'SHOPEE_BUDGET_EXHAUSTED' ? 429 : 503;
	return error.kind === 'timeout' ? 504 : 502;
}

function settlementFor(error: ShopeeApiError): CallSettlement {
	const httpMatch = /^SHOPEE_HTTP_(\d{3})$/.exec(error.code);
	if (error.kind === 'rate_limit') {
		return { outcome: 'rate_limited', errorCode: error.code };
	}
	if (error.kind === 'timeout') return { outcome: 'timeout', errorCode: error.code };
	if (httpMatch) {
		return { outcome: 'http_error', httpStatus: Number(httpMatch[1]), errorCode: error.code };
	}
	if (error.code === 'SHOPEE_REQUEST_FAILED') {
		return { outcome: 'transport_error', errorCode: error.code };
	}
	if (error.code === 'SHOPEE_INVALID_RESPONSE') {
		return { outcome: 'invalid_response', errorCode: error.code };
	}
	return { outcome: 'graphql_error', errorCode: error.code };
}

export class ShopeeApiError extends Error {
	readonly kind: ShopeeApiErrorKind;
	readonly code: string;
	readonly upstreamCodes?: number[];
	readonly fields?: string[];

	constructor(
		kind: ShopeeApiErrorKind,
		code: string,
		message: string,
		diagnostics?: { upstreamCodes?: number[]; fields?: string[] }
	) {
		super(message);
		this.name = 'ShopeeApiError';
		this.kind = kind;
		this.code = code;
		this.upstreamCodes = diagnostics?.upstreamCodes;
		this.fields = diagnostics?.fields;
	}
}

type ProductField = keyof ShopeeProductOfferV2;
type ProductFieldValidator = (value: unknown) => boolean;
type ShopeeProductOfferPayload = Omit<ShopeeProductOfferV2, 'ratingStar'> & {
	ratingStar?: number | string | null;
};
type ProductOfferPage = {
	nodes: ShopeeProductOfferV2[];
	rawNodes: Record<string, unknown>[];
	pageInfo?: {
		page?: number | null;
		limit?: number | null;
		hasNextPage?: boolean | null;
		scrollId?: string | null;
	} | null;
};
export type ShopeeProductOfferQuery = {
	page?: number;
	limit?: number;
	listType?: number;
	sortType?: number;
	keyword?: string;
	productCatId?: number;
	itemId?: string | number;
	shopId?: string | number;
};
export type ShopeeProductOfferRecord = {
	product: ShopeeProductOfferV2;
	rawData: Record<string, unknown>;
};
export type ShopeeProductOfferPage = {
	offers: ShopeeProductOfferRecord[];
	pageInfo: ProductOfferPage['pageInfo'];
};
type DiagnosticProduct = {
	itemId: string | number | null;
	shopId: string | number | null;
	productName: string | null;
	price: string | number | null;
	priceMin: string | number | null;
	priceMax: string | number | null;
	commissionRate: string | null;
	priceDiscountRate: string | number | null;
	productCatIds: number[] | null;
};
type DiagnosticPageInfo = {
	page: number | null;
	limit: number | null;
	hasNextPage: boolean | null;
	scrollIdPresent: boolean;
};
type DiagnosticCheck<T> =
	| { status: 'success'; productCount: number; products: T[]; pageInfo: DiagnosticPageInfo }
	| {
			status: 'error';
			error: { code: string; message: string; upstreamCodes?: number[] };
	  }
	| { status: 'skipped'; reason: string };

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isShopeeGraphQLError(value: unknown): value is ShopeeGraphQLError {
	if (!isRecord(value)) return false;
	if (value.message !== undefined && typeof value.message !== 'string') return false;
	if (value.extensions === undefined) return true;
	return isRecord(value.extensions);
}

function isNullableString(value: unknown): boolean {
	return value === null || typeof value === 'string';
}

function isNullablePrice(value: unknown): boolean {
	return (
		value === null ||
		(typeof value === 'number' && Number.isFinite(value)) ||
		(typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value)))
	);
}

function isNullableNumericRating(value: unknown): boolean {
	if (value === null) return true;
	if (typeof value === 'number') return Number.isFinite(value);
	return typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value));
}

function isNullableInt64(value: unknown): boolean {
	return (
		value === null ||
		(typeof value === 'number' && Number.isSafeInteger(value)) ||
		(typeof value === 'string' && /^\d+$/.test(value))
	);
}

function isNullableInt(value: unknown): boolean {
	return value === null || (typeof value === 'number' && Number.isInteger(value));
}

function isNullableProductCategoryIds(value: unknown): boolean {
	return (
		value === null ||
		(Array.isArray(value) &&
			value.every((item) => typeof item === 'number' && Number.isInteger(item)))
	);
}

const productFieldValidators: Record<ProductField, ProductFieldValidator> = {
	itemId: isNullableInt64,
	shopId: isNullableInt64,
	productName: isNullableString,
	productLink: isNullableString,
	offerLink: isNullableString,
	imageUrl: isNullableString,
	price: isNullablePrice,
	priceMin: isNullablePrice,
	priceMax: isNullablePrice,
	priceDiscountRate: isNullablePrice,
	sales: isNullableInt64,
	ratingStar: isNullableNumericRating,
	commissionRate: isNullableString,
	productCatIds: isNullableProductCategoryIds
};

function incompatibleProductFields(value: unknown): string[] {
	if (!isRecord(value)) return ['node'];
	return (Object.keys(productFieldValidators) as ProductField[]).filter(
		(field) => field in value && !productFieldValidators[field](value[field])
	);
}

function isProductOffer(value: unknown): value is ShopeeProductOfferPayload {
	return (
		isRecord(value) && incompatibleProductFields(value).every((field) => field === 'ratingStar')
	);
}

function normalizeRatingStar(value: number | string | null | undefined): number | null | undefined {
	if (value === null || value === undefined) return value;
	if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
	if (value.trim() === '') return undefined;
	const rating = Number(value);
	return Number.isFinite(rating) ? rating : undefined;
}

function normalizeProductOffer(product: ShopeeProductOfferPayload): ShopeeProductOfferV2 {
	const { ratingStar, ...fields } = product;
	const normalizedRating = normalizeRatingStar(ratingStar);
	return normalizedRating === undefined ? fields : { ...fields, ratingStar: normalizedRating };
}

function getGraphQLErrorCode(error: ShopeeGraphQLError): number | undefined {
	const extensionCode = error.extensions?.code;
	if (typeof extensionCode === 'number' && Number.isInteger(extensionCode)) return extensionCode;
	if (typeof extensionCode === 'string' && /^\d+$/.test(extensionCode)) {
		return Number(extensionCode);
	}
	const message = typeof error.message === 'string' ? error.message : '';
	const match = message.match(/\[(\d+)\]/);
	return match ? Number(match[1]) : undefined;
}

function isRateLimitError(error: ShopeeGraphQLError): boolean {
	return (
		getGraphQLErrorCode(error) === 10030 ||
		(typeof error.message === 'string' && /too many requests|rate.?limit/i.test(error.message))
	);
}

function hexDigest(bytes: ArrayBuffer): string {
	return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function createSignature(
	appId: string,
	timestamp: string,
	payload: string,
	secret: string
): Promise<string> {
	const signatureInput = `${appId}${timestamp}${payload}${secret}`;
	return hexDigest(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(signatureInput)));
}

function graphqlError(errors: ShopeeGraphQLError[]): ShopeeApiError {
	const upstreamCodes = [
		...new Set(errors.map(getGraphQLErrorCode).filter((code): code is number => code !== undefined))
	];

	if (errors.some(isRateLimitError)) {
		return new ShopeeApiError(
			'rate_limit',
			'SHOPEE_RATE_LIMIT',
			'A Shopee atingiu o limite de chamadas (código 10030). Aguarde antes de tentar novamente.',
			{ upstreamCodes }
		);
	}

	const diagnostics = { upstreamCodes };
	switch (upstreamCodes.find((code) => [10020, 10035, 10010, 11001].includes(code))) {
		case 10020:
			return new ShopeeApiError(
				'graphql',
				'SHOPEE_INVALID_CREDENTIAL',
				'A Shopee recusou a autenticação da integração (código 10020). Confira a configuração das credenciais e o relógio do sistema.',
				diagnostics
			);
		case 10035:
			return new ShopeeApiError(
				'graphql',
				'SHOPEE_API_ACCESS_DENIED',
				'A integração não tem acesso à API de afiliados necessária (código 10035). Verifique as permissões e a aprovação do aplicativo.',
				diagnostics
			);
		case 10010:
			return new ShopeeApiError(
				'graphql',
				'SHOPEE_QUERY_PARSE_ERROR',
				'A Shopee não conseguiu interpretar a consulta GraphQL (código 10010).',
				diagnostics
			);
		case 11001:
			return new ShopeeApiError(
				'graphql',
				'SHOPEE_INVALID_PARAMETERS',
				'A Shopee rejeitou os parâmetros da consulta (código 11001). Confira os valores aceitos pelo schema.',
				diagnostics
			);
		default:
			return new ShopeeApiError(
				'graphql',
				'SHOPEE_GRAPHQL_ERROR',
				'A Shopee retornou um erro GraphQL. Confira o código de diagnóstico, se informado.',
				diagnostics
			);
	}
}

function parseProductOfferPage(value: unknown): ProductOfferPage {
	if (!isRecord(value) || !Array.isArray(value.nodes)) {
		throw new ShopeeApiError(
			'upstream',
			'SHOPEE_INVALID_RESPONSE',
			'A Shopee retornou uma resposta sem a lista de produtos esperada.'
		);
	}

	const products: ShopeeProductOfferV2[] = [];
	const rawNodes: Record<string, unknown>[] = [];
	for (const node of value.nodes) {
		const fields = incompatibleProductFields(node);
		const requiredFields = fields.filter((field) => field !== 'ratingStar');
		if (requiredFields.length > 0) {
			throw new ShopeeApiError(
				'upstream',
				'SHOPEE_INVALID_PRODUCT_FIELDS',
				`A Shopee retornou tipos incompatíveis nos campos: ${requiredFields.join(', ')}.`,
				{ fields: requiredFields }
			);
		}
		if (!isProductOffer(node)) {
			throw new ShopeeApiError(
				'upstream',
				'SHOPEE_INVALID_PRODUCT',
				'A Shopee retornou um item de produto inválido.'
			);
		}
		products.push(normalizeProductOffer(node));
		rawNodes.push(node);
	}

	let pageInfo: ProductOfferPage['pageInfo'];
	if (value.pageInfo === null) {
		pageInfo = null;
	} else if (value.pageInfo !== undefined) {
		if (!isRecord(value.pageInfo)) {
			throw new ShopeeApiError(
				'upstream',
				'SHOPEE_INVALID_RESPONSE',
				'A Shopee retornou informações de paginação inválidas.'
			);
		}
		const info = value.pageInfo;
		if (
			(info.page !== undefined && info.page !== null && !isNullableInt(info.page)) ||
			(info.limit !== undefined && info.limit !== null && !isNullableInt(info.limit)) ||
			(info.hasNextPage !== undefined &&
				info.hasNextPage !== null &&
				typeof info.hasNextPage !== 'boolean') ||
			(info.scrollId !== undefined && info.scrollId !== null && typeof info.scrollId !== 'string')
		) {
			throw new ShopeeApiError(
				'upstream',
				'SHOPEE_INVALID_RESPONSE',
				'A Shopee retornou informações de paginação incompatíveis.'
			);
		}
		pageInfo = {
			page: info.page as number | null | undefined,
			limit: info.limit as number | null | undefined,
			hasNextPage: info.hasNextPage as boolean | null | undefined,
			scrollId: info.scrollId as string | null | undefined
		};
	}

	return { nodes: products, rawNodes, pageInfo };
}

function parseOffers(payload: unknown): ShopeeProductOfferV2[] {
	if (!isRecord(payload) || !isRecord(payload.data)) {
		throw new ShopeeApiError(
			'upstream',
			'SHOPEE_INVALID_RESPONSE',
			'A Shopee retornou uma resposta sem dados de produto válidos.'
		);
	}

	const result = payload.data.productOfferV2;
	if (result === undefined) {
		throw new ShopeeApiError(
			'upstream',
			'SHOPEE_INVALID_RESPONSE',
			'A Shopee retornou uma resposta sem a lista de produtos esperada.'
		);
	}

	return parseProductOfferPage(result).nodes;
}

function serializeGraphQLValue(value: unknown): string {
	return JSON.stringify(value);
}

function buildProductOfferField(query: ShopeeProductOfferQuery, alias?: string): string {
	validateProductOfferQuery(query);
	const args: string[] = [];
	if (query.page !== undefined) args.push(`page: ${query.page}`);
	if (query.limit !== undefined) args.push(`limit: ${query.limit}`);
	if (query.listType !== undefined) args.push(`listType: ${query.listType}`);
	if (query.sortType !== undefined) args.push(`sortType: ${query.sortType}`);
	if (query.keyword !== undefined) args.push(`keyword: ${serializeGraphQLValue(query.keyword)}`);
	if (query.productCatId !== undefined) args.push(`productCatId: ${query.productCatId}`);
	if (query.itemId !== undefined) args.push(`itemId: ${query.itemId}`);
	if (query.shopId !== undefined) args.push(`shopId: ${query.shopId}`);
	return `${alias ? `${alias}: ` : ''}productOfferV2(${args.join(', ')}) ${PRODUCT_OFFER_FIELDS}`;
}

function validateProductOfferQuery(query: ShopeeProductOfferQuery): void {
	for (const [field, value] of [
		['page', query.page],
		['limit', query.limit],
		['listType', query.listType],
		['sortType', query.sortType],
		['productCatId', query.productCatId]
	] as const) {
		if (value !== undefined && (!Number.isInteger(value) || value < 0)) {
			throw new ShopeeApiError(
				'upstream',
				'SHOPEE_INVALID_PARAMETERS',
				`O argumento ${field} precisa ser um inteiro não negativo.`
			);
		}
	}
	for (const [field, value] of [
		['itemId', query.itemId],
		['shopId', query.shopId]
	] as const) {
		if (value !== undefined && !/^\d+$/.test(String(value))) {
			throw new ShopeeApiError(
				'upstream',
				'SHOPEE_INVALID_PARAMETERS',
				`O argumento ${field} precisa ser um identificador numérico.`
			);
		}
	}
}

async function requestGraphQL(
	credentials: ShopeeCredentials,
	query: string,
	fetcher: typeof fetch = fetch,
	control?: ShopeeCallControl
): Promise<Record<string, unknown>> {
	const appId = credentials.SHOPEE_APP_ID;
	const secret = credentials.SHOPEE_APP_SECRET;
	if (!appId || !secret) {
		throw new ShopeeApiError(
			'upstream',
			'SHOPEE_CREDENTIALS_NOT_CONFIGURED',
			'As credenciais da Shopee não estão configuradas.'
		);
	}
	// Somente um fetcher injetado (testes) pode dispensar o controle; o fetch real exige reserva.
	if (!control && fetcher === globalThis.fetch) {
		throw new ShopeeApiError(
			'budget',
			'SHOPEE_CALL_CONTROL_REQUIRED',
			'Chamadas à Shopee exigem o controle central de consumo.'
		);
	}

	const timestamp = String(Math.floor(Date.now() / 1000));
	const payload = JSON.stringify({ query });
	const signature = await createSignature(appId, timestamp, payload, secret);

	let reservationId: number | null = null;
	if (control) {
		const reservation = await control.reserve();
		if (!reservation.ok) {
			throw reservation.reason === 'budget_exhausted'
				? new ShopeeApiError(
						'budget',
						'SHOPEE_BUDGET_EXHAUSTED',
						'O orçamento interno de chamadas por hora foi atingido.'
					)
				: new ShopeeApiError(
						'budget',
						'SHOPEE_CALL_CONTROL_UNAVAILABLE',
						'O controle de consumo da Shopee está indisponível; a chamada foi bloqueada.'
					);
		}
		reservationId = reservation.id;
	}
	const settle = (settlement: CallSettlement) => control?.settle(reservationId, settlement);

	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

	const invalidResponse = () =>
		new ShopeeApiError(
			'upstream',
			'SHOPEE_INVALID_RESPONSE',
			'A Shopee retornou uma resposta inválida.'
		);
	let httpRateLimited = false;
	const fail = async (failure: ShopeeApiError): Promise<never> => {
		await settle({
			...settlementFor(failure),
			...(httpRateLimited ? { httpStatus: 429 } : {})
		});
		throw failure;
	};

	let response: Response;
	let responseBody: unknown;
	try {
		response = await fetcher(SHOPEE_GRAPHQL_ENDPOINT, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `SHA256 Credential=${appId}, Timestamp=${timestamp}, Signature=${signature}`
			},
			body: payload,
			signal: controller.signal
		});
		if (response.status === 429) {
			httpRateLimited = true;
			throw new ShopeeApiError(
				'rate_limit',
				'SHOPEE_RATE_LIMIT',
				'A Shopee atingiu o limite de chamadas. Aguarde antes de tentar novamente.'
			);
		}
		if (!response.ok) {
			throw new ShopeeApiError(
				'upstream',
				`SHOPEE_HTTP_${response.status}`,
				`A chamada à API da Shopee falhou (HTTP ${response.status}).`
			);
		}
	} catch (error) {
		clearTimeout(timeout);
		if (error instanceof ShopeeApiError) return fail(error);
		if (controller.signal.aborted) {
			return fail(
				new ShopeeApiError(
					'timeout',
					'SHOPEE_TIMEOUT',
					'A chamada à API da Shopee excedeu o tempo limite.'
				)
			);
		}
		return fail(
			new ShopeeApiError(
				'upstream',
				'SHOPEE_REQUEST_FAILED',
				'Não foi possível concluir a chamada à API da Shopee.'
			)
		);
	}

	// HTTP 2xx recebido: falha ao ler o corpo é resposta inválida (ou timeout, se abortado).
	try {
		responseBody = await response.json();
	} catch {
		return fail(
			controller.signal.aborted
				? new ShopeeApiError(
						'timeout',
						'SHOPEE_TIMEOUT',
						'A chamada à API da Shopee excedeu o tempo limite.'
					)
				: invalidResponse()
		);
	} finally {
		clearTimeout(timeout);
	}

	let parsed: Record<string, unknown>;
	try {
		parsed = parseGraphQLBody(responseBody);
	} catch (error) {
		// Exceção inesperada no processamento também liquida a reserva, sem vazar detalhes.
		return fail(error instanceof ShopeeApiError ? error : invalidResponse());
	}
	await settle({ outcome: 'success' });
	return parsed;
}

function parseGraphQLBody(responseBody: unknown): Record<string, unknown> {
	if (!isRecord(responseBody)) {
		throw new ShopeeApiError(
			'upstream',
			'SHOPEE_INVALID_RESPONSE',
			'A Shopee retornou uma resposta inválida.'
		);
	}

	if ('errors' in responseBody) {
		if (!Array.isArray(responseBody.errors)) {
			throw new ShopeeApiError(
				'upstream',
				'SHOPEE_INVALID_RESPONSE',
				'A Shopee retornou erros em um formato inválido.'
			);
		}
		if (responseBody.errors.length > 0) {
			if (!responseBody.errors.every(isShopeeGraphQLError)) {
				throw new ShopeeApiError(
					'upstream',
					'SHOPEE_INVALID_RESPONSE',
					'A Shopee retornou erros em um formato inválido.'
				);
			}
			throw graphqlError(responseBody.errors);
		}
	}

	return responseBody;
}

export async function getProductOfferTest(
	credentials: ShopeeCredentials,
	fetcher: typeof fetch = fetch,
	control?: ShopeeCallControl
): Promise<ShopeeProductOfferV2[]> {
	return parseOffers(await requestGraphQL(credentials, PRODUCT_OFFER_QUERY, fetcher, control));
}

function toOfferPage(page: ProductOfferPage): ShopeeProductOfferPage {
	return {
		offers: page.nodes.map((product, index) => ({
			product,
			rawData: page.rawNodes[index]!
		})),
		pageInfo: page.pageInfo
	};
}

export async function getProductOffers(
	credentials: ShopeeCredentials,
	query: ShopeeProductOfferQuery,
	fetcher: typeof fetch = fetch,
	control?: ShopeeCallControl
): Promise<ShopeeProductOfferPage> {
	const payload = await requestGraphQL(
		credentials,
		`query { ${buildProductOfferField(query, 'offers')} }`,
		fetcher,
		control
	);
	return toOfferPage(parseAliasedProductOffer(payload, 'offers'));
}

export const MAX_OFFER_BATCH_QUERIES = 10;

/** Várias consultas `productOfferV2` com aliases distintos em uma única chamada HTTP. */
export async function getProductOffersBatch(
	credentials: ShopeeCredentials,
	queries: ShopeeProductOfferQuery[],
	fetcher: typeof fetch = fetch,
	control?: ShopeeCallControl
): Promise<ShopeeProductOfferPage[]> {
	if (queries.length === 0) return [];
	if (queries.length > MAX_OFFER_BATCH_QUERIES) {
		throw new ShopeeApiError(
			'upstream',
			'SHOPEE_INVALID_PARAMETERS',
			`Cada chamada aceita no máximo ${MAX_OFFER_BATCH_QUERIES} consultas.`
		);
	}
	const body = queries.map((query, index) => buildProductOfferField(query, `p${index}`));
	const payload = await requestGraphQL(
		credentials,
		`query { ${body.join('\n')} }`,
		fetcher,
		control
	);
	return queries.map((_, index) => toOfferPage(parseAliasedProductOffer(payload, `p${index}`)));
}

function parseAliasedProductOffer(
	payload: Record<string, unknown>,
	alias: string
): ProductOfferPage {
	if (!isRecord(payload.data) || !(alias in payload.data)) {
		throw new ShopeeApiError(
			'upstream',
			'SHOPEE_INVALID_RESPONSE',
			'A Shopee retornou uma resposta sem a lista de produtos esperada.'
		);
	}
	return parseProductOfferPage(payload.data[alias]);
}

function summarizeProduct(product: ShopeeProductOfferV2): DiagnosticProduct {
	return {
		itemId: product.itemId ?? null,
		shopId: product.shopId ?? null,
		productName: product.productName ?? null,
		price: product.price ?? null,
		priceMin: product.priceMin ?? null,
		priceMax: product.priceMax ?? null,
		commissionRate: product.commissionRate ?? null,
		priceDiscountRate: product.priceDiscountRate ?? null,
		productCatIds: product.productCatIds ?? null
	};
}

function summarizePageInfo(info: ProductOfferPage['pageInfo']): DiagnosticPageInfo {
	return {
		page: info?.page ?? null,
		limit: info?.limit ?? null,
		hasNextPage: info?.hasNextPage ?? null,
		scrollIdPresent: Boolean(info?.scrollId)
	};
}

function successfulCheck(page: ProductOfferPage): DiagnosticCheck<DiagnosticProduct> {
	return {
		status: 'success',
		productCount: page.nodes.length,
		products: page.nodes.map(summarizeProduct),
		pageInfo: summarizePageInfo(page.pageInfo)
	};
}

function failedCheck<T>(error: unknown): DiagnosticCheck<T> {
	if (error instanceof ShopeeApiError) {
		return {
			status: 'error',
			error: {
				code: error.code,
				message: error.message,
				...(error.upstreamCodes ? { upstreamCodes: error.upstreamCodes } : {})
			}
		};
	}
	return {
		status: 'error',
		error: {
			code: 'SHOPEE_DIAGNOSTIC_FAILED',
			message: 'A consulta de diagnóstico não pôde ser concluída.'
		}
	};
}

function firstUsableProduct(
	checks: DiagnosticCheck<DiagnosticProduct>[]
): DiagnosticProduct | undefined {
	for (const check of checks) {
		if (check.status === 'success' && check.products.length > 0) return check.products[0];
	}
	return undefined;
}

function asNumericIdentifier(value: string | number | null): string | undefined {
	if (value === null || !/^\d+$/.test(String(value))) return undefined;
	return String(value);
}

export async function runShopeeDiagnostic(
	credentials: ShopeeCredentials,
	fetcher: typeof fetch = fetch,
	control?: ShopeeCallControl
): Promise<{
	httpCalls: number;
	general: DiagnosticCheck<DiagnosticProduct>;
	keywords: {
		'fone bluetooth': DiagnosticCheck<DiagnosticProduct>;
		organizador: DiagnosticCheck<DiagnosticProduct>;
	};
	category: DiagnosticCheck<DiagnosticProduct> & { productCatId?: number };
	pagination: {
		status: 'success' | 'error';
		pageOne?: DiagnosticCheck<DiagnosticProduct>;
		pageTwo?: DiagnosticCheck<DiagnosticProduct>;
		sameQuery: boolean;
		error?: { code: string; message: string; upstreamCodes?: number[] };
	};
	itemLookup: DiagnosticCheck<DiagnosticProduct> & {
		itemId?: string;
		shopId?: string;
		matchFound?: boolean;
	};
}> {
	let httpCalls = 0;
	let halted: ShopeeApiError | undefined;
	const run = async (query: string) => {
		// Após rate limit ou bloqueio de orçamento, nenhuma nova chamada é feita.
		if (halted) throw halted;
		httpCalls += 1;
		try {
			return await requestGraphQL(credentials, query, fetcher, control);
		} catch (error) {
			if (
				error instanceof ShopeeApiError &&
				(error.kind === 'rate_limit' || error.kind === 'budget')
			) {
				halted = error;
				if (error.kind === 'budget') httpCalls -= 1;
			}
			throw error;
		}
	};

	let generalPage: ProductOfferPage | undefined;
	let general: DiagnosticCheck<DiagnosticProduct>;
	try {
		generalPage = parseAliasedProductOffer(
			await run(
				`query { ${buildProductOfferField({ page: 1, limit: 5, listType: 0 }, 'general')} }`
			),
			'general'
		);
		general = successfulCheck(generalPage);
	} catch (error) {
		general = failedCheck(error);
	}

	const keywordChecks = {} as {
		'fone bluetooth': DiagnosticCheck<DiagnosticProduct>;
		organizador: DiagnosticCheck<DiagnosticProduct>;
	};
	for (const keyword of ['fone bluetooth', 'organizador'] as const) {
		try {
			const query = buildProductOfferField(
				{ keyword, page: 1, limit: 5, listType: 0, sortType: 1 },
				`search${keyword === 'organizador' ? 'Organizer' : 'Bluetooth'}`
			);
			const alias = keyword === 'organizador' ? 'searchOrganizer' : 'searchBluetooth';
			const payload = await run(`query { ${query} }`);
			keywordChecks[keyword] = successfulCheck(parseAliasedProductOffer(payload, alias));
		} catch (error) {
			keywordChecks[keyword] = failedCheck(error);
		}
	}

	const allChecks = [general, keywordChecks['fone bluetooth'], keywordChecks.organizador];
	const candidate = firstUsableProduct(allChecks);
	const categoryId =
		generalPage?.nodes
			.flatMap((product) => product.productCatIds ?? [])
			.find((id) => Number.isInteger(id) && id > 0) ?? candidate?.productCatIds?.[0];
	const pageOneAlias = buildProductOfferField({ page: 1, limit: 5, listType: 0 }, 'pageOne');
	const pageTwoAlias = buildProductOfferField({ page: 2, limit: 5, listType: 0 }, 'pageTwo');
	const categoryAlias =
		categoryId === undefined
			? ''
			: `${buildProductOfferField({ productCatId: categoryId, page: 1, limit: 5 }, 'category')}\n`;
	let category: DiagnosticCheck<DiagnosticProduct> & { productCatId?: number };
	let pagination: {
		status: 'success' | 'error';
		pageOne?: DiagnosticCheck<DiagnosticProduct>;
		pageTwo?: DiagnosticCheck<DiagnosticProduct>;
		sameQuery: boolean;
		error?: { code: string; message: string; upstreamCodes?: number[] };
	};
	try {
		const payload = await run(`query { ${categoryAlias}${pageOneAlias}\n${pageTwoAlias} }`);
		const pageOne = parseAliasedProductOffer(payload, 'pageOne');
		const pageTwo = parseAliasedProductOffer(payload, 'pageTwo');
		pagination = {
			status: 'success',
			pageOne: successfulCheck(pageOne),
			pageTwo: successfulCheck(pageTwo),
			sameQuery: true
		};
		if (categoryId === undefined) {
			category = {
				status: 'skipped',
				reason: 'A API não retornou productCatIds utilizáveis nos produtos consultados.'
			};
		} else {
			category = {
				...successfulCheck(parseAliasedProductOffer(payload, 'category')),
				productCatId: categoryId
			};
		}
	} catch (error) {
		const failed = failedCheck<DiagnosticProduct>(error);
		pagination = {
			status: 'error',
			sameQuery: true,
			error: failed.status === 'error' ? failed.error : undefined
		};
		category =
			categoryId === undefined
				? {
						status: 'skipped',
						reason: 'A API não retornou productCatIds utilizáveis nos produtos consultados.'
					}
				: { ...failed, productCatId: categoryId };
	}

	const itemCandidate = firstUsableProduct([
		general,
		keywordChecks['fone bluetooth'],
		keywordChecks.organizador
	]);
	const itemId = asNumericIdentifier(itemCandidate?.itemId ?? null);
	const shopId = asNumericIdentifier(itemCandidate?.shopId ?? null);
	let itemLookup: DiagnosticCheck<DiagnosticProduct> & {
		itemId?: string;
		shopId?: string;
		matchFound?: boolean;
	};
	if (!itemCandidate || !itemId || !shopId) {
		itemLookup = {
			status: 'skipped',
			reason: 'Nenhum resultado com itemId e shopId numéricos foi retornado para consultar.'
		};
	} else {
		try {
			const query = buildProductOfferField(
				{ itemId, shopId, page: 1, limit: 1, listType: 0 },
				'itemLookup'
			);
			const page = parseAliasedProductOffer(await run(`query { ${query} }`), 'itemLookup');
			itemLookup = {
				...successfulCheck(page),
				itemId,
				shopId,
				matchFound: page.nodes.some(
					(product) => String(product.itemId) === itemId && String(product.shopId) === shopId
				)
			};
		} catch (error) {
			itemLookup = { ...failedCheck<DiagnosticProduct>(error), itemId, shopId };
		}
	}

	return {
		httpCalls,
		general,
		keywords: keywordChecks,
		category,
		pagination,
		itemLookup
	};
}

export const COMMISSION_PROBE_FIELDS = [
	'commissionRate',
	'sellerCommissionRate',
	'shopeeCommissionRate',
	'commission'
] as const;

export type CommissionProbeFieldStatus = 'present' | 'null' | 'missing';

export const MAX_COMMISSION_PROBE_TARGETS = 10;

export type CommissionProbeTarget = { itemId: string; shopId: string };

export type CommissionFieldProbe = {
	nodeCount: number;
	/** Nó bruto retornado pela Shopee, contendo apenas os campos solicitados. */
	rawNode: Record<string, unknown> | null;
	fields: Record<(typeof COMMISSION_PROBE_FIELDS)[number], CommissionProbeFieldStatus>;
};

export type CommissionProductProbe = CommissionFieldProbe & CommissionProbeTarget;

function invalidProbeParameter(field: string): ShopeeApiError {
	return new ShopeeApiError(
		'upstream',
		'SHOPEE_INVALID_PARAMETERS',
		`O argumento ${field} precisa ser um identificador numérico.`
	);
}

function probeNode(nodes: unknown[]): CommissionFieldProbe {
	const first = nodes[0];
	const rawNode = isRecord(first) ? first : null;
	const fields = Object.fromEntries(
		COMMISSION_PROBE_FIELDS.map((field) => [
			field,
			!rawNode || !(field in rawNode) ? 'missing' : rawNode[field] === null ? 'null' : 'present'
		])
	) as CommissionFieldProbe['fields'];
	return { nodeCount: nodes.length, rawNode, fields };
}

/** Diagnóstico isolado: uma única chamada GraphQL com um alias por produto (máximo de 10). */
export async function probeCommissionFieldsBatch(
	credentials: ShopeeCredentials,
	targets: CommissionProbeTarget[],
	fetcher: typeof fetch = fetch,
	control?: ShopeeCallControl
): Promise<CommissionProductProbe[]> {
	if (targets.length === 0 || targets.length > MAX_COMMISSION_PROBE_TARGETS) {
		throw new ShopeeApiError(
			'upstream',
			'SHOPEE_INVALID_PARAMETERS',
			`Informe de 1 a ${MAX_COMMISSION_PROBE_TARGETS} produtos.`
		);
	}
	for (const target of targets) {
		if (!/^\d+$/.test(target.itemId)) throw invalidProbeParameter('itemId');
		if (!/^\d+$/.test(target.shopId)) throw invalidProbeParameter('shopId');
	}

	const selection = `{ nodes { itemId shopId ${COMMISSION_PROBE_FIELDS.join(' ')} } }`;
	const payload = await requestGraphQL(
		credentials,
		`query { ${targets
			.map(
				(target, index) =>
					`p${index}: productOfferV2(itemId: ${target.itemId}, shopId: ${target.shopId}, page: 1, limit: 1, listType: 0) ${selection}`
			)
			.join(' ')} }`,
		fetcher,
		control
	);
	const data = isRecord(payload.data) ? payload.data : {};
	return targets.map((target, index) => {
		const offers = data[`p${index}`];
		const nodes = isRecord(offers) ? offers.nodes : undefined;
		if (!Array.isArray(nodes)) {
			throw new ShopeeApiError(
				'upstream',
				'SHOPEE_INVALID_RESPONSE',
				'A Shopee retornou uma resposta sem a lista de produtos esperada.'
			);
		}
		return { itemId: target.itemId, shopId: target.shopId, ...probeNode(nodes) };
	});
}

/** Variante de produto único, mantida por compatibilidade. */
export async function probeCommissionFields(
	credentials: ShopeeCredentials,
	target: CommissionProbeTarget,
	fetcher: typeof fetch = fetch,
	control?: ShopeeCallControl
): Promise<CommissionFieldProbe> {
	const [result] = await probeCommissionFieldsBatch(credentials, [target], fetcher, control);
	const { nodeCount, rawNode, fields } = result!;
	return { nodeCount, rawNode, fields };
}
