import assert from 'node:assert/strict';
import { prepareUiV2Page, startUiV2Session, switchUiV2View } from './ui_v2_helpers.mjs';

console.log('\nATRIUM — UI V2 INTELIGÊNCIA CADASTRAL SUPERVISIONADA');

const session = await startUiV2Session();
try {
  const context = await session.createContext({ viewport: { width: 1440, height: 900 } });
  const { page, pageErrors } = await prepareUiV2Page(context, session.server.baseUrl, { theme: 'light' });
  await page.evaluate(() => {
    const clone = value => structuredClone(value);
    const original = window.KellerAuth.secureFetch.bind(window.KellerAuth);
    window.__registryUiRequests = [];
    window.KellerAuth.secureFetch = async (url, options = {}) => {
      const value = String(url);
      if (!value.startsWith('/api/registry/')) return original(url, options);
      window.__registryUiRequests.push({ url: value, method: options.method || 'GET' });
      let payload;
      if (value.startsWith('/api/registry/document/validate')) payload = { type: 'cnpj', normalized: '12ABC34501DE35', formatted: '12.ABC.345/01DE-35', valid: true, externalLookup: 'available', message: 'Documento válido para consulta cadastral.' };
      else if (value.startsWith('/api/registry/cnpj')) payload = {
        document: '12.ABC.345/01DE-35', normalizedDocument: '12ABC34501DE35', legalName: 'SOCIEDADE MINERAL SINTÉTICA LTDA', tradeName: 'MINERAL SINTÉTICA',
        status: 'ATIVA', statusDate: '2026-08-02', primaryActivity: 'Serviços jurídicos sintéticos', municipalityIbgeCode: '4300000', simpleNational: true, mei: false, email: 'cadastro.registry@example.test', phone: '51900000000', address: 'RUA DOS TESTES, 100', district: 'CENTRO', city: 'CIDADE SINTÉTICA', state: 'RS', zip: '98765-000',
        qsa: [{ name: 'PESSOA SÓCIA SINTÉTICA', role: 'Sócia-Administradora' }], registry: { source: 'BrasilAPI · dados públicos de CNPJ', freshness: 'live', consultedAt: '2026-09-02T12:00:00.000Z' }
      };
      else if (value.startsWith('/api/registry/cep')) payload = { zip: '98765-000', address: 'Rua dos Testes', district: 'Centro', city: 'Cidade Sintética', state: 'RS', registry: { source: 'ViaCEP · endereço público por CEP', freshness: 'cached', consultedAt: '2026-09-02T12:00:00.000Z' } };
      else if (value === '/api/registry/status') payload = { providers: [
        { id: 'brasilapi', name: 'BrasilAPI', capabilities: ['CNPJ', 'CEP', 'Bancos'], configured: true, priority: 1, cacheTtlMs: 43200000, lastSuccessAt: null, lastLatencyMs: null, state: 'available' },
        { id: 'viacep', name: 'ViaCEP', capabilities: ['CEP fallback'], configured: true, priority: 2, cacheTtlMs: 604800000, lastSuccessAt: null, lastLatencyMs: null, state: 'available' },
        { id: 'cpf-external', name: 'Consulta externa de CPF', capabilities: ['CPF'], configured: false, state: 'not_configured' }
      ] };
      else if (value.includes('/providers/') && value.endsWith('/test')) payload = { providerId: value.includes('brasilapi') ? 'brasilapi' : 'viacep', state: 'available', testedAt: '2026-09-02T12:00:00.000Z', latencyMs: 12 };
      else if (value.startsWith('/api/registry/banks')) payload = { records: [{ code: '001', ispb: '00000000', name: 'BCO SINTÉTICO S.A.', fullName: 'BANCO SINTÉTICO S.A.' }], registry: { freshness: 'cached' } };
      else return { ok: false, async json() { return { message: 'Mock cadastral ausente.' }; } };
      return { ok: true, async json() { return clone(payload); } };
    };
    window.Atrium.Store.state.contacts = [];
    window.Atrium.Store.state.audit = [];
    window.Atrium.App.renderAll();
  });

  await switchUiV2View(page, 'contacts');
  await page.locator('#newContactButton').click();
  await page.locator('#contactRegistryReview').waitFor();
  assert.match(await page.locator('#contactRegistryReview').textContent(), /Nenhum dado é aplicado automaticamente/);
  await page.locator('#field-document').fill('12.ABC.345/01DE-35');
  await page.locator('[data-registry-action="document"]').click();
  await page.locator('.registry-company-summary', { hasText: 'SOCIEDADE MINERAL SINTÉTICA LTDA' }).waitFor();
  assert.equal(await page.locator('#field-name').inputValue(), '', 'Consulta nunca pode preencher silenciosamente.');
  assert.equal(await page.locator('.registry-field-review [data-registry-field]').count(), 8);
  assert.match(await page.locator('.registry-field-review').textContent(), /Cadastro atual versus dado encontrado/);
  assert.match(await page.locator('.registry-company-summary').textContent(), /Serviços jurídicos sintéticos/);
  await page.locator('[data-registry-field="name"]').check();
  await page.locator('[data-registry-field="email"]').check();
  await page.locator('[data-registry-action="apply"]').click();
  assert.equal(await page.locator('#field-name').inputValue(), 'SOCIEDADE MINERAL SINTÉTICA LTDA');
  assert.equal(await page.locator('#field-email').inputValue(), 'cadastro.registry@example.test');
  assert.match(await page.locator('[data-registry-status]').textContent(), /salvamento continua sob sua confirmação/i);

  await page.locator('[data-registry-action="qsa"]').click();
  assert.match(await page.locator('[data-registry-status]').textContent(), /papel “Outro”/);
  await page.locator('#modalForm button[type="submit"]').click();
  await page.locator('#modalBackdrop').waitFor({ state: 'hidden' });
  const saved = await page.evaluate(() => ({
    company: window.Atrium.Store.state.contacts.find(item => item.name === 'SOCIEDADE MINERAL SINTÉTICA LTDA'),
    partner: window.Atrium.Store.state.contacts.find(item => item.name === 'PESSOA SÓCIA SINTÉTICA'),
    audit: window.Atrium.Store.state.audit
  }));
  assert.equal(saved.company.email, 'cadastro.registry@example.test');
  assert.deepEqual(saved.company.registryProvenance[0].appliedFields.sort(), ['email', 'name']);
  assert.equal(saved.partner.contactRole, 'outro', 'QSA nunca pode virar cliente automaticamente.');
  assert.match(saved.partner.source, /importação QSA supervisionada/);
  assert.equal(saved.audit.some(item => JSON.stringify(item).includes('12ABC34501DE35')), false, 'Audit não deve receber identificador cadastral.');

  await switchUiV2View(page, 'configuration');
  await page.locator('[data-config-section="registry"]').click();
  await page.locator('.registry-provider-card').first().waitFor();
  assert.equal(await page.locator('.registry-provider-card').count(), 3);
  assert.equal(await page.locator('[data-registry-config-action="test-provider"]').count(), 2);
  await page.locator('[data-registry-provider="brasilapi"]').click();
  await page.locator('[data-registry-provider="brasilapi"]').waitFor();
  assert.match(await page.locator('.registry-policy-note').textContent(), /não raspa bases não autorizadas/i);
  await page.locator('#registryBankQuery').fill('001');
  await page.locator('[data-registry-config-action="banks"]').click();
  await page.locator('#registryBankResults article', { hasText: 'BCO SINTÉTICO' }).waitFor();
  assert.equal(await page.locator('#registryBankResults article').count(), 1);

  const evidence = await page.evaluate(() => ({
    requests: window.__registryUiRequests,
    duplicateIds: [...document.querySelectorAll('[id]')].map(item => item.id).filter((id, index, all) => all.indexOf(id) !== index),
    overflow: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth
  }));
  assert.equal(evidence.requests.every(request => request.method === 'GET'), true);
  assert.deepEqual(evidence.duplicateIds, []);
  assert.ok(evidence.overflow <= 1, `Overflow global inesperado: ${evidence.overflow}px.`);
  assert.deepEqual(pageErrors, []);
  await context.close();
} finally {
  await session.stop();
}

console.log('✓ Revisão explícita, proveniência, QSA supervisionado, política CPF, bancos e layout aprovados.');
