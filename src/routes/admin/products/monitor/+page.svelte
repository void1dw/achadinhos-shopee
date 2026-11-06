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
	const failureLabels: Record<string, string> = {
		unresolved: 'Link curto não resolvido',
		api_error: 'Erro na API',
		link_error: 'Vínculo não gravado'
	};

	const schedule = $derived.by(() => {
		if (data.state !== 'ready') return null;
		const { coverage, settings, heartbeat, cronMinutes, now } = data;
		const batchesPerCycle = Math.ceil(coverage.eligible / Math.max(1, settings.batchSize));
		const cycleHours = (batchesPerCycle * cronMinutes) / 60;
		const lastTick = heartbeat ? Date.parse(heartbeat.lastTickAt) : NaN;
		const alive = Number.isFinite(lastTick) && Date.parse(now) - lastTick < cronMinutes * 2.5 * 60000;
		return { batchesPerCycle, cycleHours, alive, tooSlow: cycleHours > settings.intervalHours };
	});
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
					: 'Não foi possível ler as tabelas do monitor. Verifique se as migrations até a 0007 foram aplicadas.'}
			</p>
		{:else}
			{#if form?.message}
				<p class="rounded-xl bg-red-50 p-3 text-sm text-red-800" role="alert">{form.message}</p>
			{:else if form && 'saved' in form}
				<p class="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800" role="status">
					Configurações salvas.
				</p>
			{:else if form && 'requeued' in form}
				<p class="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800" role="status">
					{form.requeued} produto(s) com falha voltaram para a fila e serão tentados na próxima
					execução. Nenhuma consulta foi feita agora.
				</p>
			{:else if form?.ran}
				<p
					class="rounded-xl p-3 text-sm {form.ran.status === 'completed'
						? 'bg-emerald-50 text-emerald-800'
						: 'bg-amber-50 text-amber-900'}"
					role="status"
				>
					Execução {form.ran.status}: {form.ran.checked} produto(s) consultados na Shopee, {form.ran
						.failures} com falha, {form.ran.apiCalls} chamada(s) de API, {form.ran.priceUpdates} preço(s)
					atualizado(s). {form.ran.errorMessage ?? ''}
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
				<h2 class="text-xl font-black text-lia-navy">Cobertura do catálogo</h2>
				<p class="mt-2 text-sm text-lia-muted">
					Cada produto elegível (com link curto, URL com IDs ou vínculo) entra numa fila persistente:
					nunca verificados primeiro, depois os vencidos. Ao terminar o ciclo a fila recomeça sozinha.
					Produtos sem nenhum identificador ficam fora da fila e nunca são associados por nome.
				</p>
				<div
					class="mt-4 h-3 overflow-hidden rounded-full bg-lia-cream"
					role="progressbar"
					aria-valuenow={data.coverage.coveragePercent}
					aria-valuemin="0"
					aria-valuemax="100"
					aria-label="Cobertura do catálogo"
				>
					<div class="h-full bg-lia-orange" style="width: {data.coverage.coveragePercent}%"></div>
				</div>
				<p class="mt-1 text-sm font-bold text-lia-navy">
					{data.coverage.coveragePercent}% em dia ({data.coverage.monitored} de {data.coverage
						.eligible} elegíveis)
				</p>
				<dl class="mt-4 grid gap-3 text-sm sm:grid-cols-4">
					<div><dt class="font-bold text-lia-navy">Total de produtos</dt><dd>{data.coverage.total}</dd></div>
					<div>
						<dt class="font-bold text-lia-navy">Identificados na Shopee</dt>
						<dd>{data.coverage.identified}</dd>
					</div>
					<div>
						<dt class="font-bold text-lia-navy">Pendentes de identificação</dt>
						<dd>{data.coverage.pendingIdentification}</dd>
					</div>
					<div>
						<dt class="font-bold text-lia-navy">Sem identificador (fora da fila)</dt>
						<dd>{data.coverage.noIdentifier}</dd>
					</div>
					<div>
						<dt class="font-bold text-lia-navy">Monitorados (em dia)</dt>
						<dd>{data.coverage.monitored}</dd>
					</div>
					<div>
						<dt class="font-bold text-lia-navy">Nunca verificados</dt>
						<dd>{data.coverage.neverChecked}</dd>
					</div>
					<div>
						<dt class="font-bold text-lia-navy">Vencidos aguardando</dt>
						<dd>{data.coverage.due}</dd>
					</div>
					<div><dt class="font-bold text-lia-navy">Com falha</dt><dd>{data.coverage.failing}</dd></div>
					<div>
						<dt class="font-bold text-lia-navy">Última execução</dt>
						<dd>{when(data.runs[0]?.started_at ?? null)}</dd>
					</div>
					<div>
						<dt class="font-bold text-lia-navy">Próxima execução automática</dt>
						<dd>
							{#if data.settings.paused}Pausada{:else if schedule?.alive}a cada {data.cronMinutes} min{:else}Sem
								sinal do agendador{/if}
						</dd>
					</div>
					<div class="sm:col-span-2">
						<dt class="font-bold text-lia-navy">Progresso do ciclo</dt>
						<dd>
							{schedule?.batchesPerCycle} lote(s) de {data.settings.batchSize} para percorrer o catálogo
							(≈ {schedule ? Math.round(schedule.cycleHours * 10) / 10 : 0} h com execução a cada {data.cronMinutes}
							min)
						</dd>
					</div>
				</dl>
				{#if schedule?.tooSlow}
					<p class="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900" role="alert">
						O ciclo completo leva mais que o intervalo de {data.settings.intervalHours} h: produtos
						vencerão antes de serem revisitados. Aumente o lote por execução ou o intervalo.
					</p>
				{/if}
			</section>

			<section class="rounded-3xl border border-lia-line bg-white p-5 shadow-sm sm:p-7">
				<h2 class="text-xl font-black text-lia-navy">Agendamento automático</h2>
				<p class="mt-2 text-sm text-lia-muted">
					O Cron do Worker dispara a cada {data.cronMinutes} minutos e processa um lote da fila,
					exceto enquanto a rotina estiver pausada. O estado abaixo vem do último disparo realmente
					registrado, não da configuração.
				</p>
				<p class="mt-2 text-sm">
					<strong>Rotina:</strong>
					{data.settings.paused ? 'pausada (nenhuma consulta é feita)' : 'ativa'} ·
					<strong>Último disparo do cron:</strong>
					{#if data.heartbeat}{when(data.heartbeat.lastTickAt)} ({data.heartbeat.lastResult}){:else}nunca
						registrado — o cron ainda não disparou neste banco{/if}
				</p>
			</section>
			<section class="rounded-3xl border border-lia-line bg-white p-5 shadow-sm sm:p-7">
				<h2 class="text-xl font-black text-lia-navy">Chamadas à API Shopee</h2>
				<p class="mt-2 text-sm text-lia-muted">
					Apenas informativo: a API de afiliados da Shopee não tem cota nem crédito de requisições,
					e o painel não bloqueia nenhuma execução por quantidade de chamadas. Se a Shopee
					devolver rate limit de verdade, a execução para e aparece nos alertas.
				</p>
				<dl class="mt-4 grid gap-3 text-sm sm:grid-cols-3">
					<div>
						<dt class="font-bold text-lia-navy">Chamadas na última hora</dt>
						<dd>{data.usage.callsLastHour}</dd>
					</div>
					<div>
						<dt class="font-bold text-lia-navy">Retentativas (1h)</dt>
						<dd>{data.controlStats.retriesLastHour}</dd>
					</div>
					<div>
						<dt class="font-bold text-lia-navy">Rate limits da Shopee (24h)</dt>
						<dd>{data.usage.rateLimitedLast24h}</dd>
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
					Dois ajustes: o <strong>lote</strong> é quantos produtos entram em cada execução (a cada {data.cronMinutes}
					min) e o <strong>intervalo</strong> é de quanto em quanto tempo cada produto deve ser
					revisitado. Não há limite de requisições à Shopee configurável aqui.
				</p>
				<form method="POST" action="?/settings" use:enhance class="mt-4 grid gap-3 sm:grid-cols-4">
					<label class="flex items-center gap-2 text-sm font-bold text-lia-navy">
						<input type="checkbox" name="paused" checked={data.settings.paused} class="h-4 w-4" />
						Pausada
					</label>
					<label class="flex items-center gap-2 text-sm font-bold text-lia-navy sm:col-span-3">
						<input
							type="checkbox"
							name="updatePrices"
							checked={data.settings.updatePrices}
							class="h-4 w-4"
						/>
						Atualizar preços do catálogo com o preço observado pela Shopee (só produtos
						confirmados)
					</label>
					<label class="text-sm font-bold text-lia-navy"
						>Intervalo por produto (h)
						<input
							name="intervalHours"
							type="number"
							min="1"
							max="168"
							value={data.settings.intervalHours}
							class="mt-1 w-full rounded-xl border border-lia-line px-3 py-2"
						/></label
					>
					<label class="text-sm font-bold text-lia-navy"
						>Produtos por execução (1–50)
						<input
							name="batchSize"
							type="number"
							min="1"
							max="50"
							value={data.settings.batchSize}
							class="mt-1 w-full rounded-xl border border-lia-line px-3 py-2"
						/></label
					>
					<button
						class="rounded-xl bg-lia-navy px-4 py-2 text-sm font-bold text-white sm:col-span-4 sm:w-fit"
						>Salvar</button
					>
				</form>
				<div class="mt-4 flex flex-wrap gap-3">
					<form
						method="POST"
						action="?/run"
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
							>{running ? 'Executando…' : 'Processar próximo lote da fila'}</button
						>
					</form>
					<form method="POST" action="?/requeue" use:enhance>
						<button class="rounded-xl border border-lia-line px-4 py-2 text-sm font-bold text-lia-navy"
							>Recolocar falhas na fila</button
						>
					</form>
				</div>
			</section>

			<section class="rounded-3xl border border-lia-line bg-white p-5 shadow-sm sm:p-7">
				<h2 class="text-xl font-black text-lia-navy">Produtos com falha</h2>
				{#if data.failing.length === 0}
					<p class="mt-2 text-sm text-lia-muted">Nenhum produto com falha ativa.</p>
				{:else}
					<p class="mt-2 text-sm text-lia-muted">
						Falhas por motivo:
						{#each data.failureCodes as item, index (item.code)}{index > 0
								? ', '
								: ''}{item.code} ({item.count}){/each}. Cada falha recua a próxima tentativa
						(30 min, 2 h, 6 h, 24 h, 48 h) em vez de repetir sem parar.
					</p>
					<ul class="mt-3 divide-y divide-lia-line text-sm">
						{#each data.failing as item (item.product_id)}
							<li class="py-2">
								<strong>{item.name}</strong>
								<span class="block text-xs text-lia-muted"
									>{failureLabels[item.last_outcome] ?? item.last_outcome} · {item.last_error_code ??
										'sem código'}{item.last_error_detail ? ` (${item.last_error_detail})` : ''} ·
									{item.consecutive_failures} falha(s) seguida(s) · próxima tentativa {when(
										item.next_check_at
									)}</span
								>
							</li>
						{/each}
					</ul>
				{/if}
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
