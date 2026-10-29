import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
	CATEGORIES,
	categoryChain,
	isInCategory,
	resolveCategory,
	validateTaxonomy
} from '../src/lib/categories.ts';
import { CATEGORY_PAGES, legacyRedirectTarget } from '../src/lib/category-pages.ts';

test('a taxonomia é íntegra (ids únicos, pais válidos, até 3 níveis, sem ciclos)', () => {
	assert.deepEqual(validateTaxonomy(), []);
	assert.ok(CATEGORIES.every((node) => node.level >= 1 && node.level <= 3));
});

test('resolve primária, secundária e terciária', () => {
	const primary = resolveCategory('Moda');
	assert.equal(primary.status === 'ok' && primary.category.id, 'moda');
	const secondary = resolveCategory('Moda feminina');
	assert.equal(secondary.status === 'ok' && secondary.category.id, 'moda-feminina');
	const tertiary = resolveCategory('Lingerie');
	assert.equal(tertiary.status === 'ok' && tertiary.category.id, 'moda-feminina-lingerie');
	assert.deepEqual(tertiary.status === 'ok' && tertiary.path.map((node) => node.id), [
		'moda',
		'moda-feminina',
		'moda-feminina-lingerie'
	]);
});

test('organizadores de cozinha ficam em Casa > Organização', () => {
	const result = resolveCategory('Organizadores de cozinha');
	assert.equal(result.status === 'ok' && result.category.id, 'casa-organizacao-cozinha');
	assert.equal(result.status === 'ok' && result.path[0].id, 'casa');
});

test('aliases da planilha real caem na categoria correta', () => {
	const expected: Record<string, string> = {
		'Casa e Construção': 'casa',
		'Casa, Cozinha e Decoração': 'casa',
		'Roupas Femininas': 'moda-feminina',
		'Roupas Masculinas': 'moda-masculina',
		'Sapatos Masculinos': 'moda-calcados-masculinos',
		'Sapatos Femininos': 'moda-calcados-femininos',
		'Games e Consoles': 'eletronicos-games',
		'Jogos e Consoles': 'eletronicos-games',
		'Computadores e Acessórios': 'eletronicos-informatica',
		'Informática e Acessórios': 'eletronicos-informatica',
		'Celulares e Dispositivos': 'eletronicos-celulares',
		'Celulares e Acessórios': 'eletronicos-celulares',
		'Mãe e Bebê': 'bebes',
		'Animais Domésticos': 'pet-shop',
		'Pet Shop': 'pet-shop',
		'Beleza e Cuidados Pessoais': 'beleza',
		Áudio: 'eletronicos-audio',
		Eletrodomésticos: 'casa-eletrodomesticos',
		Saúde: 'saude'
	};
	for (const [raw, id] of Object.entries(expected)) {
		const result = resolveCategory(raw);
		assert.equal(result.status === 'ok' && result.category.id, id, raw);
	}
});

test('caixa, acento e plural não importam', () => {
	assert.equal(resolveCategory('  CELULARES  e acessorios ').status, 'ok');
	assert.equal(resolveCategory('Pets').status, 'ok');
});

test('categoria desconhecida nunca é classificada', () => {
	assert.equal(resolveCategory('Outros').status, 'unknown');
	assert.equal(resolveCategory('Coisas aleatórias').status, 'unknown');
	assert.equal(resolveCategory('').status, 'unknown');
});

test('nome repetido em dois pais é ambíguo, mas o caminho completo resolve', () => {
	assert.equal(resolveCategory('Calças').status, 'ambiguous');
	const full = resolveCategory('Moda masculina > Calças');
	assert.equal(full.status === 'ok' && full.category.id, 'moda-masculina-calcas');
});

test('alimentos é primária aprovada, mas sem página própria', () => {
	const resolution = resolveCategory('Alimentos e Bebidas');
	assert.equal(resolution.status, 'ok');
	assert.equal(
		resolveCategory('Bebidas').status === 'ok' && resolveCategory('Bebidas').path.length,
		2
	);
});

test('filtro hierárquico: a primária inclui todos os descendentes', () => {
	const path = categoryChain('moda-feminina-lingerie').map((node) => node.id);
	assert.ok(isInCategory(path, 'moda'));
	assert.ok(isInCategory(path, 'moda-feminina'));
	assert.ok(isInCategory(path, 'moda-feminina-lingerie'));
	assert.ok(!isInCategory(path, 'moda-masculina'));
});

test('páginas só existem para primárias aprovadas e os relacionados existem', () => {
	const slugs = new Set(CATEGORY_PAGES.map((page) => page.slug));
	for (const page of CATEGORY_PAGES) {
		const node = categoryChain(page.slug)[0];
		assert.equal(node.level, 1);
		assert.equal(node.status, 'approved');
		for (const related of page.related) assert.ok(slugs.has(related), `${page.slug} -> ${related}`);
	}
	assert.ok(!slugs.has('alimentos'));
});

test('slugs antigos redirecionam para a primária com filtro', () => {
	assert.deepEqual(legacyRedirectTarget('moda-feminina'), {
		primary: 'moda',
		sub: 'moda-feminina'
	});
	assert.deepEqual(legacyRedirectTarget('calcados'), { primary: 'moda', sub: 'moda-calcados' });
	assert.equal(legacyRedirectTarget('eletronicos'), undefined);
});
