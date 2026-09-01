import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeExternalUrl } from '../js/features/links.js';
import {
  prepareUiV2LinksFixture,
  prepareUiV2Page,
  startUiV2Session,
  UI_V2_LINKS_FIXTURE
} from './ui_v2_helpers.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [featureSource, portalSource, indexSource] = await Promise.all([
  readFile(path.join(ROOT, 'js/features/links.js'), 'utf8'),
  readFile(path.join(ROOT, 'js/portal.js'), 'utf8'),
  readFile(path.join(ROOT, 'index.html'), 'utf8')
]);

const STATIC_LINK_INVENTORY = Object.freeze([
  Object.freeze({ group: 'legislation', title: 'Código Civil (CC)', href: 'https://www.planalto.gov.br/ccivil_03/leis/2002/l10406compilada.htm', target: '_blank', rel: 'noopener noreferrer' }),
  Object.freeze({ group: 'legislation', title: 'Código de Processo Civil (CPC)', href: 'https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2015/lei/l13105.htm', target: '_blank', rel: 'noopener noreferrer' }),
  Object.freeze({ group: 'legislation', title: 'Consolidação das Leis do Trabalho (CLT)', href: 'https://www.planalto.gov.br/ccivil_03/decreto-lei/del5452compilado.htm', target: '_blank', rel: 'noopener noreferrer' }),
  Object.freeze({ group: 'legislation', title: 'Constituição Federal (CF/88)', href: 'https://www.planalto.gov.br/ccivil_03/constituicao/constituicao.htm', target: '_blank', rel: 'noopener noreferrer' }),
  Object.freeze({ group: 'legislation', title: 'Código Penal (CP)', href: 'https://www.planalto.gov.br/ccivil_03/decreto-lei/del2848compilado.htm', target: '_blank', rel: 'noopener noreferrer' }),
  Object.freeze({ group: 'legislation', title: 'Código de Processo Penal (CPP)', href: 'https://www.planalto.gov.br/ccivil_03/decreto-lei/del3689compilado.htm', target: '_blank', rel: 'noopener noreferrer' }),
  Object.freeze({ group: 'case-law', title: 'Jurisprudência do STJ (SCON)', href: 'https://processo.stj.jus.br/SCON/', target: '_blank', rel: 'noopener noreferrer' }),
  Object.freeze({ group: 'tools', title: 'Prompts Jurídicos Atualizados (02/2026)', href: 'https://ricarossetto.github.io/prompts-atualizados-02-2026/', target: '_blank', rel: 'noopener noreferrer' }),
  Object.freeze({ group: 'tools', title: 'JURISPRUDENCIAIA', href: 'https://www.jurisprudenciaia.com.br/', target: '_blank', rel: 'noopener noreferrer' }),
  Object.freeze({ group: 'tools', title: 'TRANSCREVEIA', href: 'https://www.transcreveia.com.br/', target: '_blank', rel: 'noopener noreferrer' })
]);

console.log('\n===============================================================');
console.log('  ATRIUM — UI V2 LINKS & LEGAL RESOURCES');
console.log('===============================================================\n');

assert.equal((portalSource.match(/createLinksFeature\s*\(/g) || []).length, 1, 'A feature de Links deve ter uma única instância.');
assert.match(featureSource, /^import \{ Store, uid \} from '\.\.\/core\/store\.js';/);
assert.match(featureSource, /const customLinks = store\.state\.customLinks \|\| \[\]/);
assert.doesNotMatch(portalSource, /Store\.state\.customLinks/, 'Portal não pode criar autoridade paralela para Links.');
assert.doesNotMatch(featureSource, /\b(?:fetch|secureFetch|XMLHttpRequest)\b|localStorage|sessionStorage|setInterval|setTimeout/);
assert.equal((featureSource.match(/byId\('btnNewLink'\)\?\.addEventListener/g) || []).length, 1);
assert.equal((featureSource.match(/byId\('customLinksGrid'\)\?\.addEventListener/g) || []).length, 1);
assert.doesNotMatch(indexSource, /<iframe[^>]*view-links|preload[^>]*https?:/i);

for (const invalid of ['javascript:alert(1)', 'data:text/html,test', 'file:///tmp/test', 'sem-protocolo', 'mailto:test@example.test', 'tel:+550000000000', 'ftp://example.test/file']) {
  assert.equal(normalizeExternalUrl(invalid), '', `${invalid} não pode virar link externo ativo.`);
}

const session = await startUiV2Session();
try {
  const context = await session.createContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  const { page, pageErrors } = await prepareUiV2Page(context, session.server.baseUrl, { theme: 'light', probe: true });
  const initialIntervals = await page.evaluate(() => window.__uiV2RuntimeProbe.intervals);
  const initialMutationRequests = await page.evaluate(() => structuredClone(window.__uiV2RuntimeProbe.mutationRequests));
  await prepareUiV2LinksFixture(page);

  const staticInventory = await page.locator('[data-links-group]:not([data-links-group="custom"]) > .link-card').evaluateAll(cards => cards.map(card => ({
    group: card.parentElement.dataset.linksGroup,
    title: card.querySelector('h4')?.textContent.trim(),
    href: card.getAttribute('href'),
    target: card.getAttribute('target'),
    rel: card.getAttribute('rel')
  })));
  assert.deepEqual(staticInventory, STATIC_LINK_INVENTORY, 'O inventário estático deve permanecer byte-for-byte estável.');

  assert.equal(await page.locator('#customLinksSection').isVisible(), true);
  assert.equal(await page.locator('#customLinksGrid .custom-link-card').count(), UI_V2_LINKS_FIXTURE.length);
  assert.equal(await page.locator('#customLinksGrid script, #customLinksGrid img').count(), 0);
  assert.match(await page.locator('#customLinksGrid').textContent(), /<script>alert\(1\)<\/script>/);
  assert.match(await page.locator('#customLinksGrid').textContent(), /<img src=x onerror=alert\(1\)>/);
  assert.equal(await page.locator('#customLinksGrid .custom-link-card').nth(2).locator('a').count(), 0, 'URL armazenada inválida não pode gerar href ativo.');
  assert.match(await page.locator('#customLinksGrid .custom-link-card').nth(2).textContent(), /Endereço inválido/);

  const beforeSwitch = await page.evaluate(() => ({
    state: JSON.stringify(window.Atrium.Store.state),
    customLinks: structuredClone(window.Atrium.Store.state.customLinks),
    ops: structuredClone(window.__uiV2LinksOps)
  }));
  assert.deepEqual(beforeSwitch.ops, []);
  await page.evaluate(() => {
    document.documentElement.dataset.ui = 'classic';
    window.Atrium.App.renderLinks();
  });
  assert.equal(await page.locator('#customLinksGrid .custom-link-card').count(), UI_V2_LINKS_FIXTURE.length);
  await page.evaluate(() => {
    document.documentElement.dataset.ui = 'v2';
    window.Atrium.App.renderLinks();
  });
  const afterSwitch = await page.evaluate(() => ({
    state: JSON.stringify(window.Atrium.Store.state),
    customLinks: structuredClone(window.Atrium.Store.state.customLinks),
    ops: structuredClone(window.__uiV2LinksOps)
  }));
  assert.equal(afterSwitch.state, beforeSwitch.state);
  assert.deepEqual(afterSwitch.customLinks, beforeSwitch.customLinks);
  assert.deepEqual(afterSwitch.ops, [], 'Troca Classic/V2 não pode salvar, auditar ou fazer flush.');

  const listenerEvidence = await page.evaluate(() => structuredClone(window.__uiV2RuntimeProbe.listeners));
  assert.equal(listenerEvidence['btnNewLink:click'], 1);
  assert.equal(listenerEvidence['customLinksGrid:click'], 1);

  await page.locator('#btnNewLink').click();
  await page.locator('#modalBackdrop:not(.hidden)').waitFor();
  assert.equal(await page.locator('#modalTitle').textContent(), 'Adicionar novo link útil');
  await page.locator('#modalForm [name="title"]').fill('Referência canônica criada no modal');
  await page.locator('#modalForm [name="url"]').fill('https://created.example.test/resource');
  await page.locator('#modalForm [name="category"]').selectOption('Jurisprudência');
  await page.locator('#modalForm [name="description"]').fill('Descrição criada pelo dispatcher canônico.');
  await page.locator('#modalForm button[type="submit"]').click();
  await page.locator('#modalBackdrop').waitFor({ state: 'hidden' });
  await page.waitForFunction(() => document.querySelectorAll('#customLinksGrid .custom-link-card').length === 4);
  const creation = await page.evaluate(() => ({
    record: structuredClone(window.Atrium.Store.state.customLinks[0]),
    audit: structuredClone(window.Atrium.Store.state.audit[0]),
    ops: structuredClone(window.__uiV2LinksOps)
  }));
  assert.match(creation.record.id, /^link-/);
  assert.equal(creation.record.title, 'Referência canônica criada no modal');
  assert.equal(creation.record.url, 'https://created.example.test/resource');
  assert.equal(creation.record.category, 'Jurisprudência');
  assert.equal(creation.record.description, 'Descrição criada pelo dispatcher canônico.');
  assert.ok(Date.parse(creation.record.createdAt));
  assert.ok(Date.parse(creation.record.updatedAt));
  assert.equal(creation.audit.action, 'Link útil adicionado');
  assert.equal(creation.audit.detail, creation.record.title);
  assert.deepEqual(creation.ops.map(operation => operation.type), ['audit', 'save', 'flush']);

  const rollbackBefore = await page.evaluate(() => ({
    customLinks: structuredClone(window.Atrium.Store.state.customLinks),
    audit: structuredClone(window.Atrium.Store.state.audit),
    successCount: window.__uiV2LinksToasts.filter(toast => toast.type === 'success').length
  }));
  await page.evaluate(() => { window.__uiV2LinksFlushResult = false; });
  await page.locator(`[data-delete-link="${creation.record.id}"]`).click();
  await page.waitForFunction(() => window.__uiV2LinksToasts.some(toast => toast.type === 'error' && /persistir a exclusão/.test(toast.message)));
  const rollbackAfter = await page.evaluate(() => ({
    customLinks: structuredClone(window.Atrium.Store.state.customLinks),
    audit: structuredClone(window.Atrium.Store.state.audit),
    successCount: window.__uiV2LinksToasts.filter(toast => toast.type === 'success').length,
    lastToast: structuredClone(window.__uiV2LinksToasts.at(-1)),
    mutationRequests: structuredClone(window.__uiV2RuntimeProbe.mutationRequests),
    intervals: window.__uiV2RuntimeProbe.intervals,
    duplicateIds: [...document.querySelectorAll('[id]')].map(element => element.id).filter((id, index, ids) => ids.indexOf(id) !== index)
  }));
  assert.deepEqual(rollbackAfter.customLinks, rollbackBefore.customLinks);
  assert.deepEqual(rollbackAfter.audit, rollbackBefore.audit);
  assert.equal(rollbackAfter.successCount, rollbackBefore.successCount);
  assert.deepEqual(rollbackAfter.lastToast, { message: 'Não foi possível persistir a exclusão do link.', type: 'error' });
  assert.deepEqual(rollbackAfter.mutationRequests, initialMutationRequests, 'Links V2 não pode introduzir request de negócio.');
  assert.equal(rollbackAfter.intervals, initialIntervals, 'Links V2 não pode introduzir timer.');
  assert.deepEqual(rollbackAfter.duplicateIds, []);
  assert.deepEqual(pageErrors, []);
  await context.close();
} finally {
  await session.stop();
}

console.log('✓ UI V2 Links: inventário estático, fonte única, parity de modo, CRUD canônico, XSS e rollback PASS.');
