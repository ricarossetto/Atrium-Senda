import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { startTestServer } from './helpers.mjs';

console.log('--- Iniciando Testes: arquivo do sistema que não carrega não vira tela com zeros ---');

const server = await startTestServer();
const browser = await chromium.launch();
try {
  // Falha passageira: recarrega sozinho uma vez e o sistema sobe.
  {
    const page = await browser.newPage();
    let failures = 0;
    let requests = 0;
    await page.route('**/js/views/ui-v2/processes-presenter.js*', route => {
      requests += 1;
      if (requests === 1) {
        failures += 1;
        return route.fulfill({ status: 500, body: '' });
      }
      return route.continue();
    });
    await page.goto(server.baseUrl);
    await page.waitForFunction(() => window.Atrium, null, { timeout: 30_000 });
    assert.equal(failures, 1);
    assert.equal(await page.locator('.boot-failure').count(), 0, 'Depois da nova tentativa não há aviso.');
    await page.close();
  }

  // Falha que continua: aviso cobre a tela, com botão de recarregar, sem laço de recarga.
  {
    const page = await browser.newPage();
    let navigations = 0;
    page.on('framenavigated', frame => {
      if (frame === page.mainFrame()) navigations += 1;
    });
    await page.route('**/js/views/ui-v2/processes-presenter.js*', route => route.fulfill({ status: 500, body: '' }));
    await page.goto(server.baseUrl);
    const alert = page.locator('.boot-failure[role="alert"]');
    await alert.waitFor({ timeout: 30_000 });
    assert.match(await alert.innerText(), /Não foi possível carregar o Atrium/);
    assert.ok(await alert.getByRole('button', { name: 'Recarregar' }).isVisible());
    const box = await alert.boundingBox();
    const viewport = page.viewportSize();
    assert.ok(box.width >= viewport.width && box.height >= viewport.height, 'O aviso cobre os números da tela.');
    const settled = navigations;
    await page.waitForTimeout(1500);
    assert.equal(navigations, settled, 'Não fica recarregando.');
    assert.ok(navigations <= 2, 'Tenta de novo só uma vez.');
    await page.close();
  }

  // Sem falha, nenhum aviso.
  {
    const page = await browser.newPage();
    await page.goto(server.baseUrl);
    await page.waitForFunction(() => window.Atrium, null, { timeout: 30_000 });
    assert.equal(await page.locator('.boot-failure').count(), 0);
    await page.close();
  }
} finally {
  await browser.close();
  await server.stop?.();
}

console.log('[PASS] Arquivo do sistema que não carrega não vira tela com zeros.');
process.exit(0);
