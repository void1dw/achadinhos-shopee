<script lang="ts">
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

<svelte:head>
	<title>Entrar | Administração — Achadinhos da Lia</title>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<main class="flex min-h-screen items-center justify-center bg-lia-cream px-4 py-10">
	<section
		class="w-full max-w-md rounded-3xl border border-lia-line bg-white p-7 shadow-xl shadow-lia-navy/5 sm:p-9"
	>
		<a href="/" class="text-sm font-bold text-lia-orange hover:underline">← Voltar à loja</a>
		<div class="mt-8">
			<p class="text-xs font-extrabold tracking-[0.2em] text-lia-orange uppercase">Área restrita</p>
			<h1 class="mt-2 text-3xl font-black tracking-tight text-lia-navy">Administração</h1>
			<p class="mt-3 text-sm leading-6 text-lia-muted">
				Acesse o painel de desempenho comercial do Achadinhos da Lia.
			</p>
		</div>

		{#if !data.authConfigured}
			<div
				class="mt-7 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950"
				role="status"
			>
				A autenticação ainda não está configurada neste Worker. Defina os secrets
				<code>ADMIN_USERNAME</code>, <code>ADMIN_PASSWORD</code> e <code>ADMIN_SESSION_SECRET</code>
				conforme a documentação de ativação.
			</div>
		{:else}
			<form method="POST" class="mt-7 space-y-4">
				<label class="block">
					<span class="mb-1.5 block text-sm font-semibold text-lia-ink">Usuário</span>
					<input
						name="username"
						autocomplete="username"
						required
						class="w-full rounded-xl border border-lia-line bg-white px-4 py-3 text-sm transition outline-none focus:border-lia-orange focus:ring-2 focus:ring-lia-orange/20"
					/>
				</label>
				<label class="block">
					<span class="mb-1.5 block text-sm font-semibold text-lia-ink">Senha</span>
					<input
						name="password"
						type="password"
						autocomplete="current-password"
						required
						class="w-full rounded-xl border border-lia-line bg-white px-4 py-3 text-sm transition outline-none focus:border-lia-orange focus:ring-2 focus:ring-lia-orange/20"
					/>
				</label>
				{#if form?.message}
					<p class="rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-800" role="alert">
						{form.message}
					</p>
				{/if}
				<button
					type="submit"
					class="w-full rounded-xl bg-lia-navy px-5 py-3.5 text-sm font-bold text-white transition hover:bg-lia-orange focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lia-orange"
				>
					Entrar no painel
				</button>
			</form>
		{/if}

		<p class="mt-8 text-xs leading-5 text-lia-muted">
			Sessões administrativas expiram após 8 horas. O painel não grava senha ou tokens no
			armazenamento do navegador, e os relatórios só são carregados em uma sessão autenticada.
		</p>
	</section>
</main>
