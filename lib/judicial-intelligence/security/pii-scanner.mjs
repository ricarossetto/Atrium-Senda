import { maskEvidence } from './secret-scanner.mjs';

export const PII_RULES = Object.freeze([
  { id: 'log-cpf', severity: 'HIGH', category: 'log-pii', pattern: /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/, description: 'CPF em linha de log.' },
  { id: 'log-cnpj', severity: 'HIGH', category: 'log-pii', pattern: /\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/, description: 'CNPJ em linha de log.' },
  { id: 'log-email', severity: 'MEDIUM', category: 'log-pii', pattern: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/, description: 'E-mail em linha de log.' },
  { id: 'log-phone', severity: 'LOW', category: 'log-pii', pattern: /(?:\+55\s?)?\(?\d{2}\)?\s?9?\d{4}[-\s]?\d{4}\b/, description: 'Telefone em linha de log.' },
  { id: 'log-cnj', severity: 'MEDIUM', category: 'log-pii', pattern: /\b\d{7}-?\d{2}\.?\d{4}\.?\d\.?\d{2}\.?\d{4}\b/, description: 'Número de processo CNJ em linha de log.' }
]);

export const LOG_CALL_PATTERN = /\b(?:console\.(?:log|error|warn|info|debug|trace)|logger?\.(?:log|error|warn|info|debug|trace|fatal))\s*\(/;

const SYNTHETIC_VALUE = /^(?:0+|[0-9]\1{5,}|12345678909|00000000000|11111111111)$/;

function looksSynthetic(raw) {
  const digits = String(raw).replace(/\D/g, '');
  if (SYNTHETIC_VALUE.test(digits)) return true;
  return /^(\d)\1+$/.test(digits);
}

const SENSITIVE_IDENTIFIER = /(?:token|senha|password|passphrase|pfx|totp|secret|cookie|credential)/i;
const BENIGN_IDENTIFIER_SUFFIX = /(?:count|path|limit|enabled|status|present|configured|expiresat|length|bytes|size|hash|fingerprint|id)$/i;

export function identifierLooksSensitive(expression) {
  const cleaned = String(expression ?? '').replace(/[^A-Za-z0-9_$.[\]]/g, '');
  if (!SENSITIVE_IDENTIFIER.test(cleaned)) return false;
  return cleaned
    .split(/[.[\]]+/)
    .filter(Boolean)
    .some(part => SENSITIVE_IDENTIFIER.test(part) && !BENIGN_IDENTIFIER_SUFFIX.test(part));
}

export function scanLogPii({ file, content, lines = null }) {
  const findings = [];
  const source = lines ?? String(content ?? '').split(/\r?\n/);
  for (let index = 0; index < source.length; index += 1) {
    const line = source[index];
    if (!line || !LOG_CALL_PATTERN.test(line)) continue;
    for (const rule of PII_RULES) {
      const match = line.match(rule.pattern);
      if (!match) continue;
      if (rule.id !== 'log-email' && looksSynthetic(match[0])) continue;
      const inTests = /(^|[\\/])tests[\\/]/.test(file) || /(^|[\\/])fixtures[\\/]/.test(file);
      findings.push({
        id: inTests ? `${rule.id}-test-fixture` : rule.id,
        severity: inTests ? 'LOW' : rule.severity,
        category: rule.category,
        file,
        line: index + 1,
        description: inTests
          ? `${rule.description} (fixture de teste; valor mascarado)`
          : rule.description,
        evidence: maskEvidence(match[0]),
        remediation: 'Registrar apenas identificadores internos ou valores mascarados; nunca PII completo em log.'
      });
    }
    const interpolations = line.match(/\$\{([^}]+)\}|\+\s*([A-Za-z_$][\w$.[\]]*)\s*\+/g) ?? [];
    const sensitiveInterpolation = interpolations.find(fragment => {
      const inner = fragment.replace(/^\$\{|\}$/g, '').replace(/^\+\s*|\s*\+$/g, '');
      return identifierLooksSensitive(inner);
    });
    if (sensitiveInterpolation) {
      findings.push({
        id: 'log-sensitive-field',
        severity: 'MEDIUM',
        category: 'log-secret',
        file,
        line: index + 1,
        description: 'Log interpola campo potencialmente sensível.',
        evidence: maskEvidence(sensitiveInterpolation),
        remediation: 'Nunca interpolar token/senha/PFX/TOTP/cookie em log; usar apenas presença/estado.'
      });
    }
  }
  return findings;
}
