<script lang="ts">
	import { resolve } from '$app/paths';
	import { formatCommissionRate } from '../../../../lib/format';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
	let searchType = $state<'general' | 'keyword' | 'category'>('general');

	function formatDate(value: string): string {
		const date = new Date(value);
		return Number.isNaN(date.getTime())
			? value
			: new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(date);
	}

	function formatPrice(value: string | number | null): string | null {
		if (value === null || !Number.isFinite(Number(value))) return null;
		if (
			typeof value === 'string' &&
			!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim())
		) {
			return null;
		}
		return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
			Number(value)
		);
	}

	function formatInteger(value: string | null): string | null {
		if (value === null || !/^[+-]?\d+$/.test(value.trim())) return null;
		return new Intl.NumberFormat('pt-BR').format(BigInt(value.trim()));
	}

	function formatSignedInteger(value: string | null): string | null {
		if (value === null || !/^[+-]?\d+$/.test(value.trim())) return null;
		return new Intl.NumberFormat('pt-BR', {
			signDisplay: 'always'
		}).format(BigInt(value.trim()));
	}

	function formatPercent(value: number | null): string | null {
		if (value === null || !Number.isFinite(value)) return null;
		return new Intl.NumberFormat('pt-BR', {
			style: 'percent',
			maximumFractionDigits: 2,
			signDisplay: 'always'
		}).format(value / 100);
	}

	function safeImageUrl(value: string | null): string | null {
		if (!value) return null;
		try {
			const url = new URL(value);
			return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
		} catch {
			return null;
		}
	}

	function safeOfferUrl(value: string | null): string | null {
		if (!value) return null;
		try {
			const url = new URL(value);
			return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
		} catch {
			return null;
		}
	}

	const filterDefs = [
		['minCommissionPercent', 'Comissão mín. (%)', '0.1'],
		['minSales', 'Vendas mín.', '1'],
		['minRating', 'Avaliação mín. (0–5)', '0.1'],
		['minPrice', 'Preço mín. (R$)', '0.01'],
		['maxPrice', 'Preço máx. (R$)', '0.01'],
		['minDiscountPercent', 'Desconto anunciado mín. (%)', '1']
	] as const;
	let collectDiscount = $state('');
</script>

{#snippet filterFields(values: Record<string, string | null | undefined>, prefix: string)}
	{#each filterDefs as [name, label, step] (name)}
		<label class="grid gap-1 text-sm font-semibold text-lia-ink" for="{prefix}-{name}">
			{label}
			{#if prefix === 'collect' && name === 'minDiscountPercent'}
				<input
					id="{prefix}-{name}"
					{name}
					type="number"
					min="0"
					max="100"
					{step}
					bind:value={collectDiscount}
					class="rounded-xl border border-lia-line px-3 py-2"
				/>
			{:else}
				<input
					id="{prefix}-{name}"
					{name}
					type="number"
					min="0"
					{step}
					value={values[name] ?? ''}
					class="rounded-xl border border-lia-line px-3 py-2"
				/>
			{/if}
		</label>
	{/each}
{/snippet}

<svelte:head>
	<title>Candidatos Shopee | Administração — Achadinhos da Lia</title>
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
				<h1 class="mt-1 text-2xl font-black text-lia-navy">Candidatos Shopee</h1>
			</div>
			<form method="POST" action="/admin/logout">
				<button class="rounded-xl bg-lia-navy px-4 py-2 text-sm font-bold text-white">Sair</button>
			</form>
		</div>
	</header>

	<div class="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
		<section class="rounded-3xl border border-lia-line bg-white p-5 shadow-sm sm:p-7">
			<h2 class="text-xl font-black text-lia-navy">Coleta manual</h2>
			<p class="mt-2 text-sm leading-6 text-lia-muted">
				A coleta só começa ao enviar este formulário. Limites por execução: até 3 páginas e 20
				produtos por página. Aprovar candidatos registra a decisão; em seguida, use <a
					href={resolve('/admin/products/add')}
					class="font-bold text-lia-orange hover:underline">Adicionar ao catálogo</a
				> para revalidar e incluir os aprovados no D1.
			</p>
			<form method="POST" action="?/collect" class="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
				<label class="grid gap-1 text-sm font-semibold text-lia-ink">
					Tipo de busca
					<select
						name="searchType"
						bind:value={searchType}
						class="rounded-xl border border-lia-line px-3 py-2.5"
					>
						<option value="general">Geral</option>
						<option value="keyword">Palavra-chave</option>
						<option value="category">Categoria</option>
					</select>
				</label>
				<label class="grid gap-1 text-sm font-semibold text-lia-ink">
					Palavra-chave
					<input
						name="keyword"
						maxlength="100"
						oninput={(event) => {
							if (event.currentTarget.value.trim()) searchType = 'keyword';
						}}
						class="rounded-xl border border-lia-line px-3 py-2.5"
						placeholder="Ex.: fone bluetooth"
					/>
				</label>
				<label class="grid gap-1 text-sm font-semibold text-lia-ink">
					ID de categoria
					<input
						name="productCatId"
						inputmode="numeric"
						pattern="[0-9]+"
						class="rounded-xl border border-lia-line px-3 py-2.5"
					/>
				</label>
				<label class="grid gap-1 text-sm font-semibold text-lia-ink">
					Páginas (1–3)
					<input
						name="pages"
						type="number"
						min="1"
						max="3"
						value="1"
						required
						class="rounded-xl border border-lia-line px-3 py-2.5"
					/>
				</label>
				<label class="grid gap-1 text-sm font-semibold text-lia-ink">
					Produtos por página (1–20)
					<input
						name="pageLimit"
						type="number"
						min="1"
						max="20"
						value="20"
						required
						class="rounded-xl border border-lia-line px-3 py-2.5"
					/>
				</label>
				<fieldset
					class="grid gap-3 rounded-2xl border border-lia-line p-4 sm:col-span-2 sm:grid-cols-3 lg:col-span-5 lg:grid-cols-6"
				>
					<legend class="px-2 text-sm font-black text-lia-navy">Filtros (opcionais)</legend>
					{@render filterFields({}, 'collect')}
					<p class="text-xs text-lia-muted sm:col-span-3 lg:col-span-6">
						Só candidatos que atendem a todos os filtros são salvos. O desconto é o percentual
						anunciado pela Shopee e não prova redução real de preço; o histórico de preços continua
						sendo a referência.
						<button
							type="button"
							class="font-bold text-lia-orange hover:underline"
							onclick={() => (collectDiscount = '30')}>Usar desconto ≥ 30%</button
						>
					</p>
				</fieldset>
				<button
					type="submit"
					class="rounded-xl bg-lia-orange px-5 py-3 text-sm font-black text-white hover:brightness-95 sm:col-span-2 lg:col-span-5"
				>
					Iniciar coleta
				</button>
			</form>
			{#if form?.message}
				<p class="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900" role="alert">
					{form.message}
				</p>
			{/if}
			{#if form?.collectionSummary}
				{@const summary = form.collectionSummary}
				<div class="mt-4 rounded-2xl bg-lia-cream p-4 text-sm text-lia-ink" role="status">
					<strong
						>Coleta {summary.status === 'completed'
							? 'concluída'
							: summary.status === 'partial'
								? 'parcial'
								: 'com falha'}.</strong
					>
					<p class="mt-1">
						Consultas realizadas: {summary.queriesPerformed} · Produtos encontrados: {summary.productsFound}
						{#if summary.filteredOut}· Fora dos filtros: {summary.filteredOut}{/if}
						· Novos: {summary.newCandidates} · Atualizados: {summary.updatedCandidates} · Falhas: {summary.failures}
					</p>
					{#if summary.errorMessage}
						<p class="mt-1 text-amber-800">{summary.errorCode}: {summary.errorMessage}</p>
					{/if}
				</div>
			{/if}
			{#if form?.decisionMessage}
				<p class="mt-4 rounded-xl bg-green-50 p-3 text-sm text-green-900" role="status">
					{form.decisionMessage}
				</p>
			{/if}
		</section>

		<section class="rounded-3xl border border-lia-line bg-white p-5 shadow-sm sm:p-7">
			<div class="flex flex-wrap items-end justify-between gap-4">
				<div>
					<h2 class="text-xl font-black text-lia-navy">Produtos coletados</h2>
					<p class="mt-1 text-sm text-lia-muted">
						Lista limitada aos 100 candidatos mais recentes.
					</p>
				</div>
				<form method="GET" class="flex flex-wrap gap-2">
					<label class="sr-only" for="candidate-search">Buscar por nome ou ID</label>
					<input
						id="candidate-search"
						name="q"
						value={data.search}
						maxlength="100"
						placeholder="Nome ou ID"
						class="rounded-xl border border-lia-line px-3 py-2 text-sm"
					/>
					<label class="sr-only" for="candidate-status">Filtrar por estado</label>
					<select
						id="candidate-status"
						name="status"
						value={data.status ?? ''}
						class="rounded-xl border border-lia-line px-3 py-2 text-sm"
					>
						<option value="">Todos os estados</option>
						<option value="pending">Pendentes</option>
						<option value="approved">Aprovados</option>
						<option value="rejected">Rejeitados</option>
					</select>
					<details class="w-full" open={Object.values(data.filterValues).some(Boolean)}>
						<summary class="cursor-pointer text-sm font-semibold text-lia-orange"
							>Filtros comerciais</summary
						>
						<div class="mt-2 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
							{@render filterFields(data.filterValues, 'list')}
						</div>
					</details>
					<button class="rounded-xl bg-lia-navy px-4 py-2 text-sm font-bold text-white"
						>Filtrar</button
					>
				</form>
			</div>
			{#if data.filterError}
				<p class="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900" role="alert">
					{data.filterError} Os filtros comerciais foram ignorados.
				</p>
			{/if}

			{#if data.state === 'unavailable'}
				<p class="mt-5 rounded-xl bg-amber-50 p-4 text-sm text-amber-900" role="status">
					O binding D1 ainda não está disponível. Inicie o Worker local pelo comando documentado e
					aplique a migration local.
				</p>
			{:else if data.state === 'error'}
				<p class="mt-5 rounded-xl bg-red-50 p-4 text-sm text-red-800" role="alert">
					Não foi possível carregar os candidatos do D1.
				</p>
			{:else if data.candidates.length === 0}
				<p class="mt-5 text-sm text-lia-muted">Nenhum candidato corresponde aos filtros.</p>
			{:else}
				<ul class="mt-5 divide-y divide-lia-line">
					{#each data.candidates as candidate (`${candidate.item_id}:${candidate.shop_id}`)}
						{@const price = formatPrice(candidate.price)}
						{@const priceMin = formatPrice(candidate.price_min)}
						{@const priceMax = formatPrice(candidate.price_max)}
						{@const history = candidate.history}
						<li class="grid gap-4 py-5 md:grid-cols-[6rem_1fr_auto]">
							<div
								class="flex size-24 items-center justify-center overflow-hidden rounded-xl bg-lia-cream"
							>
								{#if safeImageUrl(candidate.image_url)}
									<img
										src={safeImageUrl(candidate.image_url) ?? undefined}
										alt=""
										loading="lazy"
										class="size-full object-contain"
									/>
								{:else}
									<span class="text-xs text-lia-muted">Sem imagem</span>
								{/if}
							</div>
							<div class="min-w-0">
								<h3 class="font-bold text-lia-navy">
									{candidate.product_name ?? 'Produto sem nome'}
								</h3>
								<p class="mt-1 text-xs break-all text-lia-muted">
									itemId {candidate.item_id} · shopId {candidate.shop_id} · Estado atual:
									<strong class="font-bold text-lia-navy">{candidate.status}</strong>
								</p>
								<p class="mt-2 text-sm text-lia-ink">
									Preço: {price ?? 'indisponível'}
									· Faixa: {priceMin && priceMax ? `${priceMin} – ${priceMax}` : 'indisponível'}
									· Comissão informada: {formatCommissionRate(candidate.commission_rate) ?? '—'}
									· Desconto informado pela Shopee (não comprovado): {candidate.price_discount_rate ??
										'—'}
								</p>
								<p class="mt-1 text-sm text-lia-muted">
									Vendas: {candidate.sales ?? '—'} · Avaliação: {candidate.rating_star ?? '—'} · Categorias
									originais: {candidate.product_cat_ids?.join(', ') ?? '—'}
								</p>
								<p class="mt-1 text-sm">
									{#if safeOfferUrl(candidate.offer_link)}
										<!-- eslint-disable svelte/no-navigation-without-resolve -- URL externa de afiliado. -->
										<a
											href={safeOfferUrl(candidate.offer_link) ?? undefined}
											target="_blank"
											rel="noopener noreferrer"
											class="font-bold text-lia-orange underline underline-offset-2 hover:text-lia-navy"
										>
											Abrir link de afiliado
										</a>
										<!-- eslint-enable svelte/no-navigation-without-resolve -->
									{:else}
										<span class="text-lia-muted">Link de afiliado indisponível</span>
									{/if}
								</p>
								<p class="mt-1 text-xs text-lia-muted">
									Primeira coleta: {formatDate(candidate.first_seen_at)} · Última coleta: {formatDate(
										candidate.last_seen_at
									)}
								</p>
								<section
									class="mt-3 rounded-xl border border-lia-line bg-lia-cream/60 p-3 text-sm text-lia-ink"
									aria-label="Histórico de mercado"
								>
									<h4 class="font-bold text-lia-navy">Histórico de mercado</h4>
									<p class="mt-1 text-xs text-lia-muted">
										{history.observation_count}
										{history.observation_count === 1 ? 'observação' : 'observações'}
										· Primeira: {history.first_observed_at
											? formatDate(history.first_observed_at)
											: '—'}
										· Última atualização: {history.last_observed_at
											? formatDate(history.last_observed_at)
											: '—'}
									</p>
									{#if history.observation_count === 0}
										<p class="mt-1 text-xs text-lia-muted">
											Ainda não há observações históricas nem dados numéricos válidos.
										</p>
									{:else}
										<p class="mt-1">
											Menor / maior preço observado:
											{formatPrice(history.min_observed_price) ?? '—'} /
											{formatPrice(history.max_observed_price) ?? '—'}
										</p>
										{#if history.min_observed_price === null && history.max_observed_price === null}
											<p class="mt-1 text-xs text-amber-800">
												O histórico não possui preços numéricos válidos.
											</p>
										{/if}
										{#if history.observation_count === 1}
											<p class="mt-1 text-xs text-lia-muted">
												Há somente uma observação; ainda não existe comparação suficiente.
											</p>
										{:else}
											<p class="mt-1">
												Preço atual:
												{formatPrice(history.current_price) ?? 'indisponível'}
												· Preço anterior:
												{formatPrice(history.previous_price) ?? 'indisponível'}
												· Variação para a observação mais recente:
												{formatPercent(history.price_change_percent) ??
													(history.current_price && history.previous_price
														? 'indisponível (os preços devem ser maiores que zero e válidos)'
														: 'indisponível')}
											</p>
										{/if}
										<p class="mt-1">
											Evolução de vendas:
											{formatInteger(history.previous_sales) ?? '—'} →
											{formatInteger(history.current_sales) ?? '—'}
											{#if history.sales_change !== null}
												({formatSignedInteger(history.sales_change)})
											{/if}
										</p>
										<p class="mt-1 text-xs text-lia-muted">
											Comissão mais recente informada: {formatCommissionRate(
												history.latest_commission_rate
											) ?? '—'}
										</p>
									{/if}
								</section>
								<section
									class="mt-3 rounded-xl border border-lia-line bg-white p-3 text-sm text-lia-ink"
									aria-label="Pontuação comercial"
								>
									<h4 class="font-bold text-lia-navy">
										{#if candidate.score.score === null}
											Pontuação comercial: Sem dados suficientes
										{:else}
											Pontuação comercial: {candidate.score.score.toLocaleString('pt-BR')}/100 ·
											{candidate.score.classification}
										{/if}
									</h4>
									<p class="mt-1 text-xs text-lia-muted">
										Confiança {candidate.score.confidence} · Cobertura dos critérios: {Math.round(
											candidate.score.coverage * 100
										)}%
									</p>
									<ul class="mt-2 grid gap-1 text-xs">
										{#each candidate.score.criteria as criterion (criterion.key)}
											<li class={criterion.available ? '' : 'text-amber-800'}>
												<strong class="font-bold">{criterion.label}</strong>
												({Math.round(criterion.weight * 100)}%):
												{#if criterion.available}
													{criterion.score?.toLocaleString('pt-BR')}/100
												{:else}
													indisponível — {criterion.reason}
												{/if}
											</li>
										{/each}
									</ul>
								</section>
								{#if candidate.rejection_reason}
									<p class="mt-1 text-sm text-red-800">Motivo: {candidate.rejection_reason}</p>
								{/if}
							</div>
							<div class="flex flex-wrap items-start gap-2 md:flex-col">
								{#if candidate.status === 'pending'}
									<form method="POST" action="?/approve">
										<input type="hidden" name="itemId" value={candidate.item_id} />
										<input type="hidden" name="shopId" value={candidate.shop_id} />
										<button
											class="rounded-xl bg-green-700 px-3 py-2 text-sm font-bold text-white hover:bg-green-800"
										>
											Aprovar
										</button>
									</form>
									<form method="POST" action="?/reject" class="grid gap-2">
										<input type="hidden" name="itemId" value={candidate.item_id} />
										<input type="hidden" name="shopId" value={candidate.shop_id} />
										<label class="sr-only" for={`reason-${candidate.item_id}-${candidate.shop_id}`}
											>Motivo da rejeição</label
										>
										<input
											id={`reason-${candidate.item_id}-${candidate.shop_id}`}
											name="rejectionReason"
											required
											maxlength="500"
											placeholder="Motivo da rejeição"
											class="max-w-56 rounded-xl border border-lia-line px-3 py-2 text-sm"
										/>
										<button
											class="rounded-xl border border-red-300 px-3 py-2 text-sm font-bold text-red-800 hover:bg-red-50"
										>
											Rejeitar
										</button>
									</form>
								{:else if candidate.status === 'approved'}
									<span
										class="rounded-full bg-green-50 px-3 py-1 text-xs font-bold text-green-900"
										role="status"
									>
										Aprovado
									</span>
								{:else if candidate.status === 'rejected'}
									<span
										class="rounded-full bg-red-50 px-3 py-1 text-xs font-bold text-red-800"
										role="status"
									>
										Rejeitado
									</span>
								{/if}
							</div>
						</li>
					{/each}
				</ul>
			{/if}
		</section>
	</div>
</main>
