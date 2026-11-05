import assert from 'node:assert/strict';
import { test } from 'node:test';
import { scoreCandidate, type ScoreInput } from '../src/lib/server/shopee/candidate-scoring.ts';
import {
	summarizeCandidateObservations,
	type CandidateObservation
} from '../src/lib/server/shopee/candidate-store.ts';

const empty: ScoreInput = {
	sales: null,
	rating: null,
	commissionRate: null,
	priceChangePercent: null
};
const criterion = (input: Partial<ScoreInput>, key: string) =>
	scoreCandidate({ ...empty, ...input }).criteria.find((c) => c.key === key)!;

test('vendas: escala logarítmica de 0 a 10.000', () => {
	assert.equal(criterion({ sales: '0' }, 'sales').score, 0);
	assert.equal(criterion({ sales: '0' }, 'sales').available, true);
	assert.equal(criterion({ sales: 10000 }, 'sales').score, 100);
	assert.equal(criterion({ sales: '50000' }, 'sales').score, 100);
	const mid = criterion({ sales: '99' }, 'sales').score!;
	assert.ok(mid > 49 && mid < 51);
	for (const sales of ['abc', '', '-5', NaN, null, undefined]) {
		assert.equal(criterion({ sales }, 'sales').available, false);
	}
});

test('avaliação: aceita apenas 0 a 5', () => {
	assert.equal(criterion({ rating: '5' }, 'rating').score, 100);
	assert.equal(criterion({ rating: '2.5' }, 'rating').score, 50);
	assert.equal(criterion({ rating: '0' }, 'rating').score, 0);
	assert.equal(criterion({ rating: '0' }, 'rating').available, true);
	for (const rating of ['5.1', '-1', 'x', '', null]) {
		assert.equal(criterion({ rating }, 'rating').available, false);
	}
});

test('comissão: fração decimal, proporcional até 20%', () => {
	assert.equal(criterion({ commissionRate: '0.1' }, 'commission').score, 50);
	assert.equal(criterion({ commissionRate: '0.2' }, 'commission').score, 100);
	assert.equal(criterion({ commissionRate: '0.5' }, 'commission').score, 100);
	assert.equal(criterion({ commissionRate: '0' }, 'commission').score, 0);
	assert.equal(criterion({ commissionRate: '0' }, 'commission').available, true);
	for (const commissionRate of [null, '', 'abc', '-0.1']) {
		assert.equal(criterion({ commissionRate }, 'commission').available, false);
	}
});

test('preço: queda de 20% ou mais vale 100; sem comparação é indisponível', () => {
	assert.equal(criterion({ priceChangePercent: -20 }, 'price').score, 100);
	assert.equal(criterion({ priceChangePercent: -50 }, 'price').score, 100);
	assert.equal(criterion({ priceChangePercent: -10 }, 'price').score, 50);
	assert.equal(criterion({ priceChangePercent: 0 }, 'price').score, 0);
	assert.equal(criterion({ priceChangePercent: 15 }, 'price').score, 0);
	const missing = criterion({ priceChangePercent: null }, 'price');
	assert.equal(missing.available, false);
	assert.equal(missing.score, null);
	assert.match(missing.reason ?? '', /12 horas/);
	assert.equal(criterion({ priceChangePercent: NaN }, 'price').available, false);
});

test('pesos e renormalização entre critérios disponíveis', () => {
	const full = scoreCandidate({
		sales: 10000,
		rating: 5,
		commissionRate: 0.2,
		priceChangePercent: -20
	});
	assert.equal(full.score, 100);
	assert.equal(full.coverage, 1);
	assert.deepEqual(
		full.criteria.map((c) => c.weight),
		[0.35, 0.15, 0.2, 0.3]
	);

	const mixed = scoreCandidate({ ...empty, sales: 10000, rating: 0 });
	assert.equal(mixed.coverage, 0.5);
	assert.equal(mixed.score, 70);

	const onlyRating = scoreCandidate({ ...empty, rating: 4 });
	assert.equal(onlyRating.score, 80);

	const none = scoreCandidate(empty);
	assert.equal(none.score, null);
	assert.equal(none.classification, null);
	assert.equal(none.coverage, 0);
	assert.equal(none.confidence, 'baixa');
	assert.ok(none.criteria.every((c) => !c.available && c.contribution === null));
});

test('classificação', () => {
	const byRating = (rating: number) => scoreCandidate({ ...empty, rating }).classification;
	assert.equal(byRating(5), 'Excelente');
	assert.equal(byRating(4), 'Excelente');
	assert.equal(byRating(3.5), 'Boa');
	assert.equal(byRating(2), 'Regular');
	assert.equal(byRating(1), 'Fraca');
});

test('confiança: alta exige cobertura >= 80% e histórico de preço', () => {
	const all = { sales: 100, rating: 4, commissionRate: 0.1 };
	assert.equal(scoreCandidate({ ...empty, ...all, priceChangePercent: -5 }).confidence, 'alta');
	// Sem histórico: cobertura 70%, média.
	assert.equal(scoreCandidate({ ...empty, ...all }).confidence, 'média');
	// Sem vendas: 65%, média.
	assert.equal(
		scoreCandidate({ ...empty, rating: 4, commissionRate: 0.1, priceChangePercent: 0 }).confidence,
		'média'
	);
	// Só comissão e avaliação: 35%, baixa.
	assert.equal(scoreCandidate({ ...empty, rating: 4, commissionRate: 0.1 }).confidence, 'baixa');
	// Preço + comissão = 50%, média.
	assert.equal(
		scoreCandidate({ ...empty, commissionRate: 0.1, priceChangePercent: -5 }).confidence,
		'média'
	);
});

function obs(id: number, observed_at: string, price: string | null): CandidateObservation {
	return { id, item_id: '1', shop_id: '2', observed_at, price, sales: null, commission_rate: null };
}

test('histórico: referência exige pelo menos 12 horas de intervalo', () => {
	const history = summarizeCandidateObservations([
		obs(1, '2026-01-01T00:00:00.000Z', '100'),
		obs(2, '2026-01-01T06:00:00.000Z', '90'),
		obs(3, '2026-01-01T12:00:00.000Z', '80')
	]);
	// A observação 2 (6h) é ignorada; a referência é a 1 (exatamente 12h).
	assert.equal(history.reference_observed_at, '2026-01-01T00:00:00.000Z');
	assert.equal(history.reference_price_change_percent, -20);
	// O cálculo consecutivo continua inalterado.
	assert.equal(history.previous_price, '90');
	assert.ok(Math.abs((history.price_change_percent ?? 0) - (-10 / 90) * 100) < 1e-9);
});

test('histórico: menos de 12 horas não gera referência', () => {
	const history = summarizeCandidateObservations([
		obs(1, '2026-01-01T00:00:00.000Z', '100'),
		obs(2, '2026-01-01T11:59:59.000Z', '80')
	]);
	assert.equal(history.reference_observed_at, null);
	assert.equal(history.reference_price_change_percent, null);
	assert.notEqual(history.price_change_percent, null);
});

test('histórico: escolhe a anterior mais recente elegível', () => {
	const history = summarizeCandidateObservations([
		obs(1, '2026-01-01T00:00:00.000Z', '200'),
		obs(2, '2026-01-02T00:00:00.000Z', '100'),
		obs(3, '2026-01-03T00:00:00.000Z', '75')
	]);
	assert.equal(history.reference_observed_at, '2026-01-02T00:00:00.000Z');
	assert.equal(history.reference_price_change_percent, -25);
});

test('histórico: referência ignora preços inválidos ou zero e exige preço atual válido', () => {
	const skipped = summarizeCandidateObservations([
		obs(1, '2026-01-01T00:00:00.000Z', '200'),
		obs(2, '2026-01-02T00:00:00.000Z', 'abc'),
		obs(3, '2026-01-02T12:00:00.000Z', '0'),
		obs(4, '2026-01-03T00:00:00.000Z', '100')
	]);
	assert.equal(skipped.reference_observed_at, '2026-01-01T00:00:00.000Z');
	assert.equal(skipped.reference_price_change_percent, -50);

	const invalidCurrent = summarizeCandidateObservations([
		obs(1, '2026-01-01T00:00:00.000Z', '200'),
		obs(2, '2026-01-03T00:00:00.000Z', 'abc')
	]);
	assert.equal(invalidCurrent.reference_observed_at, null);
	assert.equal(invalidCurrent.reference_price_change_percent, null);

	const onlyInvalid = summarizeCandidateObservations([
		obs(1, '2026-01-01T00:00:00.000Z', 'abc'),
		obs(2, '2026-01-03T00:00:00.000Z', '75')
	]);
	assert.equal(onlyInvalid.reference_price_change_percent, null);
	assert.equal(summarizeCandidateObservations([]).reference_observed_at, null);
});
