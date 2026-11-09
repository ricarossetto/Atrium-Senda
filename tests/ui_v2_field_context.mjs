import assert from 'node:assert/strict';
import path from 'node:path';
import { chromium } from 'playwright';
import { postJson, startTestServer } from './helpers.mjs';
import { generateTotp } from '../lib/security.mjs';
import { fieldContextOptions, filterSuggestions } from '../js/core/field-context.js';

console.log('--- Iniciando Testes: sugestões de contexto e preenchimento do navegador ---');

// Regra: toda palavra precisa aparecer, em qualquer ordem, sem depender de acento.
const sample = [{ value: 'LEANDRO RICARDO TESTE' }, { value: 'María Souza', label: 'Cliente · Porto Alegre' }, 'Araken'];
assert.deepEqual(filterSuggestions(sample, 'teste leandro').map(item => item.value), ['LEANDRO RICARDO TESTE']);
assert.deepEqual(filterSuggestions(sample, 'maria').map(item => item.value), ['María Souza']);
assert.deepEqual(filterSuggestions(sample, 'porto').map(item => item.value), ['María Souza'], 'busca também na descrição');
assert.deepEqual(filterSuggestions(sample, 'zzz'), []);
const state = {
  contacts: [{ name: 'Beatriz Lima', contactRole: 'cliente', document: '111' }, { name: 'beatriz lima' }, { name: 'Carlos Dias' }],
  processes: [{ number: '5000001-00.2026.8.21.0001', client: 'Beatriz Lima', court: 'TJRS', opposingParty: 'Banco Exemplo', responsible: 'Ana, Bruno' }],
  intimations: [{ court: 'TRF4' }],
  configuration: { actionTypes: [{ name: 'Cobrança' }], stages: [{ name: 'Inicial' }] }
};
assert.deepEqual(fieldContextOptions('client', { state }).map(item => item.value), ['Beatriz Lima', 'Carlos Dias']);
assert.deepEqual(fieldContextOptions('court', { state }).map(item => item.value), ['TJRS', 'TRF4']);
assert.ok(fieldContextOptions('opposingParty', { state }).some(item => item.value === 'Banco Exemplo'));
assert.deepEqual(fieldContextOptions('responsibles', { state, teamMembers: [{ displayName: 'Carla', email: 'c@x.test' }] }).map(item => item.value), ['Carla', 'Ana', 'Bruno']);
assert.deepEqual(fieldContextOptions('constructor', { state }), [], 'nome de campo não alcança o protótipo');

const SHOTS = process.env.FIELD_SHOTS || '';
const server = await startTestServer({ env: { BETA_DISABLE_AUTOMATIONS: 'true' } });
const browser = await chromium.launch({ headless: true });
try {
  const setup = await (await postJson(`${server.baseUrl}/api/auth/setup`, { username: 'titular_campos', displayName: 'Titular Teste', password: 'Senha-Campos-2026!' })).json();

  // Sem sessão, na tela de entrada: credencial fica; dado pessoal do cadastro não.
  {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();
    await page.goto(`${server.baseUrl}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.querySelector('#authGate input[autocomplete="off"]'));
    const auth = await page.evaluate(() => [...document.querySelectorAll('#authGate input')]
      .filter(input => !['hidden', 'checkbox', 'radio'].includes(input.type))
      .map(input => input.getAttribute('autocomplete')));
    assert.ok(auth.includes('username') && auth.includes('current-password'), 'entrada segue com gerenciador de senhas');
    for (const token of ['name', 'email', 'organization', 'tel']) assert.ok(!auth.includes(token), `cadastro não pode pedir ${token}`);
    await context.close();
  }

  const verified = await postJson(`${server.baseUrl}/api/auth/setup/verify`, { setupToken: setup.setupToken, code: generateTotp(setup.manualSecret) });
  const cookie = verified.headers.get('set-cookie').split(';')[0];
  const csrf = (await verified.json()).csrfToken;
  const headers = { Cookie: cookie, 'Content-Type': 'application/json', 'X-CSRF-Token': csrf, Accept: 'application/json' };
  const initial = await (await fetch(`${server.baseUrl}/api/state`, { headers })).json();
  const saved = await fetch(`${server.baseUrl}/api/state`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      state: {
        ...(initial.state || {}),
        contacts: [
          { id: 'c1', name: 'LEANDRO RICARDO TESTE', contactRole: 'cliente', document: '123.456.789-00', city: 'Porto Alegre' },
          { id: 'c2', name: 'ARAKEN MAICA', contactRole: 'cliente' },
          { id: 'c3', name: 'VILSON DE LIMA', contactRole: 'parte contrária' }
        ],
        processes: [{ id: 'p1', number: '5000001-00.2026.8.21.0001', client: 'ARAKEN MAICA', court: 'Tribunal de Justiça (RS)', county: 'Canoas', courtUnit: '2ª Vara Cível' }]
      },
      revision: initial.revision
    })
  });
  assert.equal(saved.status, 200, await saved.clone().text());

  const [name, value] = cookie.split(/=(.*)/s);
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, colorScheme: 'dark' });
  await context.addCookies([{ name, value, url: server.baseUrl }]);
  await context.addInitScript(() => localStorage.setItem('atrium_product_tour_off', 'true'));
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${server.baseUrl}/trabalho/tarefas`, { waitUntil: 'domcontentloaded' });
  await page.locator('#appShell:not(.hidden)').waitFor();
  await page.waitForFunction(() => window.Atrium?.App?.openProcessModal);

  // Nenhum campo do sistema aceita o preenchimento do navegador.
  const unguarded = () => page.evaluate(() => [...document.querySelectorAll('input, textarea')]
    .filter(input => !input.closest('#authGate') && !['hidden', 'checkbox', 'radio', 'file', 'range', 'color', 'button', 'submit', 'reset', 'image'].includes(input.type))
    .filter(input => !['off', 'new-password', 'one-time-code'].includes(input.getAttribute('autocomplete')))
    .map(input => input.id || input.name));
  assert.deepEqual(await unguarded(), []);

  await page.evaluate(() => window.Atrium.App.openProcessModal());
  await page.locator('#field-client').waitFor();
  assert.deepEqual(await unguarded(), [], 'campo criado depois também fica protegido');
  assert.equal(await page.locator('#field-client').getAttribute('autocomplete'), 'off');

  const popup = page.locator('#fieldSuggestPopup');
  assert.equal(await popup.isVisible(), false, 'abrir o painel não abre a lista');

  // Cliente principal busca nos contatos ao digitar, em qualquer ordem de palavras.
  await page.locator('#field-client').pressSequentially('teste');
  await popup.waitFor();
  assert.match(await popup.innerText(), /LEANDRO RICARDO TESTE/);
  assert.match(await popup.innerText(), /123\.456\.789-00/);
  assert.doesNotMatch(await popup.innerText(), /ARAKEN/);
  const inView = await popup.evaluate(element => { const box = element.getBoundingClientRect(); return box.top >= 0 && box.bottom <= innerHeight && box.width > 200; });
  assert.ok(inView, 'lista inteira na tela');
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'cliente.png') });
  await page.locator('#field-client').press('ArrowDown');
  await page.locator('#field-client').press('Enter');
  assert.equal(await page.locator('#field-client').inputValue(), 'LEANDRO RICARDO TESTE');
  assert.equal(await popup.isVisible(), false);

  // Texto novo continua valendo: o campo é digitável.
  await page.locator('#field-client').fill('');
  await page.locator('#field-client').pressSequentially('Cliente novo sem cadastro');
  assert.equal(await popup.isVisible(), false);
  assert.equal(await page.locator('#field-client').inputValue(), 'Cliente novo sem cadastro');

  // Cada campo usa o contexto dele.
  await page.locator('#field-opposingParty').pressSequentially('vilson');
  await popup.locator('button', { hasText: 'VILSON DE LIMA' }).click();
  assert.equal(await page.locator('#field-opposingParty').inputValue(), 'VILSON DE LIMA');
  assert.equal(await page.locator('#field-client').inputValue(), 'Cliente novo sem cadastro');

  // Esc fecha só a lista, não o painel.
  await page.locator('#field-opposingParty').fill('');
  await page.locator('#field-opposingParty').pressSequentially('araken');
  await popup.waitFor();
  await page.locator('#field-opposingParty').press('Escape');
  assert.equal(await popup.isVisible(), false);
  assert.equal(await page.locator('#field-client').isVisible(), true, 'painel segue aberto');

  // Menu longo vira digitável, e a lista nativa segue com o valor.
  const proxy = page.locator('#field-clientPosition-busca');
  await proxy.waitFor();
  await proxy.click();
  await popup.waitFor();
  const total = await popup.locator('button').count();
  assert.ok(total >= 6, 'clicar mostra as opções');
  await proxy.fill('');
  await proxy.pressSequentially('exe');
  assert.ok(await popup.locator('button').count() < total, 'digitar filtra');
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'menu.png') });
  await popup.locator('button', { hasText: 'Exequente' }).click();
  assert.equal(await page.locator('#field-clientPosition').inputValue(), 'Exequente');
  assert.equal(await proxy.inputValue(), 'Exequente');
  // Texto que não existe volta para a opção escolhida.
  await proxy.fill('qualquer coisa');
  await page.locator('#field-client').click();
  assert.equal(await proxy.inputValue(), 'Exequente');
  assert.equal(await page.locator('#field-clientPosition').inputValue(), 'Exequente');
  // Valor gravado por código aparece no campo visível.
  await page.evaluate(() => { document.getElementById('field-clientPosition').value = 'Autor(a)'; });
  assert.equal(await proxy.inputValue(), 'Autor(a)');

  // Salvar leva o cliente digitado e não cria campo extra.
  await page.locator('#field-number').fill('0000002-97.2026.8.21.0001');
  await page.locator('#modalForm footer .button.gold').click();
  await page.waitForFunction(() => document.getElementById('modalBackdrop')?.classList.contains('hidden'));
  const read = async () => (await (await fetch(`${server.baseUrl}/api/state`, { headers })).json()).state.processes;
  let created = null;
  for (let attempt = 0; attempt < 40 && !created; attempt += 1) {
    created = (await read()).find(item => String(item.number).replace(/\D/g, '') === '00000029720268210001');
    if (!created) await page.waitForTimeout(250);
  }
  assert.equal(created?.client, 'Cliente novo sem cadastro');
  assert.equal(created?.clientPosition, 'Autor(a)');
  assert.ok(!Object.keys(created).some(key => key.includes('busca')), 'campo de busca não vai para o cadastro');

  assert.deepEqual(errors, []);
  await context.close();
  console.log('[PASS] Sugestões de contexto e preenchimento do navegador.');
} finally {
  await browser.close();
  await server.stop();
}
