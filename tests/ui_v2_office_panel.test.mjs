import assert from 'node:assert/strict';
import { prepareUiV2Page, startUiV2Session, switchUiV2View } from './ui_v2_helpers.mjs';

console.log('--- Iniciando Teste: painel Escritório, convite e equipe ---');

const session = await startUiV2Session({ viewport: { width: 1440, height: 900 } });
try {
  const context = await session.createContext();
  const { page, pageErrors } = await prepareUiV2Page(context, session.server.baseUrl, { theme: 'light' });
  await switchUiV2View(page, 'configuration');
  await page.locator('[data-config-section="office"]').click();
  await page.locator('#officeTeamForm').waitFor();
  await page.locator('#officeNewMemberForm').waitFor();
  assert.equal(await page.locator('[data-config-section="office"]').getAttribute('class'), 'active');

  const name = `Equipe Sintética ${Date.now()}`;
  await page.locator('#officeTeamName').fill(name);
  await page.locator('#officeTeamDescription').fill('Equipe criada em teste sintético.');
  const member = page.locator('[data-office-team-member]').first();
  if (await member.count()) await member.check();
  await page.locator('#officeTeamForm button[type="submit"]').click();
  await page.locator('[data-office-team-id]').filter({ hasText: name }).waitFor();

  const suffix = Date.now();
  await page.locator('#officeNewMemberUsername').fill(`pessoa.${suffix}`);
  await page.locator('#officeNewMemberName').fill('Pessoa Criada Teste');
  await page.locator('#officeNewMemberEmail').fill(`pessoa-${suffix}@example.test`);
  await page.locator('#officeNewMemberPassword').fill('Senha-Sintetica-2026!');
  const registerResponsePromise = page.waitForResponse(response => response.url().endsWith('/api/auth/register') && response.request().method() === 'POST');
  await page.locator('#officeNewMemberForm button[type="submit"]').click();
  const registerResponse = await registerResponsePromise;
  const registerBody = await registerResponse.json();
  assert.equal(registerResponse.status(), 200, JSON.stringify(registerBody));
  await page.locator('#officeNewMemberFeedback .office-new-member-token').waitFor({ timeout: 15000 });
  assert.match(await page.locator('#officeNewMemberFeedback').innerText(), /A conta foi criada/);
  assert.ok((await page.locator('#officeNewMemberFeedback .office-new-member-token').textContent()).trim().length > 0);
  const newMemberFeedback = await page.locator('#officeNewMemberFeedback').innerText();
  assert.match(newMemberFeedback, /A conta foi criada/, `Feedback do cadastro: ${newMemberFeedback}`);
  assert.ok((await page.locator('#officeNewMemberFeedback .office-new-member-token').textContent()).trim().length > 0);
  assert.match(await page.locator('#officeNewMemberFeedback').innerText(), /aguarda ativação pelo membro/i);

  const geometry = await page.evaluate(() => {
    const panel = document.querySelector('.office-panel');
    const card = document.querySelector('.office-card');
    const team = document.querySelector('[data-office-team-id]');
    const rect = element => {
      const box = element.getBoundingClientRect();
      return { x: Math.round(box.x), y: Math.round(box.y), width: Math.round(box.width), height: Math.round(box.height) };
    };
    return {
      overflow: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth,
      panel: panel ? rect(panel) : null,
      card: card ? rect(card) : null,
      team: team ? rect(team) : null,
      cards: document.querySelectorAll('.office-card').length,
      activeViews: [...document.querySelectorAll('.view.active')].map(view => view.id)
    };
  });
  assert.equal(geometry.overflow, 0, 'painel do escritório não cria overflow global');
  assert.equal(geometry.activeViews.length, 1);
  assert.equal(geometry.activeViews[0], 'view-configuration');
  assert.ok(geometry.cards >= 4, 'painel tem os cartões de membros, convites, equipes e papéis');
  assert.ok(geometry.panel.width <= 1440);
  assert.deepEqual(pageErrors, []);

  await page.screenshot({ path: 'C:\\Users\\RICARD~1\\AppData\\Local\\Temp\\opencode\\office-panel-light-1440.png', fullPage: true });
  const mobileContext = await session.createContext({ viewport: { width: 390, height: 844 } });
  try {
    const mobile = await prepareUiV2Page(mobileContext, session.server.baseUrl, { theme: 'light' });
    await switchUiV2View(mobile.page, 'configuration');
    await mobile.page.locator('[data-config-section="office"]').click();
    await mobile.page.locator('#officeTeamForm').waitFor();
    const mobileOverflow = await mobile.page.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth);
    assert.equal(mobileOverflow, 0, 'painel do escritório não cria overflow no mobile');
    assert.deepEqual(mobile.pageErrors, []);
    await mobile.page.locator('#officeTeamForm').scrollIntoViewIfNeeded();
    await mobile.page.screenshot({ path: 'C:\\Users\\RICARD~1\\AppData\\Local\\Temp\\opencode\\office-panel-light-390.png' });
    await mobileContext.close();
  } catch (error) {
    await mobileContext.close();
    throw error;
  }
  console.log('  OK: painel ativo, membro pendente criado e equipe criada com geometria estável.');
  console.log('\n[PASS] Painel Escritório validado no app real.');
} finally {
  await session.stop();
}
