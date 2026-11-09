/**
 * Área do direito por evidência objetiva: tribunal do número CNJ, parte, classe e vara.
 *
 * O modelo lê só o teor da publicação, e teor curto ("Processo distribuído para...") não diz a
 * área. Quem diz é a estrutura do processo: Justiça do Trabalho no número, INSS como parte,
 * ação penal na classe. Quando essa evidência é mais forte do que a confiança do modelo, ela
 * vence. Sem evidência, nada muda. É classificação de organização: não cria prazo nem ato.
 */
function normalize(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

const STRUCTURE_RULES = Object.freeze([
  { area: 'tributario', confidence: 0.93, pattern: /execucao fiscal|fazenda nacional|\biptu\b|imposto predial|\bicms\b|\bitbi\b|\bipva\b/, reason: 'classe ou tributo indicados no processo' },
  { area: 'previdenciario', confidence: 0.94, pattern: /instituto nacional do seguro social|\binss\b/, reason: 'INSS como parte' },
  { area: 'criminal', confidence: 0.92, pattern: /acao penal|vara criminal|juizado especial criminal|habeas corpus|inquerito policial|execucao penal|\bvara do juri\b/, reason: 'classe ou vara criminal' },
  { area: 'fazenda', confidence: 0.88, pattern: /fazenda publica/, reason: 'Fazenda Pública na classe ou na vara' },
  { area: 'trabalhista', confidence: 0.9, pattern: /vara do trabalho|\breclamante\b|\breclamad[oa]\b/, reason: 'vara ou partes trabalhistas' },
  { area: 'previdenciario', confidence: 0.86, pattern: /aposentadoria|auxilio[- ]doenca|auxilio por incapacidade|beneficio por incapacidade|\bbpc\b|\bloas\b/, reason: 'benefício previdenciário no processo' }
]);

function cnjJusticeSegment(value) {
  const digits = String(value ?? '').replace(/\D/g, '');
  return digits.length === 20 ? digits[13] : '';
}

export function deriveAreaEvidence({ record = {}, process = null } = {}) {
  const source = normalize(`${record.source || ''} ${record.id || ''} ${record.type || ''}`);
  if (/\binpi\b|\brpi\b/.test(source)) return { area: 'marcas', confidence: 0.98, reason: 'publicação do INPI' };
  const number = record.process || record.processNumber || process?.number;
  const segment = cnjJusticeSegment(number);
  if (segment === '5') return { area: 'trabalhista', confidence: 0.97, reason: 'Justiça do Trabalho no número do processo' };
  if (segment === '7' || segment === '9') return { area: 'criminal', confidence: 0.9, reason: 'Justiça Militar no número do processo' };

  const structure = normalize([
    record.parties, record.court, record.title, record.client, record.opposingParty, record.actionType, record.className,
    process?.client, process?.opposingParty, process?.actionType, process?.actionClass, process?.title, process?.court,
    process?.courtUnit, process?.subject, process?.parties
  ].filter(Boolean).join(' | '));
  for (const rule of STRUCTURE_RULES) {
    if (rule.pattern.test(structure)) return { area: rule.area, confidence: rule.confidence, reason: rule.reason };
  }
  // No teor só valem sinais inequívocos: citar "aposentadoria" de passagem não define a área.
  const body = normalize(record.text || record.sourceText || record.fullText || '').slice(0, 4000);
  for (const rule of STRUCTURE_RULES.slice(0, 3)) {
    if (rule.pattern.test(body)) return { area: rule.area, confidence: Math.min(rule.confidence, 0.87), reason: `${rule.reason}, no teor` };
  }
  return null;
}

/**
 * Corrige a área de uma sugestão já guardada, sem chamar o modelo de novo. Correção humana
 * é aplicada depois desta etapa e continua vencendo.
 */
export function applyAreaEvidence(entry, evidence) {
  if (!entry || !evidence) return entry;
  const current = Number(entry.areaConfidence) || 0;
  if (entry.area === evidence.area) {
    if (current >= evidence.confidence) return entry;
    return { ...entry, areaConfidence: evidence.confidence, areaSource: 'evidencia', action: entry.action === 'abstain' ? 'review' : entry.action };
  }
  if (current >= evidence.confidence) return entry;
  return {
    ...entry,
    area: evidence.area,
    areaConfidence: evidence.confidence,
    areaSource: 'evidencia',
    action: entry.action === 'abstain' ? 'review' : entry.action,
    reason: evidence.reason
  };
}
