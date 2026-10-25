<script lang="ts">
	/* eslint-disable svelte/no-navigation-without-resolve -- Links de ofertas apontam para URLs externas da Shopee. */
	import { flip } from 'svelte/animate';
	import { fade, fly } from 'svelte/transition';
	import { money } from '../format';
	import type { ShowcaseProduct } from '../types';

	let { items }: { items: ShowcaseProduct[] } = $props();
</script>

<!-- Altura fixa: o espaço fica reservado e a página não "pula" quando os itens entram. -->
<div class="feed" role="group" aria-label="Produtos em destaque">
	{#each items as p, idx (p.id)}
		<a
			href={p.url}
			target="_blank"
			rel="noopener noreferrer sponsored"
			class="feed-row"
			animate:flip={{ duration: 320 }}
			in:fly={{ y: -10, duration: 320 }}
			out:fade={{ duration: 180 }}
		>
			<img src={p.image} alt="" width="40" height="40" decoding="async" />
			<span class="feed-text">
				<span class="block truncate font-semibold">{p.name}</span>
				<b class="text-lia-navy">{money(p.price)}</b>{#if p.discountPercent}<em
						class="ml-1.5 text-xs font-bold text-green-700 not-italic">−{p.discountPercent}%</em
					>{/if}
			</span>
			{#if idx === 0}<span class="featured-tag">destaque</span>{/if}
		</a>
	{/each}
</div>

<style>
	.feed {
		display: grid;
		grid-auto-rows: 56px;
		gap: 0.4rem;
		max-width: 24rem;
		height: calc(3 * 56px + 2 * 0.4rem);
		margin-top: 1.1rem;
		overflow: hidden;
	}
	.feed-row {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		min-width: 0;
		height: 56px;
		padding: 0.35rem 0.65rem 0.35rem 0.35rem;
		overflow: hidden;
		border: 1px solid var(--lia-line);
		border-radius: 13px;
		background: #fff;
		box-shadow: 0 4px 14px rgb(13 40 107 / 6%);
		color: var(--lia-ink);
		font-size: 0.78rem;
		line-height: 1.25;
	}
	.feed-row:first-child {
		border-color: rgb(244 99 16 / 50%);
		animation: fresh 1.6s ease-out;
	}
	.feed-row img {
		flex: none;
		width: 40px;
		height: 40px;
		border-radius: 9px;
		background: #f8f6f0;
		object-fit: cover;
	}
	.feed-text {
		flex: 1;
		min-width: 0;
		overflow: hidden;
	}
	.featured-tag {
		flex: none;
		padding: 0.15rem 0.5rem;
		border-radius: 99px;
		background: var(--lia-orange);
		color: #fff;
		font-size: 9px;
		font-weight: 800;
		letter-spacing: 0.1em;
		text-transform: uppercase;
	}

	@keyframes fresh {
		0% {
			background: #fff0dc;
			box-shadow: 0 0 0 0 rgb(244 99 16 / 55%);
		}
		60% {
			box-shadow: 0 0 0 9px rgb(244 99 16 / 0%);
		}
		100% {
			background: #fff;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.feed-row {
			animation: none;
		}
	}
</style>
