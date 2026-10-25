/**
 * Cadastro único de categorias do site.
 *
 * Qualquer texto que venha da planilha ("pets", "Pets", "Eletrônicos", "eletronico",
 * "Home & Living"...) passa por `resolveCategory` e vira SEMPRE a mesma categoria:
 * uma chave estável (usada para filtrar e contar), um nome bonito em português e um emoji.
 *
 * Categoria nova que não está na lista abaixo NÃO quebra nada: ela é criada
 * automaticamente, com o nome ajustado e um emoji escolhido pelo assunto (🏷️ se não achar).
 * Para dar um nome/emoji exato a uma categoria nova, basta acrescentar uma linha em CATEGORY_DEFS.
 */

import { normalizeText } from './format';

export type CategoryInfo = {
	/** Chave estável, sem acento e em minúsculas. Usada no filtro e na contagem. */
	key: string;
	/** Nome exibido no site. */
	label: string;
	emoji: string;
};

type CategoryDef = CategoryInfo & {
	/** Outros jeitos de a planilha escrever a mesma categoria (pt-BR ou inglês da Shopee). */
	aliases?: string[];
};

export const CATEGORY_DEFS: CategoryDef[] = [
	{
		key: 'eletronicos',
		label: 'Eletrônicos',
		emoji: '📱',
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
		emoji: '🏠',
		aliases: ['casa e decoracao', 'decoracao', 'home', 'home & living']
	},
	{ key: 'beleza', label: 'Beleza', emoji: '💄', aliases: ['beauty', 'beleza e cuidados'] },
	{ key: 'saude', label: 'Saúde', emoji: '💊', aliases: ['health', 'bem-estar'] },
	{
		key: 'eletrodomesticos',
		label: 'Eletrodomésticos',
		emoji: '🔌',
		aliases: ['eletrodomestico', 'home appliances']
	},
	{
		key: 'ferramentas',
		label: 'Ferramentas',
		emoji: '🛠️',
		aliases: ['tools & home improvement', 'construcao']
	},
	{ key: 'moda', label: 'Moda', emoji: '👕', aliases: ['fashion', 'roupas', 'muslim fashion'] },
	{
		key: 'moda-feminina',
		label: 'Moda feminina',
		emoji: '👗',
		aliases: ['women clothes', 'roupas femininas']
	},
	{
		key: 'moda-masculina',
		label: 'Moda masculina',
		emoji: '👔',
		aliases: ['men clothes', 'roupas masculinas']
	},
	{
		key: 'moda-infantil',
		label: 'Moda infantil',
		emoji: '🧒',
		aliases: ['baby & kids fashion', 'roupas infantis']
	},
	{ key: 'calcados-femininos', label: 'Calçados femininos', emoji: '👠', aliases: ['women shoes'] },
	{ key: 'calcados-masculinos', label: 'Calçados masculinos', emoji: '👞', aliases: ['men shoes'] },
	{
		key: 'bolsas-femininas',
		label: 'Bolsas femininas',
		emoji: '👜',
		aliases: ['women bags', "women's bags"]
	},
	{ key: 'bolsas-masculinas', label: 'Bolsas masculinas', emoji: '🎒', aliases: ['men bags'] },
	{
		key: 'acessorios',
		label: 'Acessórios',
		emoji: '💍',
		aliases: ['fashion accessories', 'joias', 'bijuterias']
	},
	{ key: 'relogios', label: 'Relógios', emoji: '⌚', aliases: ['watches'] },
	{
		key: 'games',
		label: 'Games',
		emoji: '🎮',
		aliases: ['gaming', 'jogos', 'games & consoles', 'consoles']
	},
	{
		key: 'brinquedos',
		label: 'Brinquedos',
		emoji: '🧸',
		aliases: ['toys', 'toys, games & collectibles']
	},
	{
		key: 'colecionaveis',
		label: 'Colecionáveis',
		emoji: '🧩',
		aliases: ['hobbies & collections', 'hobbies', 'colecoes']
	},
	{
		key: 'mae-e-bebe',
		label: 'Mãe e bebê',
		emoji: '🍼',
		aliases: ['mom & baby', 'bebe', 'bebes', 'maternidade']
	},
	{ key: 'pets', label: 'Pets', emoji: '🐾', aliases: ['pet', 'animais', 'pet shop'] },
	{
		key: 'alimentos',
		label: 'Alimentos',
		emoji: '🍽️',
		aliases: ['food & beverages', 'groceries', 'mercado', 'bebidas', 'comidas']
	},
	{
		key: 'esporte',
		label: 'Esporte',
		emoji: '⚽',
		aliases: ['esportes', 'sports & outdoors', 'fitness']
	},
	{
		key: 'viagem',
		label: 'Viagem',
		emoji: '🧳',
		aliases: ['travel & luggage', 'viagens', 'malas']
	},
	{
		key: 'automotivo',
		label: 'Automotivo',
		emoji: '🚗',
		aliases: [
			'spare parts and accessories for vehicles',
			'automobiles',
			'motorcycles',
			'carros',
			'motos',
			'veiculos'
		]
	},
	{ key: 'papelaria', label: 'Papelaria', emoji: '📎', aliases: ['stationery', 'escritorio'] },
	{ key: 'livros', label: 'Livros', emoji: '📚', aliases: ['books & magazines', 'revistas'] },
	{
		key: 'servicos',
		label: 'Serviços',
		emoji: '🎟️',
		aliases: ['tickets, vouchers & services', 'ingressos', 'vouchers']
	},
	{ key: 'outros', label: 'Outros', emoji: '📦', aliases: ['others', 'diversos'] }
];

/** Emoji para categorias novas: o primeiro assunto que combinar com o nome ganha. */
const EMOJI_RULES: Array<[RegExp, string]> = [
	[/\b(pet|cachorr|gato|animal|racao)/, '🐾'],
	[/\b(beleza|beauty|maquiag|cosmetic|perfum|cabelo|skin|pele)/, '💄'],
	[/\b(saude|health|farmac|vitamin|suplement|bem estar)/, '💊'],
	[/\b(eletrodomest|appliance)/, '🔌'],
	[/\b(ferrament|tool|construc|improvement|obra)/, '🛠️'],
	[/\b(calcad|sapato|tenis|shoe|sandalia|chinelo)/, '👟'],
	[/\b(bolsa|mochila|bag)/, '👜'],
	[/\b(relogio|watch)/, '⌚'],
	[/\b(acessori|joia|bijuter|jewel)/, '💍'],
	[/\b(moda|roupa|vestuario|cloth|fashion|camisa|vestido|lingerie)/, '👕'],
	[/\b(celular|mobile|smartphone|phone|gadget|eletron|tecnolog)/, '📱'],
	[/\b(inform|comput|notebook|laptop)/, '💻'],
	[/\b(audio|fone|headphone|speaker|caixa de som)/, '🎧'],
	[/\b(camera|foto|drone)/, '📷'],
	[/\b(game|jogo|console|gaming)/, '🎮'],
	[/\b(brinqued|toy|infantil|crianca)/, '🧸'],
	[/\b(bebe|baby|mae|mom|materni)/, '🍼'],
	[/\b(colecion|hobb|collect)/, '🧩'],
	[/\b(aliment|food|beverage|bebida|mercado|grocer|comida|doce|snack)/, '🍽️'],
	[/\b(esporte|sport|fitness|academia|outdoor|bike|ciclis|camping|pesca)/, '⚽'],
	[/\b(viagem|travel|mala|luggage|turismo)/, '🧳'],
	[/\b(auto|carro|veicul|vehicle|moto|peca|parts)/, '🚗'],
	[/\b(papelaria|stationery|escritorio|office|escolar)/, '📎'],
	[/\b(livro|book|revista|magazine)/, '📚'],
	[/\b(servic|ticket|voucher|ingresso)/, '🎟️'],
	[/\b(musica|instrument|violao|guitarra)/, '🎸'],
	[/\b(planta|jardin|garden)/, '🌱'],
	[/\b(limpeza|cleaning|lavanderia)/, '🧼'],
	[/\b(presente|gift|festa|party|natal|christmas)/, '🎁'],
	[/\b(casa|home|decor|movel|moveis|cozinha|banheiro|living|utilidade)/, '🏠'],
	[/\b(outro|other|diverso)/, '📦']
];

const DEFAULT_EMOJI = '🏷️';

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
	const info: CategoryInfo = { key: def.key, label: def.label, emoji: def.emoji };
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

function guessEmoji(raw: string): string {
	const text = normalize(raw);
	return EMOJI_RULES.find(([rule]) => rule.test(text))?.[1] ?? DEFAULT_EMOJI;
}

const cache = new Map<string, CategoryInfo>();

/** Transforma o texto da planilha na categoria oficial do site (ou cria uma nova, automaticamente). */
export function resolveCategory(raw: string): CategoryInfo {
	const cached = cache.get(raw);
	if (cached) return cached;

	const known = KNOWN.get(stem(raw));
	const info: CategoryInfo = known ?? {
		key: slugify(raw) || 'outros',
		label: prettyLabel(raw) || 'Outros',
		emoji: guessEmoji(raw)
	};
	cache.set(raw, info);
	return info;
}
