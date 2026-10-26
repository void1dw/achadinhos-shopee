<script lang="ts">
	import { invalidateAll, goto } from '$app/navigation';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	type Row = Record<string, string | number>;
	type ProductMetric = {
		id: string;
		name: string;
		category: string;
		selected: number;
		affiliate: number;
	};
	type CategoryMetric = { name: string; selected: number; affiliate: number };
	type ChartPoint = {
		label: string;
		views: number;
		clicks: number;
		x: number;
		viewY: number;
		clickY: number;
	};

	const reports = $derived(data.state === 'ready' ? data.reports : null);
	const dailyRows = $derived(reports?.daily ?? []);
	const eventRows = $derived(reports?.dailyCommercialEvents ?? []);
	const summary = $derived(reports?.summary[0] ?? {});

	function value(row: Row, key: string): string {
		return String(row[key] ?? '');
	}

	function count(row: Row, key: string): number {
		const parsed = Number(row[key] ?? 0);
		return Number.isFinite(parsed) ? parsed : 0;
	}

	function formatNumber(number: number): string {
		return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 }).format(number);
	}

	function formatDay(value: string): string {
		const normalized =
			value.length === 8 ? `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}` : value;
		const date = new Date(`${normalized}T00:00:00Z`);
		return Number.isNaN(date.getTime())
			? value
			: new Intl.DateTimeFormat('pt-BR', {
					day: '2-digit',
					month: 'short',
					timeZone: 'UTC'
				}).format(date);
	}

	function eventCount(eventName: string): number {
		return eventRows
			.filter((row) => value(row, 'eventName') === eventName)
			.reduce((total, row) => total + count(row, 'eventCount'), 0);
	}

	const affiliateClicks = $derived(eventCount('affiliate_click'));
	const selectedCount = $derived(eventCount('select_item'));
	const categorySelections = $derived(eventCount('select_category'));

	const chartPoints = $derived.by((): ChartPoint[] => {
		const viewByDate = new Map(
			dailyRows.map((row) => [value(row, 'date'), count(row, 'screenPageViews')])
		);
		const clicksByDate = new Map<string, number>();
		for (const row of eventRows) {
			if (value(row, 'eventName') === 'affiliate_click') {
				const day = value(row, 'date');
				clicksByDate.set(day, (clicksByDate.get(day) ?? 0) + count(row, 'eventCount'));
			}
		}

		const { startDate, endDate } = data.dateRange;
		const cursor = new Date(`${startDate}T00:00:00Z`);
		const end = new Date(`${endDate}T00:00:00Z`);
		const points: Omit<ChartPoint, 'x' | 'viewY' | 'clickY'>[] = [];
		while (cursor <= end) {
			const key = cursor.toISOString().slice(0, 10).replace(/-/g, '');
			points.push({
				label: formatDay(key),
				views: viewByDate.get(key) ?? 0,
				clicks: clicksByDate.get(key) ?? 0
			});
			cursor.setUTCDate(cursor.getUTCDate() + 1);
		}
		const maxValue = Math.max(1, ...points.flatMap((point) => [point.views, point.clicks]));
		const chartHeight = 190;
		return points.map((point, index) => ({
			...point,
			x: points.length <= 1 ? 400 : 32 + (index / (points.length - 1)) * 736,
			viewY: 20 + chartHeight - (point.views / maxValue) * chartHeight,
			clickY: 20 + chartHeight - (point.clicks / maxValue) * chartHeight
		}));
	});
	const chartViews = $derived(chartPoints.map((point) => `${point.x},${point.viewY}`).join(' '));
	const chartClicks = $derived(chartPoints.map((point) => `${point.x},${point.clickY}`).join(' '));
	const maxDaily = $derived(
		Math.max(0, ...chartPoints.flatMap((point) => [point.views, point.clicks]))
	);

	const productMetrics = $derived.by((): ProductMetric[] => {
		if (!reports) return [];
		const byId = new Map<string, ProductMetric>();
		for (const row of reports.productSelections) {
			const id = value(row, 'itemId');
			if (!id) continue;
			byId.set(id, {
				id,
				name: value(row, 'itemName') || id,
				category: value(row, 'itemCategory') || '—',
				selected: count(row, 'itemsClicked'),
				affiliate: 0
			});
		}
		for (const row of reports.affiliateProducts) {
			const id = value(row, 'customEvent:affiliate_product_id');
			if (!id) continue;
			const product = byId.get(id) ?? {
				id,
				name: value(row, 'customEvent:affiliate_product_name') || id,
				category: value(row, 'customEvent:affiliate_product_category') || '—',
				selected: 0,
				affiliate: 0
			};
			product.name = value(row, 'customEvent:affiliate_product_name') || product.name;
			product.category = value(row, 'customEvent:affiliate_product_category') || product.category;
			product.affiliate = count(row, 'eventCount');
			byId.set(id, product);
		}
		return [...byId.values()]
			.sort((left, right) => right.affiliate - left.affiliate || right.selected - left.selected)
			.slice(0, 8);
	});

	const categoryMetrics = $derived.by((): CategoryMetric[] => {
		if (!reports) return [];
		const byName = new Map<string, CategoryMetric>();
		for (const row of reports.categoryInterest) {
			const name = value(row, 'customEvent:category_name');
			if (name) {
				byName.set(name, {
					name,
					selected: count(row, 'eventCount'),
					affiliate: 0
				});
			}
		}
		for (const row of reports.affiliateProducts) {
			const name = value(row, 'customEvent:affiliate_product_category');
			if (!name) continue;
			const metric = byName.get(name) ?? { name, selected: 0, affiliate: 0 };
			metric.affiliate += count(row, 'eventCount');
			byName.set(name, metric);
		}
		return [...byName.values()]
			.sort((left, right) => right.affiliate - left.affiliate || right.selected - left.selected)
			.slice(0, 8);
	});

	const sources = $derived(
		(reports?.acquisition ?? [])
			.slice()
			.sort((left, right) => count(right, 'sessions') - count(left, 'sessions'))
			.slice(0, 8)
	);
	const domains = $derived(
		(reports?.affiliateDomains ?? [])
			.slice()
			.sort((left, right) => count(right, 'eventCount') - count(left, 'eventCount'))
	);
	const maxCategoryValue = $derived(
		Math.max(1, ...categoryMetrics.flatMap((metric) => [metric.selected, metric.affiliate]))
	);
	const maxDomainValue = $derived(Math.max(1, ...domains.map((row) => count(row, 'eventCount'))));

	async function changePeriod(days: number) {
		await goto(`/admin?days=${days}`);
	}
</script>

<svelte:head>
	<title>Desempenho comercial | Administração — Achadinhos da Lia</title>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<div class="min-h-screen bg-lia-cream">
	<header class="border-b border-lia-line bg-white">
		<div
			class="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8"
		>
			<a href="/" class="flex items-center gap-3" aria-label="Voltar à loja Achadinhos da Lia">
				<span
					class="grid size-11 place-items-center rounded-2xl bg-lia-navy text-lg font-black text-white"
					>L</span
				>
				<span>
					<strong class="block text-sm font-black text-lia-navy">Achadinhos da Lia</strong>
					<span class="text-xs font-medium text-lia-muted">Painel administrativo</span>
				</span>
			</a>
			<div class="flex items-center gap-2">
				<label class="sr-only" for="period">Período do relatório</label>
				<select
					id="period"
					value={data.days}
					onchange={(event) => changePeriod(Number(event.currentTarget.value))}
					class="rounded-xl border border-lia-line bg-white px-3 py-2.5 text-sm font-semibold text-lia-navy outline-none focus:border-lia-orange"
				>
					<option value="7">Últimos 7 dias</option>
					<option value="30">Últimos 30 dias</option>
					<option value="90">Últimos 90 dias</option>
				</select>
				<button
					type="button"
					onclick={() => invalidateAll()}
					class="rounded-xl border border-lia-line px-3 py-2.5 text-sm font-bold text-lia-navy transition hover:border-lia-orange hover:text-lia-orange"
				>
					Atualizar
				</button>
				<form method="POST" action="/admin/logout">
					<button
						type="submit"
						class="rounded-xl bg-lia-navy px-3 py-2.5 text-sm font-bold text-white transition hover:bg-lia-orange"
					>
						Sair
					</button>
				</form>
			</div>
		</div>
	</header>

	<main class="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
		<div class="mb-7 flex flex-wrap items-end justify-between gap-3">
			<div>
				<p class="text-xs font-extrabold tracking-[0.18em] text-lia-orange uppercase">Analytics</p>
				<h1 class="mt-1 text-3xl font-black tracking-tight text-lia-navy sm:text-4xl">
					Desempenho comercial
				</h1>
			</div>
			<p class="text-sm text-lia-muted">
				{formatDay(data.dateRange.startDate.replace(/-/g, ''))} — {formatDay(
					data.dateRange.endDate.replace(/-/g, '')
				)}
			</p>
		</div>

		{#if data.state === 'pending'}
			<section
				class="rounded-3xl border border-amber-200 bg-white p-6 shadow-sm sm:p-8"
				role="status"
			>
				<div
					class="flex size-12 items-center justify-center rounded-2xl bg-amber-100 text-xl text-amber-800"
				>
					!
				</div>
				<h2 class="mt-4 text-xl font-black text-lia-navy">Integração do GA4 pendente</h2>
				<p class="mt-2 max-w-2xl text-sm leading-6 text-lia-muted">
					O painel está protegido e pronto, mas ainda não há credenciais válidas da Data API neste
					Worker. Configure os secrets de relatório e as permissões descritas no guia de ativação
					para carregar dados reais. Nenhum dado de demonstração é exibido.
				</p>
			</section>
		{:else if data.state === 'error'}
			<section class="rounded-3xl border border-red-200 bg-white p-6 shadow-sm" role="alert">
				<h2 class="text-lg font-black text-red-800">Não foi possível carregar os relatórios</h2>
				<p class="mt-2 text-sm text-lia-muted">{data.message}</p>
				<button
					type="button"
					onclick={() => invalidateAll()}
					class="mt-4 rounded-xl bg-lia-navy px-4 py-2.5 text-sm font-bold text-white"
				>
					Tentar novamente
				</button>
			</section>
		{:else}
			<section class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Indicadores principais">
				<article class="metric-card">
					<span class="metric-label">Usuários</span>
					<strong>{formatNumber(count(summary, 'totalUsers'))}</strong>
					<span class="metric-note">no período selecionado</span>
				</article>
				<article class="metric-card">
					<span class="metric-label">Sessões</span>
					<strong>{formatNumber(count(summary, 'sessions'))}</strong>
					<span class="metric-note">visitas iniciadas</span>
				</article>
				<article class="metric-card">
					<span class="metric-label">Visualizações</span>
					<strong>{formatNumber(count(summary, 'screenPageViews'))}</strong>
					<span class="metric-note">páginas e telas vistas</span>
				</article>
				<article class="metric-card metric-card-accent">
					<span class="metric-label">Cliques afiliados</span>
					<strong>{formatNumber(affiliateClicks)}</strong>
					<span class="metric-note">saídas para lojas parceiras</span>
				</article>
			</section>

			<section class="panel mt-5">
				<div class="panel-heading">
					<div>
						<h2>Evolução diária</h2>
						<p>Visualizações de página e cliques afiliados</p>
					</div>
					<div class="flex flex-wrap gap-4 text-xs font-bold text-lia-muted">
						<span class="flex items-center gap-2"
							><i class="legend-dot bg-lia-navy"></i>Visualizações</span
						>
						<span class="flex items-center gap-2"
							><i class="legend-dot bg-lia-orange"></i>Cliques afiliados</span
						>
					</div>
				</div>
				{#if maxDaily === 0}
					<p class="chart-empty">Ainda não há atividade registrada no período.</p>
				{:else}
					<div class="chart-wrap">
						<div class="chart-y-labels" aria-hidden="true">
							<span>{formatNumber(maxDaily)}</span><span
								>{formatNumber(Math.round(maxDaily / 2))}</span
							><span>0</span>
						</div>
						<svg
							class="trend-chart"
							viewBox="0 0 800 250"
							role="img"
							aria-label="Gráfico diário de visualizações e cliques afiliados"
						>
							<line x1="32" y1="20" x2="768" y2="20" class="grid-line" />
							<line x1="32" y1="115" x2="768" y2="115" class="grid-line" />
							<line x1="32" y1="210" x2="768" y2="210" class="grid-line" />
							<polyline points={chartViews} class="chart-line chart-line-views" />
							<polyline points={chartClicks} class="chart-line chart-line-clicks" />
							{#each chartPoints as point, index}
								{#if chartPoints.length <= 7 || index === 0 || index === Math.floor(chartPoints.length / 2) || index === chartPoints.length - 1}
									<text x={point.x} y="239" text-anchor="middle" class="chart-label"
										>{point.label}</text
									>
								{/if}
							{/each}
						</svg>
					</div>
				{/if}
			</section>

			<div class="mt-5 grid gap-5 xl:grid-cols-2">
				<section class="panel">
					<div class="panel-heading">
						<div>
							<h2>Produtos em destaque</h2>
							<p>Seleções e saídas afiliadas por produto</p>
						</div>
					</div>
					{#if productMetrics.length}
						<div class="table-scroll">
							<table>
								<thead><tr><th>Produto</th><th>Selecionado</th><th>Afiliado</th></tr></thead>
								<tbody>
									{#each productMetrics as product (product.id)}
										<tr>
											<td><strong>{product.name}</strong><small>{product.category}</small></td>
											<td>{formatNumber(product.selected)}</td>
											<td class="font-extrabold text-lia-orange"
												>{formatNumber(product.affiliate)}</td
											>
										</tr>
									{/each}
								</tbody>
							</table>
						</div>
					{:else}
						<p class="empty-note">Sem eventos de produtos neste período.</p>
					{/if}
					<p class="panel-footnote">Seleções: {formatNumber(selectedCount)}</p>
				</section>

				<section class="panel">
					<div class="panel-heading">
						<div>
							<h2>Categorias com mais interesse</h2>
							<p>Navegação por categoria e cliques afiliados associados</p>
						</div>
					</div>
					{#if categoryMetrics.length}
						<div class="space-y-5">
							{#each categoryMetrics as category (category.name)}
								<div>
									<div class="mb-2 flex items-center justify-between gap-3 text-sm">
										<strong class="truncate text-lia-navy">{category.name}</strong>
										<span class="shrink-0 text-xs text-lia-muted">
											{formatNumber(category.selected)} interesse · {formatNumber(
												category.affiliate
											)} cliques
										</span>
									</div>
									<div class="space-y-1.5">
										<div class="bar-track">
											<span
												class="bar-fill bg-lia-navy"
												style={`width:${(category.selected / maxCategoryValue) * 100}%`}
											></span>
										</div>
										<div class="bar-track">
											<span
												class="bar-fill bg-lia-orange"
												style={`width:${(category.affiliate / maxCategoryValue) * 100}%`}
											></span>
										</div>
									</div>
								</div>
							{/each}
						</div>
					{:else}
						<p class="empty-note">Sem eventos de categorias neste período.</p>
					{/if}
					<p class="panel-footnote">{formatNumber(categorySelections)} seleções de categoria</p>
				</section>

				<section class="panel">
					<div class="panel-heading">
						<div>
							<h2>Origem dos visitantes</h2>
							<p>Sessões por origem e mídia</p>
						</div>
					</div>
					{#if sources.length}
						<div class="table-scroll">
							<table>
								<thead><tr><th>Origem / mídia</th><th>Sessões</th><th>Usuários</th></tr></thead>
								<tbody>
									{#each sources as source, index}
										<tr>
											<td
												><strong>{value(source, 'sessionSource') || '(direct)'}</strong><small
													>{value(source, 'sessionMedium') || '(none)'}</small
												></td
											>
											<td>{formatNumber(count(source, 'sessions'))}</td>
											<td>{formatNumber(count(source, 'totalUsers'))}</td>
										</tr>
									{/each}
								</tbody>
							</table>
						</div>
					{:else}
						<p class="empty-note">Sem dados de aquisição neste período.</p>
					{/if}
				</section>

				<section class="panel">
					<div class="panel-heading">
						<div>
							<h2>Domínios de destino</h2>
							<p>Distribuição dos cliques afiliados</p>
						</div>
					</div>
					{#if domains.length}
						<div class="space-y-4">
							{#each domains as domain}
								{@const name = value(domain, 'customEvent:link_domain')}
								{@const clicks = count(domain, 'eventCount')}
								<div>
									<div class="mb-2 flex justify-between gap-3 text-sm">
										<strong class="truncate text-lia-navy">{name || '(não informado)'}</strong>
										<span class="font-bold text-lia-ink">{formatNumber(clicks)}</span>
									</div>
									<div class="bar-track h-2.5">
										<span
											class="bar-fill bg-lia-orange"
											style={`width:${(clicks / maxDomainValue) * 100}%`}
										></span>
									</div>
								</div>
							{/each}
						</div>
					{:else}
						<p class="empty-note">Sem cliques afiliados por domínio neste período.</p>
					{/if}
				</section>
			</div>
		{/if}
	</main>
</div>

<style>
	.metric-card {
		display: flex;
		min-height: 150px;
		flex-direction: column;
		justify-content: space-between;
		gap: 0.45rem;
		border: 1px solid var(--lia-line);
		border-radius: 1.25rem;
		background: #fff;
		padding: 1.25rem;
		box-shadow: 0 8px 24px rgb(13 40 107 / 4%);
	}
	.metric-card-accent {
		border-color: rgb(244 99 16 / 24%);
		background: linear-gradient(145deg, #fff 48%, #fff3e9);
	}
	.metric-label {
		color: var(--lia-muted);
		font-size: 0.8rem;
		font-weight: 700;
	}
	.metric-card strong {
		color: var(--lia-navy);
		font-size: 2rem;
		font-weight: 900;
		letter-spacing: -0.04em;
		line-height: 1;
	}
	.metric-card-accent strong {
		color: var(--lia-orange);
	}
	.metric-note {
		color: var(--lia-muted);
		font-size: 0.75rem;
	}
	.panel {
		min-width: 0;
		border: 1px solid var(--lia-line);
		border-radius: 1.5rem;
		background: #fff;
		padding: 1.25rem;
		box-shadow: 0 8px 24px rgb(13 40 107 / 4%);
	}
	.panel-heading {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 1rem;
		margin-bottom: 1.35rem;
	}
	.panel-heading h2 {
		color: var(--lia-navy);
		font-size: 1.05rem;
		font-weight: 850;
		letter-spacing: -0.02em;
	}
	.panel-heading p {
		margin-top: 0.25rem;
		color: var(--lia-muted);
		font-size: 0.78rem;
	}
	.legend-dot {
		display: inline-block;
		width: 0.55rem;
		height: 0.55rem;
		border-radius: 999px;
	}
	.chart-wrap {
		display: flex;
		align-items: stretch;
		gap: 0.75rem;
	}
	.chart-y-labels {
		display: flex;
		flex: none;
		flex-direction: column;
		justify-content: space-between;
		padding: 0.2rem 0 1.7rem;
		color: var(--lia-muted);
		font-size: 0.65rem;
		text-align: right;
	}
	.trend-chart {
		display: block;
		width: 100%;
		overflow: visible;
	}
	.grid-line {
		stroke: var(--lia-line);
		stroke-dasharray: 4 5;
		stroke-width: 1;
	}
	.chart-line {
		fill: none;
		stroke-linecap: round;
		stroke-linejoin: round;
		stroke-width: 3;
		vector-effect: non-scaling-stroke;
	}
	.chart-line-views {
		stroke: var(--lia-navy);
	}
	.chart-line-clicks {
		stroke: var(--lia-orange);
	}
	.chart-label {
		fill: var(--lia-muted);
		font-size: 10px;
	}
	.chart-empty,
	.empty-note {
		padding: 2.5rem 1rem;
		color: var(--lia-muted);
		font-size: 0.85rem;
		text-align: center;
	}
	.table-scroll {
		overflow-x: auto;
	}
	table {
		width: 100%;
		border-collapse: collapse;
		text-align: left;
	}
	th {
		padding: 0.65rem 0.5rem;
		border-bottom: 1px solid var(--lia-line);
		color: var(--lia-muted);
		font-size: 0.68rem;
		font-weight: 800;
		text-transform: uppercase;
		letter-spacing: 0.06em;
	}
	td {
		padding: 0.8rem 0.5rem;
		border-bottom: 1px solid #f2f0eb;
		color: var(--lia-ink);
		font-size: 0.82rem;
		white-space: nowrap;
	}
	td:first-child {
		max-width: 18rem;
		white-space: normal;
	}
	td strong,
	td small {
		display: block;
	}
	td strong {
		overflow: hidden;
		text-overflow: ellipsis;
	}
	td small {
		margin-top: 0.2rem;
		color: var(--lia-muted);
		font-size: 0.7rem;
	}
	.panel-footnote {
		margin-top: 1rem;
		color: var(--lia-muted);
		font-size: 0.72rem;
	}
	.bar-track {
		height: 0.45rem;
		overflow: hidden;
		border-radius: 999px;
		background: #f1f0ec;
	}
	.bar-fill {
		display: block;
		height: 100%;
		min-width: 0;
		border-radius: inherit;
		transition: width 240ms ease;
	}
	@media (max-width: 640px) {
		.panel {
			padding: 1rem;
		}
		.panel-heading {
			flex-direction: column;
		}
		.metric-card {
			min-height: 130px;
		}
	}
</style>
