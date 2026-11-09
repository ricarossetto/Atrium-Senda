import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { checkPage } from 'lintapple';
import {
  startUiV2Session,
  prepareUiV2Page,
  switchUiV2View,
  prepareUiV2TasksFixture,
  prepareUiV2ProcessesFixture,
  prepareUiV2PublicationsFixture,
  prepareUiV2ContactsFixture,
  prepareUiV2FinancialFixture,
  prepareUiV2EmailCalendarFixture,
  prepareUiV2ConfigurationAdminFixture,
  prepareUiV2AuditFixture,
  prepareUiV2LinksFixture,
  prepareUiV2AgendaFixture,
  prepareUiV2LeadsFixture,
  prepareUiV2DocumentsFixture,
  prepareUiV2AssistantFixture,
  prepareUiV2PromptsFixture,
  prepareUiV2MonitoringFixture,
  prepareUiV2ImporterFixture
} from './ui_v2_helpers.mjs';

console.log('=== Política de interface (lintapple): superfícies autenticadas ===');

const root = new URL('..', import.meta.url);
const policy = JSON.parse(await readFile(new URL('ui-policy.json', root), 'utf8'));
const budgetFile = JSON.parse(await readFile(new URL('tests/ui-policy-debt-budget.json', root), 'utf8'));
const budget = Number(budgetFile.budget);

const CASES = [
  { view: 'dashboard', fixtures: [] },
  { view: 'kanban', fixtures: [prepareUiV2TasksFixture] },
  { view: 'processes', fixtures: [prepareUiV2ProcessesFixture] },
  { view: 'inbox', fixtures: [prepareUiV2PublicationsFixture] },
  { view: 'reports', fixtures: [prepareUiV2TasksFixture, prepareUiV2FinancialFixture] },
  { view: 'contacts', fixtures: [prepareUiV2ContactsFixture] },
  { view: 'agenda', fixtures: [prepareUiV2AgendaFixture] },
  { view: 'financial', fixtures: [prepareUiV2FinancialFixture] },
  { view: 'integrations', fixtures: [prepareUiV2EmailCalendarFixture] },
  { view: 'monitoring', fixtures: [prepareUiV2MonitoringFixture] },
  { view: 'documents', fixtures: [prepareUiV2DocumentsFixture] },
  { view: 'leads', fixtures: [prepareUiV2LeadsFixture] },
  { view: 'links', fixtures: [prepareUiV2LinksFixture] },
  { view: 'prompts', fixtures: [] },
  { view: 'assistant', fixtures: [] },
  { view: 'importer', fixtures: [prepareUiV2ImporterFixture] },
  { view: 'audit', fixtures: [prepareUiV2AuditFixture] },
  { view: 'configuration', fixtures: [prepareUiV2ConfigurationAdminFixture] },
  { view: 'admin', fixtures: [prepareUiV2ConfigurationAdminFixture] }
];

const session = await startUiV2Session();
const findings = [];
const audited = [];

try {
  for (const theme of ['light', 'dark']) {
    const context = await session.createContext({ viewport: { width: 1440, height: 900 } });
    try {
      const { page, pageErrors } = await prepareUiV2Page(context, session.server.baseUrl, { theme });
      for (const testCase of CASES) {
        for (const fixture of testCase.fixtures) {
          try {
            await fixture(page);
          } catch (error) {
            console.log(`  ! fixture falhou em ${testCase.view}: ${error.message.split('\n')[0]}`);
          }
        }
        try {
          await switchUiV2View(page, testCase.view);
        } catch (error) {
          console.log(`  ! view inacessível ${testCase.view}: ${error.message.split('\n')[0]}`);
          continue;
        }
        // Sincronização real: rede e DOM precisam estar ociosos juntos. O app
        // popula superfícies em ondas (render dispara novos GETs), então
        // networkidle e DOM estável se alternam até convergir.
        await page.evaluate(async () => {
          const stable = async () => {
            let last = -1;
            for (let i = 0; i < 60; i += 1) {
              const count = document.getElementsByTagName('*').length;
              if (count === last) return true;
              last = count;
              await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
            }
            return false;
          };
          for (let round = 0; round < 6; round += 1) {
            const settled = await stable();
            await new Promise(resolve => setTimeout(resolve, 150));
            const again = await stable();
            if (settled && again) return;
          }
        });
        const report = await checkPage(page, policy);
        audited.push(`${theme}/${testCase.view}`);
        for (const finding of report.findings) findings.push({ ...finding, theme, view: testCase.view });
      }
      assert.deepEqual(pageErrors, [], `Erros de página na auditoria ${theme}.`);
    } finally {
      await context.close();
    }
  }
} finally {
  await session.stop();
}

const groups = {};
for (const finding of findings) {
  const key = `${finding.rule} @ ${finding.view}/${finding.theme}`;
  groups[key] = groups[key] || [];
  groups[key].push(finding);
}

if (process.env.REPORT) {
  const { writeFile } = await import('node:fs/promises');
  await writeFile(process.env.REPORT, JSON.stringify({ audited, findings, groups }, null, 1), 'utf8');
  console.log(`relatório gravado em ${process.env.REPORT} (${findings.length} achados)`);
}

console.log(`\nViews auditadas: ${audited.length} (${new Set(audited.map(a => a.split('/')[1])).size} views × 2 temas)`);
console.log(`Total de achados: ${findings.length}\n`);

const summary = {};
for (const finding of findings) summary[finding.rule] = (summary[finding.rule] || 0) + 1;
console.log('Por regra:');
for (const [rule, count] of Object.entries(summary).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(count).padStart(6)}  ${rule}`);
}
console.log('');

// Orçamento de dívida: o gate falha se a dívida CRESCE. O valor só pode descer
// (tests/ui-policy-debt-budget.json), e cada redução exige correção real.
if (!Number.isInteger(budget) || budget < 0) {
  console.error('tests/ui-policy-debt-budget.json precisa declarar budget inteiro e não negativo.');
  process.exit(2);
}
console.log(`Orçamento de dívida: ${findings.length} achados / teto ${budget} (${findings.length <= budget ? 'dentro' : 'ACIMA'})`);
if (process.env.UI_POLICY_DETAIL) {
  const groups = {};
  for (const finding of findings) {
    const key = `${finding.rule || finding.id} | ${finding.view} | ${String(finding.selector || finding.element || finding.target || '').split(' > ').slice(-2).join(' > ').slice(0, 80)} | ${String(finding.message || finding.detail || '').slice(0, 60)}`;
    groups[key] = (groups[key] || 0) + 1;
  }
  console.log(Object.entries(groups).sort((a, b) => b[1] - a[1]).slice(0, 70).map(([key, count]) => `${count} ${key}`).join('\n'));
}
if (findings.length > budget) {
  console.error(`\nA dívida de UI das superfícies autenticadas cresceu: ${findings.length} > ${budget}.`);
  console.error('Corrija as regressões antes de commitar; não aumente o teto.');
  for (const [rule, count] of Object.entries(summary).sort((a, b) => b[1] - a[1])) {
    console.error(`  ${String(count).padStart(6)}  ${rule}`);
  }
  process.exit(1);
}
if (findings.length > 0) {
  console.log('Dívida remanescente registrada; o teto só pode ser reduzido com correção real.');
}

if (process.env.VALUES) {
  const byRule = {};
  for (const finding of findings) byRule[finding.rule] = byRule[finding.rule] || new Map();
  for (const finding of findings) {
    const key = finding.actual.replace(/\s+/g, ' ').slice(0, 90);
    byRule[finding.rule].set(key, (byRule[finding.rule].get(key) || 0) + 1);
  }
  for (const [rule, map] of Object.entries(byRule).sort((a, b) => (summary[b[0]] || 0) - (summary[a[0]] || 0))) {
    console.log(`=== ${rule} ===`);
    for (const [value, count] of [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 22)) {
      console.log(`  ${String(count).padStart(5)}  ${value}`);
    }
    console.log('');
  }
}

if (!process.env.VALUES) {
  for (const [key, list] of Object.entries(groups).sort((a, b) => b[1].length - a[1].length)) {
    if (list.length < 5) continue;
    console.log(`${String(list.length).padStart(4)}  ${key}`);
    const seen = new Set();
    for (const finding of list) {
      const signature = `${finding.selector}|${finding.actual}`;
      if (seen.has(signature)) continue;
      seen.add(signature);
      console.log(`       ${finding.actual}  ·  ${finding.selector.replace(/^html > body:nth-of-type\(1\) > /, '').slice(0, 120)}`);
    }
    if (seen.size >= 12) console.log(`       … e mais ${list.length - seen.size} ocorrências`);
  }
}

assert.ok(findings.length <= budget, `Dívida de UI acima do teto: ${findings.length} > ${budget}.`);
console.log('\nui_policy_authenticated: PASS');
process.exit(0);
