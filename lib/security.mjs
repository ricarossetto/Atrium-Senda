import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual
} from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import QRCode from 'qrcode';

const scrypt = promisify(scryptCallback);
const SESSION_MAX_AGE_MS = 8 * 60 * 60 * 1000;
const SESSION_IDLE_MS = 30 * 60 * 1000;
const SETUP_TOKEN_MS = 10 * 60 * 1000;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_FAILURES = 5;
const TRUSTED_DEVICE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

export class SecurityManager {
  constructor({ dataDirectory, sessionSecret, encryptionKey, secureCookies = false }) {
    this.file = path.join(dataDirectory, 'security.json');
    this.dataDirectory = dataDirectory;
    this.sessionSecret = Buffer.from(sessionSecret, 'base64url');
    this.encryptionKey = Buffer.from(encryptionKey, 'base64');
    if (this.sessionSecret.length < 32) throw new Error('AUTH_SESSION_SECRET deve ter ao menos 32 bytes em base64url.');
    if (this.encryptionKey.length !== 32) throw new Error('AUTH_ENCRYPTION_KEY deve conter exatamente 32 bytes em base64.');
    this.secureCookies = secureCookies;
    this.state = { configured: false };
    this.sessions = new Map();
    this.loginAttempts = new Map();
  }

  async init() {
    await mkdir(this.dataDirectory, { recursive: true });
    try { this.state = { configured: false, ...JSON.parse(await readFile(this.file, 'utf8')) }; } catch { /* primeira execução */ }
    this.state.trustedDevices = Array.isArray(this.state.trustedDevices) ? this.state.trustedDevices.filter(device => Number(device.expiresAt) > Date.now()).slice(-10) : [];
  }

  publicStatus(req) {
    const session = this.authenticate(req);
    return {
      configured: Boolean(this.state.configured),
      authenticated: Boolean(session),
      user: session ? { username: session.username, displayName: session.displayName } : null,
      csrfToken: session?.csrfToken || null,
      mfaRequired: Boolean(this.state.configured),
      trustedDevice: Boolean(this.findTrustedDevice(req))
    };
  }

  async beginSetup({ username, displayName, password }, remoteAddress) {
    if (this.state.configured) throw httpError(409, 'A autenticação já foi configurada.');
    const normalizedUsername = String(username || '').trim().toLowerCase();
    const normalizedName = String(displayName || '').trim();
    validateUsername(normalizedUsername);
    validatePassword(password);
    if (normalizedName.length < 3 || normalizedName.length > 100) throw httpError(400, 'Informe o nome do usuário responsável.');

    const salt = randomBytes(16).toString('base64');
    const passwordHash = await hashPassword(password, salt);
    const totpSecret = encodeBase32(randomBytes(20));
    const nonce = randomBytes(18).toString('base64url');
    const expiresAt = Date.now() + SETUP_TOKEN_MS;
    const issuer = 'JurisFlow Gestao Juridica';
    const account = `${issuer}:${normalizedUsername}`;
    const otpauthUrl = `otpauth://totp/${encodeURIComponent(account)}?secret=${totpSecret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;

    this.state = {
      configured: false,
      pending: {
        username: normalizedUsername,
        displayName: normalizedName,
        passwordHash,
        salt,
        encryptedTotp: this.encrypt(totpSecret),
        nonce,
        expiresAt
      }
    };
    await this.save();
    const setupToken = this.signSetupToken({ nonce, expiresAt });
    return { setupToken, manualSecret: totpSecret, qrCode: await QRCode.toDataURL(otpauthUrl, { errorCorrectionLevel: 'M', margin: 1, width: 240 }) };
  }

  async finishSetup({ setupToken, code }) {
    const pending = this.state.pending;
    if (!pending || !this.verifySetupToken(setupToken, pending)) throw httpError(401, 'A configuração expirou. Recomece o cadastro.');
    const secret = this.decrypt(pending.encryptedTotp);
    if (!verifyTotp(secret, code)) throw httpError(401, 'Código de autenticação inválido.');

    const recoveryCodes = Array.from({ length: 8 }, () => `${randomDigits(5)}-${randomDigits(5)}`);
    const recoverySalt = randomBytes(16).toString('base64');
    const recoveryHashes = recoveryCodes.map(value => hashRecovery(value, recoverySalt));
    this.state = {
      configured: true,
      username: pending.username,
      displayName: pending.displayName,
      passwordHash: pending.passwordHash,
      salt: pending.salt,
      encryptedTotp: pending.encryptedTotp,
      recoverySalt,
      recoveryHashes,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    await this.save();
    const session = this.createSession(this.state.username, this.state.displayName);
    return { ...session, recoveryCodes };
  }

  async login({ username, password, code, trustBrowser }, remoteAddress, userAgent = '') {
    const attemptKey = `${remoteAddress || 'unknown'}:${String(username || '').trim().toLowerCase()}`;
    this.assertLoginAllowed(attemptKey);
    const normalizedUsername = String(username || '').trim().toLowerCase();
    const storedSalt = this.state.salt || randomBytes(16).toString('base64');
    const suppliedHash = await hashPassword(String(password || ''), storedSalt);
    const passwordOk = Boolean(this.state.configured)
      && constantEqual(normalizedUsername, this.state.username)
      && constantEqual(suppliedHash, this.state.passwordHash);

    let secondFactorOk = false;
    if (passwordOk) {
      const cleanCode = String(code || '').replace(/\s/g, '');
      if (/^\d{6}$/.test(cleanCode)) secondFactorOk = verifyTotp(this.decrypt(this.state.encryptedTotp), cleanCode);
      else secondFactorOk = await this.consumeRecoveryCode(cleanCode);
    }

    if (!passwordOk || !secondFactorOk) {
      this.recordLoginFailure(attemptKey);
      throw httpError(401, 'Usuário, senha ou segundo fator inválido.');
    }
    this.loginAttempts.delete(attemptKey);
    const session = this.createSession(this.state.username, this.state.displayName);
    if (trustBrowser === true || /^(?:true|on|1)$/i.test(String(trustBrowser || ''))) session.trustedToken = await this.createTrustedDevice(userAgent);
    return session;
  }

  authenticate(req) {
    this.cleanupSessions();
    const cookies = parseCookies(req.headers.cookie || '');
    const token = cookies.keller_session;
    let key = token ? sha256(token) : '';
    let session = key ? this.sessions.get(key) : null;
    if (!session) {
      const trusted = this.findTrustedDevice(req);
      if (trusted) {
        key = `trusted:${trusted.tokenHash}`;
        session = this.sessions.get(key);
        if (!session) {
          const now = Date.now();
          session = { username: this.state.username, displayName: this.state.displayName, csrfToken: randomBytes(24).toString('base64url'), createdAt: now, lastSeenAt: now, expiresAt: now + SESSION_MAX_AGE_MS, trustedDevice: true };
          this.sessions.set(key, session);
        }
      }
    }
    if (!session) return null;
    if (!session || Date.now() > session.expiresAt || Date.now() - session.lastSeenAt > SESSION_IDLE_MS) {
      this.sessions.delete(key);
      const trusted = this.findTrustedDevice(req);
      if (!trusted) return null;
      const now = Date.now();
      session = { username: this.state.username, displayName: this.state.displayName, csrfToken: randomBytes(24).toString('base64url'), createdAt: now, lastSeenAt: now, expiresAt: now + SESSION_MAX_AGE_MS, trustedDevice: true };
      this.sessions.set(`trusted:${trusted.tokenHash}`, session);
    }
    session.lastSeenAt = Date.now();
    return session;
  }

  requireSession(req) {
    const session = this.authenticate(req);
    if (!session) throw httpError(401, 'Faça login para acessar a Central.');
    return session;
  }

  requireCsrf(req, session) {
    const supplied = String(req.headers['x-csrf-token'] || '');
    if (!supplied || !constantEqual(supplied, session.csrfToken)) throw httpError(403, 'Validação de segurança da sessão ausente ou inválida.');
  }

  async logout(req) {
    const token = parseCookies(req.headers.cookie || '').keller_session;
    if (token) this.sessions.delete(sha256(token));
    await this.revokeTrustedDevice(req);
  }

  sessionCookie(token) {
    return `keller_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${Math.floor(SESSION_MAX_AGE_MS / 1000)}${this.secureCookies ? '; Secure' : ''}`;
  }

  clearCookie() {
    return `keller_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${this.secureCookies ? '; Secure' : ''}`;
  }

  trustedDeviceCookie(token) {
    return `keller_trusted=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${Math.floor(TRUSTED_DEVICE_MAX_AGE_MS / 1000)}${this.secureCookies ? '; Secure' : ''}`;
  }

  clearTrustedDeviceCookie() {
    return `keller_trusted=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${this.secureCookies ? '; Secure' : ''}`;
  }

  async createTrustedDevice(userAgent = '') {
    const token = randomBytes(48).toString('base64url');
    const now = Date.now();
    this.state.trustedDevices = (this.state.trustedDevices || []).filter(device => device.expiresAt > now).slice(-9);
    this.state.trustedDevices.push({
      id: randomBytes(12).toString('base64url'),
      tokenHash: sha256(token),
      userAgentHash: sha256(normalizeUserAgent(userAgent)),
      createdAt: new Date(now).toISOString(),
      expiresAt: now + TRUSTED_DEVICE_MAX_AGE_MS
    });
    this.state.updatedAt = new Date().toISOString();
    await this.save();
    return token;
  }

  findTrustedDevice(req) {
    const token = parseCookies(req.headers.cookie || '').keller_trusted;
    if (!token || !Array.isArray(this.state.trustedDevices)) return null;
    const tokenHash = sha256(token);
    const userAgentHash = sha256(normalizeUserAgent(req.headers['user-agent'] || ''));
    return this.state.trustedDevices.find(device => device.expiresAt > Date.now() && constantEqual(device.tokenHash, tokenHash) && constantEqual(device.userAgentHash, userAgentHash)) || null;
  }

  async revokeTrustedDevice(req) {
    const trusted = this.findTrustedDevice(req);
    if (!trusted) return false;
    this.state.trustedDevices = this.state.trustedDevices.filter(device => device.id !== trusted.id);
    this.sessions.delete(`trusted:${trusted.tokenHash}`);
    this.state.updatedAt = new Date().toISOString();
    await this.save();
    return true;
  }

  createSession(username, displayName) {
    const token = randomBytes(32).toString('base64url');
    const csrfToken = randomBytes(24).toString('base64url');
    const now = Date.now();
    this.sessions.set(sha256(token), { username, displayName, csrfToken, createdAt: now, lastSeenAt: now, expiresAt: now + SESSION_MAX_AGE_MS });
    return { token, csrfToken, user: { username, displayName } };
  }

  async consumeRecoveryCode(code) {
    if (!/^\d{5}-\d{5}$/.test(code) || !Array.isArray(this.state.recoveryHashes)) return false;
    const candidate = hashRecovery(code, this.state.recoverySalt);
    const index = this.state.recoveryHashes.findIndex(hash => constantEqual(hash, candidate));
    if (index < 0) return false;
    this.state.recoveryHashes.splice(index, 1);
    this.state.updatedAt = new Date().toISOString();
    await this.save();
    return true;
  }

  assertLoginAllowed(key) {
    const attempt = this.loginAttempts.get(key);
    if (!attempt) return;
    if (attempt.blockedUntil && Date.now() < attempt.blockedUntil) {
      const error = httpError(429, 'Muitas tentativas. Aguarde antes de tentar novamente.');
      error.retryAfter = Math.ceil((attempt.blockedUntil - Date.now()) / 1000);
      throw error;
    }
    if (Date.now() > attempt.resetAt) this.loginAttempts.delete(key);
  }

  recordLoginFailure(key) {
    const current = this.loginAttempts.get(key);
    const attempt = current && Date.now() <= current.resetAt ? current : { count: 0, resetAt: Date.now() + LOGIN_WINDOW_MS, blockedUntil: 0 };
    attempt.count += 1;
    if (attempt.count >= LOGIN_MAX_FAILURES) attempt.blockedUntil = Date.now() + LOGIN_WINDOW_MS;
    this.loginAttempts.set(key, attempt);
  }

  signSetupToken(payload) {
    const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
    return `${encoded}.${createHmac('sha256', this.sessionSecret).update(encoded).digest('base64url')}`;
  }

  verifySetupToken(token, pending) {
    const [encoded, signature] = String(token || '').split('.');
    if (!encoded || !signature) return false;
    const expected = createHmac('sha256', this.sessionSecret).update(encoded).digest('base64url');
    if (!constantEqual(signature, expected)) return false;
    try {
      const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
      return payload.nonce === pending.nonce && payload.expiresAt === pending.expiresAt && Date.now() < payload.expiresAt;
    } catch { return false; }
  }

  encrypt(value) {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.encryptionKey, iv);
    const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    return { iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), ciphertext: ciphertext.toString('base64') };
  }

  decrypt(payload) {
    const decipher = createDecipheriv('aes-256-gcm', this.encryptionKey, Buffer.from(payload.iv, 'base64'));
    decipher.setAuthTag(Buffer.from(payload.tag, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(payload.ciphertext, 'base64')), decipher.final()]).toString('utf8');
  }

  cleanupSessions() {
    const now = Date.now();
    for (const [key, session] of this.sessions) if (now > session.expiresAt || now - session.lastSeenAt > SESSION_IDLE_MS) this.sessions.delete(key);
  }

  async save() {
    await mkdir(this.dataDirectory, { recursive: true });
    await writeFile(this.file, JSON.stringify(this.state, null, 2), { encoding: 'utf8', mode: 0o600 });
  }
}

export function isLoopback(address = '') {
  return address === '127.0.0.1' || address === '::1' || address.endsWith('127.0.0.1');
}

export function verifyTotp(secret, code, now = Date.now()) {
  const normalized = String(code || '').replace(/\s/g, '');
  if (!/^\d{6}$/.test(normalized)) return false;
  const counter = Math.floor(now / 30_000);
  return [-1, 0, 1].some(offset => constantEqual(generateTotp(secret, counter + offset), normalized));
}

export function generateTotp(secret, counter = Math.floor(Date.now() / 30_000)) {
  const key = decodeBase32(secret);
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac('sha1', key).update(buffer).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const value = (digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return String(value).padStart(6, '0');
}

async function hashPassword(password, salt) {
  return Buffer.from(await scrypt(String(password), Buffer.from(salt, 'base64'), 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 })).toString('base64');
}

function validateUsername(username) {
  if (!/^[a-z0-9._-]{3,64}$/.test(username)) throw httpError(400, 'O usuário deve ter de 3 a 64 caracteres simples.');
}

function validatePassword(password) {
  const value = String(password || '');
  if (value.length < 10 || value.length > 128) throw httpError(400, 'A senha deve ter entre 10 e 128 caracteres.');
  const groups = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter(expression => expression.test(value)).length;
  if (groups < 3) throw httpError(400, 'Combine ao menos três grupos: minúsculas, maiúsculas, números e símbolos.');
}

function parseCookies(header) {
  return Object.fromEntries(header.split(';').map(item => item.trim()).filter(Boolean).map(item => {
    const separator = item.indexOf('=');
    return separator < 0 ? [item, ''] : [item.slice(0, separator), decodeURIComponent(item.slice(separator + 1))];
  }));
}
function normalizeUserAgent(value) { return String(value || '').slice(0, 500).trim(); }

function sha256(value) { return createHash('sha256').update(value).digest('base64url'); }
function hashRecovery(value, salt) { return createHmac('sha256', Buffer.from(salt, 'base64')).update(value).digest('base64url'); }
function constantEqual(left, right) {
  const a = Buffer.from(String(left || ''));
  const b = Buffer.from(String(right || ''));
  return a.length === b.length && timingSafeEqual(a, b);
}
function randomDigits(length) { return Array.from(randomBytes(length), byte => String(byte % 10)).join(''); }
function encodeBase32(buffer) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0; let value = 0; let output = '';
  for (const byte of buffer) {
    value = (value << 8) | byte; bits += 8;
    while (bits >= 5) { output += alphabet[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) output += alphabet[(value << (5 - bits)) & 31];
  return output;
}
function decodeBase32(value) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0; let current = 0; const bytes = [];
  for (const character of String(value).toUpperCase().replace(/=|\s/g, '')) {
    const index = alphabet.indexOf(character); if (index < 0) continue;
    current = (current << 5) | index; bits += 5;
    if (bits >= 8) { bytes.push((current >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(bytes);
}
function httpError(statusCode, message) { return Object.assign(new Error(message), { statusCode }); }
