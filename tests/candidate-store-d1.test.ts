import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createTestPlatformProxy } from './helpers/d1.ts';
import {
	decideCandidate,
	listCandidates,
	recordCollectionFinish,
	recordCollectionStart,
	upsertCandidates
} from '../src/lib/server/shopee/candidate-store.ts';
import { collectShopeeCandidates } from '../src/lib/server/shopee/collector.ts';

test('D1 records one immutable price observation per product and collection run', async () => {
	const platform = await createTestPlatformProxy();
	const db = platform.env.CANDIDATES_DB;
	try {
		const random = new Uint32Array(2);
		crypto.getRandomValues(random);
		const itemId = `${random[0]}${random[1]}`;
		const firstShopId = `${random[1]}${random[0]}`;
		const secondShopId = `${random[0]}${random[0]}${random[1]}`;
		const runIds: number[] = [];
		const offer = (
			shopId: string,
			values: {
				price: string;
				priceMin: string;
				priceMax: string;
				priceDiscountRate: number;
				commissionRate: string;
				sales: string;
				ratingStar: string;
			},
			productName: string
		) => ({
			product: {
				itemId,
				shopId,
				productName,
				productLink: null,
				offerLink: null,
				imageUrl: null,
				...values,
				productCatIds: [1]
			},
			rawData: { itemId, shopId, productName, ...values }
		});

		try {
			const firstRunId = await recordCollectionStart(db, 'general', null, 1, 20);
			runIds.push(firstRunId);
			const firstOffers = [
				offer(
					firstShopId,
					{
						price: '19.90',
						priceMin: '18.90',
						priceMax: '21.90',
						priceDiscountRate: 10,
						commissionRate: '0.05',
						sales: '10',
						ratingStar: '4.5'
					},
					'First shop'
				),
				offer(
					secondShopId,
					{
						price: '30.00',
						priceMin: '30.00',
						priceMax: '30.00',
						priceDiscountRate: 5,
						commissionRate: '0.08',
						sales: '3',
						ratingStar: '4.1'
					},
					'Second shop'
				)
			];
			assert.deepEqual(await upsertCandidates(db, firstRunId, firstOffers), {
				newCandidates: 2,
				updatedCandidates: 0
			});

			const observationInsert = db.prepare(
				`INSERT INTO candidate_price_observations (item_id, shop_id, collection_run_id)
				VALUES (?, ?, ?)`
			);
			await assert.rejects(
				() => observationInsert.bind(`missing-${itemId}`, firstShopId, firstRunId).run(),
				/FOREIGN KEY constraint failed/i
			);
			await assert.rejects(
				() => observationInsert.bind(itemId, firstShopId, firstRunId + 1_000_000_000).run(),
				/FOREIGN KEY constraint failed/i
			);

			await upsertCandidates(db, firstRunId, [
				offer(
					firstShopId,
					{
						price: '17.90',
						priceMin: '17.00',
						priceMax: '20.00',
						priceDiscountRate: 12,
						commissionRate: '0.06',
						sales: '12',
						ratingStar: '4.6'
					},
					'Same run duplicate'
				)
			]);
			await recordCollectionFinish(db, firstRunId, {
				queriesPerformed: 1,
				productsFound: 3,
				newCandidates: 2,
				updatedCandidates: 1,
				failures: 0,
				errorCode: null,
				errorMessage: null
			});

			assert.equal(
				await decideCandidate(db, itemId, firstShopId, 'rejected', 'Revisão manual'),
				'decided'
			);
			assert.equal(
				await decideCandidate(db, itemId, firstShopId, 'approved', null),
				'already_decided'
			);
			assert.equal(
				await decideCandidate(db, itemId, firstShopId, 'rejected', 'Outro motivo'),
				'already_decided'
			);
			assert.equal(
				await decideCandidate(db, `${itemId}9`, firstShopId, 'approved', null),
				'not_found'
			);
			const decisions = await db
				.prepare(
					'SELECT decision, rejection_reason FROM candidate_decisions WHERE item_id = ? AND shop_id = ?'
				)
				.bind(itemId, firstShopId)
				.all<{ decision: string; rejection_reason: string | null }>();
			assert.deepEqual(decisions.results, [
				{ decision: 'rejected', rejection_reason: 'Revisão manual' }
			]);

			const secondRunId = await recordCollectionStart(db, 'keyword', 'integration-test', 1, 20);
			runIds.push(secondRunId);
			assert.deepEqual(
				await upsertCandidates(db, secondRunId, [
					offer(
						firstShopId,
						{
							price: '14.90',
							priceMin: '13.90',
							priceMax: '15.90',
							priceDiscountRate: 25,
							commissionRate: '0.10',
							sales: '25',
							ratingStar: '4.9'
						},
						'Latest offer'
					)
				]),
				{ newCandidates: 0, updatedCandidates: 1 }
			);
			await recordCollectionFinish(db, secondRunId, {
				queriesPerformed: 1,
				productsFound: 1,
				newCandidates: 0,
				updatedCandidates: 1,
				failures: 0,
				errorCode: null,
				errorMessage: null
			});
			const observations = await db
				.prepare(
					`SELECT collection_run_id, item_id, shop_id, price, price_min, price_max,
						price_discount_rate, commission_rate, sales, rating_star
					FROM candidate_price_observations
					WHERE item_id = ? AND shop_id = ?
					ORDER BY collection_run_id`
				)
				.bind(itemId, firstShopId)
				.all<{
					collection_run_id: number;
					item_id: string;
					shop_id: string;
					price: string;
					price_min: string;
					price_max: string;
					price_discount_rate: string;
					commission_rate: string;
					sales: string;
					rating_star: string;
				}>();
			assert.equal(observations.results.length, 2);
			assert.deepEqual(
				observations.results.map((row) => [
					row.collection_run_id,
					row.price,
					row.price_min,
					row.price_max,
					row.price_discount_rate,
					row.commission_rate,
					row.sales,
					row.rating_star
				]),
				[
					[firstRunId, '19.90', '18.90', '21.90', '10', '0.05', '10', '4.5'],
					[secondRunId, '14.90', '13.90', '15.90', '25', '0.10', '25', '4.9']
				]
			);

			const [current] = await listCandidates(db, { search: itemId });
			assert.equal(current?.product_name, 'Latest offer');
			assert.equal(current?.price, '14.90');
			assert.equal(current?.status, 'rejected');
			assert.equal(current?.rejection_reason, 'Revisão manual');
			assert.equal(current?.history.observation_count, 2);
			assert.equal(current?.history.min_observed_price, 14.9);
			assert.equal(current?.history.max_observed_price, 19.9);
			assert.equal(current?.history.previous_price, '19.90');
			assert.ok(
				Math.abs((current?.history.price_change_percent ?? 0) - ((14.9 - 19.9) / 19.9) * 100) <
					0.000001
			);
			assert.equal(current?.history.previous_sales, '10');
			assert.equal(current?.history.current_sales, '25');
			assert.equal(current?.history.sales_change, '15');
			assert.equal(current?.history.latest_commission_rate, '0.10');

			const shops = await db
				.prepare('SELECT shop_id FROM candidates WHERE item_id = ? ORDER BY shop_id')
				.bind(itemId)
				.all<{ shop_id: string }>();
			assert.deepEqual(
				shops.results.map((row) => row.shop_id).sort(),
				[firstShopId, secondShopId].sort()
			);
			const firstRunObservationCount = await db
				.prepare(
					`SELECT COUNT(*) AS count FROM candidate_price_observations
					WHERE collection_run_id = ? AND item_id = ? AND shop_id = ?`
				)
				.bind(firstRunId, itemId, firstShopId)
				.first<{ count: number }>();
			assert.equal(firstRunObservationCount?.count, 1);

			const failureTerm = `observation-failure-${itemId}`;
			const failure = await collectShopeeCandidates(
				db,
				{ SHOPEE_APP_ID: 'test-app', SHOPEE_APP_SECRET: 'test-secret' },
				{ searchType: 'keyword', keyword: failureTerm, pages: 1, pageLimit: 20 },
				async () =>
					Response.json({
						errors: [{ message: 'sanitized test failure', extensions: { code: 10030 } }]
					})
			);
			const failedRun = await db
				.prepare(
					'SELECT id FROM candidate_collection_runs WHERE search_term = ? ORDER BY id DESC LIMIT 1'
				)
				.bind(failureTerm)
				.first<{ id: number }>();
			assert.ok(failedRun);
			runIds.push(failedRun.id);
			assert.equal(failure.status, 'failed');
			assert.equal(failure.failures, 1);
			const failedObservationCount = await db
				.prepare(
					'SELECT COUNT(*) AS count FROM candidate_price_observations WHERE collection_run_id = ?'
				)
				.bind(failedRun.id)
				.first<{ count: number }>();
			assert.equal(failedObservationCount?.count, 0);
			for (const runId of runIds) {
				const run = await db
					.prepare('SELECT finished_at FROM candidate_collection_runs WHERE id = ?')
					.bind(runId)
					.first<{ finished_at: string | null }>();
				assert.ok(run?.finished_at, `Coleta ${runId} ficou sem finalização.`);
			}
		} finally {
			for (const runId of runIds) {
				await db
					.prepare('DELETE FROM candidate_price_observations WHERE collection_run_id = ?')
					.bind(runId)
					.run();
			}
			await db
				.prepare('DELETE FROM candidate_decisions WHERE item_id = ? AND shop_id = ?')
				.bind(itemId, firstShopId)
				.run();
			await db
				.prepare('DELETE FROM candidate_decisions WHERE item_id = ? AND shop_id = ?')
				.bind(itemId, secondShopId)
				.run();
			await db.prepare('DELETE FROM candidates WHERE item_id = ?').bind(itemId).run();
			for (const runId of runIds) {
				await db.prepare('DELETE FROM candidate_collection_runs WHERE id = ?').bind(runId).run();
			}
		}
	} finally {
		await platform.dispose();
	}
});
