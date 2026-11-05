<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
	let running = $state(false);

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
				Não foi possível ler as tabelas de auditoria. Verifique se a migration 0004 foi aplicada.
			</p>
		{:else}
			<section class="rounded-3xl border border-lia-line bg-white p-5 shadow-sm sm:p-7">
				<h2 class="text-xl font-black text-lia-navy">Resumo</h2>
				<p class="mt-2 text-sm leading-6 text-lia-muted">
					Somente leitura: a verificação compara o catálogo do D1 com a Shopee e nunca altera ou
					exclui produtos nem a planilha. Produtos com link curto de afiliado não têm itemId/shopId;
					a busca por nome só sugere candidatos e o vínculo precisa ser confirmado manualmente.
				</p>
				<dl class="mt-5 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4 lg:grid-cols-8">
					{#each [['Produtos', data.counts.totalProducts], ['Vinculados', data.counts.linkedProducts], ['Auditados', data.counts.audited], ...data.statuses.map( (s) => [data.statusLabels[s], data.counts.byStatus[s]] )] as [label, value] (label)}
						<div class="rounded-2xl bg-lia-cream p-3">
							<dt class="text-xs font-semibold text-lia-muted">{label}</dt>
							<dd class="text-2xl font-black text-lia-navy">{value}</dd>
						</div>
					{/each}
				</dl>
				<p class="mt-3 text-xs text-lia-muted">
					Última verificação: {when(data.counts.lastVerifiedAt)} · Chamadas na última hora: {data
						.budget.used}/{data.budget.limit}
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
						Produtos vinculados
						<input
							name="linkedLimit"
							type="number"
							min="0"
							max="50"
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
					<label class="text-sm font-semibold text-lia-navy">
						Links curtos a resolver (máx. 50)
						<input
							name="shortLinkLimit"
							type="number"
							min="0"
							max="50"
							value="10"
							class="mt-1 block w-28 rounded-xl border border-lia-line px-3 py-2"
						/>
					</label>
					<label class="flex items-center gap-2 text-sm text-lia-navy">
						<input name="force" type="checkbox" /> Reverificar mesmo se verificado recentemente
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
							>Verificação {summary.status === 'completed' ? 'concluída' : summary.status}.</strong
						>
						<p class="mt-1">
							Verificados: {summary.totals.products_checked} · Buscas por nome: {summary.totals
								.discovery_searches} · Chamadas: {summary.totals.api_calls} · Preços alterados: {summary
								.totals.price_changes} · Indisponíveis: {summary.totals.unavailable} · Falhas: {summary
								.totals.failures}
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
