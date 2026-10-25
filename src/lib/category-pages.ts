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
			'Explore eletrônicos selecionados na Shopee, com opções de celulares, computadores, áudio e outros dispositivos. Confira os preços e a disponibilidade diretamente na loja antes de comprar.',
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
			'Encontre produtos para diferentes ambientes e tarefas do dia a dia, de utilidades para casa a itens de construção e eletrodomésticos. Consulte cada oferta para confirmar detalhes e disponibilidade.',
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
			'Esta seleção reúne os produtos de beleza publicados na vitrine da Lia. Veja as informações de cada item e confirme preço, composição e disponibilidade na página do vendedor.',
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
			'Explore uma seleção de roupas e complementos para diferentes estilos, incluindo calçados, bolsas e acessórios. As opções disponíveis variam conforme os produtos publicados na vitrine.',
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
			'Aqui estão as ofertas classificadas como roupas femininas na seleção atual da Lia. Confira os detalhes de tamanho, material e disponibilidade na página de cada produto.',
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
			'Esta página reúne roupas masculinas e itens de moda classificados para o público masculino na vitrine. Consulte as opções e confirme medidas e disponibilidade com o vendedor.',
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
			'Confira produtos automotivos e acessórios para veículos reunidos nesta seleção. Verifique compatibilidade, especificações e disponibilidade com o vendedor antes da compra.',
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
			'Explore acessórios de moda e relógios presentes na vitrine. Como os modelos e detalhes variam por produto, consulte as informações completas na página de cada oferta.',
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
			'Esta seleção reúne produtos publicados na categoria de saúde. Leia as informações do fabricante e do vendedor e confirme se o item atende às suas necessidades.',
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
			'Veja os produtos de esportes e lazer que fazem parte da vitrine atual. Confira descrição, medidas e disponibilidade diretamente com a loja responsável pela oferta.',
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
			'Veja os calçados publicados na seleção, com opções classificadas para diferentes públicos. Confira numeração, medidas e disponibilidade na página de cada produto.',
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
