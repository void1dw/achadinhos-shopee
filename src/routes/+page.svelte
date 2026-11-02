<script lang="ts">
	import { onMount } from 'svelte';
	import CategoryChips from '../lib/components/CategoryChips.svelte';
	import CatalogCallout from '../lib/components/CatalogCallout.svelte';
	import CategoryLinks from '../lib/components/CategoryLinks.svelte';
	import FilterBar from '../lib/components/FilterBar.svelte';
	import Hero from '../lib/components/Hero.svelte';
	import ProductGrid from '../lib/components/ProductGrid.svelte';
	import SiteFooter from '../lib/components/SiteFooter.svelte';
	import SiteHeader from '../lib/components/SiteHeader.svelte';
	import { trackCategorySelection } from '../lib/analytics';
	import { PUBLIC_SITE_URL } from '../lib/config';
	import { CATEGORY_BY_ID } from '../lib/categories';
	import { jsonLdScript } from '../lib/json-ld';
	import { Filters } from '../lib/filters.svelte';
	import { fetchProductFeed } from '../lib/product-feed';
	import { SOCIAL_IMAGE } from '../lib/seo';
	import { toast } from '../lib/toast.svelte';
	import { EMPTY_FEED, FeedLoader, type FeedState } from '../lib/feed-loader';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	/* O HTML traz só os primeiros produtos; a lista completa chega depois (ver product-feed.ts). */
	let feed = $state<FeedState>(EMPTY_FEED);
	const loader = new FeedLoader(
		(key) => fetchProductFeed(fetch, key || undefined),
		(next) => (feed = next)
	);
	const fullProducts = $derived(feed.items);
	const ready = $derived(data.complete || fullProducts !== null);
	const products = $derived(fullProducts ?? data.products);
	const highlights = $derived(data.highlights);
	const highlightIds = $derived(new Set(highlights.map((p) => p.id)));
	const categoryPageLinks = $derived(data.categories);
	const totalProducts = $derived(fullProducts ? fullProducts.length : data.total);
	const structuredData = {
		'@context': 'https://schema.org',
		'@graph': [
			{
				'@type': 'Organization',
				'@id': `${PUBLIC_SITE_URL}#organization`,
				name: 'Achadinhos da Lia',
				url: PUBLIC_SITE_URL,
				logo: new URL('/favicon.png', PUBLIC_SITE_URL).toString(),
				image: new URL(SOCIAL_IMAGE.path, PUBLIC_SITE_URL).toString()
			},
			{
				'@type': 'WebSite',
				'@id': `${PUBLIC_SITE_URL}#website`,
				name: 'Achadinhos da Lia',
				url: PUBLIC_SITE_URL,
				inLanguage: 'pt-BR',
				publisher: { '@id': `${PUBLIC_SITE_URL}#organization` }
			}
		]
	};

	const filters = new Filters();
	let favoriteIds = $state<string[]>([]);
	let recentIds = $state<string[]>([]);
	// Com a lista completa, favoritos de produtos que saíram da planilha deixam de contar; antes, valem todos os salvos.
	const validFavoriteIds = $derived.by(() => {
		if (!ready) return favoriteIds;
		const known = new Set(products.map((product) => product.id));
		return favoriteIds.filter((id) => known.has(id));
	});
	// Busca, filtros, ordenação e favoritos só são definitivos com a lista completa.
	const needsFull = $derived(filters.dirty || filters.sort !== 'recentes');
	const blocked = $derived(needsFull && !ready);
	const visibleProducts = $derived(filters.apply(products, validFavoriteIds));
	const recentItems = $derived(
		recentIds
			.map((id) => products.find((product) => product.id === id))
			.filter((product): product is (typeof products)[number] => product !== undefined)
	);

	let filterBar = $state<ReturnType<typeof FilterBar>>();

	const FAVORITES_KEY = 'achadinhos-da-lia:favorites';
	const RECENT_KEY = 'achadinhos-da-lia:recent';
	const RECENT_LIMIT = 8;

	/** Pede a lista completa (uma única requisição por vez); resolve true quando ela está disponível. */
	function ensureFullProducts(): Promise<boolean> {
		return data.complete ? Promise.resolve(true) : loader.ensure('');
	}

	function loadIds(key: string): string[] {
		const stored: unknown = JSON.parse(localStorage.getItem(key) ?? '[]');
		if (!Array.isArray(stored) || !stored.every((id) => typeof id === 'string')) {
			throw new TypeError('O formato dos dados salvos é inválido.');
		}
		return stored;
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
		const initialIds = new Set(data.products.map((product) => product.id));
		const savedIds = [...favoriteIds, ...recentIds];
		if (savedIds.some((id) => !initialIds.has(id))) {
			// Favoritos e vistos fora dos primeiros produtos precisam da lista completa para aparecer.
			void ensureFullProducts();
		} else {
			const idle =
				window.requestIdleCallback ?? ((callback: () => void) => setTimeout(callback, 1500));
			idle(() => void ensureFullProducts());
		}
	});

	$effect(() => {
		if (needsFull) void ensureFullProducts();
	});

	function selectCategory(slug: string) {
		if (filters.categorySlug === slug) return;
		filters.categorySlug = slug;
		const label = slug ? CATEGORY_BY_ID.get(slug)?.name : undefined;
		if (label) trackCategorySelection(label);
	}

	function toggleFavorite(id: string) {
		// Parte dos IDs salvos pode estar ausente da lista atual (planilha ou desconto mínimo): preserva todos.
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
	<meta property="og:image" content={new URL(SOCIAL_IMAGE.path, PUBLIC_SITE_URL).toString()} />
	<meta property="og:image:width" content={String(SOCIAL_IMAGE.width)} />
	<meta property="og:image:height" content={String(SOCIAL_IMAGE.height)} />
	<meta property="og:image:alt" content={SOCIAL_IMAGE.alt} />
	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:title" content="Achadinhos da Lia | Ofertas da Shopee e cupons" />
	<meta
		name="twitter:description"
		content="Ofertas da Shopee selecionadas pela Lia. Confira preços e cupons antes de comprar."
	/>
	<meta name="twitter:image" content={new URL(SOCIAL_IMAGE.path, PUBLIC_SITE_URL).toString()} />
	<meta name="twitter:image:alt" content={SOCIAL_IMAGE.alt} />
	<!-- eslint-disable-next-line svelte/no-at-html-tags -- JSON-LD gerado por jsonLdScript, que escapa "<". -->
	{@html jsonLdScript(structuredData)}
</svelte:head>

<div class="min-h-screen font-sans antialiased">
	<SiteHeader
		achadinhos={data.counts.achadinhos}
		catalog={data.counts.catalog}
		favoriteCount={validFavoriteIds.length}
		onshowfavorites={() => (filters.favoritesOnly = true)}
	/>

	<main>
		<Hero {highlights} onexplore={() => filterBar?.openSearch()} />
		<CategoryChips
			categories={categoryPageLinks}
			selected={filters.categorySlug}
			onselect={selectCategory}
		/>
		<FilterBar bind:this={filterBar} {filters} favoriteCount={validFavoriteIds.length} />
		<ProductGrid
			items={visibleProducts}
			total={totalProducts}
			newIds={highlightIds}
			unavailable={data.sheetsUnavailable}
			stale={data.productsStale}
			canClear={filters.dirty}
			onclear={() => filters.clear()}
			favoriteIds={validFavoriteIds}
			{recentItems}
			partial={!ready && !blocked}
			{blocked}
			loading={feed.status === 'loading'}
			failed={feed.status === 'error'}
			onrequestfull={ensureFullProducts}
			onfavorite={toggleFavorite}
			onview={recordViewed}
			itemListId="home_products"
			itemListName="Produtos da página inicial"
			suggestions={categoryPageLinks}
			onsuggest={(slug) => {
				filters.clear();
				selectCategory(slug);
			}}
		/>
		<CatalogCallout count={data.counts.catalog} />
		<CategoryLinks categories={categoryPageLinks} heading="Páginas de categorias" />
	</main>

	<SiteFooter />
</div>
