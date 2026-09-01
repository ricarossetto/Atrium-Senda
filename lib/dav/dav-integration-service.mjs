import { randomBytes } from 'node:crypto';
import { isIP } from 'node:net';
import { lookup } from 'node:dns/promises';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

export const DAV_INTEGRATION_TYPES = Object.freeze(['webdav', 'caldav', 'carddav']);
export const DAV_MATURITY = 'experimental';

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const ALLOWED_METHODS = new Set(['OPTIONS', 'PROPFIND', 'GET', 'PUT']);

function davError(statusCode, message) {
  return Object.assign(new Error(message), { statusCode });
}

function normalizeType(value) {
  const type = String(value || '').trim().toLowerCase();
  if (!DAV_INTEGRATION_TYPES.includes(type)) throw davError(400, 'Tipo de integração DAV inválido.');
  return type;
}

function isPrivateAddress(address = '') {
  const normalized = String(address).toLowerCase().split('%')[0].replace(/^\[|\]$/g, '');
  if (isIP(normalized) === 4) {
    const [a, b, c] = normalized.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || a >= 224
      || (a === 100 && b >= 64 && b <= 127)
      || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && (b === 0 || b === 168))
      || (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100)))
      || (a === 203 && b === 0 && c === 113);
  }
  if (isIP(normalized) === 6) {
    if (normalized.startsWith('::ffff:')) return isPrivateAddress(normalized.slice(7));
    return normalized === '::' || normalized === '::1' || /^f[cd]/.test(normalized)
      || /^fe[89ab]/.test(normalized) || normalized.startsWith('2001:db8:');
  }
  return true;
}

async function readLimitedResponse(response, limit) {
  const declared = Number(response.headers.get('content-length') || 0);
  if (declared > limit) throw davError(413, 'A resposta DAV excede o limite permitido.');
  const chunks = [];
  let size = 0;
  for await (const chunk of response.body || []) {
    size += chunk.length;
    if (size > limit) throw davError(413, 'A resposta DAV excede o limite permitido.');
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

export class DavIntegrationService {
  constructor({
    dataDirectory,
    securityManager,
    fetchFn = globalThis.fetch,
    lookupFn = lookup,
    allowLocalTestEndpoints = false,
    responseLimit = 2_000_000,
    timeoutMs = 15_000,
    redirectLimit = 3
  } = {}) {
    if (!dataDirectory || !securityManager?.encrypt || !securityManager?.decrypt || typeof fetchFn !== 'function') {
      throw new Error('DavIntegrationService exige diretório, SecurityManager e fetch.');
    }
    this.file = path.join(dataDirectory, 'dav-integrations.json');
    this.dataDirectory = dataDirectory;
    this.security = securityManager;
    this.fetch = fetchFn;
    this.lookup = lookupFn;
    this.allowLocalTestEndpoints = allowLocalTestEndpoints === true;
    this.responseLimit = Math.max(1_024, Number(responseLimit) || 2_000_000);
    this.timeoutMs = Math.max(1_000, Number(timeoutMs) || 15_000);
    this.redirectLimit = Math.min(5, Math.max(0, Number(redirectLimit) || 0));
  }

  async init() {
    await mkdir(this.dataDirectory, { recursive: true });
  }

  defaultState() {
    return { version: 1, connections: {} };
  }

  async readRawState() {
    try {
      if (!existsSync(this.file)) return this.defaultState();
      const envelope = JSON.parse(await readFile(this.file, 'utf8'));
      if (envelope?.version !== 1 || envelope?.algorithm !== 'aes-256-gcm' || !envelope?.encrypted) throw new Error('envelope');
      const state = JSON.parse(this.security.decrypt(envelope.encrypted));
      return { ...this.defaultState(), ...state, connections: state?.connections || {} };
    } catch (error) {
      if (existsSync(this.file)) throw new Error('Falha ao abrir as configurações DAV cifradas.', { cause: error });
      return this.defaultState();
    }
  }

  async saveRawState(state) {
    await this.init();
    const envelope = {
      version: 1,
      algorithm: 'aes-256-gcm',
      updatedAt: new Date().toISOString(),
      encrypted: this.security.encrypt(JSON.stringify(state))
    };
    const temporary = `${this.file}.tmp-${randomBytes(6).toString('hex')}`;
    try {
      await writeFile(temporary, JSON.stringify(envelope), { encoding: 'utf8', mode: 0o600 });
      await rename(temporary, this.file);
    } catch (error) {
      await unlink(temporary).catch(() => {});
      throw error;
    }
  }

  async validateUrl(value) {
    let url;
    try { url = new URL(String(value || '').trim()); }
    catch { throw davError(400, 'Informe uma URL DAV válida.'); }
    if (url.username || url.password) throw davError(400, 'A URL DAV não pode conter credenciais embutidas.');
    const isLocalTest = this.allowLocalTestEndpoints && url.protocol === 'http:' && ['localhost', '127.0.0.1', '::1'].includes(url.hostname.replace(/^\[|\]$/g, ''));
    if (url.protocol !== 'https:' && !isLocalTest) throw davError(400, 'Integrações DAV exigem HTTPS.');
    const hostname = url.hostname.toLowerCase().replace(/\.$/, '').replace(/^\[|\]$/g, '');
    if (!hostname) throw davError(400, 'Host DAV inválido.');
    let addresses;
    try { addresses = isIP(hostname) ? [{ address: hostname }] : await this.lookup(hostname, { all: true, verbatim: true }); }
    catch { throw davError(400, 'Não foi possível resolver o host DAV.'); }
    if (!addresses.length || (!isLocalTest && addresses.some(entry => isPrivateAddress(entry.address)))) {
      throw davError(400, 'O endpoint DAV deve usar endereço público seguro.');
    }
    url.hash = '';
    return url;
  }

  async configure(typeValue, { baseUrl, username, password } = {}) {
    const type = normalizeType(typeValue);
    const url = await this.validateUrl(baseUrl);
    const normalizedUsername = String(username || '').trim();
    if (!normalizedUsername) throw davError(400, 'Informe o usuário DAV.');
    const state = await this.readRawState();
    const previous = state.connections[type];
    const effectivePassword = String(password ?? '') || previous?.password || '';
    if (!effectivePassword) throw davError(400, 'Informe a senha DAV.');
    state.connections[type] = {
      type,
      baseUrl: url.toString(),
      username: normalizedUsername,
      password: effectivePassword,
      configuredAt: previous?.configuredAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastProbeAt: null,
      lastProbeOk: null,
      lastStatus: 'configured_unverified'
    };
    await this.saveRawState(state);
    return this.getPublicStatus(type);
  }

  async getPublicStatus(typeValue) {
    const type = normalizeType(typeValue);
    const connection = (await this.readRawState()).connections[type];
    if (!connection) return { type, maturity: DAV_MATURITY, configured: false, verified: false, status: 'not_configured' };
    const url = new URL(connection.baseUrl);
    return {
      type,
      maturity: DAV_MATURITY,
      configured: true,
      verified: false,
      status: connection.lastStatus || 'configured_unverified',
      endpoint: `${url.origin}${url.pathname}`,
      usernameConfigured: Boolean(connection.username),
      lastProbeAt: connection.lastProbeAt || null,
      lastProbeOk: connection.lastProbeOk === true
    };
  }

  async probe(typeValue) {
    const type = normalizeType(typeValue);
    const state = await this.readRawState();
    const connection = state.connections[type];
    if (!connection) throw davError(400, 'Integração DAV não configurada.');
    let ok = false;
    try {
      const response = await this.request(type, '', {
        method: 'PROPFIND',
        headers: { Depth: '0', 'Content-Type': 'application/xml; charset=utf-8' },
        body: '<?xml version="1.0"?><d:propfind xmlns:d="DAV:"><d:prop><d:resourcetype/></d:prop></d:propfind>',
        expectXml: true
      });
      ok = response.status === 200 || response.status === 207;
    } catch {
      ok = false;
    }
    connection.lastProbeAt = new Date().toISOString();
    connection.lastProbeOk = ok;
    connection.lastStatus = ok ? 'endpoint_responded_unverified' : 'probe_failed';
    await this.saveRawState(state);
    return this.getPublicStatus(type);
  }

  async propfind(type, relativePath = '', { depth = '1' } = {}) {
    return this.request(type, relativePath, {
      method: 'PROPFIND',
      headers: { Depth: depth === '0' ? '0' : '1', 'Content-Type': 'application/xml; charset=utf-8' },
      body: '<?xml version="1.0"?><d:propfind xmlns:d="DAV:"><d:allprop/></d:propfind>',
      expectXml: true
    });
  }

  async getResource(type, relativePath) {
    return this.request(type, relativePath, { method: 'GET' });
  }

  async putResource(type, relativePath, binary, { contentType = 'application/octet-stream' } = {}) {
    if (!Buffer.isBuffer(binary)) throw new TypeError('Transferência DAV exige Buffer.');
    return this.request(type, relativePath, { method: 'PUT', headers: { 'Content-Type': contentType }, body: binary });
  }

  async request(typeValue, relativePath, { method = 'GET', headers = {}, body, expectXml = false } = {}) {
    const type = normalizeType(typeValue);
    const normalizedMethod = String(method).toUpperCase();
    if (!ALLOWED_METHODS.has(normalizedMethod)) throw davError(405, 'Método DAV não permitido nesta foundation.');
    const connection = (await this.readRawState()).connections[type];
    if (!connection) throw davError(400, 'Integração DAV não configurada.');
    const base = await this.validateUrl(connection.baseUrl);
    let url = await this.validateUrl(new URL(String(relativePath || '').replace(/^\/+/, ''), base).toString());
    if (url.origin !== base.origin) throw davError(400, 'Recurso DAV fora da origem configurada.');
    const authorization = `Basic ${Buffer.from(`${connection.username}:${connection.password}`, 'utf8').toString('base64')}`;

    for (let redirects = 0; redirects <= this.redirectLimit; redirects += 1) {
      let response;
      try {
        response = await this.fetch(url, {
          method: normalizedMethod,
          headers: { ...headers, Authorization: authorization, 'User-Agent': 'Atrium-Senda-DAV/1.0' },
          body,
          redirect: 'manual',
          signal: AbortSignal.timeout(this.timeoutMs)
        });
      } catch {
        throw davError(502, 'Não foi possível alcançar o endpoint DAV.');
      }
      if (REDIRECT_STATUSES.has(response.status)) {
        if (redirects === this.redirectLimit) throw davError(400, 'O endpoint DAV excedeu o limite de redirecionamentos.');
        const location = response.headers.get('location');
        if (!location) throw davError(400, 'O endpoint DAV retornou redirecionamento inválido.');
        const redirected = await this.validateUrl(new URL(location, url).toString());
        if (redirected.origin !== base.origin) throw davError(400, 'Redirecionamento DAV entre origens foi bloqueado.');
        url = redirected;
        continue;
      }
      const binary = await readLimitedResponse(response, this.responseLimit);
      if (expectXml) {
        const text = binary.toString('utf8');
        if (/<!DOCTYPE|<!ENTITY/i.test(text)) throw davError(400, 'Resposta XML DAV insegura ou não suportada.');
      }
      return { ok: response.ok, status: response.status, headers: response.headers, binary };
    }
    throw davError(502, 'Não foi possível concluir a operação DAV.');
  }
}
