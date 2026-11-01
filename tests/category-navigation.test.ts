import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
	ALSO_LISTED_IN,
	CATEGORY_BY_ID,
	categoryChain,
	isInCategory
} from '../src/lib/categories.ts';
import { RULES } from '../src/lib/category-rules.ts';
import {
	categoryPagesWithProducts,
	categoryProducts,
	categoryTree,
	findCategoryPage,
	isDescendantOf
} from '../src/lib/category-pages.ts';
import { toShowcase } from '../src/lib/products.ts';
import { parseProducts } from '../src/lib/server/sheets.ts';

const HEADER = 'id,nome,categoria,preco,preco_anterior,imagem,url';
const row = (id: string, name: string, category: string) =>
	`${id},${name},${category},"R$ 10,00",,https://img.example/a.jpg,https://shope.ee/abc`;
const showcase = (...rows: string[]) =>
	toShowcase(parseProducts([HEADER, ...rows].join('\n')).items);

// Várias linhas por grupo para que as contagens e o piso de produtos por categoria sejam reais.
const many = (prefix: string, name: string, category: string, count: number) =>
	Array.from({ length: count }, (_, index) =>
		row(`${prefix}${index}`, `${name} ${index}`, category)
	);

const CATALOG = showcase(
	...many('sf', 'Sandália Rasteira Feminina', 'Sapatos Femininos', 6),
	...many('sm', 'Tênis Casual Masculino', 'Sapatos Masculinos', 6),
	...many('bf', 'Bolsa Transversal', 'Bolsas Femininas', 6),
	...many('bm', 'Pochete Esportiva', 'Bolsas Masculinas', 6),
	...many('rf', 'Vestido Longo Estampado', 'Roupas Femininas', 6),
	...many('rm', 'Camiseta Básica Algodão', 'Roupas Masculinas', 6),
	...many('ib', 'Body Bebê Algodão', 'Moda Infantil', 6),
	...many('mb', 'Mamadeira Anticólica', 'Mãe e Bebê', 6)
);

const ids = (items: { id: string }[]) => new Set(items.map((item) => item.id));
const prefixed = (items: { id: string }[], prefix: string) =>
	items.filter((item) => item.id.startsWith(prefix));

test('listagem dupla só aponta para grupos e pais que existem, em ramos diferentes', () => {
	for (const [child, parents] of Object.entries(ALSO_LISTED_IN)) {
		assert.ok(CATEGORY_BY_ID.has(child), `${child}: grupo inexistente`);
		for (const parent of parents) {
			assert.ok(CATEGORY_BY_ID.has(parent), `${child}: pai ${parent} inexistente`);
			assert.ok(!categoryChain(child).some((node) => node.id === parent), `${child}: já é filho`);
		}
	}
});

test('sapatos e bolsas femininos aparecem em Moda feminina; masculinos, em Moda masculina', () => {
	const sf = prefixed(CATALOG, 'sf');
	const sm = prefixed(CATALOG, 'sm');
	assert.equal(sf.length, 6);
	assert.deepEqual(sf[0].categoryPath, ['moda', 'moda-calcados', 'moda-calcados-femininos']);
	for (const product of sf) {
		assert.ok(isInCategory(product.categoryPath, 'moda-feminina'));
		assert.ok(isInCategory(product.categoryPath, 'moda-calcados'));
		assert.ok(!isInCategory(product.categoryPath, 'moda-masculina'));
	}
	for (const product of sm) {
		assert.ok(isInCategory(product.categoryPath, 'moda-masculina'));
		assert.ok(!isInCategory(product.categoryPath, 'moda-feminina'));
	}
	for (const product of prefixed(CATALOG, 'bf')) {
		assert.ok(isInCategory(product.categoryPath, 'moda-feminina'));
		assert.ok(!isInCategory(product.categoryPath, 'moda-masculina'));
	}
	for (const product of prefixed(CATALOG, 'bm')) {
		assert.ok(isInCategory(product.categoryPath, 'moda-masculina'));
		assert.ok(!isInCategory(product.categoryPath, 'moda-feminina'));
	}
});

test('a árvore de Moda lista Calçados e Bolsas dentro de cada público, com a contagem certa', () => {
	const moda = findCategoryPage('moda');
	assert.ok(moda);
	const tree = categoryTree(categoryProducts(CATALOG, moda), 'moda');
	const node = (slug: string) => tree.find((item) => item.slug === slug);

	const feminina = node('moda-feminina');
	assert.ok(feminina);
	const femininaChildren = feminina.children.map((child) => child.slug);
	assert.ok(femininaChildren.includes('moda-calcados-femininos'));
	assert.ok(femininaChildren.includes('moda-bolsas-femininas'));
	assert.ok(!femininaChildren.includes('moda-calcados-masculinos'));
	assert.equal(feminina.count, 18); // vestidos + sapatos + bolsas femininos
	assert.equal(
		feminina.children.find((child) => child.slug === 'moda-calcados-femininos')?.alsoListed,
		true
	);

	const masculina = node('moda-masculina');
	assert.ok(masculina);
	assert.equal(masculina.count, 18);
	assert.ok(masculina.children.some((child) => child.slug === 'moda-calcados-masculinos'));

	// O agrupamento por tipo continua existindo, sem marcar seus filhos como duplicados.
	const calcados = node('moda-calcados');
	assert.ok(calcados);
	assert.equal(calcados.count, 12);
	assert.ok(calcados.children.every((child) => child.alsoListed === undefined));
});

test('filtrar a página de Moda por Moda feminina devolve os sapatos, não só as roupas', () => {
	const moda = findCategoryPage('moda');
	assert.ok(moda);
	const items = categoryProducts(CATALOG, moda);
	const feminina = ids(items.filter((item) => isInCategory(item.categoryPath, 'moda-feminina')));
	for (const product of [...prefixed(CATALOG, 'sf'), ...prefixed(CATALOG, 'bf')]) {
		assert.ok(feminina.has(product.id), `${product.id} sumiu de Moda feminina`);
	}
	assert.ok(isDescendantOf('moda-calcados-femininos', 'moda'));
});

test('roupas de bebê entram também em Bebês e maternidade, sem sair de Moda infantil', () => {
	const bebe = prefixed(CATALOG, 'ib');
	assert.deepEqual(bebe[0].categoryPath, ['moda', 'moda-infantil', 'moda-infantil-bebe']);
	for (const product of bebe) {
		assert.ok(isInCategory(product.categoryPath, 'moda-infantil'));
		assert.ok(isInCategory(product.categoryPath, 'bebes'));
	}
	const page = findCategoryPage('bebes');
	assert.ok(page);
	const inPage = ids(categoryProducts(CATALOG, page));
	assert.equal(inPage.size, 12);
	const tree = categoryTree(categoryProducts(CATALOG, page), 'bebes');
	assert.ok(tree.some((item) => item.slug === 'moda-infantil-bebe' && item.count === 6));
	assert.ok(isDescendantOf('moda-infantil-bebe', 'bebes'));
	assert.ok(categoryPagesWithProducts(CATALOG).some((item) => item.slug === 'bebes'));
});

test('a listagem dupla não duplica produtos na lista de um departamento', () => {
	const moda = findCategoryPage('moda');
	assert.ok(moda);
	const items = categoryProducts(CATALOG, moda);
	assert.equal(items.length, ids(items).size);
});

test('roupas por público ganham grupo próprio pelo título, sem sair do público da planilha', () => {
	const shown = showcase(
		row('1', 'Vestido Longo Festa', 'Roupas Femininas'),
		row('2', 'Camiseta Oversized Algodão', 'Roupas Masculinas'),
		row('3', 'Kit 3 Cuecas Boxer', 'Roupas Masculinas'),
		row('4', 'Conjunto Infantil Menino Verão', 'Moda Infantil'),
		row('5', 'Roupa Qualquer Sem Pista', 'Roupas Femininas'),
		row('6', 'Camisa e Bermuda Casual', 'Roupas Masculinas')
	);
	const path = (id: string) => shown.find((item) => item.id === id)?.categoryPath;
	assert.deepEqual(path('1'), ['moda', 'moda-feminina', 'moda-feminina-vestidos']);
	assert.deepEqual(path('2'), ['moda', 'moda-masculina', 'moda-masculina-camisetas']);
	assert.deepEqual(path('3'), ['moda', 'moda-masculina', 'moda-masculina-cuecas']);
	assert.deepEqual(path('4'), ['moda', 'moda-infantil', 'moda-infantil-meninos']);
	assert.deepEqual(path('5'), ['moda', 'moda-feminina']);
	assert.deepEqual(path('6'), ['moda', 'moda-masculina']); // peças concorrentes: não adivinha
});

test('regra de público não vaza para outro público', () => {
	const shown = showcase(
		row('1', 'Calça Jeans Masculina Skinny', 'Roupas Masculinas'),
		row('2', 'Calça Jeans Feminina Wide Leg', 'Roupas Femininas')
	);
	const path = (id: string) => shown.find((item) => item.id === id)?.categoryPath;
	assert.deepEqual(path('1'), ['moda', 'moda-masculina', 'moda-masculina-calcas']);
	assert.deepEqual(path('2'), ['moda', 'moda-feminina', 'moda-feminina-calcas']);
});

test('Casa, Beleza e Saúde são detalhadas pelo título e ficam no departamento sem pista', () => {
	const shown = showcase(
		row('1', 'Jogo de Panelas Antiaderente 10 Peças', 'Casa e Construção'),
		row('2', 'Kit 4 Toalhas de Banho Felpudas', 'Casa e Construção'),
		row('3', 'Shampoo e Condicionador Hidratação', 'Beleza'),
		row('4', 'Protetor Solar Facial FPS 60', 'Beleza'),
		row('5', 'Pistola de Massagem Muscular', 'Saúde'),
		row('6', 'Objeto sem pista nenhuma', 'Casa e Construção')
	);
	const path = (id: string) => shown.find((item) => item.id === id)?.categoryPath;
	assert.deepEqual(path('1'), ['casa', 'casa-cozinha']);
	assert.deepEqual(path('2'), ['casa', 'casa-cama-mesa-banho']);
	assert.deepEqual(path('3'), ['beleza', 'beleza-cabelos']);
	assert.deepEqual(path('4'), ['beleza', 'beleza-pele']);
	assert.deepEqual(path('5'), ['saude', 'saude-massagem']);
	assert.deepEqual(path('6'), ['casa']);
});

test('regras "within" apontam para um grupo dentro da categoria da planilha que restringem', () => {
	for (const rule of RULES.filter((item) => item.within !== undefined)) {
		const within = rule.within as string;
		assert.ok(CATEGORY_BY_ID.has(within), `${rule.id}: within inexistente`);
		assert.ok(
			categoryChain(rule.target).some((node) => node.id === within),
			`${rule.id}: alvo fora de ${within}`
		);
		assert.ok(rule.refines, `${rule.id}: within só faz sentido em regra de detalhamento`);
	}
});

test('nenhum produto de calçado ou bolsa fica de fora do público correspondente', () => {
	const rules: [string, string][] = [
		['moda-calcados-femininos', 'moda-feminina'],
		['moda-bolsas-femininas', 'moda-feminina'],
		['moda-calcados-masculinos', 'moda-masculina'],
		['moda-bolsas-masculinas', 'moda-masculina']
	];
	for (const [group, audience] of rules) {
		const members = CATALOG.filter((item) => item.categoryPath.includes(group));
		assert.ok(members.length > 0, `${group}: sem produtos no catálogo de teste`);
		for (const product of members) {
			assert.ok(isInCategory(product.categoryPath, audience), `${product.id} fora de ${audience}`);
		}
	}
});
