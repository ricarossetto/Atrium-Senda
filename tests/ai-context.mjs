import { buildRelevantOfficeContext } from '../lib/ai-context.mjs';

const processA = '0000001-11.2026.8.21.0001';
const processB = '0000002-22.2026.8.21.0002';
const state = {
  contacts: [
    { id: 'c1', name: 'Mariana Segura', document: '111.222.333-44', phone: '51999999999', email: 'segredo@example.test', city: 'Ijuí', state: 'RS' },
    { id: 'c2', name: 'Cliente Não Relacionado', document: '999.888.777-66', phone: '51888888888', email: 'outro@example.test', city: 'Porto Alegre', state: 'RS' }
  ],
  processes: [
    { id: 'p1', number: processA, client: 'Mariana Segura', opposingParty: 'Empresa Alfa', court: 'TJRS', stage: 'Contestação' },
    { id: 'p2', number: processB, client: 'Cliente Não Relacionado', opposingParty: 'Empresa Beta', court: 'TRF4', stage: 'Recurso' }
  ],
  intimations: [
    { id: 'i1', process: processA, client: 'Mariana Segura', court: 'TJRS', text: 'Teor relevante da primeira intimação.' },
    { id: 'i2', process: processB, client: 'Cliente Não Relacionado', court: 'TRF4', text: 'Teor que não pode vazar para outra consulta.' }
  ],
  tasks: [
    { id: 't1', process: processA, client: 'Mariana Segura', title: 'Preparar contestação', deadline: '2026-08-25', status: 'triagem' },
    { id: 't2', process: processB, client: 'Cliente Não Relacionado', title: 'Recurso sigiloso não relacionado', deadline: '2026-08-26', status: 'triagem' }
  ],
  agenda: []
};

const scoped = buildRelevantOfficeContext(state, {}, `Qual a situação do processo ${processA}?`);
assert(scoped.includes(processA) && scoped.includes('Preparar contestação') && scoped.includes('Teor relevante'), 'O contexto não reuniu os registros vinculados ao processo solicitado.');
assert(!scoped.includes(processB) && !scoped.includes('Recurso sigiloso') && !scoped.includes('não pode vazar'), 'O contexto incluiu dados de outro processo.');
assert(!scoped.includes('111.222.333-44') && !scoped.includes('51999999999') && !scoped.includes('segredo@example.test'), 'O contexto expôs documento, telefone ou e-mail de contato.');

const contactContext = buildRelevantOfficeContext(state, {}, 'Quais dados temos sobre a cliente Mariana Segura?');
assert(contactContext.includes('Mariana Segura') && contactContext.includes('Ijuí/RS'), 'A consulta nominal não encontrou o contato pertinente.');
assert(!contactContext.includes('111.222.333-44') && !contactContext.includes('segredo@example.test'), 'A consulta de contato transmitiu PII desnecessária.');

const selected = buildRelevantOfficeContext(state, {}, 'Resuma o caso selecionado.', { process: state.processes[0] });
assert(selected.includes(processA) && !selected.includes(processB), 'O processo selecionado não limitou corretamente o contexto.');

const unrelated = buildRelevantOfficeContext(state, {}, 'Explique o princípio da cooperação no CPC.');
assert(unrelated.includes('Nenhum registro interno foi selecionado') && !unrelated.includes('Mariana Segura'), 'Uma pergunta jurídica geral recebeu dados internos sem necessidade.');

console.log('Contexto de IA aprovado: seleção mínima, vínculo processual e exclusão de PII desnecessária.');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
