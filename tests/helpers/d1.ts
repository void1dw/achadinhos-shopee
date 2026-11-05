import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getPlatformProxy } from 'wrangler';

/** Divide um arquivo de migração em statements (sem triggers nem `;` dentro de literais). */
export function splitSqlStatements(sql: string): string[] {
	return sql
		.split('\n')
		.filter((line) => !line.trim().startsWith('--'))
		.join('\n')
		.split(';')
		.map((statement) => statement.trim())
		.filter(Boolean);
}

/** D1 descartável: sem persistência, sem bindings remotos e com todas as migrações aplicadas. */
export async function createTestPlatformProxy() {
	const platform = await getPlatformProxy({
		configPath: 'wrangler.jsonc',
		persist: false,
		remoteBindings: false
	});

	try {
		const migrationsDir = fileURLToPath(new URL('../../migrations/', import.meta.url));
		const files = readdirSync(migrationsDir)
			.filter((name) => /^\d+.*\.sql$/.test(name))
			.sort();
		const db = platform.env.CANDIDATES_DB;
		for (const file of files) {
			for (const statement of splitSqlStatements(
				readFileSync(resolve(migrationsDir, file), 'utf8')
			)) {
				await db.prepare(statement).run();
			}
		}
	} catch (error) {
		await platform.dispose();
		throw error;
	}

	return platform;
}
