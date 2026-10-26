<script lang="ts">
	import { Search, Sparkles } from '@lucide/svelte';
	import { createSpotlight } from '../spotlight.svelte';
	import type { ShowcaseProduct } from '../types';
	import HeroFeed from './HeroFeed.svelte';
	import LiaStage from './LiaStage.svelte';

	type Props = {
		/** Os melhores achados do momento (alimentam a órbita e a lista "chegou agora"). */
		highlights: ShowcaseProduct[];
		/** Chamado ao clicar em "Explorar achadinhos". */
		onexplore: () => void;
	};
	let { highlights, onexplore }: Props = $props();

	let inView = $state(true);
	const spotlight = createSpotlight({ items: () => highlights, paused: () => !inView });
	/** Ofertas clicáveis da primeira dobra: maiores descontos entre os achados mais recentes. */
	const offers = $derived(
		[...highlights].sort((a, b) => (b.discountPercent ?? 0) - (a.discountPercent ?? 0)).slice(0, 6)
	);

	/** Avisa quando a hero sai da tela, para pausar animações e timers. */
	function watchVisibility(element: HTMLElement) {
		const observer = new IntersectionObserver(([entry]) => (inView = entry.isIntersecting));
		observer.observe(element);
		return () => observer.disconnect();
	}
</script>

<section class="hero" {@attach watchVisibility}>
	<div
		class="mx-auto grid max-w-7xl grid-cols-1 items-center gap-3 px-4 py-4 sm:px-6 md:grid-cols-2 md:py-8"
	>
		<div class="min-w-0">
			<p
				class="mb-1.5 inline-flex items-center gap-1.5 text-xs font-bold tracking-[0.16em] text-[#b8480f] uppercase"
			>
				<img src="/lia.webp" alt="" width="28" height="28" class="size-7 md:hidden" />
				<Sparkles size={13} /> Seleção da Lia
			</p>
			<h1
				class="text-[1.6rem] leading-[1.08] font-extrabold tracking-tight text-lia-navy sm:text-5xl"
			>
				Só coisa nova,<br /><span class="text-lia-orange">achada pela Lia.</span>
			</h1>
			<p class="mt-2 max-w-md text-sm text-lia-muted sm:text-base">
				Ofertas e cupons selecionados para você encontrar seu próximo achado.
			</p>
			{#if highlights.length}
				<HeroFeed items={offers} />
			{/if}
			<a
				href="#buscar-produto"
				onclick={onexplore}
				class="mt-3 inline-flex min-h-11 items-center gap-2 rounded-full bg-[#c94a08] px-5 text-sm font-bold text-white shadow-sm focus-ring transition hover:bg-[#b54106]"
			>
				Explorar achadinhos <Search size={15} />
			</a>
		</div>

		<div class="max-md:hidden">
			<LiaStage slots={spotlight.slots} paused={!inView} />
		</div>
	</div>
</section>

<style>
	.hero {
		background:
			radial-gradient(ellipse at 85% 20%, rgb(251 198 25 / 28%), transparent 45%),
			radial-gradient(ellipse at 10% 100%, rgb(179 71 187 / 8%), transparent 40%), var(--lia-cream);
	}
</style>
