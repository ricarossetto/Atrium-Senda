/**
 * Leitura rápida da publicação e critério da fila do dia.
 *
 * O resumo é montado com o texto oficial e com a classificação que já existe.
 * Não calcula prazo, não declara ciência e não substitui a leitura do teor.
 */
import { publicationReadableText } from './html-text.js?v=3.0.2';

const DECISION_PATTERN = /(RECURSO\s+(?:DESPROVIDO|PROVIDO)|NEGO\s+PROVIMENTO|DOU\s+PROVIMENTO|JULGO\s+(?:PROCEDENTE|IMPROCEDENTE)|HOMOLOGO|DEFIRO|INDEFIRO|CONDENO|ABSOLVO|DECIDO|DECIDIU|ACORDAM|DESPROVIDO|PROVIDO)/i;

const HEADER_PATTERN = /(TIPO\s+DE\s+A[ÇC][ÃA]O|RELATOR|RECORRENTE|RECORRIDO|ADVOGADO|EMENTA|AUTOS|CLASSE|ASSUNTO|N[º°]\s*\d|PROCESSO\s+N)/i;

const PIECE_BY_CATEGORY = Object.freeze({
  'Contestação': 'Contestação',
  'Recurso': 'Recurso (apelação, agravo ou embargos, conforme o caso)',
  'Embargos de Declaração': 'Embargos de declaração',
  'Cumprimento de Sentença': 'Cumprimento de sentença',
  'Manifestação': 'Manifestação',
  'Audiência': 'Preparação para a audiência',
  'Sentença / Acórdão': 'Ciência e providência cabível',
  'Decisão Interlocutória': 'Verificar recurso ou manifestação',
  'Despacho': 'Cumprir o despacho',
  'Edital / Geral': 'Conferir o edital',
  'INPI / RPI': 'Conferir o registro de marca',
  'Publicação': 'Conferir a publicação'
});

const ACTION_BY_CATEGORY = Object.freeze({
  'Contestação': 'Analisar para contestar',
  'Recurso': 'Analisar para recorrer',
  'Embargos de Declaração': 'Analisar para opor embargos',
  'Cumprimento de Sentença': 'Conferir o cumprimento e o valor',
  'Manifestação': 'Analisar para manifestar',
  'Audiência': 'Preparar o comparecimento',
  'Sentença / Acórdão': 'Conferir a intimação e definir a providência',
  'Decisão Interlocutória': 'Verificar recurso ou manifestação',
  'Despacho': 'Cumprir o despacho',
  'Edital / Geral': 'Conferir o edital',
  'INPI / RPI': 'Conferir o registro',
  'Publicação': 'Conferir a publicação'
});

const PIECE_CATEGORIES = new Set(['Contestação', 'Recurso', 'Embargos de Declaração', 'Cumprimento de Sentença', 'Manifestação']);

const HUMAN_DEADLINE_SOURCES = new Set(['manual', 'humano', 'conferencia', 'confirmed', 'human']);

export function isHumanDeadlineSource(value) {
  return HUMAN_DEADLINE_SOURCES.has(String(value || '').toLowerCase());
}

function clip(value, maxLength) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (text.length <= maxLength) return text;
  const cut = text.slice(0, maxLength);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > maxLength * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

function sentences(value) {
  const protectedText = String(value ?? '').replace(/\b(art|arts|sr|sra|dr|dra|prof|nº|no|fl|p|pp|exm|exma|des|min)\./gi, '$1\u0000');
  return protectedText
    .replace(/([.!?])\s+/g, '$1\n')
    .split(/\n+/)
    .map(part => part.replace(/\u0000/g, '.').trim())
    .filter(Boolean);
}

function isHeaderSentence(value) {
  const text = String(value || '');
  return text.length < 320 && HEADER_PATTERN.test(text);
}

function extractWhat(value) {
  const clean = publicationReadableText(value).replace(/\s+/g, ' ').trim();
  if (!clean) return '';
  const list = sentences(clean);
  const decisionIndex = list.findIndex(sentence => DECISION_PATTERN.test(sentence));
  if (decisionIndex >= 0) {
    const sentence = list[decisionIndex];
    const match = DECISION_PATTERN.exec(sentence);
    const fromDecision = match && match.index > 0 ? sentence.slice(match.index) : sentence;
    return clip([fromDecision, list[decisionIndex + 1] || ''].filter(Boolean).join(' '), 360);
  }
  let index = 0;
  while (index < list.length - 1 && isHeaderSentence(list[index])) index += 1;
  const selected = list.slice(index, index + 2);
  if (selected.length && selected.every(isHeaderSentence)) return '';
  return clip(selected.join(' '), 360);
}

function parseDate(value) {
  const text = String(value || '').trim();
  if (!text) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    const [year, month, day] = text.split('-').map(Number);
    return new Date(year, month - 1, day);
  }
  if (/^\d{2}\/\d{2}\/\d{4}/.test(text)) {
    const [day, month, year] = text.slice(0, 10).split('/').map(Number);
    return new Date(year, month - 1, day);
  }
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function daysUntil(value, now) {
  const date = parseDate(value);
  if (!date) return null;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

function classifierFields(classifier) {
  const suggestion = classifier?.suggestion || {};
  const detail = suggestion.suggestion || classifier?.suggestion?.suggestion || {};
  const action = String(suggestion.action || classifier?.action || '');
  const priority = String(detail.priority?.label || classifier?.priority || '');
  const confidenceValue = detail.area?.confidence ?? classifier?.areaConfidence ?? suggestion.confidence;
  const confidence = Number.isFinite(Number(confidenceValue)) ? Number(confidenceValue) : null;
  const deadlineSignal = String(detail.deadline_signal?.label || classifier?.deadlineSignal || '');
  return { action, priority, confidence, deadlineSignal };
}

export function buildPublicationBrief({ item, act, classifier } = {}) {
  const category = String(act?.category || 'Publicação');
  const fields = classifierFields(classifier);
  const source = item?.fullTextSource === 'domicilio' && item?.fullText ? item.fullText : (item?.text || item?.sourceText || item?.description || '');
  const what = extractWhat(source);
  const baseAction = ACTION_BY_CATEGORY[category] || ACTION_BY_CATEGORY['Publicação'];
  const needsReview = fields.action === 'review' || fields.action === 'abstain' || !fields.action;
  const sourceIsDomicilio = String(item?.sourceReportedDeadlineSource || '').toLowerCase() === 'domicilio';
  const deadlineIsDomicilio = String(item?.deadlineSource || '').toLowerCase() === 'domicilio';
  const domicilioSource = sourceIsDomicilio || deadlineIsDomicilio;
  const humanDeadline = isHumanDeadlineSource(item?.deadlineSource);
  const hasSourceDate = Boolean(item?.deadline || item?.sourceReportedDeadlineAt);
  const actionParts = [];
  // Em publicação sem ato identificado, "conferir" já é a ação: não repete a mesma ideia.
  if (needsReview && category !== 'Publicação') actionParts.push('Conferir antes de agir');
  actionParts.push(baseAction);
  if (fields.deadlineSignal === 'sim') {
    if (humanDeadline) actionParts.push('Conferir o prazo registrado no ATRIUM');
    else if (domicilioSource) actionParts.push('Conferir a data de referência do Domicílio');
    else if (hasSourceDate) actionParts.push('Conferir o prazo informado pela fonte');
    else actionParts.push('Conferir se há prazo na fonte');
  }
  const action = `${actionParts.join('. ')}.`;
  const piece = PIECE_BY_CATEGORY[category] || PIECE_BY_CATEGORY['Publicação'];
  const pieceKind = PIECE_CATEGORIES.has(category) ? 'peca' : 'providencia';
  const tone = /urgente|alta/i.test(fields.priority) ? 'urgent' : needsReview ? 'review' : 'normal';
  return {
    what,
    action,
    piece,
    pieceIsGeneric: category === 'Publicação',
    pieceKind,
    source: fields.action ? 'Atrium IA' : 'Leitura do teor',
    confidence: fields.confidence,
    priority: fields.priority,
    deadlineSignal: fields.deadlineSignal,
    review: needsReview,
    tone,
    note: 'Leitura automática. Confira o texto e a fonte oficial. Nenhum prazo é calculado a partir do texto.'
  };
}

/**
 * Motivo para a publicação entrar na fila do dia. Devolve texto vazio quando
 * ela não atende a nenhum critério. O prazo considerado é o informado pela
 * fonte ou já confirmado por pessoa; a classificação nunca vira data.
 */
export function publicationTodayReason(item, { classifier = null, now = new Date(), windowDays = 3 } = {}) {
  const status = String(item?.treatmentStatus || 'untreated');
  if (status !== 'untreated' && status !== 'in_review') return '';
  const fields = classifierFields(classifier);
  if (item?.urgent || String(item?.priority || '') === 'urgente') return 'urgente';
  if (/alta/i.test(fields.priority)) return 'prioridade alta';
  const sourceIsDomicilio = String(item?.sourceReportedDeadlineSource || '').toLowerCase() === 'domicilio';
  const deadlineIsDomicilio = String(item?.deadlineSource || '').toLowerCase() === 'domicilio';
  const domicilioSource = sourceIsDomicilio || deadlineIsDomicilio;
  const candidates = [item?.fatalDeadline];
  if (!deadlineIsDomicilio && (!domicilioSource || isHumanDeadlineSource(item?.deadlineSource))) candidates.push(item?.deadline);
  if (!domicilioSource) candidates.push(item?.sourceReportedDeadlineAt);
  const dayValues = candidates.map(value => daysUntil(value, now)).filter(value => value !== null);
  const days = dayValues.find(value => value >= -7 && value <= windowDays);
  if (days !== undefined) {
    if (days < 0) return `vencido há ${Math.abs(days)} dia${Math.abs(days) === 1 ? '' : 's'}`;
    if (days === 0) return 'prazo hoje';
    return `prazo em ${days} dia${days === 1 ? '' : 's'}`;
  }
  if ((fields.action === 'review' || fields.action === 'abstain') && fields.confidence !== null && fields.confidence < 0.65) {
    return 'revisar';
  }
  return '';
}
