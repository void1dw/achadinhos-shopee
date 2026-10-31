import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { jsonLdScript } from '../src/lib/json-ld.ts';

test('jsonLdScript gera uma tag JSON-LD válida', () => {
	const html = jsonLdScript({ '@context': 'https://schema.org', '@type': 'WebSite', name: 'Lia' });
	const match = html.match(/^<script type="application\/ld\+json">([\s\S]*)<\/script>$/);
	assert.ok(match);
	assert.deepEqual(JSON.parse(match[1]), {
		'@context': 'https://schema.org',
		'@type': 'WebSite',
		name: 'Lia'
	});
});

test('jsonLdScript escapa "<" e não deixa o conteúdo fechar a tag', () => {
	const html = jsonLdScript({ name: '</script><img src=x onerror=alert(1)>' });
	const inner = html.slice('<script type="application/ld+json">'.length, -'</script>'.length);
	assert.equal(inner.includes('<'), false);
	assert.equal(html.match(/<\/script>/g)?.length, 1);
	assert.equal(JSON.parse(inner).name, '</script><img src=x onerror=alert(1)>');
});

test('jsonLdScript neutraliza comentários HTML e preserva acentos e aspas', () => {
	const name = '<!-- x --> Início "ofertas" & cupons';
	const html = jsonLdScript({ name });
	const inner = html.slice('<script type="application/ld+json">'.length, -'</script>'.length);
	assert.equal(inner.includes('<!--'), false);
	assert.equal(JSON.parse(inner).name, name);
});

test('as páginas usam jsonLdScript em vez de montar a tag JSON-LD manualmente', () => {
	const root = fileURLToPath(new URL('../src/routes/', import.meta.url));
	for (const file of ['+page.svelte', 'categoria/[slug]/+page.svelte']) {
		const source = readFileSync(join(root, file), 'utf8');
		assert.match(source, /\{@html jsonLdScript\(structuredData\)\}/, file);
		assert.doesNotMatch(source, /application\/ld\+json/, `${file} monta a tag manualmente`);
	}
});
