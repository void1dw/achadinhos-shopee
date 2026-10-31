/** Monta a tag `<script type="application/ld+json">`, escapando `<` para que o conteúdo não feche a tag. */
export function jsonLdScript(data: Record<string, unknown>): string {
	const json = JSON.stringify(data).replace(/</g, '\\u003c');
	return `<script type="application/ld+json">${json}</script>`;
}
