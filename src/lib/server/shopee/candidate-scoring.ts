export type ScoreClassification = 'Excelente' | 'Boa' | 'Regular' | 'Fraca';
export type ScoreConfidence = 'alta' | 'média' | 'baixa';
export type ScoreCriterionKey = 'sales' | 'rating' | 'commission' | 'price';

export type ScoreCriterion = {
	key: ScoreCriterionKey;
	label: string;
	weight: number;
	available: boolean;
	/** Pontuação de 0 a 100; null quando o critério está indisponível. */
	score: number | null;
	/** Contribuição em pontos na nota final, já com pesos renormalizados. */
	contribution: number | null;
	reason: string | null;
};

export type CandidateScore = {
	score: number | null;
	classification: ScoreClassification | null;
	confidence: ScoreConfidence;
	/** Soma dos pesos dos critérios disponíveis, de 0 a 1. */
	coverage: number;
	criteria: ScoreCriterion[];
};

export type ScoreInput = {
	sales: string | number | null | undefined;
	rating: string | number | null | undefined;
	/** Fração decimal: 0.03 = 3%. */
	commissionRate: string | number | null | undefined;
	/** Variação percentual real entre observações separadas por 12 horas ou mais (negativa = queda). */
	priceChangePercent: number | null | undefined;
};

export const SCORE_WEIGHTS: Record<ScoreCriterionKey, number> = {
	sales: 0.35,
	rating: 0.15,
	commission: 0.2,
	price: 0.3
};

const SALES_CAP = 10_000;
const COMMISSION_CAP = 0.2;
const PRICE_DROP_CAP_PERCENT = 20;

function parseNumber(value: string | number | null | undefined): number | null {
	if (value === null || value === undefined) return null;
	if (typeof value === 'string') {
		const text = value.trim();
		if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(text)) return null;
		value = Number(text);
	}
	return Number.isFinite(value) ? value : null;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

type Raw = { score: number | null; reason: string | null };

function salesScore(value: ScoreInput['sales']): Raw {
	const sales = parseNumber(value);
	if (sales === null || sales < 0)
		return { score: null, reason: 'Vendas indisponíveis ou inválidas.' };
	return {
		score: clamp((Math.log10(1 + sales) / Math.log10(1 + SALES_CAP)) * 100, 0, 100),
		reason: null
	};
}

function ratingScore(value: ScoreInput['rating']): Raw {
	const rating = parseNumber(value);
	if (rating === null || rating < 0 || rating > 5) {
		return { score: null, reason: 'Avaliação indisponível ou fora de 0 a 5.' };
	}
	return { score: (rating / 5) * 100, reason: null };
}

function commissionScore(value: ScoreInput['commissionRate']): Raw {
	const rate = parseNumber(value);
	if (rate === null || rate < 0)
		return { score: null, reason: 'Comissão indisponível ou inválida.' };
	return { score: clamp((rate / COMMISSION_CAP) * 100, 0, 100), reason: null };
}

function priceScore(value: ScoreInput['priceChangePercent']): Raw {
	const change = parseNumber(value);
	if (change === null) {
		return {
			score: null,
			reason:
				'Sem histórico suficiente: falta comparação com observação de pelo menos 12 horas atrás.'
		};
	}
	return { score: clamp((-change / PRICE_DROP_CAP_PERCENT) * 100, 0, 100), reason: null };
}

function classify(score: number): ScoreClassification {
	if (score >= 75) return 'Excelente';
	if (score >= 55) return 'Boa';
	if (score >= 35) return 'Regular';
	return 'Fraca';
}

const round1 = (value: number) => Math.round(value * 10) / 10;

export function scoreCandidate(input: ScoreInput): CandidateScore {
	const raws: Record<ScoreCriterionKey, Raw> = {
		sales: salesScore(input.sales),
		rating: ratingScore(input.rating),
		commission: commissionScore(input.commissionRate),
		price: priceScore(input.priceChangePercent)
	};
	const labels: Record<ScoreCriterionKey, string> = {
		sales: 'Vendas',
		rating: 'Avaliação',
		commission: 'Comissão',
		price: 'Oportunidade de preço'
	};
	const keys = Object.keys(SCORE_WEIGHTS) as ScoreCriterionKey[];
	const coverage = keys.reduce(
		(sum, key) => sum + (raws[key].score === null ? 0 : SCORE_WEIGHTS[key]),
		0
	);

	let total = 0;
	const criteria = keys.map((key): ScoreCriterion => {
		const raw = raws[key];
		const available = raw.score !== null;
		const contribution =
			available && coverage > 0 ? (raw.score! * SCORE_WEIGHTS[key]) / coverage : null;
		if (contribution !== null) total += contribution;
		return {
			key,
			label: labels[key],
			weight: SCORE_WEIGHTS[key],
			available,
			score: raw.score === null ? null : round1(raw.score),
			contribution: contribution === null ? null : round1(contribution),
			reason: raw.reason
		};
	});

	const score = coverage > 0 ? round1(clamp(total, 0, 100)) : null;
	const hasHistory = raws.price.score !== null;
	const confidence: ScoreConfidence =
		coverage >= 0.8 - 1e-9 && hasHistory ? 'alta' : coverage >= 0.5 - 1e-9 ? 'média' : 'baixa';

	return {
		score,
		classification: score === null ? null : classify(score),
		confidence,
		coverage: Math.round(coverage * 100) / 100,
		criteria
	};
}
