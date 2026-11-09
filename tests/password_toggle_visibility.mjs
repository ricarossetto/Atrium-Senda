import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { startTestServer } from './helpers.mjs';

console.log('--- Password toggle: ícone oficial, tema claro/escuro e alternância real ---');

const server = await startTestServer();
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, colorScheme: 'light' });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${server.baseUrl}/`);
  await page.waitForSelector('.password-toggle:visible');

  const read = () => page.evaluate(() => {
    const el = [...document.querySelectorAll('.password-toggle')].find(item => item.getBoundingClientRect().width > 0);
    const input = el?.closest('.password-input-wrap')?.querySelector('input');
    const svg = el?.querySelector('svg');
    const use = svg?.querySelector('use');
    const rect = svg?.getBoundingClientRect();
    return {
      theme: document.documentElement.getAttribute('data-theme') || document.documentElement.dataset.theme,
      hasSvg: Boolean(svg),
      href: use?.getAttribute('href') || null,
      svgWidth: rect ? Math.round(rect.width) : 0,
      svgHeight: rect ? Math.round(rect.height) : 0,
      color: svg ? getComputedStyle(svg).color : null,
      label: el?.getAttribute('aria-label') || null,
      pressed: el?.getAttribute('aria-pressed') || null,
      inputType: input?.type || null
    };
  });

  const before = await read();
  assert.equal(before.theme, 'light', 'tema claro ativo');
  assert.equal(before.hasSvg, true, 'o botão precisa de um SVG, não pode ficar vazio');
  assert.match(before.href, /#atrium-icon-eye$/, 'estado oculto usa o ícone de olho');
  assert.ok(before.svgWidth > 0 && before.svgHeight > 0, 'o ícone precisa ter dimensão visível');
  assert.equal(before.label, 'Mostrar conteúdo');
  assert.equal(before.pressed, 'false');
  assert.equal(before.inputType, 'password');

  await page.locator('.password-toggle:visible').first().click();
  const shown = await read();
  assert.equal(shown.inputType, 'text', 'o clique revela a senha');
  assert.equal(shown.label, 'Ocultar conteúdo');
  assert.equal(shown.pressed, 'true');
  assert.match(shown.href, /#atrium-icon-eye-off$/, 'estado visível usa o ícone de olho cortado');
  assert.ok(shown.svgWidth > 0 && shown.svgHeight > 0, 'o ícone continua visível ao revelar');

  await page.locator('.password-toggle:visible').first().click();
  const hidden = await read();
  assert.equal(hidden.inputType, 'password', 'o segundo clique volta a ocultar');
  assert.equal(hidden.label, 'Mostrar conteúdo');
  assert.equal(hidden.pressed, 'false');
  assert.match(hidden.href, /#atrium-icon-eye$/, 'o ícone volta ao estado oculto');

  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
  const dark = await read();
  assert.equal(dark.theme, 'dark');
  assert.equal(dark.hasSvg, true, 'o ícone precisa existir também no tema escuro');
  assert.ok(dark.svgWidth > 0 && dark.svgHeight > 0, 'o ícone precisa ter dimensão visível no escuro');
  assert.ok(dark.color && dark.color !== 'rgba(0, 0, 0, 0)', 'o ícone precisa de cor computada visível');

  assert.deepEqual(errors, [], `erros de página: ${errors.join('; ')}`);
  console.log('PASS password toggle: SVG oficial, olho/olho cortado, tema claro/escuro e alternância real.');
} finally {
  await browser.close();
  await server.stop();
}
