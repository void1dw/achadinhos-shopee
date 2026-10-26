const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const DATA_API_URL = 'https://analyticsdata.googleapis.com/v1beta';
const DATA_API_SCOPE = 'https://www.googleapis.com/auth/analytics.readonly';

export type DateRange = {
	startDate: string;
	endDate: string;
};

type ReportRow = Record<string, string | number>;

type ReportRequest = {
	dateRanges?: DateRange[];
	dimensions: { name: string }[];
	metrics: { name: string }[];
	dimensionFilter?: {
		filter?: {
			fieldName: string;
			stringFilter: { matchType: 'EXACT'; value: string };
		};
		orGroup?: {
			expressions: {
				filter: {
					fieldName: string;
					stringFilter: { matchType: 'EXACT'; value: string };
				};
			}[];
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

export type Ga4ReportSection =
	| 'summary'
	| 'daily'
	| 'dailyCommercialEvents'
	| 'acquisition'
	| 'productSelections'
	| 'affiliateProducts'
	| 'affiliateDomains'
	| 'categoryInterest';

export type Ga4Reports = Record<Ga4ReportSection, ReportRow[]> & {
	errors: Partial<Record<Ga4ReportSection, string>>;
};

// A failure limited to one report (e.g. an unregistered custom dimension).
class Ga4SectionError extends Error {}

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
	report: ReportRequest,
	method: 'runReport' | 'runRealtimeReport' = 'runReport'
): Promise<ReportRow[]> {
	const response = await fetch(
		`${DATA_API_URL}/properties/${encodeURIComponent(propertyId)}:${method}`,
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
		// Authentication, authorization and property errors affect every report and must not look like missing data.
		if ([401, 403, 404].includes(response.status)) {
			throw new Ga4ReportingError(
				`Google Analytics Data API denied access to the property (HTTP ${response.status}).`,
				502
			);
		}
		const detail =
			isRecord(result) && isRecord(result.error) && typeof result.error.message === 'string'
				? result.error.message.slice(0, 200)
				: '';
		throw new Ga4SectionError(
			`Data API HTTP ${response.status}${detail ? `: ${detail}` : ''}`.trim()
		);
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

function eventFilterAny(eventNames: string[]): ReportRequest['dimensionFilter'] {
	return {
		orGroup: {
			expressions: eventNames.map((eventName) => ({
				filter: {
					fieldName: 'eventName',
					stringFilter: { matchType: 'EXACT', value: eventName }
				}
			}))
		}
	};
}

type Ga4Env = Pick<
	Cloudflare.Env,
	'GA4_PROPERTY_ID' | 'GA4_SERVICE_ACCOUNT_EMAIL' | 'GA4_SERVICE_ACCOUNT_PRIVATE_KEY'
>;

async function authenticate(env: Ga4Env): Promise<{ propertyId: string; accessToken: string }> {
	const {
		GA4_PROPERTY_ID: propertyId,
		GA4_SERVICE_ACCOUNT_EMAIL: email,
		GA4_SERVICE_ACCOUNT_PRIVATE_KEY: privateKey
	} = env;
	if (!propertyId || !/^\d+$/.test(propertyId) || !email || !privateKey) {
		throw new Ga4ReportingError('GA4 reporting credentials are not configured.', 503);
	}
	return { propertyId, accessToken: await fetchAccessToken(email, privateKey) };
}

export type Ga4Realtime = {
	activeUsers: number;
	screenPageViews: number;
	events: { eventName: string; eventCount: number }[];
	fetchedAt: string;
};

// Realtime covers the last 30 minutes. It does not support customEvent:* dimensions,
// so per-product and per-domain breakdowns are only available in the historical reports.
export async function getGa4Realtime(env: Ga4Env): Promise<Ga4Realtime> {
	const { propertyId, accessToken } = await authenticate(env);
	const [totals, events] = await Promise.all([
		runReport(
			propertyId,
			accessToken,
			{
				dimensions: [],
				metrics: [{ name: 'activeUsers' }, { name: 'screenPageViews' }],
				limit: '1'
			},
			'runRealtimeReport'
		),
		runReport(
			propertyId,
			accessToken,
			{
				dimensions: [{ name: 'eventName' }],
				metrics: [{ name: 'eventCount' }],
				limit: '50'
			},
			'runRealtimeReport'
		)
	]);
	return {
		activeUsers: Number(totals[0]?.activeUsers ?? 0),
		screenPageViews: Number(totals[0]?.screenPageViews ?? 0),
		events: events
			.map((row) => ({ eventName: String(row.eventName), eventCount: Number(row.eventCount) }))
			.sort((left, right) => right.eventCount - left.eventCount),
		fetchedAt: new Date().toISOString()
	};
}

export async function getGa4Reports(env: Ga4Env, dateRange: DateRange): Promise<Ga4Reports> {
	const { propertyId, accessToken } = await authenticate(env);
	const range = { dateRanges: [dateRange] };
	const requests: Record<Ga4ReportSection, ReportRequest> = {
		summary: {
			...range,
			dimensions: [],
			metrics: [{ name: 'screenPageViews' }, { name: 'sessions' }, { name: 'totalUsers' }],
			limit: '1'
		},
		daily: {
			...range,
			dimensions: [{ name: 'date' }],
			metrics: [{ name: 'screenPageViews' }, { name: 'sessions' }, { name: 'totalUsers' }],
			limit: '100'
		},
		dailyCommercialEvents: {
			...range,
			dimensions: [{ name: 'date' }, { name: 'eventName' }],
			metrics: [{ name: 'eventCount' }],
			dimensionFilter: eventFilterAny(['select_item', 'affiliate_click', 'select_category']),
			limit: '300'
		},
		acquisition: {
			...range,
			dimensions: [{ name: 'sessionSource' }, { name: 'sessionMedium' }],
			metrics: [{ name: 'sessions' }, { name: 'totalUsers' }],
			limit: '50'
		},
		productSelections: {
			...range,
			dimensions: [{ name: 'itemId' }, { name: 'itemName' }, { name: 'itemCategory' }],
			metrics: [{ name: 'itemsClickedInList' }],
			dimensionFilter: eventFilter('select_item'),
			limit: '100'
		},
		affiliateProducts: {
			...range,
			dimensions: [
				{ name: 'customEvent:affiliate_product_id' },
				{ name: 'customEvent:affiliate_product_name' },
				{ name: 'customEvent:affiliate_product_category' }
			],
			metrics: [{ name: 'eventCount' }],
			dimensionFilter: eventFilter('affiliate_click'),
			limit: '100'
		},
		affiliateDomains: {
			...range,
			dimensions: [{ name: 'customEvent:link_domain' }],
			metrics: [{ name: 'eventCount' }],
			dimensionFilter: eventFilter('affiliate_click'),
			limit: '50'
		},
		categoryInterest: {
			...range,
			dimensions: [{ name: 'customEvent:category_name' }],
			metrics: [{ name: 'eventCount' }],
			dimensionFilter: eventFilter('select_category'),
			limit: '100'
		}
	};

	const sections = Object.keys(requests) as Ga4ReportSection[];
	const settled = await Promise.allSettled(
		sections.map((section) => runReport(propertyId, accessToken, requests[section]))
	);
	const reports = { errors: {} } as Ga4Reports;
	settled.forEach((outcome, index) => {
		const section = sections[index];
		if (outcome.status === 'fulfilled') {
			reports[section] = outcome.value;
			return;
		}
		if (!(outcome.reason instanceof Ga4SectionError)) throw outcome.reason;
		console.error(`GA4 report "${section}" unavailable: ${outcome.reason.message}`);
		reports[section] = [];
		reports.errors[section] = outcome.reason.message;
	});
	return reports;
}
