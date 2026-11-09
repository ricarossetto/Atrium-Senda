/**
 * Prova da correção 6.42.1: a jornada do USUÁRIO agora conclui o cálculo.
 *
 * Antes deste ciclo, percorrer o assistente terminava em bloqueio
 * (`lc142_snapshot`) ou em HTTP 400 ("Data ISO inválida."). Aqui o percurso é
 * o real: assistente → CNIS → vínculos → contribuições → premissas (com
 * consulta de índices) → revisão (confirmação humana) → resultado → PDF.
 *
 * A Fábrica de Cálculos é externa; a rota `/snapshot` é servida por um duplo de
 * teste que devolve corpo com shape oficial. Isso prova a integração do fluxo,
 * não a disponibilidade da fonte em si (verificada separadamente).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepareUiV2Page, startUiV2Session, switchUiV2View } from '../tests/ui_v2_helpers.mjs';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SAIDA = path.join(RAIZ, 'artifacts', 'audit-lc142-user');
fs.mkdirSync(SAIDA, { recursive: true });
const ARQ = path.join(SAIDA, 'cnis-jornada.txt');
fs.writeFileSync(ARQ, 'Extrato sintético.\n', 'utf8');

/* CNIS sintético: vínculo FECHADO cobrindo o PBC (o motor só considera
 * competências a partir de 1994-07; salários fora dessa janela não entram).
 * Vínculo em aberto exigiria hipótese de continuidade declarada
 * (`project_open_links` + evidência); dado fechado isola o que este teste
 * prova — a jornada ponta a ponta — de hipóteses adicionais do perfil. */
const COMPETENCIAS_PBC = [];
for (let ano = 1994; ano <= 2020; ano += 1) {
  const mesInicial = ano === 1994 ? 7 : 1;
  const mesFinal = ano === 2020 ? 3 : 12;
  for (let mes = mesInicial; mes <= mesFinal; mes += 1) {
    COMPETENCIAS_PBC.push({
      competencia: `${ano}-${String(mes).padStart(2, '0')}`,
      salario: String(1000 + (ano - 1994) * 50)
    });
  }
}

const CNIS = {
  ok: true, modo: 'oficial', fonte: 'fabrica',
  dadosSegurado: { nome: 'Segurada Teste de Auditoria' },
  vinculos: [
    { inicio: '1994-07-01', fim: '2020-03-31', tipo: 'empregado', origem: 'CNIS oficial', empresa: 'EMPREGADOR UM' }
  ],
  competencias: COMPETENCIAS_PBC,
  resumo: { reconhecidas: COMPETENCIAS_PBC.length, ignoradas: 0, duplicadas: 0 },
  avisos: ['Extração assistida.']
};

/* Corpo no shape que a Fábrica devolve (percentuais mensais). Cobre o intervalo
 * do PBC usado no cenário sintético.
 *
 * IPC-r e IGP-DI são exigidos nas competências anteriores aos seus cortes
 * históricos (`LC142_CORTE_IPC_R`, `LC142_CORTE_IGPDI`); INPC-INSS vale a partir
 * de `LC142_INICIO_INPC_INSS`. Preencher os três evita que o motor pare com
 * "IPC-r histórico ausente" no meio do PBC. */
const CORPO_INDICES = JSON.stringify({
  dados: COMPETENCIAS_PBC.map((item, indice) => ({
    competencia: item.competencia,
    inpc: indice % 3 === 0 ? '0.5' : indice % 3 === 1 ? '0.25' : '0.1',
    ipcr: '0.4',
    igpdi: '0.35',
    inpc_inss: '0.3'
  }))
});
/* Limites acompanham cada competência do PBC: piso e teto declarados. */
const LIMITES = COMPETENCIAS_PBC.map(item => ({
  month: item.competencia, minimum: '1000.00', ceiling: '10000.00',
  minimum_source: 'Fixture sintética de teste', ceiling_source: 'Fixture sintética de teste'
}));

const relatorio = [];
const registrar = (etapa, ok, detalhe) => { relatorio.push({ etapa, ok, detalhe }); console.log(`${ok ? 'OK  ' : 'FALHA'} ${etapa}${detalhe ? ' — ' + detalhe : ''}`); };

const sessao = await startUiV2Session({ viewport: { width: 390, height: 844 } });
try {
  const ctx = await sessao.createContext({ viewport: { width: 390, height: 844 } });
  const { page } = await prepareUiV2Page(ctx, sessao.server.baseUrl, { theme: 'light' });
  const erros = [];
  const respostasPreview = [];
  page.on('pageerror', e => erros.push(String(e.message).slice(0, 140)));
  page.on('console', m => { if (m.type() === 'error') erros.push(m.text().slice(0, 140)); });
  /* Captura o corpo do erro do /preview: sem isso o 400 é opaco. */
  page.on('request', r => {
    if (r.url().includes('/lc142/preview')) {
      try {
        const b = JSON.parse(r.postData() || '{}');
        fs.writeFileSync(path.join(SAIDA, 'payload-preview-real.json'), JSON.stringify(b, null, 1), 'utf8');
      } catch { /* ignore */ }
    }
  });
  page.on('response', async r => {
    if (r.url().includes('/lc142/preview')) {
      let corpo = '';
      try { corpo = (await r.text()).slice(0, 500); } catch { /* ignore */ }
      respostasPreview.push({ status: r.status(), corpo });
    }
  });

  await page.route('**/api/calc/cnis/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(CNIS) }));
  /* Duplo da rota de snapshot: devolve o shape oficial com proveniência.
   * Os LIMITES precisam terminar no corte (`through`): limite de competência
   * posterior ao snapshot é rejeitado por `validateSnapshot` — e a recusa é
   * correta, porque o motor não pode aplicar piso/teto de mês não fotografado. */
  await page.route('**/lc142/snapshot', async r => {
    const req = r.request().postDataJSON();
    const { montarSnapshotLc142 } = await import('../lib/calc/lc142-snapshot-source.mjs');
    const corte = req.through;
    const limitesDoCorte = LIMITES.filter(item => item.month <= corte);
    const snapshot = montarSnapshotLc142({
      corpoBruto: CORPO_INDICES,
      payload: JSON.parse(CORPO_INDICES),
      through: corte,
      limites: limitesDoCorte,
      sourceUrl: 'https://fabrica-de-calculos.app.trf3.jus.br/indices/api/v1/tabela',
      retrievedAt: new Date().toISOString()
    });
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, snapshot }) });
  });

  const avancar = async () => {
    for (const sel of [
      '.lc142-surface [data-lc142-action="etapa"]:not([disabled])',
      '.lc142-surface [data-lc142-action="assistente-continuar"]:not([disabled])'
    ]) {
      const b = page.locator(sel);
      if (await b.count()) { await b.first().click(); await page.waitForTimeout(800); return true; }
    }
    return false;
  };

  await switchUiV2View(page, 'calculations');
  await page.locator('#calculationsWorkspace .calc-surface').waitFor();
  await page.locator('[data-calc-action="tab"][data-tab="previdenciario"]').click();
  await page.locator('[data-calc-action="lc142-abrir"]').click();
  await page.locator('.lc142-surface').waitFor();
  await page.locator('.lc142-surface [data-lc142-action="nova-hipotese"]').click();
  await page.locator('[data-lc142-etapa="assistente"]').waitFor();

  /* Assistente: uma pergunta por tela.
   *  - tipo `opcoes`: botões `data-lc142-action="assistente-opcao"` com `data-valor`;
   *  - tipo `data`: input `data-lc142-field="resposta"` com `data-pergunta` e um
   *    botão "Não sei" ao lado. Escolher a opção errada marcava `nao_sei` e a
   *    DIB nunca era registrada — foi o que travou a primeira tentativa.
   *
   * A data-base é a data da CORREÇÃO e não pode ser posterior à DIB (o motor
   * recusa com `lc142_reference`). Por isso a data-base aqui é anterior.
   * O vínculo em aberto também exige hipótese de continuidade declarada. */
  const respostas = { grau: 'moderada', sexo: 'feminino', nascimento: '1965-05-10', dib: '2020-03-31', dataBase: '2020-02-29' };
  for (let i = 0; i < 10; i += 1) {
    if (await page.locator('[data-lc142-etapa="cnis"]').count()) break;

    // Pergunta atual: opções ou campo de data.
    const escolha = page.locator(`.lc142-surface [data-lc142-action="assistente-opcao"][data-valor="moderada"]:visible, .lc142-surface [data-lc142-action="assistente-opcao"][data-valor="feminino"]:visible`);
    if (await escolha.count()) {
      await escolha.first().click();
      await page.waitForTimeout(250);
    }

    const campoData = page.locator('.lc142-surface input[type="date"][data-lc142-field="resposta"]');
    if (await campoData.count()) {
      const pergunta = await campoData.first().getAttribute('data-pergunta');
      const valor = respostas[pergunta];
      if (valor) {
        await campoData.first().fill(valor);
        // `fill` dispara input+change; o feature escuta pelo handler do workspace.
        await page.waitForTimeout(250);
      }
    }

    if (!(await avancar())) break;
  }
  const estadoAssistente = await page.evaluate(() => {
    const el = document.querySelector('.lc142-surface');
    return { etapa: el?.dataset.lc142Etapa };
  });
  registrar('assistente respondido', estadoAssistente.etapa === 'cnis', `etapa: ${estadoAssistente.etapa}`);

  await page.locator('[data-lc142-file="cnis"]').setInputFiles(ARQ);
  await page.waitForTimeout(800);
  await page.locator('[data-lc142-action="cnis-enviar"]:not([disabled])').first().click().catch(() => {});
  await page.waitForTimeout(2500);
  registrar('CNIS lido', await page.locator('[data-lc142-etapa="cnis"]').count() > 0);

  for (const etapa of ['vinculos', 'contribuicoes', 'premissas']) {
    for (let t = 0; t < 5; t += 1) {
      if (await page.locator(`[data-lc142-etapa="${etapa}"]`).count()) break;
      if (!(await avancar())) break;
    }
    registrar(`chegar em "${etapa}"`, await page.locator(`[data-lc142-etapa="${etapa}"]`).count() > 0);
  }

  /* O passo que faltava: consultar os índices oficiais. */
  const botaoSnapshot = page.locator('.lc142-surface [data-lc142-action="buscar-snapshot"]');
  registrar('botão de consultar índices existe', await botaoSnapshot.count() > 0);
  if (await botaoSnapshot.count()) {
    await botaoSnapshot.first().click();
    await page.waitForFunction(() => document.querySelector('.lc142-surface .lc142-snapshot'), null, { timeout: 30000 }).catch(() => {});
  }
  const temSnapshot = await page.locator('.lc142-surface .lc142-snapshot').count() > 0;
  const dadosSnapshot = await page.evaluate(() => {
    const el = document.querySelector('.lc142-surface .lc142-snapshot');
    if (!el) return null;
    const hash = el.querySelector('.lc142-hash')?.textContent?.trim() || '';
    return { texto: el.innerText.replace(/\s+/g, ' ').slice(0, 220), hashValido: /^[0-9a-f]{64}$/.test(hash) };
  });
  registrar('snapshot obtido com hash válido', temSnapshot && dadosSnapshot?.hashValido === true, dadosSnapshot?.texto?.slice(0, 150));

  const dadosDatas = await page.evaluate(() => ({
    dib: document.querySelector('.lc142-surface [data-lc142-dib]')?.textContent?.trim() || null,
    dataBase: document.querySelector('.lc142-surface [data-lc142-database]')?.textContent?.trim() || null
  }));
  /* Premissas: confirmar (alimenta `assumptions_confirmed`, exigido pelo motor). */
  const confirmarPremissas = page.locator('.lc142-surface [data-lc142-field="premissasConfirmadas"]');
  const temCheckPremissas = await confirmarPremissas.count();
  registrar('checkbox de premissas existe', temCheckPremissas > 0);
  /* A feature escuta `input` no workspace (não `change`). O `check()` do
   * Playwright dispara `change`; por isso marcamos e despachamos `input`
   * explicitamente — é o mesmo evento que o navegador emite ao clicar. */
  if (temCheckPremissas) {
    await page.evaluate(() => {
      const el = document.querySelector('.lc142-surface [data-lc142-field="premissasConfirmadas"]');
      if (!el) return;
      el.checked = true;
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.waitForTimeout(600);
  }
  const premissasMarcadas = await page.evaluate(() => {
    const el = document.querySelector('.lc142-surface [data-lc142-field="premissasConfirmadas"]');
    return el ? el.checked : null;
  });
  registrar('premissas confirmadas no DOM', premissasMarcadas === true, `checked=${premissasMarcadas}`);
  await avancar();
  const emRevisao = await page.locator('[data-lc142-etapa="revisao"]').count() > 0;
  registrar('chegar na revisão', emRevisao);

  /* Fundamentação exigida pelo motor: sem estes textos o cálculo volta
   * `blocked` com `lc142_review` e `lc142_disability_periods`. */
  const campoReview = page.locator('.lc142-surface [data-lc142-field="reviewEvidence"]');
  const campoDisability = page.locator('.lc142-surface [data-lc142-field="disabilityEvidence"]');
  registrar('campos de fundamentação existem', (await campoReview.count()) > 0 && (await campoDisability.count()) > 0);
  if (await campoReview.count()) { await campoReview.fill('CNIS sintético de 18/10/2026 conferido com o extrato.'); await page.waitForTimeout(200); }
  if (await campoDisability.count()) { await campoDisability.fill('Laudo sintético atestando grau moderado em todo o período.'); await page.waitForTimeout(200); }

  /* Confirmar a revisão dispara re-render. Reaplicamos os textos DEPOIS, para
   * garantir que o estado carregue o que o usuário digitou quando o cálculo
   * enviar o payload. */
  const caixaRevisao = page.locator('.lc142-surface input[type="checkbox"]').last();
  await caixaRevisao.check({ force: true }).catch(() => {});
  await page.waitForTimeout(500);
  const campoReviewPos = page.locator('.lc142-surface [data-lc142-field="reviewEvidence"]');
  const campoDisabilityPos = page.locator('.lc142-surface [data-lc142-field="disabilityEvidence"]');
  if (await campoReviewPos.count()) { await campoReviewPos.fill('CNIS sintético de 18/10/2026 conferido com o extrato.'); await page.waitForTimeout(300); }
  if (await campoDisabilityPos.count()) { await campoDisabilityPos.fill('Laudo sintético atestando grau moderado em todo o período.'); await page.waitForTimeout(300); }
  await page.waitForTimeout(400);
  const calcular = page.locator('.lc142-surface [data-lc142-action="calcular"]:not([disabled])');
  registrar('botão calcular habilitou', await calcular.count() > 0);
  if (await calcular.count()) { await calcular.first().click(); await page.waitForTimeout(3500); }

  const emResultado = await page.locator('[data-lc142-etapa="resultado"]').count() > 0;
  const infoResultado = await page.evaluate(() => {
    const sup = document.querySelector('.lc142-surface');
    const rmi = document.querySelector('.lc142-rmi')?.innerText?.replace(/\s+/g, ' ').trim() || '';
    return {
      rmi,
      temErro: /Data ISO inválida|Antes de calcular|bloqueado/i.test(sup?.innerText || ''),
      textoErro: (document.querySelector('.lc142-erro, [role="alert"]')?.textContent || '').replace(/\s+/g, ' ').slice(0, 300)
    };
  });
  registrar('CÁLCULO CONCLUIU (antes travava)', emResultado && !infoResultado.temErro, `RMI: ${infoResultado.rmi || '(vazio)'}`);
  if (infoResultado.temErro) registrar('mensagem de bloqueio', false, infoResultado.textoErro);
  await page.screenshot({ path: path.join(SAIDA, 'jornada-resultado-390x844.png') });

  registrar('console limpo na jornada', erros.length === 0, erros.slice(0, 2).join(' | '));
} finally {
  await sessao.stop();
  fs.rmSync(ARQ, { force: true });
}

const falhas = relatorio.filter(r => !r.ok);
fs.writeFileSync(path.join(SAIDA, 'jornada-6.42.1.json'), JSON.stringify(relatorio, null, 2), 'utf8');
console.log(`\n=== ${relatorio.length - falhas.length}/${relatorio.length} OK ===`);
if (falhas.length) { for (const f of falhas) console.log(`  - ${f.etapa}: ${f.detalhe || ''}`); process.exitCode = 1; }
