# Deploy da integração Shopee

Nada aqui é executado automaticamente. O monitor nasce **pausado** (migration 0004) e não há Cron nem `scheduled` no Worker.

## Secrets do Worker

Obrigatórios: `ADMIN_USERNAME`, `ADMIN_PASSWORD` e `ADMIN_SESSION_SECRET` (senha e segredo com 32+ caracteres), `SHOPEE_APP_ID`, `SHOPEE_APP_SECRET`.
Opcionais: `GA4_PROPERTY_ID`, `GA4_SERVICE_ACCOUNT_EMAIL`, `GA4_SERVICE_ACCOUNT_PRIVATE_KEY`, `GA4_DASHBOARD_TOKEN` (relatórios GA4) e `GOOGLE_SHEETS_*` (publicação na planilha).

Cada comando pede o valor de forma interativa, sem exibi-lo:

```sh
npx wrangler secret put ADMIN_USERNAME
npx wrangler secret put ADMIN_PASSWORD
npx wrangler secret put ADMIN_SESSION_SECRET
npx wrangler secret put SHOPEE_APP_ID
npx wrangler secret put SHOPEE_APP_SECRET
```

Conferir a presença (só nomes, nunca valores): `node scripts/check-secrets.mjs`.

## Migrations

Ordem obrigatória (o Wrangler aplica em ordem numérica e registra as já aplicadas): `0001_candidates`, `0002_candidate_observations`, `0003_products`, `0004_catalog_audit_monitoring`, `0005_shopee_api_call_control`. Todas são cobertas pelos testes em um D1 descartável.

## Checklist (nesta ordem)

1. Validar localmente: `npm test`, `npx svelte-check --tsconfig ./tsconfig.json`, `npx vite build`.
2. Ver as migrations pendentes no remoto: `npx wrangler d1 migrations list achadinhos-candidates --remote`.
3. Backup opcional: `npx wrangler d1 export achadinhos-candidates --remote --output backup.sql`.
4. Aplicar: `npx wrangler d1 migrations apply achadinhos-candidates --remote`.
5. Configurar os secrets e conferir com `node scripts/check-secrets.mjs`.
6. **Antes** de publicar, deixar a regra de rate limiting do login ativa (abaixo).
7. Publicar: `npm run deploy` (build + `wrangler deploy`).
8. Entrar em `/admin/login` e abrir `/admin/products/import`: o diagnóstico é um _dry-run_ (não grava). Conferir rejeições e contagens.
9. Confirmar a importação. A atualização de produtos existentes é opt-in (checkbox) e preserva o vínculo Shopee.
10. Conferir `/`, `/catalogo`, `/categoria/<slug>`, `/api/produtos`, `/sitemap-paginas.xml` e `/admin/products/monitor` (monitor pausado).
11. Opcional: `/admin/shopee/test` para validar as credenciais Shopee (1 chamada real).

Enquanto o D1 estiver sem produtos, o site público responde "indisponível" (sem fallback para a planilha), portanto faça os passos 8–9 logo após o deploy.

## Importação do catálogo

`/admin/products/import` lê a planilha no servidor com o mesmo parser da auditoria (validação de preço, imagem, link e categoria; linhas duplicadas e rejeitadas ficam no relatório). O ID, a categoria, os preços, a imagem e o link de afiliado são preservados como estão na planilha. Produtos rejeitados nunca são gravados. Inserções usam `INSERT` com restrições do banco; falhas de lote são reconciliadas consultando o D1.

## Rate limiting de `POST /admin/login`

Configuração no painel Cloudflare (Security → WAF → Rate limiting rules):

- Expressão: `http.request.method eq "POST" and http.request.uri.path eq "/admin/login"`
- Característica: IP · Limite: 5 requisições por 10 minutos
- Ação: Block por 10 minutos (ou Managed Challenge)

Opcional: Cloudflare Access em `/admin/*`.
