import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepareUiV2ContactsFixture, prepareUiV2Page, startUiV2Session } from './ui_v2_helpers.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [featureSource, presenterSource, portalSource] = await Promise.all([
  readFile(path.join(ROOT, 'js/features/contacts.js'), 'utf8'),
  readFile(path.join(ROOT, 'js/views/ui-v2/contacts-presenter.js'), 'utf8'),
  readFile(path.join(ROOT, 'js/portal.js'), 'utf8')
]);

console.log('\n===============================================================');
console.log('  ATRIUM — UI V2 CONTACTS RELATIONSHIP WORKSPACE');
console.log('===============================================================\n');

assert.match(featureSource, /export function createContactsFeature/);
assert.equal((portalSource.match(/createContactsFeature\s*\(/g) || []).length, 1, 'Deve existir uma única Contacts Feature no runtime.');
assert.doesNotMatch(`${featureSource}\n${portalSource}`, /createClientsFeature|clientStore|state\.clients/);
assert.doesNotMatch(presenterSource, /\bStore\b|\bfetch\s*\(|\bsave\s*\(|\bflush\s*\(|\baudit\s*\(|setInterval/);
assert.match(featureSource, /item\.name} \$\{item\.document} \$\{item\.mobile} \$\{item\.phone} \$\{item\.email} \$\{item\.origin} \$\{item\.contactRole/);
assert.match(featureSource, /store\.audit\(editing \? 'Contato atualizado' : 'Contato cadastrado', record\.name\)/);

const expectedFields = ['name', 'contactRole', 'leadOrigin', 'document', 'rg', 'birthDate', 'profession', 'maritalStatus', 'mobile', 'phone', 'email', 'origin', 'city', 'state', 'address', 'district', 'zip', 'notes'].sort();
const session = await startUiV2Session();
try {
  const context = await session.createContext();
  const { page, pageErrors } = await prepareUiV2Page(context, session.server.baseUrl, { probe: true });
  const fixture = await prepareUiV2ContactsFixture(page);
  const initial = await page.evaluate(() => ({
    contacts: JSON.stringify(window.Atrium.Store.state.contacts),
    leads: JSON.stringify(window.Atrium.Store.state.leads),
    audit: window.Atrium.Store.state.audit.length,
    requests: window.__uiV2RuntimeProbe.mutationRequests.length,
    intervals: window.__uiV2RuntimeProbe.intervals
  }));

  assert.equal(await page.locator('#contactCount').textContent(), '9 contatos');
  assert.equal(await page.locator('#contactsV2Workspace [data-contact-id]').count(), 9);

  await page.locator('#contactSearch').fill('000.000.001-91');
  assert.equal(await page.locator('#contactsV2Workspace [data-contact-id]').count(), 1, 'Busca canônica por documento deve continuar local.');
  assert.equal(await page.locator('#contactCount').textContent(), '9 contatos', 'Count deve permanecer total, não filtrado.');
  await page.locator('#contactSearch').fill('');

  await page.locator('[data-contact-role-filter="cliente"]').click();
  assert.equal(await page.locator('[data-contact-role-filter="cliente"]').getAttribute('aria-pressed'), 'true');
  assert.equal(await page.locator('#contactsV2Workspace [data-contact-id]').count(), 2);
  assert.deepEqual(await page.locator('#contactsV2Workspace [data-contact-id]').evaluateAll(nodes => nodes.map(node => node.dataset.contactId).sort()),
    ['ui-v2-contact-client', 'ui-v2-contact-long']);
  await page.locator('[data-contact-role-filter="testemunha"]').click();
  assert.equal(await page.locator('#contactsV2Workspace [data-contact-id]').count(), 1);
  await page.locator('[data-contact-role-filter="all"]').click();

  const firstBefore = await page.locator('#contactsV2Workspace [data-contact-id]').first().getAttribute('data-contact-id');
  await page.locator('[data-contact-sort-field="name"]').click();
  const firstAfter = await page.locator('#contactsV2Workspace [data-contact-id]').first().getAttribute('data-contact-id');
  assert.notEqual(firstAfter, firstBefore, 'Sort canônico deve alternar direção sem estado paralelo.');

  const presentationSafety = await page.evaluate(() => ({
    contacts: JSON.stringify(window.Atrium.Store.state.contacts),
    leads: JSON.stringify(window.Atrium.Store.state.leads),
    audit: window.Atrium.Store.state.audit.length,
    requests: window.__uiV2RuntimeProbe.mutationRequests.length,
    intervals: window.__uiV2RuntimeProbe.intervals
  }));
  assert.deepEqual(presentationSafety, initial, 'Busca, sort e filtros não podem mutar Store, auditar, requisitar ou criar timer.');

  await page.locator('[data-contact-id="ui-v2-contact-client"]').click();
  assert.equal(await page.locator('#contactInspector').getAttribute('role'), 'region');
  assert.equal(await page.locator('#modalBackdrop').isHidden(), true, 'Leitura deve abrir inspector, não formulário.');
  const inspectorText = await page.locator('#contactInspector').textContent();
  assert.match(inspectorText, /Marina Duarte Sintética/);
  assert.match(inspectorText, /Indicação/);
  assert.doesNotMatch(inspectorText, /Texto livre não prioritário/, 'leadOrigin deve preceder origin visualmente.');
  assert.match(inspectorText, /000\.000\.001-91/);

  await page.locator('[data-contact-documents]').click();
  await page.locator('#docGeneratorBackdrop:not(.hidden)').waitFor();
  assert.match(await page.locator('#docGenTypeSelect').textContent(), /Procuração/);
  assert.match(await page.locator('#docGenTypeSelect').textContent(), /Contrato de Honorários/);
  assert.match(await page.locator('#docGenTypeSelect').textContent(), /Hipossuficiência/);
  await page.locator('#docGenCancel').click();

  await page.locator('[data-contact-edit]').click();
  await page.locator('#modalBackdrop[data-modal-mode="contact"]:not(.hidden)').waitFor();
  assert.equal(await page.locator('.contact-form-section').count(), 5);
  assert.deepEqual((await page.locator('#modalForm [name]').evaluateAll(nodes => nodes.map(node => node.name))).sort(), expectedFields);
  assert.equal(await page.locator('[name="externalId"]').count(), 0);
  await page.locator('[name="profession"]').fill('Arquiteta e urbanista');
  await page.locator('#modalForm button[type="submit"]').click();
  await page.locator('#modalBackdrop').waitFor({ state: 'hidden' });
  const edited = await page.evaluate(() => {
    const record = window.Atrium.Store.state.contacts.find(item => item.id === 'ui-v2-contact-client');
    const audit = window.Atrium.Store.state.audit[0];
    return { record, audit };
  });
  assert.equal(edited.record.externalId, 'contact:synthetic:client');
  assert.equal(edited.record.registeredAt, '2026-08-10');
  assert.equal(edited.record.source, 'Planilha sintética');
  assert.equal(edited.record.unknownField, 'preservar');
  assert.equal(edited.record.profession, 'Arquiteta e urbanista');
  assert.equal(edited.audit.action, 'Contato atualizado');
  assert.equal(edited.audit.detail, 'Marina Duarte Sintética');
  for (const secret of ['000.000.001-91', 'RG-SINT-001', '(51) 90000-0001', 'marina.duarte@example.test', 'Rua Mineral, 101']) {
    assert.doesNotMatch(JSON.stringify(edited.audit), new RegExp(secret.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }

  await page.locator('#newContactButton').click();
  await page.locator('#modalBackdrop[data-modal-mode="contact"]:not(.hidden)').waitFor();
  assert.deepEqual((await page.locator('#modalForm [name]').evaluateAll(nodes => nodes.map(node => node.name))).sort(), expectedFields);
  assert.equal(await page.locator('#modalForm [name="contactRole"]').inputValue(), 'cliente');
  assert.equal(await page.locator('#modalForm [name="leadOrigin"]').inputValue(), 'indicacao');
  await page.locator('#modalForm [name="name"]').fill('Contato Privacidade Sintético');
  await page.locator('#modalForm [name="document"]').fill('000.000.002-72');
  await page.locator('#modalForm [name="rg"]').fill('RG-SINT-002');
  await page.locator('#modalForm [name="mobile"]').fill('(51) 90000-0010');
  await page.locator('#modalForm [name="email"]').fill('privacidade@example.test');
  await page.locator('#modalForm button[type="submit"]').click();
  await page.locator('#modalBackdrop').waitFor({ state: 'hidden' });
  const created = await page.evaluate(() => ({
    record: window.Atrium.Store.state.contacts.find(item => item.name === 'Contato Privacidade Sintético'),
    audit: window.Atrium.Store.state.audit[0]
  }));
  assert.equal(created.record.contactRole, 'cliente');
  assert.equal(created.record.leadOrigin, 'indicacao');
  assert.equal(created.record.source, 'Interna');
  assert.equal(created.record.externalId, null);
  assert.equal(created.audit.detail, 'Contato Privacidade Sintético');
  for (const secret of ['000.000.002-72', 'RG-SINT-002', '(51) 90000-0010', 'privacidade@example.test']) {
    assert.doesNotMatch(JSON.stringify(created.audit), new RegExp(secret.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }

  await page.locator('#globalSearch').fill('Bruno Testemunha');
  await page.locator('#searchPaletteResults [data-search-target="contact"][data-search-id="ui-v2-contact-witness"]').click();
  assert.equal(await page.locator('#view-contacts').getAttribute('class').then(value => value.includes('active')), true);
  assert.equal(await page.locator('#contactSearch').inputValue(), 'Bruno Testemunha Sintético');
  assert.equal(await page.locator('[data-contact-id="ui-v2-contact-witness"]').count(), 1);

  assert.equal(await page.evaluate(() => JSON.stringify(window.Atrium.Store.state.leads)), initial.leads, 'Contacts nunca deve mutar Leads.');
  assert.deepEqual(pageErrors, []);
  await context.close();
} finally {
  await session.stop();
}

console.log('✓ Contatos V2 preserva feature única, busca, sort, filtros, CRUD, privacidade e integrações canônicas.');
