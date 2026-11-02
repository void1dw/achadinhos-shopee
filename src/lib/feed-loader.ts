import type { ShowcaseProduct } from './types';

export type FeedState = {
	/** Chave da lista pedida ('' = todos os Achadinhos, ou o slug da categoria). */
	key: string;
	items: ShowcaseProduct[] | null;
	status: 'idle' | 'loading' | 'error';
};

export const EMPTY_FEED: FeedState = { key: '', items: null, status: 'idle' };

/**
 * Carrega a lista completa sob demanda: uma requisição por chave (chamadas simultâneas
 * compartilham a mesma), resultado de chave antiga é descartado e erro permite nova tentativa.
 */
export class FeedLoader {
	#state: FeedState = EMPTY_FEED;
	#inflight: Promise<boolean> | undefined;
	#load: (key: string) => Promise<ShowcaseProduct[]>;
	#onchange: (state: FeedState) => void;

	constructor(
		load: (key: string) => Promise<ShowcaseProduct[]>,
		onchange: (state: FeedState) => void
	) {
		this.#load = load;
		this.#onchange = onchange;
	}

	#set(state: FeedState) {
		this.#state = state;
		this.#onchange(state);
	}

	/** Resolve true quando a lista de `key` está disponível; false se a carga falhou ou ficou obsoleta. */
	ensure(key = ''): Promise<boolean> {
		if (this.#state.key !== key) {
			this.#inflight = undefined;
			this.#set({ key, items: null, status: 'idle' });
		}
		if (this.#state.items) return Promise.resolve(true);
		if (this.#inflight) return this.#inflight;

		this.#set({ key, items: null, status: 'loading' });
		const request: Promise<boolean> = this.#load(key)
			.then((items) => {
				if (this.#state.key !== key) return false;
				this.#set({ key, items, status: 'idle' });
				return true;
			})
			.catch(() => {
				if (this.#state.key === key) this.#set({ key, items: null, status: 'error' });
				return false;
			})
			.finally(() => {
				if (this.#inflight === request) this.#inflight = undefined;
			});
		this.#inflight = request;
		return request;
	}
}
