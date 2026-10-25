/** Aviso rápido de erro, mostrado pelo componente Toast (fica fora dos cards por causa dos transforms). */
class ToastState {
	message = $state<string | null>(null);
	#timer: ReturnType<typeof setTimeout> | undefined;

	show(message: string, durationMs = 3500): void {
		this.message = message;
		clearTimeout(this.#timer);
		this.#timer = setTimeout(() => (this.message = null), durationMs);
	}
}

export const toast = new ToastState();
