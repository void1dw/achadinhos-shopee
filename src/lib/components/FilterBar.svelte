<script lang="ts">
	import { Heart, SlidersHorizontal } from '@lucide/svelte';
	import { tick } from 'svelte';
	import { fly } from 'svelte/transition';
	import { dragScroll } from '../attachments/dragScroll';
	import { ALL, type Filters } from '../filters.svelte';
	import type { CategorySummary } from '../products';

	type Props = { filters: Filters; categories: CategorySummary[]; favoriteCount: number };
	let { filters, categories, favoriteCount }: Props = $props();

	let searchInput = $state<HTMLInputElement>();

	/** Abre o painel de busca e já põe o cursor no campo (usado pelo botão da hero). */
	export async function openSearch() {
		filters.panelOpen = true;
		await tick();
		searchInput?.focus();
	}

	const field =
		'focus-ring h-9 rounded-full border border-neutral-200 bg-white px-3 text-sm placeholder:text-neutral-400';
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && (filters.panelOpen = false)} />

<!-- Categorias + filtros: uma única barra fina que gruda no topo ao rolar -->
<section
	id="achadinhos"
	class="sticky top-0 z-30 border-y border-lia-line bg-white/95 backdrop-blur"
>
	<div class="mx-auto flex max-w-7xl items-center gap-2 px-4 py-2 sm:px-6">
		<div
			class="chips flex min-w-0 flex-1 gap-1.5 overflow-x-auto"
			role="group"
			aria-label="Categorias"
			{@attach dragScroll}
		>
			<button
				class={['chip', filters.category === ALL && 'on', 'focus-ring']}
				aria-pressed={filters.category === ALL}
				onclick={() => (filters.category = ALL)}
			>
				Todas
			</button>
			{#each categories as c (c.key)}
				<button
					class={['chip', filters.category === c.key && 'on', 'focus-ring']}
					aria-pressed={filters.category === c.key}
					onclick={() => (filters.category = filters.category === c.key ? ALL : c.key)}
				>
					<span aria-hidden="true">{c.emoji}</span>{c.label}
				</button>
			{/each}
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
			class={['icon-btn', (filters.panelOpen || filters.activeCount > 0) && 'on', 'focus-ring']}
			aria-expanded={filters.panelOpen}
			aria-label="Busca e filtros"
			onclick={() => (filters.panelOpen = !filters.panelOpen)}
		>
			<SlidersHorizontal size={15} />
			{#if filters.activeCount > 0}<span class="badge">{filters.activeCount}</span>{/if}
		</button>
	</div>

	{#if filters.panelOpen}
		<div class="border-t border-lia-line bg-lia-cream" transition:fly={{ y: -8, duration: 180 }}>
			<div class="mx-auto flex max-w-7xl flex-wrap items-center gap-2 px-4 py-3 sm:px-6">
				<input
					type="search"
					bind:this={searchInput}
					bind:value={filters.query}
					placeholder="Buscar produto"
					aria-label="Buscar produtos"
					class="{field} w-full sm:w-56"
				/>
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
						class="ml-auto text-xs font-semibold text-lia-orange underline"
						onclick={() => filters.clear()}
					>
						Limpar
					</button>
				{/if}
			</div>
		</div>
	{/if}
</section>

<style>
	.chips {
		padding-right: 36px;
		cursor: grab;
		user-select: none;
		scrollbar-width: none;
		-webkit-overflow-scrolling: touch;
		mask-image: linear-gradient(90deg, #000 calc(100% - 36px), transparent);
	}
	.chips:active {
		cursor: grabbing;
	}
	.chips::-webkit-scrollbar {
		display: none;
	}
	.chip {
		display: inline-flex;
		flex: none;
		align-items: center;
		gap: 0.3rem;
		height: 2rem;
		padding: 0 0.8rem;
		border: 1px solid var(--lia-line);
		border-radius: 999px;
		background: #fff;
		color: #3a475f;
		font-size: 0.78rem;
		font-weight: 600;
		white-space: nowrap;
		transition:
			background 150ms,
			color 150ms,
			border-color 150ms;
	}
	.chip:hover {
		border-color: rgb(244 99 16 / 50%);
	}
	.chip.on {
		border-color: var(--lia-navy);
		background: var(--lia-navy);
		color: #fff;
	}
	.icon-btn {
		position: relative;
		display: grid;
		flex: none;
		place-items: center;
		width: 2.25rem;
		height: 2.25rem;
		border: 1px solid var(--lia-line);
		border-radius: 999px;
		background: #fff;
		color: var(--lia-navy);
	}
	.icon-btn.on {
		border-color: var(--lia-orange);
		color: var(--lia-orange);
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
</style>
