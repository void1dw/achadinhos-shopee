// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		interface Platform {
			env: Env;
			ctx: ExecutionContext;
			caches: CacheStorage;
			cf?: IncomingRequestCfProperties;
		}

		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		// interface PageState {}
	}

	namespace Cloudflare {
		interface Env {
			GA4_PROPERTY_ID?: string;
			GA4_SERVICE_ACCOUNT_EMAIL?: string;
			GA4_SERVICE_ACCOUNT_PRIVATE_KEY?: string;
			GA4_DASHBOARD_TOKEN?: string;
		}
	}
}

export {};
