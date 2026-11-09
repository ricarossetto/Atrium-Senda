import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// As rotas saíram de server.mjs recebendo as dependências por parâmetro. Nome esquecido só quebra quando a
// rota é chamada, então aqui a conferência é pelo texto: todo nome de topo citado precisa chegar ao módulo.
const MODULES = ['admin', 'judicial', 'documents', 'integrations', 'state'].map(name => `lib/http/${name}-routes.mjs`);
// Palavras que também são nomes de topo em server.mjs, e aqui só aparecem em mensagens e campos.
const WORDS_IN_TEXT = new Set(['os', 'open']);

const read = file => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const server = read('server.mjs');

function declaredNames(source) {
  const names = new Set();
  for (const match of source.matchAll(/^import\s+(?:(\w+)\s*,?\s*)?(?:\{([^}]*)\})?\s*(?:\*\s+as\s+(\w+))?[^;]*from/gm)) {
    if (match[1]) names.add(match[1]);
    if (match[3]) names.add(match[3]);
    for (const part of (match[2] || '').split(',')) {
      const name = part.trim().split(/\s+as\s+/).pop();
      if (name) names.add(name);
    }
  }
  for (const match of source.matchAll(/^(?:export\s+)?(?:async\s+)?(?:function\s*\*?|const|let|var|class)\s+([A-Za-z0-9_$]+)/gm)) names.add(match[1]);
  return names;
}

const topLevel = declaredNames(server);
for (const file of MODULES) {
  const source = read(file);
  const context = source.match(/const \{\n([\s\S]*?)\n {2}\} = ctx;/);
  assert.ok(context, `${file}: dependências não encontradas`);
  const received = new Set(context[1].split(',').map(name => name.trim()).filter(Boolean));
  const available = new Set([...received, ...declaredNames(source)]);
  const body = source.slice(source.indexOf('} = ctx;'));
  const missing = [...topLevel].filter(name => {
    if (available.has(name) || WORDS_IN_TEXT.has(name)) return false;
    // Conta o uso com "..." e ignora acesso a propriedade, como objeto.nome.
    return new RegExp(`(?<![\\w$'"\`-])(?<!(?<!\\.\\.)\\.)${name.replace(/\$/g, '\\$')}(?![\\w$])`).test(body);
  });
  assert.deepEqual(missing, [], `${file}: nomes usados sem chegar ao módulo`);

  // O que o módulo pede precisa ser enviado por server.mjs.
  const handler = source.match(/export async function (handle\w+Route)\(/)[1];
  const call = server.slice(server.indexOf(`await ${handler}({`), server.indexOf('}, req, res, url)', server.indexOf(`await ${handler}({`)));
  assert.ok(call.length > 0, `${file}: chamada não encontrada em server.mjs`);
  const sent = new Set(call.slice(call.indexOf('{') + 1).split(',').map(name => name.trim()).filter(Boolean));
  assert.deepEqual([...received].filter(name => !sent.has(name)), [], `${file}: dependências não enviadas por server.mjs`);
}
console.log(`[PASS] Dependências das rotas movidas: ${MODULES.length} módulos.`);
