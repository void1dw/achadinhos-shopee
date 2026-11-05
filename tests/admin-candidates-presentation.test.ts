import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const source = readFileSync(
	new URL('../src/routes/admin/shopee/candidates/+page.svelte', import.meta.url),
	'utf8'
);

test('affiliate link is a safe external link and never falls back to product_link', () => {
	assert.match(source, /function safeOfferUrl\(value: string \| null\)/);
	assert.match(source, /url\.protocol === 'https:' \|\| url\.protocol === 'http:'/);
	assert.match(source, /href=\{safeOfferUrl\(candidate\.offer_link\)/);
	assert.match(source, /target="_blank"/);
	assert.match(source, /rel="noopener noreferrer"/);
	assert.match(source, /Link de afiliado indisponível/);
	assert.doesNotMatch(source, /safeOfferUrl\(candidate\.product_link\)/);
	assert.doesNotMatch(source, /href=\{candidate\.product_link\}/);
});

test('candidate review displays price indicators, Shopee discount context, status, and rejection reason', () => {
	for (const text of [
		'Preço:',
		'Faixa:',
		'Comissão informada:',
		'Desconto informado pela Shopee (não comprovado):',
		'Vendas:',
		'Avaliação:',
		'Estado atual:',
		'candidate.rejection_reason'
	]) {
		assert.ok(source.includes(text), `Expected candidate view to display ${text}.`);
	}
});

test('candidate review presents compact historical market indicators', () => {
	for (const text of [
		'Histórico de mercado',
		'Preço atual:',
		'Menor / maior preço observado:',
		'Preço anterior:',
		'Variação para a observação mais recente:',
		'Evolução de vendas:',
		'Última atualização:',
		'Há somente uma observação;',
		'O histórico não possui preços numéricos válidos.'
	]) {
		assert.ok(source.includes(text), `Expected candidate view to display ${text}.`);
	}
});
