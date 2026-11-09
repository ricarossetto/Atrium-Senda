import { createHmac, timingSafeEqual } from 'node:crypto';

export class WebhookVerifier {
  constructor({ secret = null, toleranceSeconds = 300 } = {}) {
    this._explicitSecret = secret;
    this.toleranceSeconds = toleranceSeconds;
  }

  get secret() {
    return this._explicitSecret || process.env.RESEND_WEBHOOK_SECRET || '';
  }

  isConfigured() {
    return Boolean(this.secret && this.secret.trim().length > 0);
  }

  verify({
    payload,
    headers = {},
    toleranceSeconds = this.toleranceSeconds
  }) {
    if (!this.isConfigured()) {
      throw new Error('RESEND_WEBHOOK_SECRET não configurado. Verificação falhou fechada.');
    }

    const rawBody = typeof payload === 'string' ? payload : Buffer.isBuffer(payload) ? payload.toString('utf8') : '';
    if (!rawBody) {
      throw new Error('Payload da requisição webhook vazio.');
    }

    // Normalize headers (case-insensitive)
    const normalizedHeaders = {};
    for (const [k, v] of Object.entries(headers)) {
      normalizedHeaders[k.toLowerCase()] = v;
    }

    const svixId = normalizedHeaders['svix-id'];
    const svixTimestamp = normalizedHeaders['svix-timestamp'];
    const svixSignature = normalizedHeaders['svix-signature'];

    if (!svixId || !svixTimestamp || !svixSignature) {
      throw new Error('Cabeçalhos de assinatura do webhook ausentes (svix-id, svix-timestamp, svix-signature).');
    }

    // Timestamp verification (replay protection)
    const timestampSec = parseInt(svixTimestamp, 10);
    if (isNaN(timestampSec)) {
      throw new Error('svix-timestamp inválido.');
    }

    const nowSec = Math.floor(Date.now() / 1000);
    if (Math.abs(nowSec - timestampSec) > toleranceSeconds) {
      throw new Error(`svix-timestamp fora da tolerância permitida (${toleranceSeconds}s).`);
    }

    // Prepare secret key buffer
    const secretStr = this.secret.trim();
    const keyBuffer = secretStr.startsWith('whsec_')
      ? Buffer.from(secretStr.slice(6), 'base64')
      : Buffer.from(secretStr, 'utf8');

    const signedContent = `${svixId}.${svixTimestamp}.${rawBody}`;
    const expectedSignatureBase64 = createHmac('sha256', keyBuffer)
      .update(signedContent)
      .digest('base64');
    const expectedSigBuffer = Buffer.from(expectedSignatureBase64, 'utf8');

    // svix-signature can contain multiple space-delimited signatures, e.g. "v1,g0hM9... v1,4m5H..."
    const passedSignatures = String(svixSignature).split(' ');
    let matched = false;

    for (const item of passedSignatures) {
      const parts = item.split(',');
      if (parts.length < 2) continue;
      const version = parts[0];
      const sig = parts.slice(1).join(',');

      if (version === 'v1') {
        const sigBuffer = Buffer.from(sig, 'utf8');
        if (sigBuffer.length === expectedSigBuffer.length) {
          if (timingSafeEqual(sigBuffer, expectedSigBuffer)) {
            matched = true;
            break;
          }
        }
      }
    }

    if (!matched) {
      throw new Error('Assinatura do webhook inválida.');
    }

    return {
      verified: true,
      svixId,
      timestamp: new Date(timestampSec * 1000).toISOString()
    };
  }
}
