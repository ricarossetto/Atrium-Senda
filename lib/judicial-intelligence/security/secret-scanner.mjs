import path from 'node:path';

export const SECRET_RULES = Object.freeze([
  {
    id: 'literal-password',
    severity: 'CRITICAL',
    category: 'secret',
    pattern: /\b(?:password|senha|passphrase|secret)\s*[:=]\s*['"][^'"\s]{6,}['"]/i,
    description: 'Valor de senha/segredo literal no código.',
    remediation: 'Remover o literal, usar variável de ambiente e rotacionar o segredo exposto.'
  },
  {
    id: 'literal-api-key',
    severity: 'CRITICAL',
    category: 'secret',
    pattern: /\b(?:api[_-]?key|apikey|access[_-]?key)\s*[:=]\s*['"][A-Za-z0-9_\-]{16,}['"]/i,
    description: 'Chave de API literal no código.',
    remediation: 'Mover para variável de ambiente, restringir escopo e rotacionar a chave.'
  },
  {
    id: 'bearer-literal',
    severity: 'CRITICAL',
    category: 'secret',
    pattern: /['"]Bearer\s+[A-Za-z0-9\-._~+/]{24,}['"]/,
    description: 'Token Bearer literal no código.',
    remediation: 'Nunca embutir token; capturar em runtime e nunca persistir em Store/log.'
  },
  {
    id: 'private-key-block',
    severity: 'CRITICAL',
    category: 'secret',
    pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
    description: 'Bloco de chave privada presente em arquivo versionável.',
    remediation: 'Remover do repositório, revogar a chave e manter apenas em cofre cifrado.'
  },
  {
    id: 'jwt-literal',
    severity: 'HIGH',
    category: 'secret',
    pattern: /['"]eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}['"]/,
    description: 'JWT literal no código.',
    remediation: 'Tokens devem ser efêmeros e capturados em runtime, nunca versionados.'
  },
  {
    id: 'fallback-credential',
    severity: 'HIGH',
    category: 'secret',
    pattern: /\b[A-Z_]*(?:PASS|PASSWORD|SECRET|TOKEN|APIKEY|API_KEY)[A-Z_]*\s*\|\|\s*['"][^'"]{6,}['"]/,
    description: 'Fallback literal de credencial em expressão.',
    remediation: 'Falhar fechado quando a variável estiver ausente; nunca usar fallback embutido.'
  },
  {
    id: 'totp-secret-literal',
    severity: 'HIGH',
    category: 'secret',
    pattern: /(?:totp|otp)[_-]?secret\s*[:=]\s*['"][A-Z2-7]{16,}['"]/i,
    description: 'Segredo TOTP literal.',
    remediation: 'Segredo TOTP só em cofre cifrado; remover e reemitir o fator.'
  }
]);

export const PRIVATE_KEY_EXTENSIONS = Object.freeze(['.pfx', '.p12', '.pem', '.key', '.cer', '.crt']);

export const SCANNABLE_EXTENSIONS = Object.freeze([
  '.js', '.mjs', '.cjs', '.json', '.jsonc', '.md', '.yml', '.yaml', '.html', '.css',
  '.ps1', '.bat', '.cmd', '.sh', '.sql', '.txt', '.example', '.env'
]);

export function isScannableFile(file) {
  const normalized = String(file).replace(/\\/g, '/');
  if (/(^|\/)(data|node_modules|\.git|dist|artifacts|\.factory-reset)(\/|$)/.test(normalized)) return false;
  const lower = normalized.toLowerCase();
  if (lower.endsWith('.env') || lower.includes('.env.')) return true;
  if (PRIVATE_KEY_EXTENSIONS.includes(path.extname(lower))) return true;
  return SCANNABLE_EXTENSIONS.includes(path.extname(lower));
}

export function isPrivateKeyFile(file) {
  return PRIVATE_KEY_EXTENSIONS.includes(path.extname(String(file).toLowerCase()));
}

export function severityForPrivateKeyPath(file) {
  return /(^|[\\/])(tests|fixtures|specs)[\\/]/i.test(file) || /synthetic|fixture|sample|example/i.test(file)
    ? 'LOW'
    : 'MEDIUM';
}

export function isTestArtifact(file) {
  return /(^|[\\/])(tests|fixtures)[\\/]/.test(String(file)) || /\.(?:test|spec)\.mjs$/.test(String(file));
}

export function severityForRule(rule, file) {
  if (!isTestArtifact(file)) return rule.severity;
  if (rule.id === 'private-key-block') return 'HIGH';
  return 'LOW';
}

export function maskEvidence(match) {
  const text = String(match ?? '');
  if (text.length <= 8) return '[mascarado]';
  return `${text.slice(0, 3)}…${text.slice(-2)}`;
}

export function scanSecrets({ file, content, lines = null }) {
  const findings = [];
  const source = lines ?? String(content ?? '').split(/\r?\n/);
  if (isPrivateKeyFile(file)) {
    findings.push({
      id: 'tracked-private-key-file',
      severity: severityForPrivateKeyPath(file),
      category: 'certificate',
      file,
      line: 1,
      description: 'Arquivo de chave/certificado versionado no repositório.',
      evidence: '[arquivo binário ou chave]',
      remediation: 'Remover do versionamento; manter em cofre cifrado por workspace e usar apenas certificado sintético em teste.'
    });
    return findings;
  }
  for (let index = 0; index < source.length; index += 1) {
    const line = source[index];
    if (!line || line.length > 2000) continue;
    for (const rule of SECRET_RULES) {
      const match = line.match(rule.pattern);
      if (!match) continue;
      findings.push({
        id: isTestArtifact(file) ? `${rule.id}-test-fixture` : rule.id,
        severity: severityForRule(rule, file),
        category: rule.category,
        file,
        line: index + 1,
        description: isTestArtifact(file) ? `${rule.description} (fixture de teste; valor mascarado)` : rule.description,
        evidence: maskEvidence(match[0]),
        remediation: rule.remediation
      });
    }
  }
  return findings;
}
