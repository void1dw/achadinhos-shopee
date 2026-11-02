<script lang="ts">
	import { ArrowRight, LayoutGrid } from '@lucide/svelte';
	import { resolve } from '$app/paths';

	let { count }: { count: number } = $props();
</script>

<section class="callout-wrap mx-auto max-w-7xl px-4 pb-2 sm:px-6" aria-label="Catálogo completo">
	<a href={resolve('/catalogo')} class="callout focus-ring">
		<span class="callout-icon" aria-hidden="true"><LayoutGrid size={18} /></span>
		<span class="callout-text">
			<strong>Explore o catálogo completo</strong>
			<small>{count.toLocaleString('pt-BR')} produtos para navegar e filtrar do seu jeito</small>
		</span>
		<span class="callout-go" aria-hidden="true">Ver catálogo <ArrowRight size={15} /></span>
	</a>
</section>

<style>
	.callout {
		position: relative;
		display: flex;
		align-items: center;
		gap: 1rem;
		overflow: hidden;
		padding: 1.1rem 1.25rem;
		border-radius: 20px;
		background:
			radial-gradient(circle at 92% 20%, rgb(251 198 25 / 28%), transparent 38%),
			radial-gradient(circle at 8% 110%, rgb(179 71 187 / 30%), transparent 40%),
			linear-gradient(120deg, #0d286b, #17418b);
		box-shadow: 0 10px 26px rgb(13 40 107 / 22%);
		color: #fff;
		transition:
			box-shadow 220ms,
			transform 220ms;
	}
	.callout:hover {
		box-shadow: 0 16px 34px rgb(13 40 107 / 30%);
		transform: translateY(-3px);
	}
	.callout:active {
		box-shadow: 0 6px 16px rgb(13 40 107 / 25%);
		transform: translateY(0) scale(0.99);
	}
	.callout-icon {
		display: grid;
		flex: none;
		width: 2.9rem;
		height: 2.9rem;
		place-items: center;
		border-radius: 14px;
		background: var(--lia-yellow);
		color: var(--lia-navy);
		transition: transform 220ms;
	}
	.callout:hover .callout-icon {
		transform: rotate(-6deg) scale(1.08);
	}
	.callout-text {
		display: grid;
		flex: 1;
		min-width: 0;
		gap: 0.1rem;
	}
	.callout-text strong {
		font-size: 1.05rem;
		font-weight: 800;
	}
	.callout-text small {
		color: rgb(255 255 255 / 75%);
		font-size: 0.8rem;
	}
	.callout-go {
		display: inline-flex;
		flex: none;
		align-items: center;
		gap: 0.4rem;
		padding: 0.55rem 1rem;
		border-radius: 999px;
		background: var(--lia-orange);
		font-size: 0.82rem;
		font-weight: 800;
		transition: background 180ms;
	}
	.callout-go :global(svg) {
		transition: transform 220ms;
	}
	.callout:hover .callout-go {
		background: #ff7a2b;
	}
	.callout:hover .callout-go :global(svg) {
		transform: translateX(4px);
	}
	@media (max-width: 520px) {
		.callout {
			padding: 0.95rem;
		}
		.callout-go {
			width: 2.2rem;
			height: 2.2rem;
			justify-content: center;
			padding: 0;
			font-size: 0;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.callout {
			transition: none;
		}
		.callout:hover {
			transform: none;
		}
	}
</style>
