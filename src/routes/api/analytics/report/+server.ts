import { env } from 'cloudflare:workers';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	Ga4ReportingError,
	getGa4Reports,
	type DateRange
} from '../../../../lib/server/ga4-reporting';

const MAX_RANGE_DAYS = 90;
const responseHeaders = {
	'cache-control': 'private, no-store',
	vary: 'Authorization'
};

function jsonResponse(body: unknown, status = 200): Response {
	return json(body, { status, headers: responseHeaders });
}

function isValidDate(value: string): boolean {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
	const date = new Date(`${value}T00:00:00.000Z`);
	return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function dateRange(url: URL): DateRange | null {
	const today = new Date();
	const defaultEnd = today.toISOString().slice(0, 10);
	today.setUTCDate(today.getUTCDate() - 29);
	const defaultStart = today.toISOString().slice(0, 10);
	const startDate = url.searchParams.get('startDate') ?? defaultStart;
	const endDate = url.searchParams.get('endDate') ?? defaultEnd;
	if (!isValidDate(startDate) || !isValidDate(endDate) || startDate > endDate) return null;
	const duration =
		(Date.parse(`${endDate}T00:00:00.000Z`) - Date.parse(`${startDate}T00:00:00.000Z`)) /
			86_400_000 +
		1;
	if (duration > MAX_RANGE_DAYS) return null;
	return { startDate, endDate };
}

function matchesSecret(provided: string, expected: string): boolean {
	let difference = provided.length ^ expected.length;
	const length = Math.max(provided.length, expected.length);
	for (let index = 0; index < length; index++) {
		difference |= (provided.charCodeAt(index) || 0) ^ (expected.charCodeAt(index) || 0);
	}
	return difference === 0;
}

export const GET: RequestHandler = async ({ request, url }) => {
	if (!env?.GA4_DASHBOARD_TOKEN) {
		return jsonResponse({ error: 'GA4 reporting access is not configured.' }, 503);
	}

	const authorization = request.headers.get('authorization') ?? '';
	const providedToken = authorization.startsWith('Bearer ')
		? authorization.slice('Bearer '.length)
		: '';
	if (!providedToken || !matchesSecret(providedToken, env.GA4_DASHBOARD_TOKEN)) {
		return jsonResponse({ error: 'Unauthorized.' }, 401);
	}

	const range = dateRange(url);
	if (!range) {
		return jsonResponse(
			{
				error: 'Invalid date range. Use ISO dates and a maximum inclusive range of 90 days.'
			},
			400
		);
	}

	try {
		const reports = await getGa4Reports(env, range);
		return jsonResponse({ dateRange: range, reports });
	} catch (error) {
		if (error instanceof Ga4ReportingError) {
			if (error.status === 502) console.error(error.message);
			return jsonResponse({ error: error.message }, error.status);
		}
		console.error('Unexpected GA4 reporting failure.');
		return jsonResponse({ error: 'GA4 reporting request failed.' }, 502);
	}
};
