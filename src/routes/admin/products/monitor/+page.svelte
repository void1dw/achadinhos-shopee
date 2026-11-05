<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
	let running = $state(false);

	const when = (value: string | null) =>
		value ? new Date(value).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '—';
	const money = (value: number | null) =>
		value === null ? '—' : value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
	const alertStyle: Record<string, string> = {
		critical: 'bg-red-50 text-red-800',
		warning: 'bg-amber-50 text-amber-900',
		info: 'bg-sky-50 text-sky-900'
	};
</script>

<svelte:head>
	<title>Monitoramento | Administração — Achadinhos da Lia</title>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<main class="min-h-screen bg-lia-cream">
	<header class="border-b border-lia-line bg-white">
		<div
			class="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8"
		>
			<div>
				<a href={resolve('/admin')} class="text-sm font-bold text-lia-orange hover:underline"
					>← Painel admin</a
				>
				<h1 class="mt-1 text-2xl font-black text-lia-navy">Monitoramento de preços</h1>
			</div>
			<form method="POST" action="/admin/logout">
				<button class="rounded-xl bg-lia-navy px-4 py-2 text-sm font-bold text-white">Sair</button>
			</form>
		</div>
	</header>

	<div class="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
		{#if data.state !== 'ready'}
			<p class="rounded-xl bg-amber-50 p-3 text-sm text-amber-900" role="alert">
				{data.state === 'unavailable'
					? 'O banco D1 não está disponível neste ambiente.'
					: 'Não foi possível ler as tabelas do monitor. Verifique se a migration 0004 foi aplicada.'}
			</p>
		{:else}
			{#if form?.message}
				<p class="rounded-xl bg-red-50 p-3 text-sm text-red-800" role="alert">{form.message}</p>
			{:else if form && 'saved' in form}
				<p class="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800" role="status">
					Configurações salvas.
				</p>
			{:else if form?.ran}
				<p class="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800" role="status">
					Execução finalizada: {form.ran.status}. {form.ran.errorMessage ?? ''}
				</p>
			{/if}

			{#if data.alerts.length > 0}
				<section class="space-y-2" aria-label="Alertas">
					{#each data.alerts as alert (alert.code)}
						<p class="rounded-xl p-3 text-sm {alertStyle[alert.level]}" role="alert">
							{alert.message}
						</p>
					{/each}
				</section>
			{/if}

			<section class="rounded-3xl border border-lia-line bg-white p-5 shadow-sm sm:p-7">
				<h2 class="text-xl font-black text-lia-navy">Consumo da API Shopee</h2>
				<p class="mt-2 text-sm text-lia-muted">
					O orçamento é uma proteção interna configurável, não um limite oficial informado pela
					Shopee. Cada requisição HTTP reserva uma chamada (um lote com vários produtos conta uma
					vez; cada retentativa conta como nova chamada).
				</p>
				<dl class="mt-4 grid gap-3 text-sm sm:grid-cols-3">
					<div>
						<dt class="font-bold text-lia-navy">Chamadas na última hora</dt>
						<dd>{data.usage.callsLastHour}</dd>
					</div>
					<div>
						<dt class="font-bold text-lia-navy">Orçamento por hora</dt>
						<dd>{data.settings.hourlyCallBudget}</dd>
					</div>
					<div>
						<dt class="font-bold text-lia-navy">Saldo disponível</dt>
						<dd>{Math.max(0, data.settings.hourlyCallBudget - data.usage.callsLastHour)}</dd>
					</div>
					<div>
						<dt class="font-bold text-lia-navy">Retentativas (1h)</dt>
						<dd>{data.controlStats.retriesLastHour}</dd>
					</div>
					<div>
						<dt class="font-bold text-lia-navy">Rate limits (24h)</dt>
						<dd>{data.usage.rateLimitedLast24h}</dd>
					</div>
					<div>
						<dt class="font-bold text-lia-navy">Reservas negadas (24h)</dt>
						<dd>{data.controlStats.reserveDeniedLast24h}</dd>
					</div>
					<div>
						<dt class="font-bold text-lia-navy">Falhas de reserva (24h)</dt>
						<dd>{data.controlStats.reserveFailedLast24h}</dd>
					</div>
					<div>
						<dt class="font-bold text-lia-navy">Falhas de contabilização (24h)</dt>
						<dd>{data.controlStats.settleFailedLast24h}</dd>
					</div>
				</dl>
				<h3 class="mt-4 text-sm font-black text-lia-navy">Consumo por origem (última hora)</h3>
				{#if data.controlStats.bySource.length === 0}
					<p class="mt-1 text-sm text-lia-muted">Nenhuma chamada na última hora.</p>
				{:else}
					<ul class="mt-1 space-y-1 text-sm">
						{#each data.controlStats.bySource as row (row.source)}
							<li>{row.source}: {row.calls} chamada(s), {row.retries} retentativa(s)</li>
						{/each}
					</ul>
				{/if}
			</section>

			<section class="rounded-3xl border border-lia-line bg-white p-5 shadow-sm sm:p-7">
				<h2 class="text-xl font-black text-lia-navy">Rotina e limites</h2>
				<p class="mt-2 text-sm text-lia-muted">
					O agendamento automático não está ligado; a rotina só roda manualmente e começa pausada.
				</p>
				<form method="POST" action="?/settings" use:enhance class="mt-4 grid gap-3 sm:grid-cols-4">
					<label class="flex items-center gap-2 text-sm font-bold text-lia-navy">
						<input type="checkbox" name="paused" checked={data.settings.paused} class="h-4 w-4" />
						Pausada
					</label>
					<label class="text-sm font-bold text-lia-navy"
						>Intervalo (h)
						<input
							name="intervalHours"
							type="number"
							value={data.settings.intervalHours}
							class="mt-1 w-full rounded-xl border border-lia-line px-3 py-2"
						/></label
					>
					<label class="text-sm font-bold text-lia-navy"
						>Lote por execução
						<input
							name="batchSize"
							type="number"
							value={data.settings.batchSize}
							class="mt-1 w-full rounded-xl border border-lia-line px-3 py-2"
						/></label
					>
					<label class="text-sm font-bold text-lia-navy"
						>Chamadas/hora
						<input
							name="hourlyCallBudget"
							type="number"
							value={data.settings.hourlyCallBudget}
							class="mt-1 w-full rounded-xl border border-lia-line px-3 py-2"
						/></label
					>
					<button
						class="rounded-xl bg-lia-navy px-4 py-2 text-sm font-bold text-white sm:col-span-4 sm:w-fit"
						>Salvar</button
					>
				</form>
				<form
					method="POST"
					action="?/run"
					class="mt-4"
					use:enhance={() => {
						running = true;
						return async ({ update }) => {
							await update();
							running = false;
						};
					}}
				>
					<button
						disabled={running}
						class="rounded-xl bg-lia-orange px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
						>{running ? 'Executando…' : 'Executar agora (somente produtos vinculados)'}</button
					>
				</form>
			</section>

			<section class="rounded-3xl border border-lia-line bg-white p-5 shadow-sm sm:p-7">
				<h2 class="text-xl font-black text-lia-navy">Execuções</h2>
				{#if data.runs.length === 0}
					<p class="mt-2 text-sm text-lia-muted">Nenhuma execução registrada.</p>
				{:else}
					<ul class="mt-3 divide-y divide-lia-line text-sm">
						{#each data.runs as run (run.id)}
							<li class="py-2">
								<strong>#{run.id} · {run.status}</strong> · {run.trigger} · {when(run.started_at)}
								→ {when(run.finished_at)}
								<span class="block text-xs text-lia-muted"
									>verificados {run.products_checked} · chamadas {run.api_calls} · preço alterado {run.price_changes}
									· indisponíveis {run.unavailable} · falhas {run.failures} · retentativas {run.retries}</span
								>
								{#if run.error_message}<span class="block text-xs text-red-800"
										>{run.error_code}: {run.error_message}</span
									>{/if}
							</li>
						{/each}
					</ul>
				{/if}
			</section>

			<section class="rounded-3xl border border-lia-line bg-white p-5 shadow-sm sm:p-7">
				<h2 class="text-xl font-black text-lia-navy">Mudanças detectadas</h2>
				{#if data.events.length === 0}
					<p class="mt-2 text-sm text-lia-muted">Nenhuma mudança registrada.</p>
				{:else}
					<ul class="mt-3 divide-y divide-lia-line text-sm">
						{#each data.events as event (event.id)}
							<li class="py-2">
								<strong>{event.product_name ?? event.product_id}</strong> · {event.event_type} ·
								{money(event.previous_price)} → {money(event.current_price)} · {when(
									event.detected_at
								)}
							</li>
						{/each}
					</ul>
				{/if}
			</section>
		{/if}
	</div>
</main>
