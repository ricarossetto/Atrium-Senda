import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { readdir } from 'node:fs/promises';

export const REQUIRED_GITIGNORE_PATTERNS = Object.freeze([
  { id: 'env', pattern: /^\.env(?:\*|\.\*)?$/m, description: '.env deve ser ignorado pelo Git.' },
  { id: 'data', pattern: /^data\/?$/m, description: 'data/ (estado cifrado) deve ser ignorado pelo Git.' },
  { id: 'pfx', pattern: /^\*\.pfx$/m, description: 'Certificados A1 (*.pfx) devem ser ignorados pelo Git.' },
  { id: 'key', pattern: /^\*\.key$/m, description: 'Chaves privadas (*.key) devem ser ignoradas pelo Git.' },
  { id: 'portal-preferences', pattern: /^collector\/portals\.json$/m, description: 'Portal config privado deve ser ignorado pelo Git.' }
]);

export const TEMPORARY_ARTIFACT_PATTERNS = Object.freeze([
  { id: 'tmp-suffixed', pattern: /\.tmp-\w+$/, description: 'Arquivo temporário de escrita atômica remanescente.' },
  { id: 'backup-file', pattern: /\.bak$/, description: 'Backup local de arquivo.' },
  { id: 'atrium-backup', pattern: /\.atrium-backup$/, description: 'Backup criptografado do ATRIUM.' },
  { id: 'quarantine', pattern: /^\.factory-reset$/, description: 'Diretório de quarentena de factory reset.' }
]);

export async function scanRetention({ rootDir, maxEntries = 400 }) {
  const findings = [];
  const gitignorePath = path.join(rootDir, '.gitignore');
  let gitignore = '';
  try {
    gitignore = await readFile(gitignorePath, 'utf8');
  } catch {
    findings.push({
      id: 'missing-gitignore',
      severity: 'MEDIUM',
      category: 'retention',
      file: '.gitignore',
      line: 0,
      description: '.gitignore ausente; dados locais podem ser versionados.',
      evidence: '[ausente]',
      remediation: 'Criar .gitignore cobrindo .env*, data/, certificados e perfis de coletor.'
    });
  }
  for (const requirement of REQUIRED_GITIGNORE_PATTERNS) {
    if (gitignore && !requirement.pattern.test(gitignore)) {
      findings.push({
        id: `gitignore-missing-${requirement.id}`,
        severity: 'MEDIUM',
        category: 'retention',
        file: '.gitignore',
        line: 0,
        description: requirement.description,
        evidence: '[padrão ausente]',
        remediation: 'Adicionar o padrão ao .gitignore e confirmar que nenhum arquivo sensível está rastreado.'
      });
    }
  }

  const entries = await readdir(rootDir, { withFileTypes: true }).catch(() => []);
  let inspected = 0;
  for (const entry of entries.slice(0, maxEntries)) {
    if (['node_modules', '.git', 'dist', 'artifacts'].includes(entry.name)) continue;
    inspected += 1;
    for (const pattern of TEMPORARY_ARTIFACT_PATTERNS) {
      if (pattern.pattern.test(entry.name)) {
        const ignored = gitignore && new RegExp(`^${entry.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'm').test(gitignore);
        findings.push({
          id: pattern.id,
          severity: ignored ? 'INFO' : 'LOW',
          category: 'retention',
          file: entry.name,
          line: 0,
          description: `${pattern.description}${ignored ? ' (ignorado pelo Git)' : ''}`,
          evidence: '[artefato local]',
          remediation: 'Remover artefatos temporários após o uso; manter apenas backups cifrados dentro de data/.'
        });
      }
    }
  }

  const dataDir = path.join(rootDir, 'data');
  if (existsSync(dataDir)) {
    const documentBlobs = path.join(dataDir, 'documents', 'blobs');
    if (existsSync(documentBlobs)) {
      const blobs = await readdir(documentBlobs).catch(() => []);
      findings.push({
        id: 'blob-orphan-check-manual',
        severity: 'INFO',
        category: 'retention',
        file: 'data/documents/blobs',
        line: 0,
        description: `Existem ${blobs.length} blobs cifrados locais; a referência oficial exige chave do workspace.`,
        evidence: '[contagem apenas]',
        remediation: 'Rodar auditoria de órfãos com a chave do workspace em ambiente controlado; nunca apagar blob sem checar referências.'
      });
    }
  }
  return { findings, inspected };
}
