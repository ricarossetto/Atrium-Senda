import assert from 'node:assert/strict';
import { HttpTransport } from '../lib/judicial-intelligence/core/http.mjs';
import { createDatajudProvider } from '../lib/judicial-intelligence/providers/datajud/index.mjs';
import { resolveDatajudApiKey } from '../lib/judicial-intelligence/providers/datajud/client.mjs';
import {
  classifyMovement,
  classifyMovements,
  summarizeMovements
} from '../lib/judicial-intelligence/process-intelligence/movement-classifier.mjs';
import { MOVEMENT_CATEGORIES, TPU_TABLE_STATUS } from '../lib/judicial-intelligence/process-intelligence/tpu-table.mjs';
import { deriveCanonicalState, PROCESS_STATES } from '../lib/judicial-intelligence/process-intelligence/canonical-state.mjs';
import { mergeProcessSources, MERGE_DECISIONS } from '../lib/judicial-intelligence/process-intelligence/source-merger.mjs';
import { resolveFieldConflicts, RESOLUTION_ACTIONS } from '../lib/judicial-intelligence/process-intelligence/conflict-resolver.mjs';

console.log('\n===============================================================');
console.log('  ATRIUM — DATAJUD + PROCESS INTELLIGENCE (TPU, ESTADO, MERGE)');
console.log('===============================================================\n');

const TJRS_CNJ = '5001234-56.2023.8.21.0001';
const TJPR_CNJ = '0000665-46.2023.8.16.0080';

function jsonResponse(payload, { status = 200, headers = {} } = {}) {
  const buffer = Buffer.from(JSON.stringify(payload), 'utf8');
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: new Headers(headers),
    body: null,
    url: '',
    arrayBuffer: async () => buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
  };
}

function datajudHit() {
  return {
    hits: {
      total: { value: 1 },
      hits: [{
        _source: {
          numeroProcesso: TJRS_CNJ.replace(/\D/g, ''),
          tribunal: 'TJRS',
          dadosBasicos: {
            orgaoJulgador: { nomeOrgao: '2ª Vara Cível de Teste', municipio: 'Porto Alegre' },
            classeProcessual: { codigo: 7, nome: 'Procedimento Comum Cível' },
            assuntoPrincipal: { codigo: 10432, nome: 'Responsabilidade Civil' },
            dataDistribuicao: '2023-04-11',
            nivelSigilo: 0,
            valorCausa: 15000,
            polo: [
              { polo: 'ATIVO', parte: [{ pessoa: { nome: 'Autora Teste' }, advogado: [{ nome: 'Advogada Teste', numeroOAB: '000000', ufOAB: 'RS' }] }] },
              { polo: 'PASSIVO', parte: [{ pessoa: { nome: 'Réu Teste' } }] }
            ]
          },
          movimentos: [
            { dataHora: '2023-04-11T09:00:00Z', movimentoNacional: { codigo: 26, nome: 'Distribuição' } },
            { dataHora: '2023-05-02T10:00:00Z', nome: 'Intimação eletrônica da parte autora' },
            { dataHora: '2024-02-20T15:00:00Z', nome: 'Sentença publicada' }
          ]
        }
      }]
    }
  };
}

console.log('[I1] Classificador de movimentos: TPU primeiro, léxico depois, incerteza explícita...');
{
  assert.equal(TPU_TABLE_STATUS, 'OFFICIAL_SGT');
  const tpu = classifyMovement({ tpuCode: 26, description: 'Distribuição' });
  assert.equal(tpu.category, MOVEMENT_CATEGORIES.DISTRIBUICAO);
  assert.equal(tpu.method, 'tpu');
  assert.equal(tpu.confidence, 0.98);
  const verified = classifyMovement({ tpuCode: 999, description: 'x' }, {
    table: { 999: { code: 999, name: 'Curadoria validada', category: MOVEMENT_CATEGORIES.PERICIA, verified: true } }
  });
  assert.equal(verified.method, 'tpu');
  assert.equal(verified.confidence, 0.98);
  const unknownCode = classifyMovement({ tpuCode: 424242, description: 'Sentença homologatória' });
  assert.equal(unknownCode.method, 'lexicon');
  assert.equal(unknownCode.category, MOVEMENT_CATEGORIES.SENTENCA);
  assert.equal(unknownCode.basis.some(entry => entry.startsWith('TPU_CODE_UNKNOWN')), true);
  assert.equal(unknownCode.confidence, 0.6);
  const cases = [
    ['Trânsito em julgado da sentença', MOVEMENT_CATEGORIES.TRANSITO_JULGADO],
    ['Cumprimento de sentença iniciado', MOVEMENT_CATEGORIES.CUMPRIMENTO],
    ['Execução fiscal distribuída', MOVEMENT_CATEGORIES.EXECUCAO],
    ['Arquivamento dos autos', MOVEMENT_CATEGORIES.ARQUIVAMENTO],
    ['Baixa definitiva', MOVEMENT_CATEGORIES.BAIXA],
    ['Suspensão do processo', MOVEMENT_CATEGORIES.SUSPENSAO],
    ['Decisão interlocutória', MOVEMENT_CATEGORIES.DECISAO],
    ['Recurso de apelação interposto', MOVEMENT_CATEGORIES.RECURSO],
    ['Audiência de conciliação designada', MOVEMENT_CATEGORIES.AUDIENCIA],
    ['Perícia médica deferida', MOVEMENT_CATEGORIES.PERICIA],
    ['Citação da parte ré', MOVEMENT_CATEGORIES.CITACAO],
    ['Publicação de despacho', MOVEMENT_CATEGORIES.INTIMACAO],
    ['Distribuição por sorteio', MOVEMENT_CATEGORIES.DISTRIBUICAO]
  ];
  for (const [description, expected] of cases) {
    const result = classifyMovement({ description });
    assert.equal(result.category, expected, `${description} → ${result.category}`);
    assert.equal(result.method, 'lexicon');
  }
  const unknown = classifyMovement({ description: 'Movimento sem padrão conhecido' });
  assert.equal(unknown.category, MOVEMENT_CATEGORIES.OUTRO);
  assert.equal(unknown.method, 'none');
  assert.equal(unknown.confidence, 0.3);
  const summary = summarizeMovements([
    { tpuCode: 26, description: 'Distribuição' },
    { description: 'Sentença publicada' },
    { description: 'Evento atípico' }
  ]);
  assert.equal(summary.total, 3);
  assert.equal(summary.tpuFirst, 1);
  assert.equal(summary.lexiconFallback, 1);
  assert.equal(summary.unclassified, 1);
  assert.equal(summary.tableStatus, 'OFFICIAL_SGT');
  assert.equal(classifyMovements([{ description: 'Sentença' }])[0].classification.category, MOVEMENT_CATEGORIES.SENTENCA);
}

console.log('[I2] Estado oficial com base, confiança e incerteza preservada...');
{
  const archived = deriveCanonicalState({
    movements: [
      { date: '2024-01-10T10:00:00Z', description: 'Sentença publicada' },
      { date: '2024-03-01T10:00:00Z', description: 'Arquivamento dos autos' }
    ]
  });
  assert.equal(archived.derivedState, PROCESS_STATES.ARQUIVADO);
  assert.ok(archived.confidence >= 0.6);
  assert.equal(Array.isArray(archived.basis), true);
  assert.equal(archived.basis.some(entry => entry.rule === 'MOVEMENT:ARQUIVADO'), true);

  const transited = deriveCanonicalState({
    movements: [{ date: '2025-01-05T10:00:00Z', description: 'Trânsito em julgado' }]
  });
  assert.equal(transited.derivedState, PROCESS_STATES.TRANSITO_JULGADO);

  const reopened = deriveCanonicalState({
    movements: [
      { date: '2024-01-01T10:00:00Z', description: 'Arquivamento dos autos' },
      { date: '2024-06-01T10:00:00Z', description: 'Intimação para cumprimento' }
    ]
  });
  assert.equal(reopened.derivedState, PROCESS_STATES.ATIVO);
  assert.equal(reopened.confidence, 0.5);
  assert.equal(reopened.basis.some(entry => entry.rule === 'REOPENED_AFTER_TERMINAL'), true);
  assert.equal(reopened.alternatives[0].reason, 'TERMINAL_BEFORE_LATER_MOVEMENTS');
  assert.ok(reopened.uncertainty);

  const cumprimento = deriveCanonicalState({ metadata: { processClass: 'Cumprimento de Sentença' }, movements: [] });
  assert.equal(cumprimento.derivedState, PROCESS_STATES.CUMPRIMENTO);
  const execucao = deriveCanonicalState({ metadata: { processClass: 'Execução Fiscal' }, movements: [] });
  assert.equal(execucao.derivedState, PROCESS_STATES.EXECUCAO);
  const active = deriveCanonicalState({ movements: [{ date: '2024-01-01', description: 'Petição juntada' }] });
  assert.equal(active.derivedState, PROCESS_STATES.ATIVO);
  assert.equal(active.confidence, 0.6);
  const indeterminado = deriveCanonicalState({ movements: [] });
  assert.equal(indeterminado.derivedState, PROCESS_STATES.INDETERMINADO);
  assert.equal(indeterminado.basis[0].rule, 'NO_EVIDENCE');
}

console.log('[I3] Source merger por política de campo, sem mescla silenciosa...');
{
  const pje = {
    cnj: TJRS_CNJ.replace(/\D/g, ''),
    metadata: {
      court: 'TJRS',
      processClass: 'Procedimento Comum Cível',
      subject: 'Responsabilidade Civil',
      judicialUnit: '2ª Vara Cível de Teste',
      distributionDate: '2023-04-11',
      isSecret: false
    },
    parties: [{ name: 'Autora Teste', polo: 'ATIVO' }],
    movements: [
      { date: '2023-04-11T09:00:00Z', description: 'Distribuição', tpuCode: 26 },
      { date: '2024-02-20T15:00:00Z', description: 'Sentença publicada' }
    ],
    documents: [{ sourceId: 'pje-1', description: 'Sentença' }]
  };
  const datajud = {
    cnj: TJRS_CNJ.replace(/\D/g, ''),
    metadata: {
      court: 'TJRS',
      processClass: 'Procedimento Comum Cível',
      subject: 'Dano Moral',
      distributionDate: '2023-04-11',
      isSecret: true
    },
    parties: [{ name: 'Autora Teste', polo: 'ATIVO' }],
    movements: [
      { date: '2023-04-11T09:00:00Z', description: 'Distribuição', tpuCode: 26 },
      { date: '2024-01-10T10:00:00Z', description: 'Conclusão para sentença' }
    ],
    documents: []
  };
  const merged = mergeProcessSources({ cnj: TJRS_CNJ, sources: { pje, datajud } });
  assert.equal(merged.fields['metadata.court'].decision, MERGE_DECISIONS.CONSENSUS);
  assert.equal(merged.fields['metadata.subject'].decision, MERGE_DECISIONS.CONFLICT);
  assert.equal(merged.fields['metadata.subject'].preferredSource, 'pje');
  assert.equal(merged.fields['metadata.isSecret'].value, true);
  assert.equal(merged.fields['metadata.isSecret'].decision, MERGE_DECISIONS.MOST_RESTRICTIVE);
  assert.equal(merged.fields['metadata.distributionDate'].decision, MERGE_DECISIONS.CONSENSUS);
  assert.equal(merged.fields.movements.decision, MERGE_DECISIONS.UNION);
  assert.equal(merged.merged.movements.length, 3, 'União deduplica Distribuição e preserva os demais.');
  const distribuicao = merged.merged.movements.find(movement => movement.description === 'Distribuição');
  assert.deepEqual(distribuicao.sources.sort(), ['datajud', 'pje']);
  assert.equal(merged.conflicts.length, 1);
  assert.equal(merged.conflicts[0].field, 'metadata.subject');
  assert.equal(merged.conflicts[0].requiresHumanReview, false);

  const critical = mergeProcessSources({
    sources: {
      pje: { cnj: TJRS_CNJ.replace(/\D/g, ''), metadata: { processClass: 'Ação Penal' } },
      datajud: { cnj: TJRS_CNJ.replace(/\D/g, ''), metadata: { processClass: 'Ação Cível' } }
    }
  });
  assert.equal(critical.requiresHumanReview, true);

  const later = mergeProcessSources({
    sources: {
      pje: { metadata: { distributionDate: '2023-04-11' } },
      datajud: { metadata: { distributionDate: '2023-04-12' } }
    }
  });
  assert.equal(later.fields['metadata.distributionDate'].decision, MERGE_DECISIONS.LATEST);
  assert.equal(later.fields['metadata.distributionDate'].value, '2023-04-12');

  const resolutions = resolveFieldConflicts(merged);
  assert.equal(resolutions.requiresHumanReview, false, 'Conflito não crítico com fonte preferível não exige revisão.');
  const subject = resolutions.resolutions.find(resolution => resolution.field === 'metadata.subject');
  assert.equal(subject.action, RESOLUTION_ACTIONS.KEEP_PRIMARY);
  assert.equal(subject.chosenSource, 'pje');
  const criticalResolutions = resolveFieldConflicts(critical);
  assert.equal(criticalResolutions.requiresHumanReview, true);
  const criticalResolution = criticalResolutions.resolutions[0];
  assert.equal(criticalResolution.action, RESOLUTION_ACTIONS.NEEDS_HUMAN_REVIEW);
  assert.equal(criticalResolution.reason, 'CAMPO_JURIDICO_CRITICO');
  const nearTrust = resolveFieldConflicts({
    conflicts: [{ field: 'metadata.judicialUnit', values: { pdpj: 'Vara A', mni: 'Vara B' } }]
  });
  assert.equal(nearTrust.resolutions[0].action, RESOLUTION_ACTIONS.NEEDS_HUMAN_REVIEW);
}

console.log('[I4] Provider DataJud: alias, consulta por CNJ, identidade e movimentos com TPU...');
{
  assert.throws(
    () => createDatajudProvider({ env: {}, transport: new HttpTransport({ fetchImpl: async () => jsonResponse({}) }) }),
    error => error.code === 'DISABLED' && error.humanAction.includes('BETA_PROCESS_INTELLIGENCE')
  );

  const calls = [];
  const transport = new HttpTransport({
    policy: { hostSpacingMs: 0, maxAttempts: 1 },
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return jsonResponse(datajudHit());
    }
  });
  const provider = createDatajudProvider({
    env: { BETA_PROCESS_INTELLIGENCE: 'true' },
    apiKey: 'chave-sintetica-publica',
    transport,
    baseUrl: 'https://datajud.example.test'
  });
  assert.deepEqual(provider.capabilities().sort(), ['MOVEMENTS', 'PARTIES', 'PROCESS_DETAIL', 'PROCESS_SEARCH']);
  assert.equal(provider.resolveAlias(TJRS_CNJ), 'tjrs');
  assert.equal(provider.resolveTribunal(TJRS_CNJ), 'TJRS');
  assert.equal(provider.describeTribunal(TJRS_CNJ).segment, '8.21');
  assert.throws(() => provider.resolveAlias('123'), error => error.code === 'INVALID_ARGUMENT');

  const found = await provider.findProcesses({ cnj: TJRS_CNJ });
  assert.equal(found.candidates.length, 1);
  assert.equal(found.candidates[0].court, 'TJRS');
  assert.equal(found.candidates[0].processClass, 'Procedimento Comum Cível');
  const firstCall = calls[0];
  assert.equal(firstCall.url, 'https://datajud.example.test/api_publica_tjrs/_search');
  assert.equal(firstCall.options.headers.authorization, 'APIKey chave-sintetica-publica');
  assert.match(firstCall.options.body, /"numeroProcesso":"50012345620238210001"/);

  const process = await provider.getProcess(TJRS_CNJ);
  assert.equal(process.cnj, TJRS_CNJ.replace(/\D/g, ''));
  assert.equal(process.metadata.judicialUnit, '2ª Vara Cível de Teste');
  assert.equal(process.metadata.isSecret, false);
  assert.equal(process.movements.length, 3);
  assert.equal(process.movements[0].classification.category, MOVEMENT_CATEGORIES.DISTRIBUICAO);
  assert.equal(process.movementSummary.tpuFirst, 1);
  assert.equal(process.parties.length, 2);
  assert.equal(process.parties[0].lawyers[0].oabNumber, '000000');

  const movements = await provider.listMovements(TJRS_CNJ);
  assert.equal(movements.movements.length, 3);
  assert.equal(movements.summary.total, 3);

  const credentials = provider.client.credentialState();
  assert.equal(credentials.hasKey, true);
  assert.equal(JSON.stringify(credentials).includes('chave-sintetica-publica'), false);

  const otherTransport = new HttpTransport({
    policy: { hostSpacingMs: 0, maxAttempts: 1 },
    fetchImpl: async () => jsonResponse({ hits: { total: { value: 1 }, hits: [{ _source: { numeroProcesso: TJPR_CNJ.replace(/\D/g, '') } }] } })
  });
  const otherProvider = createDatajudProvider({
    env: { BETA_PROCESS_INTELLIGENCE: 'true' },
    apiKey: 'chave',
    transport: otherTransport,
    baseUrl: 'https://datajud.example.test'
  });
  assert.equal(await otherProvider.getProcess(TJRS_CNJ), null, 'Identidade estrita: CNJ divergente não é aceito.');

  const unauthorized = createDatajudProvider({
    env: { BETA_PROCESS_INTELLIGENCE: 'true' },
    apiKey: 'chave',
    baseUrl: 'https://datajud.example.test',
    transport: new HttpTransport({ policy: { hostSpacingMs: 0, maxAttempts: 1 }, fetchImpl: async () => jsonResponse({}, { status: 401 }) })
  });
  await assert.rejects(() => unauthorized.getProcess(TJRS_CNJ), error => error.code === 'UNAUTHORIZED' && Boolean(error.humanAction));
  assert.equal(resolveDatajudApiKey({ apiKey: '', env: {} }).length > 0, true, 'Chave pública oficial do CNJ é o fallback.');
}

console.log('\n>>> DATAJUD + PROCESS INTELLIGENCE: PASS <<<\n');
