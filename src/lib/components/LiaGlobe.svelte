<script lang="ts">
	import { untrack } from 'svelte';

	let { paused = false }: { paused?: boolean } = $props();

	let rotationX = $state(0);
	let rotationY = $state(0);
	let dragging = $state(false);
	let mode = $state<'idle' | 'dragging' | 'coasting' | 'returning'>('idle');

	let pointerX = 0;
	let pointerY = 0;
	let lastMoveAt = 0;
	let swayStartedAt = 0;
	let velocityX = 0;
	let velocityY = 0;
	let frame = 0;

	function stopMotion() {
		if (frame) cancelAnimationFrame(frame);
		frame = 0;
	}

	function sway(now: number) {
		if (!swayStartedAt) swayStartedAt = now;
		const elapsed = now - swayStartedAt;
		rotationX = Math.sin(elapsed * 0.00055) * 2.2;
		rotationY = Math.sin(elapsed * 0.00038) * 3.2;
		frame = requestAnimationFrame(sway);
	}

	function settleHome() {
		mode = 'returning';
		stopMotion();
		let previousFrame = 0;

		const animate = (now: number) => {
			const step = previousFrame ? Math.min((now - previousFrame) / 16.67, 2) : 1;
			previousFrame = now;

			const homeX = ((((rotationX + 180) % 360) + 360) % 360) - 180;
			const homeY = ((((rotationY + 180) % 360) + 360) % 360) - 180;
			velocityX = (velocityX - homeX * 0.012 * step) * Math.pow(0.84, step);
			velocityY = (velocityY - homeY * 0.012 * step) * Math.pow(0.84, step);
			rotationX += velocityX * step;
			rotationY += velocityY * step;

			if (
				Math.abs(homeX) < 0.15 &&
				Math.abs(homeY) < 0.15 &&
				Math.abs(velocityX) < 0.15 &&
				Math.abs(velocityY) < 0.15
			) {
				rotationX = 0;
				rotationY = 0;
				velocityX = 0;
				velocityY = 0;
				swayStartedAt = now;
				mode = 'idle';
				frame = requestAnimationFrame(sway);
				return;
			}

			frame = requestAnimationFrame(animate);
		};

		frame = requestAnimationFrame(animate);
	}

	function coast() {
		stopMotion();
		let previousFrame = 0;

		const animate = (now: number) => {
			const step = previousFrame ? Math.min((now - previousFrame) / 16.67, 2) : 1;
			previousFrame = now;
			velocityX *= Math.pow(0.94, step);
			velocityY *= Math.pow(0.94, step);
			rotationX += velocityX * step;
			rotationY += velocityY * step;

			if (Math.abs(velocityX) < 0.04 && Math.abs(velocityY) < 0.04) {
				settleHome();
				return;
			}

			frame = requestAnimationFrame(animate);
		};

		frame = requestAnimationFrame(animate);
	}

	function onPointerDown(event: PointerEvent) {
		if (paused || event.button !== 0) return;
		event.preventDefault();
		stopMotion();
		dragging = true;
		mode = 'dragging';
		pointerX = event.clientX;
		pointerY = event.clientY;
		lastMoveAt = event.timeStamp;
		velocityX = 0;
		velocityY = 0;
		if (event.currentTarget instanceof HTMLElement) {
			event.currentTarget.setPointerCapture(event.pointerId);
		}
	}

	function onPointerMove(event: PointerEvent) {
		if (!dragging) return;
		const deltaX = event.clientX - pointerX;
		const deltaY = event.clientY - pointerY;
		const elapsed = Math.max(event.timeStamp - lastMoveAt, 1);
		pointerX = event.clientX;
		pointerY = event.clientY;
		lastMoveAt = event.timeStamp;
		rotationY += deltaX * 0.72;
		rotationX -= deltaY * 0.72;
		velocityY = (deltaX * 0.72 * 16.67) / elapsed;
		velocityX = (-deltaY * 0.72 * 16.67) / elapsed;
	}

	function onPointerUp() {
		if (!dragging) return;
		dragging = false;
		mode = 'coasting';
		coast();
	}

	function onKeyDown(event: KeyboardEvent) {
		const amount = event.shiftKey ? 45 : 20;
		if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) return;
		event.preventDefault();
		stopMotion();
		velocityX = 0;
		velocityY = 0;
		if (event.key === 'ArrowUp') rotationX -= amount;
		if (event.key === 'ArrowDown') rotationX += amount;
		if (event.key === 'ArrowLeft') rotationY -= amount;
		if (event.key === 'ArrowRight') rotationY += amount;
		mode = 'coasting';
		coast();
	}

	$effect(() => {
		if (paused) {
			stopMotion();
			rotationX = 0;
			rotationY = 0;
			velocityX = 0;
			velocityY = 0;
			mode = 'idle';
			return;
		}

		if (untrack(() => mode === 'idle')) {
			swayStartedAt = 0;
			frame = requestAnimationFrame(sway);
		}
		return () => stopMotion();
	});
</script>

<button
	type="button"
	class:dragging
	class="lia-control"
	aria-label="Girar a Lia. Arraste para mover ou use as setas do teclado."
	onpointerdown={onPointerDown}
	onpointermove={onPointerMove}
	onpointerup={onPointerUp}
	onpointercancel={onPointerUp}
	onlostpointercapture={onPointerUp}
	onkeydown={onKeyDown}
>
	<span class="breath">
		<span class="globe" style="--rotation-x: {rotationX}deg; --rotation-y: {rotationY}deg">
			<span class="sphere">
				<img
					class="face front"
					src="/lia.webp"
					alt=""
					width="320"
					height="320"
					fetchpriority="high"
				/>
				<img class="face back" src="/lia.webp" alt="" width="320" height="320" />
			</span>
		</span>
	</span>
</button>

<style>
	.lia-control {
		position: absolute;
		z-index: 2;
		top: 50%;
		left: 50%;
		display: grid;
		width: var(--lia);
		aspect-ratio: 1;
		padding: 0;
		border: 0;
		border-radius: 50%;
		background: transparent;
		cursor: grab;
		perspective: 720px;
		touch-action: none;
		translate: -50% -50%;
		-webkit-tap-highlight-color: transparent;
	}
	.lia-control:focus-visible {
		outline: 2px solid var(--lia-orange);
		outline-offset: 8px;
	}
	.lia-control.dragging {
		cursor: grabbing;
	}
	.breath,
	.globe,
	.sphere {
		position: absolute;
		inset: 0;
		display: block;
		border-radius: 50%;
	}
	.breath {
		animation: breathe 4.8s ease-in-out infinite;
	}
	.globe {
		transform: rotateX(var(--rotation-x)) rotateY(var(--rotation-y));
		transform-style: preserve-3d;
	}
	.sphere {
		background:
			radial-gradient(ellipse at 27% 22%, rgb(255 255 255 / 94%), transparent 24%),
			radial-gradient(ellipse at 74% 80%, rgb(13 40 107 / 36%), transparent 46%),
			linear-gradient(145deg, #fff8e7, #ffd06b 52%, #f46310);
		box-shadow:
			inset -12px -14px 22px rgb(13 40 107 / 14%),
			inset 6px 7px 16px rgb(255 255 255 / 70%),
			0 14px 36px rgb(13 40 107 / 22%),
			0 0 0 5px #fff;
		transform-style: preserve-3d;
	}
	.face {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		border: 1px solid rgb(255 255 255 / 72%);
		border-radius: 50%;
		object-fit: cover;
		backface-visibility: hidden;
		-webkit-backface-visibility: hidden;
	}
	.front {
		transform: translateZ(1px);
	}
	.back {
		transform: rotateY(180deg) translateZ(1px);
	}
	.dragging .breath {
		animation-play-state: paused;
	}

	@keyframes breathe {
		0%,
		100% {
			transform: translateY(0) scale(0.98);
		}
		50% {
			transform: translateY(-4px) scale(1.02);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.breath {
			animation-duration: 8s;
		}
	}
</style>
