<script lang="ts">
	import { onMount } from 'svelte';
	import FilterBar from '../lib/components/FilterBar.svelte';
	import Hero from '../lib/components/Hero.svelte';
	import ProductGrid from '../lib/components/ProductGrid.svelte';
	import SiteFooter from '../lib/components/SiteFooter.svelte';
	import SiteHeader from '../lib/components/SiteHeader.svelte';
	import { PUBLIC_SITE_URL } from '../lib/config';
	import { Filters } from '../lib/filters.svelte';
	import { pickHighlights, summarizeCategories, toShowcase } from '../lib/products';
	import { toast } from '../lib/toast.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const products = $derived(toShowcase(data.products));
	const highlights = $derived(pickHighlights(products));
	const highlightIds = $derived(new Set(highlights.map((p) => p.id)));
	const categories = $derived(summarizeCategories(products));

	const filters = new Filters();
	let favoriteIds = $state<string[]>([]);
	let recentIds = $state<string[]>([]);
	const visibleProducts = $derived(filters.apply(products, favoriteIds));
	const recentItems = $derived(
		recentIds
			.map((id) => products.find((product) => product.id === id))
			.filter((product): product is (typeof products)[number] => product !== undefined)
	);

	let filterBar = $state<ReturnType<typeof FilterBar>>();

	const FAVORITES_KEY = 'achadinhos-da-lia:favorites';
	const RECENT_KEY = 'achadinhos-da-lia:recent';
	const RECENT_LIMIT = 8;

	function loadIds(key: string): string[] {
		const stored: unknown = JSON.parse(localStorage.getItem(key) ?? '[]');
		if (!Array.isArray(stored) || !stored.every((id) => typeof id === 'string')) {
			throw new TypeError('O formato dos dados salvos é inválido.');
		}
		return stored.filter((id) => products.some((product) => product.id === id));
	}

	function saveIds(key: string, ids: string[], message: string) {
		try {
			localStorage.setItem(key, JSON.stringify(ids));
		} catch {
			toast.show(message);
		}
	}

	onMount(() => {
		try {
			favoriteIds = loadIds(FAVORITES_KEY);
		} catch {
			toast.show('Não foi possível carregar seus favoritos salvos neste navegador.');
		}
		try {
			recentIds = loadIds(RECENT_KEY).slice(0, RECENT_LIMIT);
		} catch {
			toast.show('Não foi possível carregar os produtos vistos recentemente.');
		}
	});

	function toggleFavorite(id: string) {
		favoriteIds = favoriteIds.includes(id)
			? favoriteIds.filter((favoriteId) => favoriteId !== id)
			: [id, ...favoriteIds];
		saveIds(FAVORITES_KEY, favoriteIds, 'Não foi possível salvar seus favoritos neste navegador.');
	}

	function recordViewed(id: string) {
		recentIds = [id, ...recentIds.filter((recentId) => recentId !== id)].slice(0, RECENT_LIMIT);
		saveIds(
			RECENT_KEY,
			recentIds,
			'Não foi possível salvar seu histórico recente neste navegador.'
		);
	}
</script>

<svelte:head>
	<title>Achadinhos da Lia | Ofertas da Shopee e cupons</title>
	<meta
		name="description"
		content="Encontre ofertas da Shopee selecionadas pela Lia. Compare preços, salve seus achados favoritos e confira cupons antes de comprar."
	/>
	<link rel="canonical" href={PUBLIC_SITE_URL} />
	<meta name="theme-color" content="#0d286b" />
	<meta name="robots" content="index, follow, max-image-preview:large" />
	<meta property="og:title" content="Achadinhos da Lia" />
	<meta property="og:url" content={PUBLIC_SITE_URL} />
	<meta property="og:type" content="website" />
	<meta property="og:locale" content="pt_BR" />
	<meta property="og:site_name" content="Achadinhos da Lia" />
	<meta
		property="og:description"
		content="Ofertas da Shopee selecionadas pela Lia. Compare preços, salve seus achados favoritos e confira cupons antes de comprar."
	/>
	<meta name="twitter:card" content="summary" />
	<meta name="twitter:title" content="Achadinhos da Lia | Ofertas da Shopee e cupons" />
	<meta
		name="twitter:description"
		content="Ofertas da Shopee selecionadas pela Lia. Confira preços e cupons antes de comprar."
	/>
</svelte:head>

<div class="min-h-screen font-sans antialiased">
	<SiteHeader
		count={products.length}
		favoriteCount={favoriteIds.length}
		onshowfavorites={() => (filters.favoritesOnly = true)}
	/>

	<main>
		<Hero {highlights} onexplore={() => filterBar?.openSearch()} />
		<FilterBar bind:this={filterBar} {filters} {categories} favoriteCount={favoriteIds.length} />
		<ProductGrid
			items={visibleProducts}
			total={products.length}
			newIds={highlightIds}
			unavailable={data.sheetsUnavailable}
			stale={data.productsStale}
			canClear={filters.dirty}
			onclear={() => filters.clear()}
			{favoriteIds}
			{recentItems}
			onfavorite={toggleFavorite}
			onview={recordViewed}
		/>
	</main>

	<SiteFooter />
</div>
