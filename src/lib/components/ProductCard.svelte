<script lang="ts">
	/* eslint-disable svelte/no-navigation-without-resolve -- Links de ofertas apontam para URLs externas da Shopee. */
	import { ExternalLink, Heart } from '@lucide/svelte';
	import { isCountableProductClick } from '../analytics';
	import { money, priceLabel } from '../format';
	import type { ShowcaseProduct } from '../types';

	type Props = {
		product: ShowcaseProduct;
		/** Posição na lista: define prioridade de carregamento da imagem e o atraso da animação. */
		index: number;
		isNew: boolean;
		isFavorite: boolean;
		onfavorite: (id: string) => void;
		onview: (id: string) => void;
		onproductclick: (product: ShowcaseProduct) => void;
	};
	let { product, index, isNew, isFavorite, onfavorite, onview, onproductclick }: Props = $props();

	function handleProductClick(event: MouseEvent) {
		if (!isCountableProductClick(event)) return;
		onview(product.id);
		onproductclick(product);
	}
</script>

<article class="card" style="--i:{index % 10}">
	<a
		href={product.url}
		target="_blank"
		rel="noopener noreferrer sponsored"
		class="product-link focus-ring"
		aria-label="{product.name}, ver na Shopee"
		onclick={handleProductClick}
		onauxclick={handleProductClick}
	>
		<div class="thumb">
			<img
				src={product.image}
				alt=""
				loading={index < 4 ? 'eager' : 'lazy'}
				fetchpriority={index === 0 ? 'high' : 'auto'}
				decoding="async"
				width="300"
				height="300"
			/>
			{#if isNew}<span class="new">Novo</span>{/if}
			{#if product.discountPercent}<span class="disc">{product.discountPercent}% OFF</span>{/if}
		</div>
		<div class="details">
			<span class="category">{product.categoryLabel}</span>
			<h3>{product.name}</h3>
			<div class="purchase-row">
				<div class="price">
					{#if product.discountPercent && product.previousPrice}
						<s class="previous-price">{money(product.previousPrice)}</s>
					{/if}
					<strong class="current-price">{priceLabel(product)}</strong>
				</div>
				<span class="cta" aria-hidden="true">
					Ver na Shopee <ExternalLink size={15} />
				</span>
			</div>
		</div>
	</a>
	<button
		type="button"
		class:active={isFavorite}
		class="favorite focus-ring"
		aria-label="{isFavorite ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}: {product.name}"
		aria-pressed={isFavorite}
		onclick={() => onfavorite(product.id)}
	>
		<Heart size={18} fill={isFavorite ? 'currentColor' : 'none'} />
	</button>
</article>

<style>
	.card {
		position: relative;
		display: flex;
		flex-direction: column;
		overflow: hidden;
		border: 1px solid #e9e2d2;
		border-radius: 20px;
		background: linear-gradient(160deg, #fff 45%, #fffdf8);
		box-shadow: 0 4px 14px rgb(41 35 25 / 6%);
		transition:
			transform 200ms,
			box-shadow 200ms,
			border-color 200ms;
	}
	@media (min-width: 640px) {
		.card {
			animation: rise 0.45s cubic-bezier(0.2, 0.8, 0.2, 1) backwards;
			animation-delay: calc(var(--i) * 35ms);
		}
	}
	.favorite {
		position: absolute;
		top: 6px;
		right: 6px;
		z-index: 2;
		display: grid;
		width: 44px;
		height: 44px;
		place-items: center;
		border: 0;
		background: transparent;
		color: #475467;
	}
	.favorite::before {
		position: absolute;
		inset: 4px;
		border: 1px solid rgb(24 35 59 / 8%);
		border-radius: 50%;
		background: rgb(255 255 255 / 92%);
		box-shadow: 0 2px 8px rgb(24 35 59 / 8%);
		content: '';
	}
	.favorite :global(svg) {
		position: relative;
	}
	.favorite.active {
		color: #c2410c;
	}
	.favorite.active::before {
		background: #fff0e5;
	}
	@media (hover: hover) {
		.card:hover {
			transform: translateY(-5px);
			border-color: #f0bf80;
			box-shadow: 0 18px 36px rgb(76 55 28 / 13%);
		}
		.card:hover .thumb img {
			transform: scale(1.04);
		}
		.card:hover .cta {
			background: #b54106;
		}
	}
	.card:has(.product-link:focus-visible) {
		border-color: #e9a45d;
		box-shadow: 0 0 0 3px rgb(244 99 16 / 12%);
	}
	.product-link {
		display: flex;
		min-width: 0;
		flex: 1;
		flex-direction: column;
		color: inherit;
		text-decoration: none;
	}
	.thumb {
		position: relative;
		aspect-ratio: 1;
		overflow: hidden;
		background:
			radial-gradient(ellipse at 50% 90%, rgb(255 255 255 / 88%), transparent 60%),
			linear-gradient(145deg, #fff5df, #f8f0e2 52%, #f2edf3);
	}
	.thumb img {
		width: 100%;
		height: 100%;
		padding: 12px;
		object-fit: contain;
		transition: transform 350ms cubic-bezier(0.2, 0.8, 0.2, 1);
	}
	.details {
		display: flex;
		flex: 1;
		flex-direction: column;
		padding: 0.85rem 0.9rem 0.9rem;
		font-family:
			Inter,
			ui-sans-serif,
			system-ui,
			-apple-system,
			BlinkMacSystemFont,
			'Segoe UI',
			sans-serif;
	}
	.category {
		display: inline-flex;
		width: fit-content;
		max-width: 100%;
		align-items: center;
		gap: 0.35rem;
		margin-bottom: 0.45rem;
		overflow: hidden;
		padding: 0.2rem 0.5rem;
		border-radius: 999px;
		background: #fff1df;
		color: #8f4719;
		font-size: 0.7rem;
		font-weight: 700;
		letter-spacing: 0.04em;
		text-overflow: ellipsis;
		text-transform: uppercase;
		white-space: nowrap;
	}
	.category::before {
		width: 6px;
		height: 6px;
		flex: none;
		border-radius: 50%;
		background: #f0b75e;
		content: '';
	}
	.details h3 {
		display: -webkit-box;
		min-height: 2.7em;
		overflow: hidden;
		color: #202a3c;
		font-size: 0.9rem;
		font-weight: 680;
		line-height: 1.35;
		letter-spacing: -0.02em;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		-webkit-line-clamp: 2;
	}
	.purchase-row {
		display: grid;
		gap: 0.6rem;
		margin-top: auto;
		padding-top: 0.8rem;
	}
	.price {
		display: grid;
		gap: 0.15rem;
		min-width: 0;
	}
	.previous-price {
		color: #6b655f;
		font-size: 0.78rem;
		line-height: 1.1;
	}
	.current-price {
		color: #173b72;
		font-size: clamp(1.2rem, 4.5vw, 1.45rem);
		font-weight: 850;
		letter-spacing: -0.04em;
		line-height: 1.1;
		font-variant-numeric: tabular-nums;
	}
	.cta {
		display: inline-flex;
		min-height: 44px;
		align-items: center;
		justify-content: center;
		gap: 0.4rem;
		padding: 0 0.8rem;
		border-radius: 999px;
		background: #c94a08;
		color: #fff;
		font-size: 0.875rem;
		font-weight: 800;
		transition: background 160ms;
	}
	.new {
		position: absolute;
		top: 12px;
		left: 12px;
		padding: 0.28rem 0.5rem;
		border: 1px solid #f9d9bd;
		border-radius: 6px;
		background: #fff8e8;
		color: #8f4a14;
		font-size: 0.7rem;
		font-weight: 800;
		letter-spacing: 0.05em;
		text-transform: uppercase;
	}
	.disc {
		position: absolute;
		bottom: 10px;
		left: 10px;
		padding: 0.3rem 0.55rem;
		border-radius: 7px;
		background: #b8480f;
		color: #fff;
		box-shadow: 0 3px 9px rgb(174 66 25 / 24%);
		font-size: 0.75rem;
		font-weight: 800;
		letter-spacing: 0.02em;
	}
	@media (max-width: 380px) {
		.details {
			padding: 0.7rem;
		}
		.cta {
			padding: 0 0.5rem;
			font-size: 0.8rem;
		}
	}

	@keyframes rise {
		from {
			opacity: 0;
			transform: translateY(18px) scale(0.96);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.card {
			transition: none;
			animation: none;
		}
		.thumb img,
		.cta {
			transition: none;
		}
	}
</style>
