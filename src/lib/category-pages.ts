import { CATEGORY_BY_ID, childrenOf, isInCategory } from './categories';
import type { ShowcaseProduct } from './types';

/**
 * Páginas de categoria (SEO) — somente categorias PRIMÁRIAS e aprovadas da taxonomia
 * (categories.ts). Secundárias e terciárias ficam dentro da página da primária.
 * Nova primária: cadastre em categories.ts e depois acrescente o SEO dela em PAGE_SEO.
 */
export type CategoryPage = {
	/** Slug da URL (igual ao id da primária na taxonomia). */
	slug: string;
	label: string;
	title: string;
	description: string;
	intro: string;
	related: string[];
};

type PageSeo = Omit<CategoryPage, 'slug' | 'label'> & { categoryId: string };

export const MIN_CATEGORY_PRODUCTS = 5;

const PAGE_SEO: PageSeo[] = [
	{
		categoryId: 'eletronicos',
		title: 'Eletrônicos em oferta | Achadinhos da Lia',
		description:
			'Confira ofertas de eletrônicos, celulares, computadores e itens de áudio selecionados pela Lia.',
		intro:
			'Encontre eletrônicos selecionados pela Lia para trabalho, estudo, entretenimento e uso diário. Compare as opções disponíveis por tipo de produto e preço, conferindo sempre especificações, compatibilidade e disponibilidade na Shopee.',
		related: ['casa', 'automotivo', 'ferramentas']
	},
	{
		categoryId: 'casa',
		title: 'Achadinhos para casa | Achadinhos da Lia',
		description:
			'Veja utilidades, itens para casa, construção e eletrodomésticos disponíveis na seleção da Lia.',
		intro:
			'Explore achadinhos para cozinha, organização, limpeza, manutenção e outros ambientes da casa. A seleção reúne utilidades e eletrodomésticos variados; confira medidas, voltagem, materiais e disponibilidade na página de cada oferta.',
		related: ['eletronicos', 'beleza', 'ferramentas']
	},
	{
		categoryId: 'beleza',
		title: 'Achadinhos de beleza | Achadinhos da Lia',
		description:
			'Confira produtos de beleza e cuidados disponíveis na seleção de ofertas da Lia.',
		intro:
			'Veja produtos selecionados para cuidados pessoais, cabelo, pele e rotina de beleza. Antes de comprar, confira composição, indicação de uso, tamanho e demais informações fornecidas pelo vendedor.',
		related: ['saude', 'moda']
	},
	{
		categoryId: 'moda',
		title: 'Achadinhos de moda | Achadinhos da Lia',
		description:
			'Explore roupas, calçados, bolsas e acessórios de moda entre as ofertas selecionadas pela Lia.',
		intro:
			'Encontre roupas, calçados, bolsas e acessórios organizados em seleções de moda feminina, masculina e outras categorias. Compare estilos e preços, verificando medidas, materiais e disponibilidade antes de comprar.',
		related: ['beleza', 'esportes-e-lazer']
	},
	{
		categoryId: 'automotivo',
		title: 'Achadinhos automotivos | Achadinhos da Lia',
		description:
			'Explore acessórios para veículos e outros produtos automotivos publicados na seleção da Lia.',
		intro:
			'Encontre acessórios e produtos automotivos publicados na vitrine da Lia. Antes de comprar, confirme modelo, ano, medidas, instalação e compatibilidade com o vendedor.',
		related: ['eletronicos', 'ferramentas', 'esportes-e-lazer']
	},
	{
		categoryId: 'saude',
		title: 'Produtos de saúde e bem-estar | Achadinhos da Lia',
		description:
			'Confira produtos classificados em saúde e bem-estar na seleção atual de ofertas da Lia.',
		intro:
			'Veja produtos classificados em saúde e bem-estar na seleção atual. Use as informações apenas como referência de compra: confira composição, registro quando aplicável e instruções do fabricante.',
		related: ['beleza', 'esportes-e-lazer']
	},
	{
		categoryId: 'esportes-e-lazer',
		title: 'Achadinhos de esportes e lazer | Achadinhos da Lia',
		description:
			'Explore produtos de esportes e lazer disponíveis na seleção de ofertas da Lia.',
		intro:
			'Encontre produtos para esporte, treino e momentos de lazer na seleção da Lia. Antes de comprar, confira medidas, materiais, capacidade e indicação de uso de cada item.',
		related: ['saude', 'automotivo', 'casa']
	},
	{
		categoryId: 'ferramentas',
		title: 'Ferramentas e construção em oferta | Achadinhos da Lia',
		description:
			'Veja ferramentas, material elétrico e itens de construção disponíveis na seleção de ofertas da Lia.',
		intro:
			'Veja ferramentas e itens para obra, reparos e manutenção publicados na seleção da Lia. Confira voltagem, potência, medidas e compatibilidade de cada produto na página do vendedor antes de comprar.',
		related: ['casa', 'automotivo']
	},
	{
		categoryId: 'pet-shop',
		title: 'Achadinhos para pets | Achadinhos da Lia',
		description:
			'Explore produtos para cães, gatos e outros animais de estimação na seleção de ofertas da Lia.',
		intro:
			'Encontre produtos para o dia a dia dos pets publicados na seleção da Lia. Confira tamanho, material e indicação de uso na página do vendedor, considerando o porte e as necessidades do seu animal.',
		related: ['casa', 'brinquedos']
	},
	{
		categoryId: 'brinquedos',
		title: 'Brinquedos em oferta | Achadinhos da Lia',
		description:
			'Confira brinquedos, jogos e colecionáveis disponíveis entre as ofertas selecionadas pela Lia.',
		intro:
			'Veja brinquedos e jogos publicados na seleção da Lia. Antes de comprar, confira a faixa etária indicada, o material e as medidas informadas pelo vendedor.',
		related: ['bebes', 'pet-shop', 'papelaria']
	},
	{
		categoryId: 'bebes',
		title: 'Achadinhos para bebês e maternidade | Achadinhos da Lia',
		description:
			'Explore produtos para bebês e maternidade disponíveis na seleção de ofertas da Lia.',
		intro:
			'Encontre itens para bebês e para a rotina da maternidade publicados na seleção da Lia. Verifique materiais, faixa etária indicada e certificações informadas pelo vendedor antes de comprar.',
		related: ['brinquedos', 'moda', 'casa']
	},
	{
		categoryId: 'papelaria',
		title: 'Papelaria e escritório em oferta | Achadinhos da Lia',
		description:
			'Veja material escolar, itens de escritório e artesanato disponíveis na seleção de ofertas da Lia.',
		intro:
			'Veja material escolar, itens de escritório e artesanato publicados na seleção da Lia. Compare quantidades, tamanhos e tipos de produto na página de cada oferta antes de comprar.',
		related: ['brinquedos', 'eletronicos']
	},
	{
		categoryId: 'viagem',
		title: 'Achadinhos para viagem | Achadinhos da Lia',
		description:
			'Explore malas, bagagens e acessórios de viagem disponíveis na seleção de ofertas da Lia.',
		intro:
			'Encontre malas, bagagens e acessórios de viagem publicados na seleção da Lia. Confira dimensões, capacidade e materiais informados pelo vendedor, principalmente se for usar em voos.',
		related: ['moda', 'eletronicos']
	}
];

/** Páginas só existem para primárias aprovadas e cadastradas na taxonomia. */
export const CATEGORY_PAGES: CategoryPage[] = PAGE_SEO.flatMap(({ categoryId, ...seo }) => {
	const node = CATEGORY_BY_ID.get(categoryId);
	if (!node || node.level !== 1 || node.status !== 'approved') return [];
	return { slug: node.slug, label: node.name, ...seo };
});

/** Páginas antigas que viraram filtros de uma primária: slug antigo -> id do nó correspondente. */
export const LEGACY_CATEGORY_REDIRECTS: Record<string, string> = {
	'moda-feminina': 'moda-feminina',
	'moda-masculina': 'moda-masculina',
	acessorios: 'moda-acessorios',
	calcados: 'moda-calcados'
};

/** Destino (primária + filtro) de um slug antigo, ou undefined. */
export function legacyRedirectTarget(slug: string): { primary: string; sub: string } | undefined {
	const nodeId = LEGACY_CATEGORY_REDIRECTS[slug];
	const primary = nodeId ? CATEGORY_BY_ID.get(nodeId)?.parentId : undefined;
	return nodeId && primary ? { primary, sub: nodeId } : undefined;
}

export function findCategoryPage(slug: string): CategoryPage | undefined {
	return CATEGORY_PAGES.find((category) => category.slug === slug);
}

export function categoryProducts(
	products: ShowcaseProduct[],
	category: CategoryPage
): ShowcaseProduct[] {
	return products.filter((product) => isInCategory(product.categoryPath, category.slug));
}

/** Primárias aprovadas com página e ao menos um produto: as únicas que entram no sitemap. */
export function sitemapCategorySlugs(products: ShowcaseProduct[]): string[] {
	return CATEGORY_PAGES.filter((page) => categoryProducts(products, page).length > 0).map(
		(page) => page.slug
	);
}

export type CategoryNavNode = {
	/** Id da categoria na taxonomia (igual ao slug). */
	slug: string;
	label: string;
	count: number;
	children: CategoryNavNode[];
};

/** Filhos de `parentId` que têm ao menos um produto, com a contagem de cada ramo. */
export function categoryTree(products: ShowcaseProduct[], parentId: string): CategoryNavNode[] {
	return childrenOf(parentId).flatMap((node) => {
		const count = products.filter((product) => isInCategory(product.categoryPath, node.id)).length;
		if (count === 0) return [];
		return { slug: node.id, label: node.name, count, children: categoryTree(products, node.id) };
	});
}

/** Categorias primárias com página e produtos suficientes, com seus ramos. */
export function categoryPagesWithProducts(products: ShowcaseProduct[]): CategoryNavNode[] {
	return CATEGORY_PAGES.map((page) => ({
		slug: page.slug,
		label: page.label,
		count: categoryProducts(products, page).length,
		children: categoryTree(products, page.slug)
	})).filter((category) => category.count >= MIN_CATEGORY_PRODUCTS);
}

/** Caminho de ids de `id` até a primária, só se `id` for descendente de `primaryId`. */
export function isDescendantOf(id: string, primaryId: string): boolean {
	let current = CATEGORY_BY_ID.get(id);
	for (let depth = 0; current && depth < 4; depth += 1) {
		if (current.id === primaryId) return current.id !== id;
		current = current.parentId !== undefined ? CATEGORY_BY_ID.get(current.parentId) : undefined;
	}
	return false;
}
