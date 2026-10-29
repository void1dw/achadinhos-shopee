import type { ShowcaseProduct } from './types';

export type CategoryPage = {
	slug: string;
	label: string;
	title: string;
	description: string;
	intro: string;
	categoryKeys: string[];
	related: string[];
};

export const MIN_CATEGORY_PRODUCTS = 5;

export const CATEGORY_PAGES: CategoryPage[] = [
	{
		slug: 'eletronicos',
		label: 'Eletrônicos',
		title: 'Eletrônicos em oferta | Achadinhos da Lia',
		description:
			'Confira ofertas de eletrônicos, celulares, computadores e itens de áudio selecionados pela Lia.',
		intro:
			'Encontre eletrônicos selecionados pela Lia para trabalho, estudo, entretenimento e uso diário. Compare as opções disponíveis por tipo de produto e preço, conferindo sempre especificações, compatibilidade e disponibilidade na Shopee.',
		categoryKeys: ['eletronicos', 'celulares-e-dispositivos', 'computadores-e-acessorios'],
		related: ['casa', 'acessorios', 'games']
	},
	{
		slug: 'casa',
		label: 'Casa',
		title: 'Achadinhos para casa | Achadinhos da Lia',
		description:
			'Veja utilidades, itens para casa, construção e eletrodomésticos disponíveis na seleção da Lia.',
		intro:
			'Explore achadinhos para cozinha, organização, limpeza, manutenção e outros ambientes da casa. A seleção reúne utilidades e eletrodomésticos variados; confira medidas, voltagem, materiais e disponibilidade na página de cada oferta.',
		categoryKeys: ['casa', 'casa-e-construcao', 'eletrodomesticos'],
		related: ['eletronicos', 'beleza', 'automotivo']
	},
	{
		slug: 'beleza',
		label: 'Beleza',
		title: 'Achadinhos de beleza | Achadinhos da Lia',
		description:
			'Confira produtos de beleza e cuidados disponíveis na seleção de ofertas da Lia.',
		intro:
			'Veja produtos selecionados para cuidados pessoais, cabelo, pele e rotina de beleza. Antes de comprar, confira composição, indicação de uso, tamanho e demais informações fornecidas pelo vendedor.',
		categoryKeys: ['beleza'],
		related: ['saude', 'acessorios', 'moda-feminina']
	},
	{
		slug: 'moda',
		label: 'Moda',
		title: 'Achadinhos de moda | Achadinhos da Lia',
		description:
			'Explore roupas, calçados, bolsas e acessórios de moda entre as ofertas selecionadas pela Lia.',
		intro:
			'Encontre roupas, calçados, bolsas e acessórios organizados em seleções de moda feminina, masculina e outras categorias. Compare estilos e preços, verificando medidas, materiais e disponibilidade antes de comprar.',
		categoryKeys: [
			'moda-feminina',
			'moda-masculina',
			'moda-infantil',
			'sapatos-masculinos',
			'calcados-masculinos',
			'sapatos-femininos',
			'calcados-femininos',
			'acessorios-de-moda',
			'acessorios',
			'bolsas-femininas',
			'bolsas-masculinas',
			'relogios'
		],
		related: ['moda-feminina', 'moda-masculina', 'calcados', 'acessorios']
	},
	{
		slug: 'moda-feminina',
		label: 'Moda feminina',
		title: 'Achadinhos de moda feminina | Achadinhos da Lia',
		description:
			'Veja roupas femininas selecionadas pela Lia e confira as ofertas disponíveis na Shopee.',
		intro:
			'Explore a seleção atual de roupas femininas da Lia, com as peças disponíveis na vitrine. Confira fotos, tabela de medidas, material e variações de cor diretamente com o vendedor antes de comprar.',
		categoryKeys: ['moda-feminina'],
		related: ['moda', 'beleza', 'acessorios']
	},
	{
		slug: 'moda-masculina',
		label: 'Moda masculina',
		title: 'Achadinhos de moda masculina | Achadinhos da Lia',
		description:
			'Confira roupas e itens de moda masculina selecionados pela Lia, com disponibilidade consultada na Shopee.',
		intro:
			'Veja roupas e acessórios masculinos publicados na seleção da Lia. Para escolher melhor, compare medidas, modelagem, tecido e cores disponíveis na página do vendedor antes de finalizar a compra.',
		categoryKeys: ['moda-masculina', 'sapatos-masculinos', 'calcados-masculinos', 'bolsas-masculinas'],
		related: ['moda', 'calcados', 'acessorios']
	},
	{
		slug: 'automotivo',
		label: 'Automotivo',
		title: 'Achadinhos automotivos | Achadinhos da Lia',
		description:
			'Explore acessórios para veículos e outros produtos automotivos publicados na seleção da Lia.',
		intro:
			'Encontre acessórios e produtos automotivos publicados na vitrine da Lia. Antes de comprar, confirme modelo, ano, medidas, instalação e compatibilidade com o vendedor.',
		categoryKeys: ['automotivo', 'acessorios-para-veiculos'],
		related: ['eletronicos', 'casa', 'esportes-e-lazer']
	},
	{
		slug: 'acessorios',
		label: 'Acessórios',
		title: 'Achadinhos de acessórios | Achadinhos da Lia',
		description:
			'Veja acessórios de moda e relógios disponíveis entre os produtos selecionados pela Lia.',
		intro:
			'Explore acessórios e relógios selecionados pela Lia para complementar diferentes estilos. Compare material, dimensões, acabamento e variações disponíveis em cada oferta antes de comprar.',
		categoryKeys: ['acessorios', 'acessorios-de-moda', 'relogios'],
		related: ['moda', 'moda-feminina', 'moda-masculina']
	},
	{
		slug: 'saude',
		label: 'Saúde e bem-estar',
		title: 'Produtos de saúde e bem-estar | Achadinhos da Lia',
		description:
			'Confira produtos classificados em saúde e bem-estar na seleção atual de ofertas da Lia.',
		intro:
			'Veja produtos classificados em saúde e bem-estar na seleção atual. Use as informações apenas como referência de compra: confira composição, registro quando aplicável e instruções do fabricante.',
		categoryKeys: ['saude'],
		related: ['beleza', 'esportes-e-lazer', 'alimentos']
	},
	{
		slug: 'esportes-e-lazer',
		label: 'Esportes e lazer',
		title: 'Achadinhos de esportes e lazer | Achadinhos da Lia',
		description:
			'Explore produtos de esportes e lazer disponíveis na seleção de ofertas da Lia.',
		intro:
			'Encontre produtos para esporte, treino e momentos de lazer na seleção da Lia. Antes de comprar, confira medidas, materiais, capacidade e indicação de uso de cada item.',
		categoryKeys: ['esportes-e-lazer', 'esporte'],
		related: ['saude', 'automotivo', 'casa']
	},
	{
		slug: 'calcados',
		label: 'Calçados',
		title: 'Achadinhos de calçados | Achadinhos da Lia',
		description:
			'Explore calçados femininos e masculinos entre as ofertas de moda selecionadas pela Lia.',
		intro:
			'Explore calçados publicados na seleção da Lia para diferentes estilos e públicos. Confira tabela de medidas, material, formato e cores disponíveis antes de escolher a numeração.',
		categoryKeys: [
			'sapatos-masculinos',
			'calcados-masculinos',
			'sapatos-femininos',
			'calcados-femininos'
		],
		related: ['moda', 'moda-feminina', 'moda-masculina']
	}
];

export function findCategoryPage(slug: string): CategoryPage | undefined {
	return CATEGORY_PAGES.find((category) => category.slug === slug);
}

export function categoryProducts(
	products: ShowcaseProduct[],
	category: CategoryPage
): ShowcaseProduct[] {
	const keys = new Set(category.categoryKeys);
	return products.filter((product) => keys.has(product.categoryKey));
}

export function categoryPagesWithProducts(products: ShowcaseProduct[]) {
	return CATEGORY_PAGES.map((category) => ({
		slug: category.slug,
		label: category.label,
		count: categoryProducts(products, category).length
	})).filter((category) => category.count >= MIN_CATEGORY_PRODUCTS);
}
