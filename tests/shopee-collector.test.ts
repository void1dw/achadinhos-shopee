import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
	collectShopeeCandidates,
	validateCandidateCollectionInput
} from '../src/lib/server/shopee/collector.ts';
import {
	decideCandidate,
	type CandidateDecision,
	type CandidateStatus
} from '../src/lib/server/shopee/candidate-store.ts';

type MockCandidate = {
	item_id: string;
	shop_id: string;
	product_name: string | null;
	status: CandidateStatus;
	rejection_reason: string | null;
	first_seen_at: string;
	last_seen_at: string;
	raw_data: string;
};

type MockObservation = {
	item_id: string;
	shop_id: string;
	collection_run_id: number;
	price: string | null;
	price_min: string | null;
	price_max: string | null;
	price_discount_rate: string | null;
	commission_rate: string | null;
	sales: string | null;
	rating_star: string | null;
};

type MockStatementResult = {
	results: unknown[];
	success: true;
	meta: { changes: number; last_row_id: number };
};

class MockStatement {
	private values: unknown[] = [];
	private readonly database: MockD1;
	private readonly sql: string;

	constructor(database: MockD1, sql: string) {
		this.database = database;
		this.sql = sql;
	}

	bind(...values: unknown[]): this {
		this.values = values;
		return this;
	}

	async all<T>(): Promise<MockStatementResult & { results: T[] }> {
		if (!this.sql.startsWith('SELECT item_id, shop_id FROM candidates')) {
			throw new Error(`Unexpected mock query: ${this.sql}`);
		}
		const keys = new Set<string>();
		for (let index = 0; index < this.values.length; index += 2) {
			keys.add(`${this.values[index]}\u0000${this.values[index + 1]}`);
		}
		const results = [...this.database.candidates.values()]
			.filter((candidate) => keys.has(`${candidate.item_id}\u0000${candidate.shop_id}`))
			.map(({ item_id, shop_id }) => ({ item_id, shop_id })) as T[];
		return { results, success: true, meta: { changes: 0, last_row_id: 0 } };
	}

	async first<T>(): Promise<T | null> {
		if (this.sql.startsWith('SELECT status FROM candidates')) {
			const [itemId, shopId] = this.values;
			const candidate = this.database.candidates.get(`${itemId}\u0000${shopId}`);
			return candidate ? ({ status: candidate.status } as T) : null;
		}
		if (!this.sql.includes('INSERT INTO candidate_collection_runs')) {
			throw new Error(`Unexpected mock first query: ${this.sql}`);
		}
		this.database.lastRunId += 1;
		return { id: this.database.lastRunId } as T;
	}

	async run<T>(): Promise<MockStatementResult & { results: T[] }> {
		let changes = 0;
		if (this.sql.includes('INSERT INTO candidates')) {
			const [itemId, shopId, productName, , , , , , , , , , , , rawData] = this.values;
			const key = `${itemId}\u0000${shopId}`;
			const previous = this.database.candidates.get(key);
			this.database.clock += 1;
			this.database.candidates.set(key, {
				item_id: String(itemId),
				shop_id: String(shopId),
				product_name: productName as string | null,
				status: previous?.status ?? 'pending',
				rejection_reason: previous?.rejection_reason ?? null,
				first_seen_at: previous?.first_seen_at ?? `first-${this.database.clock}`,
				last_seen_at: `seen-${this.database.clock}`,
				raw_data: String(rawData)
			});
			changes = 1;
		} else if (this.sql.includes('INSERT INTO candidate_price_observations')) {
			const [
				itemId,
				shopId,
				runId,
				price,
				priceMin,
				priceMax,
				priceDiscountRate,
				commissionRate,
				sales,
				ratingStar
			] = this.values;
			const key = `${runId}\u0000${itemId}\u0000${shopId}`;
			if (!this.database.observations.has(key)) {
				this.database.observations.set(key, {
					item_id: String(itemId),
					shop_id: String(shopId),
					collection_run_id: Number(runId),
					price: price as string | null,
					price_min: priceMin as string | null,
					price_max: priceMax as string | null,
					price_discount_rate: priceDiscountRate as string | null,
					commission_rate: commissionRate as string | null,
					sales: sales as string | null,
					rating_star: ratingStar as string | null
				});
				changes = 1;
			}
		} else if (this.sql.includes('UPDATE candidate_collection_runs')) {
			this.database.completedRuns += 1;
			changes = 1;
		} else if (this.sql.includes('UPDATE candidates SET status')) {
			const [status, reason, itemId, shopId] = this.values as [
				CandidateDecision,
				string | null,
				string,
				string
			];
			const candidate = this.database.candidates.get(`${itemId}\u0000${shopId}`);
			if (candidate && candidate.status === 'pending') {
				candidate.status = status;
				candidate.rejection_reason = reason;
				changes = 1;
			}
		} else if (this.sql.includes('INSERT INTO candidate_decisions')) {
			const [decision, reason, itemId, shopId] = this.values as [
				CandidateDecision,
				string | null,
				string,
				string
			];
			const candidate = this.database.candidates.get(`${itemId}\u0000${shopId}`);
			if (candidate && candidate.status === 'pending') {
				this.database.decisions.push({ decision, reason, itemId, shopId });
				changes = 1;
			}
		} else {
			throw new Error(`Unexpected mock run query: ${this.sql}`);
		}
		return { results: [], success: true, meta: { changes, last_row_id: this.database.lastRunId } };
	}
}

class MockD1 {
	candidates = new Map<string, MockCandidate>();
	observations = new Map<string, MockObservation>();
	decisions: Array<{
		decision: CandidateDecision;
		reason: string | null;
		itemId: string;
		shopId: string;
	}> = [];
	lastRunId = 0;
	completedRuns = 0;
	clock = 0;

	prepare(sql: string): MockStatement {
		return new MockStatement(this, sql);
	}

	async batch<T>(
		statements: MockStatement[]
	): Promise<Array<MockStatementResult & { results: T[] }>> {
		const results: Array<MockStatementResult & { results: T[] }> = [];
		// Simula a transação do D1: se qualquer instrução falhar, o lote inteiro é desfeito.
		const candidatesSnapshot = new Map(
			[...this.candidates].map(([key, value]) => [key, { ...value }])
		);
		const decisionsSnapshot = [...this.decisions];
		try {
			for (const statement of statements) results.push(await statement.run<T>());
		} catch (error) {
			this.candidates = candidatesSnapshot;
			this.decisions = decisionsSnapshot;
			throw error;
		}
		return results;
	}
}

function product(itemId: string, shopId: string, productName = 'Produto de teste') {
	return {
		itemId,
		shopId,
		productName,
		productLink: 'https://shopee.com.br/product',
		offerLink: 'https://shopee.com.br/offer',
		imageUrl: 'https://cf.shopee.com.br/image',
		price: '29.90',
		priceMin: '29.90',
		priceMax: '49.90',
		priceDiscountRate: 30,
		commissionRate: '0.05',
		sales: '8',
		ratingStar: '4.8',
		productCatIds: [1001]
	};
}

function fetchOffers(offersByPage: Record<number, unknown[]>, failPage?: number): typeof fetch {
	return async (_input, init) => {
		const { query } = JSON.parse(String(init?.body)) as { query: string };
		const page = Number(query.match(/productOfferV2\(page: (\d+)/)?.[1]);
		if (page === failPage) {
			return Response.json(
				{ errors: [{ message: 'private upstream detail', extensions: { code: 10030 } }] },
				{ status: 200 }
			);
		}
		return Response.json({
			data: {
				offers: {
					nodes: offersByPage[page] ?? [],
					pageInfo: { page, hasNextPage: page < 3 }
				}
			}
		});
	};
}

const credentials = { SHOPEE_APP_ID: '12345', SHOPEE_APP_SECRET: 'test-secret' };
const request = {
	searchType: 'general' as const,
	pages: 3,
	pageLimit: 20
};

test('coletor deduplica por itemId + shopId, mantendo IDs de lojas diferentes', async () => {
	const db = new MockD1() as unknown as D1Database;
	const result = await collectShopeeCandidates(
		db,
		credentials,
		request,
		fetchOffers({
			1: [product('100', '200'), product('100', '201')],
			2: [product('100', '200', 'Repetido'), product('101', '200')],
			3: []
		})
	);

	assert.equal(result.status, 'completed');
	assert.equal(result.queriesPerformed, 3);
	assert.equal(result.productsFound, 4);
	assert.equal(result.newCandidates, 3);
	assert.equal(result.updatedCandidates, 0);
	assert.equal((db as unknown as MockD1).candidates.size, 3);
	assert.equal((db as unknown as MockD1).observations.size, 3);
	assert.deepEqual(
		[...(db as unknown as MockD1).observations.values()].map(
			(observation) => observation.collection_run_id
		),
		[1, 1, 1]
	);
	assert.equal((db as unknown as MockD1).completedRuns, 1);
});

test('coletor passa o controle central e para sem HTTP quando o orçamento acaba', async () => {
	const { createMemoryCallControl } = await import('../src/lib/server/shopee/call-control.ts');
	const control = createMemoryCallControl({ budget: 1 });
	let httpCalls = 0;
	const inner = fetchOffers({ 1: [product('100', '200')], 2: [] });
	const counting = (async (...args: Parameters<typeof fetch>) => {
		httpCalls += 1;
		return inner(...args);
	}) as typeof fetch;
	const result = await collectShopeeCandidates(
		new MockD1() as unknown as D1Database,
		credentials,
		request,
		counting,
		control
	);
	assert.equal(httpCalls, 1);
	assert.equal(control.counters.reserved, 1);
	assert.equal(result.queriesPerformed, 1);
	assert.equal(result.errorCode, 'SHOPEE_BUDGET_EXHAUSTED');
});

test('atualiza dados encontrados novamente sem sobrescrever aprovação ou rejeição', async () => {
	const mock = new MockD1();
	const db = mock as unknown as D1Database;
	const run = (name: string) =>
		collectShopeeCandidates(
			db,
			credentials,
			{ ...request, pages: 1 },
			fetchOffers({ 1: [product('100', '200', name)] })
		);

	assert.equal((await run('Primeira versão')).newCandidates, 1);
	assert.equal(mock.observations.size, 1);
	assert.equal(await decideCandidate(db, '100', '200', 'approved', null), 'decided');
	assert.equal((await run('Versão atualizada')).updatedCandidates, 1);
	assert.equal(mock.observations.size, 2);
	const approved = mock.candidates.get('100\u0000200');
	assert.equal(approved?.product_name, 'Versão atualizada');
	assert.equal(approved?.status, 'approved');
	assert.equal(approved?.rejection_reason, null);
	assert.equal(approved?.first_seen_at, 'first-1');
	assert.equal(approved?.raw_data.includes('Versão atualizada'), true);
	assert.equal(JSON.parse(approved?.raw_data ?? '{}').ratingStar, '4.8');

	assert.equal(
		await decideCandidate(db, '100', '200', 'rejected', 'Preço inadequado'),
		'already_decided'
	);
	assert.equal((await run('Versão pós-tentativa')).updatedCandidates, 1);
	const stillApproved = mock.candidates.get('100\u0000200');
	assert.equal(stillApproved?.status, 'approved');
	assert.equal(stillApproved?.rejection_reason, null);
	assert.equal(mock.decisions.length, 1);
	assert.equal(mock.decisions[0]?.decision, 'approved');
});

test('nova coleta preserva status e motivo de candidato rejeitado', async () => {
	const mock = new MockD1();
	const db = mock as unknown as D1Database;
	const run = () =>
		collectShopeeCandidates(
			db,
			credentials,
			{ ...request, pages: 1 },
			fetchOffers({ 1: [product('100', '200')] })
		);
	await run();
	assert.equal(await decideCandidate(db, '100', '200', 'rejected', 'Preço inadequado'), 'decided');
	await run();
	const rejected = mock.candidates.get('100\u0000200');
	assert.equal(rejected?.status, 'rejected');
	assert.equal(rejected?.rejection_reason, 'Preço inadequado');
	assert.equal(mock.decisions.length, 1);
});

test('decisões só são aceitas para candidatos pendentes', async () => {
	const mock = new MockD1();
	const db = mock as unknown as D1Database;
	await collectShopeeCandidates(
		db,
		credentials,
		{ ...request, pages: 1 },
		fetchOffers({ 1: [product('100', '200'), product('101', '200')] })
	);

	assert.equal(await decideCandidate(db, '100', '200', 'approved', null), 'decided');
	assert.equal(await decideCandidate(db, '100', '200', 'approved', null), 'already_decided');
	assert.equal(
		await decideCandidate(db, '100', '200', 'rejected', 'Depois da aprovação'),
		'already_decided'
	);
	assert.equal(await decideCandidate(db, '101', '200', 'rejected', 'Sem interesse'), 'decided');
	assert.equal(await decideCandidate(db, '101', '200', 'approved', null), 'already_decided');
	assert.equal(await decideCandidate(db, 'missing', '200', 'approved', null), 'not_found');

	assert.equal(mock.candidates.get('100\u0000200')?.status, 'approved');
	assert.equal(mock.candidates.get('101\u0000200')?.status, 'rejected');
	assert.equal(mock.candidates.get('101\u0000200')?.rejection_reason, 'Sem interesse');
	assert.deepEqual(mock.decisions, [
		{ decision: 'approved', reason: null, itemId: '100', shopId: '200' },
		{ decision: 'rejected', reason: 'Sem interesse', itemId: '101', shopId: '200' }
	]);
});

test('falha parcial da Shopee mantém os resultados já coletados e sanitiza o erro', async () => {
	const mock = new MockD1();
	const result = await collectShopeeCandidates(
		mock as unknown as D1Database,
		credentials,
		request,
		fetchOffers({ 1: [product('100', '200')] }, 2)
	);

	assert.equal(result.status, 'partial');
	assert.equal(result.queriesPerformed, 2);
	assert.equal(result.productsFound, 1);
	assert.equal(result.failures, 1);
	assert.equal(result.errorCode, 'SHOPEE_RATE_LIMIT');
	assert.doesNotMatch(result.errorMessage ?? '', /private upstream detail/);
	assert.equal(mock.candidates.size, 1);
	assert.equal(mock.observations.size, 1);
	assert.deepEqual(
		[...mock.observations.values()].map((observation) => observation.collection_run_id),
		[1]
	);
	assert.equal(mock.completedRuns, 1);
});

test('exceção inesperada no processamento finaliza a coleta e sanitiza o erro', async () => {
	const mock = new MockD1();
	const filters = new Proxy(
		{},
		{
			get() {
				throw new Error('private processing detail');
			}
		}
	);

	const result = await collectShopeeCandidates(
		mock as unknown as D1Database,
		credentials,
		{ ...request, pages: 1, filters: filters as never },
		fetchOffers({ 1: [product('100', '200')] })
	);

	assert.equal(result.status, 'partial');
	assert.equal(result.queriesPerformed, 1);
	assert.equal(result.productsFound, 1);
	assert.equal(result.failures, 1);
	assert.equal(result.errorCode, 'SHOPEE_COLLECTION_FAILED');
	assert.equal(result.errorMessage, 'A consulta à Shopee não pôde ser concluída.');
	assert.doesNotMatch(result.errorMessage ?? '', /private processing detail/);
	assert.equal(mock.candidates.size, 0);
	assert.equal(mock.observations.size, 0);
	assert.equal(mock.completedRuns, 1);
});
test('valida os limites no servidor e não envia mais que três páginas', async () => {
	assert.throws(
		() => validateCandidateCollectionInput({ ...request, pages: 4 }),
		/A coleta aceita de 1 a 3 páginas/
	);
	assert.throws(
		() => validateCandidateCollectionInput({ ...request, pageLimit: 21 }),
		/A coleta aceita de 1 a 20 produtos/
	);
	assert.throws(
		() => validateCandidateCollectionInput({ ...request, searchType: 'keyword', keyword: ' ' }),
		/busca por palavra-chave exige/
	);
});

test('mantém busca geral sem termo e normaliza buscas com palavra-chave', () => {
	assert.deepEqual(
		validateCandidateCollectionInput({
			...request,
			searchType: 'general',
			keyword: ''
		}),
		{ searchType: 'general', pages: 3, pageLimit: 20 }
	);
	assert.deepEqual(
		validateCandidateCollectionInput({
			...request,
			searchType: 'general',
			keyword: '  fone bluetooth  '
		}),
		{ searchType: 'keyword', keyword: 'fone bluetooth', pages: 3, pageLimit: 20 }
	);
	assert.deepEqual(
		validateCandidateCollectionInput({
			...request,
			searchType: 'keyword',
			keyword: 'fone bluetooth'
		}),
		{ searchType: 'keyword', keyword: 'fone bluetooth', pages: 3, pageLimit: 20 }
	);
});

test('rejeição exige motivo e decisões não alteram catálogo externo', async () => {
	const mock = new MockD1();
	const db = mock as unknown as D1Database;
	await collectShopeeCandidates(
		db,
		credentials,
		{ ...request, pages: 1 },
		fetchOffers({ 1: [product('100', '200')] })
	);
	await assert.rejects(() => decideCandidate(db, '100', '200', 'rejected', ' '), /motivo/);
	assert.equal(await decideCandidate(db, 'missing', '200', 'approved', null), 'not_found');
	assert.equal(mock.candidates.get('100\u0000200')?.status, 'pending');
	assert.equal(mock.decisions.length, 0);
});

test('busca sem credenciais registra falha sem chamar a Shopee', async () => {
	let fetchCalls = 0;
	const mock = new MockD1();
	const result = await collectShopeeCandidates(
		mock as unknown as D1Database,
		{ SHOPEE_APP_ID: '', SHOPEE_APP_SECRET: '' },
		{ ...request, pages: 1 },
		async () => {
			fetchCalls += 1;
			return Response.json({});
		}
	);

	assert.equal(fetchCalls, 0);
	assert.equal(result.status, 'failed');
	assert.equal(result.errorCode, 'SHOPEE_CREDENTIALS_NOT_CONFIGURED');
	assert.equal(mock.observations.size, 0);
});
