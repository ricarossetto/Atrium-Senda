import { buildCitationRegistry, evaluateCitationReview } from './citation-registry.mjs';

const REQUEST_RE = /(?:pedidos?|requer(?:imento|o|e)|requeiro|pleitei[ao]|postula|ante o exposto)/i;

function hardGate(status, findings = [], blocking = false) {
  return { status, findings, blocking };
}

export function evaluateQualityGates({
  draft = '',
  intent = {},
  plan = {},
  documents = [],
  research = {},
  message = '',
  options = {}
} = {}) {
  const text = String(draft || '');
  const modules = Array.isArray(plan.modules) ? plan.modules : [];
  const findingsByGate = {};

  const criticalDocuments = intent?.needs?.criticalDocuments || [];
  const presentKinds = new Set(documents.map(document => document.kind).filter(Boolean));
  const missingDocuments = criticalDocuments.filter(item => !presentKinds.has(item.kind));
  findingsByGate.documental = missingDocuments.length
    ? hardGate('FAIL', missingDocuments.map(item => `Documento crítico ausente para a peça: ${item.label}.`), true)
    : hardGate('PASS');

  findingsByGate.legal = modules.length
    ? hardGate('PASS')
    : hardGate('FAIL', ['Nenhum módulo jurídico foi roteado para a geração.'], true);

  // Grounding de citações: o registro por referência é a autoridade única do
  // gate jurisprudencial (mesma lógica usada pela revisão final da minuta).
  const citationRegistry = options.citationRegistry || buildCitationRegistry({ draft: text, documents, message, research });
  const citationReview = evaluateCitationReview(citationRegistry);
  const citations = citationRegistry.entries;
  if (citationReview.status === 'FAIL') {
    findingsByGate.jurisprudencial = hardGate('FAIL', citationReview.blockers.slice(0, 12).map(blocker => (
      blocker.status === 'conflict'
        ? `Conflito entre o rascunho e as fontes fornecidas: ${blocker.raw}.`
        : `Referência específica sem verificação nem marcador de conferência: ${blocker.raw}.`
    )), true);
  } else if (citations.length) {
    const findings = [`${citations.length} referência(s) específica(s) exigem conferência humana em fonte oficial antes do protocolo.`];
    const pendingCount = citationReview.warnings.filter(warning => warning.status === 'pending').length;
    if (pendingCount) findings.push(`${pendingCount} referência(s) marcadas pelo próprio rascunho para conferência.`);
    findingsByGate.jurisprudencial = hardGate('PASS_WITH_WARNINGS', findings);
  } else {
    findingsByGate.jurisprudencial = hardGate('PASS');
  }

  const logicalFindings = [];
  if (text.length < 400) logicalFindings.push('Minuta com extensão insuficiente para revisão lógica confiável.');
  const logicalStatus = text.length < 400 ? 'FAIL' : 'PASS';
  findingsByGate.logical = hardGate(logicalStatus, logicalFindings, logicalStatus === 'FAIL');

  const processualFindings = [];
  if (intent.pieceType && intent.confidence < 0.65) processualFindings.push('Tipo de peça identificado com baixa confiança; confirmar antes de protocolizar.');
  if (!intent.pieceType) processualFindings.push('Tipo de peça não identificado; o roteamento foi conservador.');
  findingsByGate.processual = processualFindings.length ? hardGate('PASS_WITH_WARNINGS', processualFindings) : hardGate('PASS');

  const hasAdversarialModule = modules.some(module => ['legal-audit', 'tese-juridica-validator'].includes(module.id));
  findingsByGate.adversarial = hasAdversarialModule
    ? hardGate('PASS_WITH_WARNINGS', ['Revisão adversarial automática aplicada; revisão humana final permanece obrigatória.'])
    : hardGate('PASS_WITH_WARNINGS', ['Módulo de auditoria adversarial não foi incluído no contexto desta geração.']);

  findingsByGate.pedidos = intent.pieceType && !REQUEST_RE.test(text)
    ? hardGate('PASS_WITH_WARNINGS', ['Não foi localizado bloco de pedidos/requerimentos explícito na resposta.'])
    : hardGate('PASS');

  const draftProcessNumbers = text.match(/\b\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}\b/g) || [];
  const knownNumbers = new Set([
    ...((String(message || '').match(/\b\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}\b/g)) || []),
    ...documents.flatMap(document => String(document.text || '').match(/\b\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}\b/g) || [])
  ]);
  const unknownNumbers = [...new Set(draftProcessNumbers.filter(number => !knownNumbers.has(number)))];
  findingsByGate['data-integrity'] = unknownNumbers.length
    ? hardGate('FAIL', unknownNumbers.slice(0, 8).map(number => `Número processual não presente nas fontes fornecidas: ${number}.`), true)
    : hardGate('PASS');

  if (research.status === 'unavailable' && intent?.needs?.research) {
    findingsByGate.jurisprudencial.findings.push('Pesquisa externa indisponível; toda referência deve ser confirmada manualmente em fonte oficial.');
  }

  const gateEntries = Object.entries(findingsByGate);
  const failed = gateEntries.filter(([, gate]) => gate.status === 'FAIL');
  const warned = gateEntries.filter(([, gate]) => gate.status === 'PASS_WITH_WARNINGS');
  const status = failed.length ? 'FAIL' : warned.length ? 'PASS_WITH_WARNINGS' : 'PASS';

  const pendingInputs = [
    ...missingDocuments.map(item => `Anexar ${item.label}`),
    ...(intent.requiresConfirmation ? ['Confirmar o tipo de peça identificado automaticamente'] : []),
    ...citationReview.blockers.map(blocker => `Conferir referência: ${blocker.raw}`),
    ...(research.status === 'unavailable' && intent?.needs?.research ? ['Validar referências em fonte oficial (pesquisa externa indisponível)'] : [])
  ];

  return {
    status,
    ready: status !== 'FAIL',
    blocked: failed.some(([, gate]) => gate.blocking),
    gates: findingsByGate,
    pendingInputs,
    citationRegistry,
    citationReview,
    reviewRequired: true,
    checkedAt: options.now ? options.now() : null
  };
}
