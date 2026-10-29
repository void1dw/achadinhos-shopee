import type { ParseOutcome, ProductIssue } from './sheets';

const MAX_TEXT = 80;

const ORIGIN_LABEL = {
	generic: 'genérica',
	unknown: 'não reconhecida',
	pending: 'aguardando aprovação',
	confirmation: 'ampla, confirmada pelo título'
} as const;

function clean(value: string, max = MAX_TEXT): string {
	const text = value.replace(/\s+/g, ' ').trim();
	return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

type Block = { id: string; rows: number[]; name: string; reject: boolean; lines: string[] };

/**
 * Relatório de texto simples, um bloco por ID (sem IDs repetidos), para buscar com Ctrl+F na
 * planilha. Rejeições tiram o produto da vitrine; avisos não.
 */
export function formatProductReport(
	outcome: ParseOutcome,
	options: { details?: boolean } = {}
): string {
	const { counts } = outcome;
	const blocks = new Map<string, Block>();
	const sorted = [...outcome.issues].sort((a, b) => a.row - b.row);

	for (const issue of sorted) {
		if (issue.id === '(PLANILHA)') continue;
		let block = blocks.get(issue.id);
		if (!block) {
			block = { id: issue.id, rows: [], name: clean(issue.name), reject: false, lines: [] };
			blocks.set(issue.id, block);
		}
		if (!block.rows.includes(issue.row)) block.rows.push(issue.row);
		if (!block.name) block.name = clean(issue.name);
		if (issue.kind === 'reject' && !issue.hasValidTwin) block.reject = true;
		block.lines.push(describe(issue));
	}

	const render = (list: Block[]) =>
		list.map((block) => [
			`ID: ${clean(block.id, 120)}`,
			`LINHA: ${block.rows.join(', ')}`,
			`NOME: ${block.name || '(SEM NOME)'}`,
			...block.lines,
			''
		]);

	const all = [...blocks.values()];
	const rejected = all.filter((block) => block.reject);
	const warned = all.filter((block) => !block.reject);

	const out: string[] = [
		'RELATÓRIO DE PRODUTOS — ACHADINHOS DA LIA',
		`Gerado em: ${new Date().toISOString()}`,
		'',
		'RESUMO',
		`Linhas lidas: ${counts.rows}`,
		`Produtos válidos na vitrine: ${counts.valid}`,
		`Produtos rejeitados (fora da vitrine): ${counts.rejected}`,
		`Classificados pela categoria da planilha: ${counts.viaSheet}`,
		`Classificados automaticamente por regra: ${counts.autoClassified}`,
		`Linhas duplicadas ignoradas: ${counts.duplicateRows}`,
		`Avisos (não bloqueiam): ${counts.warnings}`,
		`Produtos sem preço original (sem desconto, aceitos): ${counts.emptyPreviousPrice}`,
		''
	];

	for (const issue of outcome.issues.filter((item) => item.id === '(PLANILHA)')) {
		out.push(`ATENÇÃO: ${issue.message}`, '');
	}

	out.push('='.repeat(60), 'PRODUTOS REJEITADOS (NÃO APARECEM NO SITE)', '='.repeat(60), '');
	out.push(...(rejected.length ? render(rejected).flat() : ['Nenhum.', '']));

	if (outcome.unclassified.size > 0) {
		out.push('='.repeat(60), 'CATEGORIAS NÃO CLASSIFICADAS', '='.repeat(60), '');
		for (const [name, count] of [...outcome.unclassified].sort((a, b) => b[1] - a[1])) {
			out.push(`${clean(name)}: ${count} linha(s)`);
		}
		out.push('');
	}

	out.push(
		'='.repeat(60),
		'CLASSIFICADOS AUTOMATICAMENTE POR REGRA (CONFIRA SE ESTÃO CORRETOS)',
		'='.repeat(60),
		''
	);
	if (outcome.autoClassified.length === 0) out.push('Nenhum.', '');
	for (const item of outcome.autoClassified) {
		out.push(
			`ID: ${clean(item.id, 120)}`,
			`LINHA: ${item.row}`,
			`NOME: ${clean(item.name) || '(SEM NOME)'}`,
			`CATEGORIA ORIGINAL: "${clean(item.category)}" (${ORIGIN_LABEL[item.origin]})`,
			`CLASSIFICADO EM: ${item.pathNames.join(' > ')}`,
			`REGRA: ${item.rule}`,
			''
		);
	}

	if (options.details || warned.length <= 200) {
		out.push('='.repeat(60), 'AVISOS (PRODUTOS ACEITOS COM RESSALVA)', '='.repeat(60), '');
		out.push(...(warned.length ? render(warned).flat() : ['Nenhum.', '']));
	} else {
		out.push(
			`Avisos: ${warned.length} produtos (acrescente ?detalhes=1 à URL para listá-los).`,
			''
		);
	}

	return out.join('\n');
}

function describe(issue: ProductIssue): string {
	const kind = issue.kind === 'reject' ? 'PROBLEMA' : 'AVISO';
	return `${kind}: ${issue.message}\nCAMPO: ${issue.field} (coluna ${issue.column})`;
}
