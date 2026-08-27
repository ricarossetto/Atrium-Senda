import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { startTestServer, postJson } from './helpers.mjs';
import { generateTotp } from '../lib/security.mjs';
import { runStateMigrations, CURRENT_SCHEMA_VERSION } from '../lib/state-migrations.mjs';

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
// 1. TESTES UNITÁRIOS DO MODELO DE MIGRAÇÃO E IMUTABILIDADE
// ─────────────────────────────────────────────────────────────
console.log('[1/4] Testando migração de schema e defaults de tratamento...');

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

  // it2: arquivada -> discarded
  assert.equal(it2.treatmentStatus, 'discarded');
  assert.equal(it2.text, 'Processo extinto.');
  assert.equal(it2.status, 'arquivada');

  // it3: prazo -> treated
  assert.equal(it3.treatmentStatus, 'treated');
  assert.equal(it3.text, 'Audiência designada.');
  assert.equal(it3.status, 'prazo');
});

test('Imutabilidade: Texto jurídico original e dados do processo permanecem idênticos', () => {
  const originalText = 'Texto de sentença de mérito com deferimento de tutela de urgência.';
  const originalProcess = '5002086-73.2022.4.04.7133';
  const originalCourt = 'Tribunal Regional Federal da 4ª Região';
  const originalSource = 'DJEN Oficial';

  const state = {
    schemaVersion: 7,
    intimations: [{
      id: 'int-immutable-test',
      title: 'Sentença de Mérito',
      process: originalProcess,
      court: originalCourt,
      source: originalSource,
      publishedAt: '2026-08-25',
      text: originalText,
      status: 'nova'
    }]
  };

  const migrated = runStateMigrations(state, '2.0.0-beta').state;
  const item = migrated.intimations[0];

  assert.equal(item.text, originalText);
  assert.equal(item.process, originalProcess);
  assert.equal(item.court, originalCourt);
  assert.equal(item.source, originalSource);
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
    displayName: 'Dr. Ricardo Rossetto',
    email: 'ricardo@senda.adv.br',
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

  const todayStr = new Date().toISOString().slice(0, 10);
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
      treatmentStartedBy: 'Dr. Ricardo Rossetto',
      unread: false,
      urgent: false
    }
  ];

  await postJson(`${server.baseUrl}/api/state`, { state }, {
    Cookie: sessionCookie,
    'X-CSRF-Token': csrfToken
  });

  await testAsync('Transição: untreated -> in_review (start_review)', async () => {
    const res = await fetch(`${server.baseUrl}/api/intimations/pub-test-1/treatment`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': sessionCookie,
        'X-CSRF-Token': csrfToken
      },
      body: JSON.stringify({ action: 'start_review' })
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.ok, true);
    assert.equal(data.intimation.treatmentStatus, 'in_review');
    assert.equal(data.intimation.treatmentStartedBy, 'Dr. Ricardo Rossetto');
    assert.ok(data.intimation.treatmentStartedAt);
    assert.equal(data.intimation.text, 'Intime-se o autor para emendar a petição inicial em 15 dias sob pena de indeferimento.');
  });

  await testAsync('Transição: in_review -> treated (mark_treated)', async () => {
    const res = await fetch(`${server.baseUrl}/api/intimations/pub-test-1/treatment`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': sessionCookie,
        'X-CSRF-Token': csrfToken
      },
      body: JSON.stringify({ action: 'mark_treated', note: 'Emenda elaborada e protocolada' })
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.ok, true);
    assert.equal(data.intimation.treatmentStatus, 'treated');
    assert.equal(data.intimation.treatedBy, 'Dr. Ricardo Rossetto');
    assert.equal(data.intimation.treatmentNote, 'Emenda elaborada e protocolada');
    assert.ok(data.intimation.treatedAt);
  });

  await testAsync('Transição: treated -> in_review (reopen)', async () => {
    const res = await fetch(`${server.baseUrl}/api/intimations/pub-test-1/treatment`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': sessionCookie,
        'X-CSRF-Token': csrfToken
      },
      body: JSON.stringify({ action: 'reopen' })
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.ok, true);
    assert.equal(data.intimation.treatmentStatus, 'in_review');
    assert.equal(data.intimation.treatedAt, null);
    assert.equal(data.intimation.treatedBy, null);
  });

  await testAsync('Transição: in_review -> discarded (discard com nota)', async () => {
    const res = await fetch(`${server.baseUrl}/api/intimations/pub-test-1/treatment`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': sessionCookie,
        'X-CSRF-Token': csrfToken
      },
      body: JSON.stringify({ action: 'discard', note: 'Publicação duplicada do DJEN' })
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.ok, true);
    assert.equal(data.intimation.treatmentStatus, 'discarded');
    assert.equal(data.intimation.discardedBy, 'Dr. Ricardo Rossetto');
    assert.equal(data.intimation.treatmentNote, 'Publicação duplicada do DJEN');
    assert.ok(data.intimation.discardedAt);
  });

  await testAsync('Transição: discarded -> untreated (restore)', async () => {
    const res = await fetch(`${server.baseUrl}/api/intimations/pub-test-1/treatment`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': sessionCookie,
        'X-CSRF-Token': csrfToken
      },
      body: JSON.stringify({ action: 'restore' })
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.ok, true);
    assert.equal(data.intimation.treatmentStatus, 'untreated');
    assert.equal(data.intimation.discardedAt, null);
    assert.equal(data.intimation.discardedBy, null);
    assert.equal(data.intimation.treatmentNote, null);
  });

  await testAsync('Validação de Concorrência: conflito de revision retorna status 409', async () => {
    const res = await fetch(`${server.baseUrl}/api/intimations/pub-test-1/treatment`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': sessionCookie,
        'X-CSRF-Token': csrfToken
      },
      body: JSON.stringify({ action: 'start_review', revision: 999999 })
    });

    assert.equal(res.status, 409);
    const data = await res.json();
    assert.match(data.message, /outro usuário/i);
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

      // Selecionar primeira publicação não tratada
      const firstRow = page.locator('.inbox-row[data-intimation-id="pub-test-1"]');
      await firstRow.click();
      await page.waitForSelector('#intimationDetail .detail-header', { state: 'visible' });

      // Verificar que unread ficou false mas treatmentStatus continua untreated (Lida != Tratada)
      const detailBadgeText = await page.textContent('#intimationDetail .treatment-badge');
      assert.match(detailBadgeText, /Não tratada/i);

      // Clicar em "Iniciar análise"
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

      // Verificar se formulário da tarefa foi pré-preenchido
      const taskProcessVal = await page.inputValue('#field-process');
      assert.equal(taskProcessVal, '5001111-22.2026.8.21.0001');

      // Submeter criação de tarefa
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
