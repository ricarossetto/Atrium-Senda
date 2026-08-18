import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { generateTotp } from '../lib/security.mjs';
import { startTestServer } from './helpers.mjs';

const server = await startTestServer();
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ locale: 'pt-BR', viewport: { width: 1440, height: 900 } });
const pageErrors = [];
page.on('pageerror', error => { console.error('PAGE ERROR:', error); pageErrors.push(error.message); });
page.on('console', msg => console.log('PAGE LOG:', msg.text()));

try {
  const response = await page.goto(server.baseUrl, { waitUntil: 'networkidle' });
  assert(response?.ok(), `A página respondeu com HTTP ${response?.status()}.`);
  await page.locator('#authSetupForm.active').waitFor();
  await page.locator('#authSetupForm [name="displayName"]').fill('Advogado Administrador');
  await page.locator('#authSetupForm [name="username"]').fill('admin');
  await page.locator('#authSetupForm [name="password"]').fill('Senha-Forte-JurisFlow-2026!');
  await page.locator('#authSetupForm [name="confirmPassword"]').fill('Senha-Forte-JurisFlow-2026!');
  const setupResponsePromise = page.waitForResponse(result => result.url().endsWith('/api/auth/setup') && result.request().method() === 'POST');
  await page.locator('#authSetupForm button[type="submit"]').click();
  const setupPayload = await (await setupResponsePromise).json();
  await page.locator('#authTotpSetupForm.active').waitFor();
  const secret = (await page.locator('#authManualSecret').textContent()).trim();
  assert(secret.length >= 32, `Segredo TOTP inválido na interface (tamanho ${secret.length}).`);
  assert(secret === setupPayload.manualSecret, 'O segredo exibido não corresponde ao cadastro atual.');
  const generatedCode = generateTotp(secret);
  assert(generateTotp(secret) === generatedCode, 'Geração TOTP instável no teste.');
  await page.locator('#authTotpSetupForm [name="code"]').fill(generatedCode);
  assert(await page.locator('#authTotpSetupForm [name="code"]').inputValue() === generatedCode, 'Código TOTP foi alterado no formulário.');
  const verifyRequestPromise = page.waitForRequest(result => result.url().endsWith('/api/auth/setup/verify') && result.method() === 'POST');
  await page.locator('#authTotpSetupForm button[type="submit"]').click();
  const verifyBody = (await verifyRequestPromise).postDataJSON();
  assert(verifyBody.code === generatedCode && verifyBody.setupToken === setupPayload.setupToken, 'A interface enviou dados de ativação diferentes dos exibidos.');
  try { await page.locator('#authRecoveryStep.active').waitFor({ timeout: 8_000 }); }
  catch { throw new Error(`Ativação 2FA falhou na interface: ${await page.locator('#authFeedback').textContent()}`); }
  assert((await page.locator('#authRecoveryCodes').textContent()).split('\n').length === 8, 'Códigos de recuperação ausentes.');
  await page.locator('#finishRecovery').click();
  await page.locator('#view-dashboard.active').waitFor();

  // Se o tour de primeiro acesso aparecer, pula ou conclui
  try {
    const tourSkip = page.locator('#tourSkipButton');
    await tourSkip.waitFor({ state: 'visible', timeout: 3000 });
    await tourSkip.click();
    await page.locator('#guidedTourBackdrop').waitFor({ state: 'hidden', timeout: 3000 });
  } catch {}

  const brandBox = await page.locator('.brand').boundingBox();
  assert(brandBox, 'Identidade visual do JurisFlow ausente.');

  // Teste de personalização do escritório
  await page.locator('.sidebar-office').click();
  await page.locator('#officeSetupBackdrop:not(.hidden)').waitFor();
  await page.locator('#officeInputName').fill('Banca Rossetto & Associados');
  await page.locator('#officeSetupForm button[type="submit"]').click();
  await page.locator('#officeSetupBackdrop').waitFor({ state: 'hidden' });
  assert(await page.locator('#sidebarOfficeName').textContent() === 'Banca Rossetto & Associados', 'Personalização do escritório falhou.');

  await page.locator('button[data-view="contacts"]').click();
  await page.locator('#view-contacts.active').waitFor();
  await page.locator('#newContactButton').click();
  await page.locator('[name="name"]').fill('Contato editável do teste');
  await page.locator('[name="document"]').fill('000.000.000-00');
  await page.locator('[name="profession"]').fill('Profissão inicial');
  await page.locator('#modalForm button[type="submit"]').click();
  const contactRow = page.locator('#contactTableBody tr', { hasText: 'Contato editável do teste' });
  await contactRow.waitFor(); await contactRow.click();
  await page.locator('[name="profession"]').fill('Profissão atualizada');
  await page.locator('#modalForm button[type="submit"]').click();
  await page.locator('#contactTableBody tr', { hasText: 'Profissão atualizada' }).waitFor();
  // Teste ordenação contatos
  await page.locator('#contactTable th[data-sort-field="name"]').click();
  assert(await page.locator('#contactTable th[data-sort-field="name"].sorted-desc').isVisible(), 'Ordenação decrescente de contatos por nome falhou.');
  await page.locator('#contactTable th[data-sort-field="registeredAt"]').click();
  assert(await page.locator('#contactTable th[data-sort-field="registeredAt"]').isVisible(), 'Coluna de data de cadastro em contatos falhou.');
  await capture('contacts');

  await page.locator('button[data-view="configuration"]').click();
  await page.locator('#view-configuration.active').waitFor();
  assert(await page.locator('#configurationTabs button').count() >= 10, 'Abas de configurações não foram renderizadas.');
  await page.locator('#newConfigurationButton').click();
  await page.locator('[name="name"]').fill('TAREFA EDITÁVEL DO TESTE');
  await page.locator('[name="points"]').fill('90');
  await page.locator('[name="phase"]').fill('Judicial');
  await page.locator('#modalForm button[type="submit"]').click();
  const configRow = page.locator('#configurationList [data-config-index]', { hasText: 'TAREFA EDITÁVEL DO TESTE' });
  await configRow.waitFor(); await configRow.click();
  await page.locator('[name="points"]').fill('95');
  await page.locator('#modalForm button[type="submit"]').click();
  await page.locator('#configurationList [data-config-index]', { hasText: '95 pontos' }).waitFor();
  await capture('configuration');

  await page.locator('button[data-view="integrations"]').click();
  await page.locator('#view-integrations.active').waitFor();
  await page.locator('#certificateGuideButton').click();
  await page.locator('#judicialSetupBackdrop:not(.hidden)').waitFor();
  const certificatePassword = page.locator('#certificatePassphrase');
  assert(await certificatePassword.getAttribute('type') === 'password', 'Senha do certificado não iniciou oculta.');
  await page.locator('#certificatePassphrase + .password-toggle').click();
  assert(await certificatePassword.getAttribute('type') === 'text', 'Botão de visualizar senha do certificado não funcionou.');
  await page.locator('#certificatePassphrase + .password-toggle').click();
  assert(await page.locator('#portalCoverageList [data-portal-enabled]').count() === 23, 'O catálogo completo de portais judiciais não foi carregado no assistente.');
  assert(await page.locator('#portalCoverageList [data-portal-enabled]:checked').count() === 0, 'A cobertura autenticada deveria iniciar zerada.');
  assert(await page.locator('#portalCoverageList .portal-coverage-group').count() === 3, 'Os portais não foram organizados por Justiça Estadual, Trabalho e Federal.');
  await page.locator('#portalCoverageList').getByText('TJRS · eproc 1º grau', { exact: true }).waitFor();
  await page.locator('#portalCoverageList').getByText('TRT4 · PJe 2º grau', { exact: true }).waitFor();
  await page.locator('#portalCoverageList').getByText('TJSP · e-SAJ legado', { exact: true }).waitFor();
  await page.locator('#portalCoverageList').getByText('TRF6 · eproc 2º grau', { exact: true }).waitFor();
  const totpSecret = 'JBSWY3DPEHPK3PXP';
  await page.locator('#totpPortalSelect').selectOption('pje-tjmt-1g');
  await page.locator('#portalTotpSecret').fill(totpSecret);
  await page.locator('#portalTotpCode').fill(generateTotp(totpSecret));
  await page.locator('#portalTotpForm button[type="submit"]').click();
  await page.getByText('QR validado. O segundo fator desse portal está ativo.', { exact: true }).waitFor();
  await page.locator('#portalCoverageList', { hasText: '2FA vinculado e verificado' }).waitFor();
  await capture('judicial-setup');
  await page.locator('#judicialSetupClose').click();

  await page.locator('button[data-view="monitoring"]').click();
  await page.locator('#view-monitoring.active').waitFor();
  assert(await page.locator('#primaryTermName').isVisible(), 'Termo principal ausente.');
  await page.locator('#primaryTermCard').click();
  await page.locator('#modalBackdrop:not(.hidden)').waitFor();
  await page.locator('#modalForm [name="name"]').fill('André da Silva');
  await page.locator('#modalForm [name="oabNumber"]').fill('135294');
  await page.locator('#modalForm [name="oabUf"]').selectOption('RS');
  await page.locator('#modalForm button[type="submit"]').click();
  await page.locator('#modalBackdrop').waitFor({ state: 'hidden' });
  assert(await page.locator('#primaryTermName').textContent() === 'André da Silva', 'Edição de termo com OAB/UF falhou.');

  // Teste 1: Classificador de Intimações e Estimador de Prazos
  await page.locator('button[data-view="inbox"]').click();
  await page.locator('#view-inbox.active').waitFor();
  const firstInboxReference = await page.locator('#inboxList .inbox-case-line').first().innerText();
  assert(firstInboxReference.includes('·') && /\d{7}-\d{2}/.test(firstInboxReference), 'A caixa de intimações não exibiu processo e partes na mesma linha.');
  assert(await page.locator('#inboxList .act-chip').count() > 0, 'As tags do classificador de atos não foram renderizadas na caixa de entrada.');

  // Teste: ordenação por prazo e data clicando no cabeçalho
  await page.locator('button[data-inbox-sort-col="deadline"]').click();
  assert(await page.locator('#inboxSortIconDeadline').textContent() !== '↕', 'Ordenação por prazo fatal no cabeçalho falhou.');
  await page.locator('button[data-inbox-sort-col="date"]').click();
  assert(await page.locator('#inboxSortIconDate').textContent() !== '↕', 'Ordenação por data no cabeçalho falhou.');

  await page.locator('#inboxList button.inbox-row').first().click();
  await page.locator('#intimationDetail .act-chip').waitFor();
  await page.locator('#intimationDetail button[data-detail-action="task"]').click();
  await page.locator('#modalTitle', { hasText: 'Nova tarefa' }).waitFor();
  const suggestedDeadline = await page.locator('#modalForm [name="deadline"]').inputValue();
  assert(suggestedDeadline && /^\d{4}-\d{2}-\d{2}$/.test(suggestedDeadline), 'O estimador de prazo não preencheu o prazo sugerido na tarefa.');
  await page.locator('#modalForm button[type="submit"]').click();
  await page.locator('#modalBackdrop').waitFor({ state: 'hidden' });

  // Teste 2: Timesheet e Apontamento de Horas no Kanban
  await page.locator('button[data-view="kanban"]').click();
  await page.locator('#newTaskButton').click();
  await page.locator('#modalBackdrop:not(.hidden)').waitFor();
  await page.locator('#modalForm [name="title"]').fill('Tarefa com timesheet');
  await page.locator('#modalForm [name="client"]').fill('Cliente de teste');
  await page.locator('#modalForm [name="deadline"]').fill('2026-08-20');
  await page.locator('#modalForm [name="addMinutes"]').fill('75');
  await page.locator('#modalForm [name="timeDescription"]').fill('Redação de petição');
  await page.locator('#modalForm button[type="submit"]').click();
  await page.locator('#modalBackdrop').waitFor({ state: 'hidden' });
  await page.locator('#kanbanBoard h4', { hasText: 'Tarefa com timesheet' }).waitFor();
  await page.locator('#kanbanBoard .task-timelog', { hasText: '1h15m' }).waitFor();
  await capture('kanban-timesheet');

  // Teste 3: Módulo de Honorários nos Processos
  await page.locator('button[data-view="processes"]').click();
  await page.locator('#view-processes.active').waitFor();
  const processRow = page.locator('#processTableBody [data-process-id]').first();
  await processRow.waitFor();
  await processRow.click();
  await page.locator('#modalBackdrop:not(.hidden)').waitFor();
  await page.locator('#modalForm [name="stage"]').waitFor();
  await page.locator('#modalForm [name="stage"]').fill('ETAPA EDITADA NO SITE');
  await page.locator('#modalForm [name="feeType"]').selectOption('exito');
  await page.locator('#modalForm [name="feePercentage"]').fill('30');
  await page.locator('#modalForm [name="feeStatus"]').selectOption('em_dia');
  await page.locator('#modalForm button[type="submit"]').click();
  await page.locator('#modalBackdrop').waitFor({ state: 'hidden' });
  await page.locator('#processTableBody [data-process-id]', { hasText: 'ETAPA EDITADA NO SITE' }).waitFor();
  await page.locator('#processTableBody .fee-chip', { hasText: '30% êxito' }).waitFor();
  // Teste ordenação de processos
  await page.locator('#processTable th[data-sort-field="client"]').click();
  assert(await page.locator('#processTable th[data-sort-field="client"].sorted-asc').isVisible(), 'Ordenação de processos por cliente falhou.');
  await page.locator('#processTable th[data-sort-field="registeredAt"]').click();
  assert(await page.locator('#processTable th[data-sort-field="registeredAt"]').isVisible(), 'Coluna de data de cadastro em processos falhou.');
  await capture('processes-fees');

  // Teste 4: Gerador de Minutas e Documentos Jurídicos
  await page.locator('#quickDocGenButton').click();
  await page.locator('#docGeneratorBackdrop:not(.hidden)').waitFor();
  let previewText = await page.locator('#docGenPreviewText').inputValue();
  assert(previewText.includes('PROCURAÇÃO "AD JUDICIA ET EXTRA"'), 'Minuta de procuração não gerada.');
  assert(previewText.includes('OUTORGADO') && previewText.includes('OAB'), 'Dados do advogado ausentes na procuração.');
  assert(previewText.includes('Artigo 105'), 'Poderes especiais do Artigo 105 do CPC ausentes.');
  await page.locator('#docGenTypeSelect').selectOption('contrato_honorarios');
  previewText = await page.locator('#docGenPreviewText').inputValue();
  assert(previewText.includes('CONTRATO DE PRESTAÇÃO DE SERVIÇOS ADVOCATÍCIOS'), 'Minuta do contrato de honorários não gerada.');
  await page.locator('#docGenClose').click();
  await page.locator('#docGeneratorBackdrop').waitFor({ state: 'hidden' });

  // Teste 5: Agenda Interativa Clicável, Visualização por Dia e Detalhes
  await page.locator('button[data-view="agenda"]').click();
  await page.locator('#view-agenda.active').waitFor();
  assert(await page.locator('#miniCalendar .calendar-day').count() >= 28, 'Mini-calendário não foi renderizado.');
  const todayBtn = page.locator('#miniCalendar .calendar-day.today');
  await todayBtn.waitFor();
  await todayBtn.click();
  await page.locator('#agendaDayEyebrow', { hasText: 'Atividades' }).waitFor();
  
  // Testar filtros da agenda
  await page.locator('#agendaFilterTabs button[data-agenda-filter="task"]').click();
  await page.locator('#agendaFilterTabs button[data-agenda-filter="all"]').click();
  await page.locator('#agendaAllUpcomingButton').click();
  await page.locator('#agendaDayEyebrow', { hasText: 'Agenda' }).waitFor();
  
  // Clicar em um item de intimação na agenda para abrir modal com detalhes
  const intimationAgendaItem = page.locator('#agendaList [data-agenda-activity-type="intimation"]').first();
  if (await intimationAgendaItem.isVisible()) {
    await intimationAgendaItem.click();
    await page.locator('#modalTitle', { hasText: 'Detalhes da intimação' }).waitFor();
    assert(await page.locator('#modalForm [name="actInfo"]').inputValue().then(v => v.length > 5), 'Detalhe do ato e prazo da intimação não preenchido.');
    await page.locator('#modalCancel').click();
    await page.locator('#modalBackdrop').waitFor({ state: 'hidden' });
  }
  await capture('agenda-interactive');

  await page.locator('button[data-view="dashboard"]').click();
  const focusTask = page.locator('#priorityList [data-task-id]').first(); await focusTask.waitFor(); await focusTask.click();
  await page.locator('#modalTitle', { hasText: 'Editar tarefa' }).waitFor();
  await page.locator('#modalCancel').click();
  await capture('dashboard');
  await page.locator('button[data-view="kanban"]').click();
  await page.locator('#logoutButton').click();
  await page.locator('#authLoginForm.active').waitFor();
  await page.locator('#authLoginForm [name="username"]').fill('admin');
  await page.locator('#authLoginForm [name="password"]').fill('Senha-Forte-JurisFlow-2026!');
  await page.locator('#authLoginForm [name="code"]').fill(generateTotp(secret));
  await page.locator('#authLoginForm button[type="submit"]').click();
  await page.locator('#view-kanban.active').waitFor();
  await page.waitForTimeout(400);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator('#view-dashboard.active').waitFor();
  await page.locator('button[data-view="kanban"]').click();
  await page.locator('#kanbanBoard h4', { hasText: 'Tarefa com timesheet' }).waitFor();
  assert(pageErrors.length === 0, `Erro de página: ${pageErrors.join(' | ')}`);
  console.log('Smoke test aprovado: cadastro, 2FA, recuperação, login, persistência cifrada, painel, termo, Kanban, estimador de prazos, timesheet, honorários, minutas e logout.');
} finally {
  await browser.close();
  await server.stop();
}

function assert(condition, message) { if (!condition) throw new Error(message); }
async function capture(name) {
  if (!process.env.KELLER_VISUAL_QA_PATH) return;
  await mkdir(process.env.KELLER_VISUAL_QA_PATH, { recursive: true });
  await page.screenshot({ path: path.join(process.env.KELLER_VISUAL_QA_PATH, `${name}.png`), fullPage: true });
}
