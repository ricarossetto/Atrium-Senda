import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { prepareUiV2Page, startUiV2Session, switchUiV2View } from './ui_v2_helpers.mjs';

console.log('\n===============================================================');
console.log('  ATRIUM — UI V2: DO PRAZO À PROVIDÊNCIA NO DETALHE DA PUBLICAÇÃO');
console.log('===============================================================\n');

const SHOTS = path.resolve(process.cwd(), 'artifacts', 'publication-action');
const CNJ = '5313106-50.2026.8.21.7000';
const PUB_ID = 'eproc:tjrs-eproc-1g:publicacao-sintetica-1';
const CONF_ID = 'task:eproc-panel:sintetica-1';

const CATALOGO = [
  { name: 'Minutar contestação', points: 30, area: 'Cível' },
  { name: 'Juntar procuração aos autos', points: 6, area: 'Cível' },
  { name: 'Emitir e pagar guia de custas', points: 8, area: 'Financeiro' }
];

const ACOES = [
  { id: 'contestar', label: 'Contestar' },
  { id: 'recorrer', label: 'Recorrer' },
  { id: 'manifestar', label: 'Manifestar' },
  { id: 'cumprir', label: 'Cumprir determinação' },
  { id: 'pagar_guia', label: 'Pagar guia ou custas' },
  { id: 'juntar_documento', label: 'Juntar documento' },
  { id: 'peticao_intermediaria', label: 'Petição intermediária' },
  { id: 'preparar_audiencia', label: 'Preparar audiência' },
  { id: 'cumprimento_sentenca', label: 'Cumprimento de sentença' },
  { id: 'outro', label: 'Outro' }
];

const SEED = {
  intimations: [{
    id: PUB_ID,
    externalId: PUB_ID,
    title: 'Intimação eproc — apresentar contestação',
    process: CNJ,
    client: 'Cliente Teste',
    court: 'TJRS · 1ª Vara Cível Sintética',
    source: 'eproc',
    publishedAt: '2026-09-25',
    treatmentStatus: 'in_review',
    sourceReportedDeadlineAt: '2026-10-08',
    deadlineSource: 'eproc',
    unread: false,
    text: 'TEXTO OFICIAL SINTÉTICO\nIntime-se a parte autora para apresentar contestação no prazo legal.',
    linkedTaskIds: [CONF_ID],
    taskId: CONF_ID
  }],
  tasks: [{
    id: CONF_ID,
    externalId: CONF_ID,
    title: 'Conferir prazo informado pelo eproc — contestação',
    description: 'Conferência sintética do prazo da publicação.',
    process: CNJ,
    source: 'eproc',
    status: 'triagem',
    priority: 'normal',
    deadline: '2026-10-08',
    deadlineSource: 'eproc',
    sourceReportedDeadlineAt: '2026-10-08',
    sourceIntimationId: PUB_ID,
    intimationId: PUB_ID,
    createdAt: '2026-09-25T10:00:00.000Z',
    updatedAt: '2026-09-25T10:00:00.000Z',
    history: [],
    timeLogs: []
  }],
  configuration: { taskDefinitions: CATALOGO }
};

const dataDirectory = await mkdtemp(path.join(tmpdir(), 'atrium-providence-'));
const session = await startUiV2Session({ viewport: { width: 1250, height: 900 }, dataDirectory });

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

async function abrirDetalhe(context, theme, { sugestao } = {}) {
  const { page, pageErrors } = await prepareUiV2Page(context, session.server.baseUrl, { theme });
  // A rota de sugestão é respondida com payload determinístico (a rota real tem contrato próprio em
  // tests/publication_action.mjs) — o par de ações NÃO é stubbado: exercita o servidor de verdade.
  const corpoSugestao = sugestao || {
    ok: true,
    intimationId: PUB_ID,
    action: 'contestar',
    actionLabel: 'Contestar',
    confidence: 0.87,
    reason: 'SUGGEST_ONLY',
    reasonLabel: 'a leitura foi concluída sem impedimento identificado',
    taskDefinition: { name: 'Minutar contestação', points: 30, area: 'Cível' },
    actions: ACOES,
    catalog: CATALOGO
  };
  await page.route('**/api/ai-classifier/suggest-publication-action', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(corpoSugestao)
  }));
  // O provedor de IA real fica fora deste teste (o contrato dele vive em tests/ai_classifier.mjs):
  // a sugestão por item é respondida localmente para a página não ficar presa em rede.
  await page.route('**/api/ai-classifier/suggest', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ ok: true, enabled: true, suggestion: null })
  }));
  const persistiu = await page.evaluate(async seed => {
    const { Store } = window.Atrium;
    Store.state.intimations = seed.intimations;
    Store.state.tasks = seed.tasks;
    Store.state.configuration = { ...(Store.state.configuration || {}), taskDefinitions: seed.configuration.taskDefinitions };
    Store.state.settings = { ...(Store.state.settings || {}), aiClassifier: { enabled: true } };
    Store.state.audit = [];
    return (await Store.flush()) === true;
  }, JSON.parse(JSON.stringify(SEED)));
  assert.equal(persistiu, true, 'o seed sintético precisa persistir para o servidor responder o par de ações');
  await page.reload({ waitUntil: 'networkidle' });
  await page.evaluate(() => {
    const { App } = window.Atrium;
    App.inboxFilter = 'all';
    App.inboxCutoff = 'all';
    App.inboxSort = 'date-desc';
  });
  await switchUiV2View(page, 'inbox');
  await page.locator(`#inboxList [data-intimation-id="${PUB_ID}"]`).first().click();
  await page.locator('.publication-detail-shell').waitFor({ timeout: 15000 });
  await page.locator('[data-providence-block]').waitFor({ timeout: 15000 });
  return { page, pageErrors };
}

try {
  console.log('[P1] Bloco no detalhe: sugestão, confirmação pelo alerta de risco e desfazer...');
  {
    const context = await session.createContext({ viewport: { width: 1250, height: 900 } });
    const { page, pageErrors } = await abrirDetalhe(context, 'light');
    const bloco = page.locator('[data-providence-block]');
    // O bloco é redesenhado quando as providências cabíveis chegam do servidor.
    await page.locator('[data-playbook-block]').waitFor({ timeout: 15000 });

    let texto = await bloco.innerText();
    assert.match(texto, /Do prazo à providência/i);
    assert.match(texto, /Providência cabível/i);
    assert.match(texto, /sem prazo/i, 'o bloco declara que a tarefa nasce sem prazo');
    assert.equal(await bloco.locator('[data-providence-action]').count(), 0, 'sem sugestão não há seletor de providência');
    await bloco.scrollIntoViewIfNeeded();
    await page.waitForTimeout(250);
    await page.screenshot({ path: path.join(SHOTS, 'detalhe-1250-light-antes.png') });

    await bloco.locator('[data-detail-action="suggest-providence"]').click();
    await bloco.locator('[data-providence-action]').waitFor({ timeout: 15000 });
    texto = await bloco.innerText();
    assert.match(texto, /Contestar/, 'a natureza sugerida aparece em linguagem');
    assert.match(texto, /confiança 0,87/, 'a confiança é declarada');
    assert.match(texto, /a leitura foi concluída sem impedimento identificado/, 'o motivo do motor chega em linguagem');
    assert.doesNotMatch(texto, /SUGGEST_ONLY/, 'código interno do motor não vaza para a tela');
    assert.match(texto, /Minutar contestação/, 'o modelo do catálogo é apresentado');
    assert.equal(await bloco.locator('[data-providence-action] option').count(), 10, 'o vocabulário fixo vem do servidor');
    assert.equal(
      await bloco.locator('[data-providence-definition]').inputValue(),
      'Minutar contestação',
      'o modelo sugerido vem selecionado e pode ser trocado'
    );
    // Busca incremental: digitar filtra o catálogo (agrupado por área) e a escolha continua
    // gravando o nome oficial do modelo — o mesmo contrato do formulário de tarefa.
    const campoModelo = bloco.locator('[data-providence-definition]');
    await campoModelo.click();
    await campoModelo.fill('');
    await bloco.locator('[data-combobox-option]:not(.hidden)').first().waitFor({ timeout: 10000 });
    assert.equal(
      await bloco.locator('.modal-combobox-group:not(.hidden)').count(),
      2,
      'o combobox agrupa o catálogo por área'
    );
    await campoModelo.fill('guia');
    const opcoesVisiveis = await bloco.locator('[data-combobox-option]:not(.hidden)').evaluateAll(
      options => options.map(option => option.getAttribute('data-value'))
    );
    assert.deepEqual(opcoesVisiveis, ['Emitir e pagar guia de custas'], 'a digitação filtra o catálogo por termo');
    await bloco.locator('[data-combobox-option]:not(.hidden)').first().click();
    assert.equal(await campoModelo.inputValue(), 'Emitir e pagar guia de custas', 'a escolha grava o nome oficial do modelo');
    // Volta ao modelo sugerido para o restante do fluxo (a confirmação usa o que está no campo).
    await campoModelo.fill('Minutar contestação');
    await bloco.locator('[data-combobox-option]:not(.hidden)').first().click();
    assert.equal(await campoModelo.inputValue(), 'Minutar contestação', 'o modelo sugerido pode ser restaurado pela busca');
    const overflow = await page.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - window.innerWidth);
    assert.ok(overflow <= 1, `o bloco não pode estourar a largura (${overflow}px)`);
    for (const seletor of ['.publication-providence-suggestion small', '.publication-providence-note', '.publication-providence-field input']) {
      const contraste = await contrasteDe(page, seletor);
      assert.ok(contraste === null || contraste >= 4.5, `${seletor} precisa de contraste ≥ 4,5:1 (medi ${contraste})`);
    }

    // Cancelar o alerta não cria nada (e a conferência continua como estava).
    await bloco.locator('[data-detail-action="apply-providence"]').click();
    await page.locator('#riskConfirmAcknowledge').waitFor({ timeout: 10000 });
    const alerta = await page.locator('.risk-confirm-modal').innerText();
    assert.match(alerta, /Você tem certeza que deseja criar a tarefa e concluir a conferência\?/);
    assert.match(alerta, /A tarefa nasce sem prazo/, 'o alerta declara o limite');
    await page.locator('[data-risk-action="cancel"]').first().click();
    await page.locator('.risk-confirm-modal').waitFor({ state: 'detached' });
    assert.equal(
      await page.evaluate(() => window.Atrium.Store.state.tasks.length),
      1,
      'cancelar não cria tarefa'
    );

    // Confirmar executa o par de ações no servidor de verdade.
    await page.evaluate(() => {
      window.__providenceToasts = [];
      const original = window.Atrium.App.toast.bind(window.Atrium.App);
      window.Atrium.App.toast = (message, type) => {
        window.__providenceToasts.push({ message, type });
        return original(message, type);
      };
    });
    await bloco.locator('[data-detail-action="apply-providence"]').click();
    await page.locator('#riskConfirmAcknowledge').waitFor({ timeout: 10000 });
    await page.locator('#riskConfirmAcknowledge').click();
    await page.locator('#riskConfirmAccept').waitFor({ timeout: 10000 });
    await page.locator('#riskConfirmAccept').click();
    await page.locator('.publication-providence-undo').waitFor({ timeout: 15000 });

    const estado = await page.evaluate(() => {
      const { Store } = window.Atrium;
      const criada = Store.state.tasks.find(task => task.taskDefinition === 'Minutar contestação');
      const conferencia = Store.state.tasks.find(task => String(task.id) === 'task:eproc-panel:sintetica-1');
      return {
        tarefas: Store.state.tasks.length,
        criada: criada ? { id: criada.id, deadline: criada.deadline, fatalDeadline: criada.fatalDeadline, status: criada.status, points: criada.points, intimationId: criada.intimationId } : null,
        conferencia: { status: conferencia?.status, completedBy: conferencia?.completedBy },
        auditoria: Store.state.audit.map(entry => entry.action)
      };
    });
    assert.equal(estado.tarefas, 2, 'a tarefa específica foi criada');
    assert.ok(estado.criada, 'a tarefa criada usa o nome do catálogo');
    assert.equal(estado.criada.deadline, '', 'a tarefa nasce sem prazo (§16)');
    assert.equal(estado.criada.fatalDeadline, '', 'sem prazo fatal');
    assert.equal(estado.criada.points, 30, 'os pontos vêm do catálogo');
    assert.equal(estado.criada.intimationId, PUB_ID, 'a tarefa fica vinculada à publicação');
    assert.equal(estado.conferencia.status, 'concluida', 'a conferência foi concluída');
    assert.ok(estado.conferencia.completedBy, 'a conclusão registra quem executou');
    // A auditoria oficial é conferida na suíte de contrato da rota (tests/publication_action.mjs);
    // aqui o que importa é o que a pessoa vê: o toast do resultado e o histórico no registro.
    const toasts = await page.evaluate(() => window.__providenceToasts || []);
    assert.ok(
      toasts.some(item => /Conferência concluída e tarefa específica criada/.test(String(item.message || ''))),
      `a tela declara o resultado do par de ações (${toasts.map(item => item.message).join(' | ')})`
    );
    assert.ok(
      await page.evaluate(() => window.Atrium.Store.state.tasks.some(task => Array.isArray(task.history) && task.history.some(entry => /desfazer disponível/.test(String(entry.action || ''))))),
      'o histórico da conferência registra a conclusão com o desfazer'
    );
    assert.match(await bloco.innerText(), /Desfazer/, 'o desfazer é oferecido logo após criar');
    // Espera o toast sair antes do print: a sobreposição é comportamento normal do toast, mas o
    // print de evidência precisa mostrar o bloco inteiro (inclusive o desfazer).
    await page.waitForFunction(() => document.querySelectorAll('.toast, [data-toast]').length === 0, null, { timeout: 12000 }).catch(() => {});
    await page.locator('[data-detail-action="undo-providence"]').scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(SHOTS, 'detalhe-1250-light-depois.png') });

    // Desfazer devolve a conferência e remove a tarefa intocada.
    await page.evaluate(() => { window.__providenceToasts = []; });
    await page.locator('[data-detail-action="undo-providence"]').click();
    await page.waitForTimeout(3000);
    const toastsUndo = await page.evaluate(() => window.__providenceToasts || []);
    const depois = await page.evaluate(() => {
      const { Store } = window.Atrium;
      const conferencia = Store.state.tasks.find(task => String(task.id) === 'task:eproc-panel:sintetica-1');
      return { tarefas: Store.state.tasks.length, status: conferencia?.status };
    });
    assert.equal(depois.tarefas, 1, `desfazer remove a tarefa criada (toasts: ${toastsUndo.map(item => `${item.type}:${item.message}`).join(' | ')})`);
    assert.equal(depois.status, 'triagem', 'a conferência voltou ao fluxo');
    assert.deepEqual(pageErrors, [], `Pageerrors: ${pageErrors.join(' | ')}`);
    await context.close();
  }

  console.log('[P2] Temas e larguras: bloco legível em escuro e no celular...');
  {
    const escuro = await session.createContext({ viewport: { width: 1250, height: 900 } });
    const { page } = await abrirDetalhe(escuro, 'dark');
    await page.locator('[data-detail-action="suggest-providence"]').click();
    await page.locator('[data-providence-action]').waitFor({ timeout: 15000 });
    await page.locator('[data-providence-block]').scrollIntoViewIfNeeded();
    await page.waitForTimeout(250);
    await page.screenshot({ path: path.join(SHOTS, 'detalhe-1250-dark.png') });
    await escuro.close();

    const mobile = await session.createContext({ viewport: { width: 390, height: 844 } });
    const { page: paginaMobile, pageErrors: errosMobile } = await abrirDetalhe(mobile, 'light');
    await paginaMobile.locator('[data-detail-action="suggest-providence"]').click();
    await paginaMobile.locator('[data-providence-action]').waitFor({ timeout: 15000 });
    const overflow = await paginaMobile.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - window.innerWidth);
    assert.ok(overflow <= 1, `o bloco não pode estourar a largura no celular (${overflow}px)`);
    const larguraSelect = await paginaMobile.locator('[data-providence-action]').evaluate(element => Math.round(element.getBoundingClientRect().width));
    assert.ok(larguraSelect >= 200, `o seletor mantém largura útil no celular (${larguraSelect}px)`);
    await paginaMobile.locator('[data-providence-block]').scrollIntoViewIfNeeded();
    await paginaMobile.waitForTimeout(250);
    await paginaMobile.screenshot({ path: path.join(SHOTS, 'detalhe-390-light.png') });
    assert.deepEqual(errosMobile, [], `Pageerrors (mobile): ${errosMobile.join(' | ')}`);
    await mobile.close();

    const mobileEscuro = await session.createContext({ viewport: { width: 390, height: 844 } });
    const { page: paginaMobileEscura, pageErrors: errosMobileEscuro } = await abrirDetalhe(mobileEscuro, 'dark');
    await paginaMobileEscura.locator('[data-detail-action="suggest-providence"]').click();
    await paginaMobileEscura.locator('[data-providence-action]').waitFor({ timeout: 15000 });
    for (const seletor of ['.publication-providence-suggestion small', '.publication-providence-note', '.publication-providence-header p']) {
      const contraste = await contrasteDe(paginaMobileEscura, seletor);
      assert.ok(contraste === null || contraste >= 4.5, `${seletor} precisa de contraste ≥ 4,5:1 no escuro (medi ${contraste})`);
    }
    await paginaMobileEscura.locator('[data-providence-block]').scrollIntoViewIfNeeded();
    await paginaMobileEscura.waitForTimeout(250);
    await paginaMobileEscura.screenshot({ path: path.join(SHOTS, 'detalhe-390-dark.png') });
    assert.deepEqual(errosMobileEscuro, [], `Pageerrors (mobile dark): ${errosMobileEscuro.join(' | ')}`);
    await mobileEscuro.close();
  }

  console.log('[P3] Playbook do ato: item cria tarefa com prazo em branco e contexto no corpo...');
  {
    const context = await session.createContext({ viewport: { width: 1250, height: 900 } });
    const { page, pageErrors } = await abrirDetalhe(context, 'light');
    const playbook = page.locator('[data-playbook-block]');
    await playbook.waitFor({ timeout: 15000 });
    let texto = await playbook.innerText();
    assert.match(texto, /Providências cabíveis/i, 'o bloco do playbook aparece no detalhe');
    assert.match(texto, /Minutar contestação/, 'o item vem do catálogo do escritório');
    assert.match(texto, /Contestação/, 'a providência do item é declarada');
    assert.match(texto, /CPC, art\. 335/, 'o dispositivo aparece no item');
    assert.match(texto, /sem prazo/, 'o playbook declara que nada nasce com prazo');
    const antes = await page.evaluate(() => window.Atrium.Store.state.tasks.length);

    // Item a item: passa pelo alerta de risco e cria UMA tarefa, com prazo em branco.
    await playbook.locator('[data-providence-item-index]').first().click();
    await page.locator('#riskConfirmAcknowledge').waitFor({ timeout: 10000 });
    assert.match(await page.locator('.risk-confirm-modal').innerText(), /Você tem certeza que deseja criar esta tarefa\?/);
    await page.locator('#riskConfirmAcknowledge').click();
    await page.locator('#riskConfirmAccept').waitFor({ timeout: 10000 });
    await page.locator('#riskConfirmAccept').click();
    await page.waitForFunction(contagem => window.Atrium.Store.state.tasks.length > contagem, antes, { timeout: 15000 });
    const criada = await page.evaluate(() => {
      const tarefa = window.Atrium.Store.state.tasks.find(item => item.taskDefinition === 'Minutar contestação');
      return tarefa ? { deadline: tarefa.deadline || '', fatalDeadline: tarefa.fatalDeadline || '', descricao: tarefa.description || '' } : null;
    });
    assert.ok(criada, 'a tarefa do playbook foi criada');
    assert.equal(criada.deadline, '', 'a tarefa do playbook nasce sem prazo');
    assert.equal(criada.fatalDeadline, '', 'sem prazo fatal');
    assert.match(criada.descricao, /Contexto da conferência:/, 'o corpo da tarefa traz o contexto');
    const linhas = criada.descricao.split('Contexto da conferência:')[1].split('\n').filter(linha => linha.trim().startsWith('- '));
    assert.ok(linhas.length >= 3 && linhas.length <= 5, `contexto de 3 a 5 linhas (tem ${linhas.length})`);
    assert.ok(linhas.some(linha => /- Publicação:/.test(linha)) && linhas.some(linha => /- Fonte oficial:/.test(linha)), 'as linhas declaram a origem');

    // Em lote: a mesma providência já criada não duplica (idempotência por publicação + natureza).
    const contagemAntesDoLote = await page.evaluate(() => window.Atrium.Store.state.tasks.length);
    await page.evaluate(() => {
      window.__playbookToasts = [];
      const original = window.Atrium.App.toast.bind(window.Atrium.App);
      window.Atrium.App.toast = (message, type) => {
        window.__playbookToasts.push({ message, type });
        return original(message, type);
      };
    });
    await page.locator('[data-providence-item-batch]').click();
    await page.locator('#riskConfirmAcknowledge').waitFor({ timeout: 10000 });
    await page.locator('#riskConfirmAcknowledge').click();
    await page.locator('#riskConfirmAccept').waitFor({ timeout: 10000 });
    await page.locator('#riskConfirmAccept').click();
    await page.waitForFunction(() => (window.__playbookToasts || []).length > 0, null, { timeout: 20000 });
    const toasts = await page.evaluate(() => window.__playbookToasts);
    assert.match(String(toasts[toasts.length - 1]?.message || ''), /já existia|já existiam|nada duplicado/i, 'o lote reconhece o que já existia');
    assert.equal(
      await page.evaluate(() => window.Atrium.Store.state.tasks.filter(tarefa => tarefa.taskDefinition === 'Minutar contestação').length),
      1,
      'o lote não duplica a tarefa já criada'
    );
    assert.ok(
      await page.evaluate(() => window.Atrium.Store.state.tasks.length) >= contagemAntesDoLote,
      'o estado permanece consistente depois do lote'
    );

    // O corpo da tarefa lido no modal (contexto com origem declarada).
    await page.locator('[data-providence-block]').scrollIntoViewIfNeeded();
    await page.waitForTimeout(250);
    await page.screenshot({ path: path.join(SHOTS, 'playbook-1250-light.png') });
    assert.deepEqual(pageErrors, [], `Pageerrors (playbook): ${pageErrors.join(' | ')}`);
    await context.close();

    const mobile = await session.createContext({ viewport: { width: 390, height: 844 } });
    const { page: paginaMobile } = await (async () => {
      const aberto = await abrirDetalhe(mobile, 'light');
      return aberto;
    })();
    await paginaMobile.locator('[data-playbook-block]').waitFor({ timeout: 15000 });
    const overflow = await paginaMobile.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - window.innerWidth);
    assert.ok(overflow <= 1, `o playbook não pode estourar a largura no celular (${overflow}px)`);
    await paginaMobile.locator('[data-playbook-block]').scrollIntoViewIfNeeded();
    await paginaMobile.waitForTimeout(250);
    await paginaMobile.screenshot({ path: path.join(SHOTS, 'playbook-390-light.png') });
    await mobile.close();
  }

  console.log('[P4] Sem modelo sugerido: o botão habilita com a escolha do catálogo e envia o nome oficial...');
  {
    const context = await session.createContext({ viewport: { width: 1250, height: 900 } });
    const { page, pageErrors } = await abrirDetalhe(context, 'light', {
      sugestao: {
        ok: true,
        intimationId: PUB_ID,
        action: 'outro',
        actionLabel: 'Outro',
        confidence: 0.42,
        reason: 'LOW_CONFIDENCE_REVIEW',
        reasonLabel: 'a confiança da leitura ficou baixa e pede conferência',
        taskDefinition: null,
        actions: ACOES,
        catalog: CATALOGO
      }
    });
    let enviado = null;
    await page.route('**/api/tasks/from-publication', async route => {
      enviado = route.request().postDataJSON();
      await route.continue();
    });
    const bloco = page.locator('[data-providence-block]');
    await bloco.locator('[data-detail-action="suggest-providence"]').click();
    const campo = bloco.locator('[data-providence-definition]');
    await campo.waitFor({ timeout: 15000 });
    const botao = bloco.locator('[data-detail-action="apply-providence"]');
    assert.equal(await bloco.locator('[data-providence-model-warning]').isVisible(), true, 'o aviso explica por que a confirmação está travada');
    assert.equal(await botao.isDisabled(), true, 'sem modelo escolhido o botão fica desabilitado');
    await campo.fill('modelo que não existe');
    assert.equal(await botao.isDisabled(), true, 'texto fora do catálogo não habilita a confirmação');
    await campo.click();
    await campo.fill('minutar contestação');
    await page.locator('[data-combobox-option]:not(.hidden)').first().waitFor({ timeout: 10000 });
    await page.keyboard.press('Escape');
    assert.equal(await botao.isDisabled(), false, 'escolha existente no catálogo habilita a confirmação');
    assert.equal(await bloco.locator('[data-providence-model-warning]').isVisible(), false, 'o aviso sai quando há modelo válido no campo');
    await botao.click();
    await page.locator('#riskConfirmAcknowledge').waitFor({ timeout: 10000 });
    await page.locator('#riskConfirmAcknowledge').click();
    await page.locator('#riskConfirmAccept').waitFor({ timeout: 10000 });
    await page.locator('#riskConfirmAccept').click();
    await page.locator('.publication-providence-undo').waitFor({ timeout: 15000 });
    assert.equal(enviado?.definitionName, 'Minutar contestação', 'a confirmação envia o nome oficial do catálogo, não o texto digitado');
    assert.ok(
      await page.evaluate(() => window.Atrium.Store.state.tasks.some(tarefa => tarefa.taskDefinition === 'Minutar contestação')),
      'a tarefa criada usa o nome do catálogo'
    );
    assert.deepEqual(pageErrors, [], `Pageerrors (sem modelo): ${pageErrors.join(' | ')}`);
    await context.close();
  }

  console.log('[P5] Prazo da conferência: a contagem calculada entra na tarefa criada...');
  {
    const context = await session.createContext({ viewport: { width: 1250, height: 900 } });
    const { page, pageErrors } = await abrirDetalhe(context, 'light');
    await page.locator('[data-fold="conference"] > summary').click();
    await page.locator('[data-detail-action="conference-deadline"]').click();
    await page.locator('[data-conference-result] strong').waitFor({ timeout: 15000 });
    const rotuloPrazo = String(await page.locator('[data-conference-result] strong').innerText()).replace('Data proposta:', '').trim();
    assert.match(rotuloPrazo, /^\d{2}\/\d{2}\/\d{4}$/, 'a contagem devolve a data proposta em formato legível');
    const prazoIso = rotuloPrazo.split('/').reverse().join('-');
    const bloco = page.locator('[data-providence-block]');
    assert.ok(
      (await bloco.locator('[data-providence-conference-deadline]').innerText()).includes(rotuloPrazo),
      'o bloco da providência declara que o prazo calculado vai para a tarefa'
    );

    await bloco.locator('[data-detail-action="suggest-providence"]').click();
    await bloco.locator('[data-providence-definition]').waitFor({ timeout: 15000 });
    assert.ok(
      (await bloco.locator('[data-providence-conference-deadline]').innerText()).includes(rotuloPrazo),
      'a contagem sobrevive ao re-render da sugestão'
    );
    await page.evaluate(() => {
      window.__prazoToasts = [];
      const original = window.Atrium.App.toast.bind(window.Atrium.App);
      window.Atrium.App.toast = (message, type) => {
        window.__prazoToasts.push({ message, type });
        return original(message, type);
      };
    });
    await bloco.locator('[data-detail-action="apply-providence"]').click();
    await page.locator('#riskConfirmAcknowledge').waitFor({ timeout: 10000 });
    const alerta = await page.locator('.risk-confirm-modal').innerText();
    assert.match(alerta, /prazo calculado na conferência/, 'o alerta declara o prazo que será aplicado');
    assert.ok(alerta.includes(rotuloPrazo), 'o alerta mostra a data calculada');
    await page.locator('#riskConfirmAcknowledge').click();
    await page.locator('#riskConfirmAccept').waitFor({ timeout: 10000 });
    await page.locator('#riskConfirmAccept').click();
    await page.locator('.publication-providence-undo').waitFor({ timeout: 15000 });

    const criada = await page.evaluate(() => {
      const tarefa = window.Atrium.Store.state.tasks.find(item => item.taskDefinition === 'Minutar contestação');
      return tarefa ? {
        deadline: tarefa.deadline,
        deadlineSource: tarefa.deadlineSource,
        conferenceDeadlineAt: tarefa.conferenceDeadlineAt,
        fatalDeadline: tarefa.fatalDeadline || ''
      } : null;
    });
    assert.ok(criada, 'a tarefa foi criada');
    assert.equal(criada.deadline, prazoIso, 'a tarefa nasce com o prazo calculado na conferência');
    assert.equal(criada.deadlineSource, 'conferencia', 'a origem do prazo fica declarada');
    assert.equal(criada.conferenceDeadlineAt, prazoIso, 'o valor aplicado fica registrado no registro');
    assert.equal(criada.fatalDeadline, '', 'o prazo fatal continua decisão humana');
    const toasts = await page.evaluate(() => window.__prazoToasts || []);
    assert.ok(
      toasts.some(item => /prazo .*aplicado a partir da conferência/.test(String(item.message || ''))),
      `a tela declara o prazo aplicado (${toasts.map(item => item.message).join(' | ')})`
    );
    assert.deepEqual(pageErrors, [], `Pageerrors (prazo da conferência): ${pageErrors.join(' | ')}`);
    await context.close();
  }

  console.log('[P6] "Outra área" nomeada vira área registrada e botão reutilizável...');
  {
    // A triagem derivada é semeada no diretório sintético (o provedor de IA não entra no teste):
    // é ela que deixa o painel "conferido" com a correção de área disponível.
    await writeFile(
      path.join(dataDirectory, 'publication-triage.json'),
      `${JSON.stringify({
        version: 1,
        generatedAt: '2026-09-30T12:00:00.000Z',
        entries: {
          [PUB_ID]: {
            area: 'outro',
            areaConfidence: 0.42,
            priority: 'normal',
            priorityConfidence: 0.8,
            deadlineSignal: '',
            deadlineDays: '',
            action: 'review',
            reason: '',
            payloadHash: '',
            at: '2026-09-30T12:00:00.000Z'
          }
        }
      }, null, 2)}\n`,
      { encoding: 'utf8', mode: 0o600 }
    );
    const context = await session.createContext({ viewport: { width: 1250, height: 900 } });
    const { page, pageErrors } = await abrirDetalhe(context, 'light');
    const painel = page.locator('#intimationDetail .ai-classifier-panel');
    await page.locator('[data-fold="classifier"] > summary').click();
    await painel.waitFor({ timeout: 15000 });
    assert.match(await painel.innerText(), /outra área/i, 'o painel mostra a área sugerida antes da correção');
    await painel.locator('[data-ai-classifier-action="correct"][data-ai-classifier-question="area"]').click();
    await painel.locator('[data-ai-classifier-action="correct-apply"][data-ai-classifier-label="outro"]').click();
    const campoArea = page.locator('#aiClassifierCustomAreaInput');
    await campoArea.waitFor({ timeout: 10000 });
    await campoArea.fill('Direito do consumidor');
    await page.locator('[data-ai-classifier-action="custom-save"]').click();
    await page.waitForFunction(
      () => /direito do consumidor/i.test(document.querySelector('.ai-classifier-chips')?.innerText || ''),
      null,
      { timeout: 15000 }
    );
    assert.match(await painel.innerText(), /direito do consumidor · conferida por você/i, 'o rótulo nomeado aparece como conferido por você');
    await painel.locator('[data-ai-classifier-action="correct"][data-ai-classifier-question="area"]').click();
    assert.equal(
      await painel.locator('[data-ai-classifier-action="correct-apply"][data-ai-classifier-label="Direito do consumidor"]').count(),
      1,
      'a área nomeada vira botão ao lado das fixas'
    );
    await painel.locator('[data-ai-classifier-action="correct-apply"][data-ai-classifier-label="outro"]').click();
    assert.equal(await page.locator('#aiClassifierCustomAreaInput').isVisible(), true, '"Outra área" segue abrindo o campo para nomear');
    await page.locator('[data-ai-classifier-action="correct-cancel"]').first().click();

    // Persistência: a área nomeada vive no servidor (aprendizado do escritório) e volta após reload.
    await page.reload({ waitUntil: 'networkidle' });
    await page.evaluate(() => {
      const { App } = window.Atrium;
      App.inboxFilter = 'all';
      App.inboxCutoff = 'all';
      App.inboxSort = 'date-desc';
    });
    await switchUiV2View(page, 'inbox');
    await page.locator(`#inboxList [data-intimation-id="${PUB_ID}"]`).first().click();
    await page.locator('[data-fold="classifier"] > summary').click();
    await page.locator('#intimationDetail .ai-classifier-panel').waitFor({ timeout: 15000 });
    assert.match(await page.locator('#intimationDetail .ai-classifier-panel').innerText(), /direito do consumidor · conferida por você/i, 'a correção humana volta aplicada depois do reload');
    await page.locator('[data-ai-classifier-action="correct"][data-ai-classifier-question="area"]').click();
    assert.equal(
      await page.locator('[data-ai-classifier-action="correct-apply"][data-ai-classifier-label="Direito do consumidor"]').count(),
      1,
      'a área nomeada persiste e volta como botão reutilizável'
    );
    assert.deepEqual(pageErrors, [], `Pageerrors (área nomeada): ${pageErrors.join(' | ')}`);
    await context.close();
  }

  console.log('\n>>> UI V2 — DO PRAZO À PROVIDÊNCIA: PASS <<<\n');
} finally {
  await session.stop();
}
