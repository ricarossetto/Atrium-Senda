import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderDeadlineConference } from '../js/views/ui-v2/publications-presenter.js';

console.log('\n===============================================================');
console.log('  ATRIUM — CONFERENCIA DE PRAZO NA PUBLICACAO (UI V2)           ');
console.log('===============================================================\n');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [featureSource, cssSource, presenterSource] = await Promise.all([
  readFile(path.join(ROOT, 'js/features/publications.js'), 'utf8'),
  readFile(path.join(ROOT, 'css/views/ui-v2/publications.css'), 'utf8'),
  readFile(path.join(ROOT, 'js/views/ui-v2/publications-presenter.js'), 'utf8')
]);

assert.match(presenterSource, /renderDeadlineConference/, 'Presenter deve renderizar a conferência.');
assert.match(featureSource, /conferenceDeadline\(item\)/, 'Feature deve tratar a ação de conferência.');
assert.match(featureSource, /secureFetch\('\/api\/calc\/deadline\/conference'/, 'Conferência deve usar a rota oficial.');
assert.match(cssSource, /publication-deadline-conference/, 'Estilos da conferência devem viver no módulo de publicações.');
console.log('✓ Wiring do presenter, da feature e dos estilos.');

const escapeHtml = value => String(value ?? '')
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;').replaceAll("'", '&#39;');
const html = renderDeadlineConference({ item: { publishedAt: '2026-09-18', disponibilizadoEm: '2026-09-17' }, escapeHtml });
assert.match(html, /Contagem de prazo/);
assert.match(html, /data-conference-start value="2026-09-18"/, 'Data inicial usa a publicação do registro.');
assert.match(html, /value="15" data-conference-days/);
assert.match(html, /data-conference-counting/, 'Contagem oferece dias úteis/corridos.');
assert.match(html, /data-conference-direction/, 'Direção oferece antes/depois.');
assert.match(html, /data-detail-action="conference-deadline"/);
assert.match(html, /nada é gravado automaticamente/);
assert.match(html, /a confirmação do prazo é humana/);
const fallback = renderDeadlineConference({ item: { disponibilizadoEm: '2026-09-17' }, escapeHtml });
assert.match(fallback, /data-conference-start value="2026-09-17"/, 'Sem publicação, usa a disponibilização.');
const empty = renderDeadlineConference({ item: {}, escapeHtml });
assert.match(empty, /data-conference-start value=""/, 'Sem datas, campo fica vazio para preenchimento humano.');
console.log('✓ Seção renderiza com data prefillada e avisos honestos.');

console.log('\n>>> CONFERENCIA DE PRAZO NA PUBLICACAO: PASS <<<\n');
