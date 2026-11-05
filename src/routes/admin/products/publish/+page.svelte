<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
	let busy = $state(false);

	const when = (value: string) =>
		new Date(value).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
	const statusLabel: Record<string, string> = {
		blocked: 'Bloqueada',
		completed: 'Concluída',
		failed: 'Falhou'
	};
</script>

<svelte:head>
	<title>Publicar na planilha | Administração — Achadinhos da Lia</title>
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
				<h1 class="mt-1 text-2xl font-black text-lia-navy">Publicar aprovados na planilha</h1>
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
					: 'Não foi possível ler os dados. Verifique se a migration 0004 foi aplicada.'}
			</p>
		{:else}
			{#if !data.sheets.configured}
				<section
					class="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"
					role="status"
				>
					<p class="font-bold">Gravação bloqueada: integração de escrita não configurada.</p>
					<p class="mt-1">
						A URL CSV publicada é somente leitura. Configure como segredos: {data.sheets.missing
							.concat(data.sheets.invalid)
							.join(', ')}. Compartilhe a planilha com a conta de serviço como editora. Você pode
						gerar a prévia, mas a confirmação apenas registrará a operação como bloqueada.
					</p>
				</section>
			{/if}

			{#if form && 'published' in form}
				<p class="rounded-xl bg-emerald-50 p-3 text-sm font-bold text-emerald-800" role="status">
					{form.published} linha(s) gravada(s) na planilha.
				</p>
			{:else if form?.message}
				<p class="rounded-xl bg-red-50 p-3 text-sm text-red-800" role="alert">{form.message}</p>
			{/if}

			<form
				method="POST"
				class="rounded-3xl border border-lia-line bg-white p-5 shadow-sm sm:p-7"
				use:enhance={() => {
					busy = true;
					return async ({ update }) => {
						await update({ reset: false });
						busy = false;
					};
				}}
			>
				<h2 class="text-xl font-black text-lia-navy">Candidatos aprovados</h2>
				<p class="mt-2 text-sm text-lia-muted">
					Cada candidato é revalidado na Shopee. Só links de afiliado válidos são publicados; linhas
					são apenas adicionadas, nunca alteradas. Máximo de 10 por operação.
				</p>
				{#if data.approved.length === 0}
					<p class="mt-4 text-sm text-lia-muted">
						Nenhum candidato aprovado pendente de publicação.
					</p>
				{:else}
					<ul class="mt-4 divide-y divide-lia-line">
						{#each data.approved as candidate (candidate.item_id + ':' + candidate.shop_id)}
							{@const id = `${candidate.item_id}:${candidate.shop_id}`}
							<li class="flex flex-wrap items-center gap-3 py-3">
								<input
									type="checkbox"
									name="selected"
									value={id}
									id={`sel-${id}`}
									class="h-4 w-4"
									checked={form?.preview?.items.some((i) => `${i.itemId}:${i.shopId}` === id) ??
										false}
								/>
								<label for={`sel-${id}`} class="min-w-0 flex-1 text-sm font-bold text-lia-navy">
									{candidate.product_name ?? 'Sem nome'}
									<span class="block text-xs font-normal text-lia-muted"
										>item {candidate.item_id} · loja {candidate.shop_id} · visto em {when(
											candidate.last_seen_at
										)}</span
									>
								</label>
								<select
									name={`category:${id}`}
									aria-label="Categoria"
									class="rounded-xl border border-lia-line px-3 py-2 text-sm"
								>
									<option value="">Categoria…</option>
									{#each data.categories as category (category)}
										<option value={category}>{category}</option>
									{/each}
								</select>
							</li>
						{/each}
					</ul>
					<div class="mt-4 flex flex-wrap items-center gap-3">
						<button
							formaction="?/preview"
							disabled={busy}
							class="rounded-xl bg-lia-navy px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
							>{busy ? 'Consultando…' : 'Gerar prévia'}</button
						>
					</div>

					{#if form?.preview}
						{@const preview = form.preview}
						<div class="mt-6 space-y-4">
							<h3 class="text-lg font-black text-lia-navy">
								Prévia: {preview.items.length} linha(s) a adicionar
							</h3>
							{#each preview.items as item (item.itemId + ':' + item.shopId)}
								<div class="rounded-xl bg-lia-cream p-3 text-xs">
									<p class="font-bold text-lia-navy">{item.row.name}</p>
									<p class="break-all">
										id {item.row.id} · {item.row.category} · {item.row.price} · {item.row.date}
									</p>
									<p class="break-all text-lia-muted">{item.row.url}</p>
									{#each item.notes as note (note)}
										<p class="text-amber-900">{note}</p>
									{/each}
								</div>
							{/each}
							{#if preview.blocked.length > 0}
								<div class="rounded-xl bg-red-50 p-3 text-xs text-red-800">
									<p class="font-bold">Bloqueados (não serão gravados):</p>
									<ul class="mt-1 list-disc pl-4">
										{#each preview.blocked as block (block.itemId + ':' + block.shopId)}
											<li>
												{block.name ?? `item ${block.itemId}`}: {block.message}
											</li>
										{/each}
									</ul>
								</div>
							{/if}
							{#if preview.items.length > 0}
								<input type="hidden" name="hash" value={preview.hash} />
								<label class="flex items-start gap-2 text-sm text-lia-navy">
									<input type="checkbox" name="confirm" value="yes" class="mt-1 h-4 w-4" />
									Confirmo que revisei a prévia e autorizo adicionar estas linhas à planilha.
								</label>
								<button
									formaction="?/confirm"
									disabled={busy}
									class="rounded-xl bg-lia-orange px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
									>Confirmar e gravar</button
								>
							{/if}
						</div>
					{/if}
				{/if}
			</form>

			<section class="rounded-3xl border border-lia-line bg-white p-5 shadow-sm sm:p-7">
				<h2 class="text-xl font-black text-lia-navy">Histórico de operações</h2>
				{#if data.operations.length === 0}
					<p class="mt-2 text-sm text-lia-muted">Nenhuma operação registrada.</p>
				{:else}
					<ul class="mt-3 divide-y divide-lia-line text-sm">
						{#each data.operations as op (op.id)}
							<li class="py-2">
								<strong>#{op.id} · {statusLabel[op.status] ?? op.status}</strong> · {when(
									op.created_at
								)}
								· solicitadas {op.requested_rows}, gravadas {op.written_rows}
								{#if op.error_code}<span class="block text-xs text-red-800"
										>{op.error_code}: {op.error_message}</span
									>{/if}
							</li>
						{/each}
					</ul>
				{/if}
			</section>
		{/if}
	</div>
</main>
