import assert from 'node:assert/strict';
import {
  deriveEprocActLabel,
  derivePjeActLabel,
  eprocTaskTitle,
  pjeTaskTitle,
  GENERATED_SOURCE_TITLE_RE,
  LEGACY_PJE_BUCKET_TITLE_RE
} from '../lib/judicial/source-task-label.mjs';

console.log('--- Iniciando Testes: Rótulo determinístico das tarefas de prazo (sem IA) ---');

const pjeDecisao = 'Cliente Teste Decisão (54342666) Diário Eletrônico (20/10/2026 18:31) Prazo:15 dias O sistema registrou ciência em 22/10/2026 00:00 Data limite prevista para manifestação: 17/11/2026 23:59 CumSen 1003127-91.2024.8.11.0005 Valor da Execução / Cálculo / Atualização Parte Teste X Outra Parte /1ª VARA CÍVEL DE DIAMANTINO Último movimento: 26/10/2026 02:16 - Publicado Intimação em 26/10/2026.';
const pjeAcordao = 'Cliente Teste Acórdão (66338074) Diário Eletrônico (19/09/2026 10:50) Prazo:15 dias O sistema registrou ciência em 01/10/2026 00:00 Data limite prevista para manifestação: 23/10/2026 23:59 ApCiv 1001332-50.2024.8.11.0005 Cancelamento de Hipoteca Parte Teste X Outra Parte';

// [R1] Ato + expediente + classe saem do próprio texto do painel.
{
  assert.equal(derivePjeActLabel({ summary: pjeDecisao }), 'Decisão (54342666) · CumSen');
  assert.equal(derivePjeActLabel({ summary: pjeAcordao }), 'Acórdão (66338074) · ApCiv');
  console.log('  OK: PJe identifica o ato, o expediente e a classe.');
}

// [R2] Sem ato reconhecível, cai no rótulo de situação — nunca inventa um ato.
{
  assert.equal(derivePjeActLabel({ summary: 'Texto sem ato identificável', fallback: 'Pendentes de ciência ou de resposta' }), 'Pendentes de ciência ou de resposta');
  assert.equal(derivePjeActLabel({ summary: '', fallback: '' }), 'Intimação PJe');
  console.log('  OK: sem ato, o rótulo é a situação (ou o padrão), sem invenção.');
}

// [R3] Títulos PJe: mesmo esquema nos dois modos, com o ato no lugar da situação.
{
  assert.equal(pjeTaskTitle({ auto: true, summary: pjeDecisao }), 'Prazo PJe — Decisão (54342666) · CumSen');
  assert.equal(pjeTaskTitle({ auto: false, summary: pjeDecisao }), 'Conferir prazo PJe — Decisão (54342666) · CumSen');
  console.log('  OK: título PJe nomeia o ato.');
}

// [R4] eproc: a data de referência do evento é rotulada, não confundida com o prazo.
{
  assert.equal(deriveEprocActLabel({ event: '06/10/2026 00:00:00' }), 'intimação de 06/10/2026');
  assert.equal(eprocTaskTitle({ auto: true, event: '06/10/2026 00:00:00' }), 'Prazo eproc — intimação de 06/10/2026');
  assert.match(eprocTaskTitle({ auto: true, event: '06/10/2026 00:00:00' }), /^(Prazo eproc|Conferir prazo informado pelo eproc) — /);
  assert.equal(deriveEprocActLabel({ subject: 'Intimação para manifestação', event: '06/10/2026' }), 'Intimação para manifestação');
  console.log('  OK: eproc rotula a data de referência como intimação e preserva o assunto.');
}

// [R5] eproc: assunto ou evento textual continuam sendo respeitados.
{
  assert.equal(deriveEprocActLabel({ subject: 'Intimação para manifestação', event: '06/10/2026' }), 'Intimação para manifestação');
  assert.equal(deriveEprocActLabel({ event: 'Intimação pendente' }), 'Intimação pendente');
  assert.equal(deriveEprocActLabel({ event: '06/10/2026 00:00:00' }), 'intimação de 06/10/2026');
  assert.equal(deriveEprocActLabel({}), 'item pendente');
  console.log('  OK: assunto/evento textual preservados; data sem contexto é rotulada como intimação.');
}

// [R6] Modo manual do eproc mantém o prefixo de conferência.
{
  assert.equal(eprocTaskTitle({ auto: false, subject: 'Intimação para manifestação' }), 'Conferir prazo informado pelo eproc — Intimação para manifestação');
  console.log('  OK: modo manual mantém a conferência explícita.');
}

// [R7] Guardas de reescrita: só título gerado (ou antigo de situação) é atualizado.
{
  assert.match('Prazo PJe — Pendentes de ciência ou de resposta', LEGACY_PJE_BUCKET_TITLE_RE);
  assert.doesNotMatch('Prazo PJe — Decisão (54342666) · CumSen', LEGACY_PJE_BUCKET_TITLE_RE);
  assert.match('Prazo eproc — Expedida/certificada a intimação eletrônica', GENERATED_SOURCE_TITLE_RE);
  assert.doesNotMatch('Conferência do sócio', GENERATED_SOURCE_TITLE_RE);
  console.log('  OK: título editado por pessoa não é confundido com título gerado.');
}

console.log('\n[PASS] Rótulos de prazo derivados do ato, sem modelo de IA.\n');
