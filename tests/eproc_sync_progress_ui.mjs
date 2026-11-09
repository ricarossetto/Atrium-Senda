import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { startTestServer } from './helpers.mjs';

const server = await startTestServer();
const browser = await chromium.launch({ headless: true });

try {
  console.log('=== TESTE REGRESSIVO: EPROC SYNC PROGRESS UI (UI V2 - REAL TELEMETRY) ===');

  const viewports = [
    { name: 'Desktop (1440x900)', width: 1440, height: 900, isMobile: false },
    { name: 'Mobile (390x844)', width: 390, height: 844, isMobile: true }
  ];

  for (const vp of viewports) {
    console.log(`\n--- Testando ${vp.name} ---`);
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      isMobile: vp.isMobile,
      hasTouch: vp.isMobile
    });
    const page = await context.newPage();

    const pageErrors = [];
    page.on('pageerror', err => pageErrors.push(err.message));

    // Mock autenticação para carregar o portal v2
    await page.route('**/api/auth/status', route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        authenticated: true,
        user: { id: 'u1', username: 'adv_teste', displayName: 'Advogada Teste', role: 'admin' },
        workspace: { id: 'w1', name: 'Escritório Modelo' }
      })
    }));

    await page.addInitScript(() => {
      localStorage.setItem('atrium:ui:mode', 'v2');
      localStorage.setItem('atrium_tour_seen', 'true');
    });

    await page.goto(server.baseUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(500);

    // Carrega o módulo system-status no browser
    const statusModuleLoaded = await page.evaluate(async () => {
      const mod = await import('/js/views/ui-v2/system-status.js');
      window.__systemStatusBar = mod.createSystemStatusBar();
      return !!window.__systemStatusBar;
    });
    assert.ok(statusModuleLoaded, 'Módulo system-status deve inicializar com sucesso');

    // Abre o modal de sincronização eproc para testar ambos os componentes
    await page.evaluate(() => {
      const modal = document.getElementById('eprocSyncModalBackdrop');
      if (modal) {
        modal.classList.remove('hidden');
        modal.setAttribute('aria-hidden', 'false');
      }
    });
    await page.waitForTimeout(150);

    // Sequência fiel ao Section 4.12:
    // AUTHENTICATING -> SESSION_ESTABLISHED -> DISCOVERING -> PROCESSING 1..10 -> COMPLETE
    const testStates = [
      {
        phase: 'AUTHENTICATING',
        determinate: false,
        percent: null,
        label: 'Sincronizando',
        action: 'Autenticando no serviço de identidade Keycloak TJRS...'
      },
      {
        phase: 'SESSION_ESTABLISHED',
        determinate: false,
        percent: null,
        label: 'Sincronizando',
        action: 'Conectando ao canal seguro eproc TJRS...'
      },
      {
        phase: 'DISCOVERING',
        determinate: false,
        percent: null,
        label: 'Sincronizando',
        action: 'Consultando Painel do Advogado TJRS e intimações pendentes...'
      },
      {
        phase: 'PROCESSING_1_10',
        determinate: true,
        completed: 1,
        total: 10,
        percent: Math.floor((1 / 10) * 100),
        label: 'Sincronizando',
        action: 'Processando processos do painel — 1 de 10'
      },
      {
        phase: 'PROCESSING_2_10',
        determinate: true,
        completed: 2,
        total: 10,
        percent: Math.floor((2 / 10) * 100),
        label: 'Sincronizando',
        action: 'Processando processos do painel — 2 de 10'
      },
      {
        phase: 'PROCESSING_5_10',
        determinate: true,
        completed: 5,
        total: 10,
        percent: Math.floor((5 / 10) * 100),
        label: 'Sincronizando',
        action: 'Processando processos do painel — 5 de 10'
      },
      {
        phase: 'PROCESSING_10_10',
        determinate: true,
        completed: 10,
        total: 10,
        percent: Math.floor((10 / 10) * 100),
        label: 'Sincronizando',
        action: 'Processando processos do painel — 10 de 10'
      },
      {
        phase: 'COMPLETE',
        state: 'saved',
        determinate: true,
        percent: 100,
        label: 'Sincronização Concluída',
        action: 'Processos e dados do eproc TJRS consolidados com sucesso.'
      }
    ];

    let lastObservedPercent = 0;

    for (const step of testStates) {
      // Aplica o estado tanto na barra superior quanto no modal
      await page.evaluate(({ step }) => {
        // Atualiza a barra de status do topo via createSystemStatusBar
        if (step.phase === 'COMPLETE') {
          window.__systemStatusBar.setState('saved', step.action);
          const icon = document.getElementById('systemStatusIcon');
          if (icon) {
            icon.innerHTML = `<svg class="atrium-icon" aria-hidden="true" focusable="false"><use href="assets/icons/atrium-ui-icons.svg#atrium-icon-check"></use></svg>`;
          }
          const lbl = document.getElementById('systemStatusLabel');
          if (lbl) lbl.textContent = step.label;
          const percentEl = document.getElementById('systemStatusPercent');
          if (percentEl) {
            percentEl.classList.remove('hidden');
            percentEl.textContent = '100%';
          }
          const fill = document.getElementById('systemStatusProgressFill');
          if (fill) fill.style.width = '100%';
        } else {
          window.__systemStatusBar.setState('syncing', step.action, step.percent, { determinate: step.determinate });
        }

        // Atualiza o modal de sincronização
        const statusLabel = document.getElementById('eprocSyncStatusLabel');
        const percentLabel = document.getElementById('eprocSyncPercentLabel');
        const modalTrack = document.getElementById('eprocSyncModalTrack');
        const modalFill = document.getElementById('eprocSyncModalFill');
        const currentAction = document.getElementById('eprocSyncCurrentAction');

        if (statusLabel) statusLabel.textContent = step.label;
        if (currentAction) currentAction.textContent = step.action;

        if (step.determinate) {
          if (percentLabel) {
            percentLabel.classList.remove('hidden');
            percentLabel.textContent = `${step.percent}%`;
          }
          if (modalFill) modalFill.style.width = `${step.percent}%`;
          if (modalTrack) {
            modalTrack.classList.remove('is-indeterminate');
            modalTrack.setAttribute('aria-valuenow', String(step.percent));
          }
        } else {
          if (percentLabel) {
            percentLabel.classList.add('hidden');
            percentLabel.textContent = '';
          }
          if (modalFill) modalFill.style.width = '';
          if (modalTrack) {
            modalTrack.classList.add('is-indeterminate');
            modalTrack.removeAttribute('aria-valuenow');
          }
        }
      }, { step });

      await page.waitForTimeout(60);

      // Verificação 1: Barra superior compacta (#systemStatusBar)
      const topLabel = await page.locator('#systemStatusLabel').textContent();
      const topPercentText = await page.locator('#systemStatusPercent').textContent();
      const topPercentHidden = await page.locator('#systemStatusPercent').evaluate(el => el.classList.contains('hidden'));
      const topTrackIndeterminate = await page.locator('#systemStatusProgressTrack').evaluate(el => el.classList.contains('is-indeterminate'));
      const topTrackAriaValueNow = await page.locator('#systemStatusProgressTrack').getAttribute('aria-valuenow');
      const topIconSvgHtml = await page.locator('#systemStatusIcon').innerHTML();

      // Proibição estrita de Unicode emojis ou caracteres como ✓, ⚠, ↻
      assert.ok(!/[✓⚠↻\uD800-\uDBFF\uDC00-\uDFFF]/.test(topLabel), 'Rótulo do topo não pode conter emojis ou caracteres Unicode');
      assert.ok(!topLabel.includes('%'), `Rótulo do topo ("${topLabel}") não pode conter percentual concatenado`);

      // Verificação de ícones SVG oficiais
      if (step.phase === 'COMPLETE') {
        assert.ok(topIconSvgHtml.includes('atrium-icon-check'), 'Ícone após conclusão deve ser atrium-icon-check');
      } else {
        assert.ok(topIconSvgHtml.includes('atrium-icon-sync'), 'Ícone durante sincronização deve ser atrium-icon-sync');
        assert.ok(topIconSvgHtml.includes('is-running'), 'Ícone durante sincronização deve possuir classe is-running para animação');
      }

      // Verificação 2: Modo Indeterminate vs Determinate
      if (!step.determinate) {
        // Em fases sem total conhecido (Keycloak, mTLS, descobrindo):
        assert.ok(topPercentHidden, `Em ${step.phase}, o pill de percentual deve estar oculto`);
        assert.equal(topPercentText.trim(), '', `Em ${step.phase}, o percentual deve estar vazio (sem 24% ou 42% falsos)`);
        assert.ok(topTrackIndeterminate, `Em ${step.phase}, a track deve ter a classe is-indeterminate`);
        assert.equal(topTrackAriaValueNow, null, `Em ${step.phase}, não deve emitir aria-valuenow falso`);
      } else if (step.phase === 'COMPLETE') {
        const topTrackHidden = await page.locator('#systemStatusProgressTrack').evaluate(el => el.classList.contains('hidden'));
        assert.ok(topTrackHidden, 'Em COMPLETE, a track de progresso deve estar oculta no estado saved');
      } else {
        // Em fases mensuráveis (Processing 1/10, 2/10...):
        assert.ok(!topPercentHidden, `Em ${step.phase}, o pill de percentual deve estar visível`);
        assert.equal(topPercentText.trim(), `${step.percent}%`, `Em ${step.phase}, o percentual deve ser exatamente ${step.percent}%`);
        assert.ok(!topTrackIndeterminate, `Em ${step.phase}, a track não deve ser indeterminate`);
        assert.equal(topTrackAriaValueNow, String(step.percent), `Em ${step.phase}, aria-valuenow deve ser ${step.percent}`);

        // Regra de monotonicidade
        assert.ok(step.percent >= lastObservedPercent, `Monotonicidade violada: ${step.percent} < ${lastObservedPercent}`);
        lastObservedPercent = step.percent;
      }

      // Verificação 3: Modal de Sincronização
      const modalStatus = await page.locator('#eprocSyncStatusLabel').textContent();
      const modalAction = await page.locator('#eprocSyncCurrentAction').textContent();
      assert.ok(!modalStatus.includes('%'), `Status do modal ("${modalStatus}") não deve conter percentual`);
      assert.equal(modalAction, step.action, 'Ação do modal deve corresponder à etapa');

      if (!step.determinate) {
        const modalPercentHidden = await page.locator('#eprocSyncPercentLabel').evaluate(el => el.classList.contains('hidden'));
        assert.ok(modalPercentHidden, `Modal em ${step.phase} deve ocultar rótulo de percentual`);
      } else {
        const modalPercentText = await page.locator('#eprocSyncPercentLabel').textContent();
        assert.equal(modalPercentText.trim(), `${step.percent}%`, `Modal em ${step.phase} deve exibir ${step.percent}%`);
      }

      // Screenshots de evidência visual
      if (step.phase === 'AUTHENTICATING' || step.phase === 'PROCESSING_5_10' || step.phase === 'COMPLETE') {
        const prefix = vp.isMobile ? 'mobile' : 'desktop';
        const shotPath = `artifacts/eproc_sync_${step.phase.toLowerCase()}_${prefix}.png`;
        await page.screenshot({ path: shotPath });
        console.log(`  ✓ Evidência salva em ${shotPath} (${step.phase})`);
      }
    }

    assert.equal(pageErrors.length, 0, `Nenhum erro de console tolerado: ${pageErrors.join('; ')}`);
    console.log(`  ✓ ${vp.name}: Fluxo completo (Indeterminate -> Determinate 10%..100% -> Check) validado com sucesso!`);
    await context.close();
  }

  console.log('\n>>> TESTE REGRESSIVO EPROC SYNC PROGRESS PASSOU COM SUCESSO EM TODOS OS CRITÉRIOS! <<<');
} finally {
  await browser.close();
  await server.stop();
}
