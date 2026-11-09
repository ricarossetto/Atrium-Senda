import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepareUiV2Page, startUiV2Session, switchUiV2View } from './ui_v2_helpers.mjs';
import { buildCivelCalculation } from '../lib/calc/civel.mjs';
import { buildTrabalhistaCalculation } from '../lib/calc/trabalhista.mjs';
import { buildPrevidenciarioCalculation } from '../lib/calc/previdenciario.mjs';
import { calcularPeriodoGraca, calcularTempoContribuicao } from '../lib/calc/tempo-contribuicao.mjs';
import { normalizeSgsRows } from '../lib/calc/indices.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT = path.join(ROOT, 'artifacts', 'visual-qa', 'ui-v2-calculations');
fs.mkdirSync(OUTPUT, { recursive: true });

const IPCA = normalizeSgsRows([
  { data: '31/01/2026', valor: '0.50' },
  { data: '28/02/2026', valor: '0.40' },
  { data: '31/03/2026', valor: '0.30' },
  { data: '30/04/2026', valor: '0.20' }
], 'fixture');
const TAXA_LEGAL = new Map([
  ['2026-01', '0.500000'],
  ['2026-02', '0.500000'],
  ['2026-03', '0.400000'],
  ['2026-04', '0.400000']
].map(([period, value]) => [period, normalizeSgsRows([{ data: `01/${period.slice(5)}/${period.slice(0, 4)}`, valor: value }], 'taxa')[0].value]));

const calculo = buildCivelCalculation({
  atualizacaoAte: '2026-04-20',
  correcao: { serie: 'IPCA' },
  juros: { tipo: 'taxa-legal' },
  multa: { percentual: '10', base: 'debitos-atualizados' },
  honorarios: { percentual: '10', base: 'debitos-atualizados' },
  itens: [
    { id: 'principal', especie: 'debito', descricao: 'Dano material sintético', data: '2026-01-15', valor: '1000.00' },
    { id: 'custas', especie: 'custas', descricao: 'Custas sintéticas', data: '2026-02-10', valor: '100.00' },
    { id: 'pagamento', especie: 'amortizacao', descricao: 'Pagamento parcial sintético', data: '2026-02-10', valor: '200.00' }
  ]
}, { seriesRows: () => IPCA, taxaLegalRates: () => TAXA_LEGAL });

const trabalhistaCalculo = buildTrabalhistaCalculation({
  salario: '3000.00',
  admissao: '2024-03-10',
  desligamento: '2026-04-15',
  tipoDesligamento: 'sem_justa_causa',
  diasTrabalhados: 15,
  aviso: 'indenizado',
  feriasVencidas: 1,
  saldoFgts: '10000.00',
  descontos: [{ descricao: 'INSS informado', valor: '120.00' }]
});

const previdenciarioCalculo = buildPrevidenciarioCalculation({
  sexo: 'feminino',
  dataNascimento: '1966-03-01',
  dataReferencia: '2026-09-18',
  corrigirSalarios: true,
  referenciaCorrecao: '2025-02',
  competencias: [
    { competencia: '2004-01', salario: '3000.00' },
    { competencia: '2004-02', salario: '2000.00' },
    { competencia: '2004-03', salario: '2000.00' }
  ],
  piso: '1518.00'
});

const tempoCalculo = calcularTempoContribuicao({
  dataReferencia: '2026-01-31',
  vinculos: [
    { inicio: '2015-01-01', fim: '2024-12-31', empresa: 'Empresa Teste' },
    { inicio: '2024-06-01', fim: '2025-03-31', tipo: 'contribuinte_individual' }
  ]
});
const qualidadeCalculo = calcularPeriodoGraca({
  ultimaContribuicao: '2025-06-15',
  contribuicoesMeses: 130,
  dataReferencia: '2026-01-31'
});

const SCENARIOS = [
  { file: '01-light-1440x900-form.png', theme: 'light', viewport: { width: 1440, height: 900 }, state: 'form' },
  { file: '02-dark-1440x900-form.png', theme: 'dark', viewport: { width: 1440, height: 900 }, state: 'form' },
  { file: '03-light-1440x900-result.png', theme: 'light', viewport: { width: 1440, height: 900 }, state: 'result' },
  { file: '04-dark-1440x900-result.png', theme: 'dark', viewport: { width: 1440, height: 900 }, state: 'result' },
  { file: '05-light-1280x800-result.png', theme: 'light', viewport: { width: 1280, height: 800 }, state: 'result' },
  { file: '06-dark-1024x768-form.png', theme: 'dark', viewport: { width: 1024, height: 768 }, state: 'form' },
  { file: '07-light-390x844-form.png', theme: 'light', viewport: { width: 390, height: 844 }, state: 'form' },
  { file: '08-dark-390x844-result.png', theme: 'dark', viewport: { width: 390, height: 844 }, state: 'result' },
  { file: '09-light-1440x900-trabalhista-result.png', theme: 'light', viewport: { width: 1440, height: 900 }, state: 'trab-result' },
  { file: '10-dark-390x844-trabalhista-result.png', theme: 'dark', viewport: { width: 390, height: 844 }, state: 'trab-result' },
  { file: '11-light-390x844-trabalhista-form.png', theme: 'light', viewport: { width: 390, height: 844 }, state: 'trab-form' },
  { file: '12-light-1440x900-previdenciario-result.png', theme: 'light', viewport: { width: 1440, height: 900 }, state: 'prev-result' },
  { file: '13-dark-390x844-previdenciario-result.png', theme: 'dark', viewport: { width: 390, height: 844 }, state: 'prev-result' },
  { file: '14-light-390x844-previdenciario-form.png', theme: 'light', viewport: { width: 390, height: 844 }, state: 'prev-form' },
  { file: '15-light-1440x900-salvos.png', theme: 'light', viewport: { width: 1440, height: 900 }, state: 'saved' },
  { file: '16-dark-390x844-salvos.png', theme: 'dark', viewport: { width: 390, height: 844 }, state: 'saved' },
  { file: '17-light-1440x900-cnis.png', theme: 'light', viewport: { width: 1440, height: 900 }, state: 'cnis' },
  { file: '18-light-1440x900-tempo.png', theme: 'light', viewport: { width: 1440, height: 900 }, state: 'prev-tempo' },
  { file: '19-dark-390x844-tempo.png', theme: 'dark', viewport: { width: 390, height: 844 }, state: 'prev-tempo' }
];

const session = await startUiV2Session();
const hashes = new Set();
let assertions = 0;
try {
  for (const scenario of SCENARIOS) {
    const context = await session.createContext({ viewport: scenario.viewport });
    try {
      const { page, pageErrors } = await prepareUiV2Page(context, session.server.baseUrl, { theme: scenario.theme });
      await page.route('**/api/calc/civel/preview', route => route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, calculo })
      }));
      await page.route('**/api/calc/trabalhista/preview', route => route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, calculo: trabalhistaCalculo })
      }));
      await page.route('**/api/calc/previdenciario/preview', route => route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, calculo: previdenciarioCalculo })
      }));
      await page.route('**/api/calc/tempo/preview', route => route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, tempo: tempoCalculo, qualidade: qualidadeCalculo })
      }));
      await switchUiV2View(page, 'calculations');
      await page.locator('#calculationsWorkspace .calc-surface').waitFor();

      if (scenario.state === 'result') {
        await page.locator('[data-calc-field="atualizacaoAte"]').fill('2026-04-20');
        await page.locator('[data-item-field="data"]').first().fill('2026-01-15');
        await page.locator('[data-item-field="valor"]').first().fill('1000');
        await page.locator('#calcForm button[type="submit"]').click();
        await page.locator('.calc-summary .calc-tile.is-total strong').waitFor();
      }
      if (scenario.state === 'trab-form' || scenario.state === 'trab-result') {
        await page.locator('[data-calc-action="tab"][data-tab="trabalhista"]').click();
        await page.locator('[data-trab-field="salario"]').waitFor();
      }
      if (scenario.state === 'trab-result') {
        await page.locator('[data-trab-field="salario"]').fill('3000');
        await page.locator('[data-trab-field="admissao"]').fill('2024-03-10');
        await page.locator('[data-trab-field="desligamento"]').fill('2026-04-15');
        await page.locator('[data-trab-field="saldoFgts"]').fill('10000');
        await page.locator('#calcForm button[type="submit"]').click();
        await page.locator('.calc-summary .calc-tile.is-total strong').waitFor();
      }
      if (scenario.state === 'prev-form' || scenario.state === 'prev-result' || scenario.state === 'cnis') {
        await page.locator('[data-calc-action="tab"][data-tab="previdenciario"]').click();
        /* A aba abre no hub de fluxos; o formulário do RMI está no fluxo `rmi`. */
        await page.locator('[data-prev-card="rmi"] [data-calc-action="prev-abrir"]').click();
        await page.locator('[data-prev-field="sexo"]').waitFor();
      }
      if (scenario.state === 'prev-result') {
        await page.locator('[data-competencia-field="competencia"][data-competencia-index="0"]').fill('2024-01');
        await page.locator('[data-competencia-field="salario"][data-competencia-index="0"]').fill('2000');
        await page.locator('#calcForm button[type="submit"]').click();
        await page.locator('.calc-summary .calc-tile.is-total strong').waitFor();
      }
      if (scenario.state === 'saved') {
        await page.locator('[data-calc-field="atualizacaoAte"]').fill('2026-04-20');
        await page.locator('[data-item-field="data"]').first().fill('2026-01-15');
        await page.locator('[data-item-field="valor"]').first().fill('1000');
        await page.locator('#calcForm button[type="submit"]').click();
        await page.locator('.calc-summary .calc-tile.is-total strong').waitFor();
        await page.locator('[data-calc-action="salvar"]:not([disabled])').click();
        await page.locator('[data-calc-saved]').first().waitFor();
      }
      if (scenario.state === 'cnis') {
        await page.locator('.calc-import summary', { hasText: 'Importar do CNIS' }).click();
        await page.locator('[data-prev-field="textoCnis"]').fill([
          'Extrato Previdenciário (CNIS) - fixture',
          'Empresa Exemplo - 01/2024 1.234,56',
          'Empresa Exemplo - 02/2024 2.000,00',
          'Empresa Exemplo - 03/2024 1.500,00'
        ].join('\n'));
        await page.locator('[data-calc-action="importar-cnis"]').click();
        await page.locator('[data-competencia-row="2"]').waitFor();
      }
      if (scenario.state === 'prev-tempo') {
        await page.locator('[data-calc-action="tab"][data-tab="previdenciario"]').click();
        /* Tempo e qualidade são um fluxo próprio do hub. */
        await page.locator('[data-prev-card="tempo"] [data-calc-action="prev-abrir"]').click();
        await page.locator('[data-tempo-vinculo-field="inicio"][data-vinculo-index="0"]').fill('2015-01-01');
        await page.locator('[data-tempo-vinculo-field="fim"][data-vinculo-index="0"]').fill('2024-12-31');
        await page.locator('[data-tempo-field="dataReferencia"]').fill('2026-01-31');
        await page.locator('[data-tempo-field="ultimaContribuicao"]').fill('2025-06-15');
        await page.locator('[data-tempo-field="contribuicoesMeses"]').fill('130');
        await page.locator('[data-calc-action="calcular-tempo"]').click();
        await page.locator('[data-vinculo-resultado="1"]').waitFor();
      }
      await page.waitForTimeout(240);

      const layout = await page.evaluate(() => {
        const ids = [...document.querySelectorAll('[id]')].map(element => element.id);
        const workspace = document.getElementById('calculationsWorkspace');
        const surface = document.querySelector('#calculationsWorkspace .calc-surface');
        const surfaceRect = surface?.getBoundingClientRect();
        const total = document.querySelector('.calc-tile.is-total strong')?.textContent?.trim() || null;
        const buttons = [...document.querySelectorAll('#view-calculations button')].filter(button => button.getClientRects().length);
        return {
          active: document.getElementById('view-calculations').classList.contains('active'),
          ui: document.documentElement.dataset.ui,
          pageOverflow: document.documentElement.scrollWidth - innerWidth,
          duplicateIds: ids.filter((id, index) => ids.indexOf(id) !== index),
          heading: document.getElementById('calculationsHeading')?.textContent?.trim() || null,
          total,
          surface: surfaceRect ? { left: surfaceRect.left, right: surfaceRect.right, width: innerWidth } : null,
          hasForm: Boolean(document.getElementById('calcForm')),
          temResultado: Boolean(document.querySelector('#view-calculations .calc-result')),
          memorialOpen: Boolean(document.querySelector('.calc-memorial details')),
          salvos: document.querySelectorAll('[data-calc-saved]').length,
          competencias: document.querySelectorAll('[data-competencia-row]').length,
          temTransicoes: document.body.textContent.includes('Regras de transição (EC 103/2019)'),
          temCorrecao: Boolean(document.querySelector('[data-calc-correcao]')),
          linhasCorrecao: document.querySelectorAll('[data-correcao-row]').length,
          descartadasCorrecao: document.querySelectorAll('[data-correcao-row].is-descartada').length,
          vinculosResultado: document.querySelectorAll('[data-vinculo-resultado]').length,
          temQualidade: document.body.textContent.includes('Qualidade de segurado'),
          periodoGraca: document.body.textContent.includes('2027-06-30'),
          moneyAlign: (() => {
            const input = document.querySelector('.calc-items .calc-money input');
            return input ? getComputedStyle(input).textAlign : null;
          })(),
          controlBackground: (() => {
            const select = document.querySelector('#calcForm .calc-field select');
            return select ? getComputedStyle(select).backgroundColor : null;
          })(),
          cardBackground: (() => {
            const card = document.querySelector('#view-calculations .calc-surface');
            return card ? getComputedStyle(card).backgroundColor : null;
          })(),
          checkboxBorderRadius: (() => {
            const box = document.querySelector('#calcForm .calc-check input');
            return box ? getComputedStyle(box).borderRadius : null;
          })(),
          undersized: innerWidth <= 760 ? buttons.filter(button => {
            const rect = button.getBoundingClientRect();
            return rect.width < 43.5 || rect.height < 43.5;
          }).map(button => button.getAttribute('aria-label') || button.textContent.trim()) : []
        };
      });

      assert.equal(layout.active, true); assertions++;
      assert.equal(layout.ui, 'v2'); assertions++;
      /* A aba Previdenciário tem cabeçalho próprio (é uma área com fluxos, não "mais
       * uma aba"); as demais mantêm o título do escritório. */
      const tituloEsperado = scenario.state === 'prev-form' || scenario.state === 'prev-result' || scenario.state === 'prev-tempo' || scenario.state === 'cnis'
        ? 'Cálculo previdenciário'
        : 'Cálculos do escritório';
      assert.equal(layout.heading, tituloEsperado, `${scenario.file}: título da superfície.`); assertions++;
      const estadosResultado = ['result', 'trab-result', 'prev-result', 'prev-tempo', 'saved'];
      if (estadosResultado.includes(scenario.state)) {
        assert.equal(layout.hasForm, false, `${scenario.file}: tela de resultado não deve repetir o formulário.`); assertions++;
        assert.equal(layout.temResultado, true, `${scenario.file}: tela de resultado ausente.`); assertions++;
      } else {
        assert.equal(layout.hasForm, true); assertions++;
        assert.equal(layout.temResultado, false, `${scenario.file}: formulário não deve exibir painel de resultado.`); assertions++;
      }
      assert.ok(layout.pageOverflow <= 2, `${scenario.file}: overflow global ${layout.pageOverflow}px.`); assertions++;
      assert.deepEqual(layout.duplicateIds, []); assertions++;
      assert.ok(layout.surface && layout.surface.left >= -2 && layout.surface.right <= layout.surface.width + 2, `${scenario.file}: superfície fora do viewport.`); assertions++;
      assert.deepEqual(layout.undersized, [], `${scenario.file}: targets mobile abaixo de 44px.`); assertions++;
      if (scenario.state === 'result' || scenario.state === 'trab-result' || scenario.state === 'prev-result') {
        assert.ok(layout.total && layout.total.length > 0, `${scenario.file}: total ausente.`); assertions++;
        assert.equal(layout.memorialOpen, true); assertions++;
      }
      if (scenario.state === 'prev-result') {
        assert.equal(layout.temTransicoes, true, `${scenario.file}: comparador EC 103 ausente.`); assertions++;
        assert.equal(layout.temCorrecao, true, `${scenario.file}: tabela de correção ausente.`); assertions++;
        assert.equal(layout.linhasCorrecao, 3, `${scenario.file}: fixture de correção deve listar as 3 competências.`); assertions++;
        assert.equal(layout.descartadasCorrecao, 1, `${scenario.file}: descarte dos 20% deve marcar 1 de 3.`); assertions++;
      }
      if (scenario.state === 'saved') {
        assert.ok(layout.salvos > 0, `${scenario.file}: cálculo salvo não aparece na lista.`); assertions++;
      }
      if (scenario.state === 'cnis') {
        assert.ok(layout.competencias >= 3, `${scenario.file}: competências importadas não preencheram a tabela.`); assertions++;
      }
      if (scenario.state === 'prev-tempo') {
        assert.equal(layout.vinculosResultado, 2, `${scenario.file}: vínculos processados ausentes.`); assertions++;
        assert.equal(layout.temQualidade, true, `${scenario.file}: qualidade de segurado ausente.`); assertions++;
        assert.equal(layout.periodoGraca, true, `${scenario.file}: fim do período de graça incorreto.`); assertions++;
      }
      assert.deepEqual(pageErrors, [], `${scenario.file}: erros de página.`); assertions++;
      if (layout.moneyAlign) {
        assert.equal(layout.moneyAlign, 'right', `${scenario.file}: valor monetário deve acompanhar o cabeçalho à direita.`); assertions++;
      }
      if (scenario.theme === 'light' && layout.controlBackground) {
        assert.equal(layout.controlBackground, 'rgb(250, 250, 248)', `${scenario.file}: controle no tema claro deve usar a superfície do card, não o cinza inset.`); assertions++;
      }
      if (layout.checkboxBorderRadius) {
        assert.match(layout.checkboxBorderRadius, /px/, `${scenario.file}: checkbox deve usar o desenho próprio do sistema.`); assertions++;
      }

      const output = path.join(OUTPUT, scenario.file);
      await page.screenshot({ path: output, fullPage: false });
      hashes.add(crypto.createHash('sha256').update(fs.readFileSync(output)).digest('hex'));
    } finally {
      await context.close();
    }
  }
  assert.equal(hashes.size, SCENARIOS.length, 'Screenshots duplicados entre cenários distintos.');
  console.log(`Visual dos cálculos aprovado: ${SCENARIOS.length} cenários, ${assertions} assertivas, temas, viewports e resultado PASS.`);
} finally {
  await session.stop();
}
