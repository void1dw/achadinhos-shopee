import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
	CatalogAddInputError,
	matchesCatalogAddPreviewHash,
	shopeeRevalidator,
	validateCatalogAddSelections,
	type CatalogAddPreview
} from '../src/lib/server/shopee/catalog-add.ts';

const route = readFileSync(
	new URL('../src/routes/admin/products/add/+page.server.ts', import.meta.url),
	'utf8'
);

test('validates catalog selection limits and Shopee ids', () => {
	assert.throws(() => validateCatalogAddSelections([]), CatalogAddInputError);
	assert.throws(
		() =>
			validateCatalogAddSelections(
				Array.from({ length: 11 }, (_, i) => ({
					itemId: String(i + 1),
					shopId: '2',
					category: 'Casa'
				}))
			),
		CatalogAddInputError
	);
	assert.throws(
		() => validateCatalogAddSelections([{ itemId: 'invalid', shopId: '2', category: 'Casa' }]),
		CatalogAddInputError
	);
	assert.equal(
		validateCatalogAddSelections([{ itemId: '1', shopId: '2', category: ' Casa ' }])[0]?.category,
		'Casa'
	);
});

test('preview confirmation compares its revalidated hash', () => {
	const preview = { items: [], blocked: [], hash: 'current' } as CatalogAddPreview;
	assert.equal(matchesCatalogAddPreviewHash('current', preview), true);
	assert.equal(matchesCatalogAddPreviewHash('stale', preview), false);
	assert.equal(matchesCatalogAddPreviewHash(null, preview), false);
});

test('Shopee revalidator uses only its fetcher and never calls Google endpoints', async () => {
	const calls: string[] = [];
	const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
		calls.push(`${String(input)} ${String(init?.body ?? '')}`);
		const body = JSON.parse(String(init?.body)) as { query: string };
		const aliases = [...body.query.matchAll(/(p\d+): productOfferV2/g)].map((match) => match[1]!);
		return Response.json({
			data: Object.fromEntries(aliases.map((alias) => [alias, { nodes: [], pageInfo: {} }]))
		});
	}) as typeof fetch;
	const result = await shopeeRevalidator(
		{ SHOPEE_APP_ID: '12345', SHOPEE_APP_SECRET: 'secret' },
		fetcher
	)([{ itemId: '123', shopId: '456' }]);
	assert.equal(result.size, 0);
	assert.equal(calls.length, 1);
	assert.ok(calls.every((call) => !/googleapis|google\.com/i.test(call)));
});

test('every add route handler requires authentication and same-origin writes', () => {
	assert.match(
		route,
		/export const load[\s\S]*?authenticated\(cookies\)[\s\S]*?redirect\(303, '\/admin\/login'\)/
	);
	assert.equal(
		[...route.matchAll(/if \(!\(await authenticated\(cookies\)\)\) return fail\(401/g)].length,
		2
	);
	assert.equal([...route.matchAll(/if \(!isSameOrigin\(request\)\) return fail\(403/g)].length, 2);
	assert.match(route, /matchesCatalogAddPreviewHash\(expectedHash, preview\)/);
});
