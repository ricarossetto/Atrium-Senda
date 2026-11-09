import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { createAcquisitionProvider } from './acquisition-provider.mjs';
import { assertBetaFlagEnabled } from '../../beta/feature-flags.mjs';
import { createProvenance, SOURCE_IDS, PROVENANCE_KINDS } from '../../core/provenance.mjs';
import { JudicialIntelligenceError, JI_ERROR_CODES, humanRequiredError } from '../../core/errors.mjs';
import { sha256Hex } from '../../document-intelligence/checksum.mjs';
import { cleanCnj } from '../../../judicial/omni/contracts.mjs';

export const EPROC_STAGING_ENV = 'JI_EPROC_STAGING_DIR';
export const MAX_STAGING_FILES = 5000;

function isInside(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}

export function resolveStagingRoot({ stagingRoot = null, env = process.env } = {}) {
  const candidate = stagingRoot ?? env?.[EPROC_STAGING_ENV] ?? null;
  if (!candidate) return null;
  const resolved = path.resolve(String(candidate));
  if (!path.isAbsolute(resolved)) return null;
  return resolved;
}

export function assertSafeRelativeName(name) {
  const value = String(name ?? '');
  if (!value || value.includes('..') || path.isAbsolute(value)) {
    throw new JudicialIntelligenceError(JI_ERROR_CODES.FORBIDDEN, 'Nome de arquivo fora do staging eproc.');
  }
  return value;
}

async function findCnjFolder(root, cnjDigits) {
  const rootEntries = await readdir(root, { withFileTypes: true }).catch(() => []);
  const direct = rootEntries.find(entry => entry.isDirectory() && entry.name.replace(/\D/g, '').includes(cnjDigits));
  if (direct) return path.join(root, direct.name);
  for (const entry of rootEntries) {
    if (!entry.isDirectory()) continue;
    const parent = path.join(root, entry.name);
    const nested = (await readdir(parent, { withFileTypes: true }).catch(() => []))
      .find(child => child.isDirectory() && child.name.replace(/\D/g, '').includes(cnjDigits));
    if (nested) return path.join(parent, nested.name);
  }
  return null;
}

export function createEprocStagingProvider({ stagingRoot = null, env = process.env, allowDisabled = false } = {}) {
  if (!allowDisabled) assertBetaFlagEnabled('BETA_DOCUMENT_ACQUISITION', env);
  const root = resolveStagingRoot({ stagingRoot, env });

  return createAcquisitionProvider({
    id: 'eproc-staging',
    label: 'Eproc — staging do download A1 oficial',
    source: SOURCE_IDS.EPROC,
    notes: 'Consome, em modo leitura, os PDFs produzidos pelo fluxo A1 oficial do ATRIUM. Não autentica, não baixa e não apaga nada.',
    describeReadiness: async () => {
      if (!root) {
        return {
          ready: false,
          verificationState: 'HUMAN_REQUIRED',
          humanAction: `Defina ${EPROC_STAGING_ENV} apontando para a pasta data/storage/processos do ATRIUM e execute o download A1 pelo fluxo oficial (supervisionado) antes de rodar o beta.`
        };
      }
      try {
        await stat(root);
        return { ready: true, verificationState: 'FIXTURE_VALIDATED', humanAction: null, root: '[configurado]' };
      } catch {
        return { ready: false, verificationState: 'UNAVAILABLE', humanAction: `Diretório de staging inexistente: ajuste ${EPROC_STAGING_ENV}.` };
      }
    },
    async listDocuments(cnj) {
      if (!root) {
        throw humanRequiredError('eproc-staging', 'listDocuments',
          `Configure ${EPROC_STAGING_ENV} com a saída do download A1 oficial; o beta não autentica em seu nome.`);
      }
      const digits = cleanCnj(cnj);
      const folder = await findCnjFolder(root, digits);
      if (!folder) return [];
      const entries = await readdir(folder, { withFileTypes: true });
      const files = entries
        .filter(entry => entry.isFile() && /\.pdf$/i.test(entry.name))
        .slice(0, MAX_STAGING_FILES);
      const documents = [];
      for (const [index, entry] of files.entries()) {
        const info = await stat(path.join(folder, entry.name));
        documents.push({
          sourceId: entry.name,
          cnj,
          sequence: index + 1,
          date: null,
          type: null,
          description: entry.name.replace(/\.pdf$/i, '').replace(/[_-]+/g, ' ').trim() || null,
          pageCount: null,
          mimeType: 'application/pdf',
          size: info.size,
          sha256: null,
          source: SOURCE_IDS.EPROC,
          sourcePortal: 'staging-local',
          downloadStatus: 'PENDING'
        });
      }
      return documents;
    },
    async downloadDocument(sourceId, { cnj } = {}) {
      if (!root) {
        throw humanRequiredError('eproc-staging', 'downloadDocument',
          `Configure ${EPROC_STAGING_ENV} com a saída do download A1 oficial.`);
      }
      const digits = cleanCnj(cnj);
      const folder = await findCnjFolder(root, digits);
      if (!folder) {
        throw new JudicialIntelligenceError(JI_ERROR_CODES.NOT_FOUND, 'Pasta do processo não encontrada no staging eproc.');
      }
      const relative = assertSafeRelativeName(sourceId);
      const target = path.join(folder, relative);
      if (!isInside(folder, target)) {
        throw new JudicialIntelligenceError(JI_ERROR_CODES.FORBIDDEN, 'Caminho fora do staging eproc.');
      }
      const bytes = await readFile(target);
      return {
        bytes,
        sha256: sha256Hex(bytes),
        mimeType: 'application/pdf',
        source: SOURCE_IDS.EPROC,
        provenance: createProvenance({
          source: SOURCE_IDS.EPROC,
          sourcePortal: 'staging-local',
          kind: PROVENANCE_KINDS.AUTHENTICATED_DOCUMENT,
          queryKind: 'eproc-staging',
          confidence: 0.9,
          payload: `${digits}/${relative}`
        })
      };
    }
  });
}
