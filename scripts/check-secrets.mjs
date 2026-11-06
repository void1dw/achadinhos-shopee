import { spawnSync } from 'node:child_process';

// Verifica apenas a PRESENÇA (nunca os valores) dos secrets no Worker já publicado.
// Consulta somente o Cloudflare (lista de nomes); não altera nada. Execute manualmente.
const REQUIRED = ['ADMIN_USERNAME', 'ADMIN_PASSWORD', 'ADMIN_SESSION_SECRET'];
const SHOPEE = ['SHOPEE_APP_ID', 'SHOPEE_APP_SECRET'];
const OPTIONAL = [
	'GA4_PROPERTY_ID',
	'GA4_SERVICE_ACCOUNT_EMAIL',
	'GA4_SERVICE_ACCOUNT_PRIVATE_KEY',
	'GA4_DASHBOARD_TOKEN'
];

const result = spawnSync('npx', ['wrangler', 'secret', 'list', '--format', 'json'], {
	encoding: 'utf8',
	shell: true
});
if (result.status !== 0) {
	console.error('Não foi possível listar os secrets (verifique o login: npx wrangler whoami).');
	process.exit(2);
}
let names;
try {
	names = new Set(JSON.parse(result.stdout).map((secret) => secret.name));
} catch {
	console.error('Resposta inesperada do Wrangler.');
	process.exit(2);
}

let missing = 0;
for (const [label, list, mandatory] of [
	['obrigatório (admin)', REQUIRED, true],
	['obrigatório (Shopee)', SHOPEE, true],
	['opcional', OPTIONAL, false]
]) {
	for (const name of list) {
		const present = names.has(name);
		if (!present && mandatory) missing += 1;
		console.log(`${present ? 'OK     ' : mandatory ? 'FALTA  ' : 'ausente'} ${name} [${label}]`);
	}
}
process.exit(missing > 0 ? 1 : 0);
