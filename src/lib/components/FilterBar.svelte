<script lang="ts">
	import { Heart, Search, SlidersHorizontal, X } from '@lucide/svelte';
	import { tick } from 'svelte';
	import { fly } from 'svelte/transition';
	import type { Filters, Sort } from '../filters.svelte';

	type Props = { filters: Filters; favoriteCount: number };
	let { filters, favoriteCount }: Props = $props();

	let searchInput = $state<HTMLInputElement>();

	/** Leva a pessoa até a busca e posiciona o cursor no campo. */
	export async function openSearch() {
		await tick();
		searchInput?.scrollIntoView({ behavior: 'smooth', block: 'center' });
		searchInput?.focus({ preventScroll: true });
	}

	const field =
		'focus-ring h-11 rounded-full border border-neutral-200 bg-white px-4 text-sm placeholder:text-neutral-500';

	const SORT_CHIPS: { value: Sort; label: string }[] = [
		{ value: 'recentes', label: 'Mais novos' },
		{ value: 'maior-desconto', label: 'Maior desconto' },
		{ value: 'menor-preco', label: 'Menor preço' }
	];
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && (filters.panelOpen = false)} />

<!-- Filtros da vitrine em uma barra fina que gruda no topo ao rolar -->
<section
	id="buscar-produto"
	class="search-sticky sticky top-0 z-30 border-y border-lia-line bg-white/95 backdrop-blur"
>
	<div class="search-inner mx-auto flex max-w-7xl items-center gap-2 px-4 py-2 sm:px-6">
		<div class="relative min-w-0 flex-1">
			<label for="product-search" class="sr-only">Buscar produtos</label>
			<Search
				size={17}
				aria-hidden="true"
				class="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-lia-muted"
			/>
			<input
				id="product-search"
				type="search"
				bind:this={searchInput}
				bind:value={filters.query}
				placeholder="Buscar produto"
				class="h-11 w-full rounded-full border border-lia-line bg-white py-2 pr-10 pl-10 text-base text-lia-ink focus-ring placeholder:text-lia-muted focus:border-lia-orange sm:text-sm"
			/>
			{#if filters.query}
				<button
					type="button"
					class="absolute top-1/2 right-2 grid size-8 -translate-y-1/2 place-items-center rounded-full text-lia-muted focus-ring hover:bg-lia-cream hover:text-lia-navy"
					aria-label="Limpar busca"
					onclick={() => {
						filters.query = '';
						searchInput?.focus();
					}}
				>
					<X size={15} />
				</button>
			{/if}
		</div>
		<button
			class={['icon-btn', filters.favoritesOnly && 'on', 'focus-ring']}
			aria-pressed={filters.favoritesOnly}
			aria-label={filters.favoritesOnly ? 'Mostrar todos os produtos' : 'Mostrar favoritos'}
			title="Favoritos"
			onclick={() => (filters.favoritesOnly = !filters.favoritesOnly)}
		>
			<Heart size={15} fill={filters.favoritesOnly ? 'currentColor' : 'none'} />
			{#if favoriteCount > 0}<span class="badge">{favoriteCount}</span>{/if}
		</button>
		<button
			class={['filter-btn', (filters.panelOpen || filters.activeCount > 0) && 'on', 'focus-ring']}
			aria-expanded={filters.panelOpen}
			aria-controls="advanced-filters"
			onclick={() => (filters.panelOpen = !filters.panelOpen)}
		>
			<SlidersHorizontal size={15} />
			<span>Filtros</span>
			{#if filters.activeCount > 0}<span class="badge">{filters.activeCount}</span>{/if}
		</button>
	</div>
</section>

<!-- Ordenação e filtros avançados ficam fora da área fixa: rolam junto com a página -->
<section class="sort-section border-b border-lia-line">
	<div class="sort-inner mx-auto flex max-w-7xl items-center gap-2 px-4 py-2 sm:px-6">
		<span class="sort-label shrink-0" id="sort-label">Ordenar por</span>
		<div class="sort-row" role="group" aria-labelledby="sort-label">
			{#each SORT_CHIPS as chip (chip.value)}
				<button
					type="button"
					class={['chip', filters.sort === chip.value && 'on', 'focus-ring']}
					aria-pressed={filters.sort === chip.value}
					onclick={() => (filters.sort = chip.value)}
				>
					{chip.label}
				</button>
			{/each}
		</div>
	</div>

	<div id="advanced-filters" aria-hidden={!filters.panelOpen} inert={!filters.panelOpen}>
		{#if filters.panelOpen}
			<div
				class="advanced-panel border-t border-lia-line bg-lia-cream"
				transition:fly={{ y: -8, duration: 180 }}
			>
				<div
					class="advanced-inner mx-auto flex max-w-7xl flex-wrap items-center gap-2 px-4 py-3 sm:px-6"
				>
					<select bind:value={filters.sort} aria-label="Ordenar" class={field}>
						<option value="recentes">Mais novos</option>
						<option value="maior-desconto">Maior desconto</option>
						<option value="menor-preco">Menor preço</option>
						<option value="maior-preco">Maior preço</option>
					</select>
					<input
						inputmode="decimal"
						bind:value={filters.minPrice}
						placeholder="R$ mín."
						aria-label="Preço mínimo"
						class="{field} w-24"
					/>
					<input
						inputmode="decimal"
						bind:value={filters.maxPrice}
						placeholder="R$ máx."
						aria-label="Preço máximo"
						class="{field} w-24"
					/>
					<button
						class={['chip', filters.discountOnly && 'on', 'focus-ring']}
						aria-pressed={filters.discountOnly}
						onclick={() => (filters.discountOnly = !filters.discountOnly)}
					>
						Com desconto
					</button>
					{#if filters.dirty}
						<button
							class="ml-auto min-h-11 px-2 text-sm font-semibold text-lia-orange underline"
							onclick={() => filters.clear()}
						>
							Limpar
						</button>
					{/if}
				</div>
			</div>
		{/if}
	</div>
</section>

<style>
	.search-sticky {
		border-color: rgb(13 40 107 / 10%);
		background: rgb(255 253 248 / 96%);
		box-shadow: 0 7px 18px rgb(13 40 107 / 7%);
	}
	.search-inner {
		min-height: 4.25rem;
	}
	.sort-section {
		border-color: rgb(13 40 107 / 8%);
		background: linear-gradient(180deg, #fffdf8, #fff);
	}
	.sort-inner {
		min-height: 3.75rem;
		flex-wrap: wrap;
		row-gap: 0.5rem;
	}
	.sort-label {
		margin-right: 0.2rem;
		color: #a64b18;
		font-size: 0.67rem;
		font-weight: 850;
		letter-spacing: 0.1em;
		text-transform: uppercase;
	}
	.chip {
		display: inline-flex;
		flex: none;
		align-items: center;
		gap: 0.3rem;
		height: 2.75rem;
		padding: 0 0.9rem;
		border: 1px solid #e8e4dc;
		border-radius: 999px;
		background: rgb(255 255 255 / 90%);
		color: #34425b;
		font-size: 0.78rem;
		font-weight: 650;
		white-space: nowrap;
		transition:
			background 150ms,
			color 150ms,
			border-color 150ms,
			box-shadow 150ms;
	}
	.sort-row {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
		min-width: 0;
	}
	.chip:hover {
		border-color: rgb(244 99 16 / 50%);
	}
	.chip.on {
		border-color: var(--lia-navy);
		background: var(--lia-navy);
		color: #fff;
		box-shadow: 0 3px 9px rgb(13 40 107 / 16%);
	}
	.icon-btn {
		position: relative;
		display: grid;
		flex: none;
		place-items: center;
		width: 2.75rem;
		height: 2.75rem;
		border: 1px solid var(--lia-line);
		border-radius: 999px;
		background: #fff;
		color: var(--lia-navy);
	}
	.icon-btn.on {
		border-color: var(--lia-orange);
		color: var(--lia-orange);
	}
	.filter-btn {
		position: relative;
		display: inline-flex;
		flex: none;
		align-items: center;
		justify-content: center;
		gap: 0.4rem;
		min-height: 2.75rem;
		padding: 0 0.9rem;
		border: 1px solid var(--lia-line);
		border-radius: 999px;
		background: #fff;
		color: var(--lia-navy);
		font-size: 0.78rem;
		font-weight: 700;
	}
	.filter-btn.on {
		border-color: var(--lia-orange);
		color: var(--lia-orange);
		background: #fff7ed;
	}
	.advanced-panel {
		border-color: rgb(13 40 107 / 9%);
		background: #f8f6f0;
	}
	.advanced-inner {
		padding-top: 1rem;
		padding-bottom: 1rem;
	}
	.badge {
		position: absolute;
		top: -4px;
		right: -4px;
		display: grid;
		place-items: center;
		min-width: 16px;
		height: 16px;
		border-radius: 99px;
		background: var(--lia-orange);
		color: #fff;
		font-size: 10px;
		font-weight: 700;
	}
	@media (max-width: 639px) {
		.sort-inner {
			align-items: flex-start;
			padding-top: 0.7rem;
			padding-bottom: 0.75rem;
		}
		.sort-label {
			width: 100%;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.chip {
			transition: none;
		}
	}
</style>
