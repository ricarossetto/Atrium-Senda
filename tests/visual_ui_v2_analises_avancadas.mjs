/**
 * Visual QA das três análises avançadas (projeção, pensão, qualidade de segurado).
 *
 * Diferente das suítes de UI com rota dublada, esta dirige a interface contra o
 * **servidor real**: clica os botões e deixa os motores responderem. O que aparece
 * no print é o resultado dos motores, não uma fixture.
 *
 * Execução: node tests/visual_ui_v2_analises_avancadas.mjs
 */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepareUiV2Page, startUiV2Session, switchUiV2View } from './ui_v2_helpers.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT = path.join(ROOT, 'artifacts', 'visual-qa', 'analises-avancadas');
fs.mkdirSync(OUTPUT, { recursive: true });

const CENARIOS = [
  { arquivo: '01-light-1280x800-projecao.png', tema: 'light', viewport: { width: 1280, height: 800 }, alvo: 'projecao' },
  { arquivo: '02-dark-1280x800-projecao.png', tema: 'dark', viewport: { width: 1280, height: 800 }, alvo: 'projecao' },
  { arquivo: '03-light-1280x800-pensao.png', tema: 'light', viewport: { width: 1280, height: 800 }, alvo: 'pensao' },
  { arquivo: '04-dark-390x844-qualidade.png', tema: 'dark', viewport: { width: 390, height: 844 }, alvo: 'qualidade' },
  { arquivo: '05-light-390x844-qualidade.png', tema: 'light', viewport: { width: 390, height: 844 }, alvo: 'qualidade' },
  { arquivo: '06-light-390x844-projecao.png', tema: 'light', viewport: { width: 390, height: 844 }, alvo: 'projecao' },
  { arquivo: '07-dark-1280x800-sem-regra.png', tema: 'dark', viewport: { width: 1280, height: 800 }, alvo: 'sem-regra' }
];

const session = await startUiV2Session();
const hashes = new Set();
let assertivas = 0;

/** Preenche os três cartões e executa os três motores contra o servidor real. */
async function exercitarAvancadas(page, { semRegra = false } = {}) {
  await page.locator('[data-av-card="projecao"]').waitFor();

  await page.locator('[data-av-field="projecao.sexo"]').selectOption('masculino');
  await page.locator('[data-av-field="projecao.dataNascimento"]').fill(semRegra ? '2006-01-01' : '1966-05-10');
  await page.locator('[data-av-field="projecao.dataReferencia"]').fill(semRegra ? '2026-01-31' : '2026-10-09');
  await page.locator('[data-av-field="projecao.primeiraCompetencia"]').fill(semRegra ? '2025-01' : '1996-06');
  await page.locator('[data-av-field="projecao.salarioContribuicao"]').fill('3000');
  await page.locator('[data-calc-action="projetar-aposentadoria"]').click();
  await page.locator('[data-av-card="projecao"] [data-av-status]').waitFor();
  await page.waitForTimeout(120);

  if (!semRegra) {
    await page.locator('[data-av-field="pensao.referenceDate"]').fill('2026-10-19');
    await page.locator('[data-av-field="pensao.referenceBase"]').fill('3000');
    await page.locator('[data-av-field="pensao.rendas"]').fill('4000.00\n2500.00\n1500.00');
    await page.locator('[data-calc-action="acumular-pensoes"]').click();
    await page.locator('[data-av-card="pensao"] [data-av-status]').waitFor();
    await page.waitForTimeout(120);

    await page.locator('[data-av-field="qualidade.insuredCategory"]').selectOption('facultative');
    await page.locator('[data-av-field="qualidade.ultimaContribuicao"]').fill('2026-05-10');
    await page.locator('[data-av-field="qualidade.contribuicoesMeses"]').fill('130');
    await page.locator('[data-av-field="qualidade.dataReferencia"]').fill('2026-09-30');
    // A feature escuta `input` no workspace: marcar via `.check()` não dispara o estado.
    await page.locator('[data-av-field="qualidade.parouDeContribuir"]').evaluate(elemento => {
      elemento.checked = true;
      elemento.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.locator('[data-calc-action="avaliar-qualidade"]').click();
    await page.locator('[data-av-card="qualidade"] [data-av-status]').waitFor();
    await page.waitForTimeout(120);
  }
}

/**
 * Espera o `#toastRegion` esvaziar antes de medir e fotografar.
 *
 * As três ações disparam um toast cada (`js/components/toast.js`, 4,3 s). No mobile
 * os três empilham sobre o próprio resultado — o print precisa do estado estável da
 * tela, não do instante em que o aviso ancora por cima do conteúdo. O empilhamento
 * segue registrado como observação do relatório.
 */
async function aguardarToastsSumirem(page) {
  await page.waitForFunction(
    () => (document.getElementById('toastRegion')?.children.length ?? 0) === 0,
    null,
    { timeout: 15000 }
  ).catch(() => {});
}

async function medir(page) {
  return page.evaluate(() => {
    const secao = document.querySelector('.calc-avancadas');
    const ids = [...document.querySelectorAll('[id]')].map(elemento => elemento.id);
    const recorte = elemento => {
      const caixa = elemento.getBoundingClientRect();
      return { largura: caixa.width, esquerda: caixa.left, direita: caixa.right };
    };
    const botoes = [...document.querySelectorAll('.calc-avancadas button')].filter(botao => botao.getClientRects().length);
    const cartoes = [...document.querySelectorAll('[data-av-card]')];
    return {
      ui: document.documentElement.dataset.ui,
      overflow: document.documentElement.scrollWidth - innerWidth,
      idsDuplicados: ids.filter((id, indice) => ids.indexOf(id) !== indice),
      secao: Boolean(secao),
      cartoes: cartoes.length,
      larguras: cartoes.map(cartao => recorte(cartao).largura),
      foraDoViewport: cartoes.filter(cartao => {
        const caixa = recorte(cartao);
        return caixa.esquerda < -1 || caixa.direita > innerWidth + 1;
      }).length,
      sobrepostos: cartoes.some((cartao, indice) => {
        const outro = cartoes[indice + 1];
        if (!outro) return false;
        return cartao.getBoundingClientRect().bottom > outro.getBoundingClientRect().top + 1;
      }),
      alvosPequenos: innerWidth <= 760
        ? botoes.filter(botao => {
          const caixa = botao.getBoundingClientRect();
          return caixa.width < 43.5 || caixa.height < 43.5;
        }).map(botao => botao.textContent.trim())
        : [],
      emojis: /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(secao?.textContent || ''),
      estados: cartoes.map(cartao => cartao.querySelector('[data-av-status]')?.getAttribute('data-av-status') ?? null),
      textos: cartoes.map(cartao => cartao.textContent.replace(/\s+/g, ' ').trim().slice(0, 1600))
    };
  });
}

try {
  for (const cenario of CENARIOS) {
    const context = await session.createContext({ viewport: cenario.viewport });
    try {
      const { page, pageErrors } = await prepareUiV2Page(context, session.server.baseUrl, { theme: cenario.tema });
      await switchUiV2View(page, 'calculations');
      await page.locator('#calculationsWorkspace .calc-surface').waitFor();
      await page.locator('[data-calc-action="tab"][data-tab="previdenciario"]').click();
      /* A aba abre no hub; as análises avançadas são um fluxo próprio. */
      await page.locator('[data-prev-card="avancadas"] [data-calc-action="prev-abrir"]').click();
      await page.locator('[data-av-card="projecao"]').waitFor();
      await exercitarAvancadas(page, { semRegra: cenario.alvo === 'sem-regra' });
      await aguardarToastsSumirem(page);

      const medidas = await medir(page);
      assert.equal(medidas.ui, 'v2'); assertivas++;
      assert.equal(medidas.secao, true, `${cenario.arquivo}: seção de análises avançadas ausente`); assertivas++;
      assert.equal(medidas.cartoes, 3, `${cenario.arquivo}: os três cartões devem existir`); assertivas++;
      assert.ok(medidas.overflow <= 2, `${cenario.arquivo}: overflow global de ${medidas.overflow}px`); assertivas++;
      assert.deepEqual(medidas.idsDuplicados, [], `${cenario.arquivo}: ids duplicados`); assertivas++;
      assert.equal(medidas.foraDoViewport, 0, `${cenario.arquivo}: cartão fora do viewport`); assertivas++;
      assert.equal(medidas.sobrepostos, false, `${cenario.arquivo}: cartões sobrepostos`); assertivas++;
      assert.deepEqual(medidas.alvosPequenos, [], `${cenario.arquivo}: alvo de toque abaixo de 44px`); assertivas++;
      assert.equal(medidas.emojis, false, `${cenario.arquivo}: emoji na seção (proibido pelo AGENTS §29)`); assertivas++;
      assert.deepEqual(pageErrors, [], `${cenario.arquivo}: erros de página`); assertivas++;

      const projecao = medidas.textos[0] || '';
      const pensao = medidas.textos[1] || '';
      const qualidade = medidas.textos[2] || '';
      const estados = medidas.estados;

      if (cenario.alvo === 'sem-regra') {
        assert.equal(estados[0], 'unsupported', `${cenario.arquivo}: projeção sem regra deve declarar unsupported`); assertivas++;
        assert.match(projecao, /Nenhuma regra elegível/, `${cenario.arquivo}: estado sem regra não declarado`); assertivas++;
        assert.match(projecao, /Nenhum valor é apresentado/, `${cenario.arquivo}: estado sem regra não declara a ausência de valor`); assertivas++;
        assert.doesNotMatch(projecao, /R\$\s?\d/, `${cenario.arquivo}: estado sem valor não pode exibir moeda`); assertivas++;
      } else {
        assert.equal(estados[0], 'experimental', `${cenario.arquivo}: projeção deve declarar experimental`); assertivas++;
        assert.match(projecao, /Regra:/, `${cenario.arquivo}: regra vencedora não declarada`); assertivas++;
        assert.match(projecao, /RMI projetada/i, `${cenario.arquivo}: tile da RMI projetada ausente`); assertivas++;
        assert.match(projecao, /R\$\s?[\d.]+,\d{2}/, `${cenario.arquivo}: RMI sem formatação de moeda pt-BR`); assertivas++;
        assert.equal(estados[1], 'experimental', `${cenario.arquivo}: pensão deve declarar experimental`); assertivas++;
        assert.match(pensao, /R\$\s?8\.000,00/, `${cenario.arquivo}: total combinado da pensão (R$ 8.000,00) ausente`); assertivas++;
        assert.match(qualidade, /Variante facultativa/, `${cenario.arquivo}: bloco facultativo ausente`); assertivas++;
        assert.match(qualidade, /Regra geral \(art\. 15/, `${cenario.arquivo}: regra geral ausente`); assertivas++;
        assert.match(qualidade, /Modelo aplicado: regra geral e variante facultativa/, `${cenario.arquivo}: modelo aplicado não declarado em linguagem de tela`); assertivas++;
      }

      const alvo = cenario.alvo === 'sem-regra'
        ? '[data-av-card="projecao"]'
        : `[data-av-card="${cenario.alvo}"]`;
      await page.locator(alvo).scrollIntoViewIfNeeded();
      await page.waitForTimeout(160);
      const saida = path.join(OUTPUT, cenario.arquivo);
      await page.screenshot({ path: saida, fullPage: false });
      hashes.add(crypto.createHash('sha256').update(fs.readFileSync(saida)).digest('hex'));
    } finally {
      await context.close();
    }
  }

  assert.equal(hashes.size, CENARIOS.length, 'Screenshots duplicados entre cenários distintos.');
  console.log(`Visual das análises avançadas aprovado: ${CENARIOS.length} cenários, ${assertivas} assertivas, temas, viewports e servidor real PASS.`);
} finally {
  await session.stop();
}
