import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const source = readFileSync(
	new URL('../src/routes/admin/shopee/candidates/+page.server.ts', import.meta.url),
	'utf8'
);

test('candidate page sets private no-store headers once per request lifecycle', () => {
	assert.match(source, /if \(request\.method === 'GET'\) \{\s*setHeaders\(responseHeaders\);/);
	assert.match(
		source,
		/collect:\s*async \(\{ cookies, request, setHeaders \}\) => \{\s*setHeaders\(responseHeaders\);/
	);
	assert.match(source, /function decideAction\([\s\S]*?\)\s*\{\s*setHeaders\(responseHeaders\);/);
	assert.match(source, /'cache-control': 'private, no-store'/);
});
