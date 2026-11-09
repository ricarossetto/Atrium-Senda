import assert from 'node:assert/strict';
import { prepareUiV2Page, startUiV2Session, switchUiV2View } from './ui_v2_helpers.mjs';

console.log('--- Iniciando Testes: papéis com permissões e carteira por responsável ---');

const session = await startUiV2Session();
try {
  const context = await session.createContext({ viewport: { width: 1250, height: 900 } });
  const { page, pageErrors } = await prepareUiV2Page(context, session.server.baseUrl, { theme: 'light' });
  const dialogs = [];
  page.on('dialog', dialog => {
    dialogs.push(dialog.message());
    dialog.accept();
  });

  await page.route('**/api/office/finance/portfolio', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      ok: true,
      rows: [{ responsible: 'Advogada Teste', processes: 2, fees: 1234.56, requisitions: 0 }],
      totals: { processes: 2, fees: 1234.56, requisitions: 0 }
    })
  }));

  await switchUiV2View(page, 'configuration');
  await page.locator('[data-config-section="office"]').click();
  await page.locator('.office-role-list').waitFor();

  // Papel padrão mostra as permissões, sem deixar editar.
  const factory = page.locator('[data-office-role-id="office_manager"]');
  await factory.locator('summary').click();
  assert.ok(await factory.locator('[data-office-role-permission]').first().isDisabled(), 'papel padrão não é editável');
  assert.match(await factory.innerText(), /Padrão do sistema/);
  assert.equal(await factory.locator('[data-office-role-save]').count(), 0);

  // Criar papel próprio com permissão de risco baixo não pede confirmação.
  await page.locator('.office-role-new summary').click();
  await page.locator('#officeRoleName').fill('Controladoria');
  await page.locator('#officeRoleDescription').fill('Controle de prazos');
  await page.locator('#officeRoleForm [data-office-role-permission][value="tasks.read_all"]').check();
  await page.locator('#officeRoleForm button[type="submit"]').click();
  const criado = page.locator('[data-office-role-id^="role-"]');
  await criado.waitFor();
  assert.match(await criado.innerText(), /Controladoria/);
  assert.match(await criado.innerText(), /1 permissão/);
  assert.equal(dialogs.length, 0, 'sem risco crítico não há confirmação');

  // Conceder permissão crítica pede confirmação e fica salva.
  await criado.locator('summary').click();
  await criado.locator('[data-office-role-permission][value="roles.manage"]').check();
  await criado.locator('[data-office-role-save]').click();
  await page.waitForFunction(() => /2 permissões/.test(document.querySelector('[data-office-role-id^="role-"]')?.innerText || ''));
  assert.match(dialogs[0], /controle administrativo/);

  // Nome repetido mostra o erro perto do formulário, sem apagar o que foi digitado.
  await page.locator('.office-role-new summary').click();
  await page.locator('#officeRoleName').fill('Controladoria');
  await page.locator('#officeRoleForm button[type="submit"]').click();
  await page.waitForFunction(() => /Já existe/.test(document.getElementById('officeRoleFeedback')?.textContent || ''));
  assert.equal(await page.locator('#officeRoleName').inputValue(), 'Controladoria');

  // Desativar exige confirmação e tira o papel da lista.
  await page.locator('[data-office-role-id^="role-"] summary').click();
  await page.locator('[data-office-role-deactivate]').click();
  await page.waitForFunction(() => !document.querySelector('[data-office-role-id^="role-"]'));
  assert.match(dialogs[dialogs.length - 1], /Desativar o papel "Controladoria"/);

  // Carteira: valores em reais e aviso de que não é previsão.
  const carteira = page.locator('[data-office-portfolio]');
  await carteira.scrollIntoViewIfNeeded();
  const texto = (await carteira.innerText()).replace(/\s+/g, ' ');
  assert.match(texto, /Advogada Teste/);
  assert.match(texto, /R\$ 1\.234,56/);
  assert.match(texto, /Não é previsão/);

  // Auditoria de acesso vem do servidor e já mostra os papéis mexidos acima.
  await page.locator('.office-role-new summary').waitFor();
  const auditoria = page.locator('[data-office-access-audit]');
  await auditoria.waitFor();
  assert.match(await auditoria.innerText(), /Papel do escritório (criado|atualizado|desativado)/);

  // Revisão: equipe excluída aparece com orientação, e sem caso diz isso.
  const revisao = page.locator('[data-office-hygiene]');
  assert.match(await revisao.innerText(), /Nenhum processo aponta para equipe excluída/);

  assert.deepEqual(pageErrors, []);
  await context.close();

  // Sem permissão de financeiro, a carteira não aparece e não há buraco.
  const semFinanceiro = await session.createContext({ viewport: { width: 390, height: 844 } });
  const mobile = await prepareUiV2Page(semFinanceiro, session.server.baseUrl, { theme: 'dark' });
  await mobile.page.route('**/api/office/finance/portfolio', route => route.fulfill({ status: 403, contentType: 'application/json', body: '{"ok":false}' }));
  await switchUiV2View(mobile.page, 'configuration');
  await mobile.page.locator('[data-config-section="office"]').click();
  await mobile.page.locator('.office-role-list').waitFor();
  assert.equal(await mobile.page.locator('[data-office-portfolio]').count(), 0);
  const overflow = await mobile.page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  assert.ok(overflow <= 2, `sem rolagem horizontal no celular (${overflow})`);
  await semFinanceiro.close();
} finally {
  await session.stop();
}

console.log('[PASS] Papéis com permissões e carteira por responsável.');
