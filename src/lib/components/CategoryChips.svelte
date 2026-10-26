<script lang="ts">
	type Category = { slug: string; label: string; count: number };

	type Props = {
		categories: Category[];
		/** Slug da categoria ativa ('' = todas). */
		selected: string;
		onselect: (slug: string) => void;
	};
	let { categories, selected, onselect }: Props = $props();
</script>

{#if categories.length > 0}
	<div class="mx-auto max-w-7xl px-4 pt-4 sm:px-6">
		<p class="mb-2 text-sm font-extrabold tracking-tight text-lia-navy" id="category-chips-label">
			Filtrar por categoria
		</p>
		<div class="chips" role="group" aria-labelledby="category-chips-label">
			<button
				type="button"
				class={['chip', selected === '' && 'on', 'focus-ring']}
				aria-pressed={selected === ''}
				onclick={() => onselect('')}
			>
				Todas
			</button>
			{#each categories as category (category.slug)}
				<button
					type="button"
					class={['chip', selected === category.slug && 'on', 'focus-ring']}
					aria-pressed={selected === category.slug}
					onclick={() => onselect(category.slug)}
				>
					{category.label}
					<span class="count">{category.count}</span>
				</button>
			{/each}
		</div>
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
