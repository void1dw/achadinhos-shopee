/**
 * Arrastar com o mouse rola a lista (no toque a rolagem já é nativa)
 * e o clique que o arrasto geraria é ignorado, para não trocar de categoria sem querer.
 * Uso: <div {@attach dragScroll}>
 */
export function dragScroll(element: HTMLElement): () => void {
	let active = false;
	let moved = false;
	let startX = 0;
	let startLeft = 0;

	const down = (e: PointerEvent) => {
		if (e.pointerType !== 'mouse') return;
		active = true;
		moved = false;
		startX = e.clientX;
		startLeft = element.scrollLeft;
	};
	const move = (e: PointerEvent) => {
		if (!active) return;
		const dx = e.clientX - startX;
		if (Math.abs(dx) > 5) moved = true;
		if (moved) element.scrollLeft = startLeft - dx;
	};
	const end = () => {
		active = false;
		// Só limpa depois do clique que vem logo em seguida ter sido avaliado.
		setTimeout(() => (moved = false), 0);
	};
	const swallowClick = (e: MouseEvent) => {
		if (moved) {
			e.preventDefault();
			e.stopPropagation();
		}
	};

	element.addEventListener('pointerdown', down);
	element.addEventListener('pointermove', move);
	element.addEventListener('pointerup', end);
	element.addEventListener('pointerleave', end);
	element.addEventListener('click', swallowClick, true);

	return () => {
		element.removeEventListener('pointerdown', down);
		element.removeEventListener('pointermove', move);
		element.removeEventListener('pointerup', end);
		element.removeEventListener('pointerleave', end);
		element.removeEventListener('click', swallowClick, true);
	};
}
