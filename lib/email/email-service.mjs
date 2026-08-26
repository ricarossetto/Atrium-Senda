import nodemailer from 'nodemailer';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

function maskEmail(val) {
  if (!val || typeof val !== 'string') return '';
  const str = val.trim();
  const atIdx = str.indexOf('@');
  if (atIdx > 0) {
    const user = str.slice(0, atIdx);
    const domain = str.slice(atIdx);
    if (user.length <= 2) {
      return `${user.charAt(0)}***${domain}`;
    }
    return `${user.slice(0, 2)}***${domain}`;
  }
  if (str.length <= 2) return `${str.charAt(0)}***`;
  return `${str.slice(0, 2)}***`;
}

function isValidEmail(email) {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

export class EmailService {
  constructor({ dataDirectory, securityManager, testTransporter = null }) {
    this.dataDirectory = dataDirectory;
    this.security = securityManager;
    this.secretsFile = path.join(dataDirectory, 'email-integrations.json');
    this.testTransporter = testTransporter;
  }

  async init() {
    await mkdir(this.dataDirectory, { recursive: true });
  }

  defaultConfig() {
    return {
      configured: false,
      host: '',
      port: 465,
      secure: true,
      user: '',
      password: '',
      fromName: '',
      fromAddress: '',
      lastTestAt: null,
      lastTestStatus: null
    };
  }

  async readRawConfig() {
    try {
      if (!existsSync(this.secretsFile)) {
        return this.defaultConfig();
      }
      const envelope = JSON.parse(await readFile(this.secretsFile, 'utf8'));
      const decrypted = JSON.parse(this.security.decrypt(envelope.encrypted));
      return { ...this.defaultConfig(), ...decrypted };
    } catch (err) {
      if (existsSync(this.secretsFile)) {
        throw new Error('Falha ao descriptografar as credenciais SMTP salvas.', { cause: err });
      }
      return this.defaultConfig();
    }
  }

  async saveRawConfig(config) {
    await this.init();
    const envelope = {
      version: 1,
      algorithm: 'aes-256-gcm',
      updatedAt: new Date().toISOString(),
      encrypted: this.security.encrypt(JSON.stringify(config))
    };
    await writeFile(this.secretsFile, JSON.stringify(envelope, null, 2), { encoding: 'utf8', mode: 0o600 });
  }

  async getStatus() {
    const config = await this.readRawConfig();
    return {
      configured: Boolean(config.configured),
      host: config.host || '',
      port: Number(config.port) || 465,
      secure: Boolean(config.secure),
      userMasked: maskEmail(config.user),
      fromName: config.fromName || '',
      fromAddress: config.fromAddress || '',
      lastTestAt: config.lastTestAt || null,
      lastTestStatus: config.lastTestStatus || null
    };
  }

  createTransporter(config) {
    if (this.testTransporter) return this.testTransporter;
    if (process.env.ATRIUM_MOCK_SMTP === 'true') {
      return {
        verify: async () => true,
        sendMail: async (opts) => ({ messageId: `mock-msg-${Date.now()}` })
      };
    }
    return nodemailer.createTransport({
      host: config.host,
      port: Number(config.port),
      secure: Boolean(config.secure),
      auth: {
        user: config.user,
        pass: config.password
      },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000
    });
  }

  async configure({ host, port, secure, user, password, fromName, fromAddress }) {
    const normalizedHost = String(host || '').trim();
    const normalizedPort = Number(port);
    const isSecure = Boolean(secure);
    const normalizedUser = String(user || '').trim();
    const rawPassword = String(password ?? '');
    const normalizedFromName = String(fromName || '').trim();
    const normalizedFromAddress = String(fromAddress || '').trim();

    if (!normalizedHost) {
      throw Object.assign(new Error('Informe o servidor SMTP (Host).'), { statusCode: 400 });
    }
    if (!normalizedPort || isNaN(normalizedPort) || normalizedPort < 1 || normalizedPort > 65535) {
      throw Object.assign(new Error('Informe uma porta SMTP válida (ex: 465 ou 587).'), { statusCode: 400 });
    }
    if (!normalizedUser) {
      throw Object.assign(new Error('Informe o usuário ou e-mail de autenticação SMTP.'), { statusCode: 400 });
    }

    let effectivePassword = rawPassword;
    if (!effectivePassword) {
      const existing = await this.readRawConfig();
      if (existing.configured && existing.password) {
        effectivePassword = existing.password;
      }
    }
    if (!effectivePassword) {
      throw Object.assign(new Error('Informe a senha SMTP ou senha de aplicativo.'), { statusCode: 400 });
    }

    if (!normalizedFromAddress || !isValidEmail(normalizedFromAddress)) {
      throw Object.assign(new Error('Informe um e-mail de remetente válido.'), { statusCode: 400 });
    }

    const testConfig = {
      host: normalizedHost,
      port: normalizedPort,
      secure: isSecure,
      user: normalizedUser,
      password: effectivePassword
    };

    const transporter = this.createTransporter(testConfig);

    try {
      await transporter.verify();
    } catch (err) {
      let cleanMessage = 'Não foi possível autenticar no servidor de e-mail. Confira usuário, senha de aplicativo e configurações SMTP.';
      if (err.code === 'EAUTH' || err.responseCode === 535) {
        cleanMessage = 'Falha de autenticação SMTP: Usuário ou senha incorretos. Caso utilize Gmail, Outlook ou Zoho, utilize uma Senha de Aplicativo.';
      } else if (err.code === 'ESOCKET' || err.code === 'ETIMEDOUT' || err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND') {
        cleanMessage = `Não foi possível conectar ao servidor SMTP (${normalizedHost}:${normalizedPort}). Verifique o host, a porta e a conexão de rede.`;
      } else if (err.message && !err.message.includes(effectivePassword)) {
        cleanMessage = `Erro na validação SMTP: ${err.message}`;
      }
      throw Object.assign(new Error(cleanMessage), { statusCode: 400 });
    }

    const newConfig = {
      configured: true,
      host: normalizedHost,
      port: normalizedPort,
      secure: isSecure,
      user: normalizedUser,
      password: effectivePassword,
      fromName: normalizedFromName,
      fromAddress: normalizedFromAddress,
      lastTestAt: null,
      lastTestStatus: null
    };

    await this.saveRawConfig(newConfig);
    return this.getStatus();
  }

  async sendTestEmail({ recipient }) {
    const normalizedRecipient = String(recipient || '').trim();
    if (!normalizedRecipient || !isValidEmail(normalizedRecipient)) {
      throw Object.assign(new Error('Informe um endereço de e-mail de destinatário válido.'), { statusCode: 400 });
    }

    const config = await this.readRawConfig();
    if (!config.configured || !config.host || !config.user || !config.password) {
      throw Object.assign(new Error('Serviço de e-mail não configurado. Configure o servidor SMTP antes de realizar o teste.'), { statusCode: 400 });
    }

    const transporter = this.createTransporter(config);
    const sender = config.fromName ? `"${config.fromName}" <${config.fromAddress}>` : config.fromAddress;

    const mailOptions = {
      from: sender,
      to: normalizedRecipient,
      subject: 'ATRIUM — Teste de integração de e-mail',
      text: 'A integração de e-mail do Atrium está funcionando corretamente.\n\nEste é um envio de teste.\nNenhuma publicação judicial foi incluída.',
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 8px; background: #ffffff; color: #1e293b;">
          <div style="margin-bottom: 20px; border-bottom: 2px solid #d4af37; padding-bottom: 12px;">
            <h2 style="margin: 0; color: #0f172a; font-size: 20px;">⚖️ ATRIUM SENDA</h2>
            <p style="margin: 4px 0 0; color: #64748b; font-size: 13px;">Gestão Jurídica Inteligente &amp; Soberana</p>
          </div>
          <p style="font-size: 15px; line-height: 1.5; color: #334155;">Olá,</p>
          <p style="font-size: 15px; line-height: 1.5; color: #334155;">A integração de e-mail do <strong>ATRIUM</strong> está funcionando corretamente.</p>
          <div style="margin: 20px 0; padding: 14px; background: #f8fafc; border-left: 4px solid #10b981; border-radius: 4px;">
            <p style="margin: 0; font-size: 14px; color: #0f766e; font-weight: 600;">✓ Conexão SMTP estabelecida e verificada com sucesso.</p>
            <p style="margin: 6px 0 0; font-size: 13px; color: #64748b;">Este é um envio de teste. Nenhuma publicação judicial foi incluída.</p>
          </div>
          <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0 16px;">
          <p style="margin: 0; font-size: 12px; color: #94a3b8; text-align: center;">Enviado por ATRIUM em ${new Date().toLocaleString('pt-BR')}</p>
        </div>
      `
    };

    try {
      const info = await transporter.sendMail(mailOptions);
      config.lastTestAt = new Date().toISOString();
      config.lastTestStatus = 'success';
      await this.saveRawConfig(config);
      return {
        ok: true,
        recipient: normalizedRecipient,
        messageId: info?.messageId || 'test-sent',
        message: `E-mail de teste enviado com sucesso para ${normalizedRecipient}.`
      };
    } catch (err) {
      config.lastTestAt = new Date().toISOString();
      config.lastTestStatus = 'failed';
      await this.saveRawConfig(config);

      let cleanMessage = 'Falha ao enviar e-mail de teste. Verifique as configurações SMTP.';
      if (err.message && !err.message.includes(config.password)) {
        cleanMessage = `Falha no envio SMTP: ${err.message}`;
      }
      throw Object.assign(new Error(cleanMessage), { statusCode: 400 });
    }
  }

  async sendPublicationEmail({ recipient, publication }) {
    const normalizedRecipient = String(recipient || '').trim();
    if (!normalizedRecipient || !isValidEmail(normalizedRecipient)) {
      throw Object.assign(new Error('Informe um endereço de e-mail de destinatário válido.'), { statusCode: 400 });
    }

    if (!publication || typeof publication !== 'object') {
      throw Object.assign(new Error('Publicação inválida ou não informada.'), { statusCode: 400 });
    }

    const config = await this.readRawConfig();
    if (!config.configured || !config.host || !config.user || !config.password) {
      throw Object.assign(new Error('A integração de e-mail ainda não foi configurada. Configure o SMTP em Integrações.'), { statusCode: 409 });
    }

    const transporter = this.createTransporter(config);
    const sender = config.fromName ? `"${config.fromName}" <${config.fromAddress}>` : config.fromAddress;

    const processNum = String(publication.process || publication.number || '').trim();
    const subject = processNum ? `ATRIUM — Publicação judicial — ${processNum}` : 'ATRIUM — Nova publicação judicial';

    const client = String(publication.client || '').trim();
    const court = String(publication.court || '').trim();
    const source = String(publication.source || 'Diário de Justiça Eletrônico Nacional').trim();
    const term = String(publication.term || '').trim();
    const rawText = String(publication.text || publication.description || 'Sem conteúdo adicional.').trim();

    let pubDateFormatted = 'Não informada';
    if (publication.publishedAt) {
      const dateStr = String(publication.publishedAt).trim();
      const m = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (m) {
        pubDateFormatted = `${m[3]}/${m[2]}/${m[1]}`;
      } else {
        try {
          const d = new Date(dateStr);
          if (!isNaN(d.getTime())) {
            pubDateFormatted = d.toLocaleDateString('pt-BR');
          } else {
            pubDateFormatted = dateStr;
          }
        } catch {
          pubDateFormatted = dateStr;
        }
      }
    }

    // Montagem da versão texto puro (Plain Text)
    let plain = 'ATRIUM\nPublicação Judicial\n\n';
    if (processNum) plain += `Processo:\n${processNum}\n\n`;
    if (client) plain += `Cliente:\n${client}\n\n`;
    if (court) plain += `Tribunal:\n${court}\n\n`;
    plain += `Data da publicação:\n${pubDateFormatted}\n\n`;
    plain += `Fonte:\n${source}\n\n`;
    if (term) plain += `Termo monitorado:\n${term}\n\n`;
    plain += '--------------------------------\n\n';
    plain += 'Conteúdo da publicação:\n\n';
    plain += `${rawText}\n\n`;
    plain += '--------------------------------\n\n';
    plain += 'Esta mensagem foi enviada pelo ATRIUM a partir de uma publicação capturada e armazenada no sistema.\n';

    // Montagem da versão HTML com escape estrito de segurança contra XSS
    const safeProcess = escapeHtml(processNum);
    const safeClient = escapeHtml(client);
    const safeCourt = escapeHtml(court);
    const safeDate = escapeHtml(pubDateFormatted);
    const safeSource = escapeHtml(source);
    const safeTerm = escapeHtml(term);
    const safeEscapedText = escapeHtml(rawText).replace(/\r?\n/g, '<br>');

    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 8px; background: #ffffff; color: #1e293b; line-height: 1.5;">
        <div style="margin-bottom: 20px; border-bottom: 2px solid #d4af37; padding-bottom: 12px;">
          <h2 style="margin: 0; color: #0f172a; font-size: 20px;">⚖️ ATRIUM</h2>
          <p style="margin: 4px 0 0; color: #64748b; font-size: 13px;">Publicação Judicial</p>
        </div>

        <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 14px;">
          ${safeProcess ? `<tr><td style="padding: 6px 0; color: #64748b; width: 140px; font-weight: 600;">Processo:</td><td style="padding: 6px 0; color: #0f172a; font-weight: 700;">${safeProcess}</td></tr>` : ''}
          ${safeClient ? `<tr><td style="padding: 6px 0; color: #64748b; font-weight: 600;">Cliente:</td><td style="padding: 6px 0; color: #1e293b;">${safeClient}</td></tr>` : ''}
          ${safeCourt ? `<tr><td style="padding: 6px 0; color: #64748b; font-weight: 600;">Tribunal:</td><td style="padding: 6px 0; color: #1e293b;">${safeCourt}</td></tr>` : ''}
          <tr><td style="padding: 6px 0; color: #64748b; font-weight: 600;">Data da publicação:</td><td style="padding: 6px 0; color: #1e293b;">${safeDate}</td></tr>
          <tr><td style="padding: 6px 0; color: #64748b; font-weight: 600;">Fonte:</td><td style="padding: 6px 0; color: #1e293b;">${safeSource}</td></tr>
          ${safeTerm ? `<tr><td style="padding: 6px 0; color: #64748b; font-weight: 600;">Termo monitorado:</td><td style="padding: 6px 0; color: #1e293b;">${safeTerm}</td></tr>` : ''}
        </table>

        <div style="border-top: 1px solid #e2e8f0; padding-top: 16px; margin-bottom: 20px;">
          <p style="margin: 0 0 10px; font-size: 13px; font-weight: 700; color: #475569; text-transform: uppercase; letter-spacing: 0.05em;">Conteúdo da publicação:</p>
          <div style="background: #f8fafc; padding: 16px; border-radius: 6px; border: 1px solid #e2e8f0; font-size: 13.5px; color: #334155; line-height: 1.6; word-break: break-word;">
            ${safeEscapedText}
          </div>
        </div>

        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0 16px;">
        <p style="margin: 0; font-size: 12px; color: #94a3b8; text-align: center; line-height: 1.4;">
          Esta mensagem foi enviada pelo ATRIUM a partir de uma publicação capturada e armazenada no sistema.
        </p>
      </div>
    `;

    const mailOptions = {
      from: sender,
      to: normalizedRecipient,
      subject,
      text: plain,
      html
    };

    try {
      const info = await transporter.sendMail(mailOptions);
      return {
        ok: true,
        recipient: normalizedRecipient,
        subject,
        messageId: info?.messageId || 'sent',
        message: `Publicação enviada com sucesso para ${normalizedRecipient}.`
      };
    } catch (err) {
      let cleanMessage = 'Falha ao enviar publicação por e-mail. Verifique as configurações SMTP.';
      if (err.message && !err.message.includes(config.password)) {
        cleanMessage = `Falha no envio SMTP: ${err.message}`;
      }
      throw Object.assign(new Error(cleanMessage), { statusCode: 502 });
    }
  }
}

export function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export { maskEmail, isValidEmail };
