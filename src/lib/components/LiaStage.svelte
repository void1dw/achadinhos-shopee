<script lang="ts">
	import type { ShowcaseProduct } from '../types';
	import LiaGlobe from './LiaGlobe.svelte';
	import OrbitProduct from './OrbitProduct.svelte';

	type Props = {
		/** Produtos nas posições da órbita (null = posição vazia). */
		slots: (ShowcaseProduct | null)[];
		/** Congela as animações (hero fora da tela). */
		paused?: boolean;
	};
	let { slots, paused = false }: Props = $props();

	/** Ângulo de cada posição em volta da Lia. */
	const SLOT_ANGLES = [-90, 0, 90, 180];
</script>

<div class={['stage', paused && 'paused']}>
	<div class="cyber-system" aria-hidden="true">
		<span class="system-glow"></span>
		<span class="system-track track-wide"><span class="planet-path"><i></i></span></span>
		<span class="system-track track-mid"><span class="planet-path"><i></i></span></span>
		<span class="system-track track-inner"><span class="planet-path"><i></i></span></span>
		<span class="system-spark spark-one"></span>
		<span class="system-spark spark-two"></span>
		<span class="system-spark spark-three"></span>
	</div>
	<span class="halo" aria-hidden="true"></span>
	<span class="ring" aria-hidden="true"></span>

	<!-- Os 3 primeiros filhos são os pontinhos coloridos (o CSS pinta por posição). -->
	<div class="orbit">
		<span class="dot" style="--a:20deg"></span>
		<span class="dot" style="--a:140deg"></span>
		<span class="dot" style="--a:260deg"></span>
		{#each slots as item, i (i)}
			<div class="slot" style="--a:{SLOT_ANGLES[i]}deg">
				<div class="upright">
					<OrbitProduct product={item} />
				</div>
			</div>
		{/each}
	</div>

	<LiaGlobe {paused} />
</div>

<style>
	.stage {
		--lia: 52%;
		--orbit-radius: 46cqw;
		position: relative;
		container-type: inline-size;
		isolation: isolate;
		justify-self: center;
		width: min(224px, 64vw);
		aspect-ratio: 1;
		margin-top: 1.25rem;
	}
	/* Hero fora da tela: tudo para, sem gastar bateria. */
	.stage.paused,
	.stage.paused :global(*) {
		animation-play-state: paused;
	}

	/* ---------- Sistema de órbitas ao fundo ---------- */
	.cyber-system {
		position: absolute;
		z-index: 0;
		inset: 0;
		overflow: hidden;
		border-radius: 50%;
		pointer-events: none;
	}
	.system-glow {
		position: absolute;
		inset: 20%;
		border-radius: 50%;
		background:
			radial-gradient(circle at 50% 50%, rgb(255 255 255 / 78%) 0 13%, transparent 35%),
			radial-gradient(circle at 47% 44%, rgb(251 198 25 / 30%), transparent 52%),
			radial-gradient(circle at 55% 59%, rgb(179 71 187 / 19%), transparent 68%);
		filter: blur(8px);
		animation: system-pulse 8s ease-in-out infinite;
	}
	.system-track {
		position: absolute;
		top: 50%;
		left: 50%;
		display: block;
		border: 1px solid var(--track-line);
		border-radius: 50%;
		box-shadow:
			inset 0 0 8px rgb(255 255 255 / 26%),
			0 0 10px rgb(13 40 107 / 4%);
		transform: translate(-50%, -50%) rotate(var(--tilt));
		animation: system-track-glow 6s ease-in-out infinite;
	}
	.planet-path {
		position: absolute;
		inset: 0;
		transform: scaleY(var(--flatten)) rotate(0deg);
		transform-origin: center;
		animation: planet-revolve var(--duration) linear infinite;
	}
	.system-track i {
		position: absolute;
		top: 50%;
		left: 0;
		display: block;
		width: var(--planet-size);
		height: var(--planet-size);
		border: 1px solid rgb(255 255 255 / 90%);
		border-radius: 50%;
		background: radial-gradient(
			circle at 32% 27%,
			#fff 0 7%,
			var(--planet-light) 13%,
			var(--planet-color) 48%,
			var(--planet-shadow) 100%
		);
		box-shadow:
			0 0 0 2px rgb(255 255 255 / 28%),
			0 0 12px 3px var(--planet-glow);
		transform: translate(-50%, -50%) scaleY(var(--unflatten));
	}
	.track-wide {
		--tilt: -24deg;
		--duration: 30s;
		--flatten: 0.593;
		--unflatten: 1.686;
		--track-line: rgb(244 99 16 / 25%);
		--planet-size: 10px;
		--planet-light: #ffbe87;
		--planet-color: var(--lia-orange);
		--planet-shadow: #9a3708;
		--planet-glow: rgb(244 99 16 / 45%);
		width: 91%;
		height: 54%;
	}
	.track-mid {
		--tilt: 58deg;
		--duration: 43s;
		--flatten: 1.397;
		--unflatten: 0.716;
		--track-line: rgb(179 71 187 / 28%);
		--planet-size: 8px;
		--planet-light: #f2d8ff;
		--planet-color: var(--lia-purple);
		--planet-shadow: #5c2463;
		--planet-glow: rgb(179 71 187 / 50%);
		width: 63%;
		height: 88%;
	}
	.track-mid .planet-path {
		animation-direction: reverse;
	}
	.track-inner {
		--tilt: -8deg;
		--duration: 21s;
		--flatten: 0.513;
		--unflatten: 1.949;
		--track-line: rgb(251 198 25 / 35%);
		--planet-size: 7px;
		--planet-light: #fff4b0;
		--planet-color: var(--lia-yellow);
		--planet-shadow: #9b6900;
		--planet-glow: rgb(251 198 25 / 60%);
		width: 76%;
		height: 39%;
	}
	.system-spark {
		position: absolute;
		width: 3px;
		height: 3px;
		border-radius: 50%;
		background: rgb(255 255 255 / 95%);
		box-shadow: 0 0 7px 2px rgb(251 198 25 / 58%);
		animation: system-twinkle 4.2s ease-in-out infinite;
	}
	.spark-one {
		top: 15%;
		left: 36%;
	}
	.spark-two {
		top: 40%;
		right: 8%;
		width: 2px;
		height: 2px;
		background: #d9b2ff;
		box-shadow: 0 0 8px 2px rgb(179 71 187 / 55%);
		animation-delay: -1.2s;
	}
	.spark-three {
		right: 31%;
		bottom: 9%;
		background: #ffd9b8;
		box-shadow: 0 0 8px 2px rgb(244 99 16 / 45%);
		animation-delay: -2.4s;
	}

	/* Halo e anel só aparecem em telas maiores. */
	.halo,
	.ring {
		display: none;
	}

	/* ---------- Órbita dos produtos ---------- */
	.orbit {
		position: absolute;
		z-index: 3;
		inset: 0;
		animation: spin 18s linear infinite;
		pointer-events: none;
	}
	.orbit:has(.upright:hover),
	.orbit:has(:global(.pop:focus-visible)) {
		animation-duration: 36s;
	}
	.dot {
		position: absolute;
		top: 50%;
		left: 50%;
		display: block;
		width: 6px;
		height: 6px;
		margin: -3px;
		border-radius: 50%;
		background: var(--lia-yellow);
		box-shadow: 0 0 10px 3px rgb(251 198 25 / 75%);
		transform: rotate(var(--a)) translateX(50cqw);
		animation: twinkle 2.4s ease-in-out infinite;
	}
	.dot:nth-child(2) {
		background: var(--lia-orange);
		box-shadow: 0 0 10px 3px rgb(244 99 16 / 60%);
		animation-delay: 0.8s;
	}
	.dot:nth-child(3) {
		background: var(--lia-purple);
		box-shadow: 0 0 10px 3px rgb(179 71 187 / 55%);
		animation-delay: 1.6s;
	}
	.slot {
		position: absolute;
		top: 50%;
		left: 50%;
		display: block;
		width: 0;
		height: 0;
		transform: rotate(var(--a)) translateX(var(--orbit-radius));
	}
	/* O card gira junto com a órbita, mas se mantém sempre de pé. */
	.upright {
		position: absolute;
		top: 0;
		left: 0;
		transform: translate(-50%, -50%) rotate(calc(-1 * var(--a)));
		animation: unspin 18s linear infinite;
		pointer-events: auto;
	}
	.orbit:has(.upright:hover) .upright,
	.orbit:has(:global(.pop:focus-visible)) .upright {
		animation-duration: 36s;
	}
	@media (min-width: 768px) {
		.stage {
			width: min(280px, 100%);
			margin-top: 0;
		}
		.halo {
			position: absolute;
			inset: 6%;
			display: block;
			border-radius: 50%;
			background: radial-gradient(
				circle,
				rgb(251 198 25 / 55%),
				rgb(244 99 16 / 12%) 55%,
				transparent 70%
			);
			animation: breathe 4s ease-in-out infinite;
		}
		.ring {
			position: absolute;
			z-index: 1;
			inset: 3% 8%;
			display: block;
			border: 1px solid rgb(13 40 107 / 16%);
			border-radius: 50%;
			box-shadow:
				inset 0 0 0 5px rgb(255 255 255 / 28%),
				0 0 0 1px rgb(255 255 255 / 48%);
			transform: rotate(-18deg);
		}
	}
	@media (min-width: 1024px) {
		.stage {
			width: min(370px, calc(100% - 170px));
		}
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
	@keyframes unspin {
		from {
			transform: translate(-50%, -50%) rotate(calc(-1 * var(--a)));
		}
		to {
			transform: translate(-50%, -50%) rotate(calc(-1 * var(--a) - 360deg));
		}
	}
	@keyframes breathe {
		0%,
		100% {
			opacity: 0.75;
			transform: scale(0.94);
		}
		50% {
			opacity: 1;
			transform: scale(1.04);
		}
	}
	@keyframes planet-revolve {
		to {
			transform: scaleY(var(--flatten)) rotate(360deg);
		}
	}
	@keyframes system-pulse {
		0%,
		100% {
			opacity: 0.6;
			transform: scale(0.94);
		}
		50% {
			opacity: 1;
			transform: scale(1.04);
		}
	}
	/* Só opacidade: animar filter/drop-shadow obrigava o navegador a repintar a cada quadro. */
	@keyframes system-track-glow {
		0%,
		100% {
			opacity: 0.62;
		}
		50% {
			opacity: 1;
		}
	}
	@keyframes system-twinkle {
		0%,
		100% {
			opacity: 0.35;
			transform: scale(0.7);
		}
		50% {
			opacity: 1;
			transform: scale(1.35);
		}
	}
	@keyframes twinkle {
		0%,
		100% {
			opacity: 0.35;
			scale: 0.7;
		}
		50% {
			opacity: 1;
			scale: 1.25;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.halo,
		.dot {
			animation: none;
		}
		.system-glow,
		.system-spark {
			animation-duration: 12s;
		}
		.system-track {
			animation-duration: 8s;
		}
		.planet-path {
			animation-duration: 90s;
		}
		.orbit,
		.upright {
			animation-duration: 36s;
		}
		.orbit:has(.upright:hover),
		.orbit:has(:global(.pop:focus-visible)),
		.orbit:has(.upright:hover) .upright,
		.orbit:has(:global(.pop:focus-visible)) .upright {
			animation-duration: 36s;
		}
	}
</style>
