import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import { getPlatformProxy } from 'wrangler';

const devVarsPath = new URL('../.dev.vars', import.meta.url);
const hasDevVars = existsSync(devVarsPath);

test(
	'Wrangler platform proxy exposes only the configured local variable names',
	{ skip: !hasDevVars },
	async () => {
		const contents = readFileSync(devVarsPath, 'utf8');
		const variableNames = contents
			.split(/\r?\n/)
			.map((line) => line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/)?.[1])
			.filter((name): name is string => name !== undefined);
		const requiredNames = [
			'ADMIN_USERNAME',
			'ADMIN_PASSWORD',
			'ADMIN_SESSION_SECRET',
			'SHOPEE_APP_ID',
			'SHOPEE_APP_SECRET'
		];

		assert.ok(requiredNames.every((name) => variableNames.includes(name)));

		const platform = await getPlatformProxy({
			configPath: 'wrangler.jsonc',
			persist: false,
			remoteBindings: false
		});
		try {
			for (const name of requiredNames) {
				assert.ok(
					Object.hasOwn(platform.env, name) && Boolean(platform.env[name]),
					`Wrangler local platform proxy did not expose ${name}.`
				);
			}
			const database = platform.env.CANDIDATES_DB;
			assert.ok(
				database && typeof database.prepare === 'function',
				'Wrangler local platform proxy did not expose the D1 candidate binding.'
			);
			const result = await database.prepare('SELECT 1 AS ready').first<{ ready: number }>();
			assert.equal(result?.ready, 1);
		} finally {
			await platform.dispose();
		}
	}
);
