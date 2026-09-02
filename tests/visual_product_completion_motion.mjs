import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepareUiV2Page, startUiV2Session, switchUiV2View } from './ui_v2_helpers.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT = path.join(ROOT, 'artifacts', 'visual-qa', 'product-completion-motion');
fs.mkdirSync(OUTPUT, { recursive: true });
const scenarios = [
  { file: '01-registry-review-light.png', theme: 'light', viewport: { width: 1440, height: 900 }, view: 'contacts' },
  { file: '02-registry-review-dark.png', theme: 'dark', viewport: { width: 1440, height: 900 }, view: 'contacts' },
  { file: '03-registry-configuration-light.png', theme: 'light', viewport: { width: 1440, height: 900 }, view: 'configuration' },
  { file: '04-registry-review-mobile.png', theme: 'light', viewport: { width: 390, height: 844 }, view: 'contacts' },
  { file: '05-empty-first-use-dashboard.png', theme: 'light', viewport: { width: 1280, height: 800 }, view: 'dashboard' }
];

const session = await startUiV2Session();
const hashes = new Set();
let assertions = 0;
try {
  for (const scenario of scenarios) {
    const context = await session.createContext({ viewport: scenario.viewport, reducedMotion: 'reduce' });
    try {
      const { page, pageErrors } = await prepareUiV2Page(context, session.server.baseUrl, { theme: scenario.theme });
      await page.evaluate(() => {
        const original = window.KellerAuth.secureFetch.bind(window.KellerAuth);
        window.KellerAuth.secureFetch = async (url, options = {}) => {
          const value = String(url);
          if (!value.startsWith('/api/registry/')) return original(url, options);
          let payload;
          if (value.startsWith('/api/registry/document/validate')) payload = { type: 'cnpj', normalized: '12ABC34501DE35', valid: true, externalLookup: 'available', message: 'Documento válido.' };
          else if (value.startsWith('/api/registry/cnpj')) payload = {
            document: '12.ABC.345/01DE-35', normalizedDocument: '12ABC34501DE35', legalName: 'SOCIEDADE MINERAL SINTÉTICA LTDA', tradeName: 'MINERAL SINTÉTICA', status: 'ATIVA', statusDate: '2026-08-02', primaryActivity: 'Serviços jurídicos sintéticos', municipalityIbgeCode: '4300000', simpleNational: true, mei: false,
            email: 'cadastro@example.test', phone: '51900000000', address: 'RUA DOS TESTES, 100', district: 'CENTRO', city: 'CIDADE SINTÉTICA', state: 'RS', zip: '98765-000', qsa: [{ name: 'PESSOA SÓCIA SINTÉTICA', role: 'Sócia-Administradora' }], registry: { source: 'BrasilAPI · dados públicos de CNPJ', freshness: 'live', consultedAt: '2026-09-02T12:00:00.000Z' }
          };
          else if (value === '/api/registry/status') payload = { providers: [
            { id: 'brasilapi', name: 'BrasilAPI', capabilities: ['CNPJ', 'CEP', 'Bancos'], configured: true, priority: 1, cacheTtlMs: 43200000, lastSuccessAt: '2026-09-02T12:00:00.000Z', lastLatencyMs: 124, state: 'available' },
            { id: 'viacep', name: 'ViaCEP', capabilities: ['CEP fallback'], configured: true, priority: 2, cacheTtlMs: 604800000, lastSuccessAt: null, lastLatencyMs: null, state: 'available' },
            { id: 'cpf-external', name: 'Consulta externa de CPF', capabilities: ['CPF'], configured: false, state: 'not_configured' }
          ] };
          else payload = { records: [] };
          return { ok: true, status: 200, async json() { return structuredClone(payload); } };
        };
        const store = window.Atrium.Store;
        store.state.contacts = [];
        store.state.processes = [];
        store.state.tasks = [];
        store.state.intimations = [];
        store.state.leads = [];
        store.state.agenda = [];
        window.Atrium.App.renderAll();
      });

      await switchUiV2View(page, scenario.view);
      if (scenario.view === 'contacts') {
        await page.locator('#newContactButton').click();
        await page.locator('#field-name').fill('Cadastro atual sintético');
        await page.locator('#field-document').fill('12.ABC.345/01DE-35');
        await page.locator('[data-registry-action="document"]').click();
        await page.locator('.registry-field-review', { hasText: 'Cadastro atual versus dado encontrado' }).waitFor();
      } else if (scenario.view === 'configuration') {
        await page.locator('[data-config-section="registry"]').click();
        await page.locator('.registry-provider-card').first().waitFor();
      }

      const evidence = await page.evaluate(() => {
        const ids = [...document.querySelectorAll('[id]')].map(element => element.id);
        const buttons = [...document.querySelectorAll('#contactRegistryReview button, .registry-config-workspace button')].filter(button => button.getClientRects().length);
        return {
          activeViews: [...document.querySelectorAll('.view.active')].map(element => element.id),
          overflow: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth,
          duplicateIds: ids.filter((id, index) => ids.indexOf(id) !== index),
          undersized: innerWidth <= 760 ? buttons.filter(button => { const rect = button.getBoundingClientRect(); return rect.width < 43.5 || rect.height < 43.5; }).map(button => button.textContent.trim()) : []
        };
      });
      assert.deepEqual(evidence.activeViews, [`view-${scenario.view}`]); assertions++;
      assert.ok(evidence.overflow <= 2, `${scenario.file}: overflow ${evidence.overflow}px.`); assertions++;
      assert.deepEqual(evidence.duplicateIds, []); assertions++;
      assert.deepEqual(evidence.undersized, []); assertions++;
      assert.deepEqual(pageErrors, []); assertions++;
      const output = path.join(OUTPUT, scenario.file);
      await page.screenshot({ path: output, fullPage: false });
      hashes.add(crypto.createHash('sha256').update(fs.readFileSync(output)).digest('hex'));
    } finally {
      await context.close();
    }
  }
  assert.equal(hashes.size, scenarios.length); assertions++;
  console.log(`✓ Product completion visual: ${scenarios.length} screenshots, ${hashes.size}/${scenarios.length} hashes e ${assertions}/${assertions} asserções; saída ${OUTPUT}`);
} finally {
  await session.stop();
}
