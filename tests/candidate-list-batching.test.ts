import assert from 'node:assert/strict';
import { test } from 'node:test';
import { listCandidates } from '../src/lib/server/shopee/candidate-store.ts';

function createDb(count: number) {
	const candidates = Array.from({ length: count }, (_, index) => ({
		item_id: String(1000 + index),
		shop_id: String(2000 + index),
		product_name: `Produto ${index}`,
		product_cat_ids: null
	}));
	const historyBinds: number[] = [];
	const db = {
		prepare(sql: string) {
			return {
				bind(...values: unknown[]) {
					return {
						async all() {
							if (!sql.includes('candidate_price_observations')) return { results: candidates };
							historyBinds.push(values.length);
							const results = [];
							for (let i = 0; i < values.length; i += 2) {
								const item = String(values[i]);
								const shop = String(values[i + 1]);
								const base = Number(item);
								results.push(
									{
										id: base * 2,
										item_id: item,
										shop_id: shop,
										observed_at: '2024-01-01 00:00:00',
										price: '10',
										sales: '1',
										commission_rate: '0.1'
									},
									{
										id: base * 2 + 1,
										item_id: item,
										shop_id: shop,
										observed_at: '2024-01-02 00:00:00',
										price: String(base),
										sales: '5',
										commission_rate: '0.2'
									}
								);
							}
							return { results };
						}
					};
				}
			};
		}
	} as unknown as D1Database;
	return { db, historyBinds };
}

for (const [count, expectedQueries] of [
	[50, 1],
	[51, 2],
	[100, 2]
] as const) {
	test(`listCandidates divide o histórico em lotes (${count} candidatos)`, async () => {
		const { db, historyBinds } = createDb(count);
		const candidates = await listCandidates(db, {});

		assert.equal(candidates.length, count);
		assert.equal(historyBinds.length, expectedQueries);
		assert.ok(historyBinds.every((binds) => binds <= 100));
		assert.equal(
			historyBinds.reduce((sum, binds) => sum + binds, 0),
			count * 2
		);
		for (const candidate of candidates) {
			assert.equal(candidate.history.observation_count, 2);
			assert.equal(candidate.history.current_price, candidate.item_id);
			assert.equal(candidate.history.previous_price, '10');
		}
	});
}
