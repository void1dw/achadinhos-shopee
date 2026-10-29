// Permite rodar os módulos TypeScript do projeto (imports relativos sem extensão) direto no
// Node, sem instalar nenhuma ferramenta. Usado apenas pelos testes (`npm test`).
import { register } from 'node:module';

register('./ts-resolve-hook.mjs', import.meta.url);
