import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { HttpTransport } from '../lib/judicial-intelligence/core/http.mjs';
import { OperationRecorder } from '../lib/judicial-intelligence/core/observability.mjs';
import {
  createPdpjProvider,
  buildProcessQuery,
  detectPdpjQueryType,
  createPdpjTokenProvider,
  inspectPdpjToken
} from '../lib/judicial-intelligence/providers/pdpj/index.mjs';
import {
  compareProcessSources,
  renderComparisonReport,
  COMPARISON_CLASSIFICATION
} from '../lib/judicial-intelligence/beta/compare.mjs';

console.log('\n===============================================================');
console.log('  ATRIUM — PDPJ PROVIDER (READ-ONLY, TOKEN HUMANO EFÊMERO)');
console.log('===============================================================\n');

const CNJ = '0000665-46.2023.8.16.0080';
const CNJ_DIGITS = '00006654620238160080';

function syntheticToken({ expiresInSeconds = 3600, subject = 'advogada-teste' } = {}) {
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ sub: subject, exp: Math.floor(Date.now() / 1000) + expiresInSeconds })).toString('base64url');
  return `${header}.${payload}.assinatura-sintetica`;
}

function jsonResponse(payload, { status = 200, headers = {}, url = '' } = {}) {
  const buffer = Buffer.from(JSON.stringify(payload), 'utf8');
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: new Headers(headers),
    body: null,
    url,
    arrayBuffer: async () => buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
  };
}

function binaryResponse(buffer, { status = 200, headers = {}, url = '' } = {}) {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: new Headers(headers),
    body: null,
    url,
    arrayBuffer: async () => buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
  };
}

const searchPayload = {
  totalElements: 2,
  searchAfter: 'cursor-2',
  content: [
    {
      numeroProcesso: CNJ,
      tribunal: { sigla: 'TJRS' },
      orgaoJulgador: { nome: '1ª Vara Cível de Porto Alegre' },
      classe: { nome: 'Procedimento Comum Cível' },
      assuntos: [{ nome: 'Responsabilidade Civil' }],
      dataDistribuicao: '2023-05-10',
      nivelSigilo: 0
    },
    {
      numeroProcesso: '0000777-11.2024.8.16.0080',
      tribunal: { sigla: 'TJRS' },
      classe: { nome: 'Execução Fiscal' }
    }
  ]
};

const detailPayload = {
  numeroProcesso: CNJ,
  tribunal: { sigla: 'TJRS' },
  orgaoJulgador: { nome: '1ª Vara Cível de Porto Alegre' },
  classe: { nome: 'Procedimento Comum Cível' },
  assuntos: [{ nome: 'Responsabilidade Civil' }, { nome: 'Dano Moral' }],
  dataDistribuicao: '2023-05-10',
  nivelSigilo: 0,
  partes: [
    { nome: 'Autora Teste', polo: 'ATIVO', cpf: '000.000.000-00' },
    { nome: 'Réu Teste', polo: 'PASSIVO', cnpj: '00.000.000/0000-00' }
  ],
  movimentos: [
    { sequencia: 1, dataHora: '2023-05-10T10:00:00Z', nome: 'Distribuição', codigoNacional: 26 },
    { sequencia: 2, dataHora: '2023-06-01T12:30:00Z', nome: 'Intimação', codigoNacional: 87 }
  ],
  documentos: [
    { id: 'doc-1', sequencia: 1, data: '2023-05-10', tipo: 'Petição Inicial', paginas: 12, mimeType: 'application/pdf', tamanho: 2048 }
  ]
};

const communicationsPayload = {
  items: [
    {
      id: 'com-1',
      numeroProcesso: CNJ,
      tipoComunicacao: 'Intimação',
      dataDisponibilizacao: '2026-01-05',
      texto: 'Texto sintético de intimação.',
      linkCertidao: 'https://pdpj.example.test/comunicacao/com-1/certidao'
    }
  ]
};

function buildClient({ handler, recorder = null, responses = {} } = {}) {
  const calls = [];
  const transport = new HttpTransport({
    policy: { hostSpacingMs: 0, maxAttempts: 1, jitterMs: 0 },
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      if (handler) return handler(url, options, calls.length - 1);
      if (String(url).includes('/documentos/doc-1/binario')) {
        return binaryResponse(Buffer.from('PDF SINTETICO'), { headers: { 'content-type': 'application/pdf' } });
      }
      if (String(url).includes('/comunicacoes')) return jsonResponse(responses.communications ?? communicationsPayload);
      if (String(url).includes('/documentos')) return jsonResponse(responses.documents ?? { content: detailPayload.documentos });
      if (String(url).includes('/v2/processos/')) return jsonResponse(responses.process ?? detailPayload);
      return jsonResponse(responses.search ?? searchPayload);
    }
  });
  return { calls, transport };
}

console.log('[P1] Flag beta desativada bloqueia a criação do provider...');
{
  assert.throws(
    () => createPdpjProvider({ env: {}, transport: buildClient().transport }),
    error => error.code === 'DISABLED' && error.humanAction.includes('BETA_PDPJ_PROVIDER')
  );
}

console.log('[P2] Token humano: ausência, expiração e leitura sem expor segredo...');
{
  const empty = createPdpjTokenProvider({ env: {} });
  assert.equal(empty.describe().present, false);
  assert.equal(empty.describe().source, 'absent');
  assert.equal(await empty.get(), null);
  const expired = createPdpjTokenProvider({ env: { PDPJ_ACCESS_TOKEN: syntheticToken({ expiresInSeconds: -10 }) } });
  await assert.rejects(() => expired.get(), error => error.code === 'UNAUTHORIZED');
  assert.equal(expired.describe().expired, true);
  const ok = syntheticToken();
  const provider = createPdpjTokenProvider({ token: ok });
  const description = provider.describe();
  assert.equal(description.present, true);
  assert.equal(description.source, 'memory');
  assert.equal(JSON.stringify(description).includes(ok), false, 'Descrição nunca contém o token.');
  assert.equal(inspectPdpjToken('nao-e-jwt').valid, false);
}

console.log('[P3] Detecção e montagem de consulta por CNJ, OAB, CPF/CNPJ e nome...');
{
  assert.equal(detectPdpjQueryType(CNJ), 'cnj');
  assert.equal(detectPdpjQueryType(CNJ_DIGITS), 'cnj');
  assert.equal(detectPdpjQueryType('12345678909'), 'documento');
  assert.equal(detectPdpjQueryType('11222333000181'), 'documento');
  assert.equal(detectPdpjQueryType('OAB/RS 12345'), 'oab');
  assert.equal(detectPdpjQueryType('Maria da Silva'), 'nome');
  assert.deepEqual(buildProcessQuery(CNJ), { type: 'cnj', params: { numeroProcesso: CNJ_DIGITS } });
  assert.deepEqual(buildProcessQuery('OAB/RS 12345'), { type: 'oab', params: { numeroOab: '12345', ufOab: 'RS' } });
  assert.deepEqual(buildProcessQuery({ oab: '99999', uf: 'pr' }), { type: 'oab', params: { numeroOab: '99999', ufOab: 'PR' } });
  assert.deepEqual(buildProcessQuery({ nome: 'Cliente Teste' }), { type: 'nome', params: { nomeParte: 'Cliente Teste' } });
  assert.deepEqual(buildProcessQuery({ documento: '000.000.000-00' }), { type: 'documento', params: { documento: '00000000000' } });
  assert.throws(() => buildProcessQuery('---'), error => error.code === 'INVALID_ARGUMENT');
}

console.log('[P4] Busca com Bearer, headers de navegador, paginação e normalização...');
{
  const { calls, transport } = buildClient();
  const recorder = new OperationRecorder();
  const provider = createPdpjProvider({
    env: { BETA_PDPJ_PROVIDER: 'true' },
    token: syntheticToken(),
    transport,
    baseUrl: 'https://pdpj.example.test',
    recorder
  });
  assert.deepEqual(provider.capabilities().sort(), [
    'COMMUNICATIONS', 'DOCUMENT_DOWNLOAD', 'DOCUMENT_LIST', 'MOVEMENTS', 'PARTIES', 'PROCESS_DETAIL', 'PROCESS_SEARCH'
  ]);
  const found = await provider.findProcesses(CNJ, { limit: 10 });
  assert.equal(found.candidates.length, 2);
  assert.equal(found.candidates[0].cnj, CNJ);
  assert.equal(found.candidates[0].court, 'TJRS');
  assert.equal(found.candidates[0].isSecret, false);
  assert.equal(found.candidates[0].provenance.source, 'PDPJ');
  assert.equal(found.searchAfter, 'cursor-2');
  assert.equal(found.total, 2);
  const firstCall = calls[0];
  assert.match(firstCall.url, /numeroProcesso=00006654620238160080/);
  assert.match(firstCall.url, /itensPorPagina=10/);
  assert.equal(firstCall.options.headers.authorization.startsWith('Bearer '), true);
  assert.match(firstCall.options.headers['user-agent'], /Mozilla/);
  const records = recorder.records();
  assert.equal(records[0].operation, 'search');
  assert.equal(records[0].status, 'ok');
  assert.equal(JSON.stringify(records).includes('Bearer'), false);
}

console.log('[P5] Respostas hostis: WAF/CAPTCHA, 401, 403, 404 e indisponibilidade...');
{
  const challenge = createPdpjProvider({
    env: { BETA_PDPJ_PROVIDER: 'true' },
    token: syntheticToken(),
    baseUrl: 'https://pdpj.example.test',
    transport: buildClient({ handler: () => jsonResponse({}, { status: 403 }) }).transport
  });
  const challengeClient = createPdpjProvider({
    env: { BETA_PDPJ_PROVIDER: 'true' },
    token: syntheticToken(),
    baseUrl: 'https://pdpj.example.test',
    transport: new HttpTransport({
      policy: { hostSpacingMs: 0, maxAttempts: 1 },
      fetchImpl: async () => jsonResponse({}, {
        status: 403,
        headers: { 'content-type': 'text/html' }
      })
    })
  });
  await assert.rejects(() => challenge.findProcesses(CNJ), error => error.code === 'HUMAN_REQUIRED' || error.code === 'FORBIDDEN');
  await assert.rejects(() => challengeClient.findProcesses(CNJ), error => error.code === 'FORBIDDEN' && Boolean(error.humanAction));

  const htmlChallenge = new HttpTransport({
    policy: { hostSpacingMs: 0, maxAttempts: 1 },
    fetchImpl: async () => {
      const buffer = Buffer.from('<html>Just a moment... cf_chl_opt</html>', 'utf8');
      return {
        status: 403,
        ok: false,
        headers: new Headers({ 'content-type': 'text/html' }),
        body: null,
        url: '',
        arrayBuffer: async () => buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
      };
    }
  });
  const wafProvider = createPdpjProvider({
    env: { BETA_PDPJ_PROVIDER: 'true' },
    token: syntheticToken(),
    baseUrl: 'https://pdpj.example.test',
    transport: htmlChallenge
  });
  await assert.rejects(() => wafProvider.findProcesses(CNJ), error => error.code === 'HUMAN_REQUIRED');

  const unauthorized = createPdpjProvider({
    env: { BETA_PDPJ_PROVIDER: 'true' },
    token: syntheticToken(),
    baseUrl: 'https://pdpj.example.test',
    transport: buildClient({ handler: () => jsonResponse({}, { status: 401 }) }).transport
  });
  await assert.rejects(() => unauthorized.getProcess(CNJ), error => error.code === 'UNAUTHORIZED' && Boolean(error.humanAction));

  const notFound = createPdpjProvider({
    env: { BETA_PDPJ_PROVIDER: 'true' },
    token: syntheticToken(),
    baseUrl: 'https://pdpj.example.test',
    transport: buildClient({ handler: () => jsonResponse({}, { status: 404 }) }).transport
  });
  await assert.rejects(() => notFound.getProcess(CNJ), error => error.code === 'NOT_FOUND');
}

console.log('[P6] Detalhe, partes, movimentos, documentos e download com checksum...');
{
  const { transport } = buildClient();
  const provider = createPdpjProvider({
    env: { BETA_PDPJ_PROVIDER: 'true' },
    token: syntheticToken(),
    transport,
    baseUrl: 'https://pdpj.example.test'
  });
  const process = await provider.getProcess(CNJ);
  assert.equal(process.metadata.judicialUnit, '1ª Vara Cível de Porto Alegre');
  assert.equal(process.metadata.subject, 'Responsabilidade Civil; Dano Moral');
  assert.equal(process.parties.length, 2);
  assert.equal(process.parties[0].document, '00000000000');
  assert.equal(process.movements.length, 2);
  assert.equal(process.movements[1].tpuCode, '87');
  const movements = await provider.listMovements(CNJ);
  assert.equal(movements.movements.length, 2);
  const listed = await provider.listDocuments(CNJ);
  assert.equal(listed.documents.length, 1);
  assert.equal(listed.documents[0].sourceId, 'doc-1');
  assert.equal(listed.documents[0].downloadStatus, 'PENDING');
  const artifact = await provider.downloadDocument('doc-1', { cnj: CNJ });
  const expected = createHash('sha256').update(Buffer.from('PDF SINTETICO')).digest('hex');
  assert.equal(artifact.sha256, expected);
  assert.equal(artifact.size, Buffer.byteLength('PDF SINTETICO'));
  assert.equal(artifact.mimeType, 'application/pdf');
  await assert.rejects(() => provider.downloadDocument('doc-1'), error => error.code === 'INVALID_ARGUMENT');
}

console.log('[P7] Comunicações normalizadas a partir do PDPJ...');
{
  const { transport } = buildClient();
  const provider = createPdpjProvider({
    env: { BETA_PDPJ_PROVIDER: 'true' },
    token: syntheticToken(),
    transport,
    baseUrl: 'https://pdpj.example.test'
  });
  const result = await provider.listCommunications({ cnj: CNJ, limit: 10 });
  assert.equal(result.communications.length, 1);
  assert.equal(result.communications[0].type, 'Intimação');
  assert.equal(result.provenance.kind, 'PUBLICATION');
}

console.log('[P8] Comparativo PJe × PDPJ × DataJud com conflito preservado...');
{
  const canonical = {
    cnj: CNJ,
    metadata: {
      cnj: CNJ,
      court: 'TJRS',
      judicialUnit: '1ª Vara Cível de Porto Alegre',
      processClass: 'Procedimento Comum Cível',
      subject: 'Responsabilidade Civil',
      distributionDate: '2023-05-10',
      isSecret: false
    },
    parties: [{ name: 'Autora Teste' }],
    movements: [{ date: '2024-01-10T10:00:00Z', description: 'Sentença' }],
    documents: []
  };
  const stale = {
    ...canonical,
    metadata: { ...canonical.metadata, distributionDate: '2023-05-09', subject: 'Dano Moral' },
    movements: [{ date: '2023-12-01T10:00:00Z', description: 'Conclusão' }]
  };
  const report = compareProcessSources({
    cnj: CNJ,
    sources: { pje: canonical, pdpj: stale, datajud: null }
  });
  assert.deepEqual(report.presence, { pje: 'PRESENT', pdpj: 'PRESENT', datajud: 'MISSING' });
  const byField = Object.fromEntries(report.fields.map(entry => [entry.field, entry]));
  assert.equal(byField.court.classification, COMPARISON_CLASSIFICATION.MATCH);
  assert.equal(byField.subject.classification, COMPARISON_CLASSIFICATION.CONFLICT);
  assert.equal(byField.movementCount.classification, COMPARISON_CLASSIFICATION.MATCH);
  assert.equal(byField.lastMovementAt.classification, COMPARISON_CLASSIFICATION.SOURCE_A_NEWER);
  assert.equal(byField.lastMovementAt.winner, 'pje');
  assert.equal(byField.documentsCount.classification, COMPARISON_CLASSIFICATION.MATCH);
  assert.equal(report.summary.CONFLICT >= 1, true);
  const markdown = renderComparisonReport(report);
  assert.match(markdown, /Comparativo de fontes/);
  assert.match(markdown, /CONFLICT/);
  assert.match(markdown, /SOURCE_A_NEWER/);
  const nulls = compareProcessSources({ cnj: CNJ, sources: { pje: null, pdpj: null } });
  assert.equal(nulls.fields.every(entry => entry.classification === COMPARISON_CLASSIFICATION.MISSING), true);
}

console.log('\n>>> PDPJ PROVIDER: PASS <<<\n');
