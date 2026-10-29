/**
 * Taxonomia de categorias do Achadinhos da Lia — fonte central de verdade.
 *
 * Hierarquia de até três níveis, inspirada nos princípios da GS1 GPC e da Google Product
 * Taxonomy e adaptada ao comércio eletrônico brasileiro:
 *
 *   1. Primária   — grande departamento (tem página própria quando aprovada e cadastrada em
 *                   category-pages.ts, com SEO).
 *   2. Secundária — grupo de produtos dentro do departamento.
 *   3. Terciária  — classificação mais específica.
 *
 * Como cadastrar:
 *  - Secundária ou terciária: acrescente uma linha em `branch('<id do pai>', [...])`. O id final é
 *    `<id do pai>-<token>`. Nada mais precisa mudar.
 *  - Primária nova: acrescente `primary(...)` aqui (use 'pending' até ser aprovada) e, depois de
 *    aprovada, cadastre o SEO dela em category-pages.ts.
 *
 * Regras de classificação (resolveCategory):
 *  - Só reconhece nome, alias ou caminho ("Moda feminina > Calças") escritos na planilha, sem
 *    acento, caixa ou plural. Nunca adivinha por palavras parecidas e nunca cria categorias.
 *  - Nome que existe em mais de um pai ("Calças") é ambíguo sozinho; use o caminho completo.
 *  - Categoria desconhecida, ambígua ou pendente não entra na vitrine (ver sheets.ts).
 */

import { normalizeText } from './format';

export type CategoryStatus = 'approved' | 'pending';

export type CategoryNode = {
	/** Identificador estável e único. */
	id: string;
	/** Nome exibido no site. */
	name: string;
	/** Slug estável (hoje igual ao id). */
	slug: string;
	/** 1 = primária, 2 = secundária, 3 = terciária. */
	level: number;
	parentId?: string;
	/** Outros jeitos de a planilha escrever a mesma categoria (pt-BR ou inglês da Shopee). */
	aliases: string[];
	status: CategoryStatus;
};

type CategoryDef = {
	id: string;
	name: string;
	parentId?: string;
	aliases?: string[];
	status?: CategoryStatus;
};

type Entry = [token: string, name: string, aliases?: string[]];

function primary(
	id: string,
	name: string,
	aliases: string[] = [],
	status: CategoryStatus = 'approved'
): CategoryDef {
	return { id, name, aliases, status };
}

function branch(parentId: string, entries: Entry[]): CategoryDef[] {
	return entries.map(([token, name, aliases]) => ({
		id: `${parentId}-${token}`,
		name,
		parentId,
		aliases
	}));
}

const DEFINITIONS: CategoryDef[] = [
	// ── Eletrônicos ──────────────────────────────────────────────────────────────
	primary('eletronicos', 'Eletrônicos', [
		'Eletrônico',
		'Tecnologia',
		'Eletrônicos e Tecnologia',
		'Electronics'
	]),
	...branch('eletronicos', [
		[
			'celulares',
			'Celulares e acessórios',
			['Celulares', 'Celulares e Dispositivos', 'Mobile & Gadgets', 'Mobile Accessories']
		],
		[
			'informatica',
			'Informática e acessórios',
			['Informática', 'Computadores e Acessórios', 'Computadores', 'Computers & Accessories']
		],
		['audio', 'Áudio e vídeo', ['Áudio', 'Som e Imagem']],
		[
			'games',
			'Games e consoles',
			['Games', 'Jogos e Consoles', 'Gaming', 'Video Games', 'Videogames', 'Games & Consoles']
		],
		['cameras', 'Câmeras e drones', ['Câmeras', 'Cameras & Drones']],
		['wearables', 'Dispositivos vestíveis', ['Wearable Devices', 'Smartwatches', 'Smartbands']]
	]),
	...branch('eletronicos-celulares', [
		['smartphones', 'Smartphones'],
		['capas-e-peliculas', 'Capas e películas', ['Capinhas']],
		['carregadores-e-cabos', 'Carregadores e cabos'],
		['power-banks', 'Power banks e baterias externas'],
		['suportes', 'Suportes e acessórios de celular']
	]),
	...branch('eletronicos-informatica', [
		['perifericos', 'Mouses, teclados e periféricos'],
		['armazenamento', 'Armazenamento e memória'],
		['redes', 'Redes e conectividade'],
		['notebooks', 'Notebooks, tablets e acessórios'],
		['monitores', 'Monitores e telas'],
		['impressao', 'Impressão e suprimentos'],
		['cabos', 'Cabos e adaptadores']
	]),
	...branch('eletronicos-audio', [
		['fones', 'Fones de ouvido', ['Fones']],
		['caixas-de-som', 'Caixas de som'],
		['microfones', 'Microfones'],
		['tv-e-projetores', 'TVs e projetores'],
		['tv-box', 'TV box e streaming']
	]),
	...branch('eletronicos-games', [
		['consoles', 'Consoles'],
		['controles', 'Controles e acessórios para games'],
		['jogos', 'Jogos e mídias']
	]),
	...branch('eletronicos-cameras', [
		['seguranca', 'Câmeras de segurança'],
		['drones', 'Drones'],
		['acessorios-foto', 'Acessórios para foto e vídeo']
	]),

	// ── Casa ─────────────────────────────────────────────────────────────────────
	primary('casa', 'Casa', [
		'Casa e Construção',
		'Casa, Cozinha e Decoração',
		'Casa e Decoração',
		'Casa e Cozinha',
		'Home',
		'Home & Living',
		'Utilidades Domésticas'
	]),
	...branch('casa', [
		['decoracao', 'Decoração', ['Decoração da Casa', 'Decoration', 'Home Decor']],
		[
			'organizacao',
			'Organização',
			['Organização e Armazenamento', 'Armazenamento e Organização', 'Armazenamento']
		],
		['cozinha', 'Cozinha', ['Utilidades de Cozinha', 'Cozinha e Utilidades', 'Kitchen']],
		['cama-mesa-banho', 'Cama, mesa e banho'],
		['limpeza', 'Limpeza e lavanderia', ['Limpeza', 'Lavanderia']],
		['moveis', 'Móveis', ['Furniture']],
		['eletrodomesticos', 'Eletrodomésticos', ['Eletrodoméstico', 'Home Appliances']],
		['jardim', 'Jardim e áreas externas', ['Jardim', 'Jardinagem', 'Garden']]
	]),
	...branch('casa-decoracao', [
		['quadros', 'Quadros e painéis', ['Quadros']],
		['iluminacao', 'Iluminação decorativa'],
		['objetos', 'Objetos decorativos'],
		['espelhos', 'Espelhos'],
		['vasos', 'Vasos e plantas artificiais'],
		['tapetes-e-cortinas', 'Tapetes e cortinas']
	]),
	...branch('casa-organizacao', [
		['cozinha', 'Organizadores de cozinha'],
		['banheiro', 'Organizadores de banheiro'],
		['caixas', 'Caixas organizadoras'],
		['armarios', 'Organizadores de armário e closet']
	]),
	...branch('casa-cozinha', [
		['utensilios', 'Utensílios'],
		['panelas', 'Panelas e frigideiras', ['Panelas']],
		['acessorios', 'Acessórios de cozinha'],
		['louca', 'Louças, copos e talheres'],
		['potes', 'Potes e marmitas']
	]),
	...branch('casa-cama-mesa-banho', [
		['cama', 'Roupa de cama'],
		['banho', 'Toalhas e roupões'],
		['mesa', 'Mesa posta']
	]),
	...branch('casa-limpeza', [
		['utensilios', 'Utensílios de limpeza'],
		['lavanderia', 'Lavanderia e passadoria']
	]),
	...branch('casa-moveis', [
		['estantes', 'Estantes e prateleiras'],
		['mesas-e-cadeiras', 'Mesas e cadeiras'],
		['armarios', 'Armários e sapateiras']
	]),
	...branch('casa-eletrodomesticos', [
		['cozinha', 'Eletroportáteis de cozinha'],
		['climatizacao', 'Climatização e ventilação'],
		['roupas', 'Cuidado com roupas'],
		['aspiracao', 'Aspiradores e limpeza elétrica']
	]),
	...branch('casa-jardim', [
		['plantas-e-vasos', 'Plantas e vasos'],
		['ferramentas', 'Ferramentas de jardim'],
		['irrigacao', 'Irrigação'],
		['churrasco', 'Churrasco e área externa']
	]),

	// ── Moda ─────────────────────────────────────────────────────────────────────
	primary('moda', 'Moda', [
		'Fashion',
		'Roupas',
		'Muslim Fashion',
		'Moda e Acessórios',
		'Bolsas e Acessórios'
	]),
	...branch('moda', [
		[
			'feminina',
			'Moda feminina',
			['Roupas Femininas', 'Vestuário Feminino', 'Women Clothes', 'Women Clothing']
		],
		[
			'masculina',
			'Moda masculina',
			['Roupas Masculinas', 'Vestuário Masculino', 'Men Clothes', 'Men Clothing']
		],
		['infantil', 'Moda infantil', ['Baby & Kids Fashion', 'Roupas Infantis', 'Vestuário Infantil']],
		['calcados', 'Calçados', ['Sapatos', 'Shoes']],
		['bolsas', 'Bolsas e mochilas', ['Bolsas', 'Bags', 'Mochilas e Bolsas']],
		['acessorios', 'Acessórios de moda', ['Acessórios', 'Fashion Accessories']]
	]),
	...branch('moda-feminina', [
		['vestidos', 'Vestidos'],
		['blusas', 'Blusas e camisetas'],
		['calcas', 'Calças'],
		['saias', 'Saias'],
		['conjuntos', 'Conjuntos'],
		['lingerie', 'Lingerie', ['Moda Íntima Feminina']],
		['pijamas', 'Pijamas e camisolas', ['Camisolas']],
		['moda-praia', 'Moda praia', ['Biquínis e Maiôs']],
		['casacos', 'Casacos e jaquetas']
	]),
	...branch('moda-masculina', [
		['camisetas', 'Camisetas'],
		['camisas', 'Camisas'],
		['calcas', 'Calças'],
		['bermudas', 'Bermudas'],
		['cuecas', 'Cuecas e meias', ['Cuecas']],
		['casacos', 'Casacos e jaquetas']
	]),
	...branch('moda-infantil', [
		['bebe', 'Roupas de bebê'],
		['meninas', 'Roupas para meninas'],
		['meninos', 'Roupas para meninos']
	]),
	...branch('moda-calcados', [
		['femininos', 'Calçados femininos', ['Sapatos Femininos', 'Women Shoes']],
		['masculinos', 'Calçados masculinos', ['Sapatos Masculinos', 'Men Shoes']],
		['infantis', 'Calçados infantis', ['Sapatos Infantis']]
	]),
	...branch('moda-bolsas', [
		['femininas', 'Bolsas femininas', ['Women Bags', "Women's Bags"]],
		['masculinas', 'Bolsas masculinas', ['Men Bags']],
		['mochilas', 'Mochilas']
	]),
	...branch('moda-acessorios', [
		// "Relógios e Smartwatches" mistura dois grupos; fica em Relógios por decisão explícita.
		['relogios', 'Relógios', ['Watches', 'Relógios e Smartwatches']],
		['joias', 'Joias e bijuterias', ['Joias', 'Bijuterias']],
		['oculos', 'Óculos', ['Óculos de Sol']],
		['cintos', 'Cintos e carteiras'],
		['bones', 'Bonés e chapéus']
	]),

	// ── Beleza ───────────────────────────────────────────────────────────────────
	primary('beleza', 'Beleza', [
		'Beleza e Cuidados Pessoais',
		'Beleza e Cuidados',
		'Cuidados Pessoais',
		'Beauty'
	]),
	...branch('beleza', [
		['pele', 'Cuidados com a pele', ['Skincare', 'Cuidados com o Rosto']],
		['maquiagem', 'Maquiagem', ['Makeup']],
		['cabelos', 'Cabelos', ['Cuidados com os Cabelos', 'Hair Care']],
		['perfumes', 'Perfumes e fragrâncias', ['Perfumaria', 'Perfumes']],
		['corpo', 'Corpo e banho', ['Cuidados com o Corpo']],
		['unhas', 'Unhas', ['Manicure e Pedicure']],
		['masculino', 'Barba e cuidados masculinos', ['Cuidados Masculinos']]
	]),
	...branch('beleza-pele', [
		['hidratantes', 'Hidratantes e séruns'],
		['protetores', 'Protetores solares'],
		['limpeza', 'Limpeza facial']
	]),
	...branch('beleza-maquiagem', [
		['rosto', 'Maquiagem para o rosto'],
		['olhos', 'Maquiagem para os olhos'],
		['labios', 'Maquiagem para os lábios'],
		['pinceis', 'Pincéis e acessórios']
	]),
	...branch('beleza-cabelos', [
		['shampoos', 'Shampoos e condicionadores'],
		['tratamentos', 'Tratamentos capilares'],
		['aparelhos', 'Secadores e chapinhas'],
		['acessorios', 'Acessórios para cabelo']
	]),

	// ── Saúde ────────────────────────────────────────────────────────────────────
	primary('saude', 'Saúde e bem-estar', ['Saúde', 'Health', 'Bem-estar', 'Bem Estar']),
	...branch('saude', [
		['equipamentos', 'Equipamentos de saúde', ['Aparelhos de Saúde']],
		['massagem', 'Massagem e relaxamento'],
		['ortopedia', 'Ortopedia e suporte'],
		['primeiros-socorros', 'Primeiros socorros'],
		['higiene-bucal', 'Higiene bucal', ['Saúde Bucal']]
	]),

	// ── Esportes e lazer ─────────────────────────────────────────────────────────
	primary('esportes-e-lazer', 'Esportes e lazer', [
		'Esportes',
		'Esporte',
		'Fitness',
		'Sports & Outdoors',
		'Esportes e Atividades Físicas'
	]),
	...branch('esportes-e-lazer', [
		['fitness', 'Fitness e musculação'],
		['ciclismo', 'Ciclismo'],
		['camping', 'Camping e trilhas', ['Outdoor']],
		['coletivos', 'Esportes coletivos'],
		['aquaticos', 'Natação e esportes aquáticos', ['Praia e Piscina']],
		['corrida', 'Corrida e caminhada']
	]),
	...branch('esportes-e-lazer-fitness', [
		['yoga', 'Yoga e pilates'],
		['treino', 'Acessórios de treino'],
		['musculacao', 'Equipamentos de musculação']
	]),

	// ── Automotivo ───────────────────────────────────────────────────────────────
	primary('automotivo', 'Automotivo', [
		'Automotivo e Moto',
		'Automotivo e Motocicletas',
		'Automobiles',
		'Carros',
		'Veículos'
	]),
	...branch('automotivo', [
		[
			'acessorios',
			'Acessórios para veículos',
			['Acessórios Automotivos', 'Spare Parts and Accessories for Vehicles']
		],
		['pecas', 'Peças e manutenção'],
		['multimidia', 'Som e multimídia automotiva'],
		['limpeza', 'Limpeza e cuidados automotivos'],
		['motos', 'Motocicletas', ['Motos', 'Motorcycles']]
	]),
	...branch('automotivo-acessorios', [
		['internos', 'Acessórios internos'],
		['externos', 'Acessórios externos'],
		['organizadores', 'Suportes e organizadores']
	]),
	...branch('automotivo-pecas', [
		['iluminacao', 'Iluminação automotiva'],
		['fluidos', 'Óleos, aditivos e fluidos']
	]),
	...branch('automotivo-motos', [
		['capacetes', 'Capacetes e proteção'],
		['acessorios', 'Acessórios para motos'],
		['pecas', 'Peças para motos']
	]),

	// ── Ferramentas e construção ─────────────────────────────────────────────────
	primary('ferramentas', 'Ferramentas e construção', [
		'Ferramentas',
		'Construção',
		'Construção e Reforma',
		'Tools & Home Improvement'
	]),
	...branch('ferramentas', [
		['manuais', 'Ferramentas manuais'],
		['eletricas', 'Ferramentas elétricas'],
		['eletrica', 'Material elétrico'],
		['hidraulica', 'Material hidráulico'],
		['fixacao', 'Fixação e ferragens'],
		['medicao', 'Medição e nivelamento'],
		['epi', 'Segurança e EPIs']
	]),
	...branch('ferramentas-manuais', [
		['chaves-e-alicates', 'Chaves e alicates'],
		['kits', 'Jogos e kits de ferramentas']
	]),
	...branch('ferramentas-eletricas', [
		['furadeiras', 'Furadeiras e parafusadeiras'],
		['acessorios', 'Acessórios para ferramentas elétricas']
	]),
	...branch('ferramentas-eletrica', [
		['tomadas', 'Tomadas e interruptores'],
		['iluminacao', 'Lâmpadas e luminárias']
	]),

	// ── Pet shop ─────────────────────────────────────────────────────────────────
	primary('pet-shop', 'Pet shop', ['Pet', 'Pets', 'Animais Domésticos', 'Animais']),
	...branch('pet-shop', [
		['caes', 'Cães', ['Cachorros']],
		['gatos', 'Gatos'],
		['aquarismo', 'Peixes e aquários'],
		['aves', 'Aves e pequenos animais'],
		['higiene', 'Higiene e cuidados pet']
	]),
	...branch('pet-shop-caes', [
		['coleiras', 'Coleiras e guias'],
		['brinquedos', 'Brinquedos para cães'],
		['camas', 'Camas e casinhas']
	]),
	...branch('pet-shop-gatos', [
		['arranhadores', 'Arranhadores e brinquedos'],
		['areia', 'Caixas de areia e higiene']
	]),

	// ── Brinquedos ───────────────────────────────────────────────────────────────
	primary('brinquedos', 'Brinquedos', [
		'Brinquedos e Jogos',
		'Brinquedos e Hobbies',
		'Toys',
		'Toys, Games & Collectibles'
	]),
	...branch('brinquedos', [
		['educativos', 'Brinquedos educativos'],
		['bonecos', 'Bonecos e pelúcias'],
		['jogos', 'Jogos de tabuleiro e quebra-cabeças'],
		['veiculos', 'Veículos e controle remoto'],
		['colecionaveis', 'Colecionáveis', ['Hobbies & Collections', 'Hobbies', 'Coleções']],
		['ar-livre', 'Brinquedos de ar livre']
	]),
	...branch('brinquedos-bonecos', [
		['bonecas', 'Bonecas'],
		['pelucias', 'Pelúcias'],
		['acao', 'Bonecos de ação']
	]),
	...branch('brinquedos-jogos', [
		['tabuleiro', 'Jogos de tabuleiro e cartas'],
		['quebra-cabecas', 'Quebra-cabeças']
	]),
	...branch('brinquedos-veiculos', [
		['carrinhos', 'Carrinhos e pistas'],
		['controle-remoto', 'Veículos de controle remoto']
	]),

	// ── Bebês e maternidade ──────────────────────────────────────────────────────
	primary('bebes', 'Bebês e maternidade', [
		'Bebês',
		'Bebê',
		'Mãe e Bebê',
		'Mom & Baby',
		'Bebês e Crianças',
		'Maternidade'
	]),
	...branch('bebes', [
		['alimentacao', 'Alimentação do bebê'],
		['higiene', 'Higiene e banho'],
		['passeio', 'Passeio e segurança'],
		['quarto', 'Quarto do bebê'],
		['gestantes', 'Gestantes e amamentação']
	]),
	...branch('bebes-alimentacao', [
		['mamadeiras', 'Mamadeiras e bicos'],
		['utensilios', 'Pratos, copos e talheres infantis']
	]),
	...branch('bebes-higiene', [
		['banho', 'Banho do bebê'],
		['fraldas', 'Fraldas e trocadores']
	]),
	...branch('bebes-passeio', [
		['carrinhos', 'Carrinhos e bebê conforto'],
		['seguranca', 'Segurança infantil']
	]),

	// ── Papelaria e escritório ───────────────────────────────────────────────────
	primary('papelaria', 'Papelaria e escritório', [
		'Papelaria',
		'Livros e Papelaria',
		'Escritório',
		'Stationery'
	]),
	...branch('papelaria', [
		['escolar', 'Material escolar'],
		['escritorio', 'Material de escritório'],
		['artesanato', 'Artes e artesanato'],
		['livros', 'Livros e revistas', ['Livros', 'Revistas', 'Books & Magazines']]
	]),
	...branch('papelaria-escolar', [
		['cadernos', 'Cadernos e blocos'],
		['canetas', 'Canetas e lápis'],
		['estojos', 'Estojos e mochilas escolares']
	]),
	...branch('papelaria-escritorio', [
		['organizacao', 'Organização de mesa'],
		['pastas', 'Pastas e arquivos']
	]),

	// ── Viagem ───────────────────────────────────────────────────────────────────
	primary('viagem', 'Viagem', [
		'Viagens',
		'Viagem e Bagagem',
		'Viagens e Bagagens',
		'Travel & Luggage'
	]),
	...branch('viagem', [
		['malas', 'Malas e bagagens', ['Malas', 'Bagagem']],
		['acessorios', 'Acessórios de viagem']
	]),
	...branch('viagem-acessorios', [
		['necessaires', 'Necessaires e organizadores'],
		['conforto', 'Travesseiros e conforto']
	]),

	// ── Aguardando aprovação ─────────────────────────────────────────────────────
	// Alimentos e bebidas dependem de decisão sobre as políticas do catálogo. Enquanto estiver
	// 'pending', os produtos dessa categoria ficam fora da vitrine e aparecem no relatório.
	primary(
		'alimentos',
		'Alimentos e bebidas',
		['Alimentos', 'Bebidas', 'Comidas', 'Mercado', 'Groceries', 'Food & Beverages'],
		'pending'
	)
];

// ── Registro derivado ──────────────────────────────────────────────────────────

function computeLevel(def: CategoryDef, byId: Map<string, CategoryDef>): number {
	let level = 1;
	let current = def;
	// O limite protege contra ciclos; a validação reporta níveis fora de 1..3.
	while (current.parentId !== undefined && level <= 10) {
		const parent = byId.get(current.parentId);
		if (!parent) return 0;
		current = parent;
		level += 1;
	}
	return level;
}

const DEFS_BY_ID = new Map(DEFINITIONS.map((def) => [def.id, def]));

export const CATEGORIES: readonly CategoryNode[] = DEFINITIONS.map((def) => ({
	id: def.id,
	name: def.name,
	slug: def.id,
	level: computeLevel(def, DEFS_BY_ID),
	...(def.parentId !== undefined ? { parentId: def.parentId } : {}),
	aliases: def.aliases ?? [],
	status: def.status ?? 'approved'
}));

export const CATEGORY_BY_ID: ReadonlyMap<string, CategoryNode> = new Map(
	CATEGORIES.map((node) => [node.id, node])
);

/** Do departamento primário até a categoria informada. */
export function categoryChain(id: string): CategoryNode[] {
	const chain: CategoryNode[] = [];
	let current = CATEGORY_BY_ID.get(id);
	while (current && chain.length <= 3) {
		chain.unshift(current);
		current = current.parentId !== undefined ? CATEGORY_BY_ID.get(current.parentId) : undefined;
	}
	return chain;
}

export function childrenOf(id: string): CategoryNode[] {
	return CATEGORIES.filter((node) => node.parentId === id);
}

/** O produto pertence à categoria `id` diretamente ou por uma de suas descendentes. */
export function isInCategory(categoryPath: readonly string[], id: string): boolean {
	return categoryPath.includes(id);
}

// ── Resolução de nomes da planilha ─────────────────────────────────────────────

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

type KeySource = 'name' | 'alias';

/** chave normalizada -> categorias que a usam (id -> origem da chave). */
const KEY_INDEX = new Map<string, Map<string, KeySource>>();

function register(key: string, id: string, source: KeySource): void {
	if (!key) return;
	const entry = KEY_INDEX.get(key) ?? new Map<string, KeySource>();
	// Um nome vence um alias do mesmo nó; a origem só importa para detectar conflitos.
	if (entry.get(id) !== 'name') entry.set(id, source);
	KEY_INDEX.set(key, entry);
}

for (const node of CATEGORIES) {
	const names = categoryChain(node.id).map((item) => item.name);
	// Nome sozinho e caminhos parciais ("Moda feminina Calças", "Moda Moda feminina Calças").
	for (let start = 0; start < names.length; start += 1) {
		register(stem(names.slice(start).join(' ')), node.id, 'name');
	}
	for (const alias of node.aliases) register(stem(alias), node.id, 'alias');
}

export type CategoryResolution =
	| { status: 'ok'; category: CategoryNode; path: CategoryNode[] }
	| { status: 'pending'; category: CategoryNode; path: CategoryNode[] }
	| { status: 'ambiguous'; candidates: CategoryNode[] }
	| { status: 'unknown' };

const resolutionCache = new Map<string, CategoryResolution>();

/**
 * Associa o texto de categoria da planilha a um nó da taxonomia, em qualquer nível.
 * Aceita nome, alias ou caminho ("Moda feminina > Calças"). Nunca cria categoria nova.
 */
export function resolveCategory(raw: string): CategoryResolution {
	const cached = resolutionCache.get(raw);
	if (cached) return cached;

	const ids = [...(KEY_INDEX.get(stem(raw))?.keys() ?? [])];
	let result: CategoryResolution = { status: 'unknown' };
	if (ids.length > 1) {
		result = {
			status: 'ambiguous',
			candidates: ids.flatMap((id) => CATEGORY_BY_ID.get(id) ?? [])
		};
	} else if (ids.length === 1) {
		const category = CATEGORY_BY_ID.get(ids[0]);
		if (category) {
			const path = categoryChain(category.id);
			result = {
				status: path.every((node) => node.status === 'approved') ? 'ok' : 'pending',
				category,
				path
			};
		}
	}
	resolutionCache.set(raw, result);
	return result;
}

// ── Validação (usada pelos testes) ─────────────────────────────────────────────

/** Confere a integridade da taxonomia. Lista vazia = tudo certo. */
export function validateTaxonomy(): string[] {
	const errors: string[] = [];
	const ids = new Set<string>();
	const slugs = new Set<string>();

	for (const node of CATEGORIES) {
		if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(node.id)) errors.push(`Id inválido: ${node.id}`);
		if (ids.has(node.id)) errors.push(`Id duplicado: ${node.id}`);
		if (slugs.has(node.slug)) errors.push(`Slug duplicado: ${node.slug}`);
		ids.add(node.id);
		slugs.add(node.slug);
		if (!node.name.trim()) errors.push(`Nome vazio: ${node.id}`);

		if (node.parentId !== undefined && !CATEGORY_BY_ID.has(node.parentId)) {
			errors.push(`Pai inexistente (${node.parentId}) em ${node.id}`);
		} else if (node.level < 1 || node.level > 3) {
			errors.push(`Nível inválido (${node.level}: ciclo ou profundidade) em ${node.id}`);
		}
		if (node.level === 1 && node.parentId !== undefined) {
			errors.push(`Primária com pai: ${node.id}`);
		}
	}

	for (const [key, owners] of KEY_INDEX) {
		if (owners.size < 2) continue;
		const nodes = [...owners.keys()].map((id) => CATEGORY_BY_ID.get(id));
		// Terciárias de pais diferentes podem repetir o nome ("Calças"): ficam ambíguas sozinhas e
		// se resolvem pelo caminho completo. Qualquer outro conflito é erro.
		const harmless =
			[...owners.values()].every((source) => source === 'name') &&
			nodes.every((node) => node?.level === 3);
		if (!harmless) errors.push(`Nome/alias conflitante "${key}": ${[...owners.keys()].join(', ')}`);
	}

	return errors;
}
