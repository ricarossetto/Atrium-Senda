import { assertLegalArea } from './taxonomy.mjs';

const SECRET_PATTERNS = [
  /sk-(live|test)-[A-Za-z0-9-_]{4,}/,
  /xpl_[A-Za-z0-9-_]{8,}/,
  /AIza[A-Za-z0-9-_]{10,}/,
  /-----BEGIN (?:RSA )?PRIVATE KEY-----/,
  /api[_-]?key\s*[:=]\s*['"]?[A-Za-z0-9-_]{8,}/i,
  /password\s*[:=]\s*['"]?[^'"\s]{4,}/i,
  /passwd\s*[:=]\s*['"]?[^'"\s]{4,}/i,
  /bearer\s+[A-Za-z0-9-_.]{12,}/i,
  /cookie\s*[:=]\s*['"]?[^'"\s;]{8,}/i,
  /totp\s*[:=]\s*['"]?[^'"\s]{4,}/i
];

export function assertNoSecretsInContext(value, { context = 'decision-context' } = {}) {
  const text = typeof value === 'string' ? value : JSON.stringify(value ?? '');
  for (const pattern of SECRET_PATTERNS) {
    if (pattern.test(text)) {
      const error = new Error(`Segredo detectado em ${context}; nunca enviar credenciais ao classificador.`);
      error.code = 'SECRET_DETECTED';
      throw error;
    }
  }
  return true;
}

export function buildDecisionContext({
  taskType = '',
  source = '',
  legalArea = 'outro',
  objective = '',
  evidenceSummary = '',
  constraints = [],
  stakes = 'low',
  reversibility = 'reversible',
  hasDeadlineRisk = false,
  requiresHumanReview = false,
  metadata = {}
} = {}) {
  const normalizedStakes = String(stakes || '').trim().toLowerCase();
  const normalizedReversibility = String(reversibility || '').trim().toLowerCase();
  const context = Object.freeze({
    taskType: String(taskType || '').slice(0, 120),
    source: String(source || '').slice(0, 120),
    legalArea: assertLegalArea(legalArea),
    objective: String(objective || '').slice(0, 2000),
    evidenceSummary: String(evidenceSummary || '').slice(0, 4000),
    constraints: Object.freeze((Array.isArray(constraints) ? constraints : []).map(item => String(item).slice(0, 300)).slice(0, 10)),
    stakes: normalizedStakes === 'low' ? 'low' : 'high',
    reversibility: normalizedReversibility === 'reversible' ? 'reversible' : 'irreversible',
    hasDeadlineRisk: hasDeadlineRisk === true,
    requiresHumanReview: requiresHumanReview === true,
    metadata: Object.freeze({ ...(metadata && typeof metadata === 'object' ? metadata : {}) })
  });
  assertNoSecretsInContext(context);
  return context;
}

export function contextToState(context) {
  const lines = [
    `task: ${context.taskType || '-'}`,
    `source: ${context.source || '-'}`,
    `area: ${context.legalArea}`,
    `objective: ${context.objective || '-'}`,
    `evidence: ${context.evidenceSummary || '-'}`,
    `constraints: ${(context.constraints || []).join('; ') || '-'}`,
    `stakes: ${context.stakes}; reversibility: ${context.reversibility}`,
    `flags: ${context.hasDeadlineRisk ? 'deadline-risk' : 'no-deadline-flag'}; ${context.requiresHumanReview ? 'human-review-required' : 'no-review-flag'}`
  ];
  return lines.join('\n');
}
