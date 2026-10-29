<script lang="ts">
	type Category = { slug: string; label: string; count: number; children?: Category[] };

	type Props = {
		categories: Category[];
		/** Id da categoria ativa em qualquer nível ('' = nenhuma). */
		selected: string;
		onselect: (slug: string) => void;
		label?: string;
		allLabel?: string;
	};
	let {
		categories,
		selected,
		onselect,
		label = 'Filtrar por categoria',
		allLabel = 'Todas'
	}: Props = $props();

	function pathTo(nodes: Category[], id: string): Category[] {
		for (const node of nodes) {
			if (node.slug === id) return [node];
			const below = pathTo(node.children ?? [], id);
			if (below.length > 0) return [node, ...below];
		}
		return [];
	}

	const path = $derived(selected ? pathTo(categories, selected) : []);
	// Linha 1: raiz; linha 2: filhos da raiz ativa; linha 3: filhos do segundo nível ativo.
	const rows = $derived(
		[0, 1].flatMap((depth) => {
			const parent = path[depth];
			return parent && (parent.children?.length ?? 0) > 0 ? [parent] : [];
		})
	);
</script>

{#snippet chip(category: Category, active: boolean, text: string, showCount: boolean)}
	<button
		type="button"
		class={['chip', active && 'on', 'focus-ring']}
		aria-pressed={active}
		onclick={() => onselect(category.slug)}
	>
		{text}
		{#if showCount}<span class="count">{category.count}</span>{/if}
	</button>
{/snippet}

{#if categories.length > 0}
	<div class="mx-auto max-w-7xl px-4 pt-5 sm:px-6">
		<div class="category-panel">
			<div class="category-heading">
				<span class="category-kicker">Explore a vitrine</span>
				<p id="category-chips-label">{label}</p>
			</div>
			<div class="chips" role="group" aria-labelledby="category-chips-label">
				<button
					type="button"
					class={['chip', selected === '' && 'on', 'focus-ring']}
					aria-pressed={selected === ''}
					onclick={() => onselect('')}
				>
					{allLabel}
				</button>
				{#each categories as category (category.slug)}
					{@render chip(category, path[0]?.slug === category.slug, category.label, true)}
				{/each}
			</div>
			{#each rows as parent, depth (parent.slug)}
				<div class="chips sub" role="group" aria-label={`Subcategorias de ${parent.label}`}>
					{@render chip(parent, selected === parent.slug, `Tudo em ${parent.label}`, true)}
					{#each parent.children ?? [] as child (child.slug)}
						{@render chip(child, path[depth + 1]?.slug === child.slug, child.label, true)}
					{/each}
				</div>
			{/each}
		</div>
	</div>
{/if}

<style>
	.category-panel {
		padding: 1rem 1.1rem 1.05rem;
		border: 1px solid var(--lia-line);
		border-radius: 1.15rem;
		background:
			radial-gradient(ellipse at 100% 0%, rgb(251 198 25 / 12%), transparent 34%),
			linear-gradient(135deg, #fffdf8, #fff);
		box-shadow: 0 8px 24px rgb(13 40 107 / 5%);
	}
	.category-heading {
		display: flex;
		align-items: baseline;
		gap: 0.6rem;
		margin-bottom: 0.7rem;
	}
	.category-kicker {
		color: #a64b18;
		font-size: 0.65rem;
		font-weight: 800;
		letter-spacing: 0.12em;
		text-transform: uppercase;
	}
	.category-heading p {
		color: var(--lia-navy);
		font-size: 0.95rem;
		font-weight: 850;
		letter-spacing: -0.02em;
	}
	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 0.45rem;
		overflow-x: auto;
		scrollbar-width: none;
	}
	.chips::-webkit-scrollbar {
		display: none;
	}
	.chips.sub {
		position: relative;
		margin-top: 0.6rem;
		padding: 0.65rem 0 0 0.85rem;
		border-top: 1px solid rgb(13 40 107 / 8%);
	}
	.chip {
		display: inline-flex;
		flex: none;
		min-height: 2.75rem;
		align-items: center;
		gap: 0.4rem;
		padding: 0 0.9rem;
		border: 1px solid var(--lia-line);
		border-radius: 999px;
		background: rgb(255 255 255 / 88%);
		color: #34425b;
		font-size: 0.8125rem;
		font-weight: 600;
		white-space: nowrap;
		transition:
			background 150ms,
			border-color 150ms,
			color 150ms,
			transform 150ms,
			box-shadow 150ms;
	}
	.chip:hover {
		transform: translateY(-1px);
		border-color: rgb(244 99 16 / 55%);
		box-shadow: 0 3px 9px rgb(13 40 107 / 7%);
	}
	.chip.on {
		border-color: var(--lia-navy);
		background: var(--lia-navy);
		color: #fff;
		box-shadow: 0 3px 9px rgb(13 40 107 / 16%);
	}
	.count {
		display: inline-grid;
		min-width: 1.25rem;
		height: 1.25rem;
		place-items: center;
		padding: 0 0.3rem;
		border-radius: 999px;
		background: rgb(13 40 107 / 6%);
		font-size: 0.75rem;
		font-weight: 500;
		line-height: 1;
	}
	.chip.on .count {
		background: rgb(255 255 255 / 16%);
		color: #fff;
	}
	@media (min-width: 640px) {
		.chips {
			overflow: visible;
		}
	}
	@media (max-width: 639px) {
		.category-panel {
			padding: 0.9rem 0.85rem;
		}
		.chips {
			flex-wrap: nowrap;
			overflow-x: auto;
			padding: 0.1rem 0.05rem 0.35rem;
			scroll-snap-type: x proximity;
		}
		.chips.sub {
			flex-wrap: nowrap;
			padding-left: 0.6rem;
		}
		.chip {
			scroll-snap-align: start;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.chip {
			transition: none;
		}
		.chip:hover {
			transform: none;
		}
	}
</style>
