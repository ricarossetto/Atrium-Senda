import { createHash } from 'node:crypto';
import path from 'node:path';

export const DOCUMENT_OWNER_TYPES = Object.freeze(['contact', 'process']);
export const DOCUMENT_NAMING_PLACEHOLDERS = Object.freeze([
  'processo', 'cliente', 'tipo', 'data', 'tribunal', 'oab'
]);

const INVALID_FILENAME = /[<>:"/\\|?*\u0000-\u001f]/g;
const RESERVED_WINDOWS_NAME = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i;

function httpError(statusCode, message) {
  return Object.assign(new Error(message), { statusCode });
}

export function normalizeDocumentFilename(value) {
  return String(value || '').normalize('NFKC').trim().toLocaleLowerCase('pt-BR');
}

export function sanitizeDocumentFilename(value, fallback = 'documento') {
  let safe = path.basename(String(value || '').normalize('NFKC'))
    .replace(INVALID_FILENAME, '-')
    .replace(/\.{2,}/g, '.')
    .replace(/\s+/g, ' ')
    .replace(/[. ]+$/g, '')
    .trim();
  if (!safe || safe === '.' || safe === '..') safe = fallback;
  if (RESERVED_WINDOWS_NAME.test(safe)) safe = `documento-${safe}`;
  if (safe.length > 180) {
    const extension = path.extname(safe).slice(0, 20);
    safe = `${path.basename(safe, extension).slice(0, Math.max(1, 180 - extension.length))}${extension}`;
  }
  return safe;
}

export function resolveDocumentName({ template = '', originalName, values = {} } = {}) {
  const safeOriginal = sanitizeDocumentFilename(originalName, 'documento');
  const extension = path.extname(safeOriginal);
  const normalizedTemplate = String(template || '').trim();
  if (!normalizedTemplate) return safeOriginal;

  const placeholders = [...normalizedTemplate.matchAll(/\{([^{}]+)\}/g)].map(match => match[1]);
  const unsupported = placeholders.filter(name => !DOCUMENT_NAMING_PLACEHOLDERS.includes(name));
  if (unsupported.length) {
    throw httpError(400, `Placeholder de nome não suportado: {${unsupported[0]}}.`);
  }

  let rendered = normalizedTemplate.replace(/\{([^{}]+)\}/g, (_, name) => String(values[name] || '').trim());
  rendered = rendered.replace(/\s*[-–—_]\s*(?=[-–—_]|$)/g, ' ').replace(/\s{2,}/g, ' ').trim();
  if (extension && !rendered.toLocaleLowerCase('pt-BR').endsWith(extension.toLocaleLowerCase('pt-BR'))) rendered += extension;
  return sanitizeDocumentFilename(rendered, safeOriginal);
}

export function decodeDocumentPayload(base64, maxBytes = 20_000_000) {
  const encoded = String(base64 || '').trim();
  if (!encoded || !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded) || encoded.length % 4 === 1) {
    throw httpError(400, 'Conteúdo do documento inválido.');
  }
  const binary = Buffer.from(encoded, 'base64');
  if (!binary.length) throw httpError(400, 'O documento está vazio.');
  if (binary.length > maxBytes) throw httpError(413, 'O documento excede o limite de 20 MB.');
  return binary;
}

export function documentChecksum(binary) {
  return createHash('sha256').update(binary).digest('hex');
}

export function assertDocumentOwner(state, ownerType, ownerId) {
  if (!DOCUMENT_OWNER_TYPES.includes(ownerType)) throw httpError(400, 'Tipo de proprietário documental inválido.');
  const id = String(ownerId || '').trim();
  if (!id) throw httpError(400, 'Proprietário documental não informado.');
  const collection = ownerType === 'contact' ? state?.contacts : state?.processes;
  const owner = Array.isArray(collection) ? collection.find(item => item?.id === id) : null;
  if (!owner) throw httpError(404, ownerType === 'contact' ? 'Contato não encontrado.' : 'Processo não encontrado.');
  return owner;
}

export function documentNamingValues({ state, ownerType, owner, documentType, documentDate } = {}) {
  const settings = state?.settings || {};
  const process = ownerType === 'process' ? owner : null;
  const contact = ownerType === 'contact'
    ? owner
    : (state?.contacts || []).find(item => item?.id === process?.contactId)
      || (state?.contacts || []).find(item => item?.name && item.name === process?.client);
  return {
    processo: process?.number || process?.protocol || '',
    cliente: contact?.name || process?.client || '',
    tipo: String(documentType || 'documento'),
    data: String(documentDate || new Date().toISOString().slice(0, 10)),
    tribunal: process?.court || process?.tribunal || '',
    oab: settings.lawyerOab || state?.terms?.[0]?.registration || ''
  };
}

export { DocumentBlobStore } from './document-storage-provider.mjs';
