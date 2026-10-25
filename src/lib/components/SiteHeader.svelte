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

	let comingSoon = $state('');
	let noticeTimer: ReturnType<typeof setTimeout> | undefined;

	function announceComingSoon(network: string) {
		comingSoon = `${network}: novidades em breve`;
		clearTimeout(noticeTimer);
		noticeTimer = setTimeout(() => (comingSoon = ''), 2200);
	}

	$effect(() => () => clearTimeout(noticeTimer));
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
		<div class="social-area">
			<nav class="social-links" aria-label="Redes sociais da Lia">
				<button
					type="button"
					class="social-button tiktok focus-ring"
					aria-label="TikTok: novidades em breve"
					title="TikTok — em breve"
					onclick={() => announceComingSoon('TikTok')}
				>
					<svg viewBox="0 0 24 24" aria-hidden="true">
						<path
							d="M16.6 3c.3 2.1 1.5 3.5 3.4 3.6v3.2a8.2 8.2 0 0 1-3.4-.9v6.3a6.2 6.2 0 1 1-6.2-6.2c.4 0 .8 0 1.2.1v3.4a2.9 2.9 0 1 0 1.7 2.7V3h3.3Z"
						/>
					</svg>
				</button>
				<button
					type="button"
					class="social-button whatsapp focus-ring"
					aria-label="WhatsApp: novidades em breve"
					title="WhatsApp — em breve"
					onclick={() => announceComingSoon('WhatsApp')}
				>
					<svg viewBox="0 0 24 24" aria-hidden="true">
						<path d="M20.1 11.8a8.1 8.1 0 0 1-12 7.1L4 20l1.1-4A8.1 8.1 0 1 1 20.1 11.8Z" />
						<path
							d="M9 8.2c.2-.4.4-.4.7-.4h.5c.2 0 .4.1.5.4l.7 1.7c.1.2.1.4-.1.6l-.5.6c-.2.2-.2.4 0 .6.5.9 1.2 1.5 2.1 1.9.2.1.4.1.6-.1l.7-.8c.2-.2.4-.3.6-.2l1.6.8c.2.1.4.3.4.5-.1.6-.4 1.2-.9 1.5-.5.4-1.2.5-1.8.3-1.1-.3-2.5-1-3.7-2.2-1-1-1.7-2.3-1.9-3.3-.2-.8.1-1.5.5-1.9Z"
						/>
					</svg>
				</button>
				<button
					type="button"
					class="social-button instagram focus-ring"
					aria-label="Instagram: novidades em breve"
					title="Instagram — em breve"
					onclick={() => announceComingSoon('Instagram')}
				>
					<svg viewBox="0 0 24 24" aria-hidden="true">
						<rect x="3.5" y="3.5" width="17" height="17" rx="5" />
						<circle cx="12" cy="12" r="4" />
						<circle class="instagram-dot" cx="17.7" cy="6.6" r="1" />
					</svg>
				</button>
				<button
					type="button"
					class="social-button youtube focus-ring"
					aria-label="YouTube: novidades em breve"
					title="YouTube — em breve"
					onclick={() => announceComingSoon('YouTube')}
				>
					<svg viewBox="0 0 24 24" aria-hidden="true">
						<path
							d="M21 7.2a2.7 2.7 0 0 0-1.9-1.9C17.4 4.8 12 4.8 12 4.8s-5.4 0-7.1.5A2.7 2.7 0 0 0 3 7.2a28 28 0 0 0-.5 4.8 28 28 0 0 0 .5 4.8 2.7 2.7 0 0 0 1.9 1.9c1.7.5 7.1.5 7.1.5s5.4 0 7.1-.5a2.7 2.7 0 0 0 1.9-1.9 28 28 0 0 0 .5-4.8 28 28 0 0 0-.5-4.8Z"
						/>
						<path class="youtube-play" d="m10 15.5 5-3.5-5-3.5v7Z" />
					</svg>
				</button>
			</nav>
			<span class="social-notice" class:visible={comingSoon !== ''} role="status">
				{comingSoon}
			</span>
		</div>
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
		grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
	}
	.header-inner > a {
		justify-self: start;
	}
	.social-area {
		position: relative;
		justify-self: center;
	}
	.social-links {
		display: flex;
		align-items: center;
		gap: 0.65rem;
		padding: 0.25rem;
		border: 1px solid rgb(13 40 107 / 7%);
		border-radius: 999px;
		background: rgb(255 255 255 / 72%);
		box-shadow: 0 3px 10px rgb(13 40 107 / 5%);
	}
	.social-button {
		position: relative;
		display: grid;
		width: 2.15rem;
		height: 2.15rem;
		place-items: center;
		border: 1px solid transparent;
		border-radius: 50%;
		background: #fffaf0;
		color: var(--lia-navy);
		cursor: pointer;
		transition:
			transform 180ms ease,
			background 180ms ease,
			color 180ms ease,
			box-shadow 180ms ease;
	}
	.social-button svg {
		width: 17px;
		height: 17px;
		fill: none;
		stroke: currentColor;
		stroke-linecap: round;
		stroke-linejoin: round;
		stroke-width: 1.8;
		transition: transform 180ms ease;
	}
	.social-button.tiktok svg {
		fill: currentColor;
		stroke: none;
	}
	.social-button.youtube svg {
		fill: currentColor;
		stroke: none;
	}
	.social-button.youtube .youtube-play {
		fill: #fffaf0;
	}
	.social-button:hover {
		transform: translateY(-2px) scale(1.07);
		background: #fff1d8;
		color: #ad4c19;
		box-shadow: 0 4px 10px rgb(244 99 16 / 16%);
	}
	.social-button:hover svg {
		transform: scale(1.08);
	}
	.social-button:active {
		transform: translateY(0) scale(0.96);
	}
	.social-notice {
		position: absolute;
		top: calc(100% + 0.5rem);
		left: 50%;
		z-index: 5;
		padding: 0.38rem 0.65rem;
		border: 1px solid rgb(255 255 255 / 14%);
		border-radius: 999px;
		background: var(--lia-navy);
		color: #fff;
		font-size: 0.68rem;
		font-weight: 700;
		opacity: 0;
		pointer-events: none;
		transform: translate(-50%, -4px);
		transition:
			opacity 160ms ease,
			transform 160ms ease;
		white-space: nowrap;
	}
	.social-notice.visible {
		opacity: 1;
		transform: translate(-50%, 0);
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
		.social-area {
			grid-column: 1 / -1;
			grid-row: 2;
			justify-self: center;
		}
		.social-links {
			gap: 0.55rem;
			padding: 0.18rem 0.32rem;
		}
		.social-button {
			width: 1.9rem;
			height: 1.9rem;
		}
		.social-button svg {
			width: 15px;
			height: 15px;
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
		.social-links {
			gap: 0.7rem;
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
		.social-button,
		.social-button svg,
		.social-notice {
			transition: none;
		}
	}
</style>
