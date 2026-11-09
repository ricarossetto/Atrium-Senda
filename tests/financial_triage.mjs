import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  normalizeFinancialTriageStore,
  upsertFinancialTriageEntry,
  pruneFinancialTriageStore,
  financialTriageTargets,
  financialTriagePending,
  financialTriageKey,
  financialTriageText,
  collectFinancialRecords,
  isFinancialBucket,
  FINANCIAL_BUCKETS,
  FINANCIAL_TRIAGE_LIMIT,
  FINANCIAL_TRIAGE_BATCH_LIMIT
} from '../lib/financial/financial-triage-suggestions.mjs';
import { getJevSchema } from '../lib/jev-beta/schemas.mjs';
import { serverSourceText } from './server-source.mjs';

console.log('--- Iniciando Testes Unitários: Triagem assistiva do financeiro (F5) ---');

// A) Buckets são os do produto e o esquema casa exatamente -------------------------------
{
  const schema = getJevSchema('financial_triage');
  const question = schema.questions.find(item => item.key === 'bucket');
  assert.ok(question, 'esquema finance_triage traz a pergunta bucket');
  assert.deepEqual(
    [...question.labels].sort(),
    FINANCIAL_BUCKETS.map(bucket => bucket.key).sort(),
    'rótulos do esquema casam com os buckets do produto'
  );
  assert.equal(isFinancialBucket('honorarios'), true);
  assert.equal(isFinancialBucket('categoria-inventada'), false);
  console.log('  OK: buckets do produto e esquema finance_triage alinhados.');
}

// B) Store derivado: normaliza, poda e limita --------------------------------------------
{
  const store = normalizeFinancialTriageStore({
    entries: {
      'e-1': { bucket: 'custas', bucketConfidence: 0.91, action: 'suggest', payloadHash: 'h1', at: '2026-09-29T10:00:00.000Z' },
      'e-2': { bucket: 'inventado', bucketConfidence: 2, action: 'suggest' },
      'e-3': null
    }
  });
  assert.equal(store.entries['e-1'].bucket, 'custas');
  assert.equal(store.entries['e-2'].bucket, '', 'bucket fora da lista é descartado');
  assert.equal(store.entries['e-3'], undefined, 'entrada nula não entra');

  let cheio = normalizeFinancialTriageStore(null);
  for (let index = 0; index < FINANCIAL_TRIAGE_LIMIT + 5; index += 1) {
    cheio = upsertFinancialTriageEntry(cheio, `e-${index}`, { bucket: 'outros', at: `2026-09-29T${String(index % 24).padStart(2, '0')}:00:00.000Z` });
  }
  assert.equal(Object.keys(cheio.entries).length, FINANCIAL_TRIAGE_LIMIT, 'store respeita o teto de 500');

  const podado = pruneFinancialTriageStore(cheio, Object.keys(cheio.entries).slice(0, 2));
  assert.equal(Object.keys(podado.entries).length, 2, 'poda remove lançamento que saiu da carteira');
  assert.ok(podado.removed >= 1);
  console.log('  OK: derivado normaliza, poda e respeita o teto.');
}

// C) Elegibilidade e alvo: descrição livre, id estável, hash controla reclassificação ------
{
  const records = [
    { id: 'x1', description: 'Custas de distribuição', kind: 'despesa', process: '5000001-11.2026.8.21.0001' },
    { id: 'x2', description: '', kind: 'despesa' },
    { description: 'Honorários contratuais', kind: 'parcela', editKey: 'sem-id-3' },
    { id: '', description: 'Sem id nenhum', kind: 'despesa' }
  ];
  const hashOf = text => `h-${text.length}`;
  const alvos = financialTriageTargets({ records, store: null, hashOf });
  assert.deepEqual(alvos.map(alvo => alvo.id), ['x1', 'sem-id-3'], 'só entra lançamento com id e descrição');
  assert.equal(alvos[1].id, 'sem-id-3', 'sem id oficial, usa a chave de edição da UI');
  assert.match(financialTriageText(records[0]), /Custas de distribuição/, 'texto leva a descrição');
  assert.doesNotMatch(financialTriageText(records[0]), /cliente/i, 'texto não carrega cliente');
  assert.equal(financialTriageKey(records[0]), 'x1');
  assert.equal(financialTriageKey({ editKey: 'abc' }), 'abc');

  const store = upsertFinancialTriageEntry(null, 'x1', { bucket: 'custas', payloadHash: alvos[0].hash, action: 'suggest' });
  assert.equal(financialTriagePending({ records, store, hashOf }).some(item => item.id === 'x1'), false, 'mesmo hash não reclassifica');
  assert.equal(financialTriageTargets({ records, store, hashOf, limit: 1 }).length, 1, 'lote respeita o teto');
  assert.ok(FINANCIAL_TRIAGE_BATCH_LIMIT >= 50, 'lote do produto é de 50 por invocação');
  console.log('  OK: alvo, texto (sem cliente) e reclassificação por hash validados.');
}

// D) Coleta do estado consolidado: processos, contatos e despesas do escritório ---------------
{
  const state = {
    processes: [{
      id: 'p1', number: '5000001-11.2026.8.21.0001',
      expenses: [{ id: 'd1', description: 'Custas de distribuição', amount: 120 }],
      receipts: [{ id: 'r1', description: 'Honorários recebidos', amount: 900 }],
      feeInstallments: [{ id: 'f1', description: 'Parcela 2/6', amount: 500 }]
    }],
    contacts: [{ id: 'c1', name: 'Cliente Teste', expenses: [{ id: 'd2', description: 'Diligência de oficial', amount: 80 }] }],
    officeExpenses: [{ id: 'o1', description: 'Assinatura de software', amount: 199 }]
  };
  const registros = collectFinancialRecords(state);
  assert.deepEqual(
    registros.map(item => item.id).sort(),
    ['d1', 'd2', 'f1', 'o1', 'r1'],
    'coleta despesas, parcelas, recebimentos e despesas do escritório'
  );
  const despesa = registros.find(item => item.id === 'd1');
  assert.equal(despesa.kind, 'despesa');
  assert.equal(despesa.process, '5000001-11.2026.8.21.0001', 'processo vinculado entra como contexto');
  assert.equal(registros.find(item => item.id === 'o1').process, 'Escritório');
  assert.equal(JSON.stringify(registros).includes('Cliente Teste'), false, 'nome do cliente nunca entra na coleta');
  console.log('  OK: coleta do estado espelha a carteira sem carregar nome de cliente.');
}

// E) Contrato das rotas, do servidor e da UI ----------------------------------------------
{
  const routes = readFileSync(new URL('../lib/http/ai-classifier-routes.mjs', import.meta.url), 'utf8');
  assert.match(routes, /url\.pathname === '\/api\/ai-classifier\/financial-suggestions'/, 'rota de leitura registrada');
  assert.match(routes, /url\.pathname === '\/api\/ai-classifier\/triage-financial'/, 'rota de lote registrada');
  const inicioBloco = routes.indexOf('if (isFinancialTriage) {');
  assert.ok(inicioBloco > 0, 'bloco do lote financeiro existe');
  const blocoTriage = routes.slice(inicioBloco, inicioBloco + 900);
  assert.match(blocoTriage, /assertAuthenticated\(req, true\)/, 'lote exige sessão e CSRF');
  assert.match(blocoTriage, /enforceSuggestRateLimit\(req\)/, 'lote respeita rate limit');
  assert.match(blocoTriage, /runFinancialTriage\(\{ ids, limit, session:/, 'lote executa a triagem com ids/limite/sessão');
  assert.match(routes, /collectFinancialRecords\(state\)/, 'leitura usa a coleta oficial da carteira');
  assert.match(routes, /runFinancialTriage/, 'lote disponível para o hook pós-sync');

  const server = serverSourceText;
  assert.match(server, /financialTriageStore: \{ read: readFinancialTriageStore, write: saveFinancialTriageStore \}/, 'store derivado ligado no servidor');
  assert.match(server, /financial-triage\.json/, 'arquivo derivado dedicado');
  assert.match(server, /runFinancialTriage\(\{ limit: FINANCIAL_TRIAGE_BATCH_LIMIT \}\)/, 'hook pós-sync roda a triagem financeira');

  const presenter = readFileSync(new URL('../js/views/ui-v2/financial-presenter.js', import.meta.url), 'utf8');
  assert.match(presenter, /financial-bucket-chip/, 'selo renderizado no desktop e no mobile');
  assert.match(presenter, /Sugestão de conferência do classificador/, 'selo explica que é sugestão');
  assert.doesNotMatch(presenter, /record\.category\s*=/, 'sugestão nunca grava categoria no registro');

  const feature = readFileSync(new URL('../js/features/financial.js', import.meta.url), 'utf8');
  assert.match(feature, /'\/api\/ai-classifier\/financial-suggestions'/, 'feature lê o derivado');
  assert.match(feature, /'\/api\/ai-classifier\/triage-financial'/, 'feature dispara o lote');
  assert.match(feature, /financialFilter === 'sugestao'/, 'filtro "Com sugestão" existe');

  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /data-fin-filter="sugestao"/, 'filtro presente na toolbar');
  assert.match(html, /id="financialSuggestButton"/, 'ação de sugerir presente na toolbar');

  const spec = readFileSync(new URL('../specs/financial-entries.md', import.meta.url), 'utf8');
  assert.match(spec, /financeira assistida|financial_triage|triagem assistiva/i, 'spec registra a triagem assistiva');
  console.log('  OK: rotas, servidor, spec e UI usam a triagem financeira sem gravar no lançamento.');
}

console.log('\n[PASS] Triagem financeira (F5) validada.');
