# Desenvolvimento local

## Iniciar o projeto

```sh
npm run dev
```

O adaptador `@sveltejs/adapter-cloudflare` configura o proxy local do Wrangler no Vite. Assim, rotas que importam `env` de `cloudflare:workers` recebem as variáveis de `.dev.vars` durante o desenvolvimento. `npm run dev` continua sendo o comando padrão; `npm run preview` constrói o Worker e o executa com Wrangler para uma validação local mais próxima da publicação.

## Configurar variáveis locais

Crie `.dev.vars` na raiz do projeto, ao lado de `wrangler.jsonc`, e preencha os valores localmente. Não use prefixo `VITE_`:

```dotenv
ADMIN_USERNAME="seu-usuario"
ADMIN_PASSWORD="senha-local-com-pelo-menos-32-caracteres"
ADMIN_SESSION_SECRET="outro-segredo-aleatorio-com-pelo-menos-32-caracteres"
SHOPEE_APP_ID="seu-app-id"
SHOPEE_APP_SECRET="seu-app-secret"
```

O arquivo `.dev.vars` é ignorado pelo Git. Não o publique, não inclua os valores em relatórios ou logs e não os copie para arquivos servidos ao navegador. Não substitua valores já configurados ao editar o arquivo. Para a autenticação local, a senha e o segredo de sessão devem ter pelo menos 32 caracteres. As variáveis GA4 são opcionais para abrir o painel; sem elas, relatórios GA4 permanecem indisponíveis.

## Testar administração e Shopee

1. Inicie `npm run dev`.
2. Abra `http://localhost:5173/admin/login` e entre com `ADMIN_USERNAME` e `ADMIN_PASSWORD`.
3. Confirme que `/admin` abriu com a sessão administrativa.
4. Na mesma sessão do navegador, acesse `http://localhost:5173/admin/shopee/test`. A rota exige autenticação e faz uma consulta real à API, portanto depende de credenciais Shopee e acesso/permissões liberados.

`/admin/realtime` também exige sessão administrativa e as variáveis `GA4_PROPERTY_ID`, `GA4_SERVICE_ACCOUNT_EMAIL` e `GA4_SERVICE_ACCOUNT_PRIVATE_KEY`. Os relatórios históricos do painel também usam `GA4_DASHBOARD_TOKEN`. Sem essas variáveis, o acesso administrativo continua funcionando, mas os respectivos relatórios ficam indisponíveis.

## D1 e candidatos Shopee

O painel de candidatos usa o binding `CANDIDATES_DB` e o banco local `achadinhos-candidates`. A migration fica em `migrations/0001_candidates.sql`. Para criar/aplicar o schema somente no D1 local:

```sh
npm run db:migrate:local
```

Inicie `npm run dev` para desenvolvimento Vite, ou `npm run preview` para construir e executar o Worker com Wrangler. Os dois modos usam o D1 local; Wrangler mantém os dados locais separados de qualquer banco remoto. O comando de migration inclui `--local` explicitamente. A página `/admin/shopee/candidates` não inicia buscas ao abrir: escolha busca geral, palavra-chave ou categoria e envie o formulário. O limite do servidor é de até 3 páginas e 20 produtos por página, mesmo que o formulário seja alterado manualmente.

As decisões de aprovação/rejeição ficam apenas no D1 interno e não publicam produtos. Nenhuma credencial Shopee é armazenada no banco. Para produção, ainda será necessário criar o banco D1 remoto e inserir o UUID retornado pela Cloudflare em `wrangler.jsonc`; essa configuração intencionalmente não contém ID fictício. Só então será possível aplicar migrations remotas com autorização explícita. Não execute `wrangler d1 migrations apply` sem `--local` para este setup de desenvolvimento.

## Local e produção

O desenvolvimento Vite usa o proxy local do adaptador Cloudflare e os valores de `.dev.vars`. O preview usa o Worker gerado e Wrangler. Em produção, as credenciais devem ser configuradas como secrets no ambiente do Worker; `.dev.vars` não é enviado nem usado pelo deploy. As sessões são emitidas para o host local em HTTP sem o atributo `Secure`; em HTTPS de produção, o cookie é `Secure`.

## Rate limiting do login administrativo

POST /admin/login não possui limite de tentativas no código, de propósito: contadores em memória não funcionam entre isolates do Worker e não oferecem proteção confiável. Antes de expor a administração em produção, configure uma regra de rate limiting no Cloudflare (WAF > Rate limiting rules) para o caminho /admin/login com método POST, por exemplo limitando poucas tentativas por IP em janela de 1 a 10 minutos, com ação de bloqueio ou desafio. Considere também Cloudflare Access na rota /admin/*. Essa é uma configuração no painel da Cloudflare; não altera a autenticação existente.
