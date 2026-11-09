const CPF_MASKED = '[CPF REMOVIDO]';
const CNPJ_MASKED = '[CNPJ REMOVIDO]';
const EMAIL_MASKED = '[E-MAIL REMOVIDO]';
const PHONE_MASKED = '[TELEFONE REMOVIDO]';
const CNJ_MASKED = '[CNJ REMOVIDO]';

const CPF_FORMATTED = /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g;
const CPF_DIGITS = /(?<![\d.])\b\d{11}\b(?![\d.])/g;
const CNPJ_FORMATTED = /\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/g;
const CNPJ_DIGITS = /(?<![\d./-])\b\d{14}\b(?![\d./-])/g;
const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const PHONE_BR = /(?<![\d])(\+?55[\s-]?)?(\(?\d{2}\)?[\s-]?)?\d{4,5}[\s-]?\d{4}(?![\d])/g;
const CNJ = /\b\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}\b/g;

export function redactForJev(input) {
  const text = String(input ?? '');
  let redacted = text;
  const findings = { cpf: 0, cnpj: 0, email: 0, phone: 0, cnj: 0 };
  const count = (regex) => (text.match(regex) || []).length;

  findings.cpf = count(CPF_FORMATTED) + count(CPF_DIGITS);
  findings.cnpj = count(CNPJ_FORMATTED) + count(CNPJ_DIGITS);
  findings.email = count(EMAIL);
  findings.cnj = count(CNJ);

  redacted = redacted.replace(CPF_FORMATTED, CPF_MASKED).replace(CNPJ_FORMATTED, CNPJ_MASKED);
  redacted = redacted.replace(CPF_DIGITS, CPF_MASKED).replace(CNPJ_DIGITS, CNPJ_MASKED);
  redacted = redacted.replace(EMAIL, EMAIL_MASKED).replace(CNJ, CNJ_MASKED);

  const beforePhone = redacted;
  redacted = redacted.replace(PHONE_BR, (match) => {
    const digits = match.replace(/\D/g, '');
    if (digits.length < 10 || digits.length > 13) return match;
    findings.phone += 1;
    return PHONE_MASKED;
  });
  void beforePhone;

  return { redacted, findings, redactedAny: redacted !== text };
}

export function assertNoSecretsInText(text, { context = 'jev-redaction' } = {}) {
  const value = String(text ?? '');
  const forbidden = ['sk_live', 'sk-live', 'AIza', 'xoxb-', ['-----BEGIN', 'PRIVATE KEY-----'].join(' '), ['-----BEGIN RSA', 'PRIVATE KEY-----'].join(' ')];
  for (const marker of forbidden) {
    if (value.includes(marker)) {
      const error = new Error(`Segredo detectado no texto em ${context}; redação obrigatória antes do egresso.`);
      error.code = 'SECRET_DETECTED';
      throw error;
    }
  }
  return true;
}
