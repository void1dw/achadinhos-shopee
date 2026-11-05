import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
	summarizeCandidateObservations,
	type CandidateObservation
} from '../src/lib/server/shopee/candidate-store.ts';

function observation(id: number, values: Partial<CandidateObservation> = {}): CandidateObservation {
	return {
		id,
		item_id: 'item-1',
		shop_id: 'shop-1',
		observed_at: `2026-01-${String(id).padStart(2, '0')}T12:00:00.000Z`,
		price: '100',
		sales: '10',
		commission_rate: '0.05',
		...values
	};
}

test('sem observações retorna histórico vazio sem confundir zero com null', () => {
	assert.deepEqual(summarizeCandidateObservations([]), {
		observation_count: 0,
		first_observed_at: null,
		last_observed_at: null,
		min_observed_price: null,
		max_observed_price: null,
		current_price: null,
		previous_price: null,
		price_change_percent: null,
		previous_sales: null,
		current_sales: null,
		sales_change: null,
		latest_commission_rate: null,
		reference_observed_at: null,
		reference_price: null,
		reference_price_change_percent: null
	});
});

test('uma observação informa limites e comissão sem inventar comparação', () => {
	const summary = summarizeCandidateObservations([
		observation(1, { price: '0', sales: '0', commission_rate: '0' })
	]);

	assert.equal(summary.observation_count, 1);
	assert.equal(summary.min_observed_price, 0);
	assert.equal(summary.max_observed_price, 0);
	assert.equal(summary.current_price, '0');
	assert.equal(summary.previous_price, null);
	assert.equal(summary.price_change_percent, null);
	assert.equal(summary.previous_sales, null);
	assert.equal(summary.current_sales, '0');
	assert.equal(summary.sales_change, null);
	assert.equal(summary.latest_commission_rate, '0');
});

test('preços iguais não geram variação', () => {
	const summary = summarizeCandidateObservations([
		observation(2, { price: '25.50' }),
		observation(1, { price: '25.50' })
	]);

	assert.equal(summary.min_observed_price, 25.5);
	assert.equal(summary.max_observed_price, 25.5);
	assert.equal(summary.previous_price, '25.50');
	assert.equal(summary.price_change_percent, 0);
});

test('calcula variações positivas e negativas do preço', () => {
	const increased = summarizeCandidateObservations([
		observation(2, { price: '120' }),
		observation(1, { price: '100' })
	]);
	const decreased = summarizeCandidateObservations([
		observation(2, { price: '80' }),
		observation(1, { price: '100' })
	]);

	assert.equal(increased.price_change_percent, 20);
	assert.equal(decreased.price_change_percent, -20);
});

test('calcula vendas iguais, crescentes e decrescentes como diferença absoluta', () => {
	const summarizeSales = (previousSales: string, currentSales: string) =>
		summarizeCandidateObservations([
			observation(2, { sales: currentSales }),
			observation(1, { sales: previousSales })
		]).sales_change;

	assert.equal(summarizeSales('10', '10'), '0');
	assert.equal(summarizeSales('10', '15'), '5');
	assert.equal(summarizeSales('15', '10'), '-5');
});

test('ignora campos nulos e valores inválidos nos cálculos numéricos', () => {
	const summary = summarizeCandidateObservations([
		observation(3, { price: 'not-a-price', sales: null, commission_rate: null }),
		observation(2, { price: '40.5', sales: 'invalid', commission_rate: '0.08' }),
		observation(1, { price: null, sales: '12', commission_rate: ' ' })
	]);

	assert.equal(summary.min_observed_price, 40.5);
	assert.equal(summary.max_observed_price, 40.5);
	assert.equal(summary.previous_price, '40.5');
	assert.equal(summary.price_change_percent, null);
	assert.equal(summary.previous_sales, null);
	assert.equal(summary.current_sales, null);
	assert.equal(summary.sales_change, null);
	assert.equal(summary.latest_commission_rate, '0.08');
});

test('preço atual inválido não compara com uma observação anterior mais antiga', () => {
	const summary = summarizeCandidateObservations([
		observation(3, { price: 'invalid' }),
		observation(2, { price: '100' }),
		observation(1, { price: '80' })
	]);

	assert.equal(summary.current_price, 'invalid');
	assert.equal(summary.previous_price, '100');
	assert.equal(summary.price_change_percent, null);
	assert.equal(summary.min_observed_price, 80);
	assert.equal(summary.max_observed_price, 100);
});

test('preço anterior inválido não busca um preço mais antigo para comparação', () => {
	const summary = summarizeCandidateObservations([
		observation(3, { price: '120' }),
		observation(2, { price: 'invalid' }),
		observation(1, { price: '100' })
	]);

	assert.equal(summary.current_price, '120');
	assert.equal(summary.previous_price, 'invalid');
	assert.equal(summary.price_change_percent, null);
});

test('preserva vendas inteiras acima de Number.MAX_SAFE_INTEGER e calcula diferença exata', () => {
	const summary = summarizeCandidateObservations([
		observation(2, { sales: '9007199254740995' }),
		observation(1, { sales: '9007199254740993' })
	]);

	assert.equal(summary.previous_sales, '9007199254740993');
	assert.equal(summary.current_sales, '9007199254740995');
	assert.equal(summary.sales_change, '2');
});

test('vendas inválidas não geram variação e valores zero permanecem válidos', () => {
	const zero = summarizeCandidateObservations([
		observation(2, { sales: '0' }),
		observation(1, { sales: '0' })
	]);
	const invalid = summarizeCandidateObservations([
		observation(2, { sales: 'invalid' }),
		observation(1, { sales: '0' })
	]);

	assert.equal(zero.previous_sales, '0');
	assert.equal(zero.current_sales, '0');
	assert.equal(zero.sales_change, '0');
	assert.equal(invalid.previous_sales, '0');
	assert.equal(invalid.current_sales, null);
	assert.equal(invalid.sales_change, null);
});

test('ordena datas iguais pelo ID decrescente para definir observação atual e anterior', () => {
	const sameDate = '2026-04-10T09:30:00.000Z';
	const summary = summarizeCandidateObservations([
		observation(3, { observed_at: sameDate, price: '90', sales: '30' }),
		observation(8, { observed_at: sameDate, price: '110', sales: '45' }),
		observation(5, { observed_at: sameDate, price: '100', sales: '40' })
	]);

	assert.equal(summary.observation_count, 3);
	assert.equal(summary.last_observed_at, sameDate);
	assert.equal(summary.first_observed_at, sameDate);
	assert.equal(summary.previous_price, '100');
	assert.equal(summary.price_change_percent, 10);
	assert.equal(summary.previous_sales, '40');
	assert.equal(summary.current_sales, '45');
	assert.equal(summary.sales_change, '5');
});

test('retorna a comissão mais recente que foi informada', () => {
	const summary = summarizeCandidateObservations([
		observation(3, { commission_rate: null }),
		observation(2, { commission_rate: '0.07' }),
		observation(1, { commission_rate: '0.05' })
	]);

	assert.equal(summary.latest_commission_rate, '0.07');
});

test('preserva comissão zero e trata comissão nula como não informada', () => {
	const zero = summarizeCandidateObservations([
		observation(2, { commission_rate: '0' }),
		observation(1, { commission_rate: '0.05' })
	]);
	const nullCommission = summarizeCandidateObservations([
		observation(2, { commission_rate: null }),
		observation(1, { commission_rate: null })
	]);

	assert.equal(zero.latest_commission_rate, '0');
	assert.equal(nullCommission.latest_commission_rate, null);
});

test('busca referência válida mesmo quando observação intermediária tem preço inválido', () => {
	const summary = summarizeCandidateObservations([
		observation(3, {
			observed_at: '2026-01-03T12:00:00.000Z',
			price: '80'
		}),
		observation(2, {
			observed_at: '2026-01-02T23:00:00.000Z',
			price: 'invalid'
		}),
		observation(1, {
			observed_at: '2026-01-02T12:00:00.000Z',
			price: '100'
		})
	]);

	assert.equal(summary.reference_price, '100');
	assert.equal(summary.reference_price_change_percent, -20);
});
