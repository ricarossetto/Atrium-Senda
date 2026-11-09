import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { serverSourceText } from './server-source.mjs';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.dirname(path.dirname(__filename));

async function run() {
  console.log('=== CONTRATO: PROPAGAÇÃO DA CHAVE NO DOWNLOAD A1 (SEM PLAINTEXT) ===\n');

  const downloaderSource = await readFile(path.join(ROOT, 'lib', 'judicial', 'eproc-a1-downloader.mjs'), 'utf8');
  assert.match(downloaderSource, /hasAccessKey: Boolean\(details\.accessKey \|\| proc\?\.hasAccessKey\)/, 'Downloader deve devolver apenas o marcador hasAccessKey');
  assert.doesNotMatch(downloaderSource, /accessKey:\s*details\.accessKey \|\| proc\?\.accessKey/, 'Downloader não pode devolver a chave em texto claro');
  assert.match(downloaderSource, /delete proc\.accessKey;/, 'Estado não pode reter accessKey em texto claro');
  assert.match(downloaderSource, /delete proc\.chaveAcesso;/, 'Estado não pode reter chaveAcesso em texto claro');

  const serverSource = serverSourceText;
  const downloadStart = serverSource.indexOf("url.pathname === '/api/integrations/eproc/processes/download-autos'");
  const consultStart = serverSource.indexOf("url.pathname === '/api/tjrs/consult'");
  assert.ok(downloadStart > 0 && consultStart > downloadStart);
  const downloadBlock = serverSource.slice(downloadStart, consultStart);
  assert.match(downloadBlock, /hasAccessKey: Boolean\(downloadResult\.hasAccessKey\)/, 'Resposta do download-autos deve expor apenas o marcador');
  assert.doesNotMatch(downloadBlock, /accessKey:\s*downloadResult\.accessKey/, 'Resposta do download-autos não pode devolver a chave');
  assert.doesNotMatch(downloadBlock, /processes:\s*downloadResult\.processes/, 'Resposta não pode devolver a lista completa de processos do estado');

  const processesUi = await readFile(path.join(ROOT, 'js', 'features', 'processes.js'), 'utf8');
  assert.doesNotMatch(processesUi, /result\.accessKey/, 'Frontend não pode esperar chave em texto claro da API');

  const adapterSource = await readFile(path.join(ROOT, 'collector', 'adapters', 'eproc.mjs'), 'utf8');
  const injectedRefs = adapterSource.match(/injectedLawyerNames/g) || [];
  assert.equal(injectedRefs.length, 2, 'injectedLawyerNames só pode existir no escopo Node (declaração + argumento do evaluate)');
  assert.match(adapterSource, /page\.evaluate\(extractEprocDetailsInPage, \{\s*injectedNames: injectedLawyerNames,/, 'Nomes e expressões atravessam a fronteira em UM objeto (Playwright aceita um argumento)');
  assert.doesNotMatch(adapterSource, /page\.evaluate\(extractEprocDetailsInPage, injectedLawyerNames/, 'A forma antiga (dois argumentos) não pode voltar.');
  assert.match(adapterSource, /export function extractEprocDetailsInPage\(\{ injectedNames = \[\], secrecyPatterns = \[\] \} = \{\}\) \{/, 'Função executada no browser recebe os nomes por parâmetro (objeto único)');

  console.log('✓ Contrato de download A1 sem plaintext de chave validado (inclui fronteira browser/Node).');
  console.log('\n>>> EPROC A1 DOWNLOAD KEY PROPAGATION CONTRACT: PASS <<<\n');
}

run().catch(error => {
  console.error('Falha no contrato de propagação da chave:', error);
  process.exit(1);
});
