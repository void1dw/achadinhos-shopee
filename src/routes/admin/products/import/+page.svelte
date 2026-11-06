<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
	let importing = $state(false);
</script>

<svelte:head>
	<title>Importação legada da planilha | Administração — Achadinhos da Lia</title>
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
				<h1 class="mt-1 text-2xl font-black text-lia-navy">
					Importação legada da planilha (somente leitura)
				</h1>
			</div>
			<form method="POST" action="/admin/logout">
				<button class="rounded-xl bg-lia-navy px-4 py-2 text-sm font-bold text-white">Sair</button>
			</form>
		</div>
	</header>

	<div class="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
		<section class="rounded-3xl border border-lia-line bg-white p-5 shadow-sm sm:p-7">
			<h2 class="text-xl font-black text-lia-navy">Diagnóstico</h2>
			<p class="mt-2 text-sm leading-6 text-lia-muted">
				A planilha é usada apenas como fonte de leitura; ao confirmar, os produtos são inseridos no
				catálogo D1. Esta tela nunca grava na planilha. Produtos já existentes no D1 só são
				sobrescritos se você marcar a opção de atualização.
			</p>

			{#if data.state === 'unavailable'}
				<p class="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900" role="alert">
					O banco D1 não está disponível neste ambiente.
				</p>
			{:else if data.state === 'sheet-error'}
				<p class="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900" role="alert">
					Não foi possível ler a planilha de produtos. Tente atualizar o diagnóstico.
				</p>
			{:else if data.state === 'db-error'}
				<p class="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900" role="alert">
					Não foi possível consultar a tabela <code>products</code> no D1. Verifique se a migration 0003
					foi aplicada.
				</p>
			{:else if data.state === 'ready'}
				{@const report = data.report}
				<dl class="mt-5 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3 lg:grid-cols-6">
					{#each [['Linhas', report.rows], ['Válidos', report.valid], ['Rejeitados', report.rejected], ['Avisos', report.warnings], ['Já existentes', report.existing], ['Seriam inseridos', report.wouldInsert], ['Divergentes', report.wouldUpdate]] as [label, value] (label)}
						<div class="rounded-2xl bg-lia-cream p-3">
							<dt class="text-xs font-semibold text-lia-muted">{label}</dt>
							<dd class="text-2xl font-black text-lia-navy">{value}</dd>
						</div>
					{/each}
				</dl>

				{#if report.rejections.length > 0}
					<h3 class="mt-6 font-black text-lia-navy">Linhas rejeitadas</h3>
					<ul class="mt-2 space-y-2 text-sm text-lia-ink">
						{#each report.rejections as issue (`${issue.row}-${issue.id}`)}
							<li class="rounded-xl border border-lia-line p-3">
								<strong>{issue.id || '(sem ID)'}</strong> — linha {issue.row}, coluna {issue.column}
								({issue.field}): {issue.message}
								<span class="block text-xs text-lia-muted">{issue.name}</span>
							</li>
						{/each}
					</ul>
				{/if}

				{#if report.unclassified.length > 0}
					<h3 class="mt-6 font-black text-lia-navy">Categorias não classificadas</h3>
					<ul class="mt-2 flex flex-wrap gap-2 text-sm">
						{#each report.unclassified as item (item.category)}
							<li class="rounded-full bg-lia-cream px-3 py-1">
								{item.category || '(vazia)'} · {item.rows}
							</li>
						{/each}
					</ul>
				{/if}
			{/if}

			<div class="mt-6 flex flex-wrap gap-3">
				<form method="GET">
					<button
						type="submit"
						disabled={importing}
						class="rounded-xl border border-lia-line bg-white px-5 py-3 text-sm font-bold text-lia-navy disabled:opacity-60"
					>
						Atualizar diagnóstico
					</button>
				</form>
				{#if data.state === 'ready'}
					<form
						method="POST"
						action="?/import"
						use:enhance={() => {
							importing = true;
							return async ({ update }) => {
								await update({ reset: false });
								importing = false;
							};
						}}
					>
						<label class="mb-2 flex items-center gap-2 text-sm text-lia-ink">
							<input type="checkbox" name="updateExisting" />
							Atualizar também os {data.report.wouldUpdate} produto(s) divergentes (preserva o vínculo
							Shopee)
						</label>
						<button
							type="submit"
							disabled={importing ||
								(data.report.wouldInsert === 0 && data.report.wouldUpdate === 0)}
							class="rounded-xl bg-lia-orange px-5 py-3 text-sm font-black text-white hover:brightness-95 disabled:opacity-60"
						>
							{importing
								? 'Importando…'
								: `Confirmar importação de ${data.report.wouldInsert} produto(s)`}
						</button>
					</form>
				{/if}
			</div>

			{#if form?.message}
				<p class="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900" role="alert">
					{form.message}
				</p>
			{/if}
			{#if form?.importSummary}
				{@const summary = form.importSummary}
				<div class="mt-4 rounded-2xl bg-lia-cream p-4 text-sm text-lia-ink" role="status">
					<strong>Importação finalizada.</strong>
					<p class="mt-1">
						Inseridos: {summary.inserted} · Atualizados: {summary.updated} · Ignorados (já existentes):
						{summary.ignored} · Rejeitados na planilha: {summary.rejected} · Falhas: {summary.failed}
					</p>
				</div>
			{/if}
		</section>
	</div>
</main>
