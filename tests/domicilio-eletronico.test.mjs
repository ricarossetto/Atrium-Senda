import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createDomicilioClient,
  assertDomicilioWindow,
  DomicilioError
} from '../lib/judicial/domicilio/domicilio-client.mjs';
import {
  normalizeDomicilioComunicacao,
  normalizeDomicilioBatch,
  summarizeDomicilioIntimation
} from '../lib/judicial/domicilio/domicilio-normalizer.mjs';
import { computeIntimationIdentity } from '../lib/publications/intimation-identity.mjs';
import { computeMergePlan } from '../lib/publications/intimation-merge-engine.mjs';
import { readDomicilioSession, resolveDomicilioSession } from '../lib/judicial/domicilio/domicilio-session.mjs';
import { captureDomicilioComunicacoes, captureWindow } from '../lib/judicial/domicilio/domicilio-capture.mjs';
import { captureDomicilioRaw, collectDomicilio } from '../collector/adapters/domicilio.mjs';
import { mapPortalItemToDomicilio } from '../lib/judicial/domicilio/domicilio-portal.mjs';

console.log('\n===============================================================');
console.log('  ATRIUM — DOMICÍLIO ELETRÔNICO (PDPJ): CLIENTE E NORMALIZADOR  ');
console.log('===============================================================\n');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SESSION = { accessToken: 'token-sintetico-de-teste', tenantId: '00000000-0000-4000-8000-000000000000' };
const CNJ = '5001234-56.2024.8.21.0001';
const CNJ_DIGITS = CNJ.replace(/\D/g, '');

{
  const item = normalizeDomicilioComunicacao(mapPortalItemToDomicilio({
    numeroComunicacao: 'sintetico', numero_processo: CNJ_DIGITS,
    datadisponibilizacao: '2026-09-20', prazo: '2026-09-30',
    dataFinalCiencia: '2026-09-25',
    texto: '<!DOCTYPE html><html><head><title>Ignorar</title></head><body><p>Processo sigiloso</p><p>Consulte os autos &amp; documentos.</p><script>ignorar()</script></body></html>'
  }));
  assert.equal(item.text, 'Processo sigiloso Consulte os autos & documentos.');
  assert.equal(item.fullText, item.text);
  assert.equal(item.sourceReportedDeadlineAt, '2026-09-30');
  assert.equal(item.noticeDeadlineAt, '2026-09-25');
  assert.equal(item.disponibilizadoEm, '2026-09-20');
  assert.equal('deadline' in item, false);
}

function fakeResponse({ status = 200, payload = {}, headers = {} } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: name => headers[String(name).toLowerCase()] ?? null },
    json: async () => payload,
    text: async () => JSON.stringify(payload)
  };
}

console.log('[C1] Janela oficial de 7 dias por consulta...');
assert.deepEqual(assertDomicilioWindow('2026-09-15', '2026-09-21'), { dataInicio: '2026-09-15', dataFim: '2026-09-21', days: 7 });
assert.throws(() => assertDomicilioWindow('2026-09-01', '2026-09-21'), error => error.code === 'DOMICILIO_WINDOW_EXCEEDED' && error.statusCode === 400);
assert.throws(() => assertDomicilioWindow('2026-09-21', '2026-09-15'), error => error.code === 'DOMICILIO_WINDOW_INVALID');
assert.throws(() => assertDomicilioWindow('15/09/2026', '2026-09-21'), error => error.code === 'DOMICILIO_WINDOW_INVALID');
console.log('  ✓ 7 dias aceitos; 8+ dias, inversão e formato inválido falham fechado.');

console.log('[C2] Falha fechada sem sessão e consulta somente leitura...');
{
  const client = createDomicilioClient({ fetchImpl: async () => { throw new Error('não deveria chamar a rede'); } });
  await assert.rejects(
    () => client.listarComunicacoes(null, { dataInicio: '2026-09-15', dataFim: '2026-09-21' }),
    error => error instanceof DomicilioError && error.code === 'DOMICILIO_NOT_AUTHENTICATED' && error.statusCode === 409
  );
  assert.equal(typeof client.listarComunicacoes, 'function');
  assert.equal(typeof client.ticket, 'function');
  assert.equal('informarCiencia' in client, false, 'Cliente não pode expor escrita de ciência.');
  const source = await readFile(path.join(ROOT, 'lib/judicial/domicilio/domicilio-client.mjs'), 'utf8');
  assert.doesNotMatch(source, /method:\s*['"](POST|PUT|PATCH|DELETE)['"]/, 'Cliente do Domicílio é estritamente GET.');
  assert.match(source, /DOMICILIO_WRITE_FORBIDDEN/);
  console.log('  ✓ Sem Bearer+tenantId não há rede; nenhuma operação de escrita existe no módulo.');
}

console.log('[C3] Listagem paginada com headers oficiais...');
{
  const calls = [];
  const pages = [
    fakeResponse({ payload: { content: [{ numeroComunicacao: '1' }, { numeroComunicacao: '2' }], number: 0, totalPages: 2, last: false } }),
    fakeResponse({ payload: { content: [{ numeroComunicacao: '3' }], number: 1, totalPages: 2, last: true } })
  ];
  const client = createDomicilioClient({
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return pages[Math.min(calls.length - 1, pages.length - 1)];
    }
  });
  const result = await client.listarComunicacoes(SESSION, { dataInicio: '2026-09-15', dataFim: '2026-09-21', numeroProcesso: CNJ_DIGITS });
  assert.equal(result.items.length, 3);
  assert.equal(result.truncated, false);
  assert.equal(result.totalElements, null);
  assert.equal(calls.length, 2);
  const [first] = calls;
  assert.match(first.url, /^https:\/\/gateway\.cloud\.pje\.jus\.br\/domicilio-eletronico\/api\/v1\/comunicacoes-representantes\?/);
  assert.match(first.url, /dataInicio=2026-09-15/);
  assert.match(first.url, /dataFim=2026-09-21/);
  assert.match(first.url, /numeroProcesso=\d{20}/);
  assert.match(first.url, /pagina=0/);
  assert.equal(first.options.method, 'GET');
  assert.equal(first.options.headers.authorization, 'Bearer token-sintetico-de-teste');
  assert.equal(first.options.headers.tenantId, SESSION.tenantId);
  assert.equal(first.options.redirect, 'error');
  console.log('  ✓ Paginação, janela, CNJ e headers (Bearer + tenantId) conferidos; somente GET.');

  const truncatedClient = createDomicilioClient({
    fetchImpl: async () => fakeResponse({ payload: { content: [{ numeroComunicacao: '9' }], number: 0, last: false } })
  });
  const truncated = await truncatedClient.listarComunicacoes(SESSION, { dataInicio: '2026-09-15', dataFim: '2026-09-21', maxPages: 3 });
  assert.equal(truncated.truncated, true, 'Teto de páginas marca coleta parcial, nunca sucesso silencioso.');
}

console.log('[C4] Erros oficiais viram códigos estáveis...');
{
  const client = status => createDomicilioClient({ fetchImpl: async () => fakeResponse({ status, payload: { message: 'x' } }) });
  await assert.rejects(() => client(401).listarComunicacoes(SESSION, { dataInicio: '2026-09-15', dataFim: '2026-09-21' }), error => error.code === 'DOMICILIO_UNAUTHORIZED');
  await assert.rejects(() => client(403).listarComunicacoes(SESSION, { dataInicio: '2026-09-15', dataFim: '2026-09-21' }), error => error.code === 'DOMICILIO_FORBIDDEN');
  await assert.rejects(() => client(404).ticket(SESSION, { numeroProcesso: CNJ, numeroComunicacao: '1' }), error => error.code === 'DOMICILIO_NOT_FOUND');
  await assert.rejects(
    () => createDomicilioClient({ fetchImpl: async () => fakeResponse({ status: 429, headers: { 'retry-after': '12' } }) }).listarComunicacoes(SESSION, { dataInicio: '2026-09-15', dataFim: '2026-09-21' }),
    error => error.code === 'DOMICILIO_RATE_LIMITED' && error.retryAfterSeconds === 12
  );
  await assert.rejects(() => client(503).listarComunicacoes(SESSION, { dataInicio: '2026-09-15', dataFim: '2026-09-21' }), error => error.code === 'DOMICILIO_UNAVAILABLE');
  await assert.rejects(
    () => createDomicilioClient({ fetchImpl: async () => fakeResponse({ status: 200, payload: null }) }).ticket(SESSION, { numeroProcesso: CNJ, numeroComunicacao: '1' }),
    error => error.code === 'DOMICILIO_EMPTY_RESPONSE'
  );
  console.log('  ✓ 401/403/404/429/5xx/resposta vazia mapeados sem vazar corpo da fonte.');
}

console.log('[C5] Ticket oficial sem ação processual...');
{
  const calls = [];
  const client = createDomicilioClient({
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return fakeResponse({ payload: { linkCertificado: 'https://exemplo.test/certidao' } });
    }
  });
  const ticket = await client.ticket(SESSION, { numeroProcesso: CNJ, numeroComunicacao: '998877' });
  assert.equal(ticket.linkCertificado, 'https://exemplo.test/certidao');
  assert.match(calls[0].url, new RegExp(`/api/v1/processo/${CNJ_DIGITS}/comunicacao/998877/ticket$`));
  assert.equal(calls[0].options.method, 'GET');
  await assert.rejects(async () => client.ticket(SESSION, { numeroProcesso: '', numeroComunicacao: '' }), error => error.code === 'DOMICILIO_TICKET_INVALID');
  console.log('  ✓ Ticket apenas consulta o link oficial (GET), sem informar ciência.');
}

console.log('[C6] Normalizador: contrato oficial e referências de prazo/ciência...');
{
  const raw = {
    numeroComunicacao: '555444',
    numeroProcesso: CNJ_DIGITS,
    tribunalOrigem: 'TJRS',
    varaJudicial: '1ª Vara Cível',
    orgaoLegal: 'Poder Judiciário',
    classe: 'Procedimento Comum',
    assunto: 'Obrigação de fazer',
    magistrado: 'Juiz Teste',
    tipoComunicacao: 'Intimação',
    tipoIntimacao: 'Intimação para manifestação',
    dataComunicacao: '2026-09-16T10:00:00Z',
    dataFinalCiencia: '2026-09-23',
    prazo: '2026-09-30',
    urgente: false,
    tutelaUrgencia: false,
    segredoJustica: true,
    nivelSigilo: 2,
    status: 'NAO_CIENTE',
    ciente: false,
    meioEnvio: 'DOMICILIO_ELETRONICO',
    representantes: [
      { nome: 'Advogada Teste', numeroOab: '000000', ufOab: 'RS' },
      { nome: 'Advogada Teste', numeroOab: '000000', ufOab: 'RS' }
    ],
    linksDocumentos: ['https://docs.exemplo.test/intimacao.pdf', 'http://inseguro.test/x.pdf'],
    autoresReclamantes: [{ nome: 'Parte Autora Teste' }]
  };
  const intimation = normalizeDomicilioComunicacao(raw, { collectedAt: '2026-09-16T12:00:00.000Z' });
  assert.equal(intimation.externalId, 'domicilio:555444');
  assert.equal(intimation.type, 'domicilio');
  assert.equal(intimation.process, CNJ);
  assert.equal(intimation.disponibilizadoEm, '2026-09-16');
  assert.equal(intimation.sourceReportedAt, '2026-09-16');
  assert.equal(intimation.sourceReportedDeadlineAt, '2026-09-30');
  assert.equal(intimation.sourceReportedDeadlineSource, 'domicilio');
  assert.equal(intimation.noticeDeadlineAt, '2026-09-23');
  assert.equal('deadline' in intimation, false, 'Nunca infere prazo operativo.');
  assert.equal('fatalDeadline' in intimation, false);
  assert.equal(intimation.treatmentStatus, 'untreated');
  assert.equal(intimation.unread, true);
  assert.equal(intimation.domicilioMeta.ciente, false, 'Ciência do portal é estado da fonte, não tratamento no ATRIUM.');
  assert.equal(intimation.domicilioMeta.segredoJustica, true);
  assert.equal(intimation.publicationLawyers.length, 1, 'Advogados deduplicados.');
  assert.equal(intimation.publicationLawyers[0].oab, '000000');
  assert.match(intimation.lawyers, /OAB\/RS 000000/);
  assert.deepEqual(intimation.sourceDocuments, ['https://docs.exemplo.test/intimacao.pdf'], 'Somente links https entram no acervo.');
  assert.match(intimation.text, /Domicílio Eletrônico/);
  assert.doesNotMatch(intimation.text, /Parte Autora Teste/, 'Partes não entram no texto normalizado (sem PII desnecessária).');
  assert.equal(intimation.event, 'Intimação');
  console.log('  ✓ Prazo e ciência apenas como referência declarada; tratamento permanece humano.');

  const withoutNumber = normalizeDomicilioComunicacao({ numeroProcesso: CNJ_DIGITS, dataComunicacao: '2026-09-16', tipoComunicacao: 'Intimação' });
  const repeated = normalizeDomicilioComunicacao({ numeroProcesso: CNJ_DIGITS, dataComunicacao: '2026-09-16', tipoComunicacao: 'Intimação' });
  assert.match(withoutNumber.externalId, /^domicilio:fp:[0-9a-f]{32}$/);
  assert.equal(withoutNumber.externalId, repeated.externalId, 'Identidade sem número oficial é determinística.');

  const batch = normalizeDomicilioBatch([raw, { numeroComunicacao: '556' }, null], { collectedAt: '2026-09-16T12:00:00.000Z' });
  assert.equal(batch.intimations.length, 2);
  assert.equal(batch.resumo.normalizadas, 2);
  assert.equal(batch.resumo.ignoradas, 1);
  assert.equal(batch.resumo.comReferenciaDePrazo, 1);
  assert.equal(batch.resumo.comReferenciaDeCiencia, 1);

  const summary = summarizeDomicilioIntimation(intimation);
  assert.deepEqual(Object.keys(summary).sort(), ['data', 'event', 'externalId', 'hasDeadlineReference', 'hasNoticeReference', 'process', 'urgent']);
  console.log('  ✓ Lote com resumo honesto e sumário de log sem PII.');
}

console.log('[C7] Reconciliação: domicílio entra na identidade e nunca vence o eproc no prazo...');
{
  const intimation = normalizeDomicilioComunicacao({
    numeroComunicacao: '777888',
    numeroProcesso: CNJ_DIGITS,
    tipoComunicacao: 'Intimação',
    dataComunicacao: '2026-09-16',
    dataFinalCiencia: '2026-09-23',
    prazo: '2026-09-30',
    representantes: []
  }, { collectedAt: '2026-09-16T12:00:00.000Z' });
  const identity = computeIntimationIdentity(intimation);
  assert.equal(identity.source, 'domicilio');
  assert.equal(identity.eligible, true);
  assert.equal(identity.matchable, true);
  assert.equal(identity.dataISO, '2026-09-16');

  const eproc = {
    id: `eproc:tjrs:${CNJ_DIGITS}`,
    externalId: `eproc:tjrs:${CNJ_DIGITS}`,
    process: CNJ,
    processNumber: CNJ,
    source: 'eproc',
    event: 'Intimação',
    title: 'Intimação eproc',
    text: 'Texto do painel eproc.',
    sourceText: 'Texto do painel eproc.',
    sourceReportedAt: '2026-09-16',
    sourceReportedDeadlineAt: '2026-09-28',
    sourceReportedDeadlineSource: 'eproc',
    deadline: '2026-09-28',
    deadlineSource: 'eproc',
    sourceStatus: 'active',
    treatmentStatus: 'untreated',
    createdAt: '2026-09-16T13:00:00.000Z'
  };
  const plan = computeMergePlan(eproc, intimation);
  assert.equal(plan.mergeable, true, 'As duas fontes formam o mesmo grupo de identidade.');
  assert.equal(plan.merged.sourceReportedDeadlineAt, '2026-09-28', 'eproc é a verdade absoluta do prazo.');
  assert.equal(plan.merged.deadlineSource, 'eproc');
  assert.equal(plan.merged.deadline, '2026-09-28');
  assert.equal(plan.merged.noticeDeadlineAt, '2026-09-23', 'Referência de ciência do Domicílio é preservada.');
  assert.equal(plan.merged.treatmentStatus, 'untreated');
  assert.equal(plan.merged.unread, true);
  console.log('  ✓ Domicílio reconcilia com eproc; prazo oficial permanece do eproc.');
}

console.log('[C8] Sessão do portal: token e tenantId lidos do navegador autenticado...');
{
  const makeStorage = entries => {
    const map = new Map(Object.entries(entries));
    return {
      get length() { return map.size; },
      key: index => [...map.keys()][index] ?? null,
      getItem: key => (map.has(key) ? map.get(key) : null)
    };
  };
  const withWindow = async (local, session, fn) => {
    const previous = globalThis.window;
    globalThis.window = { localStorage: makeStorage(local), sessionStorage: makeStorage(session) };
    try { return await fn(); } finally { globalThis.window = previous; }
  };

  const session = await withWindow({ access_token: 'jwt-sintetico', tenantId: SESSION.tenantId }, {}, () =>
    readDomicilioSession({ evaluate: async (fn, arg) => fn(arg) }));
  assert.equal(session.accessToken, 'jwt-sintetico');
  assert.equal(session.tenantId, SESSION.tenantId);
  assert.equal(session.origem, 'access_token');

  const nested = await withWindow({ 'oidc.user:https://sso.cloud.pje.jus.br/realms/pje': JSON.stringify({ access_token: 'jwt-aninhado' }) }, {}, () =>
    readDomicilioSession({ evaluate: async (fn, arg) => fn(arg) }));
  assert.equal(nested.accessToken, 'jwt-aninhado', 'Token aninhado em JSON também é reconhecido.');

  const empty = await withWindow({}, {}, () => readDomicilioSession({ evaluate: async (fn, arg) => fn(arg) }));
  assert.equal(empty, null);

  const semTenant = await withWindow({ access_token: 'jwt-sintetico' }, {}, async () => {
    const probed = [];
    const resolved = await resolveDomicilioSession(
      { evaluate: async (fn, arg) => fn(arg) },
      {
        client: {
          getJson: async (sessionValue, pathname) => {
            probed.push(pathname);
            if (pathname.endsWith('/representantes/me')) return { tenant: { id: SESSION.tenantId } };
            throw new Error('não encontrado');
          }
        }
      }
    );
    assert.deepEqual(probed, ['/api/v1/usuarios/me', '/api/v1/representantes/me']);
    return resolved;
  });
  assert.equal(semTenant.tenantId, SESSION.tenantId);
  assert.match(semTenant.origem, /representantes\/me$/);

  const semTenantSemEndpoint = await withWindow({ access_token: 'jwt-sintetico' }, {}, () =>
    resolveDomicilioSession({ evaluate: async (fn, arg) => fn(arg) }, { client: { getJson: async () => ({}) } }));
  assert.equal(semTenantSemEndpoint, null, 'Sem tenant confirmado não há sessão utilizável.');
  console.log('  ✓ Token/tenant lidos apenas do storage/probe GET, sem log e com falha fechada.');
}

console.log('[C9] Janela de captura: 7 dias na primeira vez, 2 dias nos ciclos...');
{
  const primeira = captureWindow({ now: new Date('2026-09-21T10:00:00Z'), primeiraCaptura: true });
  assert.deepEqual(primeira, { dataInicio: '2026-09-15', dataFim: '2026-09-21', days: 7, primeiraCaptura: true });
  const rotina = captureWindow({ now: new Date('2026-09-21T10:00:00Z'), primeiraCaptura: false });
  assert.deepEqual(rotina, { dataInicio: '2026-09-20', dataFim: '2026-09-21', days: 2, primeiraCaptura: false });
  assert.throws(() => captureWindow({ now: 'data-invalida' }), TypeError);
  console.log('  ✓ Janela primeira/rotina derivada de relógio injetado.');
}

console.log('[C10] Captura: resultado honesto em sucesso, parcial e falha...');
{
  const item = { numeroComunicacao: '900', numeroProcesso: CNJ_DIGITS, tipoComunicacao: 'Intimação', dataComunicacao: '2026-09-20' };
  const ok = await captureDomicilioComunicacoes({
    client: { listarComunicacoes: async () => ({ items: [item], pages: [{ page: 0, items: 1 }], truncated: false }) },
    session: SESSION,
    now: new Date('2026-09-21T10:00:00Z')
  });
  assert.equal(ok.status, 'ok');
  assert.equal(ok.intimations.length, 1);
  assert.equal(ok.resumo.normalizadas, 1);
  assert.equal(ok.error, null);
  assert.deepEqual(ok.window.dataInicio, '2026-09-20');

  const parcial = await captureDomicilioComunicacoes({
    client: { listarComunicacoes: async () => ({ items: [item], pages: [{ page: 0, items: 1 }], truncated: true }) },
    session: SESSION,
    now: new Date('2026-09-21T10:00:00Z')
  });
  assert.equal(parcial.status, 'partial');
  assert.equal(parcial.error.code, 'DOMICILIO_PARTIAL');

  const falha = await captureDomicilioComunicacoes({
    client: { listarComunicacoes: async () => { throw new DomicilioError('Sessão expirada.', { code: 'DOMICILIO_UNAUTHORIZED', statusCode: 401 }); } },
    session: SESSION,
    now: new Date('2026-09-21T10:00:00Z')
  });
  assert.equal(falha.status, 'failed');
  assert.equal(falha.error.code, 'DOMICILIO_UNAUTHORIZED');
  assert.equal(falha.error.statusCode, 401);
  assert.equal(falha.intimations.length, 0);

  const semCliente = await captureDomicilioComunicacoes({ session: SESSION });
  assert.equal(semCliente.status, 'unavailable');
  assert.equal(semCliente.error.code, 'DOMICILIO_CLIENT_MISSING');
  console.log('  ✓ Sucesso, parcial e falha distinguidos; nenhum caminho presume sucesso.');
}

console.log('[C11] Adaptador do coletor: sem sessão não há rede nem falso sucesso...');
{
  const makeStorage = entries => {
    const map = new Map(Object.entries(entries));
    return {
      get length() { return map.size; },
      key: index => [...map.keys()][index] ?? null,
      getItem: key => (map.has(key) ? map.get(key) : null)
    };
  };
  const previous = globalThis.window;
  globalThis.window = { localStorage: makeStorage({ access_token: 'jwt-sintetico', tenantId: SESSION.tenantId }), sessionStorage: makeStorage({}) };
  let calls = 0;
  const client = {
    listarComunicacoes: async () => {
      calls += 1;
      return { items: [{ numeroComunicacao: '901', numeroProcesso: CNJ_DIGITS, tipoComunicacao: 'Intimação', dataComunicacao: '2026-09-20' }], pages: [{ page: 0, items: 1 }], truncated: false };
    }
  };
  const comSessao = await collectDomicilio({ evaluate: async (fn, arg) => fn(arg) }, { client, now: new Date('2026-09-21T10:00:00Z') });
  assert.equal(comSessao.status, 'ok');
  assert.equal(comSessao.intimations.length, 1);
  assert.equal(calls, 1);

  globalThis.window = { localStorage: makeStorage({}), sessionStorage: makeStorage({}) };
  const semSessao = await collectDomicilio({ evaluate: async (fn, arg) => fn(arg) }, { client, now: new Date('2026-09-21T10:00:00Z') });
  assert.equal(semSessao.status, 'sem-sessao');
  assert.equal(semSessao.error.code, 'DOMICILIO_SESSION_MISSING');
  assert.equal(calls, 1, 'Sem sessão o adaptador não chama a API oficial.');
  globalThis.window = previous;
  console.log('  ✓ Adaptador captura com sessão e falha fechado sem ela.');
}

console.log('[C12] Captura crua para o coletor e contrato do agente...');
{
  const makeStorage = entries => {
    const map = new Map(Object.entries(entries));
    return {
      get length() { return map.size; },
      key: index => [...map.keys()][index] ?? null,
      getItem: key => (map.has(key) ? map.get(key) : null)
    };
  };
  const previous = globalThis.window;
  globalThis.window = { localStorage: makeStorage({ access_token: 'jwt-sintetico', tenantId: SESSION.tenantId }), sessionStorage: makeStorage({}) };
  try {
    const item = { numeroComunicacao: 'RAW-1', numeroProcesso: CNJ_DIGITS, tipoComunicacao: 'Intimacao', dataComunicacao: '2026-09-20' };
    const ok = await captureDomicilioRaw({ evaluate: async (fn, arg) => fn(arg) }, {
      client: { listarComunicacoes: async () => ({ items: [item], pages: [{ page: 0, items: 1 }], truncated: false }) },
      dataInicio: '2026-09-20', dataFim: '2026-09-21'
    });
    assert.equal(ok.status, 'ok');
    assert.equal(ok.comunicacoes.length, 1, 'O coletor envia o DTO oficial, sem normalizar localmente.');
    assert.equal('externalId' in ok.comunicacoes[0], false, 'Normalizacao e autoridade do servidor.');
    assert.equal(ok.origem, 'access_token');

    const partial = await captureDomicilioRaw({ evaluate: async (fn, arg) => fn(arg) }, {
      client: { listarComunicacoes: async () => ({ items: [item], pages: [{ page: 0, items: 1 }], truncated: true }) },
      dataInicio: '2026-09-20', dataFim: '2026-09-21'
    });
    assert.equal(partial.status, 'partial');
    assert.equal(partial.error.code, 'DOMICILIO_PARTIAL');

    const failed = await captureDomicilioRaw({ evaluate: async (fn, arg) => fn(arg) }, {
      client: { listarComunicacoes: async () => { throw new DomicilioError('Sessao expirada.', { code: 'DOMICILIO_UNAUTHORIZED', statusCode: 401 }); } },
      dataInicio: '2026-09-20', dataFim: '2026-09-21'
    });
    assert.equal(failed.status, 'failed');
    assert.equal(failed.error.code, 'DOMICILIO_UNAUTHORIZED');

    globalThis.window = { localStorage: makeStorage({}), sessionStorage: makeStorage({}) };
    const semSessao = await captureDomicilioRaw({ evaluate: async (fn, arg) => fn(arg) }, {
      client: { listarComunicacoes: async () => { throw new Error('nao deveria chamar a rede'); } },
      dataInicio: '2026-09-20', dataFim: '2026-09-21'
    });
    assert.equal(semSessao.status, 'sem-sessao');
    assert.equal(semSessao.error.code, 'DOMICILIO_SESSION_MISSING');
  } finally {
    globalThis.window = previous;
  }

  const agentSource = await readFile(new URL('../collector/agent.mjs', import.meta.url), 'utf8');
  assert.match(agentSource, /portal\.strategy === 'domicilio'/, 'O agente do coletor precisa tratar a estrategia domicilio.');
  assert.match(agentSource, /\/api\/judicial\/domicilio\/window/, 'A janela do Domicilio e resolvida no servidor (marcador duravel).');
  assert.match(agentSource, /\/api\/judicial\/domicilio\/ingest/, 'O coletor envia os DTOs oficiais para a ingestao canonica.');
  assert.match(agentSource, /captureDomicilioRaw/, 'A captura usa o adaptador read-only.');
  assert.match(agentSource, /readDomicilioSession/, 'O login do Domicilio e reconhecido pelo token da propria sessao.');
  assert.match(agentSource, /portal\?\.strategy === 'domicilio'/, 'A deteccao de sessao trata a estrategia domicilio.');
  const portals = JSON.parse(await readFile(new URL('../collector/portals.example.json', import.meta.url), 'utf8'));
  assert.equal((portals.portals || []).some(portal => portal.id === 'domicilio-eletronico'), false, 'A captura do Domicilio roda no servidor: o catalogo do coletor nao expoe mais um portal local.');
  console.log('  OK: captura crua para o coletor, agente e portal de exemplo conferidos.');
}

console.log('\n>>> DOMICÍLIO ELETRÔNICO: PASS <<<\n');
