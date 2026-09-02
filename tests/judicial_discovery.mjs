import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { collectDjen } from '../collector/adapters/djen.mjs';
import { collectDatajud, datajudInternals } from '../collector/adapters/datajud.mjs';
import { createContactsFeature } from '../js/features/contacts.js';
import { createProcessesFeature } from '../js/features/processes.js';
import { generateTotp } from '../lib/security.mjs';
import { postJson, startTestServer } from './helpers.mjs';

const PROCESS_NUMBER = '1234567-89.2026.8.21.0001';
const PROCESS_DIGITS = '12345678920268210001';
const TERM_ALPHA = {
  id: 'term-advogada-alpha',
  name: 'Advogada Alpha Teste',
  registration: 'OAB/TS 111111',
  oabUf: 'TS',
  oabNumber: '111111',
  active: true
};
const TERM_BETA = {
  id: 'term-advogado-beta',
  name: 'Advogado Beta Teste',
  registration: 'OAB/TS 222222',
  oabUf: 'TS',
  oabNumber: '222222',
  active: true
};
const NEW_MOVEMENT_AT = new Date(Date.now() - 60 * 60 * 1000).toISOString();
const DATAJUD_UPDATED_AT = new Date(Date.now() - 30 * 60 * 1000).toISOString();

const djenItem = {
  id: 'publicacao-sintetica-001',
  hash: 'hash-publicacao-sintetica-001',
  numero_processo: PROCESS_DIGITS,
  numeroprocessocommascara: PROCESS_NUMBER,
  siglaTribunal: 'TJTS',
  tipoComunicacao: 'Intimação sintética',
  tipoDocumento: 'Despacho sintético',
  nomeOrgao: 'Vara Cível Sintética',
  nomeClasse: 'Procedimento Sintético',
  data_disponibilizacao: new Date().toISOString().slice(0, 10),
  texto: '<p>Publicação exclusivamente sintética para teste.</p>',
  link: 'https://pje.tjrs.jus.br/documento-sintetico',
  destinatarios: [{ nome: 'Cliente Alpha Sintética', polo: 'A' }],
  destinatarioadvogados: [{ advogado: { nome: TERM_ALPHA.name, numero_oab: TERM_ALPHA.oabNumber, uf_oab: TERM_ALPHA.oabUf } }]
};

const datajudRecord = {
  numeroProcesso: PROCESS_DIGITS,
  tribunal: 'TJTS',
  grau: 'G1',
  orgaoJulgador: { nome: 'Vara Cível Sintética' },
  classe: { nome: 'Procedimento Comum Sintético' },
  assuntos: [{ nome: 'Assunto Sintético' }],
  dataHoraUltimaAtualizacao: DATAJUD_UPDATED_AT,
  movimentos: [{ codigo: 101, nome: 'Movimento oficial sintético mais novo', dataHora: NEW_MOVEMENT_AT }],
  dadosBasicos: {
    polo: [
      {
        polo: 'AT',
        partes: [{
          id: 'parte-cliente-sintetica',
          pessoa: {
            nome: 'Cliente Alpha Sintética',
            numeroDocumentoPrincipal: 'DOC-CLIENTE-SINTETICO-001',
            rg: 'RG-SINTETICO-001',
            endereco: { logradouro: 'Rua Sintética 100', municipio: 'Cidade Sintética', uf: 'TS' }
          },
          advogados: [
            { nome: TERM_ALPHA.name, inscricao: TERM_ALPHA.oabNumber },
            { nome: TERM_BETA.name, inscricao: TERM_BETA.oabNumber }
          ]
        }]
      },
      {
        polo: 'PA',
        partes: [{
          id: 'parte-adversa-sintetica',
          pessoa: {
            nome: 'Empresa Adversa Sintética',
            numeroDocumentoPrincipal: 'DOC-ADVERSO-SINTETICO-002',
            endereco: { logradouro: 'Avenida Sintética 200', municipio: 'Outra Cidade Sintética', uf: 'TS' }
          },
          advogados: []
        }]
      }
    ]
  }
};

const djenPortal = {
  id: 'djen-cnj',
  name: 'DJEN / CNJ Oficial',
  url: 'https://comunicaapi.pje.jus.br/api/v1/comunicacao',
  lookbackDays: 2,
  requestSpacingMs: 0,
  pageSize: 50,
  maxPages: 1
};
const datajudPortal = {
  id: 'datajud-cnj',
  name: 'DataJud / CNJ',
  autoRefreshKey: false,
  requestSpacingMs: 0,
  movementLookbackDays: 3650
};

const remoteCalls = [];
const djenFetch = async (url, options = {}) => {
  remoteCalls.push({ url: String(url), method: options.method || 'GET' });
  return new Response(JSON.stringify({ count: 1, items: [djenItem] }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
};
const datajudFetch = async (url, options = {}) => {
  remoteCalls.push({ url: String(url), method: options.method || 'GET' });
  return new Response(JSON.stringify({
    _shards: { total: 1, successful: 1, failed: 0 },
    hits: { hits: [{ _source: structuredClone(datajudRecord) }] }
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });
};

const target = {
  events: [],
  tasks: [],
  intimations: [],
  processes: [],
  contacts: [],
  sources: [],
  terms: [TERM_ALPHA, TERM_BETA]
};

await runSyntheticDiscoveryCycle(target);
assert.equal(target.intimations.length, 1, 'a mesma publicação retornada para duas OABs deve permanecer canônica');
assert.deepEqual([...target.intimations[0].monitoredTermIds].sort(), [TERM_ALPHA.id, TERM_BETA.id].sort());
assert.equal(target.processes.length, 1, 'o número CNJ descoberto deve criar um único processo');
assert.equal(target.processes[0].number, PROCESS_NUMBER);
assert.equal(target.processes[0].court, 'TJTS · G1 · Vara Cível Sintética');
assert.equal(target.processes[0].actionType, 'Procedimento Comum Sintético');
assert.equal(target.processes[0].subject, 'Assunto Sintético');
assert.equal(target.processes[0].lastMovement, 'Movimento oficial sintético mais novo');
assert.equal(target.processes[0].lastMovementAt, NEW_MOVEMENT_AT);
assert.equal(target.processes[0].client, 'Cliente Alpha Sintética');
assert.equal(target.processes[0].contactId, target.contacts.find(item => item.name === 'Cliente Alpha Sintética')?.id, 'processo deve apontar para o contato canônico da parte representada');
assert.equal(target.processes[0].counterpart, 'Empresa Adversa Sintética');
assert.deepEqual([...target.processes[0].monitoredTermIds].sort(), [TERM_ALPHA.id, TERM_BETA.id].sort());
assert.equal(target.contacts.length, 2, 'partes estruturadas devem gerar contatos individuais');
assert.equal(target.contacts.find(item => item.name === 'Cliente Alpha Sintética')?.contactRole, 'cliente');
assert.equal(target.contacts.find(item => item.name === 'Empresa Adversa Sintética')?.contactRole, 'adverso');
assert(target.tasks.every(item => item.deadline === '' && !item.fatalDeadline), 'discovery não pode inferir prazo');
assert.equal(target.tasks[0]?.responsible, 'Equipe jurídica', 'duas associações não podem criar responsável único arbitrário');

const firstCounts = collectionCounts(target);
await runSyntheticDiscoveryCycle(target);
assert.deepEqual(collectionCounts(target), firstCounts, 'o segundo sync idêntico não pode duplicar publicações, processos, contatos ou tarefas');
assert.equal(remoteCalls.filter(call => call.url.includes('api-publica.datajud.cnj.jus.br')).length, 2, 'DataJud deve ser consultado uma vez por processo em cada ciclo, não uma vez por advogado');
assert(remoteCalls.filter(call => call.method === 'POST').every(call => call.url.endsWith('/_search')), 'o único POST remoto do discovery deve ser a pesquisa somente leitura do DataJud');
assert(remoteCalls.every(call => call.url.startsWith('https://comunicaapi.pje.jus.br/') || call.url.startsWith('https://api-publica.datajud.cnj.jus.br/')), 'discovery não pode chamar fonte remota não autorizada');

const manualTarget = {
  tasks: [],
  intimations: [{ id: 'djen:manual-test', externalId: 'djen:manual-test', process: PROCESS_NUMBER, monitoredTermIds: [TERM_ALPHA.id, TERM_BETA.id] }],
  processes: [{
    id: 'processo-manual-sintetico',
    number: PROCESS_NUMBER,
    client: 'Cliente cadastrado manualmente',
    counterpart: 'Contraparte cadastrada manualmente',
    notes: 'Notas manuais preservadas',
    customManualField: 'valor manual',
    lastMovement: 'Movimento manual anterior',
    lastMovementAt: '2026-01-01T00:00:00.000Z',
    monitoring: 'active',
    source: 'Cadastro manual'
  }],
  contacts: [{
    id: 'contato-manual-sintetico',
    name: 'Cliente Alpha Sintética',
    document: 'DOC-CLIENTE-SINTETICO-001',
    phone: '(00) 0000-0000',
    email: 'cliente.sintetico@example.test',
    address: 'Endereço manual preferencial',
    contactRole: 'cliente',
    source: 'Cadastro manual'
  }],
  terms: [TERM_ALPHA, TERM_BETA]
};

datajudInternals.mergeDatajudRecord(structuredClone(datajudRecord), PROCESS_NUMBER, 'tjrs', datajudPortal, { monitoredTerms: manualTarget.terms }, manualTarget);
const manualProcess = manualTarget.processes[0];
assert.equal(manualProcess.client, 'Cliente cadastrado manualmente');
assert.equal(manualProcess.counterpart, 'Contraparte cadastrada manualmente');
assert.equal(manualProcess.notes, 'Notas manuais preservadas');
assert.equal(manualProcess.customManualField, 'valor manual');
assert.equal(manualProcess.lastMovement, 'Movimento oficial sintético mais novo');
assert.equal(manualProcess.lastMovementAt, NEW_MOVEMENT_AT);
assert.equal(manualTarget.contacts.length, 2, 'contato manual coincidente deve ser enriquecido, não duplicado');
const enrichedManualContact = manualTarget.contacts.find(item => item.id === 'contato-manual-sintetico');
assert.equal(enrichedManualContact.phone, '(00) 0000-0000');
assert.equal(enrichedManualContact.email, 'cliente.sintetico@example.test');
assert.equal(enrichedManualContact.address, 'Endereço manual preferencial');
assert.equal(enrichedManualContact.city, 'Cidade Sintética');
assert.equal(enrichedManualContact.state, 'TS');

const olderRecord = structuredClone(datajudRecord);
olderRecord.dataHoraUltimaAtualizacao = '2025-01-02T00:00:00.000Z';
olderRecord.movimentos = [{ codigo: 99, nome: 'Movimento oficial antigo', dataHora: '2025-01-01T00:00:00.000Z' }];
datajudInternals.mergeDatajudRecord(olderRecord, PROCESS_NUMBER, 'tjrs', datajudPortal, { monitoredTerms: manualTarget.terms }, manualTarget);
assert.equal(manualProcess.lastMovement, 'Movimento oficial sintético mais novo', 'movimentação antiga não pode substituir a nova');
assert.equal(manualProcess.lastMovementAt, NEW_MOVEMENT_AT);

const ambiguousRecord = structuredClone(datajudRecord);
ambiguousRecord.dadosBasicos.polo[0].partes[0].advogados = [{ nome: 'Advogada Não Monitorada Teste', inscricao: '999999' }];
const ambiguousTarget = { tasks: [], intimations: [], processes: [], contacts: [], terms: [TERM_ALPHA, TERM_BETA] };
datajudInternals.mergeDatajudRecord(ambiguousRecord, PROCESS_NUMBER, 'tjrs', datajudPortal, { monitoredTerms: ambiguousTarget.terms }, ambiguousTarget);
assert.equal(ambiguousTarget.processes[0].client, undefined, 'sem vínculo inequívoco não deve haver cliente escolhido');
assert.equal(ambiguousTarget.processes[0].counterpart, undefined, 'sem polo representado inequívoco não deve haver contraparte escolhida');
assert(ambiguousTarget.contacts.every(item => item.contactRole === 'outro'), 'partes ambíguas devem ficar pendentes de classificação');

const selfPartyRecord = structuredClone(datajudRecord);
selfPartyRecord.dadosBasicos.polo[0].partes[0].pessoa.nome = TERM_ALPHA.name;
selfPartyRecord.dadosBasicos.polo[0].partes[0].advogados = [{ nome: TERM_ALPHA.name, inscricao: TERM_ALPHA.oabNumber, uf: TERM_ALPHA.oabUf }];
const selfPartyTarget = { tasks: [], intimations: [], processes: [], contacts: [], terms: [TERM_ALPHA] };
datajudInternals.mergeDatajudRecord(selfPartyRecord, PROCESS_NUMBER, 'tjrs', datajudPortal, { monitoredTerms: selfPartyTarget.terms }, selfPartyTarget);
const selfContact = selfPartyTarget.contacts.find(item => item.name === TERM_ALPHA.name);
assert.ok(selfContact, 'advogado monitorado que também é parte deve existir uma única vez como contato descoberto');
assert.equal(selfContact.contactRole, 'outro', 'advogado monitorado que também é parte não pode ser inferido como cliente de si mesmo');
assert.equal(selfContact.relationshipProvenance?.status, 'requires-human-confirmation');
assert.equal(selfContact.relationshipProvenance?.reason, 'monitored-professional-is-party');
assert.equal(selfPartyTarget.processes[0].client, undefined, 'caso de autor/advogado não pode corromper o cliente canônico');

const frontendProcessStore = {
  state: { processes: [{ ...manualProcess, client: 'Cliente frontend manual', notes: 'Notas frontend manuais' }] }
};
const processFeature = createProcessesFeature({ store: frontendProcessStore });
processFeature.upsertExternalProcess({
  number: PROCESS_NUMBER,
  client: '',
  notes: '',
  lastMovement: 'Movimento externo mais antigo',
  lastMovementAt: '2024-01-01T00:00:00.000Z',
  source: 'DataJud / CNJ'
});
assert.equal(frontendProcessStore.state.processes.length, 1);
assert.equal(frontendProcessStore.state.processes[0].client, 'Cliente frontend manual');
assert.equal(frontendProcessStore.state.processes[0].notes, 'Notas frontend manuais');
assert.equal(frontendProcessStore.state.processes[0].lastMovement, 'Movimento oficial sintético mais novo');

const frontendContactStore = {
  state: { contacts: [{
    id: 'contato-frontend-manual',
    name: 'Cliente Alpha Sintética',
    document: 'DOC-CLIENTE-SINTETICO-001',
    phone: '(00) 1111-1111',
    email: 'frontend.sintetico@example.test',
    source: 'Cadastro manual'
  }] }
};
const contactsFeature = createContactsFeature({ store: frontendContactStore });
const manualContactSnapshot = JSON.stringify(frontendContactStore.state.contacts);
contactsFeature.upsertExternalContact(structuredClone(frontendContactStore.state.contacts[0]));
assert.equal(JSON.stringify(frontendContactStore.state.contacts), manualContactSnapshot, 'contato manual devolvido sem enriquecimento deve permanecer byte-equivalente');
const frontendContactPayload = {
  id: 'contact:datajud:party:parte-cliente-sintetica',
  externalId: 'datajud:party:parte-cliente-sintetica',
  name: 'Cliente Alpha Sintética',
  document: 'DOC-CLIENTE-SINTETICO-001',
  phone: '',
  email: '',
  city: 'Cidade Sintética',
  state: 'TS',
  contactRole: 'cliente',
  source: 'DataJud / CNJ'
};
contactsFeature.upsertExternalContact(frontendContactPayload);
contactsFeature.upsertExternalContact(frontendContactPayload);
assert.equal(frontendContactStore.state.contacts.length, 1);
assert.equal(frontendContactStore.state.contacts[0].phone, '(00) 1111-1111');
assert.equal(frontendContactStore.state.contacts[0].email, 'frontend.sintetico@example.test');
assert.equal(frontendContactStore.state.contacts[0].city, 'Cidade Sintética');

await verifyServerPipeline();
await verifyPersistedOabDiscoveryPipeline();
await verifySourceContracts();

console.log('Judicial discovery passou: DJEN → DataJud → processo → contatos, multi-OAB, merges seguros, idempotência e endpoints canônicos.');

async function runSyntheticDiscoveryCycle(cycleTarget) {
  const monitoredTerms = cycleTarget.terms || [];
  for (const term of monitoredTerms) {
    await collectDjen({ ...djenPortal, ufOab: term.oabUf, numeroOab: term.oabNumber }, {
      monitoredTerm: term,
      monitoredTerms
    }, cycleTarget, { fetchImpl: djenFetch, sleep: async () => {} });
  }
  await collectDatajud(datajudPortal, { monitoredTerms }, cycleTarget, {
    apiKey: 'chave-publica-exclusivamente-sintetica',
    processNumbers: [PROCESS_NUMBER],
    fetchImpl: datajudFetch,
    sleep: async () => {}
  });
}

async function verifyPersistedOabDiscoveryPipeline() {
  const server = await startTestServer();
  try {
    const session = await setupMaster(server.baseUrl);
    let response = await fetch(`${server.baseUrl}/api/state`, { headers: { Cookie: session.cookie } });
    const fresh = await response.json();
    assert.equal(response.status, 200);
    assert.equal(fresh.stateStatus, 'NEW_INSTALL');

    const state = {
      version: 1,
      schemaVersion: fresh.schemaVersion,
      dataVersion: fresh.dataVersion,
      terms: [structuredClone(TERM_ALPHA), structuredClone(TERM_BETA)],
      sources: [],
      intimations: [],
      tasks: [],
      processes: [],
      agenda: [],
      audit: [],
      contacts: [],
      leads: [],
      customPrompts: [],
      customLinks: [],
      configuration: {},
      settings: { demoMode: false }
    };
    response = await postJson(`${server.baseUrl}/api/state`, { state, revision: null }, {
      Cookie: session.cookie,
      'X-CSRF-Token': session.csrf
    });
    const saved = await response.json();
    assert.equal(response.status, 200);
    assert.ok(saved.revision, 'Persistência da OAB sintética deve criar revision.');

    response = await fetch(`${server.baseUrl}/api/state`, { headers: { Cookie: session.cookie } });
    const reloaded = await response.json();
    assert.equal(response.status, 200);
    assert.equal(reloaded.stateStatus, 'READY');
    assert.deepEqual(reloaded.state.terms.map(term => term.id), [TERM_ALPHA.id, TERM_BETA.id], 'OABs sintéticas devem sobreviver ao reload.');

    const targetFromPersistedTerms = {
      events: [], tasks: [], intimations: [], processes: [], contacts: [], sources: [],
      terms: reloaded.state.terms
    };
    await runSyntheticDiscoveryCycle(targetFromPersistedTerms);
    assert.equal(targetFromPersistedTerms.processes.length, 1);
    assert.equal(targetFromPersistedTerms.processes[0].client, 'Cliente Alpha Sintética');
    assert.equal(targetFromPersistedTerms.processes[0].counterpart, 'Empresa Adversa Sintética');
    assert.equal(targetFromPersistedTerms.contacts.find(item => item.name === 'Cliente Alpha Sintética')?.contactRole, 'cliente');
    assert.equal(targetFromPersistedTerms.contacts.find(item => item.name === 'Empresa Adversa Sintética')?.contactRole, 'adverso');
  } finally {
    await server.stop();
  }
}

function collectionCounts(value) {
  return {
    intimations: value.intimations.length,
    processes: value.processes.length,
    contacts: value.contacts.length,
    tasks: value.tasks.length
  };
}

async function verifyServerPipeline() {
  const server = await startTestServer();
  try {
    const session = await setupMaster(server.baseUrl);
    let response = await fetch(`${server.baseUrl}/api/events`, { headers: { Cookie: session.cookie } });
    let runtime = await response.json();
    assert(response.ok);
    assert.deepEqual(runtime.contacts, [], 'runtime novo deve iniciar retrocompatível com contacts vazio');

    response = await postJson(`${server.baseUrl}/api/ingest`, { contacts: [{ name: 'Sem Autorização Teste' }] });
    assert.equal(response.status, 401, 'collector token continua obrigatório no ingest');

    const firstContact = JSON.parse(`{
      "id":"contato-runtime-sintetico",
      "externalId":"datajud:party:runtime-sintetico",
      "name":"Contato Runtime Sintético",
      "document":"DOC-RUNTIME-SINTETICO-003",
      "phone":"(00) 2222-2222",
      "email":"runtime.sintetico@example.test",
      "source":"Cadastro manual",
      "__proto__":{"polluted":true},
      "constructor":{"prototype":{"polluted":true}}
    }`);
    response = await postJson(`${server.baseUrl}/api/ingest`, { contacts: [firstContact] }, {
      Authorization: `Bearer ${server.collectorToken}`
    });
    let result = await response.json();
    assert(response.ok);
    assert.equal(result.imported, 1, 'imported count deve incluir contacts');

    response = await postJson(`${server.baseUrl}/api/ingest`, { contacts: [{
      id: 'contato-runtime-segundo-id',
      externalId: 'datajud:party:runtime-sintetico',
      name: 'Contato Runtime Sintético',
      document: 'DOC-RUNTIME-SINTETICO-003',
      phone: '',
      email: '',
      city: 'Cidade Runtime Sintética',
      state: 'TS',
      source: 'DataJud / CNJ'
    }] }, { Authorization: `Bearer ${server.collectorToken}` });
    result = await response.json();
    assert(response.ok);
    assert.equal(result.imported, 1);

    response = await fetch(`${server.baseUrl}/api/events`, { headers: { Cookie: session.cookie } });
    runtime = await response.json();
    assert.equal(runtime.contacts.length, 1, '/api/ingest deve deduplicar contacts no runtime');
    assert.equal(runtime.contacts[0].phone, '(00) 2222-2222');
    assert.equal(runtime.contacts[0].email, 'runtime.sintetico@example.test');
    assert.equal(runtime.contacts[0].city, 'Cidade Runtime Sintética');
    assert.equal(Object.hasOwn(runtime.contacts[0], '__proto__'), false);
    assert.equal(Object.hasOwn(runtime.contacts[0], 'constructor'), false);
    assert.equal(Object.prototype.polluted, undefined, 'payload do collector não pode causar prototype pollution');

    response = await postJson(`${server.baseUrl}/api/sync`, {}, {
      Cookie: session.cookie,
      'X-CSRF-Token': session.csrf
    });
    const sync = await response.json();
    assert(response.ok);
    assert.equal(sync.contacts.length, 1, '/api/sync deve devolver contacts sem duplicação');
    assert.equal(sync.contacts[0].phone, '(00) 2222-2222');
  } finally {
    await server.stop();
  }
}

async function setupMaster(baseUrl) {
  let response = await postJson(`${baseUrl}/api/auth/setup`, {
    username: 'admin.discovery.test',
    displayName: 'Administradora Discovery Teste',
    password: 'Senha-Discovery-Sintetica-2026!'
  });
  const setup = await response.json();
  assert.equal(response.status, 200);
  response = await postJson(`${baseUrl}/api/auth/setup/verify`, {
    setupToken: setup.setupToken,
    code: generateTotp(setup.manualSecret)
  });
  const verified = await response.json();
  assert.equal(response.status, 200);
  return {
    cookie: response.headers.get('set-cookie').split(';')[0],
    csrf: verified.csrfToken
  };
}

async function verifySourceContracts() {
  const [serverSource, portalSource, agentSource, agentsGuardrails] = await Promise.all([
    readFile(new URL('../server.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../js/portal.js', import.meta.url), 'utf8'),
    readFile(new URL('../collector/agent.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../AGENTS.md', import.meta.url), 'utf8')
  ]);
  const syncSource = serverSource.slice(serverSource.indexOf("url.pathname === '/api/sync'"), serverSource.indexOf("if (req.method === 'GET' || req.method === 'HEAD')"));
  assert(syncSource.indexOf('await collectDjen') >= 0 && syncSource.indexOf('await collectDjen') < syncSource.indexOf('await collectDatajud'), '/api/sync deve encadear DJEN antes do DataJud');
  assert.match(serverSource, /emptyRuntime[^\n]+contacts:\s*\[\]/, 'runtime canônico deve declarar contacts');
  assert.match(serverSource, /contacts:\s*mergeExternalContacts\(runtime\.contacts, collections\.contacts\)/, '/api/ingest deve preservar contacts');
  assert.match(syncSource, /contacts,\s*\n\s*sources:/, '/api/sync deve persistir e retornar contacts');
  assert.doesNotMatch(syncSource, /mergeBy\(tasks,\s*sanitizeArray\(appState\?\.tasks\)/, '/api/sync não deve reenviar tarefas manuais como registros externos');
  assert.doesNotMatch(syncSource, /mergeBy\(intimations,\s*sanitizeArray\(appState\?\.intimations\)/, '/api/sync não deve reenviar publicações manuais como registros externos');
  assert.doesNotMatch(syncSource, /sendMail|sendEmail|acknowledge|protocolar|ci[eê]ncia/i, '/api/sync não pode praticar ato ou enviar e-mail');
  assert.match(portalSource, /getProcessesFeature\(\)\.upsertExternalProcess\(item\)/, 'frontend deve delegar merge externo de processo');
  assert.match(portalSource, /getContactsFeature\(\)\.upsertExternalContact\(item\)/, 'frontend deve consumir contacts pela feature canônica');
  assert.match(agentSource, /contacts:\s*\[\]/, 'payload do collector agent deve transportar contacts');
  assert.match(agentsGuardrails, /DJEN → número CNJ → DataJud → processo e\s+contatos/, 'guardrail arquitetural do discovery deve estar registrado');
}
