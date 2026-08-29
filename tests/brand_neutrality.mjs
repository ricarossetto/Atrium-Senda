import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  EXTERNAL_CALENDAR_SOURCE_ID,
  LEGACY_EXTERNAL_CALENDAR_SOURCE_ID,
  Store
} from '../js/core/store.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SELF = 'tests/brand_neutrality.mjs';

const forbiddenBrands = [
  { name: 'dashboard-reference', pattern: /astrea/gi },
  { name: 'calendar-reference', pattern: /advbox/gi },
  { name: 'management-reference', pattern: /projuris/gi },
  { name: 'suite-reference', pattern: /legal one|legal-one|legalone/gi },
  { name: 'inherited-task-term', pattern: /taskscore/gi }
];

const trackedFiles = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { cwd: ROOT })
  .toString('utf8')
  .split('\0')
  .filter(Boolean)
  .map(file => file.replaceAll('\\', '/'))
  .filter(file => existsSync(path.join(ROOT, file)));

const isTraceabilityWord = (source, index) => {
  const isLetter = character => Boolean(character && /\p{L}/u.test(character));
  let start = index;
  let end = index;
  while (start > 0 && isLetter(source[start - 1])) start--;
  while (end < source.length && isLetter(source[end])) end++;
  return source.slice(start, end).toLocaleLowerCase('pt-BR').startsWith('rastrea');
};

const violations = [];
const legacyMatches = [];

for (const file of trackedFiles) {
  if (file === SELF) continue;

  for (const forbidden of forbiddenBrands) {
    forbidden.pattern.lastIndex = 0;
    if (forbidden.pattern.test(file)) {
      violations.push(`${file}: nome de arquivo contém ${forbidden.name}`);
    }
  }

  const buffer = readFileSync(path.join(ROOT, file));
  if (buffer.includes(0)) continue;
  const source = buffer.toString('utf8');

  for (const forbidden of forbiddenBrands) {
    forbidden.pattern.lastIndex = 0;
    for (const match of source.matchAll(forbidden.pattern)) {
      if (forbidden.name === 'dashboard-reference' && isTraceabilityWord(source, match.index)) continue;

      const lineNumber = source.slice(0, match.index).split('\n').length;
      const line = source.split('\n')[lineNumber - 1] || '';
      const isAuthorizedLegacyAlias = forbidden.name === 'calendar-reference'
        && file === 'js/core/store.js'
        && line.includes('LEGACY_EXTERNAL_CALENDAR_SOURCE_ID');

      if (isAuthorizedLegacyAlias) {
        legacyMatches.push({ file, lineNumber });
      } else {
        violations.push(`${file}:${lineNumber}: referência proibida (${forbidden.name})`);
      }
    }
  }
}

assert.deepEqual(violations, [], `Referências concorrenciais encontradas:\n${violations.join('\n')}`);
assert.deepEqual(
  legacyMatches,
  [{ file: 'js/core/store.js', lineNumber: legacyMatches[0]?.lineNumber }],
  'O alias legado do calendário deve existir exatamente uma vez e apenas no Store canônico.'
);

const htmlSource = readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const cssSource = readFileSync(path.join(ROOT, 'css/portal.css'), 'utf8');
const portalSource = readFileSync(path.join(ROOT, 'js/portal.js'), 'utf8');

const htmlSelectorContracts = [
  ['dashboard-workspace-wrap', 'class'],
  ['dashboard-tasks-column', 'class'],
  ['dashboard-widgets-column', 'class'],
  ['dashboard-widget', 'class'],
  ['dashboard-reminders-list', 'class']
];

for (const [selector, type] of htmlSelectorContracts) {
  assert.match(htmlSource, new RegExp(`${type}="[^"]*\\b${selector}\\b`), `HTML não usa ${selector}.`);
  assert.match(cssSource, new RegExp(`\\.${selector}\\b`), `CSS não cobre ${selector}.`);
}

for (const selector of ['dashboard-task-item', 'dashboard-task-title', 'dashboard-reminder-item']) {
  assert.match(portalSource, new RegExp(`class="[^"]*\\b${selector}\\b`), `Portal não renderiza ${selector}.`);
  assert.match(cssSource, new RegExp(`\\.${selector}\\b`), `CSS não cobre ${selector}.`);
}

for (const id of ['dashboardTaskCount', 'dashboardTaskSortSelect', 'dashboardTaskFilters', 'dashboardTaskList', 'dashboardRemindersList']) {
  assert.match(htmlSource, new RegExp(`id="${id}"`), `HTML não contém ${id}.`);
  assert.match(portalSource, new RegExp(`['"]${id}['"]`), `Portal não consome ${id}.`);
}

assert.match(htmlSource, /data-dashboard-task-filter="all"/);
assert.match(portalSource, /button\[data-dashboard-task-filter\]/);
assert.match(portalSource, /dataset\.dashboardTaskFilter/);
assert.match(portalSource, /data-dashboard-task-id/);
assert.match(portalSource, /dataset\.dashboardTaskId/);
assert.match(portalSource, /renderDashboardTasks\(\)/);
assert.match(portalSource, /renderDashboardWidgets\(\)/);
assert.match(portalSource, /renderDashboardFinancialWidgets:\s*\(\)\s*=>\s*App\.renderDashboardWidgets\(\)/);
assert.match(portalSource, /data-complete-task-id/);
assert.match(portalSource, /data-agenda-id/);
assert.match(cssSource, /\[data-theme="light"\]\s+\.dashboard-task-item/);
assert.match(cssSource, /@media\s*\(max-width:\s*1100px\)[\s\S]*?\.dashboard-workspace-wrap/);

const stateWithSources = sources => ({
  terms: [],
  sources,
  intimations: [],
  tasks: [],
  processes: [],
  agenda: [],
  audit: [],
  contacts: [],
  leads: [],
  customPrompts: [],
  customLinks: [],
  configuration: {},
  settings: {}
});

const originalState = Store.state;
const originalOfficeDefaults = globalThis.OFFICE_DEFAULT_DATA;

try {
  globalThis.OFFICE_DEFAULT_DATA = {};

  Store.state = stateWithSources([{
    id: LEGACY_EXTERNAL_CALENDAR_SOURCE_ID,
    name: 'Agenda operacional antiga',
    short: 'CAL',
    method: 'iCal protegido',
    status: 'ok',
    lastCheck: '2026-08-28T12:00:00.000Z',
    detail: 'Conexão operacional preservada',
    manualNote: 'Campo manual preservado'
  }]);
  Store.ensureShape();
  let calendar = Store.state.sources.find(source => source.id === EXTERNAL_CALENDAR_SOURCE_ID);
  assert.ok(calendar, 'Estado somente legado não gerou o calendário canônico.');
  assert.equal(Store.state.sources.some(source => source.id === LEGACY_EXTERNAL_CALENDAR_SOURCE_ID), false);
  assert.equal(calendar.status, 'ok');
  assert.equal(calendar.lastCheck, '2026-08-28T12:00:00.000Z');
  assert.equal(calendar.detail, 'Conexão operacional preservada');
  assert.equal(calendar.method, 'iCal protegido');
  assert.equal(calendar.name, 'Agenda operacional antiga');
  assert.equal(calendar.manualNote, 'Campo manual preservado');

  const canonicalOnly = {
    id: EXTERNAL_CALENDAR_SOURCE_ID,
    name: 'Agenda canônica personalizada',
    short: 'EXT',
    method: 'Webcal',
    status: 'attention',
    lastCheck: '2026-08-29T10:00:00.000Z',
    detail: 'Registro canônico intacto'
  };
  Store.state = stateWithSources([structuredClone(canonicalOnly)]);
  Store.ensureShape();
  calendar = Store.state.sources.find(source => source.id === EXTERNAL_CALENDAR_SOURCE_ID);
  assert.deepEqual(calendar, canonicalOnly, 'Estado somente canônico foi alterado indevidamente.');

  Store.state = stateWithSources([
    {
      id: LEGACY_EXTERNAL_CALENDAR_SOURCE_ID,
      name: 'Agenda operacional migrada',
      short: 'MIG',
      method: 'iCal autenticado',
      status: 'ok',
      lastCheck: '2026-08-29T14:00:00.000Z',
      detail: 'Dados operacionais mais recentes',
      legacyOnlyField: 'preservado'
    },
    {
      id: EXTERNAL_CALENDAR_SOURCE_ID,
      name: 'Agenda Externa (Webcal)',
      short: 'CAL',
      method: 'Webcal/iCal',
      status: 'planned',
      lastCheck: '2026-08-28T10:00:00.000Z',
      detail: 'Sincronize com Google Agenda, Outlook ou Apple',
      canonicalOnlyField: 'preservado'
    }
  ]);
  Store.ensureShape();
  const calendars = Store.state.sources.filter(source => source.id === EXTERNAL_CALENDAR_SOURCE_ID);
  assert.equal(calendars.length, 1, 'Registros duplos não foram consolidados.');
  calendar = calendars[0];
  assert.equal(Store.state.sources.some(source => source.id === LEGACY_EXTERNAL_CALENDAR_SOURCE_ID), false);
  assert.equal(calendar.name, 'Agenda operacional migrada');
  assert.equal(calendar.short, 'MIG');
  assert.equal(calendar.method, 'iCal autenticado');
  assert.equal(calendar.status, 'ok');
  assert.equal(calendar.lastCheck, '2026-08-29T14:00:00.000Z');
  assert.equal(calendar.detail, 'Dados operacionais mais recentes');
  assert.equal(calendar.legacyOnlyField, 'preservado');
  assert.equal(calendar.canonicalOnlyField, 'preservado');

  Store.state = stateWithSources([
    { id: LEGACY_EXTERNAL_CALENDAR_SOURCE_ID, status: 'attention', detail: 'Requer conferência' },
    { id: EXTERNAL_CALENDAR_SOURCE_ID, status: 'planned', detail: 'Sincronize com Google Agenda, Outlook ou Apple' }
  ]);
  Store.ensureShape();
  calendar = Store.state.sources.find(source => source.id === EXTERNAL_CALENDAR_SOURCE_ID);
  assert.equal(calendar.status, 'attention', 'Status operacional foi substituído pelo default sem critério de recência.');

  Store.state = stateWithSources([]);
  Store.ensureShape();
  assert.equal(Store.state.sources.filter(source => source.id === EXTERNAL_CALENDAR_SOURCE_ID).length, 1);
  assert.equal(Store.state.sources.some(source => source.id === LEGACY_EXTERNAL_CALENDAR_SOURCE_ID), false);
} finally {
  Store.state = originalState;
  if (originalOfficeDefaults === undefined) delete globalThis.OFFICE_DEFAULT_DATA;
  else globalThis.OFFICE_DEFAULT_DATA = originalOfficeDefaults;
}

console.log('✓ Neutralidade de marca aprovada: árvore rastreada, UI, seletores, documentação, guardrail e migração canônica do calendário.');
