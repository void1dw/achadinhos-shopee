import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

const html = readFileSync(new URL('../src/app.html', import.meta.url), 'utf8');
const FLAG = 'ga-disable-G-LE7LEHM879';

function inlineScript(): string {
	const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
	assert.equal(scripts.length, 1, 'esperado um único script inline');
	return scripts[0][1];
}

/** Executa o script inline do app.html com um navegador simulado e um listener de histórico estilo gtag.js. */
function boot(initialPath: string) {
	const origin = 'https://achadinhoslia.com.br';
	const listeners: Record<string, Array<() => void>> = {};
	const location = { pathname: initialPath, href: origin + initialPath };
	const pageViews: Array<{ path: string; suppressed: boolean }> = [];
	const history = {
		pushState(_s: unknown, _t: string, url?: string) {
			if (url) Object.assign(location, { pathname: new URL(url, location.href).pathname });
		},
		replaceState(_s: unknown, _t: string, url?: string) {
			if (url) Object.assign(location, { pathname: new URL(url, location.href).pathname });
		}
	};
	const window: Record<string, unknown> = {
		location,
		history,
		URL,
		Date,
		addEventListener: (type: string, fn: () => void) => (listeners[type] ??= []).push(fn)
	};
	window.window = window;
	const context = vm.createContext(window);
	vm.runInContext(inlineScript(), context);

	// O gtag.js carrega depois (async) e envolve pushState/popstate: o page_view é decidido após o nosso código.
	const wrap = (method: 'pushState' | 'replaceState') => {
		const inner = history[method];
		history[method] = function (...args: [unknown, string, string?]) {
			inner.apply(history, args);
			if (method === 'pushState') {
				pageViews.push({ path: location.pathname, suppressed: window[FLAG] === true });
			}
		};
	};
	wrap('pushState');
	wrap('replaceState');
	(listeners.popstate ??= []).push(() =>
		pageViews.push({ path: location.pathname, suppressed: window[FLAG] === true })
	);

	return {
		window,
		location,
		history,
		pageViews,
		dataLayer: window.dataLayer as unknown[][],
		popTo(path: string) {
			location.pathname = path;
			listeners.popstate.forEach((fn) => fn());
		}
	};
}

test('app.html configura o GA4 uma única vez e não reconfigura ao navegar', () => {
	assert.equal(html.match(/gtag\(\s*'config'\s*,\s*'G-/g)?.length, 1);

	const env = boot('/admin');
	env.history.pushState(null, '', '/');
	env.history.pushState(null, '', '/admin');
	env.history.pushState(null, '', '/categoria/casa');
	const configs = env.dataLayer.filter((args) => args[0] === 'config');
	assert.equal(configs.length, 1);
});

test('abrir /admin direto desativa o GA4; abrir a vitrine direto mantém ativo', () => {
	assert.equal(boot('/admin').window[FLAG], true);
	assert.equal(boot('/admin/login').window[FLAG], true);
	assert.notEqual(boot('/').window[FLAG], true);
	assert.notEqual(boot('/administrador').window[FLAG], true);
});

test('navegação SPA: o flag já reflete o destino quando o page_view do gtag é decidido', () => {
	const env = boot('/');
	env.history.pushState(null, '', '/admin');
	env.history.pushState(null, '', '/admin/realtime');
	env.history.pushState(null, '', '/');
	env.history.pushState(null, '', '/categoria/casa?sub=cozinha');

	assert.deepEqual(env.pageViews, [
		{ path: '/admin', suppressed: true },
		{ path: '/admin/realtime', suppressed: true },
		{ path: '/', suppressed: false },
		{ path: '/categoria/casa', suppressed: false }
	]);
});

test('botão voltar/avançar (popstate) também sincroniza o flag', () => {
	const env = boot('/');
	env.popTo('/admin');
	env.popTo('/');

	assert.deepEqual(env.pageViews, [
		{ path: '/admin', suppressed: true },
		{ path: '/', suppressed: false }
	]);
});

test('app.html mantém a verificação do Search Console e o gtag.js assíncrono', () => {
	assert.match(html, /name="google-site-verification"/);
	assert.match(
		html,
		/<script async src="https:\/\/www\.googletagmanager\.com\/gtag\/js\?id=G-LE7LEHM879">/
	);
});
