# Achadinhos da Lia

Vitrine de ofertas e cupons da Shopee. Feita com SvelteKit + Tailwind. Os produtos vêm de uma planilha do Google Sheets publicada como CSV.

## Rodando

```sh
npm install
npm run dev       # desenvolvimento
npm run build     # versão de produção
npm run check     # confere tipos e Svelte
npm run format    # arruma a formatação (Prettier)
```

## Como os produtos entram

A planilha é lida no servidor (`src/lib/server/sheets.ts`), com cache de 5 minutos. Se a planilha falhar depois de uma carga válida, o site mantém a última versão em cache e avisa que preços e disponibilidade podem ter mudado. Linhas com dados obrigatórios inválidos ou URLs que não sejam HTTP(S) são ignoradas; IDs repetidos são ajustados para permanecer únicos.
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
    +page.server.ts      carrega os produtos da planilha
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
    server/sheets.ts     leitura e validação da planilha
```
