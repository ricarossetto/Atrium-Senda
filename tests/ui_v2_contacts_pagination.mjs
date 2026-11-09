import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fillContactSearch, prepareUiV2Page, startUiV2Session, switchUiV2View } from './ui_v2_helpers.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [featureSource, presenterSource] = await Promise.all([
  readFile(path.join(ROOT, 'js/features/contacts.js'), 'utf8'),
  readFile(path.join(ROOT, 'js/views/ui-v2/contacts-presenter.js'), 'utf8')
]);

console.log('\n===============================================================');
console.log('  ATRIUM — UI V2 CONTACTS PAGINATION');
console.log('===============================================================\n');

// Contrato estático: paginação é apresentação local, sem Store paralelo,
// request, auditoria ou timer.
assert.match(featureSource, /export const CONTACT_PAGE_SIZES/);
assert.match(featureSource, /export const CONTACT_DEFAULT_PAGE_SIZE/);
assert.match(featureSource, /CONTACT_PAGE_SIZES = Object\.freeze\(\[25, 100, 500, 1000]\)/);
assert.match(featureSource, /setPageSize\(value\)/);
assert.match(featureSource, /setPage\(value\)/);
assert.match(featureSource, /handlePaginationClick\(event\)/);
assert.match(featureSource, /get pagination\(\)/);
assert.match(featureSource, /resetPage/);
assert.match(presenterSource, /export function renderContactsPagination/);
assert.match(presenterSource, /data-contact-page/);
assert.match(presenterSource, /data-contact-page-size/);
assert.match(presenterSource, /aria-label="Paginação de contatos"/);
assert.doesNotMatch(presenterSource, /\bStore\b|\bfetch\s*\(|\bsave\s*\(|\bflush\s*\(|\baudit\s*\(|setInterval/);
for (const forbiddenSideEffect of ['console.log', 'fetch(', 'XMLHttpRequest', 'WebSocket']) {
  assert.equal(featureSource.includes(forbiddenSideEffect), false, `Contacts não pode introduzir ${forbiddenSideEffect}.`);
}

const session = await startUiV2Session();
try {
  const context = await session.createContext();
  const { page, pageErrors } = await prepareUiV2Page(context, session.server.baseUrl, { probe: true });
  await page.evaluate(() => {
    const contacts = [];
    for (let i = 0; i < 250; i++) {
      contacts.push({
        id: `page-contact-${i}`,
        name: `Contato Paginacao Sintetico ${String(i).padStart(3, '0')}`,
        contactRole: i % 5 === 0 ? 'testemunha' : 'cliente',
        city: 'Cidade Sintetica'
      });
    }
    window.Atrium.Store.state.contacts = contacts;
    window.Atrium.Store.state.leads = [];
    window.Atrium.Store.state.audit = [];
  });
  await switchUiV2View(page, 'contacts');

  const initial = await page.evaluate(() => ({
    leads: JSON.stringify(window.Atrium.Store.state.leads),
    audit: window.Atrium.Store.state.audit.length,
    requests: window.__uiV2RuntimeProbe.mutationRequests.length,
    intervals: window.__uiV2RuntimeProbe.intervals
  }));

  // Padrão: 25 por página, para a tela abrir curta; a partir daqui o teste usa 100.
  assert.equal(await page.locator('[data-contact-page-size="25"]').getAttribute('aria-pressed'), 'true');
  await page.locator('[data-contact-page-size="100"]').click();
  // Com 100 por página, primeira de três.
  assert.equal(await page.locator('#contactCount').textContent(), '250 contatos');
  assert.equal(await page.locator('#contactsV2Workspace [data-contact-id]').count(), 100);
  assert.match(await page.locator('.contact-pagination-status').textContent(), /Página 1 de 3/);
  assert.equal(await page.locator('[data-contact-page-size="100"]').getAttribute('aria-pressed'), 'true');
  assert.equal(await page.locator('[data-contact-page="first"]').isDisabled(), true);
  assert.equal(await page.locator('[data-contact-page="prev"]').isDisabled(), true);
  assert.equal(await page.locator('[data-contact-page="next"]').isDisabled(), false);

  // Navegação: 2, 3 e volta.
  await page.locator('[data-contact-page="next"]').click();
  assert.match(await page.locator('.contact-pagination-status').textContent(), /Página 2 de 3/);
  assert.equal(await page.locator('#contactsV2Workspace [data-contact-id]').count(), 100);
  const transitionEvidence = await page.evaluate(() => {
    const list = document.querySelector('#contactsV2Workspace .contact-record-list');
    const animation = list.getAnimations().find(item => item.effect?.getKeyframes().some(frame => frame.transform?.includes('translateX')));
    const keyframes = animation?.effect?.getKeyframes() || [];
    return {
      duration: animation?.effect?.getTiming().duration,
      start: keyframes[0]?.transform,
      faded: keyframes[0]?.opacity,
      focused: document.activeElement?.dataset.contactPage,
      overflow: document.documentElement.scrollWidth - innerWidth
    };
  });
  assert.equal(transitionEvidence.duration, 200);
  assert.match(transitionEvidence.start, /translateX\(8px\)/);
  assert.ok(transitionEvidence.faded < 1);
  assert.equal(transitionEvidence.focused, 'next');
  assert.ok(transitionEvidence.overflow <= 2);
  await page.locator('[data-contact-page="next"]').click();
  assert.match(await page.locator('.contact-pagination-status').textContent(), /Página 3 de 3/);
  assert.equal(await page.locator('#contactsV2Workspace [data-contact-id]').count(), 50);
  assert.equal(await page.locator('[data-contact-page="next"]').isDisabled(), true);
  assert.equal(await page.locator('[data-contact-page="last"]').isDisabled(), true);
  assert.equal(await page.evaluate(() => document.activeElement?.dataset.contactPage), 'prev');
  await page.locator('[data-contact-page="prev"]').click();
  assert.match(await page.locator('.contact-pagination-status').textContent(), /Página 2 de 3/);
  const reverseFrames = await page.locator('#contactsV2Workspace .contact-record-list').evaluate(element =>
    element.getAnimations().flatMap(animation => animation.effect?.getKeyframes() || []));
  assert.ok(reverseFrames.some(frame => frame.transform === 'translateX(-8px)'));

  // Tamanho 500: tudo em uma página.
  await page.locator('[data-contact-page-size="500"]').click();
  assert.match(await page.locator('.contact-pagination-status').textContent(), /Página 1 de 1 · 250 no filtro/);
  assert.equal(await page.locator('#contactsV2Workspace [data-contact-id]').count(), 250);
  assert.equal(await page.locator('[data-contact-page-size="500"]').getAttribute('aria-pressed'), 'true');

  // Tamanho 1000 com 250: ainda uma página.
  await page.locator('[data-contact-page-size="1000"]').click();
  assert.match(await page.locator('.contact-pagination-status').textContent(), /Página 1 de 1/);
  assert.equal(await page.locator('#contactsV2Workspace [data-contact-id]').count(), 250);

  // Volta a 100 e avança para testar reset por busca e filtro.
  await page.locator('[data-contact-page-size="100"]').click();
  await page.locator('[data-contact-page="next"]').click();
  assert.match(await page.locator('.contact-pagination-status').textContent(), /Página 2 de 3/);
  await fillContactSearch(page, 'Contato Paginacao Sintetico 001', 1);
  assert.match(await page.locator('.contact-pagination-status').textContent(), /Página 1 de 1/);
  assert.equal(await page.locator('#contactsV2Workspace [data-contact-id]').count(), 1);
  assert.equal(await page.locator('#contactCount').textContent(), '250 contatos', 'Count segue total geral.');
  await fillContactSearch(page, '', 100);

  // Filtro de papel reseta para a primeira página.
  await page.locator('[data-contact-page="next"]').click();
  await page.locator('[data-contact-role-filter="testemunha"]').click();
  assert.match(await page.locator('.contact-pagination-status').textContent(), /Página 1 de 1 · 50 no filtro/);
  assert.equal(await page.locator('#contactsV2Workspace [data-contact-id]').count(), 50);
  await page.locator('[data-contact-role-filter="all"]').click();

  // Seleção ajusta a página do contato e preserva ao fechar.
  await page.locator('[data-contact-page="next"]').click();
  await page.locator('[data-contact-page="next"]').click();
  await page.locator('[data-contact-id="page-contact-249"]').click();
  assert.match(await page.locator('.contact-pagination-status').textContent(), /Página 3 de 3/);
  assert.equal(await page.locator('#contactInspector').getAttribute('role'), 'dialog');
  await page.locator('[data-contact-inspector-close]').click();
  assert.match(await page.locator('.contact-pagination-status').textContent(), /Página 3 de 3/);

  // Segurança de apresentação: sem mutação de Leads, request ou timer.
  const safety = await page.evaluate(() => ({
    leads: JSON.stringify(window.Atrium.Store.state.leads),
    audit: window.Atrium.Store.state.audit.length,
    requests: window.__uiV2RuntimeProbe.mutationRequests.length,
    intervals: window.__uiV2RuntimeProbe.intervals
  }));
  assert.deepEqual(safety, initial, 'Paginação não pode mutar Store, auditar, requisitar ou criar timer.');

  // Edição invalida o reaproveitamento de filtro+sort: o termo novo é achado.
  // (Fecha o inspector antes de buscar: o fundo fica inert com o drawer aberto.)
  await page.locator('#contactsV2Workspace [data-contact-id]').first().click();
  await page.locator('[data-contact-edit]').click();
  await page.locator('#modalBackdrop[data-modal-mode="contact"]:not(.hidden)').waitFor();
  await page.locator('#modalForm [name="city"]').fill('Cidade Cache Sintetica');
  await page.locator('#modalForm button[type="submit"]').click();
  await page.locator('#modalBackdrop').waitFor({ state: 'hidden' });
  await page.locator('[data-contact-inspector-close]').click();
  await page.locator('.contact-inspector-backdrop').waitFor({ state: 'detached' });
  await fillContactSearch(page, 'Cache Sintetica', 1);
  assert.equal(await page.locator('#contactsV2Workspace [data-contact-id]').count(), 1);
  await fillContactSearch(page, '', 100);

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.locator('[data-contact-page="next"]').click();
  assert.match(await page.locator('.contact-pagination-status').textContent(), /Página 2 de 3/);
  assert.equal(await page.locator('#contactsV2Workspace .contact-record-list').evaluate(element => element.getAnimations().length), 0);
  await page.emulateMedia({ reducedMotion: 'no-preference' });

  // Mobile: alvos de toque e ausência de overflow global.
  await page.setViewportSize({ width: 390, height: 844 });
  const targets = await page.locator('.contact-pagination button:visible').evaluateAll(elements => elements.map(element => {
    const rect = element.getBoundingClientRect();
    return { label: element.getAttribute('aria-label') || element.textContent.trim(), height: rect.height };
  }));
  const undersized = targets.filter(item => item.height < 43.5);
  assert.deepEqual(undersized, [], `Paginação mobile abaixo de 44px: ${JSON.stringify(undersized)}`);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  assert.ok(overflow <= 2, `Paginação mobile não pode gerar overflow global: ${overflow}px.`);

  assert.deepEqual(pageErrors, []);
  await context.close();
} finally {
  await session.stop();
}

console.log('✓ Contatos V2 pagina 100/500/1000 sem travar, com reset, seleção e segurança de apresentação.');
