import { buildRelevantOfficeContext, buildSelectedAssistantContextMessage, resolveSelectedAssistantContext } from '../lib/ai-context.mjs';

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
  agenda: [],
  documents: [{
    id: 'd1', name: 'laudo-sintetico.pdf', documentType: 'Laudo', ownerType: 'process', ownerId: 'p1',
    contentBase64: 'NAO_TRANSMITIR', metadata: { classificationStatus: 'reviewed', summary: 'Laudo cadastrado para conferência.' },
    intelligence: { ocr: { checksum: 'ocr-sintetico', supervised: true } }
  }]
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

const resolvedProcess = await resolveSelectedAssistantContext(state, { process: { id: 'p1', client: 'DADO INJETADO' } });
assert(resolvedProcess.process.client === 'Mariana Segura', 'O servidor deve resolver o ID contra o registro canônico e ignorar campos enviados pelo navegador.');
const resolvedPublication = await resolveSelectedAssistantContext(state, { intimation: { id: 'i1' } });
const publicationMessage = buildSelectedAssistantContextMessage(resolvedPublication);
assert(publicationMessage.includes('DADOS DO SISTEMA') && publicationMessage.includes('TEXTO ORIGINAL') && publicationMessage.includes('Teor relevante'), 'Publicação selecionada deve separar metadados e texto original.');

const resolvedDocument = await resolveSelectedAssistantContext(state, { document: { id: 'd1' } }, {
  loadOcrText: async checksum => checksum === 'ocr-sintetico' ? 'Texto extraído localmente para revisão humana.' : ''
});
assert(resolvedDocument.document.extractedText.includes('extraído localmente'), 'Documento selecionado deve carregar a extração local existente.');
assert(!JSON.stringify(resolvedDocument).includes('NAO_TRANSMITIR'), 'Conteúdo binário/base64 não pode integrar o contexto do Assistente.');
const documentMessage = buildSelectedAssistantContextMessage(resolvedDocument);
assert(documentMessage.includes('DADOS DO SISTEMA') && documentMessage.includes('TEXTO EXTRAÍDO'), 'Documento selecionado deve rotular a origem do texto extraído.');
const documentContext = buildRelevantOfficeContext(state, {}, 'Analise o documento selecionado.', resolvedDocument);
assert(documentContext.includes(processA) && documentContext.includes('TEXTO EXTRAÍDO'), 'Documento de processo deve carregar somente o vínculo processual relacionado.');

const resolvedContact = await resolveSelectedAssistantContext(state, { contact: { id: 'c1' } });
assert(resolvedContact.contact.name === 'Mariana Segura', 'Cliente selecionado deve ser resolvido pelo registro canônico.');
assert(!JSON.stringify(resolvedContact).includes('segredo@example.test') && !JSON.stringify(resolvedContact).includes('111.222.333-44'), 'Contexto de cliente deve minimizar PII.');
assert(buildSelectedAssistantContextMessage(resolvedContact).includes('Dados pessoais de contato foram omitidos'), 'Mensagem deve declarar a minimização dos dados pessoais.');

console.log('Contexto de IA aprovado: seleção explícita canônica, origens separadas, vínculo processual e exclusão de PII desnecessária.');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
