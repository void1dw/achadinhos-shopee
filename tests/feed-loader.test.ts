import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EMPTY_FEED, FeedLoader, type FeedState } from '../src/lib/feed-loader.ts';
import type { ShowcaseProduct } from '../src/lib/types.ts';

const item = (id: string) => ({ id }) as unknown as ShowcaseProduct;

function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (reason: unknown) => void;
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}

function setup(load: (key: string) => Promise<ShowcaseProduct[]>) {
	let state: FeedState = EMPTY_FEED;
	const loader = new FeedLoader(load, (next) => (state = next));
	return { loader, state: () => state };
}

test('chamadas simultâneas compartilham uma única requisição', async () => {
	let calls = 0;
	const gate = deferred<ShowcaseProduct[]>();
	const { loader, state } = setup(() => {
		calls++;
		return gate.promise;
	});
	const first = loader.ensure('');
	const second = loader.ensure('');
	assert.equal(state().status, 'loading');
	gate.resolve([item('a')]);
	assert.deepEqual(await Promise.all([first, second]), [true, true]);
	assert.equal(calls, 1);
	assert.equal(state().status, 'idle');
	assert.equal(state().items?.length, 1);
	assert.equal(await loader.ensure(''), true);
	assert.equal(calls, 1);
});

test('falha vira estado de erro sem itens e permite nova tentativa', async () => {
	let calls = 0;
	const { loader, state } = setup(async () => {
		calls++;
		if (calls === 1) throw new Error('offline');
		return [item('a'), item('b')];
	});
	assert.equal(await loader.ensure(''), false);
	assert.equal(state().status, 'error');
	assert.equal(state().items, null);
	assert.equal(await loader.ensure(''), true);
	assert.equal(calls, 2);
	assert.equal(state().items?.length, 2);
});

test('resposta de uma categoria antiga não sobrescreve a categoria atual', async () => {
	const slow = deferred<ShowcaseProduct[]>();
	const { loader, state } = setup((key) =>
		key === 'moda' ? slow.promise : Promise.resolve([item('c1')])
	);
	const moda = loader.ensure('moda');
	assert.equal(await loader.ensure('casa'), true);
	slow.resolve([item('m1'), item('m2')]);
	assert.equal(await moda, false);
	assert.equal(state().key, 'casa');
	assert.deepEqual(
		state().items?.map((p) => p.id),
		['c1']
	);
});

test('erro de uma chave obsoleta não derruba o estado da chave atual', async () => {
	const slow = deferred<ShowcaseProduct[]>();
	const { loader, state } = setup((key) =>
		key === 'moda' ? slow.promise : Promise.resolve([item('c1')])
	);
	const moda = loader.ensure('moda');
	await loader.ensure('casa');
	slow.reject(new Error('timeout'));
	assert.equal(await moda, false);
	assert.equal(state().status, 'idle');
	assert.equal(state().items?.length, 1);
});
