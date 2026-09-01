import { createHash, randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

export const DOCUMENT_STORAGE_PROVIDER_METHODS = Object.freeze([
  'put', 'get', 'exists', 'delete', 'metadata', 'health'
]);

function httpError(statusCode, message) {
  return Object.assign(new Error(message), { statusCode });
}

export function assertDocumentStorageProvider(provider) {
  if (!provider || typeof provider !== 'object') {
    throw new TypeError('Provider de armazenamento documental não informado.');
  }
  const missing = DOCUMENT_STORAGE_PROVIDER_METHODS.filter(method => typeof provider[method] !== 'function');
  if (missing.length) throw new TypeError(`Provider documental incompleto: ${missing.join(', ')}.`);
  return provider;
}

export class EncryptedLocalDocumentStorageProvider {
  constructor({ dataDirectory, securityManager } = {}) {
    if (!dataDirectory || !securityManager?.encrypt || !securityManager?.decrypt) {
      throw new Error('EncryptedLocalDocumentStorageProvider exige diretório de dados e SecurityManager.');
    }
    this.directory = path.join(dataDirectory, 'documents', 'blobs');
    this.security = securityManager;
  }

  async init() {
    await mkdir(this.directory, { recursive: true });
    return this;
  }

  blobPath(checksum) {
    if (!/^[a-f0-9]{64}$/.test(String(checksum || ''))) throw httpError(400, 'Checksum documental inválido.');
    return path.join(this.directory, `${checksum}.json`);
  }

  async put(binary) {
    if (!Buffer.isBuffer(binary)) throw new TypeError('O provider documental aceita somente Buffer.');
    const checksum = createHash('sha256').update(binary).digest('hex');
    const target = this.blobPath(checksum);
    if (existsSync(target)) return { checksum, created: false };
    await this.init();
    const envelope = {
      version: 1,
      algorithm: 'aes-256-gcm',
      encrypted: this.security.encrypt(binary.toString('base64'))
    };
    const temporary = `${target}.tmp-${randomBytes(6).toString('hex')}`;
    try {
      await writeFile(temporary, JSON.stringify(envelope), { encoding: 'utf8', mode: 0o600 });
      await rename(temporary, target);
    } catch (error) {
      await unlink(temporary).catch(() => {});
      if (!existsSync(target)) throw error;
    }
    return { checksum, created: true };
  }

  async get(checksum) {
    let envelope;
    try {
      envelope = JSON.parse(await readFile(this.blobPath(checksum), 'utf8'));
      if (envelope?.version !== 1 || envelope?.algorithm !== 'aes-256-gcm' || !envelope?.encrypted) throw new Error('envelope');
      return Buffer.from(this.security.decrypt(envelope.encrypted), 'base64');
    } catch (error) {
      if (error?.code === 'ENOENT') throw httpError(404, 'Conteúdo documental não encontrado.');
      throw httpError(500, 'O conteúdo documental criptografado não pôde ser aberto.');
    }
  }

  async exists(checksum) {
    return existsSync(this.blobPath(checksum));
  }

  async delete(checksum) {
    try {
      await unlink(this.blobPath(checksum));
      return true;
    } catch (error) {
      if (error?.code === 'ENOENT') return false;
      throw error;
    }
  }

  async metadata(checksum) {
    const target = this.blobPath(checksum);
    try {
      const info = await stat(target);
      return {
        checksum: String(checksum),
        provider: 'encrypted-local',
        encrypted: true,
        algorithm: 'aes-256-gcm',
        size: info.size,
        updatedAt: info.mtime.toISOString()
      };
    } catch (error) {
      if (error?.code === 'ENOENT') return null;
      throw error;
    }
  }

  async health() {
    try {
      await this.init();
      await stat(this.directory);
      return { ok: true, provider: 'encrypted-local' };
    } catch {
      return { ok: false, provider: 'encrypted-local' };
    }
  }

  // Compatibility aliases for integrations that have not yet adopted the provider vocabulary.
  async read(checksum) {
    return this.get(checksum);
  }

  async remove(checksum) {
    return this.delete(checksum);
  }
}

export class DocumentBlobStore extends EncryptedLocalDocumentStorageProvider {}
