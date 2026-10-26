<script lang="ts">
	import { resolve } from '$app/paths';
	import { trackCategorySelection } from '../analytics';

	let {
		categories,
		heading = 'Explore por categoria',
		exclude = ''
	}: {
		categories: { slug: string; label: string; count: number }[];
		heading?: string;
		exclude?: string;
	} = $props();

	const visibleCategories = $derived(
		categories.filter((category) => category.slug !== exclude)
	);
</script>

{#if visibleCategories.length > 0}
	<nav aria-label={heading} class="mx-auto max-w-7xl px-4 py-5 sm:px-6">
		<h2 class="mb-3 text-lg font-extrabold tracking-tight text-lia-navy">{heading}</h2>
		<ul class="flex flex-wrap gap-2">
			{#each visibleCategories as category (category.slug)}
				<li>
					<a
						href={resolve('/categoria/[slug]', { slug: category.slug })}
						onclick={() => trackCategorySelection(category.label)}
						class="inline-flex min-h-10 items-center gap-2 rounded-full border border-lia-line bg-white px-4 py-2 text-sm font-semibold text-lia-navy transition hover:border-lia-orange hover:text-lia-orange focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lia-orange"
					>
						{category.label}
						<span class="text-xs font-medium text-lia-muted">{category.count}</span>
					</a>
				</li>
			{/each}
		</ul>
	</nav>
{/if}
