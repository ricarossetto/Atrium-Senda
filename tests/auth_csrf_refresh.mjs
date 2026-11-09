import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { startTestServer } from './helpers.mjs';

console.log('--- CSRF após restart: renovação automática sem recarregar a página ---');

const server = await startTestServer();
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(`${server.baseUrl}/`);
  await page.waitForFunction(() => window.AtriumAuth && typeof window.AtriumAuth.secureFetch === 'function');

  const result = await page.evaluate(async () => {
    const realFetch = window.fetch.bind(window);
    const calls = [];
    window.fetch = async (url, options = {}) => {
      const target = String(url);
      if (target.includes('/api/test/csrf')) {
        const csrf = options.headers?.get?.('X-CSRF-Token') || null;
        calls.push({ target: 'mutation', csrf });
        if (calls.filter(item => item.target === 'mutation').length === 1) {
          return new Response(JSON.stringify({ message: 'Validação de segurança da sessão ausente ou inválida.' }), {
            status: 403,
            headers: { 'Content-Type': 'application/json' }
          });
        }
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      if (target.includes('/api/auth/status')) {
        calls.push({ target: 'status', csrf: null });
        return new Response(JSON.stringify({ authenticated: true, csrfToken: 'token-renovado' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      return realFetch(url, options);
    };

    const response = await window.AtriumAuth.secureFetch('/api/test/csrf', {
      method: 'POST',
      headers: { Accept: 'application/json' }
    });
    window.fetch = realFetch;
    return { status: response.status, calls };
  });

  assert.equal(result.status, 200, 'a mutação deve ser repetida com o token novo');
  assert.deepEqual(result.calls.map(item => item.target), ['mutation', 'status', 'mutation'], 'ordem: 403, status, retry');
  assert.equal(result.calls[0].csrf, null, 'primeira tentativa usa o token antigo/ausente');
  assert.equal(result.calls[2].csrf, 'token-renovado', 'retry usa o token renovado');
  console.log('PASS CSRF: 403 de sessão renova o token e repete a mutação uma única vez.');
} finally {
  await browser.close();
  await server.stop();
}
