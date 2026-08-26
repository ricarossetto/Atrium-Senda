import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { SecurityManager, generateTotp } from '../lib/security.mjs';
import { EmailService } from '../lib/email/email-service.mjs';
import { postJson, startTestServer } from './helpers.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

console.log('\n===============================================================');
console.log('  ATRIUM — SUÍTE DE TESTES: MOTOR SMTP E E-MAIL SEGURO');
console.log('===============================================================\n');

// 1. Testes Unitários do EmailService com Mock Transporter
console.log('[1/2] Testando EmailService isolado (criptografia, validação e sanitização)...');

const mockSentMessages = [];
const mockTransporter = {
  verify: async () => true,
  sendMail: async (opts) => {
    mockSentMessages.push(opts);
    return { messageId: 'mock-msg-12345' };
  }
};

const fakeFailingTransporter = {
  verify: async () => {
    const err = new Error('Invalid login: 535-5.7.8 Username and Password not accepted');
    err.code = 'EAUTH';
    err.responseCode = 535;
    throw err;
  },
  sendMail: async () => {
    throw new Error('Connection lost');
  }
};

const unitTestDir = await mkdtemp(path.join(tmpdir(), 'atrium-email-unit-test-'));

try {
  const testSec = new SecurityManager({
    dataDirectory: unitTestDir,
    sessionSecret: 'a'.repeat(48),
    encryptionKey: Buffer.alloc(32, 1).toString('base64'),
    secureCookies: false
  });
  await testSec.init();

  const emailService = new EmailService({
    dataDirectory: unitTestDir,
    securityManager: testSec,
    testTransporter: mockTransporter
  });

  // Teste de status inicial não configurado
  const initialStatus = await emailService.getStatus();
  assert.equal(initialStatus.configured, false, 'Status inicial deveria ser não configurado.');
  assert.equal(initialStatus.userMasked, '', 'Usuário mascarado inicial deve ser vazio.');

  // Teste de validação de campos obrigatórios
  await assert.rejects(
    () => emailService.configure({ host: '', port: 465, user: 'test', password: '123', fromAddress: 'a@b.com' }),
    /Informe o servidor SMTP/,
    'Deveria rejeitar host vazio.'
  );
  await assert.rejects(
    () => emailService.configure({ host: 'smtp.exemplo.com', port: 99999, user: 'test', password: '123', fromAddress: 'a@b.com' }),
    /Informe uma porta SMTP válida/,
    'Deveria rejeitar porta inválida.'
  );
  await assert.rejects(
    () => emailService.configure({ host: 'smtp.exemplo.com', port: 465, user: '', password: '123', fromAddress: 'a@b.com' }),
    /Informe o usuário/,
    'Deveria rejeitar usuário vazio.'
  );
  await assert.rejects(
    () => emailService.configure({ host: 'smtp.exemplo.com', port: 465, user: 'test', password: '', fromAddress: 'a@b.com' }),
    /Informe a senha SMTP/,
    'Deveria rejeitar senha vazia.'
  );
  await assert.rejects(
    () => emailService.configure({ host: 'smtp.exemplo.com', port: 465, user: 'test', password: '123', fromAddress: 'invalido' }),
    /Informe um e-mail de remetente válido/,
    'Deveria rejeitar e-mail de remetente inválido.'
  );

  // Teste de configuração com sucesso
  const configResult = await emailService.configure({
    host: 'smtp.escritorio.adv.br',
    port: 465,
    secure: true,
    user: 'advogado.titular@escritorio.adv.br',
    password: 'Segredo-Ultra-Secreto-12345!',
    fromName: 'Dr. Advogado Titular',
    fromAddress: 'contato@escritorio.adv.br'
  });

  assert.equal(configResult.configured, true, 'Deveria estar configurado após configure().');
  assert.equal(configResult.host, 'smtp.escritorio.adv.br', 'Host retornado incorreto.');
  assert.equal(configResult.port, 465, 'Porta retornada incorreta.');
  assert.equal(configResult.secure, true, 'Flag secure retornada incorreta.');
  assert.equal(configResult.userMasked, 'ad***@escritorio.adv.br', 'Usuário não foi mascarado corretamente.');
  assert.equal(configResult.password, undefined, 'A senha NUNCA pode ser devolvida no status.');
  assert.equal(configResult.fromName, 'Dr. Advogado Titular', 'Nome do remetente incorreto.');
  assert.equal(configResult.fromAddress, 'contato@escritorio.adv.br', 'E-mail do remetente incorreto.');

  // Teste de persistência criptografada em repouso
  const emailFile = await readFile(path.join(unitTestDir, 'email-integrations.json'), 'utf8');
  assert(!emailFile.includes('Segredo-Ultra-Secreto-12345!'), 'A senha SMTP ficou em texto plano no disco!');
  assert(emailFile.includes('aes-256-gcm'), 'O envelope de credenciais de e-mail não utiliza AES-256-GCM.');

  // Teste de envio de e-mail de teste
  const testSendResult = await emailService.sendTestEmail({ recipient: 'cliente.teste@juris.adv.br' });
  assert.equal(testSendResult.ok, true, 'Envio de teste deveria retornar ok: true.');
  assert.equal(mockSentMessages.length, 1, 'Deveria ter enviado 1 mensagem de teste.');
  const sentMsg = mockSentMessages[0];
  assert.equal(sentMsg.to, 'cliente.teste@juris.adv.br', 'Destinatário da mensagem incorreto.');
  assert.equal(sentMsg.from, '"Dr. Advogado Titular" <contato@escritorio.adv.br>', 'Remetente formatado incorreto.');
  assert.equal(sentMsg.subject, 'ATRIUM — Teste de integração de e-mail', 'Assunto do e-mail de teste incorreto.');
  assert(sentMsg.text.includes('A integração de e-mail do Atrium está funcionando corretamente'), 'Corpo do texto incorreto.');

  // Teste de erro amigável/higienizado em caso de falha SMTP
  const failingService = new EmailService({
    dataDirectory: unitTestDir,
    securityManager: testSec,
    testTransporter: fakeFailingTransporter
  });
  await assert.rejects(
    () => failingService.configure({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      user: 'usuario@gmail.com',
      password: 'senha-errada-secreta',
      fromAddress: 'usuario@gmail.com'
    }),
    (err) => {
      assert(!err.message.includes('senha-errada-secreta'), 'O erro vazou a senha do usuário!');
      assert(err.message.includes('Falha de autenticação SMTP'), 'Deveria conter mensagem amigável.');
      return true;
    },
    'Deveria rejeitar com erro amigável sem expor segredos.'
  );

  console.log('✓ EmailService isolado 100% aprovado.');
} finally {
  await rm(unitTestDir, { recursive: true, force: true });
}

// 2. Testes de Integração HTTP via Servidor Real
console.log('\n[2/2] Testando endpoints HTTP de e-mail com autenticação e CSRF...');

const server = await startTestServer();
const adminPassword = 'Senha-Segura-2026!';

try {
  // Testes sem autenticação (deve retornar 401)
  let res = await fetch(`${server.baseUrl}/api/integrations/email/status`);
  assert.equal(res.status, 401, 'Status de e-mail acessível sem autenticação!');

  res = await postJson(`${server.baseUrl}/api/integrations/email/configure`, { host: 'smtp.test.com' });
  assert.equal(res.status, 401, 'Configure de e-mail acessível sem autenticação!');

  res = await postJson(`${server.baseUrl}/api/integrations/email/test`, { recipient: 'test@test.com' });
  assert.equal(res.status, 401, 'Test de e-mail acessível sem autenticação!');

  // Setup do Administrador
  res = await postJson(`${server.baseUrl}/api/auth/setup`, { username: 'admin', displayName: 'Admin Titular', password: adminPassword });
  const setupData = await res.json();
  res = await postJson(`${server.baseUrl}/api/auth/setup/verify`, { setupToken: setupData.setupToken, code: generateTotp(setupData.manualSecret) });
  const verified = await res.json();
  const cookie = res.headers.get('set-cookie').split(';')[0];
  const csrf = verified.csrfToken;

  // Status inicial autenticado
  res = await fetch(`${server.baseUrl}/api/integrations/email/status`, { headers: { Cookie: cookie } });
  assert.equal(res.status, 200, 'Status autenticado falhou.');
  let statusBody = await res.json();
  assert.equal(statusBody.ok, true);
  assert.equal(statusBody.status.configured, false);

  // Tentativa de POST sem CSRF (deve retornar 403)
  res = await postJson(`${server.baseUrl}/api/integrations/email/configure`, {
    host: 'smtp.teste.com',
    port: 465,
    secure: true,
    user: 'admin@teste.com',
    password: 'AppPassword123!',
    fromAddress: 'admin@teste.com'
  }, { Cookie: cookie });
  assert.equal(res.status, 403, 'POST de configuração foi aceito sem token CSRF!');

  res = await postJson(`${server.baseUrl}/api/integrations/email/test`, {
    recipient: 'destino@teste.com'
  }, { Cookie: cookie });
  assert.equal(res.status, 403, 'POST de teste de e-mail foi aceito sem token CSRF!');

  // Teste de validação de campos inválidos com CSRF
  res = await postJson(`${server.baseUrl}/api/integrations/email/configure`, {
    host: 'smtp.teste.com',
    port: 465,
    secure: true,
    user: 'admin@teste.com',
    password: 'AppPassword123!',
    fromAddress: 'endereco-invalido'
  }, { Cookie: cookie, 'X-CSRF-Token': csrf });
  assert.equal(res.status, 400, 'Aceitou e-mail de remetente inválido.');

  res = await postJson(`${server.baseUrl}/api/integrations/email/test`, {
    recipient: 'destinatario-invalido'
  }, { Cookie: cookie, 'X-CSRF-Token': csrf });
  assert.equal(res.status, 400, 'Aceitou e-mail de destinatário inválido.');

  console.log('✓ Endpoints HTTP de e-mail 100% validados com autenticação e CSRF.');
} finally {
  await server.stop();
}

console.log('\n===============================================================');
console.log('  SUÍTE DE TESTES DE E-MAIL (SMTP): 100% APROVADA!');
console.log('===============================================================\n');
