import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepareUiV2Page, startUiV2Session } from './ui_v2_helpers.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT = path.join(ROOT, 'artifacts', 'visual-qa', 'ui-v2-full-text-search');
await rm(OUTPUT, { recursive: true, force: true });
await mkdir(OUTPUT, { recursive: true });

console.log('\n===============================================================');
console.log('  ATRIUM — UI V2 FULL-TEXT SEARCH VISUAL QA');
console.log('===============================================================\n');

const scenarios = [
  { name: '01-light-1440x900', width: 1440, height: 900, theme: 'light' },
  { name: '02-dark-1440x900', width: 1440, height: 900, theme: 'dark' },
  { name: '03-light-390x844', width: 390, height: 844, theme: 'light' },
  { name: '04-dark-390x844', width: 390, height: 844, theme: 'dark' }
];
const hashes = new Set();
let assertions = 0;
const session = await startUiV2Session();
try {
  for (const scenario of scenarios) {
    const context = await session.createContext({ viewport: { width: scenario.width, height: scenario.height } });
    try {
      const { page, pageErrors } = await prepareUiV2Page(context, session.server.baseUrl);
      await page.evaluate(async theme => {
        const result = (entityType, target, id, title, context, snippet, matchedField, relevance) => ({ entityType, target, id, title, context, snippet, matchedField, relevance });
        const results = [
          result('process', 'process', 'visual-process', '5009999-11.2026.4.04.0001', 'Cliente Horizonte · TRF4', 'Perícia Horizonte concluída sob supervisão', 'Número CNJ', 180),
          result('contact', 'contact', 'visual-contact', 'Beatriz Horizonte', 'Cliente · Ijuí/RS', 'Relacionamento cadastrado no escritório', 'Nome', 160),
          result('publication', 'intimation', 'visual-publication', 'Publicação Horizonte', '5009999-11.2026.4.04.0001 · TRF4', 'Despacho de saneamento publicado', 'Conteúdo da publicação', 140),
          result('task', 'task', 'visual-task', 'Revisar despacho Horizonte', 'Cliente Horizonte · Equipe', 'Conferência humana obrigatória', 'Descrição', 120),
          result('document', 'document', 'visual-document', 'laudo-horizonte.pdf', 'Cliente Horizonte · Laudo', 'Trecho OCR Horizonte revisável e derivado', 'Texto extraído', 100),
          result('prompt', 'prompt', 'visual-prompt', 'Síntese Horizonte', 'Previdenciário · Análise', 'Prompt jurídico supervisionado', 'Conteúdo do prompt', 80),
          result('audit', 'audit', 'visual-audit', 'Documento Horizonte revisado', 'Advogada Teste · 01/09/2026', 'Metadados da operação', 'Ação auditada', 60)
        ];
        const original = window.KellerAuth.secureFetch.bind(window.KellerAuth);
        window.KellerAuth.secureFetch = async (url, options = {}) => String(url).startsWith('/api/search?')
          ? { ok: true, status: 200, async json() { return { ok: true, results }; } }
          : original(url, options);
        window.Atrium.App.setTheme(theme);
        document.getElementById('globalSearch').value = 'Horizonte';
        await window.Atrium.App.performGlobalSearch('Horizonte');
      }, scenario.theme);
      await page.waitForFunction(() => document.querySelectorAll('#searchPaletteResults .search-palette-item').length === 7);
      const evidence = await page.evaluate(() => ({
        groups: document.querySelectorAll('#searchPaletteResults .search-palette-group').length,
        marks: document.querySelectorAll('#searchPaletteResults mark').length,
        scripts: document.querySelectorAll('#searchPaletteResults script').length,
        overflow: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth,
        palette: document.getElementById('globalSearchPalette').getBoundingClientRect().toJSON(),
        undersized: [...document.querySelectorAll('#searchPaletteResults .search-palette-item')].filter(item => {
          const rect = item.getBoundingClientRect();
          return innerWidth <= 760 && (rect.width < 43.5 || rect.height < 43.5);
        }).length
      }));
      assert.equal(evidence.groups, 7); assertions += 1;
      assert.ok(evidence.marks >= 7); assertions += 1;
      assert.equal(evidence.scripts, 0); assertions += 1;
      assert.ok(evidence.overflow <= 2); assertions += 1;
      assert.ok(evidence.palette.left >= -1 && evidence.palette.right <= scenario.width + 1); assertions += 1;
      assert.equal(evidence.undersized, 0); assertions += 1;
      assert.deepEqual(pageErrors, []); assertions += 1;
      const target = path.join(OUTPUT, `${scenario.name}.png`);
      await page.screenshot({ path: target });
      hashes.add(createHash('sha256').update(await readFile(target)).digest('hex'));
    } finally {
      await context.close();
    }
  }
} finally {
  await session.stop();
}

assert.equal(hashes.size, scenarios.length, 'Cenários visuais devem ser materialmente distintos.');
assertions += 1;
console.log(`✓ Screenshots: ${scenarios.length}`);
console.log(`✓ Hashes únicos: ${hashes.size}/${scenarios.length}`);
console.log(`✓ Asserções: ${assertions}/${assertions}`);
