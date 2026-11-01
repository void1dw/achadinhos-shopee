<script lang="ts">
	import {
		Baby,
		Car,
		Dumbbell,
		HeartPulse,
		House,
		Layers,
		PawPrint,
		PencilRuler,
		Plane,
		Puzzle,
		Shirt,
		Smartphone,
		Sparkles,
		Tag,
		Utensils,
		Wrench
	} from '@lucide/svelte';
	import type { Component } from 'svelte';

	type Category = {
		slug: string;
		label: string;
		count: number;
		children?: Category[];
		alsoListed?: boolean;
	};

	type Props = {
		categories: Category[];
		/** Id da categoria ativa em qualquer nível ('' = nenhuma). */
		selected: string;
		onselect: (slug: string) => void;
		label?: string;
		allLabel?: string;
		/** 'departments' = cards dos departamentos (vitrine); 'chips' = subcategorias de um departamento. */
		variant?: 'departments' | 'chips';
		/** No modo 'chips', id do departamento que define o tom de cor. */
		department?: string;
	};
	let {
		categories,
		selected,
		onselect,
		label = 'Filtrar por categoria',
		allLabel = 'Todas',
		variant = 'departments',
		department = ''
	}: Props = $props();

	// Ícone e tom por departamento (só apresentação); departamentos novos usam um ícone neutro.
	type Tone = 'navy' | 'orange' | 'purple' | 'yellow';
	const DEPARTMENTS: Record<string, { icon: Component; tone: Tone }> = {
		eletronicos: { icon: Smartphone, tone: 'navy' },
		casa: { icon: House, tone: 'orange' },
		moda: { icon: Shirt, tone: 'purple' },
		beleza: { icon: Sparkles, tone: 'purple' },
		saude: { icon: HeartPulse, tone: 'orange' },
		'esportes-e-lazer': { icon: Dumbbell, tone: 'navy' },
		automotivo: { icon: Car, tone: 'navy' },
		ferramentas: { icon: Wrench, tone: 'yellow' },
		'pet-shop': { icon: PawPrint, tone: 'orange' },
		brinquedos: { icon: Puzzle, tone: 'yellow' },
		bebes: { icon: Baby, tone: 'purple' },
		papelaria: { icon: PencilRuler, tone: 'yellow' },
		viagem: { icon: Plane, tone: 'navy' },
		alimentos: { icon: Utensils, tone: 'orange' }
	};
	const FALLBACK = { icon: Tag, tone: 'navy' } as const;
	const departmentOf = (slug: string) => DEPARTMENTS[slug] ?? FALLBACK;

	// Um grupo listado em dois ramos (ex.: "Calçados femininos") tem mais de um caminho até ele.
	// Mantém o ramo em que o visitante já estava; sem contexto, usa o ramo de origem do grupo.
	function pathsTo(nodes: Category[], id: string): Category[][] {
		return nodes.flatMap((node) => {
			if (node.slug === id) return [[node]];
			return pathsTo(node.children ?? [], id).map((below) => [node, ...below]);
		});
	}

	let previousPath: Category[] = [];
	function resolvePath(id: string): Category[] {
		const candidates = pathsTo(categories, id);
		const shared = (candidate: Category[]) => {
			let length = 0;
			while (
				length < candidate.length - 1 &&
				candidate[length]?.slug === previousPath[length]?.slug
			) {
				length += 1;
			}
			return length;
		};
		const ownBranch = candidates.find((candidate) => !candidate.some((node) => node.alsoListed));
		const best = candidates.reduce<Category[] | undefined>(
			(winner, candidate) =>
				winner === undefined || shared(candidate) > shared(winner) ? candidate : winner,
			ownBranch
		);
		return best ?? [];
	}

	const path = $derived.by(() => {
		const next = selected ? resolvePath(selected) : [];
		previousPath = next;
		return next;
	});
	// Linha 1: filhos da raiz ativa; linha 2: filhos do segundo nível ativo.
	const rows = $derived(
		[0, 1].flatMap((depth) => {
			const parent = path[depth];
			return parent && (parent.children?.length ?? 0) > 0 ? [parent] : [];
		})
	);
	const activeTone = $derived(
		variant === 'chips'
			? departmentOf(department).tone
			: path[0]
				? departmentOf(path[0].slug).tone
				: 'navy'
	);
</script>

{#snippet chip(category: Category, active: boolean, text: string)}
	<button
		type="button"
		class={['chip', active && 'on', 'focus-ring']}
		aria-pressed={active}
		onclick={() => onselect(category.slug)}
	>
		{text}
		<span class="count">{category.count}</span>
	</button>
{/snippet}

{#snippet card(slug: string, text: string, count: number | undefined, icon: Component, tone: Tone)}
	{@const Icon = icon}
	<button
		type="button"
		class={[
			'dept',
			`tone-${tone}`,
			(slug === '' ? selected === '' : path[0]?.slug === slug) && 'on',
			'focus-ring'
		]}
		aria-pressed={slug === '' ? selected === '' : path[0]?.slug === slug}
		onclick={() => onselect(slug)}
	>
		<span class="tile"><Icon size={20} strokeWidth={2} aria-hidden="true" /></span>
		<span class="dept-text">
			<span class="dept-name">{text}</span>
			{#if count !== undefined}<span class="dept-count">{count} ofertas</span>{/if}
		</span>
	</button>
{/snippet}

{#if categories.length > 0}
	<div class="mx-auto max-w-7xl px-4 pt-5 sm:px-6">
		<div class="category-panel">
			<div class="category-heading">
				<span class="category-kicker">Explore a vitrine</span>
				<p id="category-chips-label">{label}</p>
			</div>
			{#if variant === 'chips'}
				<div
					class={['chips', 'main', `tone-${activeTone}`]}
					role="group"
					aria-labelledby="category-chips-label"
				>
					<button
						type="button"
						class={['chip', selected === '' && 'on', 'focus-ring']}
						aria-pressed={selected === ''}
						onclick={() => onselect('')}
					>
						{allLabel}
					</button>
					{#each categories as category (category.slug)}
						{@render chip(category, path[0]?.slug === category.slug, category.label)}
					{/each}
				</div>
			{:else}
				<div class="depts" role="group" aria-labelledby="category-chips-label">
					{@render card('', allLabel, undefined, Layers, 'navy')}
					{#each categories as category (category.slug)}
						{@const department = departmentOf(category.slug)}
						{@render card(
							category.slug,
							category.label,
							category.count,
							department.icon,
							department.tone
						)}
					{/each}
				</div>
			{/if}
			{#each rows as parent, depth (parent.slug)}
				<div
					class={['chips', 'sub', `tone-${activeTone}`]}
					role="group"
					aria-label={`Subcategorias de ${parent.label}`}
				>
					{@render chip(parent, selected === parent.slug, `Tudo em ${parent.label}`)}
					{#each parent.children ?? [] as child (child.slug)}
						{@render chip(child, path[depth + 1]?.slug === child.slug, child.label)}
					{/each}
				</div>
			{/each}
		</div>
	</div>
{/if}

<style>
	/* Tons de apoio por departamento: tone = cor viva, soft = fundo suave, ink = texto legível. */
	.tone-navy {
		--tone: #0d286b;
		--soft: #e4eaf8;
		--ink: #0d286b;
	}
	.tone-orange {
		--tone: #f46310;
		--soft: #fde8da;
		--ink: #a8420a;
	}
	.tone-purple {
		--tone: #b347bb;
		--soft: #f5e3f6;
		--ink: #86308d;
	}
	.tone-yellow {
		--tone: #fbc619;
		--soft: #fdf0bf;
		--ink: #6f5300;
	}

	.category-panel {
		position: relative;
		overflow: hidden;
		padding: 1.1rem 1.1rem 1.2rem;
		border: 1px solid rgb(13 40 107 / 9%);
		border-radius: 1.4rem;
		background:
			radial-gradient(ellipse at 100% 0%, rgb(179 71 187 / 9%), transparent 38%),
			radial-gradient(ellipse at 0% 100%, rgb(251 198 25 / 14%), transparent 40%), #f2eee2;
		box-shadow: 0 10px 28px rgb(13 40 107 / 7%);
	}
	.category-heading {
		display: flex;
		align-items: baseline;
		gap: 0.6rem;
		margin-bottom: 0.85rem;
	}
	.category-kicker {
		padding: 0.18rem 0.55rem;
		border-radius: 999px;
		background: var(--lia-navy);
		color: var(--lia-yellow);
		font-size: 0.62rem;
		font-weight: 800;
		letter-spacing: 0.12em;
		text-transform: uppercase;
	}
	.category-heading p {
		color: var(--lia-navy);
		font-size: 0.95rem;
		font-weight: 850;
		letter-spacing: -0.02em;
	}

	.depts {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(10.5rem, 1fr));
		gap: 0.6rem;
	}
	.dept {
		position: relative;
		display: flex;
		min-height: 3.6rem;
		align-items: center;
		gap: 0.65rem;
		padding: 0.5rem 0.75rem 0.5rem 0.55rem;
		border: 1px solid rgb(13 40 107 / 8%);
		border-radius: 1rem;
		background: #fffdf8;
		color: var(--lia-navy);
		text-align: left;
		box-shadow: 0 1px 2px rgb(13 40 107 / 5%);
		transition:
			transform 180ms cubic-bezier(0.2, 0.8, 0.2, 1),
			background 180ms,
			border-color 180ms,
			box-shadow 180ms,
			color 180ms;
	}
	.dept:hover {
		transform: translateY(-2px);
		border-color: var(--tone);
		background: var(--soft);
		box-shadow: 0 8px 18px rgb(13 40 107 / 11%);
	}
	.dept:active {
		transform: translateY(0) scale(0.98);
	}
	.tile {
		display: grid;
		flex: none;
		width: 2.4rem;
		height: 2.4rem;
		place-items: center;
		border-radius: 0.8rem;
		background: var(--soft);
		color: var(--ink);
		transition:
			transform 220ms cubic-bezier(0.2, 0.8, 0.2, 1),
			background 180ms,
			color 180ms;
	}
	.dept:hover .tile {
		transform: scale(1.08) rotate(-4deg);
		background: #fff;
	}
	.dept-text {
		display: flex;
		min-width: 0;
		flex-direction: column;
		line-height: 1.2;
	}
	.dept-name {
		font-size: 0.84rem;
		font-weight: 750;
		letter-spacing: -0.01em;
	}
	.dept-count {
		margin-top: 0.1rem;
		color: var(--lia-muted);
		font-size: 0.7rem;
		font-weight: 500;
	}
	.dept.on {
		border-color: var(--lia-navy);
		background: var(--lia-navy);
		color: #fff;
		box-shadow:
			0 10px 22px rgb(13 40 107 / 26%),
			inset 0 -3px 0 var(--lia-orange);
		animation: pop 260ms cubic-bezier(0.2, 0.9, 0.3, 1.3);
	}
	.dept.on .tile {
		background: var(--lia-yellow);
		color: var(--lia-navy);
	}
	.dept.on .dept-count {
		color: rgb(255 255 255 / 72%);
	}

	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 0.45rem;
		overflow-x: auto;
		scrollbar-width: none;
	}
	.chips::-webkit-scrollbar {
		display: none;
	}
	.chips.main {
		padding-bottom: 0.1rem;
	}
	.chips.sub {
		margin-top: 0.8rem;
		padding: 0.7rem 0.75rem;
		border: 1px solid rgb(13 40 107 / 7%);
		border-left: 4px solid var(--tone);
		border-radius: 0.9rem;
		background: var(--soft);
		animation: reveal 240ms ease-out;
	}
	.chip {
		display: inline-flex;
		flex: none;
		min-height: 2.75rem;
		align-items: center;
		gap: 0.45rem;
		padding: 0 0.9rem;
		border: 1px solid rgb(13 40 107 / 10%);
		border-radius: 999px;
		background: #fffdf8;
		color: #34425b;
		font-size: 0.8125rem;
		font-weight: 600;
		white-space: nowrap;
		transition:
			background 160ms,
			border-color 160ms,
			color 160ms,
			transform 160ms,
			box-shadow 160ms;
	}
	.chip:hover {
		transform: translateY(-1px);
		border-color: var(--tone);
		color: var(--ink);
		box-shadow: 0 3px 9px rgb(13 40 107 / 9%);
	}
	.chip:active {
		transform: scale(0.97);
	}
	.chip.on {
		border-color: var(--lia-navy);
		background: var(--lia-navy);
		color: #fff;
		box-shadow: 0 4px 10px rgb(13 40 107 / 20%);
		animation: pop 220ms cubic-bezier(0.2, 0.9, 0.3, 1.3);
	}
	.count {
		display: inline-grid;
		min-width: 1.25rem;
		height: 1.25rem;
		place-items: center;
		padding: 0 0.3rem;
		border-radius: 999px;
		background: rgb(13 40 107 / 7%);
		font-size: 0.72rem;
		font-weight: 600;
		line-height: 1;
	}
	.chip.on .count {
		background: var(--lia-yellow);
		color: var(--lia-navy);
	}

	@keyframes pop {
		from {
			transform: scale(0.95);
		}
		to {
			transform: scale(1);
		}
	}
	@keyframes reveal {
		from {
			opacity: 0;
			transform: translateY(-4px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	@media (min-width: 640px) {
		.chips {
			overflow: visible;
		}
	}
	@media (max-width: 639px) {
		.category-panel {
			padding: 0.9rem 0.8rem 1rem;
			border-radius: 1.15rem;
		}
		/* Uma faixa rolável de cards compactos: ocupa pouco espaço vertical no celular. */
		.depts {
			display: flex;
			gap: 0.5rem;
			margin: 0 -0.8rem;
			padding: 0.2rem 0.8rem 0.5rem;
			overflow-x: auto;
			scroll-snap-type: x proximity;
			scrollbar-width: none;
		}
		.depts::-webkit-scrollbar {
			display: none;
		}
		.dept {
			flex: none;
			min-width: 9.2rem;
			scroll-snap-align: start;
		}
		.chips {
			flex-wrap: nowrap;
			padding: 0.1rem 0.05rem 0.35rem;
			scroll-snap-type: x proximity;
		}
		.chips.sub {
			padding: 0.6rem 0.6rem 0.7rem;
		}
		.chip {
			scroll-snap-align: start;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.dept,
		.tile,
		.chip {
			transition: none;
			animation: none;
		}
		.dept:hover,
		.chip:hover,
		.dept:hover .tile {
			transform: none;
		}
		.dept.on,
		.chip.on,
		.chips.sub {
			animation: none;
		}
	}
</style>
