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

	const visibleCategories = $derived(categories.filter((category) => category.slug !== exclude));
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
						class="category-link inline-flex min-h-10 items-center gap-2 rounded-full border border-lia-line bg-[#f2eee2] px-4 py-2 text-sm font-semibold text-lia-navy transition duration-150 hover:-translate-y-0.5 hover:border-lia-orange hover:bg-white hover:text-lia-orange hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lia-orange motion-reduce:transition-none motion-reduce:hover:translate-y-0"
					>
						{category.label}
						<span class="rounded-full bg-white px-1.5 text-xs font-semibold text-lia-muted"
							>{category.count}</span
						>
					</a>
				</li>
			{/each}
		</ul>
	</nav>
{/if}
