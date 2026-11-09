import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { readFile, mkdir, mkdtemp, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
assert.ok(Number(process.versions.node.split('.')[0]) >= 24, 'Email QA requires Node 24 or newer');
assert.ok(await stat(root), 'Worktree must exist');
if (process.argv.includes('--before')) {
  const source = execFileSync('git', ['show', 'HEAD:lib/notifications/templates/email-templates.mjs'], { cwd: root, encoding: 'utf8' });
  const original = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
  const output = await mkdtemp(join(tmpdir(), 'atrium-email-before-'));
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.route('**/*', route => route.abort());
    const template = original.renderPublicationDigest({
      syncCompletedAt: '2026-10-08T11:05:00Z',
      publications: [{ process: 'Processo Teste A', court: 'TJRS', text: 'Comunicação sintética para revisão humana.', publishedAt: '2026-10-08' }],
      digestContext: { deadlines: [{ title: 'Revisão — Cliente Teste', date: '2026-10-09' }], agendaToday: [{ title: 'Audiência — Cliente Teste', time: '14:30' }] }
    });
    for (const width of [1280, 390]) {
      await page.setViewportSize({ width, height: 844 });
      await page.setContent(template.html);
      const path = join(output, `original-light-${width}.png`);
      await page.screenshot({ path, fullPage: true });
      console.log(`BEFORE ${path}`);
    }
    console.log('PASS original HEAD renderer captured locally with synthetic data.');
  } finally {
    await browser.close();
  }
  process.exit(0);
}
import { renderPublicationDigest, renderPasswordReset, renderTestEmail, renderSyncFailed } from '../lib/notifications/templates/email-templates.mjs';

const output = process.env.ATRIUM_EMAIL_QA_DIR || await mkdtemp(join(tmpdir(), 'atrium-email-visual-'));
await mkdir(output, { recursive: true });
const pngUrl = new URL('../assets/icons/atrium-logo-email.png', import.meta.url);
const browser = await chromium.launch({ headless: true });
try {
  if (process.argv.includes('--rasterize-logo') || process.argv.includes('--verify-logo')) {
    const page = await browser.newPage({ viewport: { width: 480, height: 120 }, deviceScaleFactor: 2 });
    await page.route('**/*', route => route.abort());
    const svg = await readFile(new URL('../assets/icons/atrium-logo-light.svg', import.meta.url), 'utf8');
    await page.setContent(`<html><body style="margin:0;width:480px;height:120px;background:#FAFAF8;">${svg}</body></html>`);
    await page.evaluate(() => document.fonts.ready);
    const raster = await page.screenshot(process.argv.includes('--rasterize-logo') ? { path: fileURLToPath(pngUrl) } : {});
    assert.deepEqual(raster, await readFile(pngUrl), 'Email PNG must match the canonical light SVG raster');
    console.log(`PASS canonical SVG raster: ${raster.length} bytes, 960x240, no remote font or dependency installed.`);
    await page.close();
  }
  const png = await readFile(pngUrl);
  const context = await browser.newContext();
  let blockImage = false;
  await context.route('**/*', route => {
    if (!blockImage && new URL(route.request().url()).pathname === '/assets/icons/atrium-logo-email.png') return route.fulfill({ contentType: 'image/png', body: png });
    return route.abort();
  });
  const errors = [];
  const clock = '2026-10-08T11:05:00Z';
  const bulletin = { day: '2026-10-08', slot: 8, includeFullContext: true };
  const digestContext = {
    deadlines: [{ title: 'Revisão da manifestação — Cliente Teste', date: '2026-10-09', fatal: true }],
    agendaToday: [{ title: 'Audiência de conciliação — Cliente Teste', time: '14:30', court: 'Juízo Teste' }],
    agendaTomorrow: [{ title: 'Reunião de preparação', time: '09:00' }]
  };
  const morning = renderPublicationDigest({
    bulletin, syncCompletedAt: clock, digestContext,
    publications: [{ process: 'Processo Teste A', source: 'eproc-tjrs-eproc-1g', court: 'TJRS', publishedAt: '2026-10-08', disponibilizadoEm: '2026-10-07', client: 'Cliente Teste', text: 'Comunicação sintética para revisão humana. Acesse o escritório para conferir o registro e a fonte.', link: 'https://source.example.test/consulta', sourceReportedDeadlineAt: '2026-10-12', sourceReportedDeadlineSource: 'domicilio' }],
    movements: [{ process: 'Processo Teste B', source: 'DataJud', date: '2026-10-08', description: 'Juntada de documento sintético.' }],
    events: [{ event_type: 'SYNC_FAILED', payload: { failures: [{ portal: 'tjrs-eproc-1g', category: 'SYNTHETIC_PRIVATE_ERROR' }] } }]
  });
  async function inspect(name, template, width, theme, { screenshot = true, blocked = false, stripCss = false } = {}) {
    blockImage = blocked;
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.setViewportSize({ width, height: 844 });
    await page.emulateMedia({ colorScheme: theme });
    const html = stripCss ? template.html.replace(/<style>[\s\S]*?<\/style>/, '') : template.html;
    await page.setContent(html);
    await page.evaluate(theme => { document.body.style.backgroundColor = theme === 'dark' ? '#111315' : '#F3F4F2'; }, theme);
    await page.locator('img').evaluate(async image => { if (!image.complete) await new Promise(resolve => { image.onload = resolve; image.onerror = resolve; }); });
    const metrics = await page.evaluate(() => {
      const card = document.querySelector('.email-card').getBoundingClientRect();
      const body = document.querySelector('.email-body').getBoundingClientRect();
      const summaries = [...document.querySelectorAll('summary')].map(summary => {
        const rect = summary.getBoundingClientRect();
        return { left: rect.left, right: rect.right, width: rect.width, height: rect.height, label: summary.textContent };
      });
      const links = [...document.querySelectorAll('a')].map(link => {
        const rect = link.getBoundingClientRect();
        return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height, label: link.textContent };
      });
      const clipped = [...document.querySelectorAll('.email-body p, .email-body h1, .email-body h2')].filter(element => {
        const rect = element.getBoundingClientRect();
        return element.scrollWidth > element.clientWidth + 1 || rect.left < body.left || rect.right > body.right + 1 || getComputedStyle(element).whiteSpace === 'nowrap';
      }).map(element => element.tagName);
      return { overflow: document.documentElement.scrollWidth - innerWidth, cardWidth: card.width, cardLeft: card.left, cardRight: card.right, bodyLeft: body.left, bodyRight: body.right, links, summaries, clipped, tables: [...document.querySelectorAll('table')].every(table => table.getAttribute('role') === 'presentation'), imageLoaded: document.querySelector('img').naturalWidth > 0, alt: document.querySelector('img').alt, titleCount: document.querySelectorAll('h1').length };
    });
    assert.ok(metrics.overflow <= 1, `${name}: overflow ${metrics.overflow}`);
    assert.ok(metrics.cardWidth <= 600.5, `${name}: card wider than 600px`);
    assert.ok(metrics.cardLeft >= 0 && metrics.cardRight <= width + 1, `${name}: card outside viewport`);
    assert.ok(metrics.tables, `${name}: layout table missing presentation role`);
    assert.deepEqual(metrics.clipped, [], `${name}: clipped or nowrap content`);
    assert.equal(metrics.titleCount, 1);
    assert.equal(metrics.alt, 'ATRIUM');
    assert.equal(metrics.imageLoaded, !blocked);
    assert.ok(metrics.links.length > 0);
    for (const link of metrics.links) {
      assert.ok(link.width > 0 && link.height >= 44, `${name}: inaccessible link ${link.label}`);
      assert.ok(link.left >= metrics.bodyLeft && link.right <= metrics.bodyRight + 1, `${name}: clipped link`);
    }
    for (const summary of metrics.summaries) {
      assert.ok(summary.width > 0 && summary.height >= 44, `${name}: inaccessible summary ${summary.label}`);
      assert.ok(summary.left >= metrics.bodyLeft && summary.right <= metrics.bodyRight + 1, `${name}: clipped summary`);
    }
    const focusTags = [];
    for (let index = 0; index < metrics.links.length + metrics.summaries.length; index++) {
      await page.keyboard.press('Tab');
      focusTags.push(await page.evaluate(() => document.activeElement?.tagName));
    }
    assert.ok(focusTags.every(tag => tag === 'A' || tag === 'SUMMARY'), `${name}: unexpected keyboard focus ${focusTags.join(',')}`);
    assert.equal(focusTags.filter(tag => tag === 'A').length, metrics.links.length, `${name}: keyboard link focus`);
    assert.equal(focusTags.filter(tag => tag === 'SUMMARY').length, metrics.summaries.length, `${name}: keyboard summary focus`);
    const firstDetails = page.locator('details').first();
    if (await firstDetails.count()) {
      assert.equal(await firstDetails.evaluate(element => element.open), false, `${name}: details must start collapsed`);
      await page.locator('summary').first().focus();
      await page.keyboard.press('Enter');
      assert.equal(await firstDetails.evaluate(element => element.open), true, `${name}: summary did not expand`);
      await page.keyboard.press('Enter');
      assert.equal(await firstDetails.evaluate(element => element.open), false, `${name}: summary did not collapse`);
    }
    const cta = page.locator('.btn-cta');
    await cta.focus();
    const before = await cta.boundingBox();
    await cta.hover();
    assert.deepEqual(await cta.boundingBox(), before, `${name}: hover changed geometry`);
    if (!stripCss) assert.notEqual(await cta.evaluate(link => getComputedStyle(link).outlineStyle), 'none', `${name}: invisible focus`);
    await cta.evaluate(link => link.blur());
    await page.mouse.move(0, 0);
    await page.evaluate(() => window.scrollTo(0, 0));
    if (screenshot) {
      const path = join(output, `${name}-${theme}-${width}.png`);
      await page.screenshot({ path, fullPage: true });
      console.log(`SCREENSHOT ${path} (${(await stat(path)).size} bytes)`);
    }
    console.log(`PASS ${name}/${theme}/${width}: card=${metrics.cardWidth}, overflow=${metrics.overflow}, links=${metrics.links.length}, blocked=${blocked}, strippedCSS=${stripCss}`);
    await page.close();
  }
  for (const theme of ['light', 'dark']) {
    for (const width of [1280, 600, 390]) await inspect('morning', morning, width, theme);
  }
  const fullTextTemplate = renderPublicationDigest({
    bulletin, syncCompletedAt: clock,
    publications: [{
      process: 'Processo Teste Íntegra', court: 'TJRS', publishedAt: '2026-10-08',
      text: 'Resumo sintético da intimação.',
      fullText: 'TEOR COMPLETO SINTÉTICO PARA CONFERÊNCIA HUMANA. '.repeat(24)
    }]
  });
  await inspect('publication-full-text', fullTextTemplate, 1280, 'light');
  await inspect('publication-full-text', fullTextTemplate, 390, 'light');
  const delta = renderPublicationDigest({ bulletin: { ...bulletin, slot: 14, includeFullContext: false, noticeChanges: { changed: { agendaToday: [{ title: 'Reunião reagendada', time: '16:00' }] }, removed: { deadlines: digestContext.deadlines } } }, syncCompletedAt: '2026-10-08T17:05:00Z' });
  await inspect('afternoon-changes', delta, 390, 'light');
  const reset = renderPasswordReset({ displayName: 'Advogada Teste', baseUrl: 'https://office.example.test', resetUrl: `https://office.example.test/?resetToken=${'synthetic'.repeat(30)}` });
  await inspect('password-reset', reset, 390, 'light');
  await inspect('images-blocked', morning, 390, 'dark', { blocked: true });
  await inspect('inline-only', morning, 390, 'light', { stripCss: true, screenshot: false });
  await inspect('empty', renderPublicationDigest({ bulletin, syncCompletedAt: clock }), 390, 'light', { screenshot: false });
  await inspect('system-test', renderTestEmail({ recipient: 'teste@example.test' }), 390, 'light', { screenshot: false });
  await inspect('sync-failure', renderSyncFailed({ failures: [{ portal: 'tjrs-eproc-1g', category: 'SYNTHETIC_PRIVATE_ERROR' }] }), 390, 'dark', { screenshot: false });
  await inspect('long-content', renderPublicationDigest({ publications: Array.from({ length: 12 }, (_, index) => ({ process: `Processo Teste ${index}`, client: 'Cliente Teste com nome longo '.repeat(4), text: 'Longo'.repeat(200), link: `https://source.example.test/${'long'.repeat(60)}` })), bulletin, syncCompletedAt: clock }), 390, 'light', { screenshot: false });
  await inspect('night', renderPublicationDigest({ bulletin: { ...bulletin, slot: 20, includeFullContext: false }, syncCompletedAt: '2026-10-08T23:05:00Z', publications: [{ process: 'Processo Teste Noturno', source: 'pje-tjmt-2g', text: 'Nova comunicação sintética.' }], events: [{ event_type: 'A1_CERT_EXPIRING', payload: { notAfter: '2026-10-14' } }, { event_type: 'DEADLINE_CRITICAL', payload: { title: 'Revisão Teste', deadline: '2026-10-09' } }] }), 390, 'dark');
  assert.deepEqual(errors, []);
  console.log(`PASS local email QA. Output: ${output}. Browser simulation only, not Gmail/Outlook certification.`);
} finally {
  await browser.close();
}
