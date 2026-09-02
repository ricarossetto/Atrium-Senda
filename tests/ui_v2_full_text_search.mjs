import assert from 'node:assert/strict';
import { prepareUiV2Page, startUiV2Session } from './ui_v2_helpers.mjs';

console.log('\n===============================================================');
console.log('  ATRIUM — UI V2 FULL-TEXT GLOBAL SEARCH');
console.log('===============================================================\n');

const session = await startUiV2Session();
try {
  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    const context = await session.createContext({ viewport });
    try {
      const { page, pageErrors } = await prepareUiV2Page(context, session.server.baseUrl);
      await page.evaluate(() => {
        const { Store } = window.Atrium;
        Store.state.contacts = [{ id: 'search-owner', name: 'Cliente Horizonte', contactRole: 'cliente' }];
        Store.state.leads = [{ id: 'search-lead', client: 'Cliente Horizonte', serviceType: 'Planejamento Horizonte', status: 'novo', notes: 'Atendimento sintético' }];
        Store.state.documents = [{
          id: 'search-document',
          name: 'laudo-horizonte.md',
          originalName: 'laudo-horizonte.md',
          mime: 'text/markdown',
          size: 120,
          ownerType: 'contact',
          ownerId: 'search-owner',
          documentType: 'Laudo',
          documentDate: '2026-09-01',
          checksum: 'a'.repeat(64),
          deletedAt: null
        }];
        Store.state.customPrompts = [{ id: 'search-prompt', title: 'Prompt Horizonte', category: 'Civil', prompt: 'Conteúdo Horizonte' }];
        Store.state.audit = [{ id: 'search-audit', action: 'Auditoria Horizonte', detail: 'Detalhe seguro', actor: 'Equipe', at: '2026-09-01T10:00:00.000Z' }];
        window.__searchStateBefore = JSON.stringify(Store.state);
        window.__searchRevisionBefore = Store.revision;
        window.__searchRequests = [];
        window.__searchScriptExecuted = 0;
        const original = window.KellerAuth.secureFetch.bind(window.KellerAuth);
        window.KellerAuth.secureFetch = async (url, options = {}) => {
          if (!String(url).startsWith('/api/search?')) return original(url, options);
          const query = new URL(String(url), location.origin).searchParams.get('q');
          window.__searchRequests.push({ url: String(url), method: options.method || 'GET' });
          if (query === 'primeira-consulta') await new Promise(resolve => setTimeout(resolve, 80));
          if (query === 'segunda-consulta') await new Promise(resolve => setTimeout(resolve, 5));
          const common = (entityType, target, id, title, matchedField) => ({
            entityType, target, id, title, context: 'Cliente Horizonte · contexto seguro',
            snippet: 'Trecho Horizonte <script>window.__searchScriptExecuted = 1</script>', matchedField, relevance: 100
          });
          const results = query === 'segunda-consulta'
            ? [common('task', 'task', 'second-result', 'Segunda consulta vencedora', 'Título')]
            : query === 'primeira-consulta'
              ? [common('task', 'task', 'stale-result', 'Primeira consulta obsoleta', 'Título')]
              : [
                  common('process', 'process', 'search-process', 'Processo Horizonte', 'Número CNJ'),
                  common('contact', 'contact', 'search-owner', 'Cliente Horizonte', 'Nome'),
                  common('lead', 'lead', 'search-lead', 'Atendimento Horizonte', 'Cliente ou interessado'),
                  common('publication', 'intimation', 'search-publication', 'Publicação Horizonte', 'Conteúdo da publicação'),
                  common('task', 'task', 'search-task', 'Tarefa Horizonte', 'Descrição'),
                  common('document', 'document', 'search-document', 'Laudo Horizonte', 'Texto extraído'),
                  common('prompt', 'prompt', 'search-prompt', 'Prompt Horizonte', 'Conteúdo do prompt'),
                  common('audit', 'arbitrary-view-from-response', 'search-audit', 'Auditoria Horizonte', 'Detalhe minimizado')
                ];
          return { ok: true, status: 200, async json() { return { ok: true, results }; } };
        };
      });

      await page.keyboard.press('Control+K');
      const input = page.locator('#globalSearch');
      assert.equal(await page.evaluate(() => document.activeElement?.id), 'globalSearch');
      assert.equal(await input.getAttribute('role'), 'combobox');
      await input.fill('Horizonte');
      await page.waitForFunction(() => document.querySelectorAll('#searchPaletteResults .search-palette-item').length === 8);
      await page.waitForFunction(() => document.getElementById('globalSearch')?.getAttribute('aria-busy') === 'false');
      assert.equal(await page.locator('#searchPaletteResults').getAttribute('role'), 'listbox');
      assert.equal(await page.locator('#searchPaletteResults .search-palette-group').count(), 8);
      assert.equal(await page.locator('#searchPaletteResults .search-palette-item').count(), 8);
      assert.equal(await page.locator('[data-search-id="search-audit"]').getAttribute('data-search-target'), 'audit', 'Destino deve vir do tipo fixo reconhecido, nunca do payload remoto.');
      assert.equal(await page.locator('#searchPaletteResults mark').count() > 0, true);
      assert.equal(await page.locator('#searchPaletteResults script').count(), 0);
      assert.equal(await page.locator('#searchPaletteResults img').count(), 0);
      assert.equal(await page.evaluate(() => window.__searchScriptExecuted), 0);
      assert.deepEqual(await page.evaluate(() => window.__searchRequests.map(item => item.method)), ['GET']);

      const evidence = await page.evaluate(() => {
        const ids = [...document.querySelectorAll('[id]')].map(element => element.id);
        const items = [...document.querySelectorAll('#searchPaletteResults .search-palette-item')];
        return {
          overflow: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth,
          duplicateIds: ids.filter((id, index) => ids.indexOf(id) !== index),
          undersized: innerWidth <= 760 ? items.filter(item => {
            const rect = item.getBoundingClientRect();
            return rect.width < 43.5 || rect.height < 43.5;
          }).map(item => item.textContent.trim()) : []
        };
      });
      assert.ok(evidence.overflow <= 2, `Overflow global: ${evidence.overflow}px.`);
      assert.deepEqual(evidence.duplicateIds, []);
      assert.deepEqual(evidence.undersized, []);

      await page.locator('[data-search-target="document"][data-search-id="search-document"]').click();
      await page.locator('#view-documents.active').waitFor();
      const documentRecord = page.locator('[data-document-id="search-document"]');
      await documentRecord.waitFor();
      assert.equal(await documentRecord.evaluate(element => element.classList.contains('is-search-match')), true);
      assert.equal(await documentRecord.evaluate(element => document.activeElement === element), true);

      if (viewport.width > 760) {
        await page.evaluate(() => window.Atrium.App.switchView('dashboard'));
        await input.fill('Horizonte');
        await page.waitForFunction(() => document.querySelectorAll('#searchPaletteResults .search-palette-item').length === 8);
        await page.locator('[data-search-target="lead"][data-search-id="search-lead"]').click();
        await page.locator('#view-leads.active').waitFor();
        await page.locator('#modalBackdrop:not(.hidden) #modalForm').waitFor();
        assert.equal(await page.locator('#field-client').inputValue(), 'Cliente Horizonte');
        await page.evaluate(() => window.Atrium.App.closeModal());

        await page.evaluate(() => window.Atrium.App.switchView('dashboard'));
        await input.fill('Horizonte');
        await page.waitForFunction(() => document.querySelectorAll('#searchPaletteResults .search-palette-item').length === 8);
        await page.locator('[data-search-target="prompt"][data-search-id="search-prompt"]').click();
        await page.locator('#view-prompts.active').waitFor();
        assert.equal(await page.locator('#promptsSearchInput').inputValue(), 'Prompt Horizonte');

        await page.evaluate(() => window.Atrium.App.switchView('dashboard'));
        await page.evaluate(async () => {
          const first = window.Atrium.App.performGlobalSearch('primeira-consulta');
          const second = window.Atrium.App.performGlobalSearch('segunda-consulta');
          await Promise.all([first, second]);
        });
        assert.equal(await page.locator('#searchPaletteResults').textContent().then(text => text.includes('Segunda consulta vencedora')), true);
        assert.equal(await page.locator('#searchPaletteResults').textContent().then(text => text.includes('Primeira consulta obsoleta')), false, 'Resposta obsoleta não pode reabrir/substituir a paleta.');
      }

      assert.equal(await page.evaluate(() => JSON.stringify(window.Atrium.Store.state) === window.__searchStateBefore), true, 'Busca não pode mutar Store.');
      assert.equal(await page.evaluate(() => window.Atrium.Store.revision === window.__searchRevisionBefore), true, 'Busca não pode alterar revision.');
      assert.deepEqual(pageErrors, []);
    } finally {
      await context.close();
    }
  }

  console.log('✓ Busca global V2: oito grupos, CRM incluído, highlight escapado, keyboard, seleção, race, mobile e zero mutação aprovados.');
} finally {
  await session.stop();
}
