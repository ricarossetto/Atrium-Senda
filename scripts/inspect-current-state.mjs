import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { SecurityManager } from '../lib/security.mjs';

async function loadEnv() {
  if (!existsSync('.env')) return;
  const envContent = await readFile('.env', 'utf8');
  for (const line of envContent.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const idx = t.indexOf('=');
    if (idx > 0) {
      const k = t.slice(0, idx).trim();
      let v = t.slice(idx + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      process.env[k] = v;
    }
  }
}

await loadEnv();

const sec = new SecurityManager({
  dataDirectory: './data',
  sessionSecret: process.env.AUTH_SESSION_SECRET,
  encryptionKey: process.env.AUTH_ENCRYPTION_KEY
});
await sec.init();
const raw = JSON.parse(await readFile('./data/app-state.json', 'utf8'));
const state = JSON.parse(sec.decrypt(raw.encrypted));

console.log('=== PROCESSOS NA BASE ===');
console.log('Total processos:', state.processes.length);
const cereale = state.processes.find(p => p.number?.includes('5036499'));
console.log('Cereale encontrado:', cereale ? {
  id: cereale.id,
  number: cereale.number,
  client: cereale.client,
  court: cereale.court,
  actionClass: cereale.actionClass,
  documentsCount: cereale.documents?.length,
  movementsCount: cereale.movements?.length || cereale.movementsCount
} : 'Não');

console.log('=== DOCUMENTOS NA BASE ===');
console.log('Total documentos:', state.documents.length);
const cerealeDocs = state.documents.filter(d => d.ownerId === cereale?.id || d.ownerId?.includes('5036499'));
console.log('Documentos vinculados ao 5036499:', cerealeDocs.length);
if (cerealeDocs.length > 0) {
  console.log('Exemplos de documentos:', cerealeDocs.slice(0, 5).map(d => ({
    id: d.id,
    name: d.name,
    size: d.size,
    previewAvailable: !!d.previewAvailable,
    previewKind: d.previewKind
  })));
}

console.log('=== PAINEL (PRAZOS / INTIMAÇÕES / TAREFAS) ===');
console.log('Tasks:', state.tasks?.length || 0);
console.log('Events:', state.events?.length || 0);
console.log('Intimations:', state.intimations?.length || 0);
console.log('Alerts:', state.alerts?.length || 0);

if (state.intimations?.length) {
  const sources = {};
  state.intimations.forEach(i => {
    const src = i.source || i.portal || (i.metadata && i.metadata.source) || (i.origin) || 'desconhecido';
    sources[src] = (sources[src] || 0) + 1;
  });
  console.log('Origens das intimações:', sources);
  console.log('Amostra intimação:', {
    id: state.intimations[0]?.id,
    processNumber: state.intimations[0]?.processNumber,
    date: state.intimations[0]?.date || state.intimations[0]?.disponibilizacao,
    contentPreview: (state.intimations[0]?.content || state.intimations[0]?.texto || '').slice(0, 100)
  });
}

console.log('=== FONTES DE INTEGRAÇÃO (SOURCES) ===');
console.log('Sources:', state.sources?.length || 0);
if (state.sources?.length) {
  console.log(state.sources);
}

if (existsSync('./data/runtime.json')) {
  console.log('\n=== RUNTIME.JSON ===');
  const rawRt = JSON.parse(await readFile('./data/runtime.json', 'utf8'));
  let rtState = rawRt;
  if (rawRt.encrypted) {
    rtState = JSON.parse(sec.decrypt(rawRt.encrypted));
  }
  console.log('Runtime Processes:', rtState.processes?.length || 0);
  console.log('Runtime Intimations:', rtState.intimations?.length || 0);
  console.log('Runtime Tasks:', rtState.tasks?.length || 0);
  console.log('Runtime Events:', rtState.events?.length || 0);
  console.log('Runtime Sources:', rtState.sources?.length || 0);
  console.log('Runtime Documents:', rtState.documents?.length || 0);
}
