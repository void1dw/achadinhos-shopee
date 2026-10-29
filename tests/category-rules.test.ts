import assert from 'node:assert/strict';
import { test } from 'node:test';
import { categoryChain } from '../src/lib/categories.ts';
import { classifyByRules, RULES } from '../src/lib/category-rules.ts';
import { parseProducts } from '../src/lib/server/sheets.ts';
import { formatProductReport } from '../src/lib/server/product-report.ts';
import { toShowcase } from '../src/lib/products.ts';

const HEADER = 'id,nome,categoria,preco,preco_anterior,imagem,url';
const IMG = 'https://img.example/a.jpg';
const URL_ = 'https://shope.ee/abc';
const row = (id: string, name: string, category: string) =>
	`${id},${name},${category},"R$ 10,00",,${IMG},${URL_}`;
const parse = (...rows: string[]) => parseProducts([HEADER, ...rows].join('\n'));

test('todo alvo de regra existe com a cadeia inteira aprovada', () => {
	for (const rule of RULES) {
		const chain = categoryChain(rule.target);
		assert.ok(chain.length > 0, `${rule.id}: alvo inexistente`);
		assert.ok(
			chain.every((node) => node.status === 'approved'),
			`${rule.id}: alvo não aprovado`
		);
	}
	assert.equal(new Set(RULES.map((rule) => rule.id)).size, RULES.length);
});

test('pasta de amendoim 8337843814 entra em Alimentos > Mercearia > Pastas', () => {
	const out = parse(
		row('8337843814', 'Pasta de Amendoim Integral Vários Sabores Maniforce', 'Alimentos e Bebidas')
	);
	assert.equal(out.items.length, 1);
	assert.equal(out.items[0].categoryId, 'alimentos-mercearia-pastas-de-untar');
	assert.equal(out.items[0].autoRule, 'alimentos-pasta-de-amendoim');
	const shown = toShowcase(out.items)[0];
	assert.deepEqual(shown.categoryPath, [
		'alimentos',
		'alimentos-mercearia',
		'alimentos-mercearia-pastas-de-untar'
	]);
	assert.equal(out.counts.autoClassified, 1);
});

test('categoria genérica "Outros" é classificada quando o título é claro', () => {
	const out = parse(row('1', 'Fichas de Alfabetização Infantil', 'Outros'));
	assert.equal(out.items[0].categoryId, 'papelaria-escolar');
	assert.equal(out.autoClassified[0].origin, 'generic');
});

test('categoria aprovada da planilha tem prioridade sobre o título', () => {
	const out = parse(row('1', 'Fone de ouvido bluetooth', 'Casa e Construção'));
	assert.equal(out.items[0].categoryId, undefined);
	assert.equal(out.autoClassified.length, 0);
	assert.equal(out.counts.viaSheet, 1);
});

test('título ambíguo permanece pendente e aparece no relatório', () => {
	const out = parse(row('1', 'Fone de ouvido com caixa de som bluetooth', 'Outros'));
	assert.equal(out.items.length, 0);
	assert.match(out.issues[0].message, /AMBÍGUO ENTRE AS REGRAS/);
	assert.match(formatProductReport(out), /^ID: 1$/m);
});

test('sem regra clara o produto fica pendente', () => {
	const out = parse(row('1', 'Kit Coala Home Chá Branco', 'Alimentos e Bebidas'));
	assert.equal(out.items.length, 0);
	assert.match(out.issues[0].message, /EXIGE CONFIRMAÇÃO PELO TÍTULO/);
	assert.equal(out.unclassified.get('Alimentos e Bebidas'), 1);
});

test('sem falsos positivos em títulos com palavras semelhantes', () => {
	const none = [
		['Forma de sabonete em silicone', 'Outros'],
		['Saboneteira de parede', 'Outros'],
		['Extrator de suco de laranja', 'Alimentos e Bebidas'],
		['Cafeteira elétrica 110v', 'Alimentos e Bebidas'],
		['Pasta de dente sabor amendoim', 'Outros'],
		['Jogo de alfabetização brinquedo', 'Outros'],
		['Capa para notebook', 'Outros']
	];
	for (const [title, category] of none) {
		const result = classifyByRules(title, {
			categoryHint: category === 'Alimentos e Bebidas' ? 'alimentos' : undefined
		});
		assert.notEqual(result.status, 'matched', title);
	}
});

test('sabonete "Chá Branco" não vira chá', () => {
	const result = classifyByRules('Sabonete líquido Chá Branco refil', {
		categoryHint: 'alimentos'
	});
	assert.equal(result.status === 'matched' && result.categoryId, 'beleza-corpo');
});

test('regras com hint só valem dentro do departamento indicado', () => {
	assert.equal(classifyByRules('Chocolate ao leite 90g').status, 'none');
	const result = classifyByRules('Chocolate ao leite 90g', { categoryHint: 'alimentos' });
	assert.equal(result.status === 'matched' && result.categoryId, 'alimentos-doces-snacks');
});

test('itens reais de Alimentos e Bebidas e Outros', () => {
	const out = parse(
		row('23994191319', 'Kit Potes Herméticos Marmita', 'Alimentos e Bebidas'),
		row('23093861925', 'Filtro Coador de Café Reutilizável', 'Alimentos e Bebidas'),
		row('23699643613', 'Kit Coala Sabonete Líquido Chá Branco', 'Alimentos e Bebidas')
	);
	const ids = Object.fromEntries(out.items.map((item) => [item.id, item.categoryId]));
	assert.equal(ids['23994191319'], 'casa-cozinha-potes');
	assert.equal(ids['23093861925'], 'casa-cozinha-acessorios');
	assert.equal(ids['23699643613'], 'beleza-corpo');
});

test('relatório separa classificação automática e informa a regra', () => {
	const out = parse(
		row('1', 'Pasta de Amendoim Integral', 'Outros'),
		row('2', 'Cabo USB', 'Eletrônicos')
	);
	const report = formatProductReport(out);
	assert.match(report, /Classificados automaticamente por regra: 1/);
	assert.match(report, /Classificados pela categoria da planilha: 1/);
	assert.match(report, /REGRA: alimentos-pasta-de-amendoim/);
	assert.match(
		report,
		/CLASSIFICADO EM: Alimentos e bebidas > Mercearia > Pastas e cremes de untar/
	);
});
