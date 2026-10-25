/**
 * Cadastro único de categorias do site.
 *
 * Qualquer texto que venha da planilha ("pets", "Pets", "Eletrônicos", "eletronico",
 * "Home & Living"...) passa por `resolveCategory` e vira SEMPRE a mesma categoria:
 * uma chave estável e um nome bonito em português.
 *
 * Categoria nova que não está na lista abaixo NÃO quebra nada: ela é criada
 * automaticamente, com uma chave e um nome ajustado.
 * Para definir uma chave e um nome exatos, basta acrescentar uma linha em CATEGORY_DEFS.
 */

import { normalizeText } from './format';

export type CategoryInfo = {
	/** Chave estável, sem acento e em minúsculas. Usada no filtro e na contagem. */
	key: string;
	/** Nome exibido no site. */
	label: string;
};

type CategoryDef = CategoryInfo & {
	/** Outros jeitos de a planilha escrever a mesma categoria (pt-BR ou inglês da Shopee). */
	aliases?: string[];
};

export const CATEGORY_DEFS: CategoryDef[] = [
	{
		key: 'eletronicos',
		label: 'Eletrônicos',
		aliases: [
			'eletronico',
			'tecnologia',
			'celulares',
			'informatica',
			'mobile & gadgets',
			'mobile accessories',
			'computers & accessories',
			'audio',
			'cameras & drones',
			'wearable devices'
		]
	},
	{
		key: 'casa',
		label: 'Casa',
		aliases: ['casa e decoracao', 'decoracao', 'home', 'home & living']
	},
	{ key: 'beleza', label: 'Beleza', aliases: ['beauty', 'beleza e cuidados'] },
	{ key: 'saude', label: 'Saúde', aliases: ['health', 'bem-estar'] },
	{
		key: 'eletrodomesticos',
		label: 'Eletrodomésticos',
		aliases: ['eletrodomestico', 'home appliances']
	},
	{
		key: 'ferramentas',
		label: 'Ferramentas',
		aliases: ['tools & home improvement', 'construcao']
	},
	{ key: 'moda', label: 'Moda', aliases: ['fashion', 'roupas', 'muslim fashion'] },
	{
		key: 'moda-feminina',
		label: 'Moda feminina',
		aliases: ['women clothes', 'roupas femininas']
	},
	{
		key: 'moda-masculina',
		label: 'Moda masculina',
		aliases: ['men clothes', 'roupas masculinas']
	},
	{
		key: 'moda-infantil',
		label: 'Moda infantil',
		aliases: ['baby & kids fashion', 'roupas infantis']
	},
	{ key: 'calcados-femininos', label: 'Calçados femininos', aliases: ['women shoes'] },
	{ key: 'calcados-masculinos', label: 'Calçados masculinos', aliases: ['men shoes'] },
	{
		key: 'bolsas-femininas',
		label: 'Bolsas femininas',
		aliases: ['women bags', "women's bags"]
	},
	{ key: 'bolsas-masculinas', label: 'Bolsas masculinas', aliases: ['men bags'] },
	{
		key: 'acessorios',
		label: 'Acessórios',
		aliases: ['fashion accessories', 'joias', 'bijuterias']
	},
	{ key: 'relogios', label: 'Relógios', aliases: ['watches'] },
	{
		key: 'games',
		label: 'Games',
		aliases: ['gaming', 'jogos', 'games & consoles', 'consoles']
	},
	{
		key: 'brinquedos',
		label: 'Brinquedos',
		aliases: ['toys', 'toys, games & collectibles']
	},
	{
		key: 'colecionaveis',
		label: 'Colecionáveis',
		aliases: ['hobbies & collections', 'hobbies', 'colecoes']
	},
	{
		key: 'mae-e-bebe',
		label: 'Mãe e bebê',
		aliases: ['mom & baby', 'bebe', 'bebes', 'maternidade']
	},
	{ key: 'pets', label: 'Pets', aliases: ['pet', 'animais', 'pet shop'] },
	{
		key: 'alimentos',
		label: 'Alimentos',
		aliases: ['food & beverages', 'groceries', 'mercado', 'bebidas', 'comidas']
	},
	{
		key: 'esporte',
		label: 'Esporte',
		aliases: ['esportes', 'sports & outdoors', 'fitness']
	},
	{
		key: 'viagem',
		label: 'Viagem',
		aliases: ['travel & luggage', 'viagens', 'malas']
	},
	{
		key: 'automotivo',
		label: 'Automotivo',
		aliases: [
			'spare parts and accessories for vehicles',
			'automobiles',
			'motorcycles',
			'carros',
			'motos',
			'veiculos'
		]
	},
	{ key: 'papelaria', label: 'Papelaria', aliases: ['stationery', 'escritorio'] },
	{ key: 'livros', label: 'Livros', aliases: ['books & magazines', 'revistas'] },
	{
		key: 'servicos',
		label: 'Serviços',
		aliases: ['tickets, vouchers & services', 'ingressos', 'vouchers']
	},
	{ key: 'outros', label: 'Outros', aliases: ['others', 'diversos'] }
];

/** Minúsculas, sem acento, sem símbolos ("Home & Living" -> "home e living"). */
function normalize(value: string): string {
	return normalizeText(value)
		.replace(/&/g, ' e ')
		.replace(/[^a-z0-9]+/g, ' ')
		.trim();
}

/** Igual a normalize, mas trata plural e singular como a mesma coisa ("pets" = "pet"). */
function stem(value: string): string {
	return normalize(value)
		.split(' ')
		.map((word) => (word.length > 3 && word.endsWith('s') ? word.slice(0, -1) : word))
		.join(' ');
}

const KNOWN = new Map<string, CategoryInfo>();
for (const def of CATEGORY_DEFS) {
	const info: CategoryInfo = { key: def.key, label: def.label };
	for (const name of [def.label, def.key, ...(def.aliases ?? [])]) {
		KNOWN.set(stem(name), info);
	}
}

function slugify(value: string): string {
	return normalize(value).replace(/ /g, '-');
}

/** "moda praia" -> "Moda praia"; mantém como veio se já tiver maiúsculas misturadas. */
function prettyLabel(raw: string): string {
	const text = raw.trim().replace(/\s+/g, ' ');
	const mixed = text !== text.toLowerCase() && text !== text.toUpperCase();
	const base = mixed ? text : text.toLowerCase();
	return base.charAt(0).toLocaleUpperCase('pt-BR') + base.slice(1);
}

const cache = new Map<string, CategoryInfo>();

/** Normaliza uma categoria da planilha para sua chave e nome de exibição. */
export function resolveCategory(raw: string): CategoryInfo {
	const cached = cache.get(raw);
	if (cached) return cached;

	const known = KNOWN.get(stem(raw));
	const info: CategoryInfo = known ?? {
		key: slugify(raw) || 'outros',
		label: prettyLabel(raw) || 'Outros'
	};
	cache.set(raw, info);
	return info;
}
