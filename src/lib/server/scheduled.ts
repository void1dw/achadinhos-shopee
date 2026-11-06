import { runScheduledCatalogMonitor } from './shopee/catalog-audit';
import { recordSchedulerHeartbeat } from './shopee/monitor-queue';

type WaitUntil = { waitUntil(promise: Promise<unknown>): void };

/**
 * Handler do Cron Trigger (anexado ao Worker gerado por `scripts/add-scheduled-handler.mjs`).
 * Nunca lança: a falha é registrada no sinal de vida do agendador e no log.
 */
export async function handleScheduled(env: Cloudflare.Env, ctx: WaitUntil): Promise<void> {
	const db = env.CANDIDATES_DB;
	if (!db) {
		console.error('Scheduled monitor: binding CANDIDATES_DB ausente.');
		return;
	}
	const work = (async () => {
		try {
			if (!env.SHOPEE_APP_ID || !env.SHOPEE_APP_SECRET) {
				await recordSchedulerHeartbeat(db, 'sem_credenciais', null, new Date());
				return;
			}
			await runScheduledCatalogMonitor(db, env);
		} catch (error) {
			console.error('Scheduled monitor failed:', error instanceof Error ? error.message : 'erro');
		}
	})();
	ctx.waitUntil(work);
	await work;
}
