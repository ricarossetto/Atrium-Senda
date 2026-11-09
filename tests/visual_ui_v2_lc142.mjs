/**
 * Verificação visual da superfície LC 142/2013 em `#view-calculations`.
 *
 * Gera screenshots em `artifacts/visual-qa/lc142/`:
 *   - matriz dos 6 viewports × 2 temas no assistente;
 *   - os 4 estados que historicamente reprovam:
 *       (a) resultado com `rmi: null`;
 *       (b) resultado bloqueado com lista de blockers;
 *       (c) tabela de parcelas a 320px com valor inteiro acessível;
 *       (d) drawer de vínculo a 390×500 (teclado virtual simulado);
 *   - paisagem 844×390 e a etapa de contribuições com drilldown aberto.
 *
 * O caminho é sempre o real: clique na aba, clique na entrada, CNIS enviado por
 * `setInputFiles` com um arquivo sintético e rota mockada devolvendo fixture do
 * oráculo. Nada de injetar estado por dentro da feature.
 *
 * O teste mede geometria e garante que as imagens existem e são distintas. Ele
 * NÃO aprova a interface: a leitura das imagens é obrigatória e é registrada no
 * relatório da missão.
 */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepareUiV2Page, startUiV2Session, switchUiV2View } from './ui_v2_helpers.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT = path.join(ROOT, 'artifacts', 'visual-qa', 'lc142');
fs.mkdirSync(OUTPUT, { recursive: true });

const ORACLE = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', 'lc142-rust-oracle.json'), 'utf8'));
const caso = id => ORACLE.cases.find(item => item.id === id).expected.value;
const ENVELOPE_OK = caso('base-moderada');
const ENVELOPE_SEM_RMI = caso('insufficient-time');
const ENVELOPE_BLOQUEADO = caso('salary-gap-blocked');

const VIEWPORTS = [
  { width: 320, height: 640, tag: '320x640' },
  { width: 360, height: 740, tag: '360x740' },
  { width: 390, height: 844, tag: '390x844' },
  { width: 768, height: 1024, tag: '768x1024' },
  { width: 1152, height: 900, tag: '1152x900' },
  { width: 1440, height: 900, tag: '1440x900' }
];

/* Fixture sintética de CNIS: três competências e dois vínculos (um aberto,
 * para a pendência aparecer no cartão). Nenhum dado real. */
const CNIS_RESPOSTA = {
  ok: true,
  modo: 'oficial',
  fonte: 'fabrica',
  dadosSegurado: { nome: 'Segurado Sintético' },
  vinculos: [
    { inicio: '1990-01-01', fim: '2020-04-01', tipo: 'empregado', origem: 'CNIS oficial', empresa: 'EMPREGADOR FICTÍCIO UM' },
    { inicio: '2020-05-01', fim: '', tipo: 'contribuinte_individual', origem: 'CNIS oficial', empresa: 'EMPREGADOR FICTÍCIO DOIS COM RAZÃO SOCIAL EXTENSA PARA TESTE DE CONTENÇÃO' }
  ],
  competencias: [
    { competencia: '2020-01', salario: '1000.00' },
    { competencia: '2020-02', salario: '2000.00' },
    { competencia: '2020-03', salario: '3000.00' }
  ],
  resumo: { reconhecidas: 3, ignoradas: 1, duplicadas: 0 },
  avisos: ['Extração assistida: confira cada competência e remuneração no extrato original antes de calcular.']
};

/* Arquivo sintético de CNIS, só para o input de upload. */
const CNIS_ARQUIVO = path.join(ROOT, 'artifacts', 'visual-qa', 'lc142', '_cnis-sintetico.txt');
fs.writeFileSync(CNIS_ARQUIVO, 'Extrato sintético de teste; nenhum dado real.\n', 'utf8');

const hashes = new Set();
let cenarios = 0;
let assertions = 0;
const ok = (condicao, mensagem) => { assert.ok(condicao, mensagem); assertions += 1; };
const igual = (atual, esperado, mensagem) => { assert.equal(atual, esperado, mensagem); assertions += 1; };

/* `prepareUiV2Page` espera `networkidle`; com vários contextos em sequência o
 * Chromium ocasionalmente não considera a rede ociosa e o goto estoura 30s
 * (contenção com outros processos). A abertura é idempotente, então uma
 * retentativa resolve a flakiness sem afrouxar nenhuma asserção. */
async function prepararPaginaComRetentativa(context, baseUrl, opcoes) {
  try {
    return await prepareUiV2Page(context, baseUrl, opcoes);
  } catch (err) {
    if (!/Timeout .*exceeded/i.test(String(err?.message))) throw err;
    return prepareUiV2Page(context, baseUrl, opcoes);
  }
}

/* Um screenshot apresentado como "view em WxH" precisa ser exatamente WxH.
 * `fullPage: true` produz a altura do documento inteiro (ex.: 320×3027) e
 * esconde justamente os defeitos de sticky/sobreposição que o QA procura. */
function conferirDimensoes(arquivo, viewport) {
  const buffer = fs.readFileSync(arquivo);
  // Cabeçalho PNG: largura e altura em big-endian nos bytes 16..24.
  const largura = buffer.readUInt32BE(16);
  const altura = buffer.readUInt32BE(20);
  ok(largura === viewport.width, `${path.basename(arquivo)}: largura ${largura} ≠ ${viewport.width}.`);
  ok(altura === viewport.height, `${path.basename(arquivo)}: altura ${altura} ≠ ${viewport.height} (capture deveria ser de viewport, não de página inteira).`);
  return { largura, altura };
}

function medirGeometria(page) {
  return page.evaluate(() => {
    const view = document.getElementById('view-calculations');
    const surface = document.querySelector('.lc142-surface');
    const rect = surface?.getBoundingClientRect();
    const alvos = [...document.querySelectorAll('#view-calculations .lc142-surface button, #view-calculations .lc142-surface input:not([type="file"]), #view-calculations .lc142-surface select, #view-calculations .lc142-surface summary')]
      .filter(el => el.getClientRects().length && !el.disabled);
    const pequenos = alvos.filter(el => {
      const r = el.getBoundingClientRect();
      return r.height < 43.5 || r.width < 43.5;
    }).map(el => `${el.tagName}:${Math.round(el.getBoundingClientRect().height)}x${Math.round(el.getBoundingClientRect().width)}:${(el.textContent || '').trim().slice(0, 20)}`);
    return {
      overflowGlobal: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth,
      overflowView: view.scrollWidth - view.clientWidth,
      surfaceDentro: rect ? rect.left >= -1 && rect.right <= innerWidth + 1 : false,
      pequenos,
      tema: document.documentElement.dataset.theme,
      ui: document.documentElement.dataset.ui,
      temNaoSei: [...document.querySelectorAll('#view-calculations .lc142-surface .lc142-opcao-naosei')]
        .some(el => el.getClientRects().length > 0),
      temOpcaoEscolhida: document.querySelectorAll('#view-calculations .lc142-surface .lc142-opcao.is-escolhida').length,
      texto: (surface?.textContent || '').replace(/\s+/g, ' ').slice(0, 200)
    };
  });
}

async function mapearRotas(page, { envelope = ENVELOPE_OK } = {}) {
  await page.route('**/api/calc/catalog', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ series: [{ key: 'IPCA', rotulo: 'IPCA' }], tabelas: { resumo: { total: 1 } } })
  }));
  await page.route('**/api/calc/previdenciario/lc142/capacidades', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      ok: true,
      capacidades: {
        nao_suportado: ['graus mistos', 'atividade especial', 'CTC automática', 'fator previdenciário', 'conversão histórica de grau'],
        versao: 'lc142-constant-grade-v1'
      }
    })
  }));
  await page.route('**/api/calc/cnis/importar', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(CNIS_RESPOSTA)
  }));
  await page.route('**/api/calc/previdenciario/lc142/validar-hipotese', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ ok: true, valido: !envelope.blockers?.length, status: envelope.status, blockers: envelope.blockers || [], warnings: [] })
  }));
  await page.route('**/api/calc/previdenciario/lc142/preview', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ ok: true, resultado: envelope })
  }));
  /* Rota de aquisição do snapshot: o cálculo exige índices atestados. O duplo
   * devolve o formato padrão (`source_url`, `through`, `response_sha256`,
   * `retrieved_at`, `rates`, `limits`) — o mesmo que o servidor emite. */
  await page.route('**/api/calc/previdenciario/lc142/snapshot', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      ok: true,
      snapshot: {
        through: '2020-02',
        source_url: 'https://fabrica-de-calculos.app.trf3.jus.br/indices/api/v1/tabela',
        response_sha256: 'a'.repeat(64),
        retrieved_at: '2026-10-18T10:00:00Z',
        rates: [{ month: '2020-01', inpc: '0.005', igpdi: '0.0035', ipcr: '0.004', inpc_inss: '0.003' }],
        limits: [{ month: '2020-01', minimum: '1000.00', ceiling: '10000.00', minimum_source: 'Fixture sintética', ceiling_source: 'Fixture sintética' }]
      }
    })
  }));
}

/**
 * Preenche a fundamentação exigida pelo motor (`lc142_review` e
 * `lc142_disability_periods`) e confirma a revisão.
 *
 * Os textareas escutam `input`; `fill()` do Playwright dispara esse evento, mas
 * a confirmação da revisão re-renderiza a etapa — por isso os textos são
 * reaplicados depois do clique, como um usuário faria ao ver o campo vazio.
 */
async function preencherFundamentacao(page) {
  const aplicar = async () => {
    const review = page.locator('.lc142-surface [data-lc142-field="reviewEvidence"]');
    if (await review.count()) {
      await review.fill('CNIS sintético de 18/10/2026 conferido com o extrato.');
      await page.waitForTimeout(80);
    }
    const disability = page.locator('.lc142-surface [data-lc142-field="disabilityEvidence"]');
    if (await disability.count()) {
      await disability.fill('Laudo sintético atestando grau moderado em todo o período.');
      await page.waitForTimeout(80);
    }
  };
  await aplicar();
  const revisao = page.locator('[data-lc142-field="revisaoConfirmada"]');
  if (await revisao.count()) {
    // Mesmo motivo das premissas: a feature escuta `input`, não `change`.
    await page.evaluate(() => {
      const el = document.querySelector('.lc142-surface [data-lc142-field="revisaoConfirmada"]');
      if (el) { el.checked = true; el.dispatchEvent(new Event('input', { bubbles: true })); }
    });
    await page.waitForTimeout(250);
    await aplicar();
  }
}

/**
 * Leva o assistente até o estado em que o cálculo realmente dispara, pelo
 * caminho do usuário: consulta os índices oficiais nas premissas, confirma as
 * premissas e a revisão, e preenche a fundamentação exigida pelo motor.
 */
async function prepararCalculoPelaUi(page) {
  await irParaEtapa(page, 'vinculos');
  await irParaEtapa(page, 'premissas');

  // Passo que faltava na versão anterior: sem snapshot o motor bloqueia.
  const buscar = page.locator('.lc142-surface [data-lc142-action="buscar-snapshot"]');
  if (await buscar.count()) {
    await buscar.first().click();
    await page.waitForFunction(
      () => Boolean(document.querySelector('.lc142-surface .lc142-snapshot')),
      null,
      { timeout: 15000 }
    ).catch(() => {});
  }

  const premissas = page.locator('[data-lc142-field="premissasConfirmadas"]');
  if (await premissas.count()) {
    /* A feature escuta `input` no workspace; `check()` emite `change`. Marcar e
     * despachar `input` reproduz o clique real do usuário. */
    await page.evaluate(() => {
      const el = document.querySelector('.lc142-surface [data-lc142-field="premissasConfirmadas"]');
      if (el) { el.checked = true; el.dispatchEvent(new Event('input', { bubbles: true })); }
    });
    await page.waitForTimeout(200);
  }

  await irParaEtapa(page, 'revisao');
  await preencherFundamentacao(page);
}

async function abrirAssistente(page) {
  await switchUiV2View(page, 'calculations');
  await page.locator('#calculationsWorkspace .calc-surface').waitFor();
  await page.locator('[data-calc-action="tab"][data-tab="previdenciario"]').click();
  await page.locator('[data-calc-action="lc142-abrir"]').click();
  await page.locator('.lc142-surface').waitFor();
}

async function novaHipotese(page) {
  await page.locator('.lc142-surface [data-lc142-action="nova-hipotese"]').click();
  await page.locator('[data-lc142-etapa="assistente"]').waitFor();
}

/* Percorre o assistente com respostas declaradas e lê o CNIS pelo fluxo real.
 *
 * As perguntas de data (nascimento, DIB, data-base) são `input[type=date]` com
 * `data-lc142-field="resposta"` e `data-pergunta`. Sem preenchê-las o estado
 * fica com DIB/data-base vazias, o snapshot não pode ser consultado e o motor
 * recusa o cálculo — foi exatamente o defeito 10.1 do relatório de auditoria. */
const RESPOSTAS_ASSISTENTE = Object.freeze({
  nascimento: '1965-05-10',
  dib: '2020-03-31',
  dataBase: '2020-02-29'
});

async function responderPerguntaAtual(page) {
  // Opção oficial de cada pergunta de múltipla escolha.
  for (const valor of ['moderada', 'feminino']) {
    const opcao = page.locator(`.lc142-surface [data-lc142-action="assistente-opcao"][data-valor="${valor}"]:visible`);
    if (await opcao.count()) { await opcao.first().click(); await page.waitForTimeout(60); }
  }
  const campoData = page.locator('.lc142-surface input[type="date"][data-lc142-field="resposta"]');
  if (await campoData.count()) {
    const pergunta = await campoData.first().getAttribute('data-pergunta');
    const valor = RESPOSTAS_ASSISTENTE[pergunta];
    if (valor) { await campoData.first().fill(valor); await page.waitForTimeout(60); }
  }
}

async function percorrerAteCnisLido(page) {
  for (let passo = 0; passo < 8; passo += 1) {
    if (await page.locator('[data-lc142-etapa="cnis"]').count()) break;
    await responderPerguntaAtual(page);
    const continuar = page.locator('.lc142-surface [data-lc142-action="assistente-continuar"]');
    if (!(await continuar.count())) break;
    await continuar.click();
    await page.waitForTimeout(120);
  }
  await page.locator('[data-lc142-etapa="cnis"]').waitFor();
  await page.locator('[data-lc142-file="cnis"]').setInputFiles(CNIS_ARQUIVO);
  await page.locator('.lc142-arquivo').waitFor();
  await page.locator('[data-lc142-action="cnis-enviar"]:not([disabled])').click();
  await page.waitForFunction(() => document.querySelector('[data-lc142-arquivo]')?.textContent?.includes('_cnis-sintetico'), null, { timeout: 10000 }).catch(() => {});
  await page.waitForFunction(() => !document.querySelector('[data-lc142-action="cnis-enviar"]')?.textContent?.includes('Lendo'), null, { timeout: 10000 });
  return page.evaluate(() => (document.querySelector('[data-lc142-etapa="cnis"]')?.textContent || '').replace(/\s+/g, ' '));
}

/* Navega pelas etapas usando só os botões que a UI realmente oferece — sem
 * injetar estado nem chamar a feature por dentro. */
const ORDEM_ETAPAS = ['hipoteses', 'assistente', 'cnis', 'vinculos', 'contribuicoes', 'premissas', 'revisao', 'resultado', 'relatorios'];

async function irParaEtapa(page, etapa) {
  for (let tentativa = 0; tentativa < ORDEM_ETAPAS.length + 1; tentativa += 1) {
    if (await page.locator(`[data-lc142-etapa="${etapa}"]`).count()) return;
    const botao = page.locator(`.lc142-surface [data-lc142-action="etapa"][data-etapa="${etapa}"]`);
    if (await botao.count()) {
      await botao.first().click();
    } else {
      // Sem atalho direto: avança pela etapa seguinte disponível.
      const atual = await page.evaluate(() => document.querySelector('.lc142-surface')?.dataset.lc142Etapa || '');
      const seguinte = ORDEM_ETAPAS[ORDEM_ETAPAS.indexOf(atual) + 1];
      const proximo = page.locator(`.lc142-surface [data-lc142-action="etapa"][data-etapa="${seguinte}"]`);
      if (!(await proximo.count())) break;
      await proximo.first().click();
    }
    await page.waitForTimeout(80);
  }
  await page.locator(`[data-lc142-etapa="${etapa}"]`).waitFor();
}

const session = await startUiV2Session();
try {
  /* --- Matriz 6 viewports × 2 temas, no assistente ------------------------ */
  for (const viewport of VIEWPORTS) {
    for (const theme of ['light', 'dark']) {
      const context = await session.createContext({ viewport });
      try {
        const { page, pageErrors } = await prepararPaginaComRetentativa(context, session.server.baseUrl, { theme });
        await mapearRotas(page);
        await abrirAssistente(page);
        await novaHipotese(page);
        await page.locator('.lc142-surface [data-lc142-action="assistente-opcao"][data-valor="moderada"]').click();
        await page.locator('.lc142-surface [data-lc142-action="assistente-opcao"][data-valor="nao_sei"]').first().click();

        const medido = await medirGeometria(page);
        ok(medido.overflowGlobal === 0, `${viewport.tag} ${theme}: overflow global ${medido.overflowGlobal}px.`);
        ok(medido.overflowView <= 1, `${viewport.tag} ${theme}: view rola ${medido.overflowView}px.`);
        ok(medido.surfaceDentro, `${viewport.tag} ${theme}: superfície fora do viewport.`);
        ok(medido.pequenos.length === 0, `${viewport.tag} ${theme}: alvos < 44px: ${JSON.stringify(medido.pequenos)}`);
        // `data-theme="light"` marca o tema claro; o escuro é o padrão sem atributo.
        const temaEfetivo = medido.tema === 'light' ? 'light' : 'dark';
        ok(temaEfetivo === theme, `${viewport.tag}: tema não aplicado (atributo ${medido.tema || 'ausente'} → ${temaEfetivo}).`);
        ok(medido.ui === 'v2', `${viewport.tag}: UI não é v2.`);
        ok(medido.temNaoSei, `${viewport.tag}: opção "Não sei" não visível.`);
        // Uma pergunta por tela: apenas a escolha da pergunta ativa fica marcada.
        ok(medido.temOpcaoEscolhida === 1, `${viewport.tag}: escolha declarada não ficou visível (${medido.temOpcaoEscolhida}).`);
        assert.deepEqual(pageErrors, [], `${viewport.tag} ${theme}: erros de página.`);
        assertions += 1;

        const arquivo = path.join(OUTPUT, `assistente-${viewport.tag}-${theme}.png`);
        await page.screenshot({ path: arquivo, fullPage: false });
        conferirDimensoes(arquivo, viewport);
        hashes.add(crypto.createHash('sha256').update(fs.readFileSync(arquivo)).digest('hex'));
        cenarios += 1;
      } finally {
        await context.close();
      }
    }
  }

  /* --- (c) Contribuições a 320px: resumo + drilldown + tabela local ------ */
  for (const theme of ['light', 'dark']) {
    const context = await session.createContext({ viewport: { width: 320, height: 640 } });
    try {
      const { page } = await prepararPaginaComRetentativa(context, session.server.baseUrl, { theme });
      await mapearRotas(page);
      await abrirAssistente(page);
      await novaHipotese(page);
      const textoCnis = await percorrerAteCnisLido(page);
      ok(/Leitura|CNIS|competência/i.test(textoCnis), `contribuições ${theme}: CNIS não leu.`);
      await irParaEtapa(page, 'contribuicoes');
      // Abre o drilldown da primeira competência: valor nominal/teto/índice/origem.
      await page.locator('.lc142-surface .lc142-detalhe summary').first().click();
      await page.locator('[data-lc142-drilldown]').first().waitFor();
      const medido = await page.evaluate(() => {
        const wraps = [...document.querySelectorAll('.lc142-tabela-wrap')];
        const drill = document.querySelector('[data-lc142-drilldown]');
        const textoDrill = (drill?.textContent || '').replace(/\s+/g, ' ');
        const valores = [...document.querySelectorAll('.lc142-tabela .lc142-money-col')]
          .map(el => el.textContent.trim())
          .filter(Boolean);
        return {
          temTabela: wraps.length > 0,
          rolagemLocal: wraps.every(el => getComputedStyle(el).overflowX === 'auto'),
          tabelaCabeNoDocumento: wraps.every(el => el.getBoundingClientRect().right <= innerWidth + 1),
          overflowGlobal: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth,
          overflowView: document.getElementById('view-calculations').scrollWidth - document.getElementById('view-calculations').clientWidth,
          drillCompleto: ['Salário nominal', 'Teto da competência', 'Índice', 'Corrigido', 'Uso', 'Origem', 'Fonte', 'Histórico'].every(campo => textoDrill.includes(campo)),
          valoresInteiros: valores.length > 0 && valores.every(valor => !valor.includes('…') && !valor.includes('...')),
          linhas: document.querySelectorAll('.lc142-tabela tbody tr').length
        };
      });
      ok(medido.temTabela, `contribuições ${theme}: tabela financeira ausente.`);
      ok(medido.rolagemLocal, `contribuições ${theme}: tabela sem rolagem local.`);
      ok(medido.tabelaCabeNoDocumento, `contribuições ${theme}: contêiner da tabela vaza do documento.`);
      ok(medido.overflowGlobal === 0, `contribuições ${theme}: overflow global.`);
      ok(medido.overflowView <= 1, `contribuições ${theme}: view rola na horizontal.`);
      ok(medido.drillCompleto, `contribuições ${theme}: drilldown incompleto.`);
      ok(medido.valoresInteiros, `contribuições ${theme}: valor monetário truncado.`);
      ok(medido.linhas >= 3, `contribuições ${theme}: ${medido.linhas} linha(s) na tabela.`);

      /* Overlay global: o toast do produto é `position: fixed` (css/portal.css) e
       * nasce na faixa do rodapé. Ordem das capturas:
       *   1) captura LIMPA, com a região de toast zerada — estado normal da etapa;
       *   2) captura COM toast — prova de que nada essencial fica encoberto.
       * A região é zerada entre as duas e o teste exige exatamente 1 toast, senão
       * os dois arquivos saem idênticos e a prova de sobreposição não vale nada.
       * NÃO rolamos até o fim antes de capturar: a imagem precisa mostrar o
       * conteúdo real da etapa (cartões/resumo/tabela), não um rodapé vazio. */
      const arquivo = path.join(OUTPUT, `contribuicoes-320x640-${theme}.png`);
      await page.evaluate(() => document.getElementById('toastRegion').replaceChildren());
      await page.waitForTimeout(220);
      const conteudoLimpo = await page.evaluate(() => {
        const surface = document.querySelector('.lc142-surface');
        const cartao = document.querySelector('.lc142-parcela');
        const r = cartao?.getBoundingClientRect();
        return {
          parciais: document.querySelectorAll('.lc142-parcela').length,
          linhasTabela: document.querySelectorAll('.lc142-tabela tbody tr').length,
          tiles: document.querySelectorAll('.lc142-tile').length,
          linhasTabelaComValor: [...document.querySelectorAll('.lc142-tabela .lc142-money-col')]
            .filter(el => (el.textContent || '').trim()).length,
          scrollHeight: surface?.scrollHeight || 0,
          clientHeight: surface?.clientHeight || 0,
          primeiroCartaoNaViewport: r ? r.top < innerHeight && r.bottom > 0 : false,
          toasts: document.querySelectorAll('#toastRegion .toast').length
        };
      });
      igual(conteudoLimpo.toasts, 0, `contribuições ${theme}: região de toast não foi zerada para a captura limpa.`);
      ok(conteudoLimpo.parciais > 0, `contribuições ${theme}: nenhum cartão de competência renderizado (tela vazia).`);
      ok(conteudoLimpo.linhasTabela >= 3, `contribuições ${theme}: tabela com ${conteudoLimpo.linhasTabela} linha(s).`);
      ok(conteudoLimpo.tiles > 0, `contribuições ${theme}: resumo (tiles) ausente.`);
      ok(conteudoLimpo.linhasTabelaComValor > 0, `contribuições ${theme}: tabela sem valores monetários.`);
      ok(conteudoLimpo.primeiroCartaoNaViewport, `contribuições ${theme}: primeiro cartão fora da viewport na captura.`);
      await page.screenshot({ path: arquivo, fullPage: false });
      conferirDimensoes(arquivo, { width: 320, height: 640 });
      cenarios += 1;

      await page.evaluate(() => {
        document.getElementById('toastRegion').replaceChildren();
        window.Atrium.App.toast('3 competência(s) lidas do CNIS; confira as pendências.', 'success');
      });
      await page.waitForTimeout(440);
      const comToast = await page.evaluate(() => {
        const toasts = [...document.querySelectorAll('#toastRegion .toast')];
        const toast = toasts[0];
        const alvoToast = toast?.getBoundingClientRect();
        const surface = document.querySelector('.lc142-surface');
        const acoes = [...surface.querySelectorAll('.lc142-btn, .lc142-opcao')]
          .filter(el => el.getClientRects().length && !el.disabled);
        const interceptadas = acoes.filter(el => {
          const r = el.getBoundingClientRect();
          if (r.top < 0 || r.bottom > innerHeight) return false;
          const alvo = document.elementFromPoint(r.left + Math.min(r.width / 2, 40), r.top + r.height / 2);
          return Boolean(toast?.contains(alvo));
        }).map(el => (el.textContent || '').trim().slice(0, 24));
        const cartoesSobToast = [...document.querySelectorAll('.lc142-parcela')].filter(el => {
          const r = el.getBoundingClientRect();
          return alvoToast && r.top < alvoToast.bottom && r.bottom > alvoToast.top;
        }).length;
        return {
          quantidadeToasts: toasts.length,
          interceptadas,
          cartoesSobToast,
          reserva: getComputedStyle(surface).paddingBottom,
          offsetVar: getComputedStyle(surface).getPropertyValue('--lc142-toast-offset').trim()
        };
      });
      // Um evento, um toast: a região não pode acumular duplicatas.
      igual(comToast.quantidadeToasts, 1, `toast ${theme}: ${comToast.quantidadeToasts} toast(s) na região — disparo duplicado.`);
      ok(comToast.interceptadas.length === 0, `toast ${theme}: ações interceptadas pelo toast: ${JSON.stringify(comToast.interceptadas)}.`);
      ok(comToast.reserva !== '0px', `toast ${theme}: nenhuma reserva de espaço aplicada (${comToast.reserva}).`);
      ok(comToast.offsetVar !== '' && comToast.offsetVar !== '0px', `toast ${theme}: --lc142-toast-offset não medido (${comToast.offsetVar}).`);

      /* INVARIANTE DE REPOUSO — a que realmente importa.
       *
       * No MEIO do scroll, conteúdo passa sob um overlay `position: fixed`: isso é
       * física de overlay, não defeito de layout, e o toast global se auto-dispensa
       * em 4,3s (`js/components/toast.js`). O que NÃO pode acontecer é o conteúdo
       * ficar oculto na posição de REPOUSO (fim do scroll), porque é para isso que
       * existe a reserva `padding-bottom`. Sem esta verificação o teste MEDIA a
       * sobreposição e a imprimia sem reprovar, deixando o defeito passar. */
      await page.evaluate(() => {
        const role = document.scrollingElement || document.documentElement;
        role.scrollTo(0, role.scrollHeight);
      });
      await page.waitForTimeout(320);
      const repouso = await page.evaluate(() => {
        const toast = document.querySelector('#toastRegion .toast');
        const caixa = toast?.getBoundingClientRect();
        const noFim = Math.round(globalThis.scrollY) + globalThis.innerHeight
          >= (document.scrollingElement || document.documentElement).scrollHeight - 2;

        /* Métrica correta: comparar BORDAS, não interseção de retângulos.
         *
         * Um cartão pode ser mais alto que a viewport (aqui: 662px num viewport de
         * 640px) e legitimamente atravessar a faixa do toast sem que nenhum
         * conteúdo esteja escondido — o conteúdo dele apenas continua rolando.
         * O que caracteriza ocultação é a borda INFERIOR do último bloco terminar
         * DEPOIS do topo do toast E ainda dentro da viewport: aí o fim do bloco
         * fica inalcançável na posição de repouso.
         *
         * Medimos também os BLOCOS DE TEXTO internos (linhas de tabela, valores),
         * que são a granularidade que o usuário lê. */
        const blocos = [...document.querySelectorAll(
          '.lc142-parcela, .lc142-tile, .lc142-tabela tbody tr, .lc142-linha, .lc142-resumo-item'
        )];
        const cortados = caixa
          ? blocos
              .filter(el => {
                const r = el.getBoundingClientRect();
                if (r.height === 0) return false;
                const dentroDaViewport = r.bottom > 0 && r.top < globalThis.innerHeight;
                if (!dentroDaViewport) return false;
                // Oculto = termina sob o toast e não há mais scroll possível para revelá-lo.
                const terminaSobToast = r.bottom > caixa.top && r.bottom <= globalThis.innerHeight;
                const comecaAntesDoToast = r.top < caixa.top;
                return terminaSobToast && comecaAntesDoToast;
              })
              .map(el => {
                const r = el.getBoundingClientRect();
                return {
                  classe: el.className.split(/\s+/)[0],
                  texto: (el.textContent || '').trim().slice(0, 28),
                  top: Math.round(r.top),
                  bottom: Math.round(r.bottom),
                  toastTop: Math.round(caixa.top),
                  innerHeight: globalThis.innerHeight
                };
              })
          : [];

        /* Ações essenciais são o caso que jamais pode falhar: se o botão primário
         * está sob o toast no repouso, o usuário não consegue concluir a etapa. */
        const acoes = caixa
          ? [...document.querySelectorAll('.lc142-surface .lc142-btn, .lc142-surface .lc142-opcao')]
              .filter(el => {
                if (!el.getClientRects().length || el.disabled) return false;
                const r = el.getBoundingClientRect();
                if (r.top < 0 || r.bottom > globalThis.innerHeight) return false;
                const alvo = document.elementFromPoint(
                  r.left + Math.min(r.width / 2, 40),
                  r.top + r.height / 2
                );
                return Boolean(toast?.contains(alvo));
              })
              .map(el => (el.textContent || '').trim().slice(0, 24))
          : [];

        return {
          noFim,
          ocultos: cortados.length,
          detalhe: cortados,
          acoesCobertas: acoes,
          temToast: Boolean(toast)
        };
      });
      igual(repouso.temToast, true, `toast ${theme}: o toast sumiu antes da verificação de repouso.`);
      igual(repouso.noFim, true, `toast ${theme}: não foi possível chegar ao fim do scroll para verificar repouso.`);
      igual(
        repouso.acoesCobertas.length,
        0,
        `toast ${theme}: ação essencial coberta pelo toast no repouso: ${JSON.stringify(repouso.acoesCobertas)}.`
      );
      igual(
        repouso.ocultos,
        0,
        `toast ${theme}: ${repouso.ocultos} bloco(s) de conteúdo terminam sob o toast no fim do scroll — a reserva padding-bottom não cobre a faixa do overlay. Detalhe: ${JSON.stringify(repouso.detalhe)}`
      );

      console.log(`  [${theme}] 320px: ${conteudoLimpo.parciais} cartões, ${conteudoLimpo.linhasTabela} linhas, ${comToast.quantidadeToasts} toast, reserva ${comToast.reserva}, offset ${comToast.offsetVar}, sob toast no meio ${comToast.cartoesSobToast}, ocultos no repouso ${repouso.ocultos}.`);
      const arquivoComToast = path.join(OUTPUT, `contribuicoes-320x640-${theme}-com-toast.png`);
      await page.evaluate(() => {
        const role = document.scrollingElement || document.documentElement;
        role.scrollTo(0, 0);
      });
      await page.waitForTimeout(240);
      await page.screenshot({ path: arquivoComToast, fullPage: false });
      conferirDimensoes(arquivoComToast, { width: 320, height: 640 });
      cenarios += 1;

      const hashLimpo = crypto.createHash('sha256').update(fs.readFileSync(arquivo)).digest('hex');
      const hashToast = crypto.createHash('sha256').update(fs.readFileSync(arquivoComToast)).digest('hex');
      ok(hashLimpo !== hashToast, `toast ${theme}: capturas "com" e "sem" toast idênticas — a prova de sobreposição é inválida.`);
    } finally {
      await context.close();
    }
  }

  /* --- (d) Drawer de vínculo a 390×500, com pendência -------------------- */
  for (const theme of ['light', 'dark']) {
    const context = await session.createContext({ viewport: { width: 390, height: 500 } });
    try {
      const { page } = await prepararPaginaComRetentativa(context, session.server.baseUrl, { theme });
      await mapearRotas(page);
      await abrirAssistente(page);
      await novaHipotese(page);
      await percorrerAteCnisLido(page);
      await irParaEtapa(page, 'vinculos');
      ok(await page.locator('.lc142-vinculo.is-pendente').count() > 0, `drawer ${theme}: vínculo aberto sem pendência visível.`);
      const gatilho = page.locator('.lc142-surface [data-lc142-action="vinculo-abrir"]').first();
      await gatilho.click();
      await page.locator('.lc142-drawer').waitFor();
      // Aguarda a animação de entrada (translateX 8px) terminar: medir durante
      // a animação produz falso "fora do viewport" e screenshot borrado.
      await page.waitForFunction(() => {
        const drawer = document.querySelector('.lc142-drawer');
        if (!drawer) return false;
        return drawer.getAnimations({ subtree: false }).every(animacao => animacao.playState === 'finished');
      }, null, { timeout: 4000 }).catch(() => {});
      await page.waitForTimeout(120);
      const medido = await page.evaluate(() => {
        const drawer = document.querySelector('.lc142-drawer');
        const rect = drawer.getBoundingClientRect();
        const footer = document.querySelector('.lc142-drawer-footer').getBoundingClientRect();
        return {
          dentroDoViewport: rect.top >= -1 && rect.bottom <= innerHeight + 1 && rect.left >= -1 && rect.right <= innerWidth + 1,
          footerVisivel: footer.bottom <= innerHeight + 1 && footer.top >= -1,
          overflowGlobal: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth,
          fundoInerte: ['.lc142-header', '.lc142-nav', '.lc142-corpo'].map(s => document.querySelector(s)).filter(Boolean).every(el => el.hasAttribute('inert')),
          alvos: [...drawer.querySelectorAll('button')].every(el => el.getBoundingClientRect().height >= 43.5),
          motivoObrigatorio: (drawer.textContent || '').includes('obrigatório'),
          focoNoDrawer: drawer.contains(document.activeElement)
        };
      });
      ok(medido.dentroDoViewport, `drawer ${theme}: fora do viewport.`);
      ok(medido.footerVisivel, `drawer ${theme}: rodapé inacessível.`);
      ok(medido.overflowGlobal === 0, `drawer ${theme}: overflow global.`);
      ok(medido.fundoInerte, `drawer ${theme}: fundo não inerte.`);
      ok(medido.alvos, `drawer ${theme}: alvo abaixo de 44px.`);
      ok(medido.motivoObrigatorio, `drawer ${theme}: motivo não declarado obrigatório.`);
      ok(medido.focoNoDrawer, `drawer ${theme}: foco não entrou no drawer.`);
      const arquivo = path.join(OUTPUT, `drawer-vinculo-390x500-${theme}.png`);
      await page.screenshot({ path: arquivo, fullPage: false });
      conferirDimensoes(arquivo, { width: 390, height: 500 });
      cenarios += 1;

      // Escape fecha e devolve o foco ao gatilho.
      await page.keyboard.press('Escape');
      await page.locator('.lc142-drawer').waitFor({ state: 'detached' });
      const focoDevolvido = await page.evaluate(() => document.activeElement?.dataset?.lc142Action === 'vinculo-abrir');
      ok(focoDevolvido, `drawer ${theme}: Escape não devolveu o foco ao gatilho.`);
    } finally {
      await context.close();
    }
  }

  /* --- (a) Resultado com rmi null e (b) resultado bloqueado -------------- */
  for (const theme of ['light', 'dark']) {
    for (const cenario of [
      { nome: 'resultado-rmi-nula', envelope: ENVELOPE_SEM_RMI, checagens: { naoApurada: true, semZero: true, media: true, naoVerificado: true } },
      { nome: 'resultado-bloqueado', envelope: ENVELOPE_BLOQUEADO, checagens: { bloqueado: true, semValor: true } }
    ]) {
      const context = await session.createContext({ viewport: { width: 390, height: 844 } });
      try {
        const { page } = await prepararPaginaComRetentativa(context, session.server.baseUrl, { theme });
        await mapearRotas(page, { envelope: cenario.envelope });
        await abrirAssistente(page);
        await novaHipotese(page);
        await percorrerAteCnisLido(page);
        await prepararCalculoPelaUi(page);
        // Calcula pelo caminho real: clique no botão primário.
        await page.locator('[data-lc142-action="calcular"]:not([disabled])').click();
        await page.locator('[data-lc142-etapa="resultado"]').waitFor();
        const medido = await page.evaluate(() => {
          const texto = (document.querySelector('.lc142-surface')?.textContent || '').replace(/\s+/g, ' ');
          return {
            texto,
            overflowGlobal: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth,
            overflowView: document.getElementById('view-calculations').scrollWidth - document.getElementById('view-calculations').clientWidth,
            bloqueado: Boolean(document.querySelector('[data-lc142-status="blocked"]')),
            rmiAusente: Boolean(document.querySelector('[data-lc142-rmi-ausente]')),
            temZero: /R\$\s*0,00/.test(texto),
            naoVerificado: texto.includes('Não verificado'),
            avisosVisiveis: Boolean(document.querySelector('[data-lc142-avisos]'))
          };
        });
        ok(medido.overflowGlobal === 0, `${cenario.nome} ${theme}: overflow global.`);
        ok(medido.overflowView <= 1, `${cenario.nome} ${theme}: view rola na horizontal.`);
        if (cenario.checagens.naoApurada) {
          ok(medido.rmiAusente, `${cenario.nome} ${theme}: RMI nula não marcada.`);
          ok(!medido.temZero, `${cenario.nome} ${theme}: apresentou R$ 0,00.`);
          ok(/Média dos salários/.test(medido.texto), `${cenario.nome} ${theme}: média ausente.`);
          ok(/não é a RMI/.test(medido.texto), `${cenario.nome} ${theme}: média sem a ressalva de que não é RMI.`);
          ok(medido.naoVerificado, `${cenario.nome} ${theme}: "Não verificado" ausente.`);
          ok(medido.avisosVisiveis, `${cenario.nome} ${theme}: avisos não visíveis.`);
        }
        if (cenario.checagens.bloqueado) {
          ok(medido.bloqueado, `${cenario.nome} ${theme}: estado bloqueado não renderizou.`);
          ok(!/R\$/.test(medido.texto), `${cenario.nome} ${theme}: bloqueado apresentou valor financeiro.`);
          ok(medido.texto.includes('lc142_missing_salary'), `${cenario.nome} ${theme}: código do blocker ausente.`);
          ok(medido.texto.includes('competencias'), `${cenario.nome} ${theme}: campo do blocker ausente.`);
        }
        const arquivo = path.join(OUTPUT, `${cenario.nome}-390x844-${theme}.png`);
        await page.screenshot({ path: arquivo, fullPage: false });
        conferirDimensoes(arquivo, { width: 390, height: 844 });
        cenarios += 1;
      } finally {
        await context.close();
      }
    }
  }

  /* --- Etapa de relatórios e premissas no desktop ----------------------- */
  for (const theme of ['light', 'dark']) {
    const context = await session.createContext({ viewport: { width: 1440, height: 900 } });
    try {
      const { page } = await prepararPaginaComRetentativa(context, session.server.baseUrl, { theme });
      await mapearRotas(page);
      await abrirAssistente(page);
      await novaHipotese(page);
      await percorrerAteCnisLido(page);
      await irParaEtapa(page, 'vinculos');
      await irParaEtapa(page, 'premissas');
      // Consulta os índices oficiais: o cálculo exige snapshot atestado.
      const buscarIndices = page.locator('.lc142-surface [data-lc142-action="buscar-snapshot"]');
      if (await buscarIndices.count()) {
        await buscarIndices.first().click();
        await page.waitForFunction(() => Boolean(document.querySelector('.lc142-surface .lc142-snapshot')), null, { timeout: 15000 }).catch(() => {});
      }
      const premissas = await page.evaluate(() => {
        const texto = (document.querySelector('.lc142-surface')?.textContent || '').replace(/\s+/g, ' ');
        return {
          dib: Boolean(document.querySelector('[data-lc142-dib]')),
          dataBase: Boolean(document.querySelector('[data-lc142-database]')),
          separaDatas: /DIB e data-base são datas distintas/.test(texto),
          limites: texto.includes('graus mistos'),
          overflowGlobal: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth
        };
      });
      ok(premissas.dib && premissas.dataBase, `premissas ${theme}: DIB/data-base sem marcadores.`);
      ok(premissas.separaDatas, `premissas ${theme}: não separa DIB de data-base.`);
      ok(premissas.limites, `premissas ${theme}: limites declarados do motor ausentes.`);
      ok(premissas.overflowGlobal === 0, `premissas ${theme}: overflow global.`);
      const arquivoPremissas = path.join(OUTPUT, `premissas-1440x900-${theme}.png`);
      await page.screenshot({ path: arquivoPremissas, fullPage: false });
      conferirDimensoes(arquivoPremissas, { width: 1440, height: 900 });
      cenarios += 1;

      await irParaEtapa(page, 'revisao');
      await preencherFundamentacao(page);
      const botaoCalcular = page.locator('[data-lc142-action="calcular"]:not([disabled])');
      if (await botaoCalcular.count()) {
        await botaoCalcular.click();
        await page.locator('[data-lc142-etapa="resultado"]').waitFor();
      }
      const arquivoResultado = path.join(OUTPUT, `resultado-1440x900-${theme}.png`);
      await page.screenshot({ path: arquivoResultado, fullPage: false });
      conferirDimensoes(arquivoResultado, { width: 1440, height: 900 });
      cenarios += 1;

      await irParaEtapa(page, 'relatorios');
      const relatorios = await page.evaluate(() => {
        const select = document.getElementById('lc142RelatorioTipo');
        const identificacao = document.querySelector('[data-lc142-field="relatorioIdentificacao"]');
        return {
          familias: select ? select.options.length : 0,
          identificacaoDesligada: identificacao ? !identificacao.checked : false,
          downloadBloqueado: Boolean(document.querySelector('[data-lc142-action="relatorio-baixar"]')?.disabled),
          cenarioFixo: Boolean(document.querySelector('[data-lc142-cenario-fixo]')),
          overflowGlobal: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth
        };
      });
      ok(relatorios.familias === 7, `relatórios ${theme}: ${relatorios.familias} famílias (esperado 7).`);
      ok(relatorios.identificacaoDesligada, `relatórios ${theme}: identificação deveria vir desligada.`);
      ok(relatorios.downloadBloqueado, `relatórios ${theme}: download liberado sem bytes.`);
      ok(relatorios.cenarioFixo, `relatórios ${theme}: cenário recalculado não exibido.`);
      ok(relatorios.overflowGlobal === 0, `relatórios ${theme}: overflow global.`);
      const arquivoRelatorios = path.join(OUTPUT, `relatorios-1440x900-${theme}.png`);
      await page.screenshot({ path: arquivoRelatorios, fullPage: false });
      conferirDimensoes(arquivoRelatorios, { width: 1440, height: 900 });
      cenarios += 1;
    } finally {
      await context.close();
    }
  }

  /* --- Paisagem 844×390 -------------------------------------------------- */
  {
    const context = await session.createContext({ viewport: { width: 844, height: 390 } });
    try {
      const { page } = await prepararPaginaComRetentativa(context, session.server.baseUrl, { theme: 'light' });
      await mapearRotas(page);
      await abrirAssistente(page);
      await novaHipotese(page);
      const medido = await page.evaluate(() => {
        const view = document.getElementById('view-calculations');
        const sticky = document.querySelector('.lc142-actions-sticky');
        const botoesSticky = sticky ? [...sticky.querySelectorAll('button')].filter(el => el.getClientRects().length) : [];
        const botao = botoesSticky[0];
        const rBotao = botao?.getBoundingClientRect();
        // Com a barra em fluxo, a ação precisa ser alcançável rolando — o que não
        // pode acontecer é ela ficar presa sob uma barra fixa ou fora do eixo X.
        const alcancavel = rBotao
          ? rBotao.left >= -1 && rBotao.right <= innerWidth + 1 && rBotao.width > 0 && rBotao.height >= 43.5
          : false;
        return {
          overflowGlobal: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth,
          overflowView: view.scrollWidth - view.clientWidth,
          stickyEstatica: !sticky || getComputedStyle(sticky).position === 'static',
          alcancavel,
          acoesNaBarra: botoesSticky.length,
          alturaBotao: rBotao ? Math.round(rBotao.height) : 0
        };
      });
      ok(medido.overflowGlobal === 0, 'paisagem 844×390: overflow global.');
      ok(medido.overflowView <= 1, 'paisagem 844×390: view rola na horizontal.');
      ok(medido.stickyEstatica, 'paisagem 844×390: barra fixa deveria ser estática em altura reduzida (não cobrir conteúdo).');
      ok(medido.acoesNaBarra > 0, 'paisagem 844×390: barra de ações sem botões.');
      ok(medido.alcancavel, `paisagem 844×390: ação fora do eixo visível ou abaixo de 44px (${medido.alturaBotao}px).`);
      // Rolar até a barra: a ação precisa ficar integralmente visível e sem overlay.
      await page.evaluate(() => {
        document.querySelector('.lc142-actions-sticky')?.scrollIntoView({ block: 'end', behavior: 'instant' });
      });
      await page.waitForTimeout(260);
      const aposRolar = await page.evaluate(() => {
        const sticky = document.querySelector('.lc142-actions-sticky');
        const botao = sticky?.querySelector('button');
        const r = botao?.getBoundingClientRect();
        if (!r) return { visivel: false, interceptado: true };
        const alvo = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return {
          visivel: r.top >= -1 && r.bottom <= innerHeight + 1,
          interceptado: !(alvo === botao || botao.contains(alvo))
        };
      });
      ok(aposRolar.visivel, 'paisagem 844×390: ação não fica visível ao rolar até a barra.');
      ok(!aposRolar.interceptado, 'paisagem 844×390: ação interceptada por outro elemento.');
      const arquivo = path.join(OUTPUT, 'assistente-844x390-light.png');
      await page.screenshot({ path: arquivo, fullPage: false });
      conferirDimensoes(arquivo, { width: 844, height: 390 });
      cenarios += 1;
    } finally {
      await context.close();
    }
  }
} finally {
  await session.stop();
  if (fs.existsSync(CNIS_ARQUIVO)) fs.unlinkSync(CNIS_ARQUIVO);
}

/* Todas as imagens precisam existir e views distintas não podem coincidir. */
const arquivos = fs.readdirSync(OUTPUT).filter(nome => nome.endsWith('.png'));
ok(arquivos.length >= 24, `Screenshots insuficientes: ${arquivos.length}.`);
const unicos = new Set(arquivos.map(nome => crypto.createHash('sha256').update(fs.readFileSync(path.join(OUTPUT, nome))).digest('hex')));
ok(unicos.size >= Math.floor(arquivos.length * 0.85), `Screenshots duplicados: ${arquivos.length - unicos.size} de ${arquivos.length}.`);
ok(unicos.size === arquivos.length || arquivos.length - unicos.size <= 2, 'Imagens de views distintas coincidem.');

console.log(`Visual LC 142 gerado: ${arquivos.length} screenshots em artifacts/visual-qa/lc142 (${cenarios} cenários, ${assertions} assertivas PASS).`);
console.log('LEITURA OBRIGATÓRIA: este teste não aprova a interface. Abrir e ler as imagens antes de declarar validação visual.');
