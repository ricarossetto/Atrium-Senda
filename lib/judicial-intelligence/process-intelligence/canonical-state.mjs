import { MOVEMENT_CATEGORIES } from './tpu-table.mjs';
import { classifyMovement } from './movement-classifier.mjs';

export const PROCESS_STATES = Object.freeze({
  ATIVO: 'ATIVO',
  SUSPENSO: 'SUSPENSO',
  ARQUIVADO: 'ARQUIVADO',
  BAIXADO: 'BAIXADO',
  TRANSITO_JULGADO: 'TRANSITO_JULGADO',
  CUMPRIMENTO: 'CUMPRIMENTO',
  EXECUCAO: 'EXECUCAO',
  INDETERMINADO: 'INDETERMINADO'
});

const CLASS_RULES = Object.freeze([
  { pattern: /cumprimento de sentenca|cumprimento provisorio|cumprimento definitivo/i, state: PROCESS_STATES.CUMPRIMENTO, confidence: 0.9 },
  { pattern: /\bexecucao\b|executivo fiscal|acao de execucao/i, state: PROCESS_STATES.EXECUCAO, confidence: 0.85 }
]);

const TERMINAL_RULES = Object.freeze([
  { category: MOVEMENT_CATEGORIES.TRANSITO_JULGADO, state: PROCESS_STATES.TRANSITO_JULGADO },
  { category: MOVEMENT_CATEGORIES.ARQUIVAMENTO, state: PROCESS_STATES.ARQUIVADO },
  { category: MOVEMENT_CATEGORIES.BAIXA, state: PROCESS_STATES.BAIXADO },
  { category: MOVEMENT_CATEGORIES.SUSPENSAO, state: PROCESS_STATES.SUSPENSO }
]);

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function movementDate(movement) {
  const timestamp = Date.parse(movement?.date ?? movement?.dataHora ?? movement?.data ?? '');
  return Number.isFinite(timestamp) ? timestamp : null;
}

export function deriveCanonicalState(process, { movements = null } = {}) {
  const list = movements ?? process?.movements ?? [];
  const basis = [];
  const alternatives = [];

  const classText = normalizeText(`${process?.metadata?.processClass ?? process?.processClass ?? ''} ${process?.metadata?.subject ?? process?.subject ?? ''}`);
  for (const rule of CLASS_RULES) {
    if (rule.pattern.test(classText)) {
      basis.push({ rule: `CLASS:${rule.state}`, evidence: classText.trim().slice(0, 120), confidence: rule.confidence });
      break;
    }
  }

  const ordered = list
    .map((movement, index) => ({ movement, index, at: movementDate(movement) }))
    .sort((left, right) => {
      const leftAt = left.at ?? Number.POSITIVE_INFINITY;
      const rightAt = right.at ?? Number.POSITIVE_INFINITY;
      return leftAt - rightAt || left.index - right.index;
    })
    .map(entry => entry.movement);

  let lastTerminal = null;
  ordered.forEach((movement, index) => {
    const classification = movement.classification ?? classifyMovement(movement);
    const rule = TERMINAL_RULES.find(entry => entry.category === classification.category);
    if (rule) lastTerminal = { rule, movement, index, classification };
  });

  if (lastTerminal) {
    const reopened = ordered.slice(lastTerminal.index + 1)
      .filter(movement => {
        const classification = movement.classification ?? classifyMovement(movement);
        return !TERMINAL_RULES.some(entry => entry.category === classification.category);
      });
    basis.push({
      rule: `MOVEMENT:${lastTerminal.rule.state}`,
      evidence: lastTerminal.movement.description ?? lastTerminal.movement.nome ?? null,
      confidence: lastTerminal.classification.confidence
    });
    if (reopened.length > 0) {
      alternatives.push({ state: lastTerminal.rule.state, reason: 'TERMINAL_BEFORE_LATER_MOVEMENTS' });
      basis.push({ rule: 'REOPENED_AFTER_TERMINAL', evidence: reopened[0].description ?? null, confidence: 0.5 });
      return {
        derivedState: PROCESS_STATES.ATIVO,
        confidence: 0.5,
        basis,
        alternatives,
        uncertainty: 'Movimentação posterior a evento terminal; estado declarado com baixa confiança.'
      };
    }
    return {
      derivedState: lastTerminal.rule.state,
      confidence: Number(Math.min(0.95, lastTerminal.classification.confidence).toFixed(2)),
      basis,
      alternatives
    };
  }

  const classBasis = basis.find(entry => entry.rule.startsWith('CLASS:'));
  if (classBasis) {
    return {
      derivedState: classBasis.rule.split(':')[1],
      confidence: classBasis.confidence,
      basis,
      alternatives
    };
  }

  if (ordered.length > 0) {
    basis.push({ rule: 'HAS_MOVEMENTS_WITHOUT_TERMINAL', evidence: `${ordered.length} movimentos`, confidence: 0.6 });
    return { derivedState: PROCESS_STATES.ATIVO, confidence: 0.6, basis, alternatives };
  }

  basis.push({ rule: 'NO_EVIDENCE', evidence: null, confidence: 0.3 });
  return { derivedState: PROCESS_STATES.INDETERMINADO, confidence: 0.3, basis, alternatives };
}
