import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { prepareUiV2Page, startUiV2Session } from './ui_v2_helpers.mjs';
import { planTaskDuplicateCandidatePairs } from '../lib/tasks/task-duplicate-review.mjs';
import { payloadHash } from '../lib/jev-beta/classifier.mjs';

console.log('\n===============================================================');
console.log('  ATRIUM — UI V2: SUGESTÃO DA ATRIUM IA NAS TAREFAS REPETIDAS');
console.log('===============================================================\n');

const SHOTS = path.resolve(process.cwd(), 'artifacts', 'task-ai-duplicate');

function sourceTask({ id, title, process, deadline, sourceDeadline = deadline, changedAt, intimationId, extra = {} }) {
  const descricao = `Descrição sintética da tarefa ${id}.`;
  return {
    id,
    title,
    description: descricao,
    process,
    source: 'eproc',
    status: 'triagem',
    priority: 'normal',
    deadline,
    deadlineSource: 'eproc',
    sourceReportedDeadlineAt: sourceDeadline,
    sourceDeadlineChangedAt: changedAt,
    sourceIntimationId: intimationId,
    sourceManagedSnapshot: { title, description: descricao, deadline, status: 'triagem' },
    updatedAt: changedAt,
    createdAt: changedAt,
    history: [],
    timeLogs: [],
    ...extra
  };
}

const TASKS = [
  sourceTask({ id: 'ia-dup-a', title: 'Protocolar contestação do prazo do eproc', process: '5313106-50.2026.8.21.7000', deadline: '2026-10-15', changedAt: '2026-09-25T10:00:00.000Z', intimationId: 'src-ia-a' }),
  sourceTask({ id: 'ia-dup-b', title: 'Apresentar defesa escrita', process: '5313106-50.2026.8.21.7000', deadline: '2026-10-08', changedAt: '2026-09-20T10:00:00.000Z', intimationId: 'src-ia-b' }),
  sourceTask({ id: 'ia-dup-c', title: 'Manifestar sobre a suspensão comunicada', process: '5313106-50.2026.8.21.7001', deadline: '2026-10-20', changedAt: '2026-09-26T10:00:00.000Z', intimationId: 'src-ia-c' }),
  sourceTask({ id: 'ia-dup-d', title: 'Cumprir a suspensão do processo', process: '5313106-50.2026.8.21.7001', deadline: '2026-10-30', sourceDeadline: '2026-12-01', changedAt: '2026-09-21T10:00:00.000Z', intimationId: 'src-ia-d' }),
  sourceTask({ id: 'ia-dup-e', title: 'Protocolar recurso de apelação', process: '5313106-50.2026.8.21.7002', deadline: '2026-11-04', changedAt: '2026-09-27T10:00:00.000Z', intimationId: 'src-ia-e' }),
  sourceTask({ id: 'ia-dup-f', title: 'Preparar audiência de instrução', process: '5313106-50.2026.8.21.7002', deadline: '2026-11-12', changedAt: '2026-09-22T10:00:00.000Z', intimationId: 'src-ia-f' }),
  sourceTask({ id: 'ia-dup-g', title: 'Juntar procuração atualizada', process: '5313106-50.2026.8.21.7003', deadline: '2026-11-20', changedAt: '2026-09-28T10:00:00.000Z', intimationId: 'src-ia-g' }),
  sourceTask({ id: 'ia-dup-h', title: 'Anexar documento complementar do cliente', process: '5313106-50.2026.8.21.7003', deadline: '2026-11-18', changedAt: '2026-09-23T10:00:00.000Z', intimationId: 'src-ia-h' }),
  { ...sourceTask({ id: 'ia-dup-i', title: 'Conferir prazo informado pelo eproc — contestação', process: '5313106-50.2026.8.21.7004', deadline: '2026-10-10', changedAt: '2026-09-24T10:00:00.000Z', intimationId: 'src-ia-i' }), absorbedInto: 'ia-dup-j', absorbedAt: '2026-09-30T05:00:00.000Z', absorbedBy: 'Atrium IA', absorbReason: 'same-act-autonomous', active: false },
  sourceTask({ id: 'ia-dup-j', title: 'Protocolar contestação (fonte mais recente)', process: '5313106-50.2026.8.21.7004', deadline: '2026-10-10', changedAt: '2026-09-29T10:00:00.000Z', intimationId: 'src-ia-j' })
];

const VERCEDICTS = {
  'ia-dup-a|ia-dup-b': { verdict: 'mesma', confidence: 0.95, action: 'suggest', reason: 'SUGGEST_ONLY' },
  'ia-dup-c|ia-dup-d': { verdict: 'mesma', confidence: 0.93, action: 'suggest', reason: 'SUGGEST_ONLY' },
  // Mesmo formato que o motor devolve de verdade: veredito `diferente` com o código estável
  // `SUGGEST_ONLY` como motivo — o painel precisa traduzir, nunca mostrar o código.
  'ia-dup-e|ia-dup-f': { verdict: 'diferente', confidence: 0.98, action: 'suggest', reason: 'SUGGEST_ONLY' }
};

const { pairs } = planTaskDuplicateCandidatePairs({ tasks: TASKS, groupedPublicationKeys: [] });
const entries = {};
for (const pair of pairs) {
  const veredito = VERCEDICTS[pair.key];
  if (!veredito) continue;
  entries[pair.key] = {
    verdict: veredito.verdict,
    confidence: veredito.confidence,
    action: veredito.action,
    reason: veredito.reason,
    pairType: 'task-same-process',
    payloadHash: payloadHash(pair.text),
    at: '2026-09-30T05:10:00.000Z'
  };
}
assert.equal(pairs.length, 4, `as tarefas sintéticas precisam formar quatro pares (achei ${pairs.length})`);

const dataDirectory = await mkdtemp(path.join(tmpdir(), 'atrium-task-ai-'));
await writeFile(
  path.join(dataDirectory, 'task-duplicate-review.json'),
  `${JSON.stringify({ version: 1, generatedAt: '2026-09-30T05:10:00.000Z', entries }, null, 2)}\n`,
  { encoding: 'utf8', mode: 0o600 }
);

const session = await startUiV2Session({ viewport: { width: 1250, height: 900 }, dataDirectory });
const absorbedBefore = 1;

/** Contraste real (texto × primeiro fundo não transparente) do seletor, arredondado. */
async function contrasteDe(page, seletor) {
  return page.locator(seletor).first().evaluate(element => {
    const paraRgb = valor => {
      const match = String(valor).match(/rgba?\(([^)]+)\)/);
      if (!match) return null;
      const [r, g, b] = match[1].split(',').map(parte => parseFloat(parte));
      return [r, g, b];
    };
    const luminancia = ([r, g, b]) => {
      const canal = valor => {
        const v = valor / 255;
        return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b);
    };
    const texto = paraRgb(getComputedStyle(element).color);
    let alvo = element;
    let fundo = null;
    while (alvo && !fundo) {
      const cor = getComputedStyle(alvo).backgroundColor;
      const rgb = paraRgb(cor);
      if (rgb && !/rgba\(\s*0,\s*0,\s*0,\s*0\s*\)/.test(cor)) fundo = rgb;
      alvo = alvo.parentElement;
    }
    if (!texto || !fundo) return null;
    const a = luminancia(texto);
    const b = luminancia(fundo);
    const [claro, escuro] = a > b ? [a, b] : [b, a];
    return Number(((claro + 0.05) / (escuro + 0.05)).toFixed(2));
  });
}

/** Captura de viewport (o app rola em container próprio: fullPage sai em branco). */
async function capturarPainel(page, destino) {
  await page.locator('#taskAiDuplicatePanel').scrollIntoViewIfNeeded();
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${destino}-topo.png` });
  const desfazer = page.locator('[data-task-ai-duplicate-undo]').first();
  if (await desfazer.count()) {
    await desfazer.scrollIntoViewIfNeeded();
    await page.waitForTimeout(250);
    await page.screenshot({ path: `${destino}-fim.png` });
  }
}

async function openPanel(context, theme, { stubTriage = true, truncated = false } = {}) {
  const { page, pageErrors } = await prepareUiV2Page(context, session.server.baseUrl, { theme });
  if (truncated) await page.route('**/api/ai-classifier/task-duplicate-candidates', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ ok: true, enabled: true, pending: 0, pairs: [], absorbed: [], truncated: true })
  }));
  if (stubTriage) {
    // A suíte não pode depender do provedor de IA: a rota de classificação é respondida com um
    // payload determinístico para exercitar o painel (a rota real tem contrato próprio em
    // tests/task_duplicate_http.mjs).
    await page.route('**/api/ai-classifier/triage-task-duplicates', route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, classified: 1, failed: 0, pending: 0, candidates: 4, threshold: 0.9, limit: 10, revision: '', results: [], absorbed: [], refused: [{ key: 'ia-dup-g|ia-dup-h', motivo: 'abaixo-do-limiar', confidence: 0.7 }] })
    }));
  }
  const persistiu = await page.evaluate(async seed => {
    const { Store } = window.Atrium;
    Store.state.tasks = seed.tasks;
    Store.state.settings = { ...(Store.state.settings || {}), aiClassifier: { enabled: true } };
    Store.state.audit = [];
    return (await Store.flush()) === true;
  }, { tasks: TASKS });
  assert.equal(persistiu, true, 'as tarefas sintéticas precisam persistir para o painel ler do servidor');
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('#view-dashboard.active').waitFor();
  await page.evaluate(() => {
    window.Atrium.App.switchView('kanban');
    document.getElementById('taskKanbanViewButton')?.click();
  });
  // Os painéis de análise nascem recolhidos: o botão discreto é o gatilho oficial.
  const analises = page.locator('#taskAnalysisToggle');
  await analises.waitFor({ timeout: 15000 });
  assert.equal(await page.locator('#taskAnalysisBody').isVisible(), false, 'os painéis de análise nascem recolhidos');
  await analises.click();
  await page.locator('#taskAiDuplicatePanel:not([hidden])').waitFor({ timeout: 15000 });
  return { page, pageErrors };
}

try {
  console.log('[V1] Sugestão do Atrium IA: painel real, motivos declarados e desfazer visível...');
  {
    const context = await session.createContext({ viewport: { width: 1250, height: 900 } });
    const { page, pageErrors } = await openPanel(context, 'light');
    const painel = page.locator('#taskAiDuplicatePanel');
    const texto = await painel.innerText();
    assert.match(texto, /Sugestão do Atrium IA/i);
    // A faixa do Atrium IA fica visível desde a entrada na view (sem abrir os painéis).
    const faixa = page.locator('#taskAiPanel');
    await faixa.waitFor({ timeout: 15000 });
    const faixaTexto = await faixa.innerText();
    assert.match(faixaTexto, /(Sem tarefas repetidas para conferir|tarefas? repetidas? para conferir)/i, 'a faixa resume a conferência das repetidas');
    assert.match(faixaTexto, /1 unificada/i, 'a faixa declara a absorção automática');
    assert.equal(await faixa.locator('[data-task-ai-triage]').isVisible(), true, 'a faixa oferece a classificação das repetidas');
    assert.match(texto, /Mesmo ato descrito de outra forma \(4\)/, 'o painel precisa listar os quatro pares do mesmo processo');
    assert.match(texto, /5313106-50\.2026\.8\.21\.7000/, 'o CNJ formatado do par aparece');
    assert.match(texto, /MESMO ATO/, 'o veredito do modelo é declarado sem jargão');
    assert.match(texto, /PROVIDÊNCIAS DIFERENTES/, 'veredito de recusa aparece com o próprio rótulo');
    assert.match(texto, /AGUARDANDO CLASSIFICAÇÃO/, 'par ainda não classificado não é apresentado como decidido');
    assert.match(texto, /confiança 0,95/, 'a confiança do veredito é declarada');
    assert.match(texto, /tem prazo digitado por pessoa — a decisão é sua/, 'o motivo de não absorver sozinho é explicado em linguagem');
    assert.match(texto, /são providências diferentes deste processo/, 'providências distintas são explicadas');
    assert.match(texto, /Unificadas automaticamente \(1\)/i, 'o bloco do que a autonomia absorveu aparece');
    assert.match(texto, /Desfazer/, 'absorção automática oferece desfazer');
    const anunciosAuto = (texto.match(/unifica este par na próxima/g) || []).length;
    assert.equal(anunciosAuto, 1, 'só o par elegível é anunciado como absorvível sozinho');
    assert.doesNotMatch(texto, /SUGGEST_ONLY|LOW_CONFIDENCE_REVIEW|INSUFFICIENT_EVIDENCE/, 'o painel não expõe código interno do motor');
    assert.match(texto, /o Atrium IA concluiu a leitura das duas tarefas/, 'o motivo do motor chega em linguagem');
    assert.equal((texto.match(/^UNIFICADA$/gm) || []).length, 2, 'só par com veredito `mesma` declara uma tarefa absorvida');
    assert.equal((texto.match(/^TAREFA [AB]$/gm) || []).length, 4, 'par sem plano (diferente ou não classificado) declara as duas tarefas como leituras, não como absorção');

    const botoesAbsorver = await page.locator('[data-task-ai-duplicate-absorb]').count();
    assert.equal(botoesAbsorver, 2, 'só pares `mesma` com dono definido oferecem absorção');
    const overflow = await page.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - window.innerWidth);
    assert.ok(overflow <= 1, `o painel não pode criar rolagem horizontal global (${overflow}px)`);
    const idsDuplicados = await page.evaluate(() => {
      const ids = [...document.querySelectorAll('[id]')].map(element => element.id);
      return ids.filter((id, index) => ids.indexOf(id) !== index);
    });
    assert.deepEqual(idsDuplicados, [], 'nenhum id duplicado no DOM');
    const larguraBotao = await page.locator('[data-task-ai-duplicate-absorb]').first().evaluate(element => Math.round(element.getBoundingClientRect().height));
    assert.ok(larguraBotao >= 36, `o botão de absorver mantém alvo de toque (${larguraBotao}px)`);
    for (const seletor of ['.task-ai-duplicate-side > span', '.task-ai-duplicate-reason', '.task-ai-duplicate-note', '.task-ai-duplicate-note.is-auto', '.task-ai-duplicate-count', '.task-ai-duplicate-absorbed-body small']) {
      const contraste = await contrasteDe(page, seletor);
      assert.ok(contraste === null || contraste >= 4.5, `${seletor} precisa de contraste ≥ 4,5:1 no tema claro (medi ${contraste})`);
    }
    await capturarPainel(page, path.join(SHOTS, 'desktop-light'));
    await painel.screenshot({ path: path.join(SHOTS, 'bloco-1250-light.png') });

    // O botão do painel passa pelo mesmo alerta de risco da consolidação humana.
    await page.locator('[data-task-ai-duplicate-absorb]').first().click();
    await page.locator('#riskConfirmAcknowledge').waitFor({ timeout: 10000 });
    const alerta = await page.locator('.risk-confirm-modal').innerText();
    assert.match(alerta, /Você tem certeza que deseja unificar esta duplicata\?/, 'absorção pedida por pessoa exige o alerta de risco');
    assert.match(alerta, /nenhum prazo é alterado/, 'o alerta diz o que não muda');
    await page.locator('[data-risk-action="cancel"]').first().click();
    await page.locator('.risk-confirm-modal').waitFor({ state: 'detached' });
    assert.equal(
      await page.evaluate(() => window.Atrium.Store.state.tasks.filter(task => task.absorbedInto).length),
      absorbedBefore,
      'cancelar o alerta não absorve nada'
    );

    // Classificar (rota respondida com payload determinístico): o resumo precisa ser declarado e o
    // painel continua de pé, sem prometer absorção que não aconteceu.
    await page.evaluate(() => {
      window.__taskAiToasts = [];
      const original = window.Atrium.App.toast.bind(window.Atrium.App);
      window.Atrium.App.toast = (message, type) => {
        window.__taskAiToasts.push({ message, type });
        return original(message, type);
      };
    });
    await page.locator('[data-task-ai-duplicate-run]').click();
    await page.waitForFunction(() => (window.__taskAiToasts || []).length > 0, null, { timeout: 15000 });
    const toasts = await page.evaluate(() => window.__taskAiToasts);
    assert.match(String(toasts[0]?.message || ''), /classificad[oa]s?/, 'o resumo da classificação é declarado em linguagem');
    assert.equal(toasts[0]?.type, 'info', 'sem absorção não há toast de sucesso');
    assert.equal(await page.locator('#taskAiDuplicatePanel:not([hidden])').count(), 1, 'o painel continua de pé depois da classificação');
    assert.equal(await page.locator('[data-task-ai-duplicate-run]').count(), 1, 'nada persistido no servidor: o par continua pendente e o botão permanece (a autoridade é o servidor)');
    assert.equal(await page.locator('#taskAiPanel [data-task-ai-triage]').count(), 1, 'a faixa continua oferecendo a classificação enquanto o servidor declarar pendência');
    assert.match(await page.locator('#taskAiDuplicatePanel').innerText(), /tem prazo digitado por pessoa — a decisão é sua/, 'a lista segue declarando o motivo de cada recusa');
    assert.deepEqual(pageErrors, [], `Pageerrors: ${pageErrors.join(' | ')}`);
    await capturarPainel(page, path.join(SHOTS, 'desktop-light-depois'));

    const contextoEscuro = await session.createContext({ viewport: { width: 1250, height: 900 } });
    const escuro = await openPanel(contextoEscuro, 'dark');
    for (const seletor of ['.task-ai-duplicate-side > span', '.task-ai-duplicate-reason', '.task-ai-duplicate-note', '.task-ai-duplicate-note.is-auto', '.task-ai-duplicate-count', '.task-ai-duplicate-absorbed-body small']) {
      const contraste = await contrasteDe(escuro.page, seletor);
      assert.ok(contraste === null || contraste >= 4.5, `${seletor} precisa de contraste ≥ 4,5:1 no tema escuro (medi ${contraste})`);
    }
    await capturarPainel(escuro.page, path.join(SHOTS, 'desktop-dark'));
    await escuro.page.locator('#taskAiDuplicatePanel').screenshot({ path: path.join(SHOTS, 'bloco-1250-dark.png') });
    assert.deepEqual(escuro.pageErrors, [], `Pageerrors (dark): ${escuro.pageErrors.join(' | ')}`);
    await contextoEscuro.close();
    await context.close();
  }

  console.log('[V2] Mobile: o painel empilha sem cortar conteúdo nem alvo de toque...');
  {
    const context = await session.createContext({ viewport: { width: 390, height: 844 } });
    const { page, pageErrors } = await openPanel(context, 'light');
    const overflow = await page.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - window.innerWidth);
    assert.ok(overflow <= 1, `o painel não pode estourar a largura no celular (${overflow}px)`);
    const caixa = await page.locator('#taskAiDuplicatePanel').evaluate(element => {
      const rect = element.getBoundingClientRect();
      return { largura: Math.round(rect.width), altura: Math.round(rect.height), direita: Math.round(rect.right) };
    });
    assert.ok(caixa.direita <= 391, `o painel fica dentro do viewport (${caixa.direita}px)`);
    const alturaBotao = await page.locator('[data-task-ai-duplicate-absorb]').first().evaluate(element => Math.round(element.getBoundingClientRect().height));
    assert.ok(alturaBotao >= 40, `alvo de toque do botão no celular (${alturaBotao}px)`);
    const texto = await page.locator('#taskAiDuplicatePanel').innerText();
    assert.match(texto, /Mesmo ato descrito de outra forma/);
    await capturarPainel(page, path.join(SHOTS, 'mobile-light'));

    const contextoEscuro = await session.createContext({ viewport: { width: 390, height: 844 } });
    const escuro = await openPanel(contextoEscuro, 'dark');
    await capturarPainel(escuro.page, path.join(SHOTS, 'mobile-dark'));
    assert.deepEqual(escuro.pageErrors, [], `Pageerrors (mobile dark): ${escuro.pageErrors.join(' | ')}`);
    await contextoEscuro.close();
    assert.deepEqual(pageErrors, [], `Pageerrors: ${pageErrors.join(' | ')}`);
    await context.close();
  }

  console.log('[V3] Atrium IA desligado: o painel não aparece e nada é prometido...');
  {
    const context = await session.createContext({ viewport: { width: 1250, height: 900 } });
    const { page } = await openPanel(context, 'light');
    await page.evaluate(async () => {
      const { Store } = window.Atrium;
      Store.state.settings = { ...(Store.state.settings || {}), aiClassifier: { enabled: false } };
      await Store.flush();
    });
    await page.reload({ waitUntil: 'networkidle' });
    await page.evaluate(() => {
      window.Atrium.App.switchView('kanban');
      document.getElementById('taskKanbanViewButton')?.click();
    });
    await page.waitForTimeout(1500);
    const visivel = await page.evaluate(() => {
      const host = document.getElementById('taskAiDuplicatePanel');
      return Boolean(host && !host.hidden && host.innerHTML.trim());
    });
    assert.equal(visivel, false, 'recurso desligado não deixa painel de sugestão na tela');
    assert.equal(await page.locator('#taskAiPanel').isVisible(), false, 'com o Atrium IA desligado a faixa de IA não aparece');
    await context.close();
  }

  console.log('[V4] Divergência de prazo com a fonte explicada em linguagem no cartão real...');
  {
    const context = await session.createContext({ viewport: { width: 1250, height: 900 } });
    const { page, pageErrors } = await prepareUiV2Page(context, session.server.baseUrl, { theme: 'light' });
    const persistiu = await page.evaluate(async () => {
      const { Store } = window.Atrium;
      Store.state.tasks = [{
        id: 'task-divergencia-sintetica',
        title: 'Prazo eproc — contestação com contagem ajustada por pessoa',
        description: 'Contagem ajustada manualmente (embargos) — a fonte não é sobrescrita.',
        process: '5313106-50.2026.8.21.7000',
        source: 'eproc',
        status: 'triagem',
        priority: 'normal',
        deadline: '2026-10-02',
        deadlineSource: 'eproc',
        sourceReportedDeadlineAt: '2026-09-20',
        deadlineConflict: { source: 'eproc', sourceValue: '2026-09-20', humanValue: '2026-10-02', mode: 'auto' },
        createdAt: '2026-09-25T10:00:00.000Z',
        updatedAt: '2026-09-25T10:00:00.000Z',
        history: [],
        timeLogs: []
      }];
      Store.state.intimations = [];
      return (await Store.flush()) === true;
    });
    assert.equal(persistiu, true, 'a tarefa sintética com divergência precisa persistir');
    await page.reload({ waitUntil: 'networkidle' });
    await page.evaluate(() => {
      window.Atrium.App.switchView('kanban');
      document.getElementById('taskKanbanViewButton')?.click();
    });
    const cartao = page.locator('#kanbanBoard [data-task-id="task-divergencia-sintetica"]');
    await cartao.waitFor({ timeout: 15000 });
    const texto = await cartao.innerText();
    assert.match(texto, /eproc declarou/, 'o cartão mostra o que a fonte declarou');
    assert.match(texto, /2026-10-02|02\/10\/2026/, 'o cartão mostra a data vigente da tarefa');
    assert.match(texto, /data digitada por pessoa, não alterada/, 'o cartão explica que a data da tarefa prevalece e não foi alterada');
    assert.doesNotMatch(texto, /conferir$/m, 'o texto antigo, sem explicação, não pode voltar');
    const prazoNaTela = await page.evaluate(() => window.Atrium.Store.state.tasks[0].deadline);
    assert.equal(prazoNaTela, '2026-10-02', 'a explicação nunca altera a data da tarefa');
    await cartao.scrollIntoViewIfNeeded();
    await page.waitForTimeout(250);
    await page.screenshot({ path: path.join(SHOTS, 'divergencia-1250.png') });
    assert.deepEqual(pageErrors, [], `Pageerrors (divergência): ${pageErrors.join(' | ')}`);
    await context.close();
  }

  console.log('[V5] Curadoria hostil: responsável com HTML não vira elemento no painel (XSS armazenado)...');
  {
    const context = await session.createContext({ viewport: { width: 1250, height: 900 } });
    const { page, pageErrors } = await prepareUiV2Page(context, session.server.baseUrl, { theme: 'light' });
    const payload = '<img src=x onerror="window.__xssExecutou=1">';
    const persistiu = await page.evaluate(async xss => {
      const { Store } = window.Atrium;
      Store.state.settings = { ...(Store.state.settings || {}), aiClassifier: { enabled: false } };
      Store.state.intimations = [];
      const base = {
        process: '5313106-50.2026.8.21.7000',
        source: 'eproc',
        status: 'triagem',
        priority: 'normal',
        deadline: '2026-10-15',
        deadlineSource: 'eproc',
        sourceReportedDeadlineAt: '2026-10-15',
        sourceIntimationId: 'src-xss-sintetica',
        intimationId: 'src-xss-sintetica',
        responsible: xss,
        history: [],
        timeLogs: []
      };
      Store.state.tasks = [
        { ...base, id: 'xss-sintetica-a', title: 'Conferir prazo informado pelo eproc — suspensão', createdAt: '2026-09-20T10:00:00.000Z', updatedAt: '2026-09-20T10:00:00.000Z' },
        { ...base, id: 'xss-sintetica-b', title: 'Acompanhar suspensão comunicada', createdAt: '2026-09-21T10:00:00.000Z', updatedAt: '2026-09-21T10:00:00.000Z' }
      ];
      return (await Store.flush()) === true;
    }, payload);
    assert.equal(persistiu, true, 'as tarefas hostis precisam persistir (o valor vem do estado, como em produção)');
    await page.reload({ waitUntil: 'networkidle' });
    await page.evaluate(() => {
      window.Atrium.App.switchView('kanban');
      document.getElementById('taskKanbanViewButton')?.click();
    });
    await page.locator('#taskAnalysisToggle').click();
    await page.locator('#taskDuplicatePanel:not([hidden])').waitFor({ timeout: 15000 });
    const painel = await page.evaluate(() => {
      const host = document.getElementById('taskDuplicatePanel');
      return { imgs: host.querySelectorAll('img').length, texto: host.innerText };
    });
    assert.equal(painel.imgs, 0, 'o responsável hostil não pode virar elemento no DOM');
    assert.equal(await page.evaluate(() => window.__xssExecutou), undefined, 'nenhum script do valor executa');
    assert.match(painel.texto, /<img src=x/, 'o valor aparece como texto, escapado, para a pessoa ler');
    assert.deepEqual(pageErrors, [], `Pageerrors (XSS): ${pageErrors.join(' | ')}`);
    await context.close();
  }

  console.log('[V6] Risco de estouro: selo, filtro e análise declarada (sem tocar o prazo)...');
  {
    const context = await session.createContext({ viewport: { width: 1250, height: 900 } });
    const { page, pageErrors } = await prepareUiV2Page(context, session.server.baseUrl, { theme: 'light' });
    const riscosStub = {
      ok: true,
      enabled: true,
      generatedAt: '2026-09-30T06:00:00.000Z',
      pending: 1,
      suggestions: {
        'risco-sintetico-a': { risk: 'alto', riskConfidence: 0.88, action: 'suggest', reasonLabel: 'a confiança da leitura ficou baixa e pede conferência', at: '2026-09-30T06:00:00.000Z' },
        'risco-sintetico-b': { risk: 'baixo', riskConfidence: 0.71, action: 'suggest', reasonLabel: 'a leitura foi concluída sem impedimento identificado', at: '2026-09-30T06:00:00.000Z' }
      }
    };
    await page.route('**/api/ai-classifier/task-risks', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(riscosStub) }));
    await page.route('**/api/ai-classifier/triage-task-risks', route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, classified: 1, failed: 0, pending: 0, results: [] })
    }));
    const persistiu = await page.evaluate(async () => {
      const { Store } = window.Atrium;
      const base = {
        process: '5313106-50.2026.8.21.7000',
        source: 'eproc',
        status: 'andamento',
        priority: 'normal',
        createdAt: '2026-09-20T10:00:00.000Z',
        updatedAt: '2026-09-25T10:00:00.000Z',
        history: [],
        timeLogs: []
      };
      Store.state.tasks = [
        { ...base, id: 'risco-sintetico-a', title: 'Minutar contestação com perícia', deadline: '2026-10-08', fatalDeadline: '', description: 'Peça complexa.' },
        { ...base, id: 'risco-sintetico-b', title: 'Juntar comprovante simples', deadline: '2026-10-20', fatalDeadline: '', description: 'Documento único.' },
        { ...base, id: 'risco-sintetico-c', title: 'Tarefa ainda não analisada', deadline: '2026-10-25', fatalDeadline: '', description: 'Sem leitura de risco.' }
      ];
      Store.state.settings = { ...(Store.state.settings || {}), aiClassifier: { enabled: true } };
      return (await Store.flush()) === true;
    });
    assert.equal(persistiu, true, 'as tarefas sintéticas precisam persistir');
    await page.reload({ waitUntil: 'networkidle' });
    await page.evaluate(() => {
      window.Atrium.App.switchView('kanban');
      document.getElementById('taskKanbanViewButton')?.click();
    });
    const cartaoAlto = page.locator('#kanbanBoard [data-task-id="risco-sintetico-a"]');
    await cartaoAlto.waitFor({ timeout: 15000 });

    const textoCartao = await cartaoAlto.innerText();
    assert.match(textoCartao, /Atraso provável: alto/, 'o cartão mostra o selo de atraso provável alto');
    assert.match(textoCartao, /08\/10\/2026|2026-10-08/, 'o prazo da tarefa continua visível e intocado');
    const selo = cartaoAlto.locator('.task-risk-chip');
    assert.equal(await selo.count(), 1, 'um selo por tarefa com sugestão');
    assert.match(String(await selo.getAttribute('title')), /o prazo não foi alterado/, 'o selo declara que o prazo não mudou');
    assert.equal(await page.locator('#kanbanBoard [data-task-id="risco-sintetico-c"] .task-risk-chip').count(), 0, 'tarefa sem leitura não ganha selo');

    // A interface de IA fica visível sem abrir a conferência: a faixa mostra o estado e as ações.
    const faixa = page.locator('#taskAiPanel');
    await faixa.waitFor({ timeout: 15000 });
    assert.equal(await faixa.locator('#taskRiskAnalyzeButton').isVisible(), true, 'o botão Analisar riscos fica visível sem abrir a conferência');
    assert.equal(await faixa.locator('#taskRiskFilter').isVisible(), true, 'o filtro de risco fica visível sem abrir a conferência');
    assert.equal(await page.locator('#taskAnalysisBody').isVisible(), false, 'os painéis completos continuam recolhidos');
    assert.match(await faixa.innerText(), /Atraso provável: 1 tarefa ainda sem leitura/i, 'a faixa declara quantas tarefas ainda não foram lidas');

    // Abrir a conferência continua sendo o gesto para as listas completas.
    await page.locator('#taskAnalysisToggle').click();
    await page.selectOption('#taskRiskFilter', 'alto');
    await page.waitForTimeout(400);
    assert.equal(await page.locator('#kanbanBoard [data-task-id="risco-sintetico-a"]').count(), 1, 'risco alto permanece');
    assert.equal(await page.locator('#kanbanBoard [data-task-id="risco-sintetico-b"]').count(), 0, 'risco baixo sai do recorte');
    assert.equal(await page.locator('#kanbanBoard [data-task-id="risco-sintetico-c"]').count(), 0, 'sem análise sai do recorte');
    await page.selectOption('#taskRiskFilter', 'sem-sugestao');
    await page.waitForTimeout(400);
    assert.equal(await page.locator('#kanbanBoard [data-task-id="risco-sintetico-c"]').count(), 1, 'sem análise aparece no filtro próprio');
    assert.equal(await page.locator('#kanbanBoard [data-task-id="risco-sintetico-a"]').count(), 0);
    assert.equal(
      await page.evaluate(() => window.Atrium.Store.state.tasks.find(task => task.id === 'risco-sintetico-a').deadline),
      '2026-10-08',
      'o filtro e o selo nunca alteram o prazo da tarefa'
    );

    await page.selectOption('#taskRiskFilter', 'all');
    await page.waitForTimeout(400);
    // Print do recorte certo: o quadro (selos) e o painel (filtro + botão de análise).
    await page.locator('#kanbanBoard').scrollIntoViewIfNeeded();
    await page.waitForTimeout(250);
    await page.screenshot({ path: path.join(SHOTS, 'risco-1250-light-quadro.png') });
    await page.locator('#taskInsightsPanel').scrollIntoViewIfNeeded();
    await page.waitForTimeout(250);
    await page.screenshot({ path: path.join(SHOTS, 'risco-1250-light-painel.png') });

    await page.evaluate(() => {
      window.__riskToasts = [];
      const original = window.Atrium.App.toast.bind(window.Atrium.App);
      window.Atrium.App.toast = (message, type) => {
        window.__riskToasts.push({ message, type });
        return original(message, type);
      };
    });
    await page.locator('#taskRiskAnalyzeButton').click();
    await page.waitForFunction(() => (window.__riskToasts || []).length > 0, null, { timeout: 15000 });
    const toasts = await page.evaluate(() => window.__riskToasts);
    assert.match(String(toasts[0]?.message || ''), /analisad[ao]s?/, 'a análise resume em linguagem');
    assert.match(String(toasts[0]?.message || ''), /o prazo não foi alterado/, 'o resumo repete o limite humano');
    assert.deepEqual(pageErrors, [], `Pageerrors (risco): ${pageErrors.join(' | ')}`);
    await context.close();

    const escuro = await session.createContext({ viewport: { width: 1250, height: 900 } });
    const { page: paginaEscura } = await prepareUiV2Page(escuro, session.server.baseUrl, { theme: 'dark' });
    await paginaEscura.route('**/api/ai-classifier/task-risks', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(riscosStub) }));
    await paginaEscura.reload({ waitUntil: 'networkidle' });
    await paginaEscura.evaluate(() => {
      window.Atrium.App.switchView('kanban');
      document.getElementById('taskKanbanViewButton')?.click();
    });
    await paginaEscura.locator('#kanbanBoard [data-task-id="risco-sintetico-a"]').waitFor({ timeout: 15000 });
    const contrasteEscuro = await contrasteDe(paginaEscura, '.task-risk-chip.risk-alto');
    assert.ok(contrasteEscuro === null || contrasteEscuro >= 4.5, `o selo de risco alto precisa de contraste ≥ 4,5:1 no escuro (medi ${contrasteEscuro})`);
    await paginaEscura.locator('#kanbanBoard').scrollIntoViewIfNeeded();
    await paginaEscura.waitForTimeout(250);
    await paginaEscura.screenshot({ path: path.join(SHOTS, 'risco-1250-dark-quadro.png') });
    await escuro.close();

    const mobile = await session.createContext({ viewport: { width: 390, height: 844 } });
    const { page: paginaMobile } = await prepareUiV2Page(mobile, session.server.baseUrl, { theme: 'light' });
    await paginaMobile.route('**/api/ai-classifier/task-risks', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(riscosStub) }));
    await paginaMobile.reload({ waitUntil: 'networkidle' });
    await paginaMobile.evaluate(() => {
      window.Atrium.App.switchView('kanban');
      document.getElementById('taskKanbanViewButton')?.click();
    });
    await paginaMobile.locator('#kanbanBoard [data-task-id="risco-sintetico-a"]').waitFor({ timeout: 15000 });
    const overflow = await paginaMobile.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - window.innerWidth);
    assert.ok(overflow <= 1, `o selo de risco não pode estourar a largura no celular (${overflow}px)`);
    await paginaMobile.locator('#kanbanBoard [data-task-id="risco-sintetico-a"]').scrollIntoViewIfNeeded();
    await paginaMobile.waitForTimeout(250);
    await paginaMobile.screenshot({ path: path.join(SHOTS, 'risco-390-light.png') });
    await mobile.close();
  }

  console.log('[V7] Carteira e consistência: resumo, correção com evidência e desfazer...');
  {
    const context = await session.createContext({ viewport: { width: 1250, height: 900 } });
    const { page, pageErrors } = await prepareUiV2Page(context, session.server.baseUrl, { theme: 'light' });
    await page.route('**/api/ai-classifier/task-insights', route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        generatedAt: '2026-09-30T06:30:00.000Z',
        consistency: {
          fixes: [{ taskId: 'insight-sintetica-a', field: 'completedAt', proposed: '2026-09-28T12:00:00.000Z', evidence: 'tarefa está em "concluida" e sem data de conclusão registrada', title: 'Protocolar contestação' }],
          suggestions: [{ taskId: 'insight-sintetica-b', field: 'responsible', current: 'Pessoa Que Saiu', evidence: 'responsável não consta na equipe do escritório', title: 'Juntar procuração' }]
        },
        portfolio: { lines: ['Carteira: 2 tarefas abertas em 1 processo.', 'Atrasadas: 1 — Protocolar contestação.', 'Sem prazo informado: 1 (o prazo é decisão humana; nada é estimado aqui).'], counts: {} },
        assignment: { suggestions: [{ taskId: 'insight-sintetica-b', name: 'Advogada Teste', confidence: 0.67, basis: '2 de 3 tarefas deste tipo concluídas por Advogada Teste' }] }
      })
    }));
    await page.route('**/api/tasks/consistency/apply', route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        applied: [{ taskId: 'insight-sintetica-a', field: 'completedAt', proposed: '2026-09-28T12:00:00.000Z' }],
        tasks: [{ id: 'insight-sintetica-a', title: 'Protocolar contestação', status: 'concluida', completedAt: '2026-09-28T12:00:00.000Z', history: [] }],
        revision: 'rev-insight',
        message: '1 inconsistência(s) corrigida(s) com evidência — reversível pelo desfazer.'
      })
    }));
    await page.route('**/api/tasks/consistency/undo', route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        restored: [{ taskId: 'insight-sintetica-a', field: 'completedAt', restored: '' }],
        tasks: [{ id: 'insight-sintetica-a', title: 'Protocolar contestação', status: 'concluida', history: [] }],
        revision: 'rev-insight-2',
        message: 'Correção desfeita: os campos voltaram ao que estavam.'
      })
    }));
    const persistiu = await page.evaluate(async () => {
      const { Store } = window.Atrium;
      Store.state.tasks = [
        { id: 'insight-sintetica-a', title: 'Protocolar contestação', process: '5313106-50.2026.8.21.7000', status: 'concluida', priority: 'normal', deadline: '2026-09-25', createdAt: '2026-09-20T10:00:00.000Z', updatedAt: '2026-09-28T12:00:00.000Z', history: [], timeLogs: [] },
        { id: 'insight-sintetica-b', title: 'Juntar procuração', process: '5313106-50.2026.8.21.7000', status: 'andamento', priority: 'normal', responsible: 'Pessoa Que Saiu', deadline: '', createdAt: '2026-09-20T10:00:00.000Z', updatedAt: '2026-09-25T10:00:00.000Z', history: [], timeLogs: [] }
      ];
      Store.state.settings = { ...(Store.state.settings || {}), aiClassifier: { enabled: false } };
      return (await Store.flush()) === true;
    });
    assert.equal(persistiu, true, 'as tarefas sintéticas precisam persistir');
    await page.reload({ waitUntil: 'networkidle' });
    await page.evaluate(() => {
      window.Atrium.App.switchView('kanban');
      document.getElementById('taskKanbanViewButton')?.click();
    });
    const painel = page.locator('#taskInsightsPanel');
    await page.locator('#taskAnalysisToggle').click();
    await painel.waitFor({ timeout: 15000 });
    const texto = await painel.innerText();
    assert.match(texto, /CARTEIRA E CONSISTÊNCIA/i, 'o painel aparece mesmo com o Atrium IA desligado (é leitura determinística)');
    assert.match(texto, /Carteira: 2 tarefa/, 'o resumo da carteira é declarado');
    assert.match(texto, /Atrasadas: 1/, 'o resumo aponta as atrasadas');
    assert.match(texto, /prazo é decisão humana/, 'o resumo declara que nada é estimado');
    assert.match(texto, /1 ponto para conferência humana/, 'as sugestões ficam separadas das correções');
    assert.match(texto, /Sugestão de responsável/i, 'a sugestão de responsável aparece');
    assert.match(texto, /não atribui/i, 'o bloco declara que não atribui');

    await page.locator('[data-task-consistency-apply]').click();
    await page.locator('#riskConfirmAcknowledge').waitFor({ timeout: 10000 });
    const alerta = await page.locator('.risk-confirm-modal').innerText();
    assert.match(alerta, /Você tem certeza que deseja corrigir as inconsistências\?/);
    assert.match(alerta, /nunca sobrescreve valor existente/, 'o alerta declara o trilho da correção');
    await page.locator('#riskConfirmAcknowledge').click();
    await page.locator('#riskConfirmAccept').waitFor({ timeout: 10000 });
    await page.locator('#riskConfirmAccept').click();
    await page.waitForFunction(
      () => Boolean(window.Atrium.Store.state.tasks.find(task => task.id === 'insight-sintetica-a')?.completedAt),
      null,
      { timeout: 15000 }
    );
    const corrigida = await page.evaluate(() => window.Atrium.Store.state.tasks.find(task => task.id === 'insight-sintetica-a'));
    assert.equal(corrigida.completedAt, '2026-09-28T12:00:00.000Z', 'a correção com evidência vale no estado local');
    assert.equal(corrigida.deadline, '2026-09-25', 'a correção não toca no prazo');
    assert.equal(await page.evaluate(() => window.Atrium.Store.state.tasks.find(task => task.id === 'insight-sintetica-b').responsible), 'Pessoa Que Saiu', 'sugestão não é aplicada sozinha');

    await painel.scrollIntoViewIfNeeded();
    await page.waitForTimeout(250);
    await page.screenshot({ path: path.join(SHOTS, 'carteira-1250-light.png') });
    await page.locator('[data-task-consistency-undo]').click();
    await page.waitForFunction(
      () => !window.Atrium.Store.state.tasks.find(task => task.id === 'insight-sintetica-a')?.completedAt,
      null,
      { timeout: 15000 }
    );
    assert.equal(
      await page.evaluate(() => window.Atrium.Store.state.tasks.find(task => task.id === 'insight-sintetica-a').completedAt),
      undefined,
      'o desfazer devolve o campo ao estado anterior'
    );
    assert.deepEqual(pageErrors, [], `Pageerrors (carteira): ${pageErrors.join(' | ')}`);
    await context.close();
  }

  {
    const context = await session.createContext({ viewport: { width: 1250, height: 900 } });
    const { page, pageErrors } = await openPanel(context, 'light', { truncated: true });
    assert.match(await page.locator('#taskAiPanel').innerText(), /Conferência parcial de tarefas/i);
    assert.match(await page.locator('#taskAiDuplicatePanel').innerText(), /podem existir outros pares/i);
    assert.deepEqual(pageErrors, []);
    await context.close();
  }
  console.log('\n>>> UI V2 — SUGESTÃO DA ATRIUM IA NAS TAREFAS: PASS <<<\n');
} finally {
  await session.stop();
}
