import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { CNJ_SEGMENTS, CNJ_TRIBUNALS } from '../js/core/cnj.js';
import { startUiV2Session, prepareUiV2Page } from './ui_v2_helpers.mjs';

const OUTPUT = fs.mkdtempSync(path.join(os.tmpdir(), 'atrium-wizard-courts-'));
const UNKNOWN = '<img src=x onerror="window.__courtInjection=1">Órgão sintético de nome muito extenso ' + 'X'.repeat(120);
const LEGACY = ['tjrs', 'trt4', 'trf4', 'tjdft'];
const ADDED = ['tjsp', 'tjmt', 'tre-sp', 'trf6', 'tst'];
const INITIAL = { courts: [...LEGACY, UNKNOWN], teamSize: '2-5', processVolume: '50-200', aiInterest: 'sim' };
const EXPECTED = { ...INITIAL, courts: [...INITIAL.courts, ...ADDED] };
const session = await startUiV2Session();

async function seed(page, profile) {
  assert.equal(await page.evaluate(async data => {
    const { App, Store } = window.Atrium;
    App.closeGuidedTour();
    sessionStorage.removeItem('atrium_pending_a1_onboarding');
    sessionStorage.setItem('atrium_pending_setup_wizard', 'true');
    Store.state.settings.hasA1Certificate = false;
    Store.state.settings.workspaceProfile = data;
    delete Store.state.settings.onboardingWizardCompleted;
    Store.save();
    return Store.flush();
  }, profile), true);
}

async function openCourts(page) {
  assert.equal(await page.evaluate(() => window.Atrium.App.openSetupWizard()), true);
  await page.locator('#setupWizardNext').click();
  assert.equal(await page.evaluate(() => document.activeElement.id), 'setupWizardCourtsToggle');
}

async function summary(page) {
  for (let step = 0; step < 4; step++) await page.locator('#setupWizardNext').click();
  await page.locator('#setupWizardSummary').waitFor();
}

async function evidence(page, name) {
  await page.evaluate(() => document.fonts.ready);
  const data = await page.evaluate(() => {
    const box = element => {
      const r = element.getBoundingClientRect();
      return { x: r.x, y: r.y, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
    };
    const dialog = document.querySelector('#setupWizardBackdrop [role="dialog"]');
    const body = dialog.querySelector('.setup-wizard-body');
    const footer = dialog.querySelector('footer');
    const search = document.getElementById('setupWizardCourtSearch');
    const actionable = [...dialog.querySelectorAll('button, input[type="search"], label[data-wizard-court-row]')]
      .filter(e => e.getClientRects().length && !e.closest('[hidden]'))
      .filter(e => { const r = e.getBoundingClientRect(); return r.y >= body.getBoundingClientRect().y && r.bottom <= body.getBoundingClientRect().bottom || footer.contains(e); });
    return {
      dialog: box(dialog), body: box(body), footer: box(footer), header: box(dialog.querySelector('header')),
      viewport: { width: innerWidth, height: innerHeight },
      overflow: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth,
      searchFont: getComputedStyle(search).fontSize,
      summaryHeight: box(document.getElementById('setupWizardCourtSelection')).height,
      buttons: [...footer.querySelectorAll('button')].map(box),
      targets: actionable.map(e => {
        const r = e.getBoundingClientRect();
        const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
        return { id: e.id || e.textContent, ...box(e), hit: e === hit || e.contains(hit) };
      }),
      activeView: document.querySelector('.view.active')?.id,
      inert: document.getElementById('appShell').hasAttribute('inert')
    };
  });
  fs.writeFileSync(path.join(OUTPUT, `${name}.json`), JSON.stringify(data, null, 2));
  await page.screenshot({ path: path.join(OUTPUT, `${name}.png`) });
  assert.equal(data.activeView, 'view-dashboard');
  assert.equal(data.inert, true);
  assert.ok(data.overflow <= 2);
  assert.ok(data.dialog.x >= -2 && data.dialog.right <= data.viewport.width + 2);
  assert.ok(data.dialog.y >= -2 && data.dialog.bottom <= data.viewport.height + 2);
  assert.ok(data.header.bottom <= data.body.y + 2);
  assert.ok(data.body.bottom <= data.footer.y + 2);
  assert.ok(data.footer.bottom <= data.dialog.bottom + 2);
  assert.ok(data.buttons[0].right <= data.buttons[1].x + 2);
  assert.ok(parseFloat(data.searchFont) >= 16);
  assert.ok(data.summaryHeight < 100, 'Muitas seleções não inflam o resumo compacto.');
  for (const target of data.targets) {
    assert.ok(target.height >= 44, `${target.id}: alvo mínimo 44px`);
    assert.equal(target.hit, true, `${target.id}: hit-test real`);
  }
}

try {
  console.log(`Evidências: ${OUTPUT}`);
  for (const [status, theme] of [[500, 'light'], [409, 'dark']]) {
    const context = await session.createContext({ viewport: { width: 1280, height: 844 }, reducedMotion: 'reduce' });
    try {
      const { page, pageErrors } = await prepareUiV2Page(context, session.server.baseUrl, { theme });
      await seed(page, INITIAL);
      const initialState = await page.evaluate(() => structuredClone(window.Atrium.Store.state.settings));
      const operational = [];
      let posts = 0;
      page.on('request', request => {
        const pathname = new URL(request.url()).pathname;
        if (pathname.startsWith('/api/') && /judicial|integrations|sync|email/.test(pathname)) operational.push(pathname);
        if (pathname === '/api/state' && request.method() === 'POST') posts++;
      });
      await openCourts(page);
      await page.keyboard.press('Enter');
      assert.equal(await page.evaluate(() => document.activeElement.id), 'setupWizardCourtSearch');
      const catalogue = await page.locator('[data-wizard-court-row]').evaluateAll(rows => rows.map(row => ({ value: row.querySelector('input').value, label: row.querySelector('span').textContent, group: row.closest('fieldset').querySelector('legend').textContent })));
      assert.equal(catalogue.length, 108);
      const byValue = (a, b) => a.value.localeCompare(b.value);
      assert.deepEqual(catalogue.slice(0, 107).sort(byValue), Object.entries(CNJ_TRIBUNALS).map(([segment, tribunal]) => ({ value: tribunal.court.toLowerCase(), label: `${tribunal.court} · ${tribunal.name}`, group: CNJ_SEGMENTS[segment.split('.')[0]].name })).sort(byValue));
      assert.equal(new Set(catalogue.slice(0, 107).map(item => item.value)).size, 107);
      assert.equal(await page.locator('#setupWizardCourts img').count(), 0);
      assert.equal(await page.evaluate(() => window.__courtInjection), undefined);
      for (const value of LEGACY) assert.equal(await page.locator(`[data-wizard-option][value="${value}"]`).isChecked(), true);
      const unknown = page.locator('[data-wizard-option]').last();
      assert.equal(await unknown.inputValue(), UNKNOWN);
      assert.equal(await unknown.isChecked(), true);
      const search = page.locator('#setupWizardCourtSearch');
      await search.fill('justica eleitoral');
      assert.equal(await page.locator('[data-wizard-court-row]:not([hidden])').count(), 28);
      await search.fill('da 6ª regiao');
      assert.equal(await page.locator('[data-wizard-court-row]:not([hidden])').count(), 2);
      for (const value of ADDED) {
        await search.fill(value.toUpperCase());
        await page.locator(`[data-wizard-option][value="${value}"]`).check();
      }
      await search.fill('TST');
      await page.locator('[data-wizard-option][value="tst"]').focus();
      await page.keyboard.press('Space');
      assert.equal(await page.locator('[data-wizard-option][value="tst"]').isChecked(), false);
      await page.keyboard.press('Space');
      assert.equal(await page.locator('[data-wizard-option][value="tst"]').isChecked(), true);
      await page.locator('#setupWizardNext').focus();
      await page.keyboard.press('Tab');
      assert.equal(await page.evaluate(() => document.activeElement.id), 'setupWizardSkip');
      await page.keyboard.press('Shift+Tab');
      assert.equal(await page.evaluate(() => document.activeElement.id), 'setupWizardNext');
      await search.fill('inexistente-sintetico');
      assert.equal(await page.locator('[data-wizard-court-row]:not([hidden])').count(), 0);
      assert.match(await page.locator('#setupWizardCourtResults').textContent(), /Nenhum tribunal/);
      assert.match(await page.locator('#setupWizardCourtSelection').textContent(), /10 selecionado/);
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('#setupWizardCourts').isVisible(), false);
      assert.equal(await page.locator('#setupWizardBackdrop').isVisible(), true);
      assert.equal(await page.evaluate(() => document.activeElement.id), 'setupWizardCourtsToggle');
      await page.locator('#setupWizardNext').click();
      await page.locator('#setupWizardBack').click();
      await page.locator('#setupWizardCourtsToggle').click();
      for (const value of [...LEGACY, ...ADDED]) assert.equal(await page.locator(`[data-wizard-option][value="${value}"]`).isChecked(), true);
      assert.equal(await page.locator('[data-wizard-option]').last().isChecked(), true);
      await page.locator('#setupWizardCourtsClose').click();
      assert.equal(await page.evaluate(() => document.activeElement.id), 'setupWizardCourtsToggle');
      await page.locator('#setupWizardNext').focus();
      await page.keyboard.press('Tab');
      assert.equal(await page.evaluate(() => document.activeElement.id), 'setupWizardSkip');
      await page.keyboard.press('Shift+Tab');
      assert.equal(await page.evaluate(() => document.activeElement.id), 'setupWizardNext');
      assert.equal(posts, 0);
      assert.deepEqual(await page.evaluate(() => structuredClone(window.Atrium.Store.state.settings)), initialState);
      await page.evaluate(() => document.querySelectorAll('#toastRegion .toast').forEach(toast => toast.remove()));
      await summary(page);
      assert.match(await page.locator('#setupWizardSummary').textContent(), /TJSP/);
      assert.equal(await page.locator('#setupWizardSummary img').count(), 0);
      let release;
      const gate = new Promise(resolve => { release = resolve; });
      await page.route('**/api/state', async route => {
        if (route.request().method() !== 'POST') return route.continue();
        await gate;
        await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify({ message: 'Falha sintética' }) });
      });
      if (status === 409) { await page.clock.install(); await page.clock.pauseAt(new Date()); }
      const request = page.waitForRequest(r => new URL(r.url()).pathname === '/api/state' && r.method() === 'POST');
      await page.locator('#setupWizardNext').click();
      await request;
      try {
        assert.equal(await page.locator('#setupWizardBackdrop [role="dialog"]').getAttribute('aria-busy'), 'true');
        assert.equal(await page.locator('#setupWizardBackdrop button:not([disabled])').count(), 0);
        await page.keyboard.press('Escape');
        assert.equal(await page.locator('#setupWizardBackdrop').isVisible(), true);
      } finally { release(); }
      await page.waitForFunction(() => !document.getElementById('setupWizardFeedback').hidden && !document.getElementById('setupWizardNext').disabled, null, { polling: 50 });
      assert.equal(posts, 1);
      for (let i = 0; i < 4; i++) await page.locator('#setupWizardBack').click();
      await page.locator('#setupWizardCourtsToggle').click();
      for (const value of ADDED) assert.equal(await page.locator(`[data-wizard-option][value="${value}"]`).isChecked(), true);
      assert.equal(await page.locator('[data-wizard-option]').last().isChecked(), true);
      assert.equal(await page.locator('#setupWizardFeedback').isVisible(), true);
      await page.evaluate(() => document.querySelectorAll('#toastRegion .toast').forEach(toast => toast.remove()));
      await summary(page);
      await page.unroute('**/api/state');
      await page.locator('#setupWizardNext').click();
      await page.locator('#setupWizardBackdrop').waitFor({ state: 'hidden' });
      assert.equal(posts, 2);
      assert.deepEqual(await page.evaluate(() => window.Atrium.Store.state.settings.workspaceProfile), EXPECTED);
      await page.reload({ waitUntil: 'networkidle' });
      await page.locator('#appShell:not(.hidden)').waitFor();
      assert.deepEqual(await page.evaluate(() => window.Atrium.Store.state.settings.workspaceProfile), EXPECTED);
      await openCourts(page);
      await page.locator('#setupWizardCourtsToggle').click();
      assert.equal(await page.locator('[data-wizard-option]').last().isChecked(), true);
      for (const value of ADDED) assert.equal(await page.locator(`[data-wizard-option][value="${value}"]`).isChecked(), true);
      await page.keyboard.press('Escape');
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('#setupWizardBackdrop').isVisible(), false);
      assert.equal(posts, 2);
      assert.deepEqual(operational, [], 'Seleção de interesses não faz consultas operacionais.');
      assert.deepEqual(pageErrors, []);
      console.log(`Catálogo, seleção, teclado, HTTP ${status}, retry, reload/prefill: PASS`);
    } finally { await context.close(); }
  }

  for (const theme of ['light', 'dark']) {
    const context = await session.createContext({ reducedMotion: 'reduce' });
    try {
      const { page, pageErrors } = await prepareUiV2Page(context, session.server.baseUrl, { theme });
      await page.evaluate(profile => { window.Atrium.Store.state.settings.workspaceProfile = profile; }, { ...INITIAL, courts: [...Object.values(CNJ_TRIBUNALS).map(t => t.court.toLowerCase()), UNKNOWN] });
      await openCourts(page);
      for (const viewport of [{ width: 1280, height: 844 }, { width: 1024, height: 844 }, { width: 390, height: 844 }, { width: 390, height: 500 }]) {
        await page.setViewportSize(viewport);
        const name = `${theme}-${viewport.width}-${viewport.height}`;
        await evidence(page, `many-closed-${name}`);
        await page.locator('#setupWizardCourtsToggle').click();
        await page.locator('#setupWizardCourtSearch').fill('justica federal');
        await page.locator('#setupWizardCourtSearch').scrollIntoViewIfNeeded();
        await evidence(page, `many-open-${name}`);
        await page.locator('[data-wizard-court-row]:not([hidden])').first().hover();
        await evidence(page, `hover-${name}`);
        await page.locator('#setupWizardCourtSearch').fill('Órgão sintético');
        const unknown = page.locator('[data-wizard-option]').last();
        await unknown.scrollIntoViewIfNeeded();
        await evidence(page, `long-unknown-${name}`);
        await unknown.uncheck();
        assert.match(await page.locator('#setupWizardCourtSelection').textContent(), /107 selecionado/);
        await unknown.check();
        await page.locator('#setupWizardCourtSearch').fill('nenhum-sintetico');
        await page.locator('#setupWizardCourtSearch').scrollIntoViewIfNeeded();
        await evidence(page, `zero-results-${name}`);
        await page.keyboard.press('Escape');
      }
      await page.locator('#setupWizardCourtsToggle').click();
      await page.locator('#setupWizardCourtsClear').click();
      assert.match(await page.locator('#setupWizardCourtSelection').textContent(), /0 selecionado/);
      assert.equal(await page.locator('[data-wizard-option]:checked').count(), 0);
      await page.keyboard.press('Escape');
      await evidence(page, `empty-closed-${theme}-390-500`);
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('#appShell').getAttribute('inert'), null);
      assert.deepEqual(pageErrors, []);
    } finally { await context.close(); }
  }
  console.log('Matriz 1280/1024/390x844/390x500 light/dark, muitas/zero/nomes longos, hover, geometria e hit-test: PASS');
} finally {
  await session.stop();
}
