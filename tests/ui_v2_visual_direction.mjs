import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { prepareUiV2Page, startUiV2Session } from './ui_v2_helpers.mjs';

const read = file => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const tokens = read('css/views/ui-v2/tokens.css');
const primitives = read('css/views/ui-v2/primitives.css');
const shell = read('css/views/ui-v2/shell.css');
const dashboard = read('css/views/ui-v2/dashboard.css');
const processes = read('css/views/ui-v2/processes.css');
const publications = read('css/views/ui-v2/publications.css');
const componentCss = [primitives, shell, dashboard, processes, publications].join('\n');

for (const contract of [
  '--v2-color-background: #111315',
  '--v2-color-surface: #181B1E',
  '--v2-color-primary: #8297A6',
  '--v2-color-gold: #C0A261',
  '--v2-color-background: #F3F4F2',
  '--v2-color-surface: #FAFAF8',
  '--v2-color-primary: #596C7A',
  '--v2-color-gold: #A7894D'
]) {
  assert.ok(tokens.includes(contract), `Contrato Mineral Editorial ausente: ${contract}.`);
}

assert.doesNotMatch(tokens, /--v2-color-primary:\s*#(?:596B50|819477)/i, 'Verde musgo não pode permanecer como primary.');
assert.match(primitives, /feTurbulence/, 'O grain deve ser procedural e local.');
assert.match(primitives, /pointer-events:\s*none/, 'O grain não pode capturar interação.');
assert.match(primitives, /prefers-reduced-motion:\s*reduce/, 'A direção visual deve respeitar reduced motion.');
assert.match(primitives, /@keyframes v2-view-enter/, 'A entrada curta de layout deve existir.');
assert.match(primitives, /@keyframes v2-drawer-in/, 'O inspector deve possuir movimento curto dedicado.');
assert.doesNotMatch(componentCss, /animation[^;{}]*infinite/i, 'A UI V2 não pode introduzir animações infinitas.');
assert.match(shell, /\.nav-count\s*\{[\s\S]*?min-width:\s*20px;[\s\S]*?height:\s*20px;[\s\S]*?display:\s*inline-flex;/, 'O badge deve possuir geometria explícita.');
assert.match(dashboard, /border-radius:\s*26px 38px 28px 34px/, 'O foco editorial deve possuir assimetria controlada.');
assert.match(processes, /v2-drawer-in/, 'O inspector deve reutilizar o contrato de movimento V2.');
assert.match(publications, /v2-drawer-in/, 'A leitura mobile de Publicações deve reutilizar o contrato de movimento V2.');

function rgbSpread(hex) {
  const channels = hex.slice(1).match(/../g).map(value => Number.parseInt(value, 16));
  return Math.max(...channels) - Math.min(...channels);
}

assert.ok(rgbSpread('#111315') <= 6, 'O canvas dark deve permanecer cromaticamente neutro.');
assert.ok(rgbSpread('#F3F4F2') <= 6, 'O canvas light deve permanecer mineral neutro.');

const session = await startUiV2Session();
const context = await session.createContext();

try {
  const { page, pageErrors } = await prepareUiV2Page(context, session.server.baseUrl, { theme: 'light' });
  const badge = page.locator('#inboxBadge');
  const navItem = badge.locator('xpath=ancestor::*[contains(concat(" ", normalize-space(@class), " "), " nav-item ")]');
  const geometries = [];

  for (const value of ['1', '10', '999']) {
    await badge.evaluate((element, text) => { element.textContent = text; }, value);
    geometries.push(await badge.evaluate(element => {
      const rect = element.getBoundingClientRect();
      const parentRect = element.closest('.nav-item').getBoundingClientRect();
      const style = getComputedStyle(element);
      return {
        value: element.textContent,
        width: rect.width,
        height: rect.height,
        centerDelta: Math.abs((rect.top + rect.height / 2) - (parentRect.top + parentRect.height / 2)),
        display: style.display,
        alignItems: style.alignItems,
        justifyContent: style.justifyContent
      };
    }));
  }

  for (const geometry of geometries) {
    assert.equal(geometry.height, 20, `Badge ${geometry.value} deve manter 20px de altura.`);
    assert.ok(geometry.width >= 20, `Badge ${geometry.value} deve manter largura mínima.`);
    assert.ok(geometry.centerDelta <= 1, `Badge ${geometry.value} deve permanecer no eixo óptico.`);
    assert.ok(['flex', 'inline-flex'].includes(geometry.display), `Badge ${geometry.value} deve computar como flex.`);
    assert.equal(geometry.alignItems, 'center');
    assert.equal(geometry.justifyContent, 'center');
  }
  assert.ok(geometries[2].width > geometries[0].width, 'Três dígitos devem expandir sem comprimir o label.');
  assert.ok(await navItem.isVisible(), 'O item Publicações deve permanecer visível.');

  await page.locator('#sidebarToggleBtn').click();
  assert.equal(await badge.isVisible(), false, 'O badge deve recolher junto com a sidebar sem colisão.');
  await page.locator('#sidebarToggleBtn').click();

  await page.locator('[data-ui-mode="classic"]').click();
  assert.equal(await page.locator('html').getAttribute('data-ui'), 'classic');
  assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--v2-color-primary').trim()), '', 'Tokens V2 não podem vazar para o Classic.');
  assert.equal(await page.locator('#v2DashboardOpening').isVisible(), false, 'A superfície editorial V2 deve permanecer ausente no Classic.');

  await page.locator('[data-ui-mode="v2"]').click();
  assert.equal(await page.locator('html').getAttribute('data-ui'), 'v2');
  assert.equal(await page.locator('#v2DashboardOpening').isVisible(), true);
  assert.deepEqual(pageErrors, [], `Direção visual gerou pageerror: ${pageErrors.join(' | ')}`);

  console.log('✓ Direção Mineral Editorial aprovada: slate/charcoal/gold, grain local, motion reduzível, badge 1/10/999 e isolamento Classic.');
} finally {
  await context.close();
  await session.stop();
}
