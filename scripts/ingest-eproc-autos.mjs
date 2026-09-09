import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createDecipheriv, createCipheriv, randomBytes } from 'node:crypto';
import { SecurityManager } from '../lib/security.mjs';
import { EncryptedLocalDocumentStorageProvider } from '../lib/documents/document-storage-provider.mjs';

const env = readFileSync('.env', 'utf8');
const key = env.match(/AUTH_ENCRYPTION_KEY=(.+)/)[1].trim();
const secret = env.match(/AUTH_SESSION_SECRET=(.+)/)[1].trim();

const sec = new SecurityManager({ dataDirectory: 'data', sessionSecret: secret, encryptionKey: key });
await sec.init();
const docStorage = new EncryptedLocalDocumentStorageProvider({ dataDirectory: 'data', securityManager: sec });
await docStorage.init();

// 1. Decrypt app-state.json
const envelope = JSON.parse(readFileSync('data/app-state.json', 'utf8'));
const decipher = createDecipheriv('aes-256-gcm', Buffer.from(key, 'base64'), Buffer.from(envelope.encrypted.iv, 'base64'));
decipher.setAuthTag(Buffer.from(envelope.encrypted.tag, 'base64'));
const decrypted = Buffer.concat([decipher.update(Buffer.from(envelope.encrypted.ciphertext, 'base64')), decipher.final()]);
const state = JSON.parse(decrypted.toString('utf8'));

state.processes = Array.isArray(state.processes) ? state.processes : [];
state.documents = Array.isArray(state.documents) ? state.documents : [];

const procNumber = '5036499-16.2012.8.21.0001';
const procId = 'proc-50364991620128210001';
const clientName = 'CEREALE PRODUTOS INTEGRAIS LTDA';

// Check if process already exists
let proc = state.processes.find(p => p.number === procNumber || p.id === procId);
if (!proc) {
  proc = {
    id: procId,
    number: procNumber,
    client: clientName,
    title: clientName + ' — Ação Ordinária (Autos Integrais eproc A1)',
    court: '1ª Vara Cível do Foro Central de Porto Alegre',
    judge: 'Juízo da 1ª Vara Cível',
    actionClass: 'Procedimento Comum Cível',
    competence: 'Cível',
    caseValue: 'R$ 0,00',
    distributionDate: '2012-05-15',
    status: 'ATIVO',
    source: 'eproc-tjrs',
    system: 'eproc',
    movementsCount: 22,
    movements: [],
    tags: ['eproc', 'tjrs', 'certificado-a1', 'autos-integrais'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  state.processes.unshift(proc);
  console.log('Process created:', proc.number);
} else {
  proc.client = clientName;
  console.log('Process updated:', proc.number);
}

// 2. Read all files from storage directory
const storageDir = path.join('data', 'storage', 'processos', 'CEREALE_PRODUTOS_INTEGRAIS_LTDA', '5036499-16.2012.8.21.0001');
const fileNames = readdirSync(storageDir).filter(f => f.endsWith('.pdf'));
console.log('Found PDF files on disk:', fileNames.length);

let ingestedCount = 0;
const nowIso = new Date().toISOString();

for (const name of fileNames) {
  const filePath = path.join(storageDir, name);
  const binary = readFileSync(filePath);
  const { checksum } = await docStorage.put(binary);

  // Check if document already in state
  const existingDoc = state.documents.find(d => d.ownerId === procId && d.name === name);
  if (!existingDoc) {
    const isIndice = name.startsWith('000');
    state.documents.push({
      id: 'doc-eproc-' + randomBytes(6).toString('hex'),
      name: name,
      originalName: name,
      mime: 'application/pdf',
      size: binary.length,
      createdAt: nowIso,
      updatedAt: nowIso,
      documentDate: nowIso.slice(0, 10),
      ownerType: 'process',
      ownerId: procId,
      documentType: isIndice ? 'Índice de Autos' : 'Peça Processual (eproc A1)',
      metadata: {
        origin: 'eproc TJRS (Certificado A1)',
        tags: ['eproc', 'autos', 'tjrs', 'a1'],
        localPath: filePath,
        summary: name.replace(/\.pdf$/i, ''),
        context: 'Peça oficial extraída dos autos integrais do eproc TJRS via Certificado Digital A1.'
      },
      derivation: {
        kind: 'eproc-autos-download',
        downloadedAt: nowIso
      },
      deletedAt: null,
      deletedBy: null,
      checksum
    });
    ingestedCount++;
  }
}

console.log('Ingested new documents into canonical store:', ingestedCount);
console.log('Total documents in state:', state.documents.length);

// 3. Encrypt and save app-state.json
const iv = randomBytes(12);
const cipher = createCipheriv('aes-256-gcm', Buffer.from(key, 'base64'), iv);
const ciphertext = Buffer.concat([cipher.update(Buffer.from(JSON.stringify(state), 'utf8')), cipher.final()]);
const tag = cipher.getAuthTag();
envelope.encrypted = {
  iv: iv.toString('base64'),
  tag: tag.toString('base64'),
  ciphertext: ciphertext.toString('base64')
};
envelope.updatedAt = new Date().toISOString();
writeFileSync('data/app-state.json', JSON.stringify(envelope, null, 2), 'utf8');
console.log('app-state.json updated successfully!');
