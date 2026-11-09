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
  await page.locator('#officeInviteForm').waitFor();
  assert.equal(await page.locator('[data-config-section="office"]').getAttribute('class'), 'active');

  const name = `Equipe Sintética ${Date.now()}`;
  await page.locator('#officeTeamName').fill(name);
  await page.locator('#officeTeamDescription').fill('Equipe criada em teste sintético.');
  const member = page.locator('[data-office-team-member]').first();
  if (await member.count()) await member.check();
  await page.locator('#officeTeamForm button[type="submit"]').click();
  await page.locator('[data-office-team-id]').filter({ hasText: name }).waitFor();

  const email = `convite-${Date.now()}@example.test`;
  await page.locator('#officeInviteName').fill('Pessoa Convidada Teste');
  await page.locator('#officeInviteEmail').fill(email);
  await page.locator('#officeInviteForm button[type="submit"]').click();
  await page.locator('#officeInviteFeedback strong').waitFor();
  const linkText = await page.locator('#officeInviteFeedback').innerText();
  assert.match(linkText, /\/login#invite=/);

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
  console.log('  OK: painel ativo, convite gerado e equipe criada com geometria estável.');
  console.log('\n[PASS] Painel Escritório validado no app real.');
} finally {
  await session.stop();
}
