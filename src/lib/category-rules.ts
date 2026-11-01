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
	/** Só vale se a categoria da planilha for exatamente esta (ex.: "moda-masculina"). */
	within?: string;
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
	},

	// ── Moda: a planilha classifica só por público (feminina, masculina, infantil); o título escolhe
	// o tipo de peça. Títulos com peças concorrentes ficam no grupo do público.
	{
		id: 'moda-fem-vestidos',
		target: 'moda-feminina-vestidos',
		priority: 20,
		hint: 'moda',
		within: 'moda-feminina',
		refines: true,
		match: [/\bvestidos?\b/]
	},
	{
		id: 'moda-fem-saias',
		target: 'moda-feminina-saias',
		priority: 20,
		hint: 'moda',
		within: 'moda-feminina',
		refines: true,
		match: [/\bsaias?\b/]
	},
	{
		id: 'moda-fem-calcas',
		target: 'moda-feminina-calcas',
		priority: 20,
		hint: 'moda',
		within: 'moda-feminina',
		refines: true,
		match: [/\b(calcas?|leggings?|jeans|pantalona)\b/],
		exclude: [/\b(shorts?|bermudas?|conjuntos?|calcinhas?)\b/]
	},
	{
		id: 'moda-fem-blusas',
		target: 'moda-feminina-blusas',
		priority: 20,
		hint: 'moda',
		within: 'moda-feminina',
		refines: true,
		match: [/\b(blusas?|camisetas?|regatas?|cropped|camisas?)\b/],
		exclude: [/\b(masculin[oa]s?|moletom|conjuntos?|pijamas?|camisolas?)\b/]
	},
	{
		id: 'moda-fem-conjuntos',
		target: 'moda-feminina-conjuntos',
		priority: 22,
		hint: 'moda',
		within: 'moda-feminina',
		refines: true,
		match: [/\bconjuntos?\b/],
		exclude: [/\b(pijamas?|camisolas?|lingerie|baby ?do[lo]l?)\b/]
	},
	{
		id: 'moda-fem-lingerie',
		target: 'moda-feminina-lingerie',
		priority: 25,
		hint: 'moda',
		within: 'moda-feminina',
		refines: true,
		match: [/\b(calcinhas?|sutias?|lingerie|cintas?|modeladora?)\b/],
		exclude: [/\b(varal|cabide|pijamas?|camisolas?|baby ?do[lo]l?)\b/]
	},
	{
		id: 'moda-fem-pijamas',
		target: 'moda-feminina-pijamas',
		priority: 26,
		hint: 'moda',
		within: 'moda-feminina',
		refines: true,
		match: [/\b(pijamas?|camisolas?|baby ?do[lo]l?|roupao)\b/]
	},
	{
		id: 'moda-fem-casacos',
		target: 'moda-feminina-casacos',
		priority: 20,
		hint: 'moda',
		within: 'moda-feminina',
		refines: true,
		match: [/\b(jaquetas?|casacos?|cardigan|blazer|kimono|colete)\b/],
		exclude: [/\b(conjuntos?|calcas?)\b/]
	},
	{
		id: 'moda-masc-camisetas',
		target: 'moda-masculina-camisetas',
		priority: 22,
		hint: 'moda',
		within: 'moda-masculina',
		refines: true,
		match: [/\b(camisetas?|regatas?)\b/]
	},
	{
		id: 'moda-masc-camisas',
		target: 'moda-masculina-camisas',
		priority: 20,
		hint: 'moda',
		within: 'moda-masculina',
		refines: true,
		match: [/\b(camisas?|polo)\b/]
	},
	{
		id: 'moda-masc-calcas',
		target: 'moda-masculina-calcas',
		priority: 20,
		hint: 'moda',
		within: 'moda-masculina',
		refines: true,
		match: [/\b(calcas?|jeans|joggers?)\b/],
		exclude: [/\b(shorts?|bermudas?)\b/]
	},
	{
		id: 'moda-masc-bermudas',
		target: 'moda-masculina-bermudas',
		priority: 20,
		hint: 'moda',
		within: 'moda-masculina',
		refines: true,
		match: [/\b(bermudas?|shorts?)\b/]
	},
	{
		id: 'moda-masc-cuecas-meias',
		target: 'moda-masculina-cuecas',
		priority: 20,
		hint: 'moda',
		within: 'moda-masculina',
		refines: true,
		match: [/\b(cuecas?|meias?|boxer|sungas?)\b/]
	},
	{
		id: 'moda-masc-casacos',
		target: 'moda-masculina-casacos',
		priority: 20,
		hint: 'moda',
		within: 'moda-masculina',
		refines: true,
		match: [
			/\b(moletom|jaquetas?|casacos?|blusa de frio|corta vento|windbreaker|coat|jacket|canguru)\b/
		],
		exclude: [/\bcalcas?\b/]
	},
	{
		id: 'moda-inf-bebe',
		target: 'moda-infantil-bebe',
		priority: 22,
		hint: 'moda',
		within: 'moda-infantil',
		refines: true,
		match: [/\b(bebes?|recem nascidos?)\b/]
	},
	{
		id: 'moda-inf-meninas',
		target: 'moda-infantil-meninas',
		priority: 20,
		hint: 'moda',
		within: 'moda-infantil',
		refines: true,
		match: [/\b(meninas?|femininos?|femininas?)\b/]
	},
	{
		id: 'moda-inf-meninos',
		target: 'moda-infantil-meninos',
		priority: 20,
		hint: 'moda',
		within: 'moda-infantil',
		refines: true,
		match: [/\b(meninos?|masculin[oa]s?)\b/]
	},

	// ── Casa, Beleza e Saúde: a planilha traz só o departamento; o título escolhe o grupo. ─────
	{
		id: 'casa-limpeza',
		target: 'casa-limpeza',
		priority: 22,
		hint: 'casa',
		within: 'casa',
		refines: true,
		match: [
			/\b(mop|esfregao|esfregador|lavadora|vassouras?|rodos?|alvejante|detergente|limpeza)\b/
		],
		exclude: [/\borganizador\b/]
	},
	{
		id: 'casa-cama-mesa-banho',
		target: 'casa-cama-mesa-banho',
		priority: 22,
		hint: 'casa',
		within: 'casa',
		refines: true,
		match: [
			/\b(toalhas?|colchas?|lencois?|cobertores?|edredons?|fronhas?|travesseiros?|jogo americano|sousplast|pano de prato)\b/
		]
	},
	{
		id: 'casa-moveis',
		target: 'casa-moveis',
		priority: 20,
		hint: 'casa',
		within: 'casa',
		refines: true,
		match: [/\b(mesa de jantar|cadeiras?|banquetas?|puffs?|estantes?|sofas?|poltronas?)\b/],
		exclude: [/\b(maquiagem|cosmeticos|organizadora?)\b/]
	},
	{
		id: 'casa-decoracao',
		target: 'casa-decoracao',
		priority: 20,
		hint: 'casa',
		within: 'casa',
		refines: true,
		match: [
			/\b(quadros?|decorativ\w*|decoracao|espelhos?|abajur|luminarias?|natal|natalin\w*|enfeites?|vasos?)\b/
		]
	},
	{
		id: 'casa-cozinha',
		target: 'casa-cozinha',
		priority: 20,
		hint: 'casa',
		within: 'casa',
		refines: true,
		match: [
			/\b(panelas?|frigideiras?|utensilios|potes?|facas?|tabuas?|louca|xicaras?|tacas?|copos?|garrafas?|marmitas?|ralador|fatiador|cozinha)\b/
		],
		exclude: [/\b(lixeira|ferramentas?|furadeira|parafusadeira)\b/]
	},
	{
		id: 'beleza-perfumes',
		target: 'beleza-perfumes',
		priority: 22,
		hint: 'beleza',
		within: 'beleza',
		refines: true,
		match: [/\b(perfumes?|body splash|colonia|eau de parfum)\b/],
		exclude: [/\b(organizador|automotivo)\b/]
	},
	{
		id: 'beleza-cabelos',
		target: 'beleza-cabelos',
		priority: 21,
		hint: 'beleza',
		within: 'beleza',
		refines: true,
		match: [
			/\b(cabelos?|capilar|shampoo|condicionador|cond|elseve|progressivas?|chapinha|prancha|secador|secadora|leave in|frizz|alisadora)\b/
		],
		exclude: [/\b(automotivo|facial|organizador|perfumes?|body splash)\b/]
	},
	{
		id: 'beleza-maquiagem',
		target: 'beleza-maquiagem',
		priority: 20,
		hint: 'beleza',
		within: 'beleza',
		refines: true,
		match: [/\b(maquiagem|pinceis|cilios|batom|sombras?)\b/],
		exclude: [/\b(organizador)\b/]
	},
	{
		id: 'beleza-pele',
		target: 'beleza-pele',
		priority: 20,
		hint: 'beleza',
		within: 'beleza',
		refines: true,
		match: [
			/\b(facial|skincare|protetor solar|retinol|serum|anti ?(acne|manchas|idade)|estrias)\b/
		],
		exclude: [/\b(cabelos?|capilar|shampoo)\b/]
	},
	{
		id: 'saude-massagem',
		target: 'saude-massagem',
		priority: 20,
		hint: 'saude',
		within: 'saude',
		refines: true,
		match: [/\b(massageador|massagem)\b/]
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
	/** Id exato da categoria da planilha, para regras `within`. */
	categoryId?: string;
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
			(rule.within === undefined || rule.within === context.categoryId) &&
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
