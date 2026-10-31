<script lang="ts">
	/* eslint-disable svelte/no-navigation-without-resolve -- Links de ofertas apontam para URLs externas da Shopee. */
	import { handleProductAffiliateClick } from '../analytics';
	import { priceLabel } from '../format';
	import type { ShowcaseProduct } from '../types';

	let { items }: { items: ShowcaseProduct[] } = $props();
</script>

<ul class="feed" aria-label="Ofertas em destaque">
	{#each items as p, idx (p.id)}
		<li class={idx >= 4 ? 'extra' : undefined}>
			<a
				href={p.url}
				target="_blank"
				rel="noopener noreferrer sponsored"
				class="feed-row focus-ring"
				onclick={(e) =>
					handleProductAffiliateClick(e, p, 'featured_products', 'Produtos em destaque')}
				onauxclick={(e) =>
					handleProductAffiliateClick(e, p, 'featured_products', 'Produtos em destaque')}
			>
				<img
					src={p.image}
					alt=""
					width="44"
					height="44"
					loading={idx < 2 ? 'eager' : 'lazy'}
					decoding="async"
				/>
				<span class="feed-text">
					<span class="feed-name">{p.name}</span>
					<span class="feed-price">
						<b>{priceLabel(p)}</b>{#if p.discountPercent}<em>−{p.discountPercent}%</em>{/if}
					</span>
				</span>
			</a>
		</li>
	{/each}
</ul>

<style>
	.feed {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.5rem;
		margin-top: 1rem;
		padding: 0;
		list-style: none;
	}
	.extra {
		display: none;
	}
	@media (min-width: 640px) {
		.extra {
			display: block;
		}
	}
	.feed-row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		min-width: 0;
		min-height: 56px;
		padding: 0.35rem 0.55rem 0.35rem 0.35rem;
		overflow: hidden;
		border: 1px solid var(--lia-line);
		border-radius: 13px;
		background: #fff;
		box-shadow: 0 4px 14px rgb(13 40 107 / 6%);
		color: var(--lia-ink);
		line-height: 1.25;
		transition:
			border-color 160ms,
			box-shadow 160ms;
	}
	.feed-row:hover {
		border-color: rgb(244 99 16 / 50%);
	}
	.feed-row img {
		flex: none;
		width: 44px;
		height: 44px;
		border-radius: 9px;
		background: #f8f6f0;
		object-fit: cover;
	}
	.feed-text {
		display: grid;
		flex: 1;
		min-width: 0;
		gap: 0.1rem;
	}
	.feed-name {
		overflow: hidden;
		font-size: 0.8125rem;
		font-weight: 600;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.feed-price b {
		color: var(--lia-navy);
		font-size: 0.875rem;
	}
	.feed-price em {
		margin-left: 0.35rem;
		color: #15703a;
		font-size: 0.75rem;
		font-style: normal;
		font-weight: 700;
	}

	@media (prefers-reduced-motion: reduce) {
		.feed-row {
			transition: none;
		}
	}
</style>
