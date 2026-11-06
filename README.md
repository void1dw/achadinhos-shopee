# Achadinhos da Lia

Vitrine de ofertas e cupons da Shopee. Feita com SvelteKit + Tailwind. O catálogo ativo fica no D1; a planilha publicada como CSV é mantida como fonte legada somente para leitura.

## Rodando

```sh
npm install
npm run dev       # desenvolvimento
npm run build     # versão de produção
npm run check     # confere tipos e Svelte
npm run format    # arruma a formatação (Prettier)
```

As instruções de configuração local, acesso administrativo e teste da conexão Shopee estão em [docs/local-development.md](./docs/local-development.md).

## Como os produtos entram

Candidatos aprovados podem ser revalidados e adicionados diretamente ao catálogo D1 em `/admin/products/add`. A tela `/admin/products/import` mantém a importação legada: lê e valida o CSV da planilha (`src/lib/server/sheets.ts`) e, após confirmação, insere os produtos no D1. Essa integração é somente leitura e nunca publica dados de volta na planilha.
O link do CSV fica em `src/lib/config.ts`. Para ver o site com produtos de mentira, troque `SHOW_DEMO_DATA` para `true` nesse mesmo arquivo.

## Relatórios do Google Analytics 4

A configuração do GA4 e os eventos comerciais usam a propriedade `G-LE7LEHM879`. O endpoint privado de relatórios, as métricas disponíveis e a configuração necessária no Google Cloud, GA4 e Cloudflare estão descritos em [docs/ga4-reporting.md](./docs/ga4-reporting.md).

Colunas da planilha (o nome pode ter acento ou não, maiúscula ou minúscula):

| Coluna            | Obrigatória | Observação                                                                                         |
| ----------------- | ----------- | -------------------------------------------------------------------------------------------------- |
| `nome`            | sim         |                                                                                                    |
| `preco`           | sim         | aceita `89,90`, `89.90`, `R$ 1.299,90`; em intervalos como `R$ 78,90 - R$ 259,90`, calcula a média |
| `categoria`       | sim         | qualquer texto; veja "Categorias" abaixo                                                           |
| `imagem`          | sim         | link `http(s)` da foto                                                                             |
| `url` (ou `link`) | sim         | link `http(s)` do produto                                                                          |
| `preco_anterior`  | sim         | linhas sem preço anterior válido são ignoradas; intervalos também são convertidos pela média       |
| `publicado_em`    | não         | `2026-10-20`, `20/10/2026` ou `20/10/2026 14:30`                                                   |
| `id`              | não         | se faltar (ou repetir), o site cria um id único sozinho                                            |

Linhas com algo obrigatório faltando ou com link inválido são ignoradas, e o terminal do servidor avisa quantas foram.
Cupons são resgatados manualmente na [página oficial de cupons da Shopee](https://shopee.com.br/m/cupom-de-desconto). Cada produto tem um atalho para essa página e orienta a pessoa a ativar o cupom antes de finalizar a compra.

## Categorias

`src/lib/categories.ts` padroniza o que vem da planilha ("pets", "Pets", "eletronico"... viram a mesma categoria, com nome bonito e emoji). Categoria nova funciona sozinha; para escolher nome e emoji exatos, acrescente uma linha em `CATEGORY_DEFS`.

## Onde fica cada coisa

```
src/
  routes/
    +page.server.ts      carrega produtos do D1
    +page.svelte         só monta a página com os componentes
  lib/
    components/          SiteHeader, Hero (HeroFeed + LiaStage + OrbitCard),
                         FilterBar, ProductGrid, ProductCard,
                         SiteFooter, Toast
    filters.svelte.ts    estado e regras dos filtros/busca/ordenação
    spotlight.svelte.ts  animação dos destaques da hero
    products.ts          prepara os produtos para a vitrine
    categories.ts        cadastro de categorias
    format.ts            moeda, preço e texto sem acento
    server/sheets.ts     leitura e validação do CSV legado
```
