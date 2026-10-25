<script lang="ts">
	/* eslint-disable svelte/no-navigation-without-resolve -- Links de ofertas apontam para URLs externas da Shopee. */
	import { money } from '../format';
	import type { ShowcaseProduct } from '../types';

	let { product }: { product: ShowcaseProduct } = $props();
</script>

<a href={product.url} target="_blank" rel="noopener noreferrer sponsored" class="pop">
	<img src={product.image} alt="" width="32" height="32" />
	<span class="min-w-0">
		<span class="pop-tag"><i class="pulse-dot"></i>novo</span>
		<span class="pop-name">{product.name}</span>
		<b>{money(product.price)}</b>{#if product.discountPercent}<em>−{product.discountPercent}%</em
			>{/if}
	</span>
</a>

<style>
	/* Mini-card que gira em volta da Lia. Tamanhos: celular -> tablet -> desktop. */
	.pop {
		position: relative;
		display: flex;
		align-items: center;
		gap: 0.25rem;
		width: 108px;
		padding: 0.3rem;
		overflow: hidden;
		border: 2px solid transparent;
		border-radius: 14px;
		/* Borda viva: gradiente cônico girando sob um fundo branco. */
		background:
			linear-gradient(#fff, #fff) padding-box,
			conic-gradient(
					from var(--ang),
					var(--lia-orange),
					var(--lia-yellow),
					var(--lia-purple),
					var(--lia-orange)
				)
				border-box;
		box-shadow: 0 10px 28px rgb(13 40 107 / 16%);
		color: var(--lia-ink);
		font-size: 0.62rem;
		line-height: 1.25;
		animation: ang 3s linear infinite;
		transition:
			transform 220ms cubic-bezier(0.2, 0.8, 0.2, 1),
			box-shadow 220ms ease;
	}
	.pop:hover,
	.pop:focus-visible {
		z-index: 1;
		transform: scale(1.08);
		box-shadow: 0 14px 34px rgb(13 40 107 / 24%);
	}
	.pop:focus-visible {
		outline: 2px solid var(--lia-orange);
		outline-offset: 3px;
	}
	/* Brilho que passa uma vez quando o card aparece. */
	.pop::after {
		content: '';
		position: absolute;
		inset: 0;
		background: linear-gradient(
			105deg,
			transparent 35%,
			rgb(255 255 255 / 85%) 50%,
			transparent 65%
		);
		transform: translateX(-120%);
		animation: shine 1.2s ease-out 0.45s both;
		pointer-events: none;
	}
	.pop img {
		flex: none;
		width: 26px;
		height: 26px;
		border-radius: 10px;
		background: #f8f6f0;
		object-fit: cover;
	}
	.pop-tag {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		color: var(--lia-orange);
		font-size: 7px;
		font-weight: 800;
		letter-spacing: 0.12em;
		text-transform: uppercase;
	}
	.pop-name {
		display: block;
		overflow: hidden;
		font-weight: 600;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.pop b {
		color: var(--lia-navy);
		font-size: 0.65rem;
	}
	.pop em {
		display: none;
		margin-left: 0.35rem;
		color: #15803d;
		font-style: normal;
		font-weight: 700;
	}

	@media (min-width: 768px) {
		.pop {
			width: 126px;
			gap: 0.35rem;
			padding: 0.35rem;
			font-size: 0.68rem;
		}
		.pop img {
			width: 28px;
			height: 28px;
		}
		.pop-tag {
			font-size: 9px;
		}
		.pop b {
			font-size: 0.85rem;
		}
		.pop em {
			display: inline;
		}
	}
	@media (min-width: 1024px) {
		.pop {
			width: 140px;
			gap: 0.5rem;
			padding: 0.4rem 0.55rem 0.4rem 0.4rem;
			font-size: 0.75rem;
		}
		.pop img {
			width: 32px;
			height: 32px;
		}
	}

	@keyframes shine {
		to {
			transform: translateX(120%);
		}
	}
	@keyframes ang {
		to {
			--ang: 360deg;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.pop,
		.pop::after {
			animation: none;
		}
		.pop {
			transition: none;
		}
		.pop:hover,
		.pop:focus-visible {
			transform: none;
		}
	}
</style>
