<script lang="ts">
	import { ArrowUp, Sparkles } from '@lucide/svelte';
</script>

<footer class="foot">
	<div class="footer-orbit" aria-hidden="true"><span></span><i></i></div>
	<div class="foot-inner mx-auto max-w-7xl px-4 py-9 sm:px-6">
		<div class="footer-top">
			<div class="footer-brand">
				<div class="footer-mark"><img src="/lia.webp" alt="" width="46" height="46" /></div>
				<div>
					<p class="footer-title">Achadinhos da <span>Lia</span></p>
					<p class="footer-tagline">Seu próximo achado pode estar aqui.</p>
				</div>
			</div>
			<a class="back-top focus-ring" href="#top" aria-label="Voltar ao topo">
				Voltar ao topo <ArrowUp size={15} />
			</a>
		</div>

		<div class="footer-bottom">
			<p>
				<span class="footer-spark"><Sparkles size={14} /></span>
				Seleção independente de ofertas e cupons.
			</p>
			<p class="disclosure">
				Sem vínculo oficial com a Shopee. Confirme preço e disponibilidade na loja. Alguns links
				podem gerar comissão de afiliado.
			</p>
			<span class="copyright">© {new Date().getFullYear()} Achadinhos da Lia</span>
		</div>
	</div>
</footer>

<style>
	.foot {
		position: relative;
		isolation: isolate;
		margin-top: 2rem;
		overflow: hidden;
		background:
			radial-gradient(ellipse at 90% 0%, rgb(244 99 16 / 8%), transparent 32%),
			radial-gradient(ellipse at 8% 100%, rgb(251 198 25 / 16%), transparent 38%),
			linear-gradient(120deg, #fffaf0, #fff 55%, #fff8f1);
	}
	.foot::before {
		position: absolute;
		top: -210px;
		right: 10%;
		width: 360px;
		height: 360px;
		border: 1px solid rgb(244 99 16 / 14%);
		border-radius: 50%;
		box-shadow:
			0 0 0 24px rgb(244 99 16 / 4%),
			0 0 0 52px rgb(251 198 25 / 7%);
		content: '';
		animation: footer-orbit 28s linear infinite;
		pointer-events: none;
	}
	.footer-orbit {
		position: absolute;
		top: -136px;
		right: calc(10% + 35px);
		width: 220px;
		height: 220px;
		border: 1px dashed rgb(244 99 16 / 22%);
		border-radius: 50%;
		animation: footer-orbit 22s linear infinite;
		pointer-events: none;
	}
	.footer-orbit span,
	.footer-orbit i {
		position: absolute;
		top: 50%;
		left: 0;
		width: 9px;
		height: 9px;
		border: 2px solid #fffaf0;
		border-radius: 50%;
		background: var(--lia-yellow);
		box-shadow: 0 0 14px rgb(251 198 25 / 65%);
		transform: translate(-50%, -50%);
	}
	.footer-orbit i {
		top: 0;
		left: 50%;
		width: 6px;
		height: 6px;
		background: var(--lia-orange);
		box-shadow: 0 0 12px rgb(244 99 16 / 45%);
	}
	.foot-inner {
		position: relative;
		z-index: 1;
	}
	.footer-top,
	.footer-brand,
	.footer-bottom,
	.footer-bottom p,
	.back-top {
		display: flex;
		align-items: center;
	}
	.footer-top {
		justify-content: space-between;
		gap: 1.5rem;
		padding-bottom: 1.5rem;
		border-bottom: 1px solid #eee7dc;
	}
	.footer-brand {
		gap: 0.85rem;
	}
	.footer-mark {
		display: grid;
		width: 58px;
		height: 58px;
		place-items: center;
		border: 1px solid #f4dfc2;
		border-radius: 18px;
		background: #fff;
		box-shadow: 0 7px 20px rgb(77 54 25 / 9%);
		transition: transform 220ms ease;
	}
	.footer-brand:hover .footer-mark {
		transform: rotate(-6deg) translateY(-2px);
	}
	.footer-mark img {
		width: 46px;
		height: 46px;
		border-radius: 50%;
	}
	.footer-title {
		color: var(--lia-navy);
		font-size: clamp(1.25rem, 3vw, 1.75rem);
		font-weight: 900;
		letter-spacing: -0.04em;
	}
	.footer-title span {
		color: var(--lia-orange);
	}
	.footer-tagline {
		margin-top: 0.2rem;
		color: #737982;
		font-size: 0.8rem;
	}
	.back-top {
		gap: 0.45rem;
		padding: 0.65rem 0.9rem;
		border: 1px solid #f0d9c2;
		border-radius: 999px;
		background: #fff4e7;
		color: #9e4d20;
		font-size: 0.75rem;
		font-weight: 700;
		transition:
			background 180ms,
			transform 180ms;
	}
	.back-top:hover {
		transform: translateY(-2px);
		border-color: #edc297;
		background: #ffead5;
	}
	.footer-bottom {
		flex-wrap: wrap;
		justify-content: space-between;
		gap: 0.75rem 2rem;
		padding-top: 1.1rem;
	}
	.footer-bottom p {
		gap: 0.45rem;
		color: #46536a;
		font-size: 0.74rem;
	}
	.footer-spark {
		display: inline-flex;
		flex: none;
		align-items: center;
		color: var(--lia-orange);
	}
	.footer-bottom .disclosure {
		max-width: 600px;
		color: #777d87;
		font-size: 0.68rem;
		line-height: 1.55;
	}
	.copyright {
		color: #777d87;
		font-size: 0.68rem;
		white-space: nowrap;
	}
	@keyframes footer-orbit {
		to {
			transform: rotate(360deg);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.foot::before {
			animation: none;
		}
		.footer-orbit,
		.back-top,
		.footer-mark {
			animation: none;
			transition: none;
		}
	}
	@media (max-width: 600px) {
		.foot-inner {
			padding-top: 1.75rem;
			padding-bottom: 1.75rem;
		}
		.footer-top {
			align-items: flex-start;
		}
		.back-top {
			flex: none;
			padding: 0.55rem;
			font-size: 0;
		}
		.footer-bottom {
			align-items: flex-start;
			flex-direction: column;
			gap: 0.8rem;
		}
		.footer-orbit {
			right: -40px;
		}
	}
</style>
