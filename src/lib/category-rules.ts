/**
 * Classificação automática por regras de título.
 *
 * Quando a categoria da planilha não resolve (genérica como "Outros", desconhecida, pendente ou
 * ampla demais), o título do produto pode indicar a categoria — mas só com correspondência clara:
 *
 *  - Cada regra tem uma lista `match` (TODOS os padrões precisam casar), `exclude` opcional (se
 *    qualquer padrão casar, a regra não vale) e `hint` opcional (a categoria original da planilha
 *    precisa pertencer àquele departamento primário — é a "evidência" da própria planilha).
 *  - Ordem de decisão: vale a(s) regra(s) de MAIOR prioridade que casaram. Se todas apontam para a
 *    mesma categoria, classifica (cita a primeira regra listada). Se apontam para categorias
 *    diferentes, é ambíguo e o produto fica para revisão manual. Regras de prioridade menor são
 *    ignoradas quando existe uma de prioridade maior.
 *  - Sem semelhança textual aproximada: só os padrões abaixo, sobre o título sem acento e sem
 *    pontuação ("Café, chás" -> "cafe chas").
 *  - Os alvos precisam existir e estar aprovados na taxonomia (conferido nos testes).
 *
 * Para criar uma regra nova: acrescente um item em RULES com id estável, alvo existente em
 * categories.ts, prioridade e, se necessário, `exclude` para evitar falsos positivos.
 */

import { normalizeText } from './format';

export type CategoryRule = {
	/** Identificador estável exibido no relatório administrativo. */
	id: string;
	/** Id da categoria (qualquer nível) em que o produto é classificado. */
	target: string;
	/** Maior vence. 30 = frase muito específica; 20 = termo claro do produto. */
	priority: number;
	match: RegExp[];
	exclude?: RegExp[];
	/** Só vale se a categoria da planilha pertence a este departamento primário. */
	hint?: string;
	/** Também detalha produtos que a planilha já classificou em uma categoria mais ampla. */
	refines?: boolean;
};

export const COSMETIC_OR_HOME_WORDS =
	/\b(sabonete|shampoo|condicionador|hidratante|perfume|aroma\w*|vela|difusor|sabao|detergente|home spray|creme)\b/;

export const RULES: CategoryRule[] = [
	// ── Alimentos: frases específicas (não dependem da categoria da planilha) ──────────────
	{
		id: 'alimentos-pasta-de-amendoim',
		target: 'alimentos-mercearia-pastas-de-untar',
		priority: 30,
		match: [/\b(pasta|creme|manteiga) de (amendoim|avela|castanha de caju)\b/],
		exclude: [/\b(corporal|hidratante|capilar|facial|labial|esfoliante)\b/]
	},

	// ── Alimentos: termos que só valem se a planilha já apontava para Alimentos ───────────
	{
		id: 'alimentos-cafe',
		target: 'alimentos-cafe-chas',
		priority: 20,
		hint: 'alimentos',
		match: [
			/\b(cafes? (em po|torrados?|moido|moidos|em graos|soluvel|em capsulas?|especial|gourmet)|capsulas? de cafe)\b/
		],
		exclude: [/\b(cafeteira|filtro|coador|moedor|caneca|xicara|maquina)\b/]
	},
	{
		id: 'alimentos-cha',
		target: 'alimentos-cafe-chas',
		priority: 20,
		hint: 'alimentos',
		match: [
			/\bchas?\b/,
			/\b(sache|saches|infusao|camomila|cidreira|hibisco|erva mate|erva doce)\b/
		],
		exclude: [COSMETIC_OR_HOME_WORDS]
	},
	{
		id: 'alimentos-doces-snacks',
		target: 'alimentos-doces-snacks',
		priority: 20,
		hint: 'alimentos',
		match: [
			/\b(chocolates?|bombons?|biscoitos?|bolachas?|barras? de (cereal|proteina)|salgadinhos?|snacks?)\b/
		],
		exclude: [/\b(forma|formas|molde|moldes|fonte|fondue|estojo|capinha|capa|cor)\b/]
	},
	{
		id: 'alimentos-bebidas',
		target: 'alimentos-bebidas',
		priority: 20,
		hint: 'alimentos',
		match: [
			/\b(refrigerantes?|sucos? (de|integral|natural)|agua mineral|agua de coco|energeticos?|isotonicos?)\b/
		],
		exclude: [/\b(extrator|espremedor|copo|garrafa|jarra|squeeze|liquidificador|dispenser)\b/]
	},

	// ── Itens de outros departamentos com termo inequívoco no título ──────────────────────
	{
		id: 'casa-potes-hermeticos',
		target: 'casa-cozinha-potes',
		priority: 20,
		match: [/\bpotes?\b/, /\b(hermeticos?|marmitas?|mantimentos|tampa)\b/],
		exclude: [/\b(creme|hidratante|cosmetico|maquiagem|gloss|bijuteria|tinta|slime)\b/]
	},
	{
		id: 'casa-coador-de-cafe',
		target: 'casa-cozinha-acessorios',
		priority: 20,
		match: [/\b(filtro coador|coador de cafe|filtro de cafe)\b/]
	},
	{
		id: 'beleza-sabonete',
		target: 'beleza-corpo',
		priority: 20,
		match: [/\bsabonetes?\b/],
		exclude: [
			/\b(forma|formas|molde|moldes|porta|suporte|dispenser|dispensador|saboneteira)\b/,
			/\bpara (louca|roupas?|pisos?)\b/
		]
	},
	{
		id: 'papelaria-alfabetizacao',
		target: 'papelaria-escolar',
		priority: 20,
		match: [/\balfabetizacao\b/],
		exclude: [/\b(brinquedos?|jogos?|quebra cabeca|livros?)\b/]
	},
	{
		id: 'audio-fones-de-ouvido',
		target: 'eletronicos-audio-fones',
		priority: 20,
		match: [/\b(fones? de ouvido|earbuds?|earphones?|airpods?)\b/],
		exclude: [/\b(capa|capinha|case|suporte|almofada|protetor|espuma)\b/]
	},
	{
		id: 'audio-caixas-de-som',
		target: 'eletronicos-audio-caixas-de-som',
		priority: 20,
		match: [/\b(caixas? de som|soundbar)\b/],
		exclude: [/\b(carro|automotiv[oa]|suporte|capa)\b/]
	},
	{
		id: 'celular-capas',
		target: 'eletronicos-celulares-capas-e-peliculas',
		priority: 20,
		match: [
			/\b(capas?|capinhas?|cases?)\b/,
			/\b(celular|iphone|samsung|galaxy|xiaomi|motorola|redmi)\b/
		],
		exclude: [/\b(fones?|airpods?|notebook|tablet|ipad|relogio|smartwatch)\b/]
	},

	// ── Detalhamento de departamentos que a planilha classifica só no nível mais amplo ─────
	// A planilha usa um único rótulo ("Automóveis", "Animais Domésticos"); o título escolhe o grupo.
	// Sem correspondência clara (ou com grupos concorrentes), o produto fica no departamento.
	{
		id: 'auto-motos',
		target: 'automotivo-motos',
		priority: 30,
		hint: 'automotivo',
		refines: true,
		match: [/\b(motocicletas?|motoqueiros?|motociclistas?|capacetes?|para motos?|de motos?)\b/],
		exclude: [/\b(motorola|infantil|brinquedo|carrinho|carros?|automotivo|usb|cabo|lenovo)\b/]
	},
	{
		id: 'auto-iluminacao',
		target: 'automotivo-pecas-iluminacao',
		priority: 20,
		hint: 'automotivo',
		refines: true,
		match: [/\b(farol|farois|lampadas?|neblina|lanternas?|h1|h3|h4|h7|h11|9005|9006)\b/],
		exclude: [/\b(strip|fita|tira|ambiente|pedais?)\b/]
	},
	{
		id: 'auto-manutencao-diagnostico',
		target: 'automotivo-pecas',
		priority: 20,
		hint: 'automotivo',
		refines: true,
		match: [/\b(obd2?|scanner|diagnostico|testador|manometro|reboque|trava de capo|rele)\b/]
	},
	{
		id: 'auto-fluidos',
		target: 'automotivo-pecas-fluidos',
		priority: 20,
		hint: 'automotivo',
		refines: true,
		match: [/\b(oleo|aditivo|fluido|lubrificante|arrefecimento)\b/]
	},
	{
		id: 'auto-multimidia',
		target: 'automotivo-multimidia',
		priority: 20,
		hint: 'automotivo',
		refines: true,
		match: [
			/\b(carplay|android auto|transmissor fm|estereo|multimidia|dashcam|dvr|camera (veicular|de re|frontal|traseira)|som automotivo|radio)\b/
		],
		exclude: [/\b(capa|protecao)\b/]
	},
	{
		id: 'auto-suportes',
		target: 'automotivo-acessorios-organizadores',
		priority: 20,
		hint: 'automotivo',
		refines: true,
		match: [/\b(suporte|organizador|porta objetos?|porta copos?|gancho)\b/],
		exclude: [/\b(reboque)\b/]
	},
	{
		id: 'auto-limpeza',
		target: 'automotivo-limpeza',
		priority: 20,
		hint: 'automotivo',
		refines: true,
		match: [/\b(limpeza|lavagem|lavar|polidor|polimento|cera automotiva|karcher|aspirador)\b/]
	},
	{
		id: 'auto-acessorios-internos',
		target: 'automotivo-acessorios-internos',
		priority: 20,
		hint: 'automotivo',
		refines: true,
		match: [
			/\b(capa (de|para) (assento|banco|volante|pedais?|painel|direcao)|capa decorativa|volante|pedais?|tapetes?|carregador|inversor|encosto|assento|painel|cinto)\b/
		],
		exclude: [/\b(bateria)\b/]
	},
	{
		id: 'auto-acessorios-externos',
		target: 'automotivo-acessorios-externos',
		priority: 20,
		hint: 'automotivo',
		refines: true,
		match: [
			/\b(capa (da|de) (camera|chave)|chave|chaveiro|adesivos?|retrovisor|para choque|antena|spoiler)\b/
		]
	},
	{
		id: 'pet-aquarismo',
		target: 'pet-shop-aquarismo',
		priority: 20,
		hint: 'pet-shop',
		refines: true,
		match: [/\b(aquarios?|peixes?|betas?|beteiras?|bettas?)\b/]
	},
	{
		id: 'pet-caes',
		target: 'pet-shop-caes',
		priority: 20,
		hint: 'pet-shop',
		refines: true,
		match: [/\b(caes|cao|cachorros?|cadelas?|filhotes? de cao)\b/],
		exclude: [/\b(gatos?|felinos?)\b/, /\b(aquarios?|peixes?)\b/]
	},
	{
		id: 'pet-gatos',
		target: 'pet-shop-gatos',
		priority: 20,
		hint: 'pet-shop',
		refines: true,
		match: [/\b(gatos?|gatinhos?|felinos?)\b/],
		exclude: [/\b(caes|cao|cachorros?)\b/, /\b(aquarios?|peixes?)\b/]
	},
	{
		id: 'pet-higiene',
		target: 'pet-shop-higiene',
		priority: 15,
		hint: 'pet-shop',
		refines: true,
		match: [/\b(shampoo|condicionador|colonia|banho|toalhas?|escovas?|perfume|higiene|spray)\b/]
	}
];

/**
 * Categorias primárias amplas demais para confiar só na planilha: o produto precisa que uma regra
 * confirme pelo título. (Dados reais: 4 de 5 itens em "Alimentos e Bebidas" não eram alimentos.)
 */
export const TITLE_CONFIRMED_PRIMARIES: readonly string[] = ['alimentos'];

/** Categorias da planilha que não dizem nada (só rotulam o motivo no relatório). */
const GENERIC_CATEGORIES = new Set([
	'outros',
	'outras',
	'diversos',
	'geral',
	'variedades',
	'sem categoria',
	'todos',
	'misc'
]);

export function isGenericCategory(category: string): boolean {
	return GENERIC_CATEGORIES.has(normalizeTitle(category));
}

export type RuleResult =
	| { status: 'matched'; categoryId: string; ruleId: string }
	| { status: 'ambiguous'; ruleIds: string[]; categoryIds: string[] }
	| { status: 'none' };

export type RuleContext = {
	/** Id do departamento primário da categoria original da planilha, quando ela foi reconhecida. */
	categoryHint?: string;
	/** A planilha já classificou o produto: só valem as regras `refines`. */
	refine?: boolean;
};

function normalizeTitle(title: string): string {
	return normalizeText(title)
		.replace(/[^a-z0-9]+/g, ' ')
		.trim();
}

export function classifyByRules(title: string, context: RuleContext = {}): RuleResult {
	const text = normalizeTitle(title);
	if (!text) return { status: 'none' };

	const hits = RULES.filter(
		(rule) =>
			(!context.refine || rule.refines === true) &&
			(rule.hint === undefined || rule.hint === context.categoryHint) &&
			rule.match.every((pattern) => pattern.test(text)) &&
			!(rule.exclude ?? []).some((pattern) => pattern.test(text))
	);
	if (hits.length === 0) return { status: 'none' };

	const top = Math.max(...hits.map((rule) => rule.priority));
	const tier = hits.filter((rule) => rule.priority === top);
	const targets = [...new Set(tier.map((rule) => rule.target))];
	if (targets.length === 1) {
		return { status: 'matched', categoryId: targets[0], ruleId: tier[0].id };
	}
	return { status: 'ambiguous', ruleIds: tier.map((rule) => rule.id), categoryIds: targets };
}
