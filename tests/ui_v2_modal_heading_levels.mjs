import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// O título de cada modal começa no nível 2 e os subtítulos não pulam nível para quem usa leitor de tela.
const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const ids = ['geminiKeyBackdrop', 'financialEntryBackdrop', 'emailConfigBackdrop', 'emailTestBackdrop', 'publicationEmailBackdrop', 'discardPublicationBackdrop', 'treatPublicationBackdrop', 'emailReceiverModalBackdrop', 'inpiPanelBackdrop'];
const backdrops = [...html.matchAll(/<div class="modal-backdrop[^"]*"[^>]*id="([^"]+)"/g)];
for (const id of ids) {
  const index = backdrops.findIndex(match => match[1] === id);
  assert.notEqual(index, -1, `modal ${id} não encontrado`);
  const start = backdrops[index].index;
  const section = html.slice(start, backdrops[index + 1]?.index ?? start + 40_000);
  const levels = [...section.matchAll(/<h([1-6])\b([^>]*)>/g)].map(match => Number(match[2].match(/aria-level="(\d)"/)?.[1] || match[1]));
  assert.equal(levels[0], 2, `${id}: primeiro título em nível ${levels[0]}`);
  levels.forEach((level, position) => {
    if (position) assert.ok(level - levels[position - 1] <= 1, `${id}: salto de nível em ${levels.join(',')}`);
  });
}
console.log('[PASS] Níveis de título dos modais.');
