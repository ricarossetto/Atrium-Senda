const DEFAULT_FROM_PUBLICATIONS = 'ATRIUM Publicações <publicacoes@example.com>';
const DEFAULT_FROM_NOTIFICATIONS = 'ATRIUM Notificações <notificacoes@example.com>';

export class ResendProvider {
  constructor({
    apiKey = null,
    fetchFn = globalThis.fetch,
    mockMode = false,
    logger = console
  } = {}) {
    this._explicitApiKey = apiKey;
    this.fetchFn = fetchFn;
    this.mockMode = mockMode;
    this.logger = logger;
  }

  get apiKey() {
    return this._explicitApiKey || process.env.RESEND_API_KEY || '';
  }

  isConfigured() {
    return Boolean(this.apiKey && this.apiKey.trim().length > 0);
  }

  getFromAddress(type = 'general') {
    if (type === 'publications' || type === 'PUBLICATION_NEW' || type === 'PUBLICATION_DIGEST') {
      return process.env.ATRIUM_EMAIL_FROM_PUBLICATIONS || DEFAULT_FROM_PUBLICATIONS;
    }
    return process.env.ATRIUM_EMAIL_FROM_NOTIFICATIONS || DEFAULT_FROM_NOTIFICATIONS;
  }

  getLimits() {
    const daily = Number(process.env.EMAIL_DAILY_SEND_LIMIT);
    const monthly = Number(process.env.EMAIL_MONTHLY_SEND_LIMIT);
    return {
      daily: Number.isFinite(daily) && daily > 0 ? daily : 90,
      monthly: Number.isFinite(monthly) && monthly > 0 ? monthly : 2700
    };
  }

  checkBudget(db) {
    if (!db) return { allowed: true };
    const limits = this.getLimits();
    const stats = db.getStats();

    if (stats.sentToday >= limits.daily) {
      return {
        allowed: false,
        reason: 'DAILY_LIMIT_EXCEEDED',
        message: `Limite diário de envio atingido (${stats.sentToday}/${limits.daily}).`,
        sentToday: stats.sentToday,
        limit: limits.daily
      };
    }

    if (stats.sentMonth >= limits.monthly) {
      return {
        allowed: false,
        reason: 'MONTHLY_LIMIT_EXCEEDED',
        message: `Limite mensal de envio atingido (${stats.sentMonth}/${limits.monthly}).`,
        sentMonth: stats.sentMonth,
        limit: limits.monthly
      };
    }

    return {
      allowed: true,
      sentToday: stats.sentToday,
      sentMonth: stats.sentMonth,
      limits
    };
  }

  async sendEmail({
    from,
    to,
    subject,
    html,
    text,
    idempotencyKey = null,
    tags = [],
    headers: emailHeaders = {}
  }) {
    if (!to) {
      throw Object.assign(new Error('Destinatário não informado.'), { statusCode: 400, retryable: false });
    }

    const recipient = Array.isArray(to) ? to[0] : to;
    if (!recipient || typeof recipient !== 'string' || !recipient.includes('@')) {
      throw Object.assign(new Error('Endereço de e-mail do destinatário inválido.'), { statusCode: 400, retryable: false });
    }

    if (!subject) {
      throw Object.assign(new Error('Assunto do e-mail não informado.'), { statusCode: 400, retryable: false });
    }

    const effectiveFrom = from || this.getFromAddress('general');

    if (this.mockMode) {
      return {
        ok: true,
        providerMessageId: `mock-resend-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        recipient,
        subject
      };
    }

    if (!this.isConfigured()) {
      throw Object.assign(
        new Error('RESEND_API_KEY não configurada no ambiente. O transporte falhou de forma segura.'),
        { statusCode: 503, retryable: false }
      );
    }

    const headers = {
      Authorization: `Bearer ${this.apiKey.trim()}`,
      'Content-Type': 'application/json'
    };

    if (idempotencyKey) {
      headers['Idempotency-Key'] = String(idempotencyKey).slice(0, 256);
    }

    const payload = {
      from: effectiveFrom,
      to: [recipient.trim()],
      subject: subject.trim(),
      html: html || '',
      text: text || ''
    };

    if (Object.keys(emailHeaders).length > 0) payload.headers = emailHeaders;

    if (Array.isArray(tags) && tags.length > 0) {
      payload.tags = tags.filter(t => t && t.name && t.value).map(t => ({
        name: String(t.name).slice(0, 64),
        // O valor carrega o workspace id (ws-<uuid>); 64 truncaria a identidade.
        value: String(t.value).slice(0, 256)
      }));
    }

    let response;
    let responseBodyText = '';

    try {
      response = await this.fetchFn('https://api.resend.com/emails', {
        method: 'POST',
        headers,
        body: JSON.stringify(payload)
      });
      responseBodyText = await response.text();
    } catch (networkErr) {
      throw Object.assign(
        new Error(`Falha de conexão com o provedor Resend: ${networkErr.message}`),
        { statusCode: 502, retryable: true, cause: networkErr }
      );
    }

    let data = {};
    try {
      if (responseBodyText) data = JSON.parse(responseBodyText);
    } catch {
      data = { raw: responseBodyText };
    }

    if (!response.ok) {
      const status = response.status;
      const isRetryable = status === 429 || status >= 500;
      const errMsg = data.message || data.error || `Erro HTTP ${status} no provedor de e-mail.`;

      const error = new Error(errMsg);
      error.statusCode = status;
      error.retryable = isRetryable;
      error.resendError = data;

      if (status === 429) {
        const retryAfterHeader = response.headers?.get ? response.headers.get('retry-after') : null;
        if (retryAfterHeader) {
          const parsedSec = parseInt(retryAfterHeader, 10);
          if (!isNaN(parsedSec) && parsedSec > 0) {
            error.retryAfterSeconds = parsedSec;
          }
        }
      }

      throw error;
    }

    return {
      ok: true,
      providerMessageId: data.id || `resend-${Date.now()}`,
      recipient,
      subject
    };
  }
}
