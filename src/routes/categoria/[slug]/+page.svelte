<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import ProductGrid from '../../../lib/components/ProductGrid.svelte';
	import CategoryLinks from '../../../lib/components/CategoryLinks.svelte';
	import SiteFooter from '../../../lib/components/SiteFooter.svelte';
	import SiteHeader from '../../../lib/components/SiteHeader.svelte';
	import { PUBLIC_SITE_URL } from '../../../lib/config';
	import CategoryChips from '../../../lib/components/CategoryChips.svelte';
	import { categoryChain, isInCategory } from '../../../lib/categories';
	import { jsonLdScript } from '../../../lib/json-ld';
	import { fetchProductFeed } from '../../../lib/product-feed';
	import { SOCIAL_IMAGE } from '../../../lib/seo';
	import { toast } from '../../../lib/toast.svelte';
	import { EMPTY_FEED, FeedLoader, type FeedState } from '../../../lib/feed-loader';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const category = $derived(data.category);
	/* O HTML traz só os primeiros produtos; a lista completa chega depois (ver product-feed.ts). */
	let feed = $state<FeedState>(EMPTY_FEED);
	const loader = new FeedLoader(
		(key) => fetchProductFeed(fetch, key),
		(next) => (feed = next)
	);
	// O componente é reaproveitado entre categorias: a lista completa vale só para o slug carregado.
	const fullProducts = $derived(feed.key === category.slug ? feed.items : null);
	const feedStatus = $derived(feed.key === category.slug ? feed.status : 'idle');
	const ready = $derived(data.complete || fullProducts !== null);
	const products = $derived(fullProducts ?? data.items);
	const totalProducts = $derived(fullProducts ? fullProducts.length : data.total);
	const canonical = $derived(new URL(`/categoria/${category.slug}`, PUBLIC_SITE_URL).toString());
	const structuredData = $derived({
		'@context': 'https://schema.org',
		'@graph': [
			{
				'@type': 'BreadcrumbList',
				itemListElement: [
					{ '@type': 'ListItem', position: 1, name: 'Início', item: PUBLIC_SITE_URL },
					{ '@type': 'ListItem', position: 2, name: category.label, item: canonical }
				]
			},
			{
				'@type': 'CollectionPage',
				'@id': `${canonical}#collection`,
				name: category.title,
				description: category.description,
				url: canonical,
				inLanguage: 'pt-BR',
				isPartOf: { '@type': 'WebSite', name: 'Achadinhos da Lia', url: PUBLIC_SITE_URL }
			}
		]
	});

	/** Pede a lista completa da categoria (uma requisição por vez); resolve true quando disponível. */
	function ensureFullProducts(): Promise<boolean> {
		return data.complete ? Promise.resolve(true) : loader.ensure(category.slug);
	}

	let favoriteIds = $state<string[]>([]);
	let recentIds = $state<string[]>([]);
	let favoritesOnly = $state(false);
	const FAVORITES_KEY = 'achadinhos-da-lia:favorites';
	const RECENT_KEY = 'achadinhos-da-lia:recent';
	const RECENT_LIMIT = 8;

	let sub = $derived(data.initialSub);
	// O HTML já traz os primeiros produtos da subcategoria pedida; qualquer outra visão precisa da lista completa.
	const needsFull = $derived(favoritesOnly || sub !== data.initialSub);
	const blocked = $derived(needsFull && !ready);
	const subPath = $derived(sub ? categoryChain(sub).slice(1) : []);

	const visibleProducts = $derived(
		products.filter(
			(product) =>
				(sub === '' || isInCategory(product.categoryPath, sub)) &&
				(!favoritesOnly || favoriteIds.includes(product.id))
		)
	);
	const recentItems = $derived(
		recentIds
			.map((id) => products.find((product) => product.id === id))
			.filter((product): product is (typeof products)[number] => product !== undefined)
	);
	const newIds = $derived(new Set<string>());

	function readIds(key: string): string[] {
		const stored: unknown = JSON.parse(localStorage.getItem(key) ?? '[]');
		if (!Array.isArray(stored) || !stored.every((id) => typeof id === 'string')) {
			throw new TypeError('O formato dos dados salvos é inválido.');
		}
		return stored;
	}

	function persistIds(key: string, ids: string[], message: string) {
		try {
			localStorage.setItem(key, JSON.stringify(ids));
		} catch {
			toast.show(message);
		}
	}

	onMount(() => {
		try {
			favoriteIds = readIds(FAVORITES_KEY);
		} catch {
			toast.show('Não foi possível carregar seus favoritos salvos neste navegador.');
		}
		try {
			recentIds = readIds(RECENT_KEY).slice(0, RECENT_LIMIT);
		} catch {
			toast.show('Não foi possível carregar os produtos vistos recentemente.');
		}
		if (favoriteIds.length + recentIds.length > 0) {
			// Favoritos e vistos recentemente podem estar fora dos primeiros produtos.
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

	function toggleFavorite(id: string) {
		favoriteIds = favoriteIds.includes(id)
			? favoriteIds.filter((favoriteId) => favoriteId !== id)
			: [id, ...favoriteIds];
		persistIds(
			FAVORITES_KEY,
			favoriteIds,
			'Não foi possível salvar seus favoritos neste navegador.'
		);
	}

	function recordViewed(id: string) {
		recentIds = [id, ...recentIds.filter((recentId) => recentId !== id)].slice(0, RECENT_LIMIT);
		persistIds(
			RECENT_KEY,
			recentIds,
			'Não foi possível salvar seu histórico recente neste navegador.'
		);
	}

	function selectSubcategory(id: string) {
		sub = id;
		const url = new URL(window.location.href);
		if (id) url.searchParams.set('sub', id);
		else url.searchParams.delete('sub');
		// shallow: só atualiza a URL; o filtro já foi aplicado no navegador, sem nova carga do servidor.
		// eslint-disable-next-line svelte/no-navigation-without-resolve -- O caminho vem de resolve(); só a query/hash são anexados.
		void goto(`${resolve('/categoria/[slug]', { slug: category.slug })}${url.search}${url.hash}`, {
			replace: true,
			shallow: true
		});
	}
</script>

<svelte:head>
	<title>{category.title}</title>
	<meta name="description" content={category.description} />
	<link rel="canonical" href={canonical} />
	<meta
		name="robots"
		content={data.indexable ? 'index, follow, max-image-preview:large' : 'noindex, follow'}
	/>
	<meta property="og:type" content="website" />
	<meta property="og:site_name" content="Achadinhos da Lia" />
	<meta property="og:locale" content="pt_BR" />
	<meta property="og:title" content={category.title} />
	<meta property="og:description" content={category.description} />
	<meta property="og:url" content={canonical} />
	<meta property="og:image" content={new URL(SOCIAL_IMAGE.path, PUBLIC_SITE_URL).toString()} />
	<meta property="og:image:width" content={String(SOCIAL_IMAGE.width)} />
	<meta property="og:image:height" content={String(SOCIAL_IMAGE.height)} />
	<meta property="og:image:alt" content={SOCIAL_IMAGE.alt} />
	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:title" content={category.title} />
	<meta name="twitter:description" content={category.description} />
	<meta name="twitter:image" content={new URL(SOCIAL_IMAGE.path, PUBLIC_SITE_URL).toString()} />
	<meta name="twitter:image:alt" content={SOCIAL_IMAGE.alt} />
	<!-- eslint-disable-next-line svelte/no-at-html-tags -- JSON-LD gerado por jsonLdScript, que escapa "<". -->
	{@html jsonLdScript(structuredData)}
</svelte:head>

<div class="min-h-screen font-sans antialiased">
	<SiteHeader
		achadinhos={data.counts.achadinhos}
		catalog={data.counts.catalog}
		favoriteCount={favoriteIds.length}
		onshowfavorites={() => (favoritesOnly = true)}
	/>

	<main>
		<section class="mx-auto max-w-7xl px-4 pt-8 pb-2 sm:px-6">
			<nav aria-label="Breadcrumb" class="mb-4 text-sm text-lia-muted">
				<a
					class="font-semibold text-lia-navy underline-offset-4 hover:underline"
					href={resolve('/')}
				>
					Início
				</a>
				<span aria-hidden="true"> / </span>
				{#if subPath.length === 0}
					<span aria-current="page">{category.label}</span>
				{:else}
					<button
						type="button"
						class="font-semibold text-lia-navy underline-offset-4 hover:underline"
						onclick={() => (sub = '')}>{category.label}</button
					>
					{#each subPath as node, index (node.id)}
						<span aria-hidden="true"> / </span>
						{#if index === subPath.length - 1}
							<span aria-current="page">{node.name}</span>
						{:else}
							<button
								type="button"
								class="font-semibold text-lia-navy underline-offset-4 hover:underline"
								onclick={() => (sub = node.id)}>{node.name}</button
							>
						{/if}
					{/each}
				{/if}
			</nav>
			<h1 class="text-3xl font-black tracking-tight text-lia-navy sm:text-4xl">
				{category.label}
			</h1>
			<p class="mt-3 max-w-3xl text-base leading-7 text-lia-muted">{category.intro}</p>
			<p class="mt-3 text-sm">
				<!-- eslint-disable svelte/no-navigation-without-resolve -- Rota interna com query montada a partir do slug. -->
				<a
					class="font-bold text-lia-navy underline underline-offset-4 hover:text-lia-orange"
					href={`${resolve('/catalogo')}?categoria=${category.slug}`}
				>
					Ver todos os produtos de {category.label} no catálogo
				</a>
				<!-- eslint-enable svelte/no-navigation-without-resolve -->
			</p>
		</section>

		<CategoryChips
			categories={data.subTree}
			selected={sub}
			onselect={selectSubcategory}
			label="Filtrar dentro de {category.label}"
			allLabel="Tudo"
			variant="chips"
			department={category.slug}
		/>

		<CategoryLinks
			categories={data.relatedCategories}
			heading="Categorias relacionadas"
			exclude={category.slug}
		/>

		{#if totalProducts > 0}
			<ProductGrid
				items={visibleProducts}
				total={totalProducts}
				{newIds}
				unavailable={false}
				canClear={favoritesOnly}
				onclear={() => (favoritesOnly = false)}
				{favoriteIds}
				{recentItems}
				partial={!ready && !blocked}
				{blocked}
				loading={feedStatus === 'loading'}
				failed={feedStatus === 'error'}
				onrequestfull={ensureFullProducts}
				onfavorite={toggleFavorite}
				onview={recordViewed}
				itemListId={`category_${category.slug}`}
				itemListName={category.label}
			/>
		{:else}
			<section class="mx-auto max-w-7xl px-4 py-12 text-center sm:px-6">
				{#if data.productsUnavailable}
					<p class="text-lg font-bold text-lia-navy">Não foi possível carregar as ofertas agora.</p>
					<p class="mt-2 text-sm text-lia-muted">Tente novamente em instantes.</p>
				{:else}
					<p class="text-lg font-bold text-lia-navy">Ainda não há ofertas nesta categoria.</p>
					<p class="mt-2 text-sm text-lia-muted">
						Confira outras categorias enquanto novos produtos são publicados.
					</p>
				{/if}
			</section>
		{/if}
	</main>

	<SiteFooter />
</div>
