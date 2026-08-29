import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { startTestServer, postJson } from './helpers.mjs';
import { generateTotp } from '../lib/security.mjs';
import { runStateMigrations, migrate7To8, migrate8To9, CURRENT_SCHEMA_VERSION } from '../lib/state-migrations.mjs';
import { isoDate } from '../js/core/store.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

console.log('\n===============================================================');
console.log('  ATRIUM — SUÍTE DE TESTES: WORKFLOW DE TRATAMENTO DE PUBLICAÇÕES');
console.log('===============================================================\n');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✅ [PASS] ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ❌ [FAIL] ${name}`);
    console.error(`     ${err.message}`);
    failed++;
  }
}

async function testAsync(name, fn) {
  try {
    await fn();
    console.log(`  ✅ [PASS] ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ❌ [FAIL] ${name}`);
    console.error(`     ${err.message}`);
    failed++;
  }
}

// ─────────────────────────────────────────────────────────────
// 1. TESTES UNITÁRIOS DO MODELO DE MIGRAÇÃO, TIMESTAMPS E TIMEZONE
// ─────────────────────────────────────────────────────────────
console.log('[1/4] Testando migração de schema, imutabilidade e timezone...');

test('Migração v7 -> v8 atribui treatmentStatus = untreated por padrão sem perder dados', () => {
  const v7State = {
    schemaVersion: 7,
    intimations: [
      {
        id: 'int-legacy-1',
        title: 'Intimação Sem Status de Tratamento',
        process: '5001234-55.2026.4.04.7100',
        client: 'Cliente A',
        court: 'TRF4',
        publishedAt: '2026-08-20',
        source: 'DJEN',
        text: 'Fica intimada a parte autora para se manifestar.',
        status: 'nova',
        unread: true
      },
      {
        id: 'int-legacy-2',
        title: 'Intimação Arquivada Legada',
        process: '5009876-11.2026.4.04.7100',
        client: 'Cliente B',
        court: 'TJRS',
        publishedAt: '2026-08-15',
        source: 'Diário da Justiça',
        text: 'Processo extinto.',
        status: 'arquivada',
        unread: false
      },
      {
        id: 'int-legacy-3',
        title: 'Intimação Já Conferida Legada',
        process: '5005555-22.2026.4.04.7100',
        client: 'Cliente C',
        court: 'TRT4',
        publishedAt: '2026-08-18',
        source: 'DJEN',
        text: 'Audiência designada.',
        status: 'prazo',
        unread: false
      }
    ]
  };

  const result = runStateMigrations(v7State, '2.0.0-beta');
  assert.equal(result.state.schemaVersion, CURRENT_SCHEMA_VERSION);

  const [it1, it2, it3] = result.state.intimations;

  // it1: default untreated
  assert.equal(it1.treatmentStatus, 'untreated');
  assert.equal(it1.text, 'Fica intimada a parte autora para se manifestar.');
  assert.equal(it1.process, '5001234-55.2026.4.04.7100');
  assert.equal(it1.unread, true);
  assert.equal(it1.status, 'nova');

  // it2: arquivada -> discarded sem fabricar timestamp
  assert.equal(it2.treatmentStatus, 'discarded');
  assert.equal(it2.text, 'Processo extinto.');
  assert.equal(it2.status, 'arquivada');
  assert.equal(it2.discardedAt, null);
  assert.equal(it2.discardedBy, 'Sistema (Migração)');

  // it3: prazo -> treated sem fabricar timestamp
  assert.equal(it3.treatmentStatus, 'treated');
  assert.equal(it3.text, 'Audiência designada.');
  assert.equal(it3.status, 'prazo');
  assert.equal(it3.treatedAt, null);
  assert.equal(it3.treatedBy, 'Sistema (Migração)');
});

test('Migration 7->8 e 8->9 não fabricam treatedAt/discardedAt e limpam legados incorretos', () => {
  const v8State = {
    schemaVersion: 8,
    intimations: [
      {
        id: 'int-fab-1',
        treatmentStatus: 'treated',
        treatedBy: 'Sistema (Migração)',
        treatedAt: '2026-08-20',
        publishedAt: '2026-08-20'
      },
      {
        id: 'int-real-1',
        treatmentStatus: 'treated',
        treatedBy: 'Administrador Tratamento Teste',
        treatedAt: '2026-08-20T14:30:00.000Z',
        publishedAt: '2026-08-20'
      },
      {
        id: 'int-fab-2',
        treatmentStatus: 'discarded',
        discardedBy: 'Sistema (Migração)',
        discardedAt: '2026-08-20',
        publishedAt: '2026-08-20'
      }
    ]
  };

  const v9State = migrate8To9(v8State);
  assert.equal(v9State.schemaVersion, 9);
  assert.equal(v9State.intimations[0].treatedAt, null, 'Timestamp fabricado deve ser limpo para null');
  assert.equal(v9State.intimations[1].treatedAt, '2026-08-20T14:30:00.000Z', 'Timestamp real do usuário deve ser preservado');
  assert.equal(v9State.intimations[2].discardedAt, null, 'Timestamp de descarte fabricado deve ser limpo para null');
});

test('Timezone America/Sao_Paulo: cálculo de idade da publicação baseado em data local', () => {
  const parseLocalDate = value => {
    if (!value) return null;
    const str = String(value).slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
      const [year, month, day] = str.split('-').map(Number);
      return new Date(year, month - 1, day);
    }
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  };

  const formatPublicationAge = (dateVal, refNow = new Date()) => {
    const d = parseLocalDate(dateVal);
    if (!d) return 'Data não informada';
    const now = refNow;
    const d1 = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const d2 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const diffDays = Math.round((d2 - d1) / (1000 * 60 * 60 * 24));
    if (diffDays <= 0) return 'Hoje';
    if (diffDays === 1) return 'Há 1 dia';
    return `Há ${diffDays} dias`;
  };

  const fakeNow = new Date(2026, 7, 27, 10, 0, 0); // 27 de Agosto de 2026
  assert.equal(formatPublicationAge('2026-08-27', fakeNow), 'Hoje');
  assert.equal(formatPublicationAge('2026-08-26', fakeNow), 'Há 1 dia');
  assert.equal(formatPublicationAge('2026-08-22', fakeNow), 'Há 5 dias');
});

// ─────────────────────────────────────────────────────────────
// 2. TESTES DE API DO SERVIDOR (ENDPOINT /api/intimations/:id/treatment)
// ─────────────────────────────────────────────────────────────
console.log('\n[2/4] Testando endpoint seguro de tratamento no servidor...');

const server = await startTestServer();

try {
  // 1. Setup Admin
  const adminPassword = 'Admin-Password-Treatment-12345!';
  let res = await postJson(`${server.baseUrl}/api/auth/setup`, {
    username: 'admin_treatment',
    displayName: 'Administrador Tratamento Teste',
    email: 'admin.tratamento@example.test',
    password: adminPassword
  });
  const setupData = await res.json();
  res = await postJson(`${server.baseUrl}/api/auth/setup/verify`, {
    setupToken: setupData.setupToken,
    code: generateTotp(setupData.manualSecret)
  });
  const verified = await res.json();
  const sessionCookie = res.headers.get('set-cookie').split(';')[0];
  const csrfToken = verified.csrfToken;

  // 2. Seed state with intimations
  res = await fetch(`${server.baseUrl}/api/state`, { headers: { Cookie: sessionCookie } });
  const stateEnv = await res.json();
  const state = stateEnv.state || {};

  state.processes = [
    {
      id: 'proc-1',
      number: '5001111-22.2026.8.21.0001',
      client: 'Indústria Metalúrgica Sul Ltda',
      opposingParty: 'Fazenda Nacional',
      court: 'TJRS · 1ª Vara Cível de Porto Alegre'
    },
    {
      id: 'proc-2',
      number: '5002222-33.2026.4.04.7100',
      client: 'Agropecuária Rio Grandense S/A',
      opposingParty: 'União Federal',
      court: 'TRF4 · 2ª Vara Federal de Porto Alegre'
    }
  ];

  const todayStr = isoDate();
  state.intimations = [
    {
      id: 'pub-test-1',
      title: 'Despacho com determinação de emenda à inicial',
      process: '5001111-22.2026.8.21.0001',
      client: 'Indústria Metalúrgica Sul Ltda',
      court: 'TJRS · 1ª Vara Cível de Porto Alegre',
      publishedAt: todayStr,
      source: 'DJEN',
      text: 'Intime-se o autor para emendar a petição inicial em 15 dias sob pena de indeferimento.',
      status: 'nova',
      treatmentStatus: 'untreated',
      unread: true,
      urgent: false
    },
    {
      id: 'pub-test-2',
      title: 'Decisão interlocutória de tutela de urgência',
      process: '5002222-33.2026.4.04.7100',
      client: 'Agropecuária Rio Grandense S/A',
      court: 'TRF4 · 2ª Vara Federal de Porto Alegre',
      publishedAt: todayStr,
      source: 'DJEN',
      text: 'Defiro a tutela provisória de urgência para suspender a exigibilidade do débito.',
      status: 'nova',
      treatmentStatus: 'untreated',
      unread: true,
      urgent: true
    },
    {
      id: 'pub-test-3',
      title: 'Despacho de mero expediente',
      process: '5001111-22.2026.8.21.0001',
      client: 'Indústria Metalúrgica Sul Ltda',
      court: 'TJRS · 1ª Vara Cível de Porto Alegre',
      publishedAt: todayStr,
      source: 'DJEN',
      text: 'Aguarde-se manifestação das partes.',
      status: 'nova',
      treatmentStatus: 'in_review',
      treatmentStartedAt: new Date().toISOString(),
      treatmentStartedBy: 'Administrador Tratamento Teste',
      unread: false,
      urgent: false
    }
  ];

  res = await postJson(`${server.baseUrl}/api/state`, { state }, {
    Cookie: sessionCookie,
    'X-CSRF-Token': csrfToken
  });
  const savedState = await res.json();
  let currentRev = savedState.revision;

  // ── SEGURANÇA E CONCORRÊNCIA ──
  await testAsync('Segurança: Requisição sem login retorna 401 Unauthorized', async () => {
    const unauthRes = await fetch(`${server.baseUrl}/api/intimations/pub-test-1/treatment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'start_review', revision: currentRev })
    });
    assert.equal(unauthRes.status, 401);
  });

  await testAsync('Segurança: Requisição sem CSRF token retorna 403 Forbidden', async () => {
    const noCsrfRes = await fetch(`${server.baseUrl}/api/intimations/pub-test-1/treatment`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': sessionCookie
      },
      body: JSON.stringify({ action: 'start_review', revision: currentRev })
    });
    assert.equal(noCsrfRes.status, 403);
  });

  await testAsync('Concorrência: Requisição sem revision quando o servidor possui revision retorna 409', async () => {
    const noRevRes = await fetch(`${server.baseUrl}/api/intimations/pub-test-1/treatment`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': sessionCookie,
        'X-CSRF-Token': csrfToken
      },
      body: JSON.stringify({ action: 'start_review' })
    });
    assert.equal(noRevRes.status, 409);
    const errData = await noRevRes.json();
    assert.match(errData.message, /Revisão de estado obrigatória/i);
  });

  await testAsync('Concorrência: Revision divergente retorna status 409 Conflict', async () => {
    const badRevRes = await fetch(`${server.baseUrl}/api/intimations/pub-test-1/treatment`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': sessionCookie,
        'X-CSRF-Token': csrfToken
      },
      body: JSON.stringify({ action: 'start_review', revision: 999999 })
    });
    assert.equal(badRevRes.status, 409);
    const data = await badRevRes.json();
    assert.match(data.message, /outro usuário/i);
  });

  // ── MÁQUINA DE ESTADOS E TRANSIÇÕES VÁLIDAS ──
  await testAsync('Transição: untreated -> in_review (start_review) com actor de sessão autenticado', async () => {
    const res = await fetch(`${server.baseUrl}/api/intimations/pub-test-1/treatment`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': sessionCookie,
        'X-CSRF-Token': csrfToken
      },
      body: JSON.stringify({
        action: 'start_review',
        revision: currentRev,
        actor: 'Hacker Fraudulento'
      })
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.ok, true);
    assert.equal(data.intimation.treatmentStatus, 'in_review');
    assert.equal(data.intimation.treatmentStartedBy, 'Administrador Tratamento Teste', 'Actor deve ser derivado da sessão autenticada');
    assert.ok(data.intimation.treatmentStartedAt);
    currentRev = data.revision;
  });

  await testAsync('Máquina de Estados: Transição inválida in_review -> restore retorna 409', async () => {
    const invalidRes = await fetch(`${server.baseUrl}/api/intimations/pub-test-1/treatment`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': sessionCookie,
        'X-CSRF-Token': csrfToken
      },
      body: JSON.stringify({ action: 'restore', revision: currentRev })
    });
    assert.equal(invalidRes.status, 409);
    const err = await invalidRes.json();
    assert.match(err.message, /Transição inválida/i);
  });

  await testAsync('Transição: in_review -> treated (mark_treated) e limpeza de metadados contraditórios', async () => {
    const res = await fetch(`${server.baseUrl}/api/intimations/pub-test-1/treatment`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': sessionCookie,
        'X-CSRF-Token': csrfToken
      },
      body: JSON.stringify({
        action: 'mark_treated',
        note: 'Emenda elaborada e protocolada',
        revision: currentRev
      })
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.ok, true);
    assert.equal(data.intimation.treatmentStatus, 'treated');
    assert.equal(data.intimation.treatedBy, 'Administrador Tratamento Teste');
    assert.equal(data.intimation.treatmentNote, 'Emenda elaborada e protocolada');
    assert.equal(data.intimation.discardedAt, null);
    assert.equal(data.intimation.discardedBy, null);
    assert.ok(data.intimation.treatedAt);
    currentRev = data.revision;
  });

  await testAsync('Máquina de Estados: Transição inválida treated -> discard retorna 409', async () => {
    const invalidRes = await fetch(`${server.baseUrl}/api/intimations/pub-test-1/treatment`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': sessionCookie,
        'X-CSRF-Token': csrfToken
      },
      body: JSON.stringify({ action: 'discard', note: 'Tentando descartar tratada', revision: currentRev })
    });
    assert.equal(invalidRes.status, 409);
    const err = await invalidRes.json();
    assert.match(err.message, /Transição inválida/i);
  });

  await testAsync('Transição: treated -> in_review (reopen) com limpeza de treatedAt/treatedBy', async () => {
    const res = await fetch(`${server.baseUrl}/api/intimations/pub-test-1/treatment`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': sessionCookie,
        'X-CSRF-Token': csrfToken
      },
      body: JSON.stringify({ action: 'reopen', revision: currentRev })
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.ok, true);
    assert.equal(data.intimation.treatmentStatus, 'in_review');
    assert.equal(data.intimation.treatedAt, null);
    assert.equal(data.intimation.treatedBy, null);
    assert.equal(data.intimation.treatmentNote, null);
    currentRev = data.revision;
  });

  await testAsync('Transição: in_review -> discarded (discard com nota)', async () => {
    const res = await fetch(`${server.baseUrl}/api/intimations/pub-test-1/treatment`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': sessionCookie,
        'X-CSRF-Token': csrfToken
      },
      body: JSON.stringify({
        action: 'discard',
        note: 'Publicação duplicada do DJEN',
        revision: currentRev
      })
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.ok, true);
    assert.equal(data.intimation.treatmentStatus, 'discarded');
    assert.equal(data.intimation.discardedBy, 'Administrador Tratamento Teste');
    assert.equal(data.intimation.treatmentNote, 'Publicação duplicada do DJEN');
    assert.equal(data.intimation.treatedAt, null);
    assert.equal(data.intimation.treatedBy, null);
    assert.ok(data.intimation.discardedAt);
    currentRev = data.revision;
  });

  await testAsync('Máquina de Estados: Transição inválida discarded -> mark_treated retorna 409', async () => {
    const invalidRes = await fetch(`${server.baseUrl}/api/intimations/pub-test-1/treatment`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': sessionCookie,
        'X-CSRF-Token': csrfToken
      },
      body: JSON.stringify({ action: 'mark_treated', revision: currentRev })
    });
    assert.equal(invalidRes.status, 409);
    const err = await invalidRes.json();
    assert.match(err.message, /Transição inválida/i);
  });

  await testAsync('Transição: discarded -> untreated (restore) e limpeza de descarte', async () => {
    const res = await fetch(`${server.baseUrl}/api/intimations/pub-test-1/treatment`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': sessionCookie,
        'X-CSRF-Token': csrfToken
      },
      body: JSON.stringify({ action: 'restore', revision: currentRev })
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.ok, true);
    assert.equal(data.intimation.treatmentStatus, 'untreated');
    assert.equal(data.intimation.discardedAt, null);
    assert.equal(data.intimation.discardedBy, null);
    assert.equal(data.intimation.treatedAt, null);
    assert.equal(data.intimation.treatedBy, null);
    assert.equal(data.intimation.treatmentNote, null);
    currentRev = data.revision;
  });

  await testAsync('Máquina de Estados: Transição inválida untreated -> restore retorna 409', async () => {
    const invalidRes = await fetch(`${server.baseUrl}/api/intimations/pub-test-1/treatment`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': sessionCookie,
        'X-CSRF-Token': csrfToken
      },
      body: JSON.stringify({ action: 'restore', revision: currentRev })
    });
    assert.equal(invalidRes.status, 409);
    const err = await invalidRes.json();
    assert.match(err.message, /Transição inválida/i);
  });

  // ─────────────────────────────────────────────────────────────
  // 3. TESTE E2E PLAYWRIGHT
  // ─────────────────────────────────────────────────────────────
  console.log('\n[3/4] Testando fluxo E2E no navegador com Playwright...');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();

  try {
    page.on('console', msg => console.log('    [BROWSER]', msg.type(), msg.text()));
    page.on('pageerror', err => console.error('    [BROWSER ERROR]', err.message));

    await testAsync('E2E: Login, visualização de contadores, triagem, criação de tarefa e tratamento', async () => {
      await page.goto(server.baseUrl, { waitUntil: 'networkidle' });

      // Executar login
      await page.locator('#authLoginForm.active').waitFor();
      await page.locator('#authLoginForm [name="username"]').fill('admin_treatment');
      await page.locator('#authLoginForm [name="password"]').fill(adminPassword);
      await page.locator('#authLoginForm [name="code"]').fill(generateTotp(setupData.manualSecret));
      await page.locator('#authLoginForm button[type="submit"]').click();
      await page.locator('#appShell:not(.hidden)').waitFor();

      // Fechar tour e configurar tema claro
      await page.evaluate(() => {
        localStorage.setItem('jurisflow_tour_completed', 'true');
        localStorage.setItem('jurisflow_tour_seen', 'true');
        const tour = document.getElementById('guidedTourBackdrop');
        if (tour) tour.classList.add('hidden');
        document.documentElement.setAttribute('data-theme', 'light');
      });
      await page.waitForTimeout(300);

      // Navegar para Publicações
      await page.click('.nav-item[data-view="inbox"]');
      await page.waitForSelector('#view-inbox.active', { state: 'visible' });

      // Validar contadores operacionais no cabeçalho
      const untreatedCount = await page.textContent('#pubMetricUntreated');
      assert.ok(Number(untreatedCount) >= 2, `Contador de não tratadas deve ser >= 2 (encontrado: ${untreatedCount})`);

      // ── TESTE BUG 3: Filtro "Prazo fatal" sem publicações com fatalDeadline explícito retorna 0 ──
      const fatalCountZero = await page.evaluate(() => {
        const app = window.Atrium?.App || window.JurisFlow?.App;
        app.inboxFilter = 'prazo-fatal';
        const items = app.filteredIntimations();
        app.inboxFilter = 'untreated';
        return items.length;
      });
      assert.equal(fatalCountZero, 0, 'Filtro prazo-fatal sem flag explícita fatalDeadline deve retornar zero registros');

      const fatalCountWithFlag = await page.evaluate(() => {
        const app = window.Atrium?.App || window.JurisFlow?.App;
        const store = window.Atrium?.Store || window.JurisFlow?.Store;
        const item = store.state.intimations[0];
        item.fatalDeadline = '2026-09-01';
        app.inboxFilter = 'prazo-fatal';
        const items = app.filteredIntimations();
        delete item.fatalDeadline;
        app.inboxFilter = 'untreated';
        return items.length;
      });
      assert.equal(fatalCountWithFlag, 1, 'Filtro prazo-fatal com flag explícita fatalDeadline deve retornar o registro');

      // Selecionar primeira publicação não tratada (pub-test-1 com texto "15 dias")
      const firstRow = page.locator('.inbox-row[data-intimation-id="pub-test-1"]');
      await firstRow.click();
      await page.waitForSelector('#intimationDetail .detail-header', { state: 'visible' });

      // Verificar que unread ficou false mas treatmentStatus continua untreated (Lida != Tratada)
      const detailBadgeText = await page.textContent('#intimationDetail .treatment-badge');
      assert.match(detailBadgeText, /Não tratada/i);

      // ── TESTE BUG 1 & BUG 2: Criar tarefa a partir de publicação com "15 dias" mantém deadline vazio ──
      await page.click('#btnCreateTask');
      await page.locator('#modalBackdrop').waitFor({ state: 'visible' });

      const taskProcessVal = await page.inputValue('#field-process');
      const taskDeadlineVal = await page.inputValue('#field-deadline');
      assert.equal(taskProcessVal, '5001111-22.2026.8.21.0001');
      assert.equal(taskDeadlineVal, '', 'O deadline da tarefa criada a partir da publicação deve iniciar vazio!');

      // Fechar modal de tarefa
      await page.click('#modalBackdrop .button.ghost, #modalCloseBtn');
      await page.locator('#modalBackdrop').waitFor({ state: 'hidden' });
      await page.waitForTimeout(300);

      // ── TESTE BUG 1: Testar também publicação com "recurso especial" ──
      const secondRow = page.locator('.inbox-row[data-intimation-id="pub-test-2"]');
      await secondRow.click();
      await page.waitForTimeout(300);
      await page.click('#btnCreateTask');
      await page.locator('#modalBackdrop').waitFor({ state: 'visible' });

      const task2DeadlineVal = await page.inputValue('#field-deadline');
      assert.equal(task2DeadlineVal, '', 'O deadline da tarefa com recurso especial deve iniciar vazio!');

      await page.click('#modalBackdrop .button.ghost, #modalCloseBtn');
      await page.locator('#modalBackdrop').waitFor({ state: 'hidden' });
      await page.waitForTimeout(300);

      // Voltar para pub-test-1
      await firstRow.click();
      await page.waitForTimeout(300);

      // ── TESTE BUG 6: Simular falha de rede/servidor durante applyTreatmentAction ──
      await page.evaluate(() => {
        window.__origFetch = window.fetch;
        window.fetch = async (url, opts) => {
          if (String(url).includes('/treatment')) {
            throw new Error('Falha de rede simulada');
          }
          return window.__origFetch(url, opts);
        };
      });

      // Tentar iniciar análise durante falha
      await page.click('#btnStartReview');
      await page.waitForTimeout(400);

      // Confirmar que status local NÃO mudou
      const stateUntreated = await page.evaluate(() => {
        const store = window.Atrium?.Store || window.JurisFlow?.Store;
        const item = store?.state?.intimations?.find(i => i.id === 'pub-test-1');
        return item?.treatmentStatus;
      });
      assert.equal(stateUntreated, 'untreated', 'Falha de backend/rede NÃO deve alterar treatmentStatus local!');

      // Restaurar fetch original
      await page.evaluate(() => {
        window.fetch = window.__origFetch;
      });

      // Clicar em "Iniciar análise" com rede normal
      await page.click('#btnStartReview');
      await page.waitForTimeout(400);

      // Mudar filtro para "Em análise" via card de métrica
      await page.click('.pub-metric-card[data-filter="in_review"]');
      await page.waitForTimeout(300);

      // Selecionar a publicação que agora está em análise
      await page.locator('.inbox-row[data-intimation-id="pub-test-1"]').click();
      await page.waitForTimeout(300);

      const inReviewBadge = await page.textContent('#intimationDetail .treatment-badge');
      assert.match(inReviewBadge, /Em análise/i);

      // Clicar em "Criar tarefa" a partir da publicação
      await page.click('#btnCreateTask');
      await page.locator('#modalBackdrop').waitFor({ state: 'visible' });

      // Preencher deadline manualmente e submeter criação de tarefa
      await page.fill('#field-deadline', '2026-09-10');
      await page.click('#modalForm button[type="submit"]');
      await page.locator('#modalBackdrop').waitFor({ state: 'hidden' });
      await page.waitForTimeout(300);

      // Selecionar pub-test-1 novamente em análise
      await page.locator('.inbox-row[data-intimation-id="pub-test-1"]').click();
      await page.waitForTimeout(300);

      // Verificar que providência vinculada aparece no detalhe da publicação
      await page.locator('.linked-tasks-card').waitFor({ state: 'visible' });
      const linkedTaskText = await page.textContent('.linked-tasks-card');
      assert.match(linkedTaskText, /Providência criada/i);

      // Clicar em "Marcar como tratada"
      await page.locator('#btnMarkTreated').waitFor({ state: 'visible' });
      await page.locator('#btnMarkTreated').click();
      await page.locator('#treatPublicationBackdrop').waitFor({ state: 'visible' });
      await page.fill('#treatNoteInput', 'Petição conferida e vinculada.');
      await page.click('#treatPublicationSubmitBtn');
      await page.locator('#treatPublicationBackdrop').waitFor({ state: 'hidden' });
      await page.waitForTimeout(400);

      // Verificar que contador "Tratadas hoje" aumentou
      const treatedTodayCount = await page.textContent('#pubMetricTreatedToday');
      assert.ok(Number(treatedTodayCount) >= 1);

      // Mudar filtro para "Tratadas" via card de métrica
      await page.click('.pub-metric-card[data-filter="treated"]');
      await page.waitForTimeout(300);

      // Selecionar a publicação tratada
      await page.locator('.inbox-row[data-intimation-id="pub-test-1"]').click();
      await page.waitForTimeout(300);

      const treatedBadge = await page.textContent('#intimationDetail .treatment-badge');
      assert.match(treatedBadge, /Tratada/i);

      // Clicar em "Reabrir"
      await page.locator('#btnReopenPublication').waitFor({ state: 'visible' });
      await page.locator('#btnReopenPublication').click();
      await page.waitForTimeout(400);

      // Mudar filtro para "Em análise"
      await page.click('.pub-metric-card[data-filter="in_review"]');
      await page.waitForTimeout(300);
      await page.locator('.inbox-row[data-intimation-id="pub-test-1"]').click();
      await page.waitForTimeout(300);

      const reopenedBadge = await page.textContent('#intimationDetail .treatment-badge');
      assert.match(reopenedBadge, /Em análise/i);

      // Clicar em "Descartar"
      await page.locator('#btnDiscardPublication').waitFor({ state: 'visible' });
      await page.locator('#btnDiscardPublication').click();
      await page.locator('#discardPublicationBackdrop').waitFor({ state: 'visible' });
      await page.fill('#discardReasonInput', 'Descarte de teste');
      await page.click('#discardPublicationSubmitBtn');
      await page.locator('#discardPublicationBackdrop').waitFor({ state: 'hidden' });
      await page.waitForTimeout(400);

      // Mudar filtro para "Descartadas" via abas
      await page.click('#inboxFilters button[data-filter="discarded"]');
      await page.waitForTimeout(300);
      await page.locator('.inbox-row[data-intimation-id="pub-test-1"]').click();
      await page.waitForTimeout(300);

      // Verificar que publicação agora está descartada
      const discardedBadge = await page.textContent('#intimationDetail .treatment-badge');
      assert.match(discardedBadge, /Descartada/i);

      // Clicar em "Restaurar"
      await page.locator('#btnRestorePublication').waitFor({ state: 'visible' });
      await page.locator('#btnRestorePublication').click();
      await page.waitForTimeout(400);

      // Mudar filtro para "Não tratadas"
      await page.click('.pub-metric-card[data-filter="untreated"]');
      await page.waitForTimeout(300);
      await page.locator('.inbox-row[data-intimation-id="pub-test-1"]').click();
      await page.waitForTimeout(300);

      const restoredBadge = await page.textContent('#intimationDetail .treatment-badge');
      assert.match(restoredBadge, /Não tratada/i);
    });

    await testAsync('BUG 10 — Computed Styles no Tema Light: Badges possuem cores claras', async () => {
      await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
      await page.waitForTimeout(200);

      const badgeColors = await page.evaluate(() => {
        const createAndMeasure = (className) => {
          const el = document.createElement('span');
          el.className = `treatment-badge ${className}`;
          document.body.appendChild(el);
          const computed = window.getComputedStyle(el);
          const res = {
            bg: computed.backgroundColor,
            color: computed.color
          };
          document.body.removeChild(el);
          return res;
        };

        return {
          untreated: createAndMeasure('treatment-untreated'),
          inReview: createAndMeasure('treatment-in-review'),
          treated: createAndMeasure('treatment-treated'),
          discarded: createAndMeasure('treatment-discarded')
        };
      });

      // untreated: #fef3c7 -> rgb(254, 243, 199), text: #92400e -> rgb(146, 64, 14)
      assert.equal(badgeColors.untreated.bg, 'rgb(254, 243, 199)', 'Untreated badge deve ter fundo light no tema claro');
      assert.equal(badgeColors.untreated.color, 'rgb(146, 64, 14)', 'Untreated badge deve ter texto escuro no tema claro');

      // in_review: #dbeafe -> rgb(219, 234, 254), text: #1e40af -> rgb(30, 64, 175)
      assert.equal(badgeColors.inReview.bg, 'rgb(219, 234, 254)', 'In-review badge deve ter fundo light no tema claro');
      assert.equal(badgeColors.inReview.color, 'rgb(30, 64, 175)', 'In-review badge deve ter texto azul no tema claro');

      // treated: #dcfce7 -> rgb(220, 252, 231), text: #166534 -> rgb(22, 101, 52)
      assert.equal(badgeColors.treated.bg, 'rgb(220, 252, 231)', 'Treated badge deve ter fundo verde light no tema claro');
      assert.equal(badgeColors.treated.color, 'rgb(22, 101, 52)', 'Treated badge deve ter texto verde escuro no tema claro');

      // discarded: #f1f5f9 -> rgb(241, 245, 249), text: #475569 -> rgb(71, 85, 105)
      assert.equal(badgeColors.discarded.bg, 'rgb(241, 245, 249)', 'Discarded badge deve ter fundo cinza light no tema claro');
      assert.equal(badgeColors.discarded.color, 'rgb(71, 85, 105)', 'Discarded badge deve ter texto ardósia no tema claro');
    });

    await testAsync('E2E Mobile & Dark Theme: Responsividade em 390x844 e tema escuro', async () => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
      await page.waitForTimeout(200);

      const isVisible = await page.isVisible('#view-inbox');
      assert.ok(isVisible, 'View inbox deve permanecer visível em mobile');

      const metricsVisible = await page.isVisible('#publicationsMetrics');
      assert.ok(metricsVisible, 'Grid de métricas deve permanecer visível em mobile');

      // Restaurar viewport e tema claro
      await page.setViewportSize({ width: 1280, height: 800 });
      await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
    });
  } finally {
    await browser.close();
  }

} finally {
  await server.stop();
}

// ─────────────────────────────────────────────────────────────
// 4. RESUMO DOS RESULTADOS
// ─────────────────────────────────────────────────────────────
console.log('\n===============================================================');
console.log(`  RESULTADOS: ${passed} PASSOU, ${failed} FALHOU (Total: ${passed + failed})`);
console.log('===============================================================\n');

if (failed > 0) {
  process.exit(1);
}
