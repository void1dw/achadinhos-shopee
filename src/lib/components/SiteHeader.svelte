<script lang="ts">
	import { resolve } from '$app/paths';
	import { Heart } from '@lucide/svelte';

	let {
		count,
		favoriteCount,
		onshowfavorites
	}: {
		count: number;
		favoriteCount: number;
		onshowfavorites: () => void;
	} = $props();
</script>

<header id="top" class="site-header border-b border-lia-line bg-lia-cream/90 backdrop-blur">
	<div class="header-inner mx-auto grid min-h-[4.5rem] max-w-7xl items-center gap-3 px-4 sm:px-6">
		<a href={resolve('/')} class="inline-flex items-center gap-2.5 rounded-lg focus-ring">
			<img
				src="/lia.webp"
				alt=""
				width="44"
				height="44"
				class="brand-mark size-11 rounded-full bg-white shadow-[0_0_0_2px_#fff,0_0_0_3.5px_var(--lia-orange)]"
			/>
			<span class="brand-copy">
				<strong>Achadinhos da <span>Lia</span></strong>
				<small>Seu radar de ofertas</small>
			</span>
		</a>
		<div class="header-actions">
			<nav class="header-nav" aria-label="Navegação principal">
				<a href="#produtos" class="nav-link favorite-link" onclick={onshowfavorites}>
					<Heart size={15} fill={favoriteCount > 0 ? 'currentColor' : 'none'} />
					Favoritos
					<span class="favorite-count">{favoriteCount}</span>
				</a>
			</nav>
			<span class="live"><i class="pulse-dot"></i>{count} <span>achados</span></span>
		</div>
	</div>
</header>

<style>
	.header-inner {
		grid-template-columns: minmax(0, 1fr) auto;
	}
	.header-inner > a {
		justify-self: start;
	}
	.header-actions {
		display: flex;
		align-items: center;
		justify-self: end;
		gap: 0.45rem;
	}
	.site-header {
		position: relative;
		isolation: isolate;
		background:
			radial-gradient(ellipse at 82% 0%, rgb(251 198 25 / 13%), transparent 32%),
			linear-gradient(100deg, rgb(255 255 255 / 96%), rgb(249 247 240 / 92%));
		box-shadow: 0 6px 24px rgb(13 40 107 / 5%);
	}
	.site-header::after {
		position: absolute;
		right: 0;
		bottom: -1px;
		left: 0;
		height: 3px;
		background: linear-gradient(
			90deg,
			transparent,
			var(--lia-orange),
			var(--lia-yellow),
			transparent
		);
		background-size: 200% 100%;
		content: '';
		animation: header-glide 9s linear infinite;
	}
	.brand-mark {
		transition: transform 250ms ease;
	}
	a:hover .brand-mark {
		transform: rotate(-8deg) scale(1.06);
	}
	.brand-copy {
		display: grid;
		gap: 0.1rem;
		line-height: 1.1;
	}
	.brand-copy strong {
		color: var(--lia-navy);
		font-size: 1.05rem;
		font-weight: 900;
		letter-spacing: -0.035em;
	}
	.brand-copy strong span {
		color: var(--lia-orange);
	}
	.brand-copy small {
		color: var(--lia-muted);
		font-size: 0.67rem;
		font-weight: 600;
		letter-spacing: 0.04em;
	}
	.header-nav {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		margin-left: auto;
	}
	.nav-link {
		display: inline-flex;
		height: 2.4rem;
		align-items: center;
		justify-content: center;
		gap: 0.4rem;
		padding: 0 0.8rem;
		border-radius: 999px;
		color: var(--lia-navy);
		font-size: 0.78rem;
		font-weight: 750;
		transition:
			background 180ms,
			color 180ms,
			transform 180ms;
	}
	.nav-link:hover {
		background: rgb(13 40 107 / 6%);
	}
	.favorite-link {
		color: var(--lia-orange);
	}
	.favorite-count {
		display: grid;
		min-width: 1.2rem;
		height: 1.2rem;
		place-items: center;
		border-radius: 99px;
		background: rgb(244 99 16 / 10%);
		font-size: 0.65rem;
	}
	.live {
		display: inline-flex;
		align-items: center;
		gap: 0.45rem;
		padding: 0.3rem 0.7rem;
		border: 1px solid var(--lia-line);
		border-radius: 999px;
		background: #fff;
		color: var(--lia-navy);
		font-size: 0.75rem;
		font-weight: 600;
	}
	@media (max-width: 700px) {
		.header-inner {
			grid-template-columns: minmax(0, 1fr) auto;
			gap: 0.45rem;
			padding-top: 0.45rem;
			padding-bottom: 0.5rem;
		}
		.header-actions {
			grid-column: 2;
			grid-row: 1;
			gap: 0.25rem;
		}
		.header-nav {
			gap: 0;
		}
		.nav-link {
			width: 2.4rem;
			padding: 0;
			font-size: 0;
		}
		.favorite-link {
			position: relative;
		}
		.favorite-count {
			position: absolute;
			top: 0;
			right: -1px;
			min-width: 1rem;
			height: 1rem;
			border: 1px solid var(--lia-cream);
			background: var(--lia-orange);
			color: #fff;
			font-size: 0.58rem;
		}
	}
	@media (max-width: 420px) {
		.header-inner {
			padding-right: 0.75rem;
			padding-left: 0.75rem;
		}
		.brand-mark {
			width: 2.2rem;
			height: 2.2rem;
		}
		.header-inner > a {
			gap: 0.45rem;
		}
		.brand-copy strong {
			font-size: 0.9rem;
		}
		.brand-copy small {
			font-size: 0.58rem;
		}
		.live {
			gap: 0.25rem;
			padding: 0.28rem 0.45rem;
			font-size: 0.65rem;
		}
	}
	@keyframes header-glide {
		to {
			background-position: 200% 0;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.site-header::after {
			animation: none;
		}
		.brand-mark {
			transition: none;
		}
		.nav-link {
			transition: none;
		}
	}
</style>
