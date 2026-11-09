import assert from 'node:assert/strict';
import { prepareUiV2Page, startUiV2Session } from './ui_v2_helpers.mjs';

console.log('--- Iniciando Teste: botão de tema compacto no topbar (desktop) ---');

const session = await startUiV2Session({ viewport: { width: 1536, height: 900 } });
try {
  const context = await session.createContext();
  const { page, pageErrors } = await prepareUiV2Page(context, session.server.baseUrl, { theme: 'dark' });
  await page.evaluate(() => {
    const strong = document.querySelector('.profile-copy strong');
    const small = document.querySelector('.profile-copy small');
    if (strong) strong.textContent = 'Ricardo Teste';
    if (small) small.textContent = 'Advogado(a) Titular';
  });
  await page.waitForTimeout(150);

  const metrics = await page.evaluate(() => {
    const box = selector => {
      const element = document.querySelector(selector);
      if (!element) return null;
      const rect = element.getBoundingClientRect();
      return {
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        clientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth,
        display: getComputedStyle(element).display,
        overflow: getComputedStyle(element).overflow
      };
    };
    const theme = document.querySelector('#themeToggleButton');
    const iconUse = theme?.querySelector('use');
    return {
      theme: box('#themeToggleButton'),
      themeText: box('#themeToggleText'),
      profile: box('#profileButton'),
      profileCopy: box('.profile-copy'),
      profileStrong: box('.profile-copy strong'),
      profileSmall: box('.profile-copy small'),
      themeIcon: iconUse?.getAttribute('href') || '',
      themeLabel: theme?.getAttribute('aria-label') || '',
      globalOverflow: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth
    };
  });

  assert.ok(metrics.theme.width <= 44, `botão de tema deve ser compacto; largura=${metrics.theme.width}`);
  assert.equal(metrics.theme.height, 40, 'botão de tema mantém alvo de 40px no desktop');
  assert.equal(metrics.themeText.display, 'none', 'rótulo textual do tema não ocupa espaço');
  assert.ok(metrics.themeIcon.includes('atrium-icon-theme-dark'), 'tema escuro mostra a lua');
  assert.match(metrics.themeLabel, /escuro ativo/i, 'nome acessível declara o tema ativo');
  assert.ok(metrics.profile.width >= 160, `perfil preserva largura útil; largura=${metrics.profile.width}`);
  assert.ok(metrics.profileCopy.width >= 110, `nome e cargo cabem no perfil; largura=${metrics.profileCopy.width}`);
  assert.ok(metrics.profileStrong.scrollWidth <= metrics.profileStrong.clientWidth + 1, 'nome do advogado não truncado');
  assert.ok(metrics.profileSmall.scrollWidth <= metrics.profileSmall.clientWidth + 1, 'cargo do advogado não truncado');
  assert.equal(metrics.globalOverflow, 0, 'topbar não cria overflow horizontal');

  await page.locator('#themeToggleButton').click();
  await page.waitForFunction(() => document.documentElement.getAttribute('data-theme') === 'light');
  const light = await page.evaluate(() => ({
    icon: document.querySelector('#themeToggleButton use')?.getAttribute('href') || '',
    label: document.querySelector('#themeToggleButton')?.getAttribute('aria-label') || '',
    textDisplay: getComputedStyle(document.querySelector('#themeToggleText')).display
  }));
  assert.ok(light.icon.includes('atrium-icon-theme-light'), 'tema claro mostra o sol');
  assert.match(light.label, /claro ativo/i, 'nome acessível acompanha o tema claro');
  assert.equal(light.textDisplay, 'none', 'rótulo textual continua oculto no tema claro');
  assert.deepEqual(pageErrors, [], 'sem erros de página');
  console.log(`  OK: tema ${metrics.theme.width}x${metrics.theme.height}, perfil ${metrics.profile.width}px, nome/cargo sem corte.`);
  console.log('  OK: lua/sol e nomes acessíveis alternam sem reintroduzir texto.');
  console.log('\n[PASS] Botão de tema compacto validado no topbar real.');
} finally {
  await session.stop();
}
