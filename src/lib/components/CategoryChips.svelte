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
	<div class="mx-auto max-w-7xl px-4 pt-4 sm:px-6">
		<p class="mb-2 text-sm font-extrabold tracking-tight text-lia-navy" id="category-chips-label">
			{label}
		</p>
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
{/if}

<style>
	.chips {
		display: flex;
		gap: 0.5rem;
		padding-bottom: 0.25rem;
		overflow-x: auto;
		scrollbar-width: none;
	}
	.chips::-webkit-scrollbar {
		display: none;
	}
	.chips.sub {
		margin-top: 0.5rem;
	}
	@media (min-width: 768px) {
		.chips {
			flex-wrap: wrap;
			overflow: visible;
		}
	}
	.chip {
		display: inline-flex;
		flex: none;
		min-height: 2.75rem;
		align-items: center;
		gap: 0.4rem;
		padding: 0 1rem;
		border: 1px solid var(--lia-line);
		border-radius: 999px;
		background: #fff;
		color: var(--lia-navy);
		font-size: 0.875rem;
		font-weight: 600;
		white-space: nowrap;
		transition:
			background 150ms,
			border-color 150ms,
			color 150ms;
	}
	.chip:hover {
		border-color: var(--lia-orange);
	}
	.chip.on {
		border-color: var(--lia-navy);
		background: var(--lia-navy);
		color: #fff;
	}
	.count {
		font-size: 0.75rem;
		font-weight: 500;
		opacity: 0.8;
	}
	@media (prefers-reduced-motion: reduce) {
		.chip {
			transition: none;
		}
	}
</style>
