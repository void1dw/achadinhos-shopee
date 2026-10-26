const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const DATA_API_URL = 'https://analyticsdata.googleapis.com/v1beta';
const DATA_API_SCOPE = 'https://www.googleapis.com/auth/analytics.readonly';

export type DateRange = {
	startDate: string;
	endDate: string;
};

type ReportRow = Record<string, string | number>;

type ReportRequest = {
	dateRanges: DateRange[];
	dimensions: { name: string }[];
	metrics: { name: string }[];
	dimensionFilter?: {
		filter: {
			fieldName: string;
			stringFilter: { matchType: 'EXACT'; value: string };
		};
	};
	limit: string;
};

type ReportResponse = {
	dimensionHeaders?: { name: string }[];
	metricHeaders?: { name: string }[];
	rows?: {
		dimensionValues?: { value: string }[];
		metricValues?: { value: string }[];
	}[];
	rowCount?: number;
};

export type Ga4Reports = {
	daily: ReportRow[];
	acquisition: ReportRow[];
	productSelections: ReportRow[];
	affiliateProducts: ReportRow[];
	affiliateDomains: ReportRow[];
	categoryInterest: ReportRow[];
};

export class Ga4ReportingError extends Error {
	constructor(
		message: string,
		readonly status: number
	) {
		super(message);
		this.name = 'Ga4ReportingError';
	}
}

function encodeBase64Url(value: Uint8Array | string): string {
	const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value;
	let binary = '';
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function decodePrivateKey(pem: string): ArrayBuffer {
	const base64 = pem
		.replace(/\\n/g, '\n')
		.replace(/-----BEGIN PRIVATE KEY-----/g, '')
		.replace(/-----END PRIVATE KEY-----/g, '')
		.replace(/\s/g, '');
	const binary = atob(base64);
	const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
	return bytes.buffer;
}

async function createServiceAssertion(email: string, privateKeyPem: string): Promise<string> {
	const now = Math.floor(Date.now() / 1000);
	const header = encodeBase64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
	const payload = encodeBase64Url(
		JSON.stringify({
			iss: email,
			scope: DATA_API_SCOPE,
			aud: TOKEN_URL,
			iat: now,
			exp: now + 3600
		})
	);
	const unsignedToken = `${header}.${payload}`;
	const key = await crypto.subtle.importKey(
		'pkcs8',
		decodePrivateKey(privateKeyPem),
		{ name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
		false,
		['sign']
	);
	const signature = await crypto.subtle.sign(
		'RSASSA-PKCS1-v1_5',
		key,
		new TextEncoder().encode(unsignedToken)
	);
	return `${unsignedToken}.${encodeBase64Url(new Uint8Array(signature))}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

async function fetchAccessToken(email: string, privateKey: string): Promise<string> {
	const assertion = await createServiceAssertion(email, privateKey);
	const response = await fetch(TOKEN_URL, {
		method: 'POST',
		headers: { 'content-type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams({
			grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
			assertion
		})
	});

	const result: unknown = await response.json().catch(() => null);
	if (!response.ok || !isRecord(result) || typeof result.access_token !== 'string') {
		throw new Ga4ReportingError('Google OAuth token request failed.', 502);
	}
	return result.access_token;
}

async function runReport(
	propertyId: string,
	accessToken: string,
	report: ReportRequest
): Promise<ReportRow[]> {
	const response = await fetch(
		`${DATA_API_URL}/properties/${encodeURIComponent(propertyId)}:runReport`,
		{
			method: 'POST',
			headers: {
				authorization: `Bearer ${accessToken}`,
				'content-type': 'application/json'
			},
			body: JSON.stringify(report)
		}
	);
	const result: unknown = await response.json().catch(() => null);
	if (!response.ok || !isRecord(result)) {
		throw new Ga4ReportingError('Google Analytics Data API report request failed.', 502);
	}

	const data = result as ReportResponse;
	const dimensions = data.dimensionHeaders?.map((header) => header.name) ?? [];
	const metrics = data.metricHeaders?.map((header) => header.name) ?? [];
	return (data.rows ?? []).map((row) => {
		const values: ReportRow = {};
		dimensions.forEach((name, index) => {
			values[name] = row.dimensionValues?.[index]?.value ?? '';
		});
		metrics.forEach((name, index) => {
			const value = Number(row.metricValues?.[index]?.value ?? 0);
			values[name] = Number.isFinite(value) ? value : 0;
		});
		return values;
	});
}

function eventFilter(eventName: string): ReportRequest['dimensionFilter'] {
	return {
		filter: {
			fieldName: 'eventName',
			stringFilter: { matchType: 'EXACT', value: eventName }
		}
	};
}

export async function getGa4Reports(
	env: Pick<
		Cloudflare.Env,
		'GA4_PROPERTY_ID' | 'GA4_SERVICE_ACCOUNT_EMAIL' | 'GA4_SERVICE_ACCOUNT_PRIVATE_KEY'
	>,
	dateRange: DateRange
): Promise<Ga4Reports> {
	const {
		GA4_PROPERTY_ID: propertyId,
		GA4_SERVICE_ACCOUNT_EMAIL: email,
		GA4_SERVICE_ACCOUNT_PRIVATE_KEY: privateKey
	} = env;
	if (!propertyId || !/^\d+$/.test(propertyId) || !email || !privateKey) {
		throw new Ga4ReportingError('GA4 reporting credentials are not configured.', 503);
	}

	const accessToken = await fetchAccessToken(email, privateKey);
	const range = { dateRanges: [dateRange] };
	const [daily, acquisition, productSelections, affiliateProducts, affiliateDomains, categoryInterest] =
		await Promise.all([
			runReport(propertyId, accessToken, {
				...range,
				dimensions: [{ name: 'date' }],
				metrics: [
					{ name: 'screenPageViews' },
					{ name: 'sessions' },
					{ name: 'totalUsers' }
				],
				limit: '100'
			}),
			runReport(propertyId, accessToken, {
				...range,
				dimensions: [{ name: 'sessionSource' }, { name: 'sessionMedium' }],
				metrics: [{ name: 'sessions' }, { name: 'totalUsers' }],
				limit: '50'
			}),
			runReport(propertyId, accessToken, {
				...range,
				dimensions: [
					{ name: 'itemId' },
					{ name: 'itemName' },
					{ name: 'itemCategory' }
				],
				metrics: [{ name: 'itemsClicked' }],
				limit: '100'
			}),
			runReport(propertyId, accessToken, {
				...range,
				dimensions: [{ name: 'customEvent:affiliate_product_id' }],
				metrics: [{ name: 'eventCount' }],
				dimensionFilter: eventFilter('affiliate_click'),
				limit: '100'
			}),
			runReport(propertyId, accessToken, {
				...range,
				dimensions: [{ name: 'customEvent:link_domain' }],
				metrics: [{ name: 'eventCount' }],
				dimensionFilter: eventFilter('affiliate_click'),
				limit: '50'
			}),
			runReport(propertyId, accessToken, {
				...range,
				dimensions: [{ name: 'customEvent:category_name' }],
				metrics: [{ name: 'eventCount' }],
				dimensionFilter: eventFilter('select_category'),
				limit: '100'
			})
		]);

	return {
		daily,
		acquisition,
		productSelections,
		affiliateProducts,
		affiliateDomains,
		categoryInterest
	};
}
