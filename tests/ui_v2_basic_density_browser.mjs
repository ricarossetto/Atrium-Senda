import assert from 'node:assert/strict';
import { prepareUiV2Page, startUiV2Session } from './ui_v2_helpers.mjs';

const BASIC_HIDDEN_VIEWS = Object.freeze(['financial', 'calculations', 'reports', 'documents', 'assistant', 'prompts', 'links', 'leads']);
const BASIC_VISIBLE_VIEWS = Object.freeze(['dashboard', 'kanban', 'inbox', 'agenda', 'processes', 'contacts', 'configuration', 'integrations']);

const session = await startUiV2Session();

async function openDensityPage({ density = null, theme = 'light', viewport = { width: 1440, height: 900 } } = {}) {
  const context = await session.createContext({ viewport });
  await context.addInitScript(value => {
    if (value !== null) localStorage.setItem('atrium_ui_density', value);
  }, density);
  const { page, pageErrors } = await prepareUiV2Page(context, session.server.baseUrl, { theme, probe: true });
  return { context, page, pageErrors };
}

function rectProbe() {
  const rectOf = selector => {
    const element = document.querySelector(selector);
    if (!element) return null;
    const rects = element.getClientRects();
    if (!rects.length) return { visible: false, width: 0, height: 0, top: 0, left: 0 };
    const box = element.getBoundingClientRect();
    return { visible: true, width: box.width, height: box.height, top: box.top, left: box.left };
  };
  return {
    density: document.documentElement.dataset.uiDensity,
    chip: rectOf('[data-density-chip]'),
    sidebar: rectOf('#sidebar'),
    main: rectOf('#appMain'),
    topbar: rectOf('.topbar'),
    navRects: Object.fromEntries(
      [...document.querySelectorAll('.nav-item[data-view]')].map(item => [item.dataset.view, item.getClientRects().length > 0])
    ),
    groupHidden: Object.fromEntries(
      ['management', 'intelligence'].map(group => {
        const nav = document.querySelector(`[data-v2-nav-group="${group}"]`);
        const toggle = document.querySelector(`[data-v2-nav-toggle="${group}"]`);
        return [group, { navHidden: Boolean(nav?.hidden), toggleVisible: Boolean(toggle && toggle.getClientRects().length > 0) }];
      })
    ),
    duplicateIds: (() => {
      const ids = [...document.querySelectorAll('[id]')].map(element => element.id);
      return ids.filter((id, index) => ids.indexOf(id) !== index);
    })(),
    docOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
  };
}

try {
  const basicRun = await openDensityPage({ density: 'basic' });
  try {
    const basic = await basicRun.page.evaluate(rectProbe);
    assert.equal(basic.density, 'basic', 'A preferência local basic deve vencer o default do host.');
    assert.equal(basic.chip?.visible, true, 'O chip de densidade deve aparecer no Basic.');
    assert.ok(basic.chip.height >= 14 && basic.chip.width >= 30, 'O chip precisa de geometria legível, sem colapso.');
    for (const view of BASIC_HIDDEN_VIEWS) {
      assert.equal(basic.navRects[view], false, `Basic deve recolher a navegação de ${view}.`);
    }
    for (const view of BASIC_VISIBLE_VIEWS) {
      assert.equal(basic.navRects[view], true, `Basic deve preservar a navegação de ${view}.`);
    }
    assert.equal(basic.groupHidden.management.navHidden, true, 'Gestão totalmente filtrada deve sair da navegação.');
    assert.equal(basic.groupHidden.intelligence.navHidden, true, 'Inteligência totalmente filtrada deve sair da navegação.');
    assert.equal(basic.groupHidden.management.toggleVisible, false, 'Toggle de grupo vazio não pode ficar órfão.');
    assert.equal(basic.groupHidden.intelligence.toggleVisible, false, 'Toggle de grupo vazio não pode ficar órfão.');
    assert.deepEqual(basic.duplicateIds, [], 'O filtro Basic não pode duplicar ids.');
    assert.ok(basic.docOverflow <= 0, 'O filtro Basic não pode introduzir overflow horizontal no documento.');
    assert.ok(basic.sidebar.width > 0 && basic.main.width > 0, 'Shell deve continuar dimensionado no Basic.');
    assert.ok(basic.main.left >= basic.sidebar.width - 1, 'Conteúdo não pode invadir a navegação lateral.');
    assert.ok(basic.topbar.top >= 0, 'Topbar não pode ser empurrada para fora da viewport.');

    const brandProbe = await basicRun.page.evaluate(() => {
      const brand = document.querySelector('.brand[data-view-link="dashboard"]');
      const chip = document.querySelector('[data-density-chip]');
      return {
        label: brand?.getAttribute('aria-label') || '',
        chipHidden: chip?.getAttribute('aria-hidden') === 'true'
      };
    });
    assert.match(brandProbe.label, /ATRIUM/, 'A marca precisa declarar nome acessível próprio.');
    assert.doesNotMatch(brandProbe.label, /Basic/, 'O chip não pode entrar no nome acessível do botão da marca.');
    assert.equal(brandProbe.chipHidden, true, 'O chip deve ser redundância visual fora da árvore de acessibilidade.');

    const deepLink = await basicRun.page.evaluate(async () => {
      window.Atrium.App.switchView('financial');
      const active = document.getElementById('view-financial');
      return {
        active: active?.classList.contains('active'),
        title: document.getElementById('viewTitle')?.textContent?.trim(),
        navVisible: document.querySelector('.nav-item[data-view="financial"]')?.getClientRects().length > 0
      };
    });
    assert.equal(deepLink.active, true, 'Deep-link para view recolhida deve continuar usando a mesma árvore.');
    assert.equal(deepLink.navVisible, false, 'A view recolhida não pode voltar ao menu por ter sido aberta.');
    assert.ok(deepLink.title, 'O título deve continuar informando a view ativa.');
    assert.deepEqual(basicRun.pageErrors, [], `Basic gerou pageerror: ${basicRun.pageErrors.join(' | ')}`);
  } finally {
    await basicRun.context.close();
  }

  const proRun = await openDensityPage({ density: 'pro' });
  try {
    const pro = await proRun.page.evaluate(rectProbe);
    assert.equal(pro.density, 'pro', 'PRO deve permanecer a densidade padrão fora de basic.atrium.adv.br.');
    assert.equal(pro.chip?.visible, false, 'PRO não pode ganhar o chip de densidade.');
    for (const view of [...BASIC_HIDDEN_VIEWS, ...BASIC_VISIBLE_VIEWS]) {
      assert.equal(pro.navRects[view], true, `PRO deve preservar a navegação de ${view}.`);
    }
    assert.equal(pro.groupHidden.management.navHidden, false, 'PRO deve preservar o grupo Gestão.');
    assert.equal(pro.groupHidden.intelligence.navHidden, false, 'PRO deve preservar o grupo Inteligência.');
    assert.equal(pro.groupHidden.management.toggleVisible, true, 'PRO deve preservar o controle do grupo Gestão.');
    assert.equal(pro.groupHidden.intelligence.toggleVisible, true, 'PRO deve preservar o controle do grupo Inteligência.');
    assert.deepEqual(pro.duplicateIds, [], 'PRO não pode ganhar ids duplicados.');
    assert.ok(pro.docOverflow <= 0, 'PRO não pode introduzir overflow horizontal no documento.');
    assert.deepEqual(proRun.pageErrors, [], `PRO gerou pageerror: ${proRun.pageErrors.join(' | ')}`);
  } finally {
    await proRun.context.close();
  }

  const labelRun = await openDensityPage({});
  try {
    await labelRun.page.evaluate(() => window.Atrium.App.switchView('configuration'));
    await labelRun.page.locator('button[data-config-section="experimental"]').click();
    await labelRun.page.locator('.experimental-density-status').waitFor();
    const readStatus = () => labelRun.page.evaluate(() => String(document.querySelector('.experimental-density-status')?.textContent || '').replace(/\s+/g, ' ').trim());
    const toggleName = await labelRun.page.evaluate(() => String(document.querySelector('[data-density-toggle]')?.closest('label')?.textContent || '').replace(/\s+/g, ' ').trim());
    assert.match(toggleName, /Usar Basic neste navegador/, 'O controle de densidade precisa de nome acessível próprio.');
    const initial = await readStatus();
    assert.match(initial, /Em uso agora: PRO/, 'Sem preferência gravada o estado deve reportar a densidade aplicada.');

    await labelRun.page.locator('[data-density-toggle]').check();
    const afterToggle = await readStatus();
    assert.match(afterToggle, /Em uso agora: PRO/, 'A densidade aplicada não pode mudar antes do reload.');
    assert.match(afterToggle, /Preferência gravada: Basic/, 'A preferência gravada deve aparecer como pendente.');
    assert.match(afterToggle, /recarregue a página para aplicar/, 'A tela deve dizer que a troca vale após recarregar.');
    assert.doesNotMatch(afterToggle, /Em uso agora: Basic/, 'Nunca apresentar a preferência pendente como aplicada.');

    const interactionProbe = await labelRun.page.evaluate(() => ({
      focusKept: document.activeElement?.matches?.('[data-density-toggle]') === true,
      role: document.querySelector('.experimental-density-status')?.getAttribute('role') || '',
      statusDisplay: getComputedStyle(document.querySelector('.experimental-density-status')).display
    }));
    assert.equal(interactionProbe.focusKept, true, 'O controle deve manter o foco após alternar a densidade.');
    assert.equal(interactionProbe.role, 'status', 'A linha de estado deve permanecer como live region.');
    assert.ok(
      !['flex', 'inline-flex'].includes(interactionProbe.statusDisplay),
      'A linha de estado não pode ser flex: o gap fragmenta a frase e cria espaço antes do ponto final.'
    );

    const chipAfterToggle = await labelRun.page.evaluate(() => {
      const chip = document.querySelector('[data-density-chip]');
      return chip ? chip.getClientRects().length > 0 : false;
    });
    assert.equal(chipAfterToggle, false, 'O chip só pode aparecer quando a densidade estiver realmente aplicada.');
    assert.deepEqual(labelRun.pageErrors, [], `Cenário de rótulo gerou pageerror: ${labelRun.pageErrors.join(' | ')}`);
  } finally {
    await labelRun.context.close();
  }

  const mobileRun = await openDensityPage({ density: 'basic', theme: 'dark', viewport: { width: 390, height: 844 } });
  try {
    await mobileRun.page.locator('#menuToggle').click();
    await mobileRun.page.locator('#sidebar.open').waitFor();
    const mobile = await mobileRun.page.evaluate(rectProbe);
    assert.equal(mobile.density, 'basic', 'O drawer mobile deve abrir na densidade Basic.');
    assert.equal(mobile.chip?.visible, true, 'O chip precisa continuar visível no drawer mobile.');
    assert.equal(mobile.docOverflow <= 0, true, 'O drawer mobile não pode introduzir overflow horizontal.');
    assert.deepEqual(mobile.duplicateIds, [], 'O drawer mobile não pode duplicar ids.');
    assert.deepEqual(mobileRun.pageErrors, [], `Cenário mobile gerou pageerror: ${mobileRun.pageErrors.join(' | ')}`);
  } finally {
    await mobileRun.context.close();
  }

  console.log('✓ Densidade Basic/PRO validada em navegador: chip honesto, navegação filtrada, deep-link, rótulo aplicado x gravado e drawer mobile.');
} finally {
  await session.stop();
}
