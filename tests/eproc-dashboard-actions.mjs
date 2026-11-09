import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  parseEprocDashboardActions,
  assertJudicialActionSafe,
  executeJudicialAction
} from '../lib/judicial/eproc/parsers/dashboard-parser.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FIXTURE_PATH = path.join(__dirname, 'fixtures', 'wave_d', 'tjrs_panel.html');

async function runDashboardActionsTest() {
  console.log('=== TESTE FOCAL: EPROC DASHBOARD ACTIONS PARSER (WAVE D) ===\n');

  const html = await readFile(FIXTURE_PATH, 'utf8');
  const result = parseEprocDashboardActions(html, { portalId: 'tjrs-eproc-1g' });

  // 1. Counters
  assert.equal(result.counters.openDeadlines, 16, 'Processos com prazo em aberto deve ser 16');
  assert.equal(result.counters.urgentDeadlines, 1, 'Processos com prazo em aberto urgente deve ser 1');
  assert.equal(result.counters.pendingNotices, 3, 'Processos pendentes de citação/intimação deve ser 3');
  assert.equal(result.counters.pendingUrgentNotices, 0, 'Processos pendentes urgentes deve ser 0');
  assert.equal(result.counters.agreementNotices, 0, 'Intimações de homologação de acordo deve ser 0');
  assert.equal(result.counters.cpc334Notices, 0, 'Citações art 334 CPC deve ser 0');
  assert.equal(result.counters.elapsedDeadlines30d, 0, 'Decursos de prazo nos últimos 30 dias deve ser 0');
  assert.equal(result.counters.deadlinesExpiringToday, 1, 'Processos com prazo vencendo hoje deve ser 1');
  assert.equal(result.counters.futureHearings, 2, 'Audiências futuras deve ser 2');
  assert.equal(result.counters.futureConciliations, 0, 'Audiências futuras de conciliação deve ser 0');
  console.log('✓ 1. Contadores do painel inicial extraídos com exatidão.');

  // 2. Dynamic Actions
  const { actions } = result;
  assert.ok(actions.processReport, 'Ação Relação de Processos deve existir');
  assert.equal(actions.processReport.canonicalAction, 'relatorio_processo_procurador_listar');
  assert.ok(actions.processReport.href.includes('relatorio_processo_procurador_listar'), 'Link dinâmico da relação');

  assert.ok(actions.openDeadlines, 'Ação Processos com Prazo em Aberto deve existir');
  assert.equal(actions.openDeadlines.canonicalAction, 'citacao_intimacao_prazo_aberto_listar');
  assert.equal(actions.openDeadlines.count, 16);

  assert.ok(actions.urgentDeadlines, 'Ação Prazos Urgentes deve existir');
  assert.equal(actions.urgentDeadlines.count, 1);

  assert.ok(actions.deadlinesExpiringToday, 'Ação Prazos Vencendo Hoje deve existir');
  assert.equal(actions.deadlinesExpiringToday.count, 1);

  assert.ok(actions.futureHearings, 'Ação Audiências Futuras deve existir');
  assert.equal(actions.futureHearings.count, 2);
  console.log('✓ 2. Ações dinâmicas e endpoints operacionais descobertos sem hardcode de hashes.');

  // 3. Fallback on empty/null HTML
  const emptyRes = parseEprocDashboardActions('', { portalId: 'tjrs-eproc-2g' });
  assert.equal(emptyRes.portalId, 'tjrs-eproc-2g');
  assert.equal(Object.keys(emptyRes.actions).length, 0);
  console.log('✓ 3. Resiliência a entradas vazias confirmada.');

  // 4. READ-ONLY SAFETY GATE (P0): Discovery vs Execution
  // Proves that write-capable actions (like peticao_inicial_montar) are discovered for awareness,
  // BUT are strictly blocked from automated execution by the safety gate.
  assert.ok(actions.initialPetition, 'peticao_inicial_montar deve ser descoberta pelo parser');
  assert.equal(actions.initialPetition.isExecutable, false, 'peticao_inicial_montar NÃO PODE ser executável');
  assert.equal(actions.initialPetition.isWriteOperation, true, 'peticao_inicial_montar deve ser classificada como write operation');
  assert.equal(actions.initialPetition.safetyCategory, 'PROHIBITED_WRITE');

  // Verify that assertJudicialActionSafe throws with isScienceRisk: true for prohibited actions
  assert.throws(
    () => assertJudicialActionSafe('peticao_inicial_montar'),
    (err) => err.code === 'PROHIBITED_JUDICIAL_WRITE_OPERATION' && err.isScienceRisk === true,
    'Deve bloquear peticao_inicial_montar com isScienceRisk: true'
  );

  assert.throws(
    () => assertJudicialActionSafe('dar_ciencia'),
    (err) => err.code === 'PROHIBITED_JUDICIAL_WRITE_OPERATION' && err.isScienceRisk === true,
    'Deve bloquear dar_ciencia com isScienceRisk: true'
  );

  assert.throws(
    () => assertJudicialActionSafe('confirmar_intimacao'),
    (err) => err.code === 'PROHIBITED_JUDICIAL_WRITE_OPERATION' && err.isScienceRisk === true,
    'Deve bloquear confirmar_intimacao com isScienceRisk: true'
  );

  // 4b. DEFAULT DENY: Any unknown action not in READ_ONLY_ALLOWED_ACTIONS MUST be blocked
  assert.throws(
    () => assertJudicialActionSafe('acao_desconhecida_ou_nao_mapeada'),
    (err) => err.code === 'UNAUTHORIZED_JUDICIAL_ACTION' && err.isScienceRisk === true,
    'Deve bloquear ação desconhecida com DEFAULT DENY e isScienceRisk: true'
  );

  // 4c. EXECUTION BOUNDARY: executeJudicialAction must block BEFORE any network or page request
  let requestCalled = false;
  const mockRequestFn = async () => { requestCalled = true; };

  await assert.rejects(
    async () => executeJudicialAction('peticao_inicial_montar', { requestFn: mockRequestFn }),
    (err) => err.code === 'PROHIBITED_JUDICIAL_WRITE_OPERATION' && err.isScienceRisk === true
  );
  assert.equal(requestCalled, false, 'Requisição HTTP NUNCA pode ser chamada para peticao_inicial_montar');

  await assert.rejects(
    async () => executeJudicialAction('dar_ciencia', { requestFn: mockRequestFn }),
    (err) => err.code === 'PROHIBITED_JUDICIAL_WRITE_OPERATION' && err.isScienceRisk === true
  );
  assert.equal(requestCalled, false, 'Requisição HTTP NUNCA pode ser chamada para dar_ciencia');

  await assert.rejects(
    async () => executeJudicialAction('acao_inventada_123', { requestFn: mockRequestFn }),
    (err) => err.code === 'UNAUTHORIZED_JUDICIAL_ACTION' && err.isScienceRisk === true
  );
  assert.equal(requestCalled, false, 'Requisição HTTP NUNCA pode ser chamada para ação desconhecida');

  // Allowed read-only action must execute requestFn safely
  const allowedExec = await executeJudicialAction('relatorio_processo_procurador_listar', { requestFn: mockRequestFn });
  assert.equal(requestCalled, true, 'Ação de leitura permitida deve executar requestFn com segurança');

  // Permitted read/export actions must pass assertJudicialActionSafe
  assert.equal(assertJudicialActionSafe('relatorio_processo_procurador_listar'), true);
  assert.equal(assertJudicialActionSafe('citacao_intimacao_prazo_aberto_listar'), true);
  assert.equal(assertJudicialActionSafe('processo_seleciona_publica'), true);
  console.log('✓ 4. Trava de segurança READ-ONLY e DEFAULT DENY comprovada: petição/ciência/desconhecida bloqueadas na fronteira executiva.');

  console.log('\n>>> EPROC DASHBOARD ACTIONS TEST PASSED! <<<\n');
}

runDashboardActionsTest().catch(err => {
  console.error('Falha no teste de ações do painel:', err);
  process.exit(1);
});
