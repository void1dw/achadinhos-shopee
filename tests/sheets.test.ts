import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parsePriceField, parseProducts } from '../src/lib/server/sheets.ts';
import { formatProductReport } from '../src/lib/server/product-report.ts';
import { discountPercent, toShowcase } from '../src/lib/products.ts';
import { sitemapCategorySlugs } from '../src/lib/category-pages.ts';

const HEADER = 'id,nome,categoria,preco,preco_anterior,imagem,url';
const IMG = 'https://img.example/a.jpg';
const URL_ = 'https://shope.ee/abc';

function sheet(...rows: string[]): string {
	return [HEADER, ...rows].join('\n');
}

test('parsePriceField: valor único, intervalo e inválidos', () => {
	assert.deepEqual(parsePriceField('R$ 29,90'), { min: 29.9 });
	assert.deepEqual(parsePriceField('R$ 27,97 - R$ 56,90'), { min: 27.97, max: 56.9 });
	assert.deepEqual(parsePriceField('R$ 56,90 - R$ 27,97'), { min: 27.97, max: 56.9 });
	assert.deepEqual(parsePriceField('R$ 10,00 - R$ 10,00'), { min: 10 });
	assert.equal(parsePriceField('R$ 1 - R$ 2 - R$ 3'), undefined);
	assert.equal(parsePriceField('abc'), undefined);
	assert.equal(parsePriceField('R$ 0,00'), undefined);
	assert.equal(parsePriceField('R$ 10,00 -'), undefined);
});

test('intervalo vira "a partir de" com o menor valor e preserva o máximo', () => {
	const { items } = parseProducts(
		sheet(`1,Fone,Áudio,"R$ 27,97 - R$ 56,90","R$ 60,00 - R$ 90,00",${IMG},${URL_}`)
	);
	assert.equal(items[0].price, 27.97);
	assert.equal(items[0].priceMax, 56.9);
	assert.equal(items[0].previousPrice, 60);
});

test('preço original vazio é aceito, sem desconto', () => {
	const out = parseProducts(sheet(`1,Fone,Áudio,"R$ 29,90",,${IMG},${URL_}`));
	assert.equal(out.items.length, 1);
	assert.equal(out.counts.emptyPreviousPrice, 1);
	assert.equal(toShowcase(out.items)[0].discountPercent, null);
});

test('preço atual vazio, nome vazio, imagem e link inválidos rejeitam o produto', () => {
	const out = parseProducts(
		sheet(
			`1,Fone,Áudio,,"R$ 10,00",${IMG},${URL_}`,
			`2,,Áudio,"R$ 10,00",,${IMG},${URL_}`,
			`3,Cabo,Áudio,"R$ 10,00",,,${URL_}`,
			`4,Cabo,Áudio,"R$ 10,00",,${IMG},javascript:alert(1)`
		)
	);
	assert.equal(out.items.length, 0);
	assert.equal(out.counts.rejected, 4);
	const problems = out.issues.map((issue) => issue.message).join('|');
	assert.match(problems, /PREÇO ATUAL VAZIO/);
	assert.match(problems, /NOME VAZIO/);
	assert.match(problems, /IMAGEM VAZIA/);
	assert.match(problems, /LINK DE AFILIADO COM URL INVÁLIDA/);
});

test('categoria desconhecida ou pendente rejeita e entra no resumo', () => {
	const out = parseProducts(
		sheet(
			`1,Item,Outros,"R$ 10,00",,${IMG},${URL_}`,
			`2,Item,Alimentos e Bebidas,"R$ 10,00",,${IMG},${URL_}`
		)
	);
	assert.equal(out.items.length, 0);
	assert.equal(out.unclassified.get('Outros'), 1);
	assert.equal(out.unclassified.get('Alimentos e Bebidas'), 1);
});

test('IDs duplicados: fica a categoria mais específica e o relatório não repete o ID', () => {
	const out = parseProducts(
		sheet(
			`7,Panela,Casa e Construção,"R$ 20,00",,${IMG},${URL_}`,
			`7,Panela,Panelas,"R$ 20,00",,${IMG},${URL_}`,
			`9,Cabo,Outros,"R$ 5,00",,${IMG},${URL_}`
		)
	);
	assert.equal(out.items.length, 1);
	assert.equal(out.items[0].category, 'Panelas');
	const report = formatProductReport(out);
	assert.equal(report.match(/^ID: 7$/gm)?.length, 1);
	assert.match(report, /^ID: 9$/m);
	assert.match(report, /^LINHA: 4$/m);
});

test('relatório: formato, coluna e ausência de IDs repetidos', () => {
	const out = parseProducts(sheet(`15,Mouse,Informática,,,${IMG},${URL_}`));
	const report = formatProductReport(out);
	assert.match(
		report,
		/ID: 15\nLINHA: 2\nNOME: Mouse\nPROBLEMA: PREÇO ATUAL VAZIO\nCAMPO: preco \(coluna D\)/
	);
});

test('número de linha considera linhas vazias da planilha', () => {
	const out = parseProducts(`${HEADER}\n\n1,Mouse,Informática,,,${IMG},${URL_}\n`);
	assert.equal(out.issues.find((issue) => issue.id === '1')?.row, 3);
});

test('desconto só entre valores comparáveis', () => {
	const base = { id: '1', name: 'x', category: 'x', image: '', url: '' };
	assert.equal(discountPercent({ ...base, price: 50, previousPrice: 100 }), 50);
	assert.equal(discountPercent({ ...base, price: 50, priceMax: 80, previousPrice: 100 }), null);
	assert.equal(
		discountPercent({
			...base,
			price: 50,
			priceMax: 80,
			previousPrice: 100,
			previousPriceMax: 120
		}),
		50
	);
	assert.equal(discountPercent({ ...base, price: 100, previousPrice: 50 }), null);
	assert.equal(discountPercent({ ...base, price: 100 }), null);
});

test('sitemap inclui só primárias com produtos', () => {
	const out = parseProducts(
		sheet(
			`1,Fone,Áudio,"R$ 10,00",,${IMG},${URL_}`,
			`2,Vestido,Roupas Femininas,"R$ 10,00",,${IMG},${URL_}`,
			`3,Barra,Alimentos,"R$ 10,00",,${IMG},${URL_}`
		)
	);
	assert.deepEqual(sitemapCategorySlugs(toShowcase(out.items)).sort(), ['eletronicos', 'moda']);
});

test('planilha real: classifica toda categoria conhecida', async () => {
	const { existsSync, readFileSync } = await import('node:fs');
	const file = process.env.LIA_SHEET_CSV;
	if (!file || !existsSync(file)) return;
	const out = parseProducts(readFileSync(file, 'utf8'));
	console.log(JSON.stringify({ ...out.counts, unclassified: [...out.unclassified] }));
	assert.ok(out.items.length > 0);
});
