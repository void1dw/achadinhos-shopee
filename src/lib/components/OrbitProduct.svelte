<script lang="ts">
	import type { ShowcaseProduct } from '../types';
	import OrbitCard from './OrbitCard.svelte';

	let { product }: { product: ShowcaseProduct | null } = $props();

	let displayedProduct = $state<ShowcaseProduct | null>(null);
	let initialized = $state(false);
	let leaving = $state(false);
	let visibleProduct = $derived(initialized ? displayedProduct : product);

	$effect(() => {
		const incoming = product;
		if (!initialized) {
			displayedProduct = incoming;
			initialized = true;
			return;
		}
		if (incoming?.id === displayedProduct?.id) return;

		leaving = true;
		const timer = setTimeout(() => {
			displayedProduct = incoming;
			leaving = false;
		}, 260);

		return () => clearTimeout(timer);
	});
</script>

{#if visibleProduct}
	<div class:leaving class="carousel-card">
		<OrbitCard product={visibleProduct} />
	</div>
{/if}

<style>
	.carousel-card.leaving {
		opacity: 0;
		transition: opacity 240ms ease-out;
	}

	@media (prefers-reduced-motion: reduce) {
		.carousel-card.leaving {
			transition: none;
		}
	}
</style>
