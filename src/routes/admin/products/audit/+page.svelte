<script lang="ts">
	import { deserialize, enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
	let running = $state(false);
	type BatchView = {
		id: number;
		number: number;
		requested: number;
		selected: number;
		processed: number;
		failed: number;
		pending: number;
		stalled: boolean;
	};
	let batchBusy = $state(false);
	let liveBatch = $state<BatchView | null>(null);
	let batchNotice = $state('');
	const batch = $derived(liveBatch ?? (data.state === 'ready' ? data.openBatch : null));

	async function post(action: string, extra: Record<string, string> = {}) {
		const body = new FormData();
		for (const [key, value] of Object.entries(extra)) body.set(key, value);
		const response = await fetch(action, {
			method: 'POST',
			body,
			headers: { 'x-sveltekit-action': 'true' }
		});
		return deserialize(await response.text());
	}

	// Cada bloco é uma requisição curta; o estado fica no D1, então fechar a aba apenas pausa o lote.
	async function runBatch(starting: boolean, resume = false) {
		batchBusy = true;
		batchNotice = '';
		try {
			if (starting) {
				const started = await post('?/startBatch');
				if (started.type !== 'success') {
					batchNotice =
						(started.type === 'failure' && (started.data?.message as string)) ||
						'Não foi possível iniciar o lote.';
					return;
				}
				const step = started.data?.batchStep as { state: string; batch: BatchView | null };
				if (step.state === 'empty') {
					batchNotice = 'Todo o catálogo já foi auditado: não há produtos pendentes.';
					return;
				}
				liveBatch = step.batch;
			}
			let first = resume;
			for (let guard = 0; guard < 200; guard += 1) {
				const result = await post('?/step', first ? { resume: '1' } : {});
				first = false;
				if (result.type !== 'success') {
					batchNotice =
						(result.type === 'failure' && (result.data?.message as string)) ||
						'Falha ao processar o bloco. O lote foi preservado: use "Retomar lote".';
					return;
				}
				const step = result.data?.batchStep as {
					state: string;
					batch: BatchView | null;
					message: string | null;
				};
				if (step.batch) liveBatch = step.batch;
				if (step.state === 'finished') {
					batchNotice = 'Lote concluído.';
					liveBatch = null;
					break;
				}
				if (step.state === 'blocked') {
					batchNotice = `${step.message ?? 'Execução bloqueada.'} O lote foi preservado: retome depois.`;
					break;
				}
				if (step.state === 'stalled') {
					batchNotice =
						'Vários blocos seguidos não tiveram nenhum sucesso. Lote pausado para não sobrecarregar a Shopee; veja os motivos em "Produtos com falha" e use "Retomar lote".';
					break;
				}
				if (step.state === 'busy') {
					batchNotice = 'Outra verificação está em andamento. Aguarde e use "Retomar lote".';
					break;
				}
				if (step.state === 'none') {
					liveBatch = null;
					break;
				}
			}
		} finally {
			batchBusy = false;
			await invalidateAll();
			if (!liveBatch || liveBatch.pending === 0) liveBatch = null;
		}
	}

	async function cancelOpenBatch() {
		batchBusy = true;
		try {
			await post('?/cancelBatch');
			liveBatch = null;
			batchNotice = 'Lote cancelado. Os produtos não processados voltam a ficar pendentes.';
		} finally {
			batchBusy = false;
			await invalidateAll();
		}
	}

	const pageHref = (page: number) =>
		`${resolve('/admin/products/audit')}?status=${data.state === 'ready' ? data.filters.status : ''}&q=${encodeURIComponent(data.state === 'ready' ? data.filters.q : '')}&page=${page}`;
	const badge: Record<string, string> = {
		valid: 'bg-emerald-50 text-emerald-800',
		price_changed: 'bg-amber-50 text-amber-900',
		unavailable: 'bg-red-50 text-red-800',
		uncertain: 'bg-sky-50 text-sky-900',
		needs_review: 'bg-lia-cream text-lia-navy'
	};
	const money = (value: number | null) =>
		value === null ? '—' : value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
	const when = (value: string | null) =>
		value ? new Date(value).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '—';
</script>

<svelte:head>
	<title>Auditoria do catálogo | Administração — Achadinhos da Lia</title>
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
				<h1 class="mt-1 text-2xl font-black text-lia-navy">Auditoria do catálogo</h1>
			</div>
			<form method="POST" action="/admin/logout">
				<button class="rounded-xl bg-lia-navy px-4 py-2 text-sm font-bold text-white">Sair</button>
			</form>
		</div>
	</header>

	<div class="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
		{#if data.state === 'unavailable'}
			<p class="rounded-xl bg-amber-50 p-3 text-sm text-amber-900" role="alert">
				O banco D1 não está disponível neste ambiente.
			</p>
		{:else if data.state === 'db-error'}
			<p class="rounded-xl bg-amber-50 p-3 text-sm text-amber-900" role="alert">
				Não foi possível ler as tabelas de auditoria. 				Verifique se as migrations até a 0007 foram aplicadas.
			</p>
		{:else}
							{@const stats = data.auditStats}
							{@const nextSize = Math.min(data.maxBatchSize, stats.selectable)}
							<section class="rounded-3xl border border-lia-line bg-white p-5 shadow-sm sm:p-7">
								<h2 class="text-xl font-black text-lia-navy">Primeira auditoria do catálogo</h2>
								<p class="mt-2 text-sm leading-6 text-lia-muted">
									Cada solicitação audita, no máximo, {data.maxBatchSize} produtos que ainda não tiveram uma
									auditoria concluída; produtos já auditados nunca entram para completar o lote. Falhas
									técnicas não contam como auditado e são tentadas de novo (até 3 vezes). A auditoria só
									verifica e vincula: não publica, não altera preços, não troca links de afiliado e não
									religa o monitoramento.
								</p>
								<div class="mt-4 h-3 overflow-hidden rounded-full bg-lia-cream" aria-hidden="true">
									<div class="h-full bg-lia-orange" style:width="{stats.percent}%"></div>
								</div>
								<p class="mt-1 text-sm font-semibold text-lia-navy">
									{stats.audited} de {stats.total} auditados ({stats.percent.toLocaleString('pt-BR')}%) ·
									faltam {stats.neverAudited}
								</p>
								<dl class="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4 lg:grid-cols-5">
									{#each [['Total no catálogo', stats.total], ['Já auditados', stats.audited], ['Nunca auditados', stats.neverAudited], ['Em processamento', batch ? batch.pending : stats.processing], ['Com falha técnica', stats.technicalFailures], ['Encontrados e vinculados', stats.linked], ['Não encontrados na Shopee', stats.notFound], ['Sem identificador utilizável', stats.noIdentifier], ['Tentativas esgotadas', stats.exhausted]] as [label, value] (label)}
										<div class="rounded-2xl bg-lia-cream p-3">
											<dt class="text-xs font-semibold text-lia-muted">{label}</dt>
											<dd class="text-2xl font-black text-lia-navy">{value}</dd>
										</div>
									{/each}
								</dl>

								{#if batch}
									<div class="mt-5 rounded-2xl bg-lia-cream p-4 text-sm text-lia-ink" role="status">
										<strong>Lote {batch.number} — {batch.processed} de {batch.selected} processados</strong>
										{#if batch.failed > 0}<span> · {batch.failed} com falha técnica</span>{/if}
										<div class="mt-2 h-2 overflow-hidden rounded-full bg-white" aria-hidden="true">
											<div
												class="h-full bg-lia-navy"
												style:width="{batch.selected ? (batch.processed / batch.selected) * 100 : 0}%"
											></div>
										</div>
										<div class="mt-3 flex flex-wrap gap-3">
											{#if !batchBusy}
												<button
													type="button"
													onclick={() => runBatch(false, true)}
													disabled={!data.shopeeConfigured}
													class="rounded-xl bg-lia-orange px-4 py-2 text-sm font-black text-white disabled:opacity-60"
													>Retomar lote</button
												>
												<button
													type="button"
													onclick={cancelOpenBatch}
													class="rounded-xl border border-lia-line bg-white px-4 py-2 text-sm font-bold text-lia-navy"
													>Cancelar lote</button
												>
											{:else}
												<span>Processando em blocos de 20… mantenha a página aberta ou retome depois.</span>
											{/if}
										</div>
									</div>
								{:else if stats.selectable > 0}
									<button
										type="button"
										onclick={() => runBatch(true)}
										disabled={batchBusy || !data.shopeeConfigured}
										class="mt-5 rounded-xl bg-lia-orange px-5 py-3 text-sm font-black text-white hover:brightness-95 disabled:opacity-60"
									>
										{#if nextSize >= data.maxBatchSize}
											Auditar próximos {data.maxBatchSize.toLocaleString('pt-BR')} produtos não auditados
										{:else}
											Auditar os {nextSize} produtos restantes não auditados
										{/if}
									</button>
								{:else if stats.neverAudited === 0}
									<p class="mt-5 rounded-xl bg-emerald-50 p-3 text-sm font-semibold text-emerald-800" role="status">
										Todo o catálogo já foi auditado: a primeira auditoria está concluída.
									</p>
								{:else}
									<p class="mt-5 rounded-xl bg-amber-50 p-3 text-sm text-amber-900" role="status">
										Restam {stats.neverAudited} produtos não auditados, mas nenhum pode ser selecionado agora:
										{stats.noIdentifier} sem identificador utilizável e {stats.exhausted} com tentativas
										esgotadas.
									</p>
								{/if}
								{#if stats.exhausted > 0 && !batch}
									<form method="POST" action="?/releaseExhausted" class="mt-3" use:enhance>
										<button class="text-sm font-bold text-lia-orange hover:underline"
											>Liberar {stats.exhausted} produtos com tentativas esgotadas para nova rodada</button
										>
									</form>
								{/if}
								{#if batchNotice}
									<p class="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900" role="alert">
										{batchNotice}
									</p>
								{/if}
							</section>			<section class="rounded-3xl border border-lia-line bg-white p-5 shadow-sm sm:p-7">
				<h2 class="text-xl font-black text-lia-navy">Resumo</h2>
				<p class="mt-2 text-sm leading-6 text-lia-muted">
					A verificação consome a mesma fila do monitoramento: resolve links curtos, consulta a
					Shopee pelo itemId/shopId e só vincula o produto quando a API devolve exatamente esse
					anúncio. Nunca exclui produtos. A busca por nome só sugere candidatos para revisão manual;
					nunca confirma identidade sozinha. Falhas técnicas (link não resolvido, erro de API) ficam
					em "Produtos com falha" e não são marcadas como correspondência incerta.
				</p>
				<dl class="mt-5 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4 lg:grid-cols-8">
					{#each [['Produtos', data.counts.totalProducts], ['Identificados', data.coverage.identified], ['Pendentes de identificação', data.coverage.pendingIdentification], ['Com falha técnica', data.coverage.failing], ['Auditados', data.counts.audited], ...data.statuses.map( (s) => [data.statusLabels[s], data.counts.byStatus[s]] )] as [label, value] (label)}
						<div class="rounded-2xl bg-lia-cream p-3">
							<dt class="text-xs font-semibold text-lia-muted">{label}</dt>
							<dd class="text-2xl font-black text-lia-navy">{value}</dd>
						</div>
					{/each}
				</dl>
				<p class="mt-3 text-xs text-lia-muted">
					Última verificação: {when(data.counts.lastVerifiedAt)} · Chamadas de API na última hora: {data
						.budget.used}/{data.budget.limit} (links curtos não consomem este orçamento)
				</p>

				<form
					method="POST"
					action="?/run"
					class="mt-5 flex flex-wrap items-end gap-3"
					use:enhance={() => {
						running = true;
						return async ({ update }) => {
							await update({ reset: false });
							running = false;
						};
					}}
				>
					<label class="text-sm font-semibold text-lia-navy">
						Produtos da fila (máx. {data.batchSize})
						<input
							name="limit"
							type="number"
							min="1"
							max={data.batchSize}
							value={data.batchSize}
							class="mt-1 block w-28 rounded-xl border border-lia-line px-3 py-2"
						/>
					</label>
					<label class="text-sm font-semibold text-lia-navy">
						Buscas por nome (máx. 10)
						<input
							name="discoveryLimit"
							type="number"
							min="0"
							max="10"
							value="0"
							class="mt-1 block w-28 rounded-xl border border-lia-line px-3 py-2"
						/>
					</label>
					<label class="flex items-center gap-2 text-sm text-lia-navy">
						<input name="force" type="checkbox" /> Reverificar mesmo se em dia
					</label>
					<button
						type="submit"
						disabled={running || !data.shopeeConfigured}
						class="rounded-xl bg-lia-orange px-5 py-3 text-sm font-black text-white hover:brightness-95 disabled:opacity-60"
					>
						{running ? 'Verificando…' : 'Executar verificação'}
					</button>
				</form>
				{#if !data.shopeeConfigured}
					<p class="mt-3 text-sm text-amber-900" role="alert">
						Credenciais da Shopee não configuradas neste ambiente.
					</p>
				{/if}
				{#if form?.message}
					<p class="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900" role="alert">
						{form.message}
					</p>
				{/if}
				{#if form?.runSummary}
					{@const summary = form.runSummary}
					<div class="mt-4 rounded-2xl bg-lia-cream p-4 text-sm text-lia-ink" role="status">
						<strong
							>Verificação {summary.status === 'completed'
								? 'concluída'
								: summary.status === 'partial'
									? 'parcial'
									: 'com falha'}.</strong
						>
						<p class="mt-1">
							Consultados na Shopee: {summary.totals.products_checked} · Buscas por nome: {summary
								.totals.discovery_searches} · Chamadas de API: {summary.totals.api_calls} · Preços
							alterados na API: {summary.totals.price_changes} · Preços atualizados no catálogo: {summary.priceUpdates}
							· Indisponíveis: {summary.totals.unavailable} · Falhas: {summary.totals.failures}
						</p>
						{#if summary.errorMessage}<p class="mt-1 text-amber-900">
								{summary.errorMessage}{summary.errorCode ? ` (${summary.errorCode})` : ''}
							</p>{/if}
						<p class="mt-2 font-semibold">Links curtos</p>
						<p>
							Tentados: {summary.shortLinks.attempted} · Resolvidos: {summary.shortLinks.resolved} · Vinculados:
							{summary.shortLinks.linked} · Falhas: {summary.shortLinks.failed}
						</p>
						{#if Object.keys(summary.shortLinks.failures).length > 0}
							<ul class="mt-1 list-inside list-disc text-amber-900">
								{#each Object.entries(summary.shortLinks.failures) as [code, count] (code)}
									<li><code>{code}</code>: {count}</li>
								{/each}
								{#each Object.entries(summary.shortLinks.details) as [detail, count] (detail)}
									<li class="list-none pl-4 text-xs"><code>{detail}</code>: {count}</li>
								{/each}
							</ul>
						{/if}
					</div>
				{/if}
				{#if form?.linked}
					<p class="mt-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900" role="status">
						Produto vinculado a {form.linked.itemId}/{form.linked.shopId}. Execute uma nova
						verificação para reclassificá-lo.
					</p>
				{/if}
			</section>

			{#if data.failing.length > 0}
				<section class="rounded-3xl border border-lia-line bg-white p-5 shadow-sm sm:p-7">
					<h2 class="text-xl font-black text-lia-navy">Produtos com falha técnica</h2>
					<ul class="mt-3 divide-y divide-lia-line text-sm">
						{#each data.failing as item (item.product_id)}
							<li class="py-2">
								<strong>{item.name}</strong>
								<span class="block text-xs text-lia-muted"
									>{item.last_error_code ?? 'sem código'}{item.last_error_detail
										? ` (${item.last_error_detail})`
										: ''} · {item.consecutive_failures} falha(s) · próxima tentativa {when(
										item.next_check_at
									)}</span
								>
							</li>
						{/each}
					</ul>
				</section>
			{/if}

			<section class="rounded-3xl border border-lia-line bg-white p-5 shadow-sm sm:p-7">
				<form method="GET" class="flex flex-wrap items-end gap-3">
					<label class="text-sm font-semibold text-lia-navy">
						Status
						<select
							name="status"
							class="mt-1 block rounded-xl border border-lia-line px-3 py-2"
							value={data.filters.status}
						>
							<option value="">Todos</option>
							{#each data.statuses as status (status)}
								<option value={status} selected={data.filters.status === status}>
									{data.statusLabels[status]}
								</option>
							{/each}
						</select>
					</label>
					<label class="text-sm font-semibold text-lia-navy">
						Buscar (nome, ID ou itemId)
						<input
							name="q"
							value={data.filters.q}
							maxlength="100"
							class="mt-1 block rounded-xl border border-lia-line px-3 py-2"
						/>
					</label>
					<button class="rounded-xl bg-lia-navy px-4 py-2 text-sm font-bold text-white">
						Filtrar
					</button>
				</form>

				{#if data.audits.length === 0}
					<p class="mt-5 text-sm text-lia-muted">Nenhum resultado. Execute uma verificação.</p>
				{:else}
					<ul class="mt-5 space-y-3">
						{#each data.audits as audit (audit.product_id)}
							<li class="rounded-2xl border border-lia-line p-4">
								<div class="flex flex-wrap items-start justify-between gap-2">
									<div class="min-w-0">
										<p class="font-bold text-lia-navy">{audit.product_name}</p>
										<p class="text-xs text-lia-muted">
											{audit.product_id} · {audit.product_category}
										</p>
									</div>
									<span class="rounded-full px-3 py-1 text-xs font-bold {badge[audit.status]}">
										{data.statusLabels[audit.status]}
									</span>
								</div>
								<dl class="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
									<div>
										<dt class="text-lia-muted">Planilha</dt>
										<dd class="font-bold">{money(audit.sheet_price)}</dd>
									</div>
									<div>
										<dt class="text-lia-muted">API Shopee</dt>
										<dd class="font-bold">{money(audit.api_price_min)}</dd>
									</div>
									<div>
										<dt class="text-lia-muted">Correspondência</dt>
										<dd class="font-bold">{data.matchLabels[audit.match_level]}</dd>
									</div>
									<div>
										<dt class="text-lia-muted">Verificado em</dt>
										<dd class="font-bold">{when(audit.verified_at)}</dd>
									</div>
									<div>
										<dt class="text-lia-muted">Última observação</dt>
										<dd class="font-bold">{when(audit.last_observed_at)}</dd>
									</div>
								</dl>
								<details class="mt-3 text-sm">
									<summary class="cursor-pointer font-semibold text-lia-orange">Detalhes</summary>
									<ul class="mt-2 list-disc space-y-1 pl-5 text-lia-ink">
										{#each audit.detail.reasons as reason (reason)}<li>{reason}</li>{/each}
									</ul>
									{#if audit.detail.history}
										<p class="mt-2 text-xs text-lia-muted">
											Última observação de mercado: {money(audit.detail.history.observedPrice)} em {when(
												audit.detail.history.observedAt
											)}
										</p>
									{/if}
									{#if audit.detail.candidates}
										<ul class="mt-3 space-y-2">
											{#each audit.detail.candidates as candidate (`${candidate.itemId}-${candidate.shopId}`)}
												<li class="rounded-xl bg-lia-cream p-3">
													<p class="font-semibold">{candidate.productName}</p>
													<p class="text-xs text-lia-muted">
														item {candidate.itemId} · loja {candidate.shopId} · {money(
															candidate.priceMin
														)} · similaridade {candidate.similarity}
													</p>
													<form method="POST" action="?/link" use:enhance class="mt-2">
														<input type="hidden" name="productId" value={audit.product_id} />
														<input type="hidden" name="itemId" value={candidate.itemId} />
														<input type="hidden" name="shopId" value={candidate.shopId} />
														<button
															class="rounded-lg border border-lia-line bg-white px-3 py-1 text-xs font-bold text-lia-navy"
														>
															Confirmar vínculo manualmente
														</button>
													</form>
												</li>
											{/each}
										</ul>
									{/if}
								</details>
							</li>
						{/each}
					</ul>
					<nav class="mt-5 flex gap-3 text-sm font-bold" aria-label="Paginação">
						<!-- eslint-disable svelte/no-navigation-without-resolve -- pageHref já usa resolve(). -->
						{#if data.filters.page > 1}
							<a class="text-lia-orange hover:underline" href={pageHref(data.filters.page - 1)}
								>← Anterior</a
							>
						{/if}
						{#if data.hasNextPage}
							<a class="text-lia-orange hover:underline" href={pageHref(data.filters.page + 1)}
								>Próxima →</a
							>
						{/if}
						<!-- eslint-enable svelte/no-navigation-without-resolve -->
					</nav>
				{/if}
			</section>
		{/if}
	</div>
</main>
