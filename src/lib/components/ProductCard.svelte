<script lang="ts">
	/* eslint-disable svelte/no-navigation-without-resolve -- Links de ofertas apontam para URLs externas da Shopee. */
	import { Heart, Sparkles, TicketPercent } from '@lucide/svelte';
	import { money } from '../format';
	import type { ShowcaseProduct } from '../types';

	const SHOPEE_COUPONS_URL = 'https://shopee.com.br/m/cupom-de-desconto';

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
</script>

<article class="card" style="--i:{index % 10}">
	<a
		href={product.url}
		target="_blank"
		rel="noopener noreferrer sponsored"
		class="product-link focus-ring"
		aria-label="{product.name}, ver na Shopee"
		onclick={() => {
			onview(product.id);
			onproductclick(product);
		}}
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
					{#if product.previousPrice && product.previousPrice > product.price}
						<span class="previous-price">De <s>{money(product.previousPrice)}</s></span>
					{/if}
					<span class="current-price">
						<small>POR</small>
						<strong>{money(product.price)}</strong>
					</span>
					{#if product.previousPrice && product.previousPrice > product.price}
						<span class="saving">
							<Sparkles size={12} />
							<span
								>Você economiza <strong>{money(product.previousPrice - product.price)}</strong
								></span
							>
						</span>
					{/if}
				</div>
				<span class="offer-link" aria-hidden="true">Ver produto</span>
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
		<Heart size={16} fill={isFavorite ? 'currentColor' : 'none'} />
	</button>
	<a
		class="coupon-link focus-ring"
		href={SHOPEE_COUPONS_URL}
		target="_blank"
		rel="noopener noreferrer"
		aria-label="Ver cupons da Shopee. Resgate o cupom antes de comprar {product.name}"
	>
		<span class="coupon-icon"><TicketPercent size={15} /></span>
		<span class="coupon-label">Cupom Shopee</span>
		<span class="coupon-hint" role="tooltip">Resgate na Shopee antes de comprar</span>
	</a>
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
		animation: rise 0.45s cubic-bezier(0.2, 0.8, 0.2, 1) backwards;
		animation-delay: calc(var(--i) * 35ms);
	}
	.favorite {
		position: absolute;
		top: 10px;
		right: 10px;
		z-index: 2;
		display: grid;
		width: 36px;
		height: 36px;
		place-items: center;
		border: 1px solid rgb(24 35 59 / 8%);
		border-radius: 50%;
		background: rgb(255 255 255 / 92%);
		color: #475467;
		box-shadow: 0 2px 8px rgb(24 35 59 / 8%);
		transition:
			color 160ms,
			background 160ms,
			transform 160ms;
	}
	.favorite:hover {
		transform: scale(1.05);
	}
	.favorite.active {
		background: #fff0e5;
		color: #e35c1d;
	}
	.card:hover {
		transform: translateY(-5px);
		border-color: #f0bf80;
		box-shadow: 0 18px 36px rgb(76 55 28 / 13%);
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
	.card > .product-link {
		flex: 1;
	}
	.coupon-link {
		position: relative;
		z-index: 2;
		display: inline-flex;
		align-items: center;
		gap: 0.32rem;
		align-self: flex-start;
		margin: 0 0.9rem 0.8rem;
		padding: 0.28rem 0.5rem 0.28rem 0.32rem;
		border: 1px solid #f0dfbd;
		border-radius: 999px;
		background: #fffaf0;
		color: #173b72;
		text-decoration: none;
		transition:
			background 180ms,
			border-color 200ms,
			transform 180ms;
	}
	.coupon-link:hover,
	.coupon-link:focus-visible {
		transform: translateY(-1px);
		border-color: #edb778;
		background: #fff;
	}
	.coupon-icon {
		display: grid;
		width: 1.3rem;
		height: 1.3rem;
		flex: none;
		place-items: center;
		border-radius: 50%;
		background: #ffedc2;
		color: #9b571d;
		transition:
			transform 180ms,
			background 180ms;
	}
	.coupon-link:hover .coupon-icon,
	.coupon-link:focus-visible .coupon-icon {
		transform: rotate(-10deg) scale(1.08);
		background: #ffe0a0;
	}
	.coupon-label {
		color: #173b72;
		font-size: 0.65rem;
		font-weight: 800;
		white-space: nowrap;
	}
	.coupon-hint {
		position: absolute;
		bottom: calc(100% + 7px);
		left: 0;
		z-index: 3;
		width: max-content;
		max-width: min(220px, calc(100vw - 48px));
		overflow: hidden;
		padding: 0.48rem 0.65rem;
		border-radius: 8px;
		background: #173b72;
		color: #fff;
		box-shadow: 0 5px 14px rgb(13 40 107 / 20%);
		font-size: 0.65rem;
		font-weight: 700;
		opacity: 0;
		pointer-events: none;
		transform: translateY(4px);
		white-space: nowrap;
		transition:
			opacity 160ms ease,
			transform 160ms ease;
	}
	.coupon-link:hover .coupon-hint,
	.coupon-link:focus-visible .coupon-hint {
		opacity: 1;
		transform: translateY(0);
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
	.card:hover .thumb img {
		transform: scale(1.04);
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
		padding: 0.2rem 0.48rem;
		border-radius: 999px;
		background: #fff1df;
		color: #a35420;
		font-size: 0.62rem;
		font-weight: 700;
		letter-spacing: 0.045em;
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
		font-size: 0.88rem;
		font-weight: 680;
		line-height: 1.35;
		letter-spacing: -0.025em;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		-webkit-line-clamp: 2;
	}
	.purchase-row {
		display: grid;
		gap: 0.38rem;
		margin-top: auto;
		padding-top: 0.9rem;
	}
	.price {
		display: grid;
		gap: 0.3rem;
		min-width: 0;
		padding: 0.58rem 0.68rem;
		border: 1px solid #efe1b2;
		border-radius: 12px;
		background: linear-gradient(135deg, #fffbee, #fff6da);
		transition:
			transform 180ms,
			border-color 180ms,
			box-shadow 180ms;
	}
	.card:hover .price {
		transform: translateY(-1px);
		border-color: #e8ce79;
		box-shadow: 0 5px 12px rgb(124 97 22 / 8%);
	}
	.previous-price {
		color: #8b8581;
		font-size: 0.67rem;
		line-height: 1;
	}
	.current-price {
		display: flex;
		align-items: baseline;
		gap: 0.34rem;
		color: #d15b20;
		font-size: 0.59rem;
		font-weight: 800;
		letter-spacing: 0.08em;
		line-height: 1.1;
	}
	.current-price strong {
		color: #173b72;
		font-size: clamp(1.12rem, 4vw, 1.42rem);
		font-weight: 850;
		letter-spacing: -0.055em;
		font-variant-numeric: tabular-nums;
	}
	.saving {
		display: inline-flex;
		width: fit-content;
		align-items: center;
		gap: 0.25rem;
		padding: 0.28rem 0.48rem;
		border-radius: 999px;
		background: linear-gradient(100deg, #f46310, #e65312);
		color: #fff;
		box-shadow: 0 3px 8px rgb(244 99 16 / 22%);
		font-size: 0.59rem;
		font-weight: 650;
		line-height: 1.2;
		transition: transform 180ms ease;
	}
	.saving strong {
		font-weight: 850;
		white-space: nowrap;
	}
	.card:hover .saving {
		transform: translateY(-1px) scale(1.025);
	}
	.offer-link {
		padding-right: 0.15rem;
		color: #6d7480;
		font-size: 0.64rem;
		font-weight: 700;
		text-align: right;
	}
	.new {
		position: absolute;
		top: 12px;
		left: 12px;
		padding: 0.28rem 0.5rem;
		border: 1px solid #f9d9bd;
		border-radius: 6px;
		background: #fff8e8;
		color: #a45c1e;
		font-size: 0.58rem;
		font-weight: 800;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}
	.disc {
		position: absolute;
		top: 12px;
		right: 56px;
		padding: 0.32rem 0.52rem;
		border: 1px solid rgb(255 255 255 / 30%);
		border-radius: 7px;
		background: linear-gradient(110deg, #e9893c, #d96a27);
		color: #fff;
		box-shadow: 0 3px 9px rgb(174 66 25 / 24%);
		font-size: 0.64rem;
		font-weight: 800;
		letter-spacing: 0.025em;
	}
	@media (max-width: 380px) {
		.details {
			padding: 0.7rem;
		}
		.coupon-link {
			margin-right: 0.7rem;
			margin-left: 0.7rem;
			gap: 0.25rem;
			padding-left: 0.32rem;
		}
		.coupon-hint {
			font-size: 0.55rem;
		}
		.current-price strong {
			font-size: 0.96rem;
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
		.favorite,
		.coupon-link,
		.coupon-icon,
		.price,
		.saving,
		.coupon-hint {
			transition: none;
		}
	}
</style>
