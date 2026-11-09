import { existsSync, readFileSync } from 'node:fs';

// server.mjs mais os arquivos para onde as rotas foram movidas: para os testes que conferem o texto do código.
const FILES = ['server.mjs', 'lib/http/judicial-routes.mjs', 'lib/http/documents-routes.mjs', 'lib/http/integrations-routes.mjs', 'lib/http/state-routes.mjs'];
export const serverSourceText = FILES
  .map(file => new URL(`../${file}`, import.meta.url))
  .filter(file => existsSync(file))
  .map(file => readFileSync(file, 'utf8'))
  .join('\n');
