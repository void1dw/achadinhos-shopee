// O adaptador do SvelteKit gera o Worker apenas com `fetch` e sobrescreve o arquivo `main` a cada
// build. Este passo pós-build anexa o handler `scheduled` (Cron Trigger) sem tocar no `fetch`.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const WORKER_PATH = fileURLToPath(
	new URL('../.svelte-kit/cloudflare/_worker.js', import.meta.url)
);
const MARKER = '/* scheduled-handler:patched */';
const HANDLER_IMPORT = "import { handleScheduled } from '../../src/lib/server/scheduled.ts';";

export function patchWorkerSource(source) {
	if (source.includes(MARKER)) return source;
	const defaultExport = /^export default \{/m;
	if (!defaultExport.test(source)) {
		throw new Error('Padrão "export default {" não encontrado no Worker gerado; o adaptador mudou.');
	}
	const patched = source.replace(defaultExport, 'const __app = {');
	return [
		MARKER,
		HANDLER_IMPORT,
		patched.trimEnd(),
		'',
		'export default {',
		'	fetch: __app.fetch,',
		'	scheduled(_controller, env, ctx) {',
		'		return handleScheduled(env, ctx);',
		'	}',
		'};',
		''
	].join('\n');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
	const source = readFileSync(WORKER_PATH, 'utf8');
	const patched = patchWorkerSource(source);
	if (patched === source) {
		console.log('Worker já continha o handler scheduled.');
	} else {
		writeFileSync(WORKER_PATH, patched);
		console.log('Handler scheduled anexado ao Worker gerado.');
	}
}
