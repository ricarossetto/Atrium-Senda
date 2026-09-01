import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepareUiV2DocumentsFixture, prepareUiV2Page, startUiV2Session } from './ui_v2_helpers.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT = path.join(ROOT, 'artifacts', 'visual-qa', 'ui-v2-documents');
fs.mkdirSync(OUTPUT, { recursive: true });

const SCENARIOS = [
  { file: '01-light-1440x900-catalog.png', theme: 'light', viewport: { width: 1440, height: 900 }, state: 'catalog' },
  { file: '02-dark-1440x900-catalog.png', theme: 'dark', viewport: { width: 1440, height: 900 }, state: 'catalog' },
  { file: '03-light-1440x900-procuracao.png', theme: 'light', viewport: { width: 1440, height: 900 }, state: 'procuracao' },
  { file: '04-dark-1440x900-contrato.png', theme: 'dark', viewport: { width: 1440, height: 900 }, state: 'contrato' },
  { file: '05-light-1280x800-prestacao-rpv.png', theme: 'light', viewport: { width: 1280, height: 800 }, state: 'rpv' },
  { file: '06-dark-1280x800-long-preview.png', theme: 'dark', viewport: { width: 1280, height: 800 }, state: 'long' },
  { file: '07-light-1024x768-general.png', theme: 'light', viewport: { width: 1024, height: 768 }, state: 'general' },
  { file: '08-light-390x844-mobile-catalog.png', theme: 'light', viewport: { width: 390, height: 844 }, state: 'catalog' },
  { file: '09-dark-390x844-mobile-catalog.png', theme: 'dark', viewport: { width: 390, height: 844 }, state: 'catalog' },
  { file: '10-light-390x844-mobile-generator.png', theme: 'light', viewport: { width: 390, height: 844 }, state: 'mobile-generator' },
  { file: '11-dark-390x844-mobile-preview.png', theme: 'dark', viewport: { width: 390, height: 844 }, state: 'mobile-preview' },
  { file: '12-light-1440x900-document-archive.png', theme: 'light', viewport: { width: 1440, height: 900 }, state: 'archive' },
  { file: '13-dark-390x844-mobile-document-archive.png', theme: 'dark', viewport: { width: 390, height: 844 }, state: 'archive' },
  { file: '14-light-1440x900-document-intelligence.png', theme: 'light', viewport: { width: 1440, height: 900 }, state: 'intelligence' },
  { file: '15-dark-390x844-mobile-document-intelligence.png', theme: 'dark', viewport: { width: 390, height: 844 }, state: 'intelligence' }
];

const session = await startUiV2Session();
const hashes = new Set();
let assertions = 0;
try {
  for (const scenario of SCENARIOS) {
    const context = await session.createContext({ viewport: scenario.viewport });
    try {
      const { page, pageErrors } = await prepareUiV2Page(context, session.server.baseUrl, { theme: scenario.theme });
      await prepareUiV2DocumentsFixture(page);
      await page.waitForFunction(() => document.querySelector('#view-documents')?.getAnimations({ subtree: true }).every(animation => animation.playState === 'finished'));

      if (scenario.state === 'archive' || scenario.state === 'intelligence') {
        await page.evaluate(() => {
          window.Atrium.Store.state.documents = [{
            id: 'visual-document-1',
            name: '5000000-00.2026.8.21.0001 - Cliente Documental - identidade - 2026-09-01.pdf',
            originalName: 'identidade.pdf',
            mime: 'application/pdf',
            size: 248320,
            createdAt: '2026-09-01T12:00:00.000Z',
            updatedAt: '2026-09-01T12:00:00.000Z',
            documentDate: '2026-09-01',
            ownerType: 'contact',
            ownerId: 'doc-contact',
            documentType: 'Identidade civil',
            deletedAt: null,
            deletedBy: null,
            checksum: 'a'.repeat(64),
            intelligence: { ocr: { engine: 'atrium-text-extractor', characterCount: 418, supervised: true, checksum: 'b'.repeat(64) } }
          }];
          window.Atrium.App.renderDocuments();
          document.getElementById('documentArchiveWorkspace').scrollIntoView({ block: 'start' });
        });
        if (scenario.state === 'intelligence') {
          await page.evaluate(() => {
            const panel = document.getElementById('documentIntelligencePanel');
            const body = document.getElementById('documentIntelligenceBody');
            document.getElementById('documentIntelligenceTitle').textContent = 'Texto extraído';
            document.getElementById('documentIntelligenceMeta').textContent = 'identidade.pdf · atrium-text-extractor · revisão humana obrigatória';
            const text = document.createElement('pre');
            text.textContent = 'DOCUMENTO SINTÉTICO PARA REVISÃO\n\nCliente: Cliente Documental Sintética\nProcesso: 5000000-00.2026.8.21.0001\n\nTexto extraído localmente. Confira nomes, números, datas e valores no documento original antes de qualquer uso jurídico.';
            body.replaceChildren(text);
            body.setAttribute('aria-busy', 'false');
            panel.classList.remove('hidden');
            panel.scrollIntoView({ block: 'start' });
          });
        }
      }

      if (scenario.state !== 'catalog' && scenario.state !== 'archive' && scenario.state !== 'intelligence') {
        await page.locator('#btnOpenDocGenModal').click();
        await page.waitForFunction(() => document.querySelector('#docGeneratorBackdrop .doc-generator-modal')?.contains(document.activeElement));
        await page.waitForFunction(() => {
          const rect = document.querySelector('#docGeneratorBackdrop .doc-generator-modal')?.getBoundingClientRect();
          return rect && rect.left >= -2 && rect.right <= innerWidth + 2 && rect.top >= -2 && rect.bottom <= innerHeight + 2;
        });
        await page.waitForFunction(() => document.querySelector('#docGeneratorBackdrop')?.getAnimations({ subtree: true }).every(animation => animation.playState === 'finished'));
        if (scenario.state === 'contrato') {
          await page.locator('#docGenTypeSelect').selectOption('contrato_honorarios');
          await page.locator('#docGenContactSelect').selectOption('doc-contact');
          await page.locator('#docGenProcessSelect').selectOption('doc-process');
        }
        if (scenario.state === 'rpv') {
          await page.locator('#docGenTypeSelect').selectOption('prestacao_contas_rpv');
          await page.locator('#docGenContactSelect').selectOption('doc-contact');
          await page.locator('#docGenProcessSelect').selectOption('doc-rpv');
        }
        if (scenario.state === 'long') await page.locator('#docGenTypeSelect').selectOption('quesitos_prev');
        if (scenario.state === 'general') await page.locator('#docGenTypeSelect').selectOption('substabelecimento');
        if (scenario.state === 'procuracao') await page.locator('#docGenContactSelect').selectOption('doc-contact');
        if (scenario.state === 'mobile-preview') await page.locator('#docGenPreviewText').scrollIntoViewIfNeeded();
      }

      const layout = await page.evaluate(() => {
        const ids = [...document.querySelectorAll('[id]')].map(element => element.id);
        const activeModal = document.querySelector('#docGeneratorBackdrop:not(.hidden) .doc-generator-modal');
        const modalRect = activeModal?.getBoundingClientRect();
        const textarea = activeModal?.querySelector('#docGenPreviewText');
        const textareaRect = textarea?.getBoundingClientRect();
        const visibleButtons = [...document.querySelectorAll('#view-documents button, #docGeneratorBackdrop:not(.hidden) button')].filter(button => button.getClientRects().length);
        return {
          active: document.getElementById('view-documents').classList.contains('active'),
          ui: document.documentElement.dataset.ui,
          overflow: document.documentElement.scrollWidth - innerWidth,
          duplicates: ids.filter((id, index) => ids.indexOf(id) !== index),
          cards: document.querySelectorAll('#documentsTemplateGrid .document-template-card').length,
          modal: modalRect ? { left: modalRect.left, right: modalRect.right, top: modalRect.top, bottom: modalRect.bottom, width: innerWidth, height: innerHeight, overflow: activeModal.scrollWidth - activeModal.clientWidth } : null,
          textarea: textareaRect ? { left: textareaRect.left, right: textareaRect.right, clientWidth: textarea.clientWidth, scrollWidth: textarea.scrollWidth } : null,
          undersized: innerWidth <= 760 ? visibleButtons.filter(button => {
            const rect = button.getBoundingClientRect();
            return rect.width < 43.5 || rect.height < 43.5;
          }).map(button => button.getAttribute('aria-label') || button.textContent.trim()) : []
        };
      });
      assert.equal(layout.active, true); assertions++;
      assert.equal(layout.ui, 'v2'); assertions++;
      assert.ok(layout.overflow <= 2, `${scenario.file}: overflow global ${layout.overflow}px.`); assertions++;
      assert.deepEqual(layout.duplicates, []); assertions++;
      assert.equal(layout.cards, 5); assertions++;
      assert.deepEqual(layout.undersized, []); assertions++;
      assert.deepEqual(pageErrors, []); assertions++;
      if (layout.modal) {
        assert.ok(layout.modal.left >= -2 && layout.modal.right <= layout.modal.width + 2, `${scenario.file}: modal horizontal.`); assertions++;
        assert.ok(layout.modal.top >= -2 && layout.modal.bottom <= layout.modal.height + 2, `${scenario.file}: modal vertical.`); assertions++;
        assert.ok(layout.modal.overflow <= 2, `${scenario.file}: modal com overflow horizontal.`); assertions++;
        assert.ok(layout.textarea.left >= -2 && layout.textarea.right <= layout.modal.width + 2, `${scenario.file}: preview fora do viewport.`); assertions++;
        assert.ok(layout.textarea.scrollWidth - layout.textarea.clientWidth <= 2, `${scenario.file}: preview com overflow horizontal.`); assertions++;
      }

      const output = path.join(OUTPUT, scenario.file);
      if (scenario.state === 'archive' || scenario.state === 'intelligence') await page.locator('#documentArchiveWorkspace').screenshot({ path: output });
      else await page.screenshot({ path: output, fullPage: false });
      hashes.add(crypto.createHash('sha256').update(fs.readFileSync(output)).digest('hex'));
    } finally {
      await context.close();
    }
  }

  assert.equal(hashes.size, SCENARIOS.length, 'Os quinze estados visuais devem produzir hashes distintos.');
  console.log('======================================================');
  console.log('✓ UI V2 DOCUMENTS VISUAL QA CONCLUÍDO!');
  console.log(`- Screenshots: ${SCENARIOS.length}`);
  console.log(`- Hashes únicos: ${hashes.size}`);
  console.log(`- Asserções: ${assertions}/${assertions}`);
  console.log(`- Artefatos: ${OUTPUT}`);
  console.log('======================================================');
} finally {
  await session.stop();
}
