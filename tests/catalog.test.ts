import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
	catalogHref,
	parseCatalogQuery,
	queryCatalog,
	splitProducts,
	CATALOG_PAGE_SIZE
} from '../src/lib/catalog.ts';
import { ACHADINHO_MIN_DISCOUNT, isAchadinho, toShowcase } from '../src/lib/products.ts';
import type { Product } from '../src/lib/types.ts';

function product(
	id: string,
	price: number,
	previousPrice?: number,
	name = `Produto ${id}`
): Product {
	return {
		id,
		name,
		price,
		previousPrice,
		category: 'Eletrônicos',
		image: 'https://example.com/a.jpg',
		url: 'https://s.shopee.com.br/x'
	};
}

test('Achadinho é desconto de 20% ou mais, sem recalcular a curadoria', () => {
	assert.equal(ACHADINHO_MIN_DISCOUNT, 20);
	assert.equal(isAchadinho(product('a', 80, 100)), true);
	assert.equal(isAchadinho(product('b', 90, 100)), false);
	assert.equal(isAchadinho(product('c', 80.5, 100)), false);
	assert.equal(isAchadinho(product('d', 50)), false);
	assert.equal(isAchadinho(product('e', 120, 100)), false);
});

test('a home recebe só Achadinhos e os contadores cobrem os dois conjuntos', () => {
	const products = [
		product('a', 50, 100),
		product('b', 95, 100),
		product('c', 70, 100),
		product('d', 10)
	];
	const { achadinhos, counts } = splitProducts(products);
	assert.deepEqual(
		achadinhos.map((item) => item.id),
		['a', 'c']
	);
	assert.deepEqual(counts, { catalog: 4, achadinhos: 2 });
});

test('produtos sem categoria aprovada não entram em nenhum dos totais', () => {
	const unknown = { ...product('x', 10, 100), category: 'Categoria inexistente 123' };
	const { counts } = splitProducts([product('a', 50, 100), unknown]);
	assert.deepEqual(counts, { catalog: 1, achadinhos: 1 });
});

test('o catálogo contém Achadinhos e os demais, e busca por qualquer ordem de palavras', () => {
	const showcase = toShowcase([
		product('a', 50, 100, 'Fone Bluetooth Pro'),
		product('b', 95, 100, 'Cabo USB longo'),
		product('c', 20, undefined, 'Bluetooth fone infantil')
	]);
	const all = queryCatalog(showcase, parseCatalogQuery(new URLSearchParams()));
	assert.equal(all.total, 3);
	const found = queryCatalog(showcase, parseCatalogQuery(new URLSearchParams('q=bluetooth fone')));
	assert.deepEqual(found.items.map((item) => item.id).sort(), ['a', 'c']);
});

test('ordenação por preço e paginação respeitam o tamanho da página', () => {
	const items = toShowcase(
		Array.from({ length: CATALOG_PAGE_SIZE + 5 }, (_, i) => product(`p${i}`, i + 1))
	);
	const first = queryCatalog(items, parseCatalogQuery(new URLSearchParams('ordem=maior-preco')));
	assert.equal(first.items.length, CATALOG_PAGE_SIZE);
	assert.equal(first.pageCount, 2);
	assert.equal(first.items[0].price, CATALOG_PAGE_SIZE + 5);
	const second = queryCatalog(items, parseCatalogQuery(new URLSearchParams('pagina=2')));
	assert.equal(second.items.length, 5);
	const beyond = queryCatalog(items, parseCatalogQuery(new URLSearchParams('pagina=99')));
	assert.equal(beyond.page, 2);
});

test('filtro de categoria considera a hierarquia', () => {
	const items = toShowcase([product('a', 10), { ...product('b', 10), category: 'Moda' }]);
	const result = queryCatalog(items, {
		q: '',
		category: items.find((item) => item.id === 'b')!.categoryPath[0],
		sort: 'recentes',
		page: 1
	});
	assert.deepEqual(
		result.items.map((item) => item.id),
		['b']
	);
});

test('parâmetros inválidos caem nos valores padrão e os links omitem o padrão', () => {
	const query = parseCatalogQuery(new URLSearchParams('ordem=hack&pagina=-3&q=%20%20'));
	assert.deepEqual(query, { q: '', category: '', sort: 'recentes', page: 1 });
	assert.equal(catalogHref(query), '/catalogo');
	assert.equal(
		catalogHref({ ...query, q: 'fone', sort: 'menor-preco' }, { page: 3 }),
		'/catalogo?q=fone&ordem=menor-preco&pagina=3'
	);
});
