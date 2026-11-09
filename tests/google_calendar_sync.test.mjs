import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { postJson, startTestServer } from './helpers.mjs';
import { startFakeGoogleCalendar } from './fake_google_calendar.mjs';
import { generateTotp } from '../lib/security.mjs';
import { agendaFields, comparable, eventBody, fieldsFromEvent, isLockedAgenda, recordPatchFromEvent, taskFields } from '../lib/calendar-sync/google-calendar-mapping.mjs';

console.log('--- Iniciando Testes: sincronização com o Google Agenda ---');

// Tradução: o que vai para o Google volta igual, senão cada leitura pareceria uma edição.
for (const record of [
  { title: 'Audiência', date: '2026-12-10', time: '14:00', location: 'Fórum', description: 'Levar documentos', client: 'Cliente Teste', process: '0000001-00.2026.8.21.0001' },
  { title: 'Reunião tarde', date: '2026-12-10', time: '23:30' },
  { title: 'Dia inteiro', date: '2026-12-11' },
  { title: 'Viagem', date: '2026-12-11', endDate: '2026-12-13' }
]) {
  const fields = agendaFields(record);
  assert.equal(comparable(fieldsFromEvent(eventBody(fields, { key: 'k' }))), comparable(fields), record.title);
}
assert.equal(fieldsFromEvent({ start: { dateTime: '2026-12-10T17:00:00Z' }, end: { dateTime: '2026-12-10T18:00:00Z' } }).time, '14:00', 'hora convertida para Brasília');
assert.equal(agendaFields({ title: 'X', date: '2026-12-10', client: 'Y' }, { privacy: 'reduced' }).summary, 'Compromisso');
assert.equal(agendaFields({ title: 'Meu dentista', date: '2026-12-10' }, { privacy: 'reduced', origin: 'google' }).summary, 'Meu dentista', 'título pessoal não é reduzido');
assert.equal(taskFields({ title: 'Recurso', fatalDeadline: '2026-12-10', client: 'Y' }, { privacy: 'reduced' }).summary, 'Prazo fatal');
assert.equal(taskFields({ title: 'Prazo eproc — intimação', deadline: '2026-12-10' }).summary, 'Prazo eproc — intimação', 'não repete "Prazo"');
assert.equal(taskFields({ title: 'Prazorama', deadline: '2026-12-10' }).summary, 'Prazo: Prazorama');
assert.equal(taskFields({ title: 'Prazo eproc', deadline: '2026-12-10', client: 'Cliente Teste', process: '123' }).summary, 'Prazo eproc · Cliente Teste', 'título diz de quem é');
assert.equal(taskFields({ title: 'Prazo eproc', deadline: '2026-12-10', process: '0000001-00' }).summary, 'Prazo eproc · 0000001-00', 'sem cliente, vai o processo');
assert.equal(taskFields({ title: 'Prazo de Cliente Teste', deadline: '2026-12-10', client: 'cliente teste' }).summary, 'Prazo de Cliente Teste', 'não repete o cliente');
assert.equal(agendaFields({ title: 'Reunião', date: '2026-12-10', client: 'Cliente Teste' }).summary, 'Reunião · Cliente Teste');
assert.equal(agendaFields({ title: 'Dentista', date: '2026-12-10', client: 'Eu' }, { origin: 'google' }).summary, 'Dentista', 'evento pessoal fica como está');
assert.equal(recordPatchFromEvent({ summary: 'Novo · Cliente Teste' }, { summary: 'Reunião · Cliente Teste' }, { record: { client: 'Cliente Teste' } }).title, 'Novo', 'o cliente não entra duas vezes no título');
assert.equal(taskFields({ title: 'Prazo fatal do recurso', fatalDeadline: '2026-12-10' }).summary, 'Prazo fatal do recurso');
assert.equal(taskFields({ title: 'Prazo eproc', fatalDeadline: '2026-12-10' }).summary, 'Prazo fatal: Prazo eproc');
assert.doesNotMatch(taskFields({ title: 'Recurso', deadline: '2026-12-10', client: 'Cliente Sigiloso' }, { privacy: 'reduced' }).footer, /Sigiloso/);
assert.equal(isLockedAgenda({ source: 'Interna' }), false);
assert.equal(isLockedAgenda({ source: 'Agenda pessoal' }), false);
assert.equal(isLockedAgenda({ source: 'eproc' }), true);
assert.equal(isLockedAgenda({ source: 'Interna', recurrence: { seriesId: 'a' } }), true);

const SHOTS = process.env.GOOGLE_CALENDAR_SHOTS || '';
const addDays = days => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);

async function signUp(server, username) {
  const setup = await (await postJson(`${server.baseUrl}/api/auth/setup`, { username, displayName: 'Pessoa Teste', password: 'Senha-Agenda-2026!' })).json();
  const verified = await postJson(`${server.baseUrl}/api/auth/setup/verify`, { setupToken: setup.setupToken, code: generateTotp(setup.manualSecret) });
  const cookie = verified.headers.get('set-cookie').split(';')[0];
  const csrf = (await verified.json()).csrfToken;
  return { cookie, headers: { Cookie: cookie, 'Content-Type': 'application/json', 'X-CSRF-Token': csrf, Accept: 'application/json' } };
}

// Sem chaves no servidor, nada liga e a tela sabe disso.
{
  const server = await startTestServer({ env: { BETA_DISABLE_AUTOMATIONS: 'true', GOOGLE_CALENDAR_CLIENT_ID: '', GOOGLE_CALENDAR_CLIENT_SECRET: '' } });
  try {
    const { headers } = await signUp(server, 'sem_chave');
    const status = await (await fetch(`${server.baseUrl}/api/google-calendar/status`, { headers })).json();
    assert.equal(status.configured, false);
    const denied = await fetch(`${server.baseUrl}/api/google-calendar/connect`, { method: 'POST', headers, body: '{}' });
    assert.equal(denied.status, 503);
  } finally {
    await server.stop();
  }
}

const google = await startFakeGoogleCalendar();
const server = await startTestServer({
  env: { BETA_DISABLE_AUTOMATIONS: 'true', GOOGLE_CALENDAR_CLIENT_ID: 'id-teste', GOOGLE_CALENDAR_CLIENT_SECRET: 'segredo-teste', GOOGLE_CALENDAR_TEST_BASE: google.baseUrl },
  preserveDataDirectory: false
});
const browser = await chromium.launch({ headless: true });
try {
  const { cookie, headers } = await signUp(server, 'titular_agenda');
  const api = (route, body) => fetch(`${server.baseUrl}/api/google-calendar/${route}`, body === undefined ? { headers } : { method: 'POST', headers, body: JSON.stringify(body) });
  const readState = async () => (await fetch(`${server.baseUrl}/api/state`, { headers })).json();
  const writeState = async change => {
    const current = await readState();
    const state = current.state || {};
    change(state);
    const saved = await fetch(`${server.baseUrl}/api/state`, { method: 'POST', headers, body: JSON.stringify({ state, revision: current.revision }) });
    assert.equal(saved.status, 200, await saved.clone().text());
  };
  const agendaItem = async id => (await readState()).state.agenda.find(item => item.id === id);
  const sync = async () => {
    const response = await api('sync', {});
    assert.equal(response.status, 200, await response.clone().text());
    return response.json();
  };

  // Sessão e CSRF valem nas rotas de quem está logado.
  assert.equal((await fetch(`${server.baseUrl}/api/google-calendar/status`)).status, 401);
  assert.equal((await fetch(`${server.baseUrl}/api/google-calendar/connect`, { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: '{}' })).status, 403);

  await writeState(state => {
    state.agenda = [
      { id: 'ag-comum', title: 'Reunião com cliente', date: addDays(3), time: '10:00', source: 'Interna', client: 'Cliente Teste', location: 'Sala 1', updatedAt: new Date(Date.now() - 60000).toISOString() },
      { id: 'ag-tribunal', title: 'Audiência de instrução', date: addDays(5), time: '15:00', source: 'eproc', process: '0000001-00.2026.8.21.0001' },
      { id: 'ag-apagar', title: 'Compromisso para apagar', date: addDays(6), source: 'Interna' },
      { id: 'ag-mantido', title: 'Compromisso apagado lá', date: addDays(7), source: 'Interna' },
      { id: 'ag-passado', title: 'Muito antigo', date: addDays(-90), source: 'Interna' },
      { id: 'external-calendar:uid-1', externalId: 'external-calendar:uid-1', title: 'Veio por link', date: addDays(3), source: 'Agenda externa' }
    ];
    state.tasks = [
      { id: 'tk-prazo', title: 'Contestação', deadline: addDays(4), status: 'pendente', client: 'Cliente Teste', deadlineSource: 'eproc' },
      { id: 'tk-fatal', title: 'Recurso', fatalDeadline: addDays(8), status: 'pendente' },
      { id: 'tk-feita', title: 'Concluída', deadline: addDays(4), status: 'concluida', completedAt: new Date().toISOString() }
    ];
  });

  // Conexão: o retorno do Google sozinho não liga nada; a confirmação exige a sessão.
  const connect = await (await api('connect', {})).json();
  const authUrl = new URL(connect.authorizationUrl);
  assert.equal(authUrl.searchParams.get('scope'), 'https://www.googleapis.com/auth/calendar.events', 'pede só o escopo de eventos');
  assert.equal(authUrl.searchParams.get('access_type'), 'offline');
  const toCallback = await fetch(authUrl, { redirect: 'manual' });
  const toApp = await fetch(toCallback.headers.get('location'), { redirect: 'manual' });
  const appUrl = new URL(toApp.headers.get('location'), server.baseUrl);
  assert.equal(appUrl.pathname, '/sistema/integracoes');
  assert.equal(appUrl.searchParams.get('googleAgenda'), 'confirmar');
  assert.equal((await (await api('status')).json()).connected, false, 'ainda não ligou');
  assert.equal((await api('confirm', { connectionId: 'qualquer' })).status, 403);
  const replay = await fetch(toCallback.headers.get('location'), { redirect: 'manual' });
  assert.equal(new URL(replay.headers.get('location'), server.baseUrl).searchParams.get('googleAgenda'), 'erro', 'pedido não vale duas vezes');
  const confirmed = await (await api('confirm', { connectionId: appUrl.searchParams.get('conexao') })).json();
  assert.equal(confirmed.connected, true);
  assert.equal(JSON.stringify(confirmed).includes('chave-duradoura'), false, 'tela nunca recebe a chave');

  const first = await sync();
  assert.equal(first.status, 'connected', first.lastError);
  assert.equal(first.account, 'pessoa.teste@example.test');
  assert.ok(google.bySummary('Reunião com cliente'), 'compromisso foi para o Google');
  assert.match(google.bySummary('Reunião com cliente').description, /Cliente: Cliente Teste/);
  assert.equal(google.bySummary('Reunião com cliente').summary, 'Reunião com cliente · Cliente Teste');
  assert.equal(google.bySummary('Contestação').summary, 'Prazo: Contestação · Cliente Teste');
  assert.equal(google.bySummary('Prazo: Contestação').start.date, addDays(4), 'prazo é de dia inteiro');
  assert.equal(google.bySummary('Prazo: Contestação').transparency, 'transparent');
  assert.equal(google.bySummary('Prazo fatal: Recurso').colorId, '11');
  assert.equal(google.bySummary('Concluída'), undefined, 'tarefa concluída não vai');
  assert.equal(google.bySummary('Muito antigo'), undefined, 'fora da janela não vai');
  assert.equal(google.bySummary('Veio por link'), undefined, 'agenda externa não volta para o Google');

  // Sem mudança, nada é regravado (nem o eco do próprio envio).
  const writesBefore = google.state.writes.length;
  await sync();
  await sync();
  assert.equal(google.state.writes.length, writesBefore, 'sincronizar de novo não reescreve');

  // Vice-versa: o que nasce na agenda pessoal entra no ATRIUM, privado.
  google.personalCreate('pessoal-1', { summary: 'Dentista', start: { dateTime: `${addDays(2)}T09:00:00-03:00` }, end: { dateTime: `${addDays(2)}T09:30:00-03:00` } });
  google.personalCreate('pessoal-aniv', { summary: 'Aniversário', eventType: 'birthday', start: { date: addDays(2) }, end: { date: addDays(3) } });
  await sync();
  const personal = (await readState()).state.agenda.find(item => item.title === 'Dentista');
  assert.ok(personal, 'evento pessoal chegou');
  assert.equal(personal.scope, 'private');
  assert.ok(personal.privateOwnerUserId);
  assert.equal(personal.source, 'Agenda pessoal');
  assert.equal(personal.time, '09:00');
  assert.equal(personal.endTime, '09:30');
  assert.ok(!(await readState()).state.agenda.some(item => item.title === 'Aniversário'), 'só eventos comuns');
  assert.equal(google.live().filter(event => event.summary === 'Dentista').length, 1, 'não duplica');

  // Compromisso comum mudado lá muda aqui, com registro no histórico.
  const common = google.bySummary('Reunião com cliente');
  google.personalEdit(common.id, { summary: 'Reunião remarcada', start: { dateTime: `${addDays(3)}T16:00:00-03:00`, timeZone: 'America/Sao_Paulo' }, end: { dateTime: `${addDays(3)}T17:00:00-03:00`, timeZone: 'America/Sao_Paulo' } });
  await sync();
  const changed = await agendaItem('ag-comum');
  assert.equal(changed.title, 'Reunião remarcada');
  assert.equal(changed.time, '16:00');
  assert.equal(changed.client, 'Cliente Teste', 'contexto do ATRIUM não se perde');
  assert.ok((await readState()).state.audit.some(entry => entry.action === 'Compromisso alterado pela agenda pessoal'));

  // Mudado aqui, muda lá.
  await writeState(state => {
    const item = state.agenda.find(record => record.id === 'ag-comum');
    item.title = 'Reunião no escritório';
    item.updatedAt = new Date(Date.now() + 5000).toISOString();
  });
  await sync();
  assert.ok(google.bySummary('Reunião no escritório'));

  // Editado nos dois lados: vale o mais recente. Aqui, o do ATRIUM.
  const both = google.bySummary('Reunião no escritório');
  google.personalEdit(both.id, { summary: 'Versão antiga do Google', updated: undefined });
  google.events.get(both.id).updated = new Date(Date.now() - 3600000).toISOString();
  await writeState(state => {
    const item = state.agenda.find(record => record.id === 'ag-comum');
    item.title = 'Versão nova do ATRIUM';
    item.updatedAt = new Date(Date.now() + 9000).toISOString();
  });
  await sync();
  assert.equal((await agendaItem('ag-comum')).title, 'Versão nova do ATRIUM');
  assert.equal(google.bySummary('Versão nova do ATRIUM').summary, 'Versão nova do ATRIUM · Cliente Teste');

  // Prazo e audiência não mudam pela agenda pessoal: o ATRIUM restaura.
  const task = google.bySummary('Prazo: Contestação');
  google.personalEdit(task.id, { summary: 'Prazo mudado', start: { date: addDays(40) }, end: { date: addDays(41) } });
  const hearing = google.bySummary('Audiência de instrução');
  google.personalEdit(hearing.id, { start: { dateTime: `${addDays(50)}T08:00:00-03:00` }, end: { dateTime: `${addDays(50)}T09:00:00-03:00` } });
  await sync();
  assert.equal((await readState()).state.tasks.find(item => item.id === 'tk-prazo').deadline, addDays(4), 'prazo intacto');
  assert.equal((await agendaItem('ag-tribunal')).date, addDays(5), 'audiência intacta');
  assert.equal(google.events.get(task.id).start.date, addDays(4), 'prazo restaurado no Google');
  assert.match(google.events.get(hearing.id).start.dateTime, new RegExp(addDays(5)), 'audiência restaurada no Google');

  // Prazo apagado lá volta; compromisso comum apagado lá fica no ATRIUM e não reaparece lá.
  google.personalDelete(task.id);
  const kept = google.bySummary('Compromisso apagado lá');
  google.personalDelete(kept.id);
  const afterDelete = await sync();
  assert.equal(google.events.get(task.id).status, 'confirmed', 'prazo apagado voltou');
  assert.ok(await agendaItem('ag-mantido'), 'continua no ATRIUM');
  assert.equal(google.events.get(kept.id).status, 'cancelled', 'não foi recriado');
  assert.equal(afterDelete.keptDeleted, 1);
  await sync();
  assert.equal(google.events.get(kept.id).status, 'cancelled');

  // Apagado no ATRIUM some do Google. Concluir tarefa tira o prazo de lá.
  const toDelete = google.bySummary('Compromisso para apagar');
  const fatal = google.bySummary('Prazo fatal: Recurso');
  await writeState(state => {
    state.agenda = state.agenda.filter(record => record.id !== 'ag-apagar');
    state.tasks.find(item => item.id === 'tk-fatal').status = 'concluida';
  });
  await sync();
  assert.equal(google.events.get(toDelete.id).status, 'cancelled');
  assert.equal(google.events.get(fatal.id).status, 'cancelled');

  // Compromisso pessoal: mudar no ATRIUM muda lá; apagar lá tira daqui.
  await writeState(state => {
    const item = state.agenda.find(record => record.title === 'Dentista');
    item.title = 'Dentista remarcado';
    item.updatedAt = new Date(Date.now() + 15000).toISOString();
  });
  await sync();
  assert.equal(google.events.get('pessoal-1').summary, 'Dentista remarcado');
  assert.equal(google.events.get('pessoal-1').extendedProperties, undefined, 'evento pessoal não recebe marca do ATRIUM');
  google.personalDelete('pessoal-1');
  await sync();
  assert.ok(!(await readState()).state.agenda.some(item => item.title === 'Dentista remarcado'));

  // Chave de sincronização vencida: relê tudo e não duplica nada.
  const countBefore = (await readState()).state.agenda.length;
  google.state.expireSyncToken = true;
  const afterExpired = await sync();
  assert.equal(afterExpired.lastError, '');
  assert.equal((await readState()).state.agenda.length, countBefore);

  // Títulos reduzidos: dados do cliente saem do Google, e mudar o título lá não toca o registro.
  assert.equal((await api('settings', { privacy: 'qualquer' })).status, 400);
  await api('settings', { privacy: 'reduced' });
  await sync();
  const reduced = google.events.get(google.live().find(event => event.extendedProperties?.private?.atriumKey === 'agenda:ag-comum').id);
  assert.equal(reduced.summary, 'Compromisso');
  assert.doesNotMatch(reduced.description, /Cliente Teste/);
  assert.equal(reduced.location, '');
  google.personalEdit(reduced.id, { summary: 'Título trocado lá' });
  await sync();
  assert.equal((await agendaItem('ag-comum')).title, 'Versão nova do ATRIUM');
  await api('settings', { privacy: 'full' });
  await sync();

  // Trava: um estado que some de repente não limpa a agenda pessoal.
  await writeState(state => {
    state.tasks = [...state.tasks, ...Array.from({ length: 30 }, (_, index) => ({ id: `lote-${index}`, title: `Lote ${index}`, deadline: addDays(10), status: 'pendente' }))];
  });
  await sync();
  const liveBefore = google.live().length;
  await writeState(state => { state.tasks = state.tasks.filter(item => !String(item.id).startsWith('lote-')); });
  const braked = await sync();
  assert.equal(google.live().length, liveBefore, 'nada apagado');
  assert.match(braked.lastError, /Nada foi apagado/);

  // O cofre não guarda nada legível.
  const vaultFile = path.join(server.dataDirectory, 'google-calendar.json');
  const vaultRaw = await readFile(vaultFile, 'utf8');
  assert.equal(vaultRaw.includes('chave-duradoura'), false);
  assert.equal(vaultRaw.includes('acesso-'), false);

  // Tela.
  const [name, value] = cookie.split(/=(.*)/s);
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await context.addCookies([{ name, value, url: server.baseUrl }]);
  await context.addInitScript(() => localStorage.setItem('atrium_product_tour_off', 'true'));
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${server.baseUrl}/sistema/integracoes`, { waitUntil: 'domcontentloaded' });
  await page.locator('#googleCalendarButton:not([disabled])').waitFor();
  assert.equal(await page.locator('#googleCalendarStatus').textContent(), 'Com aviso');
  assert.match(await page.locator('#googleCalendarDetail').innerText(), /pessoa\.teste@example\.test/);
  await page.locator('#googleCalendarButton').scrollIntoViewIfNeeded();
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'cartao.png') });
  await page.locator('#googleCalendarButton').click();
  await page.locator('#googleCalendarBackdrop:not(.hidden)').waitFor();
  assert.equal(await page.locator('#googleCalendarPrimary').innerText(), 'Sincronizar agora');
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'googleCalendarPrimary', 'foco entra no painel');
  await page.waitForFunction(() => document.getAnimations().every(item => item.playState !== 'running' || item.effect?.getTiming?.().iterations === Infinity));
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'painel.png') });
  await page.locator('#googleCalendarTaskScope').selectOption('mine');
  await page.locator('#googleCalendarMessage.success').waitFor();
  await page.keyboard.press('Escape');
  await page.locator('#googleCalendarBackdrop.hidden').waitFor({ state: 'attached' });
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'googleCalendarButton', 'foco volta ao botão');

  // Compromisso pessoal aparece na Agenda como tal.
  google.personalCreate('pessoal-2', { summary: 'Consulta pessoal', start: { date: addDays(2) }, end: { date: addDays(3) } });
  await sync();
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator('#appShell:not(.hidden)').waitFor();
  await page.goto(`${server.baseUrl}/trabalho/agenda`, { waitUntil: 'domcontentloaded' });
  await page.locator('#agendaList').getByText('Consulta pessoal').first().waitFor();
  assert.match(await page.locator('#agendaList').innerText(), /Agenda pessoal/);
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'agenda.png') });
  await context.close();

  // Celular.
  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: 'dark' });
  await mobile.addCookies([{ name, value, url: server.baseUrl }]);
  await mobile.addInitScript(() => localStorage.setItem('atrium_product_tour_off', 'true'));
  const phone = await mobile.newPage();
  await phone.goto(`${server.baseUrl}/sistema/integracoes`, { waitUntil: 'domcontentloaded' });
  await phone.locator('#googleCalendarButton:not([disabled])').waitFor();
  await phone.locator('#googleCalendarButton').scrollIntoViewIfNeeded();
  if (SHOTS) await phone.screenshot({ path: path.join(SHOTS, 'cartao-celular.png') });
  await phone.locator('#googleCalendarButton').click();
  await phone.locator('#googleCalendarBackdrop:not(.hidden)').waitFor();
  const overflow = await phone.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  assert.ok(overflow <= 1, `sem rolagem lateral (${overflow})`);
  await phone.waitForFunction(() => document.getAnimations().every(item => item.playState !== 'running' || item.effect?.getTiming?.().iterations === Infinity));
  if (SHOTS) await phone.screenshot({ path: path.join(SHOTS, 'painel-celular.png') });
  await phone.evaluate(() => window.Atrium.App.setTheme('dark')); await phone.waitForTimeout(500);
  if (SHOTS) await phone.screenshot({ path: path.join(SHOTS, 'painel-celular-escuro.png') });
  await mobile.close();

  // Autorização encerrada pelo Google: a tela pede nova conexão e a sincronização para.
  google.state.failRefresh = true;
  google.state.rejectAccess = true;
  assert.equal((await sync()).status, 'connected', 'recusa isolada ainda não encerra');
  const ended = await sync();
  assert.equal(ended.status, 'reconnect_needed');
  assert.match(ended.lastError, /Conecte a agenda de novo/);
  google.state.failRefresh = false;
  google.state.rejectAccess = false;
  assert.equal((await sync()).status, 'connected');

  // Desconectar: tira as cópias do ATRIUM, tira os compromissos pessoais daqui, encerra a autorização.
  const disconnected = await (await api('disconnect', {})).json();
  assert.equal(disconnected.connected, false);
  assert.ok(disconnected.removedCopies > 0);
  assert.equal(google.live().filter(event => event.extendedProperties?.private?.atriumKey).length, 0, 'nenhuma cópia ficou');
  assert.equal(google.events.get('pessoal-2').status, 'confirmed', 'evento pessoal segue na conta');
  assert.ok(!(await readState()).state.agenda.some(item => item.source === 'Agenda pessoal'));
  assert.deepEqual(google.state.revoked, ['chave-duradoura-secreta']);
  assert.ok(await agendaItem('ag-comum'), 'compromisso do escritório continua');

  assert.deepEqual(errors, []);
  console.log('[PASS] Sincronização com o Google Agenda.');
} finally {
  await browser.close();
  await server.stop();
  await google.stop();
}
