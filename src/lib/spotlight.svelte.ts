import type { ShowcaseProduct } from './types';
import { SvelteSet } from 'svelte/reactivity';

type Slot = ShowcaseProduct | null;

const SLOT_COUNT = 4;
const FEED_SIZE = 3;

const between = (min: number, max: number) => min + Math.random() * (max - min);

/** Primeiros produtos nas posições da órbita. Determinístico, então o servidor e o navegador desenham o mesmo. */
function initialSlots(list: ShowcaseProduct[]): Slot[] {
	const shown = list.slice(0, SLOT_COUNT);
	return Array.from({ length: SLOT_COUNT }, (_, i) => shown[i] ?? null);
}

/**
 * Destaques animados da hero:
 * - `slots`: quatro produtos girando em volta da Lia e trocando um a um;
 * - `feed`: lista de "chegou agora" que entra por cima a cada poucos segundos.
 *
 * Precisa ser chamada durante a inicialização de um componente (usa $effect).
 * Fora da tela os intervalos não alteram a hero. Com "reduzir movimento", as trocas
 * continuam com intervalos mais longos e sem deslocamentos bruscos.
 */
export function createSpotlight(options: {
	items: () => ShowcaseProduct[];
	paused: () => boolean;
}) {
	const { items, paused } = options;

	let slots = $state<Slot[]>(initialSlots(items()));
	let feed = $state<ShowcaseProduct[]>(items().slice(0, FEED_SIZE));

	$effect(() => {
		const list = items();
		slots = initialSlots(list);
		feed = list.slice(0, FEED_SIZE);

		const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
		if (list.length < 2) return;

		let alive = true;
		const timers = new SvelteSet<ReturnType<typeof setTimeout>>();
		const later = (fn: () => void, ms: number) => {
			const timer = setTimeout(() => {
				timers.delete(timer);
				if (alive) fn();
			}, ms);
			timers.add(timer);
		};
		/** Repete `fn` para sempre, pulando as rodadas em que a hero está pausada. */
		const every = (fn: () => void, nextMs: () => number, firstMs = nextMs()) => {
			const tick = () => {
				if (!paused()) fn();
				later(tick, nextMs());
			};
			later(tick, firstMs);
		};

		/* ---- Órbita ---- */
		let shown = list.slice(0, SLOT_COUNT);

		const publish = () => {
			slots = Array.from({ length: SLOT_COUNT }, (_, i) => shown[i] ?? null);
		};
		const pick = (exclude: ShowcaseProduct[]) => {
			const candidates = list.filter((item) => !exclude.some((other) => other.id === item.id));
			const pool = candidates.length ? candidates : list;
			return pool[Math.floor(Math.random() * pool.length)];
		};
		const swapOne = () => {
			if (shown.length < 2) return;
			const index = Math.floor(Math.random() * shown.length);
			const others = shown.filter((_, i) => i !== index);
			shown = shown.map((item, i) => (i === index ? pick([...others, item]) : item));
			publish();
		};

		every(
			swapOne,
			() => between(reduceMotion ? 6500 : 1800, reduceMotion ? 9500 : 4400),
			between(reduceMotion ? 6500 : 1800, reduceMotion ? 9500 : 2800)
		);

		/* ---- Feed ---- */
		let cursor = FEED_SIZE;
		let feedList = list.slice(0, FEED_SIZE);
		every(
			() => {
				const item = list[cursor++ % list.length];
				feedList = [item, ...feedList.filter((entry) => entry.id !== item.id)].slice(0, FEED_SIZE);
				feed = feedList;
			},
			() => (reduceMotion ? 6000 : 2800),
			reduceMotion ? 5000 : 3200
		);

		return () => {
			alive = false;
			timers.forEach(clearTimeout);
		};
	});

	return {
		get slots() {
			return slots;
		},
		get feed() {
			return feed;
		}
	};
}
