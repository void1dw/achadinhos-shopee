<script lang="ts">
	/* eslint-disable svelte/no-navigation-without-resolve -- Links internos montados com a query do catálogo. */
	import { ArrowLeft, ChevronLeft, ChevronRight, LayoutGrid, Search } from '@lucide/svelte';
	import SiteFooter from '../../lib/components/SiteFooter.svelte';
	import SiteHeader from '../../lib/components/SiteHeader.svelte';
	import ProductCard from '../../lib/components/ProductCard.svelte';
	import { trackProductListClick } from '../../lib/analytics';
	import { catalogHref, CATALOG_PATH } from '../../lib/catalog';
	import { PUBLIC_SITE_URL } from '../../lib/config';
	import { isAchadinho } from '../../lib/products';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const canonical = new URL(CATALOG_PATH, PUBLIC_SITE_URL).toString();
	const isDefault = $derived(
		data.query.q === '' &&
			data.query.category === '' &&
			data.query.sort === 'recentes' &&
			data.query.page === 1
	);
	const description =
		'Catálogo completo da Achadinhos da Lia: busque e filtre todos os produtos da Shopee, incluindo os achadinhos selecionados.';

	/* Números de página próximos da atual, com a primeira e a última sempre acessíveis. */
	const pages = $derived.by(() => {
		const wanted = new Set([
			1,
			data.pageCount,
			data.query.page - 1,
			data.query.page,
			data.query.page + 1
		]);
		return [...wanted].filter((n) => n >= 1 && n <= data.pageCount).sort((a, b) => a - b);
	});
</script>

<svelte:head>
	<title>Catálogo completo | Achadinhos da Lia</title>
	<meta name="description" content={description} />
	<link rel="canonical" href={canonical} />
	<meta name="robots" content={isDefault ? 'index, follow' : 'noindex, follow'} />
	<meta property="og:type" content="website" />
	<meta property="og:site_name" content="Achadinhos da Lia" />
	<meta property="og:locale" content="pt_BR" />
	<meta property="og:title" content="Catálogo completo | Achadinhos da Lia" />
	<meta property="og:description" content={description} />
	<meta property="og:url" content={canonical} />
</svelte:head>

<div class="min-h-screen font-sans antialiased">
	<SiteHeader
		achadinhos={data.counts.achadinhos}
		catalog={data.counts.catalog}
		favoriteCount={0}
		onshowfavorites={() => {}}
		showFavorites={false}
	/>

	<main class="mx-auto max-w-7xl px-4 pt-8 pb-10 sm:px-6">
		<section class="banner">
			<p class="eyebrow"><LayoutGrid size={13} /> Catálogo da Lia</p>
			<h1>Catálogo <span>completo</span></h1>
			<p class="lead">Todos os produtos.</p>
			<a class="back focus-ring" href="/"><ArrowLeft size={14} /> Voltar aos achadinhos</a>
		</section>

		<form class="filters" method="GET" action={CATALOG_PATH} role="search">
			<label class="field grow">
				<span class="sr-only">Buscar produto</span>
				<Search size={17} aria-hidden="true" />
				<input
					type="search"
					name="q"
					value={data.query.q}
					maxlength="100"
					placeholder="Buscar no catálogo"
				/>
			</label>
			<label class="field">
				<span class="sr-only">Categoria</span>
				<select
					name="categoria"
					value={data.query.category}
					onchange={(event) => event.currentTarget.form?.requestSubmit()}
				>
					<option value="">Todas as categorias</option>
					{#each data.categories as category (category.slug)}
						<option value={category.slug}>{category.label} ({category.count})</option>
						{#each category.children as child (child.slug)}
							<option value={child.slug}>&nbsp;&nbsp;{child.label} ({child.count})</option>
						{/each}
					{/each}
				</select>
			</label>
			<label class="field">
				<span class="sr-only">Ordenar por</span>
				<select
					name="ordem"
					value={data.query.sort}
					onchange={(event) => event.currentTarget.form?.requestSubmit()}
				>
					<option value="recentes">Ordem padrão</option>
					<option value="menor-preco">Menor preço</option>
					<option value="maior-preco">Maior preço</option>
				</select>
			</label>
			<button type="submit" class="submit focus-ring">Buscar</button>
		</form>

		{#if data.unavailable}
			<p class="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
				Não foi possível carregar o catálogo agora. Tente novamente em instantes.
			</p>
		{:else}
			<p class="mt-5 mb-3 text-sm text-lia-muted" aria-live="polite">
				{#if data.total === 0}
					Nenhum produto encontrado.
				{:else}
					{data.total.toLocaleString('pt-BR')}
					{data.total === 1 ? 'produto' : 'produtos'}
					{#if data.pageCount > 1}· página {data.query.page} de {data.pageCount}{/if}
				{/if}
			</p>

			{#if data.total === 0}
				<div class="empty">
					<p class="font-bold text-lia-navy">Não encontramos produtos com esses critérios.</p>
					{#if !isDefault}
						<a class="empty-link focus-ring" href={CATALOG_PATH}>Limpar busca e filtros</a>
					{/if}
				</div>
			{:else}
				<div class="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 lg:gap-4">
					{#each data.items as product, index (product.id)}
						<ProductCard
							{product}
							{index}
							achadinho={isAchadinho(product)}
							onproductclick={(item) => trackProductListClick(item, 'catalog', 'Catálogo completo')}
						/>
					{/each}
				</div>

				{#if data.pageCount > 1}
					<nav class="pager" aria-label="Paginação do catálogo">
						{#if data.query.page > 1}
							<a
								class="pager-link focus-ring"
								rel="prev"
								href={catalogHref(data.query, { page: data.query.page - 1 })}
								aria-label="Página anterior"><ChevronLeft size={16} /></a
							>
						{/if}
						{#each pages as number, i (number)}
							{#if i > 0 && number - pages[i - 1] > 1}<span class="pager-gap" aria-hidden="true"
									>…</span
								>{/if}
							<a
								class="pager-link focus-ring"
								class:current={number === data.query.page}
								aria-current={number === data.query.page ? 'page' : undefined}
								href={catalogHref(data.query, { page: number })}>{number}</a
							>
						{/each}
						{#if data.query.page < data.pageCount}
							<a
								class="pager-link focus-ring"
								rel="next"
								href={catalogHref(data.query, { page: data.query.page + 1 })}
								aria-label="Próxima página"><ChevronRight size={16} /></a
							>
						{/if}
					</nav>
				{/if}
			{/if}
		{/if}
	</main>

	<SiteFooter />
</div>

<style>
	.banner {
		position: relative;
		overflow: hidden;
		padding: 1.5rem 1.4rem;
		border: 1px solid var(--lia-line);
		border-radius: 22px;
		background:
			radial-gradient(circle at 95% 0%, rgb(251 198 25 / 30%), transparent 40%),
			radial-gradient(circle at 0% 100%, rgb(179 71 187 / 12%), transparent 45%),
			linear-gradient(120deg, #fff, #fbf5e4);
		box-shadow: 0 8px 24px rgb(13 40 107 / 7%);
	}
	.eyebrow {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		color: var(--lia-orange);
		font-size: 0.7rem;
		font-weight: 800;
		letter-spacing: 0.12em;
		text-transform: uppercase;
	}
	.banner h1 {
		margin-top: 0.35rem;
		color: var(--lia-navy);
		font-size: clamp(1.8rem, 5vw, 2.8rem);
		font-weight: 900;
		letter-spacing: -0.03em;
		line-height: 1.05;
	}
	.banner h1 span {
		color: var(--lia-orange);
	}
	.lead {
		margin-top: 0.4rem;
		color: var(--lia-muted);
		font-size: 1rem;
	}
	.back {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		margin-top: 0.9rem;
		padding: 0.4rem 0.85rem;
		border: 1px solid var(--lia-line);
		border-radius: 999px;
		background: #fff;
		color: var(--lia-navy);
		font-size: 0.78rem;
		font-weight: 700;
		transition:
			border-color 180ms,
			transform 180ms;
	}
	.back:hover {
		border-color: var(--lia-orange);
		transform: translateX(-2px);
	}
	.filters {
		display: flex;
		flex-wrap: wrap;
		gap: 0.6rem;
		margin-top: 1.25rem;
		padding: 0.75rem;
		border: 1px solid var(--lia-line);
		border-radius: 16px;
		background: #f6f2e7;
	}
	.field {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		min-width: 0;
		padding: 0 0.8rem;
		border: 1px solid var(--lia-line);
		border-radius: 12px;
		background: #fff;
		color: var(--lia-muted);
	}
	.field.grow {
		flex: 1 1 14rem;
	}
	.field input,
	.field select {
		width: 100%;
		min-width: 0;
		height: 2.6rem;
		border: 0;
		background: transparent;
		color: var(--lia-navy);
		font: inherit;
		font-size: 0.875rem;
		outline: none;
	}
	.field:focus-within {
		border-color: var(--lia-orange);
		box-shadow: 0 0 0 3px rgb(244 99 16 / 15%);
	}
	.submit {
		height: 2.6rem;
		padding: 0 1.2rem;
		border: 0;
		border-radius: 12px;
		background: var(--lia-navy);
		color: #fff;
		font-size: 0.85rem;
		font-weight: 750;
		transition: background 180ms;
	}
	.submit:hover {
		background: #17418b;
	}
	.empty {
		display: grid;
		justify-items: center;
		gap: 0.6rem;
		padding: 3rem 1rem;
		text-align: center;
	}
	.empty-link {
		color: var(--lia-orange);
		font-weight: 700;
		text-decoration: underline;
		text-underline-offset: 3px;
	}
	.pager {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: center;
		gap: 0.4rem;
		margin-top: 2rem;
	}
	.pager-link {
		display: grid;
		min-width: 2.4rem;
		height: 2.4rem;
		place-items: center;
		padding: 0 0.6rem;
		border: 1px solid var(--lia-line);
		border-radius: 10px;
		background: #fff;
		color: var(--lia-navy);
		font-size: 0.85rem;
		font-weight: 700;
		transition:
			background 180ms,
			border-color 180ms;
	}
	.pager-link:hover {
		border-color: var(--lia-orange);
	}
	.pager-link.current {
		border-color: var(--lia-navy);
		background: var(--lia-navy);
		color: #fff;
	}
	.pager-gap {
		color: var(--lia-muted);
	}
</style>
