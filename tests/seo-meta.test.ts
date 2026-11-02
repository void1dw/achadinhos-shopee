import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { isIndexableCategory, MIN_CATEGORY_PRODUCTS } from '../src/lib/category-pages.ts';
import { SOCIAL_IMAGE } from '../src/lib/seo.ts';

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url));

test('imagem social é um JPEG de 1200x630 em static/', () => {
	const jpeg = read(`static${SOCIAL_IMAGE.path}`);
	assert.deepEqual([...jpeg.subarray(0, 2)], [0xff, 0xd8]);
	// Procura o marcador SOF0/SOF2 para ler altura e largura.
	let offset = 2;
	while (offset < jpeg.length) {
		const marker = jpeg[offset + 1];
		const length = jpeg.readUInt16BE(offset + 2);
		if (marker === 0xc0 || marker === 0xc2) {
			assert.equal(jpeg.readUInt16BE(offset + 5), SOCIAL_IMAGE.height);
			assert.equal(jpeg.readUInt16BE(offset + 7), SOCIAL_IMAGE.width);
			return;
		}
		offset += 2 + length;
	}
	assert.fail('Marcador SOF não encontrado no JPEG.');
});

test('categoria só é indexável com o mínimo de produtos da navegação', () => {
	assert.equal(isIndexableCategory(MIN_CATEGORY_PRODUCTS - 1), false);
	assert.equal(isIndexableCategory(MIN_CATEGORY_PRODUCTS), true);
	assert.equal(isIndexableCategory(0), false);
});

test('páginas públicas usam a imagem social grande, Twitter large card e JSON-LD', () => {
	for (const file of [
		'src/routes/+page.svelte',
		'src/routes/catalogo/+page.svelte',
		'src/routes/categoria/[slug]/+page.svelte'
	]) {
		const source = read(file).toString('utf8');
		assert.match(source, /SOCIAL_IMAGE\.path/, file);
		assert.match(source, /content="summary_large_image"/, file);
		assert.match(source, /og:image:width/, file);
		assert.doesNotMatch(source, /\/lia\.jpg/, file);
		assert.match(source, /\{@html jsonLdScript\(structuredData\)\}/, file);
	}
});

test('home e categorias não serializam todos os produtos no HTML', () => {
	for (const file of [
		'src/routes/+page.server.ts',
		'src/routes/categoria/[slug]/+page.server.ts'
	]) {
		assert.match(read(file).toString('utf8'), /INITIAL_PRODUCT_COUNT/, file);
	}
});
