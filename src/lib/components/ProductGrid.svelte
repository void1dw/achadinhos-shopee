<script lang="ts">
	/* eslint-disable svelte/no-navigation-without-resolve -- Links de ofertas apontam para URLs externas da Shopee. */
	import { Plus } from '@lucide/svelte';
	import { isCountableProductClick, trackProductListClick } from '../analytics';
	import { priceLabel } from '../format';
	import type { ShowcaseProduct } from '../types';
	import ProductCard from './ProductCard.svelte';

	type Props = {
		/** Produtos já filtrados e ordenados. */
		items: ShowcaseProduct[];
		/** Total de produtos antes de filtrar (para o contador). */
		total: number;
		/** Ids que ganham a etiqueta "novo". */
		newIds: Set<string>;
		/** O catálogo não carregou (D1 ausente ou com erro). */
		unavailable: boolean;
		/** Há filtros ligados (mostra o atalho "Limpar filtros"). */
		canClear: boolean;
		onclear: () => void;
		favoriteIds: string[];
		recentItems: ShowcaseProduct[];
		onfavorite: (id: string) => void;
		onview: (id: string) => void;
		itemListId: string;
		itemListName: string;
		/** Categorias sugeridas quando a busca não encontra nada. */
		suggestions?: { slug: string; label: string }[];
		onsuggest?: (slug: string) => void;
		/** O HTML trouxe só os primeiros produtos; a lista completa ainda não chegou. */
		partial?: boolean;
		/** O resultado depende da lista completa e ela ainda não está disponível. */
		blocked?: boolean;
		/** A lista completa está sendo carregada. */
		loading?: boolean;
		/** A última tentativa de carregar a lista completa falhou. */
		failed?: boolean;
		/** Pede a lista completa; resolve true se ela ficou disponível. */
		onrequestfull?: () => Promise<boolean>;
	};
	let {
		items,
		total,
		newIds,
		unavailable,
		canClear,
		onclear,
		favoriteIds,
		recentItems,
		onfavorite,
		onview,
		itemListId,
		itemListName,
		suggestions = [],
		onsuggest,
		partial = false,
		blocked = false,
		loading = false,
		failed = false,
		onrequestfull
	}: Props = $props();

	const PAGE_SIZE = 40;

	/* Volta para a primeira página sempre que a lista filtrada muda; "Ver mais" soma por cima. */
	let visible = $derived.by(() => {
		void items;
		return PAGE_SIZE;
	});
	const shownCount = $derived(Math.min(visible, items.length));

	let loadingMore = $state(false);
	let moreFailed = $state(false);

	async function showMore() {
		if (loadingMore) return;
		if (partial) {
			loadingMore = true;
			moreFailed = false;
			const ok = (await onrequestfull?.()) ?? false;
			loadingMore = false;
			if (!ok) {
				moreFailed = true;
				return;
			}
		}
		visible += PAGE_SIZE;
	}

	const handleRecentClick = (product: ShowcaseProduct) => (event: MouseEvent) => {
		if (!isCountableProductClick(event)) return;
		onview(product.id);
		trackProductListClick(product, 'recent_products', 'Produtos vistos recentemente');
	};
</script>

<section id="produtos" class="mx-auto max-w-7xl px-4 py-5 sm:px-6">
	<h2 class="sr-only">Achadinhos</h2>

	{#if unavailable}
		<p class="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
			Não foi possível buscar os produtos agora. Tente de novo em instantes.
		</p>
	{:else if blocked}
		<div class="empty" role="status" aria-live="polite">
			{#if failed && !loading}
				<p class="empty-title">Não foi possível carregar todos os produtos.</p>
				<p class="empty-text">
					Verifique sua conexão e tente de novo. Seus favoritos continuam salvos.
				</p>
				<button type="button" class="empty-clear focus-ring" onclick={() => void onrequestfull?.()}>
					Tentar de novo
				</button>
				{#if canClear}
					<button type="button" class="empty-chip focus-ring" onclick={onclear}>
						Limpar busca e filtros
					</button>
				{/if}
			{:else}
				<span class="spinner" aria-hidden="true"></span>
				<p class="empty-title">Buscando em todos os achadinhos…</p>
			{/if}
		</div>
	{:else}
		<p class="mb-3 text-sm text-lia-muted" aria-live="polite">
			{#if items.length === 0}
				Nenhum produto encontrado
			{:else if partial}
				Mostrando {shownCount} de {total} produtos
			{:else}
				Mostrando {shownCount} de {items.length} produtos{#if items.length !== total}{' '}(filtrados
					de {total}){/if}
			{/if}
		</p>

		{#if items.length === 0}
			<div class="empty">
				<p class="empty-title">Não encontramos produtos com esses critérios.</p>
				<p class="empty-text">
					Revise a busca ou os filtros{suggestions.length > 0
						? ', ou continue por uma categoria'
						: ''}.
				</p>
				{#if canClear}
					<button type="button" class="empty-clear focus-ring" onclick={onclear}>
						Limpar busca e filtros
					</button>
				{/if}
				{#if suggestions.length > 0 && onsuggest}
					<div class="empty-chips">
						{#each suggestions as suggestion (suggestion.slug)}
							<button
								type="button"
								class="empty-chip focus-ring"
								onclick={() => onsuggest(suggestion.slug)}
							>
								{suggestion.label}
							</button>
						{/each}
					</div>
				{/if}
			</div>
		{:else}
			<div class="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 lg:gap-4">
				{#each items.slice(0, visible) as product, index (product.id)}
					<ProductCard
						{product}
						{index}
						isNew={newIds.has(product.id)}
						isFavorite={favoriteIds.includes(product.id)}
						{onfavorite}
						{onview}
						onproductclick={(product) => trackProductListClick(product, itemListId, itemListName)}
					/>
				{/each}
			</div>

			{#if recentItems.length > 0}
				<section class="recent" aria-labelledby="recent-heading">
					<div class="recent-heading">
						<div>
							<p class="recent-kicker">Pra continuar de onde parou</p>
							<h2 id="recent-heading">Vistos recentemente</h2>
						</div>
						<span>{recentItems.length} {recentItems.length === 1 ? 'produto' : 'produtos'}</span>
					</div>
					<div class="recent-list">
						{#each recentItems as product (product.id)}
							<a
								class="recent-item focus-ring"
								href={product.url}
								target="_blank"
								rel="noopener noreferrer sponsored"
								onclick={handleRecentClick(product)}
								onauxclick={handleRecentClick(product)}
							>
								<img src={product.image} alt="" width="52" height="52" loading="lazy" />
								<span class="recent-text">
									<span class="recent-name">{product.name}</span>
									<strong>{priceLabel(product)}</strong>
								</span>
							</a>
						{/each}
					</div>
				</section>
			{/if}

			{#if visible < items.length || partial}
				<div class="mt-6 text-center">
					<button
						class="load-more focus-ring"
						onclick={showMore}
						disabled={loadingMore}
						aria-busy={loadingMore}
					>
						<span>{loadingMore ? 'Carregando…' : 'Ver mais achados'}</span>
						<span class="load-more-icon" aria-hidden="true"><Plus size={16} /></span>
					</button>
					{#if moreFailed}
						<p class="more-failed" role="alert">
							Não foi possível carregar mais produtos agora. Toque em “Ver mais achados” para tentar
							de novo.
						</p>
					{/if}
				</div>
			{/if}
		{/if}
	{/if}
</section>

<style>
	.empty {
		display: grid;
		justify-items: center;
		gap: 0.6rem;
		padding: 3rem 1rem;
		text-align: center;
	}
	.empty-title {
		color: var(--lia-navy);
		font-size: 1.05rem;
		font-weight: 800;
	}
	.empty-text {
		color: var(--lia-muted);
		font-size: 0.875rem;
	}
	.empty-clear {
		min-height: 2.75rem;
		padding: 0 1.2rem;
		border-radius: 999px;
		background: #c94a08;
		color: #fff;
		font-size: 0.875rem;
		font-weight: 800;
	}
	.empty-chips {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: 0.5rem;
		margin-top: 0.4rem;
	}
	.empty-chip {
		min-height: 2.75rem;
		padding: 0 1rem;
		border: 1px solid var(--lia-line);
		border-radius: 999px;
		background: #fff;
		color: var(--lia-navy);
		font-size: 0.875rem;
		font-weight: 600;
	}
	.empty-chip:hover {
		border-color: var(--lia-orange);
	}
	.spinner {
		width: 1.6rem;
		height: 1.6rem;
		border: 3px solid var(--lia-line);
		border-top-color: var(--lia-orange);
		border-radius: 50%;
		animation: spin 800ms linear infinite;
	}
	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.spinner {
			animation-duration: 2s;
		}
	}
	.more-failed {
		margin-top: 0.75rem;
		color: #73521d;
		font-size: 0.8125rem;
	}
	.load-more:disabled {
		cursor: progress;
		opacity: 0.8;
	}
	.load-more {
		position: relative;
		display: inline-flex;
		align-items: center;
		gap: 0.7rem;
		overflow: hidden;
		padding: 0.65rem 0.75rem 0.65rem 1.25rem;
		border: 1px solid rgb(255 255 255 / 15%);
		border-radius: 999px;
		background: linear-gradient(110deg, var(--lia-navy), #17418b);
		color: #fff;
		box-shadow: 0 5px 14px rgb(13 40 107 / 18%);
		font-size: 0.85rem;
		font-weight: 750;
		transition:
			transform 200ms ease,
			box-shadow 200ms ease,
			background 200ms ease;
	}
	.load-more::before {
		position: absolute;
		inset: 0;
		background: linear-gradient(
			110deg,
			transparent 25%,
			rgb(255 255 255 / 22%) 50%,
			transparent 75%
		);
		content: '';
		transform: translateX(-120%);
	}
	.load-more:hover,
	.load-more:focus-visible {
		transform: translateY(-3px);
		background: linear-gradient(110deg, #123579, #1b4b9a);
		box-shadow: 0 9px 20px rgb(13 40 107 / 26%);
	}
	.load-more:hover::before,
	.load-more:focus-visible::before {
		animation: button-shine 700ms ease-out;
	}
	.load-more-icon {
		display: grid;
		width: 1.7rem;
		height: 1.7rem;
		place-items: center;
		border-radius: 50%;
		background: var(--lia-yellow);
		color: var(--lia-navy);
		transition:
			transform 200ms ease,
			background 200ms ease;
	}
	.load-more:hover .load-more-icon,
	.load-more:focus-visible .load-more-icon {
		transform: rotate(90deg) scale(1.08);
		background: #ffd64f;
	}
	@keyframes button-shine {
		to {
			transform: translateX(120%);
		}
	}
	.recent {
		margin: 0.9rem 0 1.5rem;
		overflow: hidden;
		border: 1px solid rgb(13 40 107 / 9%);
		border-radius: 18px;
		background:
			radial-gradient(ellipse at 100% 0%, rgb(251 198 25 / 14%), transparent 42%),
			linear-gradient(115deg, #fff 10%, #fffaf0 100%);
		padding: 1rem;
	}
	.recent-heading {
		display: flex;
		align-items: end;
		justify-content: space-between;
		gap: 1rem;
		margin-bottom: 0.75rem;
	}
	.recent-kicker {
		color: var(--lia-orange);
		font-size: 0.75rem;
		font-weight: 800;
		letter-spacing: 0.12em;
		text-transform: uppercase;
	}
	.recent-heading h2 {
		color: var(--lia-navy);
		font-size: 1rem;
		font-weight: 800;
		letter-spacing: -0.02em;
	}
	.recent-heading > span {
		color: var(--lia-muted);
		font-size: 0.8125rem;
	}
	.recent-list {
		display: grid;
		grid-auto-columns: minmax(210px, 1fr);
		grid-auto-flow: column;
		gap: 0.65rem;
		overflow-x: auto;
		padding: 0.15rem 0.15rem 0.4rem;
		scrollbar-width: thin;
		scrollbar-color: rgb(13 40 107 / 18%) transparent;
	}
	.recent-item {
		display: flex;
		min-width: 0;
		align-items: center;
		gap: 0.65rem;
		padding: 0.45rem;
		border: 1px solid var(--lia-line);
		border-radius: 13px;
		background: rgb(255 255 255 / 88%);
		transition:
			transform 180ms,
			border-color 180ms,
			box-shadow 180ms;
	}
	.recent-item:hover {
		transform: translateY(-2px);
		border-color: rgb(244 99 16 / 38%);
		box-shadow: 0 6px 16px rgb(13 40 107 / 8%);
	}
	.recent-item img {
		flex: none;
		width: 52px;
		height: 52px;
		border-radius: 9px;
		background: #f8f6f0;
		object-fit: cover;
	}
	.recent-text {
		display: grid;
		min-width: 0;
		gap: 0.25rem;
	}
	.recent-name {
		overflow: hidden;
		color: var(--lia-ink);
		font-size: 0.8125rem;
		font-weight: 600;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.recent-text strong {
		color: var(--lia-navy);
		font-size: 0.875rem;
	}

	@media (max-width: 639px) {
		.recent {
			margin-right: -0.25rem;
			margin-left: -0.25rem;
			padding: 0.8rem;
		}
		.recent-list {
			grid-auto-columns: minmax(190px, 78vw);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.recent-item,
		.load-more,
		.load-more-icon {
			transition: none;
		}
		.load-more:hover,
		.load-more:focus-visible {
			transform: none;
		}
		.load-more:hover::before,
		.load-more:focus-visible::before {
			animation: none;
		}
	}
</style>
