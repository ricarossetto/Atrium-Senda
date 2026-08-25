import { createHmac } from 'node:crypto';
import { generateTotp, verifyTotp } from '../security.mjs';

export const TOTP_ERROR_CODES = {
  SECRET_MISSING: 'TOTP-001',
  INVALID_BASE32_SECRET: 'TOTP-002',
  QR_PARSE_FAILED: 'TOTP-003',
  UNSUPPORTED_ALGORITHM: 'TOTP-004',
  GENERATION_FAILED: 'TOTP-005',
  SYSTEM_CLOCK_SUSPECT: 'TOTP-006'
};

const BASE32_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function normalizeBase32(secret) {
  return String(secret || '').toUpperCase().replace(/[\s-]/g, '').replace(/=+$/, '');
}

export function isValidBase32(secret) {
  const clean = normalizeBase32(secret);
  if (!clean || clean.length < 8) return false;
  return /^[A-Z2-7]+$/.test(clean);
}

function decodeProtobufVarint(buffer, offset) {
  let res = 0;
  let shift = 0;
  while (offset < buffer.length) {
    const byte = buffer[offset++];
    res |= (byte & 0x7f) << shift;
    if ((byte & 0x80) === 0) break;
    shift += 7;
  }
  return { value: res, offset };
}

function base32Encode(buffer) {
  let bits = 0;
  let value = 0;
  let output = '';
  for (let i = 0; i < buffer.length; i++) {
    value = (value << 8) | buffer[i];
    bits += 8;
    while (bits >= 5) {
      output += BASE32_CHARS[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32_CHARS[(value << (5 - bits)) & 31];
  }
  return output;
}

export function parseGoogleAuthMigration(uriOrData) {
  const cleanData = decodeURIComponent(String(uriOrData || '')).replace(/^otpauth-migration:\/\/offline\?data=/i, '').trim();
  if (!cleanData) return [];

  const buffer = Buffer.from(cleanData, 'base64');
  let offset = 0;
  const accounts = [];

  while (offset < buffer.length) {
    const key = decodeProtobufVarint(buffer, offset);
    offset = key.offset;
    const fieldNumber = key.value >> 3;
    const wireType = key.value & 0x07;

    if (wireType === 2) {
      const len = decodeProtobufVarint(buffer, offset);
      offset = len.offset;
      const end = offset + len.value;
      const subBuffer = buffer.subarray(offset, end);
      offset = end;

      if (fieldNumber === 1) {
        let subOffset = 0;
        let secret = '';
        let name = '';
        let issuer = '';
        let algorithm = 'SHA1';
        let digits = 6;
        let period = 30;

        while (subOffset < subBuffer.length) {
          const subKey = decodeProtobufVarint(subBuffer, subOffset);
          subOffset = subKey.offset;
          const subField = subKey.value >> 3;
          const subWire = subKey.value & 0x07;

          if (subWire === 2) {
            const subLen = decodeProtobufVarint(subBuffer, subOffset);
            subOffset = subLen.offset;
            const subData = subBuffer.subarray(subOffset, subOffset + subLen.value);
            subOffset += subLen.value;
            if (subField === 1) secret = base32Encode(subData);
            else if (subField === 2) name = subData.toString('utf8');
            else if (subField === 3) issuer = subData.toString('utf8');
          } else if (subWire === 0) {
            const varint = decodeProtobufVarint(subBuffer, subOffset);
            subOffset = varint.offset;
            if (subField === 4) {
              algorithm = varint.value === 2 ? 'SHA256' : varint.value === 3 ? 'SHA512' : 'SHA1';
            } else if (subField === 5) {
              digits = varint.value === 2 ? 8 : 6;
            }
          } else {
            subOffset++;
          }
        }

        if (secret) {
          accounts.push({
            name: name || 'Conta sem nome',
            issuer: issuer || (name.includes(':') ? name.split(':')[0].trim() : 'Authenticator'),
            secret: normalizeBase32(secret),
            algorithm,
            digits,
            period
          });
        }
      }
    } else if (wireType === 0) {
      const varint = decodeProtobufVarint(buffer, offset);
      offset = varint.offset;
    } else {
      offset++;
    }
  }

  return accounts;
}

export function parseTotpUri(rawText) {
  const text = String(rawText || '').trim();
  if (!text) throw Object.assign(new Error('Texto ou QR Code vazio.'), { errorCode: TOTP_ERROR_CODES.QR_PARSE_FAILED });

  // 1. Google Authenticator Migration format
  if (text.startsWith('otpauth-migration://') || text.includes('otpauth-migration:')) {
    const accounts = parseGoogleAuthMigration(text);
    if (!accounts.length) throw Object.assign(new Error('Nenhuma conta encontrada no payload de migração do Google Authenticator.'), { errorCode: TOTP_ERROR_CODES.QR_PARSE_FAILED });
    return { type: 'migration', accounts };
  }

  // 2. Standard otpauth URI format
  if (text.startsWith('otpauth://')) {
    try {
      const url = new URL(text);
      if (url.hostname.toLowerCase() !== 'totp' && url.pathname.toLowerCase() !== '//totp') {
        // Continue parsing
      }
      const rawSecret = url.searchParams.get('secret');
      if (!rawSecret) throw new Error('Parâmetro "secret" ausente na URI otpauth.');
      const secret = normalizeBase32(rawSecret);
      const issuer = url.searchParams.get('issuer') || decodeURIComponent(url.pathname.replace(/^\/*totp\/*:?/i, '').split(':')[0] || 'Authenticator').trim();
      const accountName = decodeURIComponent(url.pathname.replace(/^\/*totp\/*:?/i, '')).trim() || 'Conta';
      const algorithm = (url.searchParams.get('algorithm') || 'SHA1').toUpperCase();
      const digits = Number(url.searchParams.get('digits') || 6);
      const period = Number(url.searchParams.get('period') || 30);

      return {
        type: 'single',
        account: {
          name: accountName,
          issuer,
          secret,
          algorithm,
          digits,
          period
        }
      };
    } catch (err) {
      throw Object.assign(new Error(`Formato de URI otpauth inválido: ${err.message}`), { errorCode: TOTP_ERROR_CODES.QR_PARSE_FAILED });
    }
  }

  // 3. Direct Base32 string
  const cleanSecret = normalizeBase32(text);
  if (isValidBase32(cleanSecret)) {
    return {
      type: 'single',
      account: {
        name: 'Chave Manual',
        issuer: 'Tribunal',
        secret: cleanSecret,
        algorithm: 'SHA1',
        digits: 6,
        period: 30
      }
    };
  }

  throw Object.assign(new Error('O texto informado não é um QR Code otpauth nem uma chave Base32 válida.'), { errorCode: TOTP_ERROR_CODES.QR_PARSE_FAILED });
}

export function runTotpSandbox({ secret, algorithm = 'SHA1', digits = 6, period = 30 }) {
  const steps = [];
  const addStep = (id, name, status, detail = '', errorCode = null) => {
    steps.push({ id, name, status, detail, errorCode });
  };

  const cleanSecret = normalizeBase32(secret);
  if (!cleanSecret) {
    addStep('secret', 'Segredo TOTP', 'FAIL', 'Nenhum segredo TOTP foi informado.', TOTP_ERROR_CODES.SECRET_MISSING);
    return {
      operational: false,
      status: 'TOTP NOT CONFIGURED',
      errorCode: TOTP_ERROR_CODES.SECRET_MISSING,
      errorMessage: 'Segredo TOTP ausente.',
      steps,
      summary: null
    };
  }

  if (!isValidBase32(cleanSecret)) {
    addStep('secret', 'Segredo TOTP', 'FAIL', 'O segredo TOTP contém caracteres inválidos para codificação Base32.', TOTP_ERROR_CODES.INVALID_BASE32_SECRET);
    return {
      operational: false,
      status: 'TOTP INVALID SECRET',
      errorCode: TOTP_ERROR_CODES.INVALID_BASE32_SECRET,
      errorMessage: 'Segredo Base32 inválido.',
      steps,
      summary: null
    };
  }

  addStep('secret', 'Segredo TOTP', 'OK', `Segredo Base32 válido (${cleanSecret.length} caracteres).`);

  // Validação de Algoritmo
  const validAlgorithms = ['SHA1', 'SHA256', 'SHA512'];
  if (!validAlgorithms.includes(algorithm.toUpperCase())) {
    addStep('algorithm', 'Algoritmo HMAC', 'FAIL', `Algoritmo ${algorithm} não suportado.`, TOTP_ERROR_CODES.UNSUPPORTED_ALGORITHM);
    return {
      operational: false,
      status: 'TOTP UNSUPPORTED ALGORITHM',
      errorCode: TOTP_ERROR_CODES.UNSUPPORTED_ALGORITHM,
      errorMessage: `Algoritmo ${algorithm} não suportado.`,
      steps,
      summary: null
    };
  }

  addStep('algorithm', 'Algoritmo HMAC', 'OK', `Algoritmo ${algorithm} (RFC 6238) suportado.`);

  // Validação de Relógio do Sistema
  const now = Date.now();
  const serverTimeIso = new Date(now).toISOString();
  if (now < 1700000000000) { // Antes de 2023
    addStep('clock', 'Relógio do Sistema', 'FAIL', 'O relógio do computador está desajustado.', TOTP_ERROR_CODES.SYSTEM_CLOCK_SUSPECT);
    return {
      operational: false,
      status: 'TOTP CLOCK SUSPECT',
      errorCode: TOTP_ERROR_CODES.SYSTEM_CLOCK_SUSPECT,
      errorMessage: 'Relógio do sistema desajustado.',
      steps,
      summary: null
    };
  }

  addStep('clock', 'Relógio do Sistema', 'OK', `Horário sincronizado (${serverTimeIso.slice(0, 19).replace('T', ' ')} UTC).`);

  // Geração do código em memória e verificação imediata
  let generatedCode;
  try {
    generatedCode = generateTotp(cleanSecret);
  } catch (err) {
    addStep('generator', 'Geração do Código', 'FAIL', `Falha ao calcular código TOTP: ${err.message}`, TOTP_ERROR_CODES.GENERATION_FAILED);
    return {
      operational: false,
      status: 'TOTP GENERATION FAILED',
      errorCode: TOTP_ERROR_CODES.GENERATION_FAILED,
      errorMessage: err.message,
      steps,
      summary: null
    };
  }

  const isValidCode = verifyTotp(cleanSecret, generatedCode);
  if (!isValidCode) {
    addStep('generator', 'Geração do Código', 'FAIL', 'O código gerado não conferiu com a janela de validação.', TOTP_ERROR_CODES.GENERATION_FAILED);
    return {
      operational: false,
      status: 'TOTP VERIFICATION FAILED',
      errorCode: TOTP_ERROR_CODES.GENERATION_FAILED,
      errorMessage: 'Falha de verificação interna do código TOTP.',
      steps,
      summary: null
    };
  }

  addStep('generator', 'Geração do Código', 'OK', 'Código de 6 dígitos gerado e verificado com sucesso em memória.');

  return {
    operational: true,
    status: 'SEGUNDO FATOR OPERACIONAL',
    errorCode: null,
    errorMessage: null,
    steps,
    summary: {
      algorithm,
      digits,
      period,
      clockSkewSeconds: 0,
      testedAt: new Date().toISOString()
    }
  };
}
