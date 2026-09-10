import assert from 'node:assert/strict';
import { parseBrDateToIso, ingestEprocDownloadsIfPresent } from '../lib/judicial/eproc-downloads-ingester.mjs';

console.log('--- TESTE: INTEGRAÇÃO E SINCRONIZAÇÃO DO PAINEL DO ADVOGADO (EPROC TJRS) ---');

// 1. Validação do conversor de datas BR -> ISO
console.log('[1] Testando conversão de datas (DD/MM/YYYY -> YYYY-MM-DD)...');
assert.equal(parseBrDateToIso('25/09/2026'), '2026-09-25');
assert.equal(parseBrDateToIso('25/09/2026 23:59:59'), '2026-09-25');
assert.equal(parseBrDateToIso('08/09/2026 19:58:17'), '2026-09-08');
assert.equal(parseBrDateToIso('2026-09-25'), '2026-09-25');
assert.equal(parseBrDateToIso(null), null);
assert.equal(parseBrDateToIso(''), null);
console.log('✓ Conversão de datas validada.');

// 2. Teste de ingestão de relatórios/painel eproc baixados
console.log('[2] Testando ingestão de relatórios do painel eproc em objeto de acervo...');
const mockTarget = {
  tasks: [],
  intimations: [],
  events: [],
  processes: []
};

const result = ingestEprocDownloadsIfPresent(mockTarget);
console.log('Resultado da ingestão:', result);
assert.equal(result.ok, true);

if (!result.skipped) {
  assert.ok(mockTarget.tasks.length > 0, 'Deve ter ingerido ao menos 1 tarefa com prazo');
  assert.ok(mockTarget.intimations.length > 0, 'Deve ter ingerido ao menos 1 intimação');
  assert.ok(mockTarget.processes.length > 0, 'Deve ter cadastrado processos ausentes');

  // Valida integridade das Tarefas geradas
  for (const task of mockTarget.tasks) {
    assert.equal(task.status, 'triagem', 'Status da tarefa do eproc deve ser triagem para o Kanban');
    assert.equal(task.category, 'Prazo Judicial', 'Categoria deve ser Prazo Judicial');
    assert.equal(task.source, 'eproc TJRS', 'Fonte deve ser eproc TJRS');
    assert.match(task.deadline, /^\d{4}-\d{2}-\d{2}$/, 'Deadline deve estar no formato ISO YYYY-MM-DD');
    assert.match(task.fatalDeadline, /^\d{4}-\d{2}-\d{2}$/, 'Fatal deadline deve estar no formato ISO YYYY-MM-DD');
    assert.ok(task.process, 'Tarefa deve conter número do processo');
  }

  // Valida integridade das Intimações geradas
  for (const int of mockTarget.intimations) {
    assert.equal(int.source, 'eproc TJRS', 'Fonte da intimação deve ser eproc TJRS');
    assert.ok(int.processNumber, 'Intimação deve conter número de processo');
    assert.match(int.publishedAt || int.date, /^\d{4}-\d{2}-\d{2}$/, 'Data da intimação deve estar em formato ISO YYYY-MM-DD');
    assert.equal(int.unread, true, 'Intimação importada deve estar como não lida');
  }

  console.log(`✓ ${mockTarget.tasks.length} prazo(s) lançados em Tarefas (status: triagem, ISO dates).`);
  console.log(`✓ ${mockTarget.intimations.length} intimação(ões) geradas.`);
  console.log(`✓ ${mockTarget.processes.length} processo(s) cadastrado(s) automaticamente.`);
} else {
  console.log('ℹ Ingestão de pasta local pulada neste ambiente (pasta de downloads não presente).');
}

// 3. Teste de cálculo de dias para vencimento (evita regressão de NaN)
console.log('[3] Testando compatibilidade do prazo com o algoritmo daysUntil do portal...');
const daysUntil = value => {
  if (!value) return Infinity;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  return Math.ceil((date - today) / 86400000);
};

for (const task of mockTarget.tasks) {
  const days = daysUntil(task.deadline);
  assert.ok(!Number.isNaN(days), `daysUntil não pode resultar em NaN para ${task.deadline}`);
}
console.log('✓ daysUntil calcula corretamente todos os prazos sem NaN.');

// 4. Teste de idempotência (segunda chamada não deve duplicar tarefas nem intimações)
console.log('[4] Testando idempotência contra duplicatas...');
const initialTasksCount = mockTarget.tasks.length;
const initialIntimationsCount = mockTarget.intimations.length;
const initialProcessesCount = mockTarget.processes.length;

ingestEprocDownloadsIfPresent(mockTarget);
assert.equal(mockTarget.tasks.length, initialTasksCount, 'Não deve duplicar tarefas já existentes');
assert.equal(mockTarget.intimations.length, initialIntimationsCount, 'Não deve duplicar intimações já existentes');
assert.equal(mockTarget.processes.length, initialProcessesCount, 'Não deve duplicar processos já existentes');
console.log('✓ Idempotência confirmada: zero duplicatas geradas na re-sincronização.');

console.log('\n--- TODOS OS TESTES DO PAINEL EPROC PASSARAM COM SUCESSO! ---');
