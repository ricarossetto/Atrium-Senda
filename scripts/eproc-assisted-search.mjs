#!/usr/bin/env node
/**
 * ATRIUM — Consulta pública assistida por chave (navegador real; humano conclui o CAPTCHA).
 *
 * Somente leitura. O ATRIUM nunca resolve o CAPTCHA: abre o formulário oficial, aguarda a
 * conclusão pelo humano e segue com a consulta. Imprime apenas o resultado semântico,
 * nunca a chave ou o conteúdo dos autos.
 *
 * Uso:
 *   node scripts/eproc-assisted-search.mjs --cnj=<20 dígitos> --key-file=<arquivo> [--portal=tjrs-eproc-1g]
 */
import { readFile } from 'node:fs/promises';
import { createEprocPublicSearchClient } from '../lib/judicial/eproc/public-search/index.mjs';
import { createAssistedBrowserTransport } from '../lib/judicial/eproc/public-search/assisted-browser-transport.mjs';

const args = Object.fromEntries(process.argv.slice(2).map(argument => {
  const index = argument.indexOf('=');
  if (index <= 0) return [argument.replace(/^--/, ''), true];
  return [argument.slice(0, index).replace(/^--/, ''), argument.slice(index + 1)];
}));

if (args.help || args.h || !args.cnj || !args['key-file']) {
  console.log('Uso: node scripts/eproc-assisted-search.mjs --cnj=<20 dígitos> --key-file=<arquivo> [--portal=tjrs-eproc-1g]');
  process.exit(2);
}

const accessKey = (await readFile(args['key-file'], 'utf8')).trim();
if (!accessKey) {
  console.error('Arquivo da chave está vazio.');
  process.exit(2);
}

const transport = createAssistedBrowserTransport({
  onHumanRequired: ({ captchaType }) => {
    console.log(`[assistido] Conclua o CAPTCHA${captchaType ? ` (${captchaType})` : ''} na janela do navegador. Aguardando...`);
  }
});
const client = createEprocPublicSearchClient({ transport });

try {
  const result = await client.searchByProcessKey({
    cnj: args.cnj,
    accessKey,
    portalId: args.portal || 'tjrs-eproc-1g'
  });
  if (!result.ok) {
    console.log(JSON.stringify({ ok: false, reason: result.reason, captchaType: result.captchaType || null, error: result.error }));
    process.exitCode = 1;
  } else {
    console.log(JSON.stringify({
      ok: true,
      portalId: result.portalId,
      cnj: result.cnj,
      parties: result.parties.length,
      movements: result.movements.length,
      documents: result.documents.length,
      transport: result.provenance.transport,
      assisted: result.provenance.assisted === true
    }));
  }
} finally {
  await transport.dispose();
}
