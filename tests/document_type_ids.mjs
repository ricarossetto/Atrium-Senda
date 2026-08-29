import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { generateTotp } from '../lib/security.mjs';
import { postJson, startTestServer } from './helpers.mjs';

const server = await startTestServer();
const browser = await chromium.launch({ headless: true });

try {
  const session = await setupMaster(server.baseUrl);
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'pt-BR' });
  const separator = session.cookie.indexOf('=');
  await context.addCookies([{
    name: session.cookie.slice(0, separator),
    value: session.cookie.slice(separator + 1),
    url: server.baseUrl
  }]);
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.addInitScript(() => {
    localStorage.setItem('jurisflow_tour_completed', 'true');
    localStorage.setItem('jurisflow_tour_seen', 'true');
    localStorage.setItem('atrium_tour_seen', 'true');
  });
  await page.goto(server.baseUrl, { waitUntil: 'networkidle' });
  await page.locator('#appShell:not(.hidden)').waitFor();

  await page.evaluate(async () => {
    const store = window.Atrium.Store;
    store.state.contacts = [{
      id: 'contact-document-type', name: 'Cliente Teste Documentos', document: '000.000.000-00',
      city: 'Cidade Teste', state: 'RS', address: 'Rua Sintética, 100'
    }];
    store.state.processes = [{
      id: 'process-document-type', number: '5000000-00.2026.8.21.0001', client: 'Cliente Teste Documentos',
      court: 'Tribunal Sintético', feeType: 'exito', feePercentage: 20, requisitionAmount: 1000
    }];
    window.portalApp.renderAll();
    await store.flush();
  });

  await page.click('button[data-view="documents"]');
  await page.locator('#view-documents.active').waitFor();
  const cardIds = await page.locator('#documentsTemplateGrid [data-generate-doc-type]').evaluateAll(buttons => buttons.map(button => button.dataset.generateDocType));
  assert.deepEqual(cardIds, [
    'procuracao',
    'contrato_honorarios',
    'declaracao_hipo',
    'quesitos_prev',
    'prestacao_contas_rpv'
  ], 'Cards novos devem usar somente os IDs canônicos definidos para os cinco modelos atuais.');

  const expectedHeadings = new Map([
    ['procuracao', 'PROCURAÇÃO "AD JUDICIA ET EXTRA"'],
    ['contrato_honorarios', 'CONTRATO DE PRESTAÇÃO DE SERVIÇOS ADVOCATÍCIOS E HONORÁRIOS'],
    ['declaracao_hipo', 'DECLARAÇÃO DE HIPOSSUFICIÊNCIA ECONÔMICA'],
    ['quesitos_prev', 'QUESITOS DA PARTE AUTORA PARA A PERÍCIA MÉDICA JUDICIAL'],
    ['prestacao_contas_rpv', 'TERMO DE PRESTAÇÃO DE CONTAS E RECIBO DE REPASSE']
  ]);
  for (const [type, heading] of expectedHeadings) {
    await page.locator(`[data-generate-doc-type="${type}"]`).click();
    await page.locator('#docGeneratorBackdrop:not(.hidden)').waitFor();
    assert.equal(await page.locator('#docGenTypeSelect').inputValue(), type, `Card ${type} deve selecionar seu ID canônico.`);
    assert.match(await page.locator('#docGenPreviewText').inputValue(), new RegExp(escapeRegex(heading)), `Card ${type} deve acionar o gerador correto.`);
    await page.click('#docGenClose');
    await page.locator('#docGeneratorBackdrop').waitFor({ state: 'hidden' });
  }

  const shortcutCalls = await page.evaluate(() => {
    const app = window.portalApp;
    const original = app.openDocumentGenerator;
    const calls = [];
    app.openDocumentGenerator = options => { calls.push(options); return true; };
    document.getElementById('btnGenDocPrestacao').click();
    document.getElementById('btnGenDocProcess').click();
    document.getElementById('btnGenDocContact').click();
    app.openDocumentGenerator = original;
    return calls;
  });
  assert.deepEqual(shortcutCalls, [
    { type: 'prestacao_contas_rpv' },
    { type: 'contrato_honorarios' },
    { type: 'procuracao' }
  ], 'Atalhos Financeiro, Processos e Contatos devem usar IDs canônicos.');

  const aliases = await page.evaluate(() => {
    const app = window.portalApp;
    const result = {};
    for (const alias of ['contrato', 'hipossuficiencia', 'quesitos', 'prestacao_contas']) {
      result[alias] = {
        opened: app.openDocumentGenerator({ type: alias }),
        canonical: document.getElementById('docGenTypeSelect').value
      };
      app.closeDocumentGenerator();
    }
    return result;
  });
  assert.deepEqual(aliases, {
    contrato: { opened: true, canonical: 'contrato_honorarios' },
    hipossuficiencia: { opened: true, canonical: 'declaracao_hipo' },
    quesitos: { opened: true, canonical: 'quesitos_prev' },
    prestacao_contas: { opened: true, canonical: 'prestacao_contas_rpv' }
  }, 'Aliases legados devem ser explícitos e resolver para IDs canônicos.');

  const defaultType = await page.evaluate(() => {
    const app = window.portalApp;
    const opened = app.openDocumentGenerator();
    return {
      opened,
      type: document.getElementById('docGenTypeSelect').value,
      preview: document.getElementById('docGenPreviewText').value
    };
  });
  assert.equal(defaultType.opened, true);
  assert.equal(defaultType.type, 'procuracao', 'Ausência de type deve preservar o default histórico Procuração.');
  assert.match(defaultType.preview, /^PROCURAÇÃO "AD JUDICIA ET EXTRA"/, 'Default sem type deve gerar Procuração de forma explícita.');
  await page.click('#docGenClose');

  const unknownType = await page.evaluate(() => {
    const app = window.portalApp;
    const preview = document.getElementById('docGenPreviewText');
    preview.value = 'SENTINELA — NÃO GERAR PROCURAÇÃO';
    const opened = app.openDocumentGenerator({ type: 'tipo_desconhecido_explicito' });
    return {
      opened,
      preview: preview.value,
      modalHidden: document.getElementById('docGeneratorBackdrop').classList.contains('hidden')
    };
  });
  assert.equal(unknownType.opened, false, 'Type explícito desconhecido deve ser rejeitado.');
  assert.equal(unknownType.preview, 'SENTINELA — NÃO GERAR PROCURAÇÃO', 'Type desconhecido não pode cair em Procuração.');
  assert.equal(unknownType.modalHidden, true, 'Gerador não deve abrir para type desconhecido.');
  await page.locator('#toastRegion .toast.error', { hasText: 'Tipo de documento não reconhecido' }).waitFor();

  assert.deepEqual(pageErrors, [], `Wiring de documentos gerou pageerror: ${pageErrors.join(' | ')}`);
  await context.close();
  console.log('Document type IDs aprovado: cards, atalhos, aliases, default e rejeição de tipo desconhecido.');
} finally {
  await browser.close();
  await server.stop();
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function setupMaster(baseUrl) {
  let response = await postJson(`${baseUrl}/api/auth/setup`, {
    username: 'admin.document.types',
    displayName: 'Administradora Documentos Teste',
    password: 'Document-Types-2026!'
  });
  const setup = await response.json();
  assert.equal(response.status, 200);
  response = await postJson(`${baseUrl}/api/auth/setup/verify`, {
    setupToken: setup.setupToken,
    code: generateTotp(setup.manualSecret)
  });
  assert.equal(response.status, 200);
  return { cookie: response.headers.get('set-cookie').split(';')[0] };
}
