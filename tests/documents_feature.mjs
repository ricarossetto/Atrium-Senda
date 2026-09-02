import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { chromium } from 'playwright';
import { generateTotp } from '../lib/security.mjs';
import {
  createDocumentsFeature,
  DOCUMENT_CATALOG,
  DOCUMENT_TYPE_ALIASES,
  DOCUMENT_TYPES
} from '../js/features/documents.js';
import { postJson, startTestServer } from './helpers.mjs';

console.log('\n===============================================================');
console.log('  ATRIUM — FEATURE DOCUMENTOS E GERADOR DE MINUTAS');
console.log('===============================================================\n');

const EXPECTED_TYPES = [
  'procuracao',
  'procuracao_prev',
  'contrato_honorarios',
  'declaracao_hipo',
  'quesitos_prev',
  'prestacao_contas_rpv',
  'requerimento_inss',
  'termo_renuncia',
  'substabelecimento'
];

const EXPECTED_ALIASES = {
  contrato: 'contrato_honorarios',
  hipossuficiencia: 'declaracao_hipo',
  quesitos: 'quesitos_prev',
  prestacao_contas: 'prestacao_contas_rpv'
};

const EXPECTED_HASHES = {
  procuracao: '857de933d244b4ff2ff22901353544a700be9eb7fd955a5ee6433a315b102d54',
  procuracao_prev: '9a6e0f6ce1b175713e3bd8e4b8d0c9e5dbdd2f810fa02dfbe80139c1bbaa2535',
  contrato_honorarios: '93b3aab15930ab40155a6e7c5b8de6a031cfe9dc3ac6316ab0e1984d56481b27',
  declaracao_hipo: '06c4776e701d8008a8cfd5bdda6da542b5fd8f0039a6d6782d269cc7a9c153d2',
  quesitos_prev: '9cb3ab6ec4ae49a9dd59a81c397b8837de70764ea6d5cbbdeddb381c0a5493d1',
  prestacao_contas_rpv: '219227bc10944497398c96d3512d8748d016565b9b737039f024b51401359840',
  requerimento_inss: '87fde334d0d983aa2528aff056a0d8bb7f3b8ed24bdeac6edc4670aa60a4c6df',
  termo_renuncia: '4de7d113a7fddae7ec059dfa4c868c010f008d5d13d7eb31d846a48810154e98',
  substabelecimento: 'cbd690debf0a75fd52a8f99b3b21a18daa920ec510793f4fca8fac8e8c27a03f'
};

const EXPECTED_CARDS = [
  ['procuracao', 'Procuração Ad Judicia et Extra', 'Contratual / Mandato'],
  ['contrato_honorarios', 'Contrato de Honorários Advocatícios (Quota Litis)', 'Financeiro / Honorários'],
  ['declaracao_hipo', 'Declaração de Hipossuficiência Econômica', 'Processual'],
  ['quesitos_prev', 'Quesitos Periciais Previdenciários / Médicos', 'Provas / Perícia'],
  ['prestacao_contas_rpv', 'Termo de Prestação de Contas & Repasse de RPV', 'Prestação de Contas']
];

const documentsSource = fs.readFileSync(new URL('../js/features/documents.js', import.meta.url), 'utf8');
const portalSource = fs.readFileSync(new URL('../js/portal.js', import.meta.url), 'utf8');

assert.match(documentsSource, /export function createDocumentsFeature\(/, 'documents.js deve exportar a factory nativa.');
for (const forbiddenImport of [
  'portal.js', 'agenda.js', 'publications.js', 'tasks.js', 'processes.js',
  'contacts.js', 'leads.js', 'financial.js'
]) {
  assert.equal(documentsSource.includes(forbiddenImport), false, `Documents não pode importar ${forbiddenImport}.`);
}
for (const forbiddenSideEffect of [
  'fetch(', 'XMLHttpRequest', 'WebSocket', 'Store.save', 'Store.flush',
  'store.save', 'store.flush', 'window.Atrium', 'window.portalApp'
]) {
  assert.equal(documentsSource.includes(forbiddenSideEffect), false, `Documents não pode conter ${forbiddenSideEffect}.`);
}
assert.match(portalSource, /import \{ createDocumentsFeature \} from '\.\/features\/documents\.js';/);
assert.equal((portalSource.match(/createDocumentsFeature\(/g) || []).length, 1, 'Portal deve instanciar Documents uma única vez.');
for (const generator of [
  'generateProcuracaoText', 'generateContratoText', 'generateProcuracaoPrevText',
  'generateDeclaracaoHipoText', 'generateTermoRenunciaText', 'generateSubstabelecimentoText',
  'generateQuesitosPrevText', 'generatePrestacaoContasRpvText', 'generateRequerimentoInssText',
  'DOCUMENT_GENERATORS', 'DOCUMENT_TYPE_ALIASES', 'resolveDocumentType'
]) {
  assert.equal(portalSource.includes(generator), false, `${generator} não pode permanecer duplicado no portal.`);
}
for (const wrapper of [
  /renderDocuments\(\) \{\s*return getDocumentsFeature\(\)\.render\(\);\s*\}/,
  /openDocumentGenerator\(options = \{\}\) \{\s*return getDocumentsFeature\(\)\.openGenerator\(options\);\s*\}/,
  /closeDocumentGenerator\(\) \{\s*return getDocumentsFeature\(\)\.closeGenerator\(\);\s*\}/,
  /updateDocPreview\(\) \{\s*return getDocumentsFeature\(\)\.updatePreview\(\);\s*\}/,
  /copyDocToClipboard\(\) \{\s*return getDocumentsFeature\(\)\.copyToClipboard\(\);\s*\}/,
  /downloadDoc\(\) \{\s*return getDocumentsFeature\(\)\.download\(\);\s*\}/
]) {
  assert.match(portalSource, wrapper, 'Portal deve conservar apenas wrappers finos de Documents.');
}
for (const listenerId of [
  'quickDocGenButton', 'btnOpenDocGenModal', 'btnGenDocProcess', 'btnGenDocContact',
  'btnGenDocPrestacao', 'docGenClose', 'docGenCancel', 'docGeneratorBackdrop',
  'docGenTypeSelect', 'docGenContactSelect', 'docGenProcessSelect', 'docGenCopyButton',
  'docGenDownloadButton'
]) {
  assert.equal(new RegExp(`byId\\('${listenerId}'\\)\\?\\.addEventListener`).test(portalSource), false, `${listenerId} não pode manter listener no portal.`);
}
assert.deepEqual(DOCUMENT_TYPES, EXPECTED_TYPES, 'Registry deve expor exatamente os nove tipos canônicos.');
assert.deepEqual(DOCUMENT_TYPE_ALIASES, EXPECTED_ALIASES, 'Aliases legados devem permanecer exatos.');
assert.deepEqual(DOCUMENT_CATALOG.map(card => [card.id, card.title, card.category]), EXPECTED_CARDS, 'Catálogo deve preservar os cinco cards atuais.');

const unit = createUnitHarness();
assert.equal(unit.feature.initialized, false);
assert.equal(unit.feature.init(), true, 'Primeiro init deve registrar listeners.');
assert.equal(unit.feature.init(), false, 'Segundo init deve ser idempotente.');
for (const [id, type] of Object.entries({
  quickDocGenButton: 'click',
  btnOpenDocGenModal: 'click',
  btnGenDocProcess: 'click',
  btnGenDocContact: 'click',
  btnGenDocPrestacao: 'click',
  docGenClose: 'click',
  docGenCancel: 'click',
  docGeneratorBackdrop: 'click',
  docGenTypeSelect: 'change',
  docGenContactSelect: 'change',
  docGenProcessSelect: 'change',
  docGenCopyButton: 'click',
  docGenDownloadButton: 'click'
})) {
  assert.equal(unit.listeners[id]?.[type]?.length, 1, `${id} deve ter um único listener após dois init().`);
}

const shortcutCalls = [];
unit.feature.openGenerator = options => {
  shortcutCalls.push(options || {});
  return true;
};
unit.fire('quickDocGenButton', 'click');
unit.fire('btnOpenDocGenModal', 'click');
unit.fire('btnGenDocProcess', 'click');
unit.fire('btnGenDocContact', 'click');
unit.fire('btnGenDocPrestacao', 'click');
assert.deepEqual(shortcutCalls, [
  {},
  {},
  { type: 'contrato_honorarios' },
  { type: 'procuracao' },
  { type: 'prestacao_contas_rpv' }
], 'Cada atalho deve produzir exatamente uma ação e manter seu tipo histórico.');

let previewUpdates = 0;
unit.feature.updatePreview = () => { previewUpdates++; return true; };
unit.fire('docGenTypeSelect', 'change');
unit.fire('docGenContactSelect', 'change');
unit.fire('docGenProcessSelect', 'change');
assert.equal(previewUpdates, 3, 'Cada mudança de seletor deve atualizar o preview exatamente uma vez.');

let closeCalls = 0;
unit.feature.closeGenerator = () => { closeCalls++; };
unit.fire('docGenClose', 'click');
unit.fire('docGenCancel', 'click');
unit.fire('docGeneratorBackdrop', 'click', { target: unit.elements.modalContent });
assert.equal(closeCalls, 2, 'Clique dentro do modal não pode fechar o backdrop.');
unit.fire('docGeneratorBackdrop', 'click', { target: unit.elements.docGeneratorBackdrop });
assert.equal(closeCalls, 3, 'Clique no próprio backdrop deve fechar exatamente uma vez.');

let copyCalls = 0;
let downloadCalls = 0;
unit.feature.copyToClipboard = () => { copyCalls++; };
unit.feature.download = () => { downloadCalls++; };
unit.fire('docGenCopyButton', 'click');
unit.fire('docGenDownloadButton', 'click');
assert.equal(copyCalls, 1);
assert.equal(downloadCalls, 1);

const downloadStateBefore = JSON.stringify(unit.store.state);
const downloadFeature = createDocumentsFeature({
  store: unit.store,
  documentRef: unit.documentRef,
  windowRef: unit.windowRef,
  navigatorRef: {},
  getIsoDate: () => '2026-08-29',
  showToast: (...args) => unit.toasts.push(args)
});
downloadFeature.download();
assert.equal(unit.blobs.length, 1, 'Download deve criar um Blob.');
assert.deepEqual(unit.blobs[0].parts, ['MINUTA SINTÉTICA']);
assert.equal(unit.blobs[0].options.type, 'text/markdown;charset=utf-8');
assert.equal(unit.anchors.length, 1);
assert.equal(unit.anchors[0].download, 'procuracao-2026-08-29.md');
assert.equal(unit.anchors[0].clicks, 1);
assert.deepEqual(unit.revokedUrls, ['blob:documents-test-1'], 'URL do Blob deve ser revogada após o clique.');
assert.equal(JSON.stringify(unit.store.state), downloadStateBefore, 'Download não pode mutar Store.state.');

const server = await startTestServer();
const browser = await chromium.launch({ headless: true });

try {
  const moduleResponse = await fetch(`${server.baseUrl}/js/features/documents.js`);
  assert.equal(moduleResponse.status, 200, 'Módulo Documents deve ser servido com HTTP 200.');
  assert.match(moduleResponse.headers.get('content-type') || '', /javascript/);

  const session = await setupMaster(server.baseUrl);
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo'
  });
  const separator = session.cookie.indexOf('=');
  await context.addCookies([{
    name: session.cookie.slice(0, separator),
    value: session.cookie.slice(separator + 1),
    url: server.baseUrl
  }]);
  const page = await context.newPage();
  const pageErrors = [];
  const featureRequests = [];
  let trackFeatureRequests = false;
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('request', request => {
    if (trackFeatureRequests) featureRequests.push({ url: request.url(), method: request.method() });
  });
  await page.addInitScript(() => {
    const NativeDate = Date;
    const fixedNow = NativeDate.parse('2026-08-29T12:00:00-03:00');
    class FixedDate extends NativeDate {
      constructor(...args) {
        super(...(args.length ? args : [fixedNow]));
      }

      static now() {
        return fixedNow;
      }
    }
    window.Date = FixedDate;
    localStorage.setItem('jurisflow_tour_completed', 'true');
    localStorage.setItem('jurisflow_tour_seen', 'true');
    localStorage.setItem('atrium_tour_seen', 'true');
  });
  await page.goto(server.baseUrl, { waitUntil: 'networkidle' });
  await page.locator('#appShell:not(.hidden)').waitFor();
  await page.locator('#systemStatusBar[data-status="saved"]').waitFor({ state: 'attached' });
  await page.waitForFunction(() => {
    const syncButton = document.getElementById('syncButton');
    const agendaSyncButton = document.getElementById('agendaSyncButton');
    return syncButton?.disabled === false && agendaSyncButton?.disabled === false;
  });
  await page.waitForLoadState('networkidle');

  await page.evaluate(() => {
    const store = window.Atrium.Store;
    store.state.contacts = [{
      id: 'contact-test-001',
      name: 'Cliente Sintético Alfa',
      document: '000.000.000-00',
      rg: 'RG-SINTETICO',
      profession: 'Profissão Teste',
      maritalStatus: 'solteiro',
      address: 'Rua Sintética, 100',
      district: 'Centro Teste',
      city: 'Cidade Teste',
      state: 'RS',
      zip: '00000-000'
    }];
    const baseProcess = {
      number: '0000000-00.0000.0.00.0000',
      client: 'Cliente Sintético Alfa',
      court: 'Vara Sintética',
      nb: 'NB-TESTE'
    };
    store.state.processes = [
      { ...baseProcess, id: 'process-test-001', feeType: 'exito', feePercentage: 12.5, feeAmount: 0, requisitionAmount: 10000 },
      { ...baseProcess, id: 'process-zero-percent', feeType: 'exito', feePercentage: 0, feeAmount: 0, requisitionAmount: 10000 },
      { ...baseProcess, id: 'process-zero-fixed', feeType: 'fixo', feePercentage: 0, feeAmount: 0, requisitionAmount: 10000 },
      { ...baseProcess, id: 'process-invalid-fee', feeType: 'tipo-financeiro-invalido', feePercentage: 10, feeAmount: 999, requisitionAmount: 10000 },
      { ...baseProcess, id: 'process-rpv', feeType: 'exito', feePercentage: 10, feeAmount: 999, requisitionAmount: 10000 }
    ];
    store.state.settings = {
      ...store.state.settings,
      officeName: 'Escritório Sintético',
      officeSlogan: 'Slogan Sintético',
      officeLogo: '',
      lawyerName: 'Advogada Sintética',
      lawyerOab: 'OAB/RS 000000',
      lawyerCpfCnpj: '000.000.000-00',
      lawyerAddress: 'Avenida Sintética, 200',
      city: 'Cidade do Escritório/RS'
    };
    store.state.terms = [{ id: 'term-test-001', name: 'Nome Alternativo Sintético', registration: 'OAB/RS 999999' }];
    window.__documentsWriteCounts = { save: 0, flush: 0 };
    const originalSave = store.save.bind(store);
    const originalFlush = store.flush.bind(store);
    store.save = (...args) => {
      window.__documentsWriteCounts.save++;
      return originalSave(...args);
    };
    store.flush = (...args) => {
      window.__documentsWriteCounts.flush++;
      return originalFlush(...args);
    };
    window.portalApp.renderAll();
    window.__documentsStateBefore = JSON.stringify(store.state);
  });
  trackFeatureRequests = true;

  await page.click('button[data-view="documents"]');
  await page.locator('#view-documents.active').waitFor();
  const cards = await page.locator('#documentsTemplateGrid .prompt-card').evaluateAll(items => items.map(card => ({
    id: card.querySelector('[data-generate-doc-type]').dataset.generateDocType,
    title: card.querySelector('h4').textContent,
    category: card.querySelector('.prompt-category-badge').textContent,
    description: card.querySelector('p').textContent
  })));
  assert.equal(cards.length, 5);
  assert.deepEqual(cards.map(card => [card.id, card.title, card.category]), EXPECTED_CARDS);
  assert.deepEqual(cards.map(card => card.description), DOCUMENT_CATALOG.map(card => card.description));

  for (const type of EXPECTED_CARDS.map(card => card[0])) {
    await page.locator(`[data-generate-doc-type="${type}"]`).click();
    assert.equal(await page.locator('#docGenTypeSelect').inputValue(), type, `Card ${type} deve abrir seu tipo.`);
    await page.click('#docGenClose');
  }

  const outputs = await page.evaluate(types => {
    const result = {};
    for (const type of types) {
      const opened = window.portalApp.openDocumentGenerator({ type, contactId: 'contact-test-001', processId: 'process-test-001' });
      if (!opened) throw new Error(`Gerador não abriu para ${type}`);
      result[type] = document.getElementById('docGenPreviewText').value;
      window.portalApp.closeDocumentGenerator();
    }
    return result;
  }, EXPECTED_TYPES);
  const actualHashes = Object.fromEntries(EXPECTED_TYPES.map(type => [type, createHash('sha256').update(outputs[type], 'utf8').digest('hex')]));
  assert.deepEqual(actualHashes, EXPECTED_HASHES, 'Os nove textos jurídicos devem ser byte a byte idênticos ao HEAD pré-refactor.');

  const selectorCases = await page.evaluate(() => {
    const app = window.portalApp;
    const read = () => ({ contact: document.getElementById('docGenContactSelect').value, process: document.getElementById('docGenProcessSelect').value });
    app.openDocumentGenerator();
    const blank = read();
    app.closeDocumentGenerator();
    app.openDocumentGenerator({ contactId: 'contact-test-001', processId: 'process-test-001' });
    const valid = read();
    app.closeDocumentGenerator();
    app.openDocumentGenerator({ contactId: 'contact-inexistente', processId: 'process-inexistente' });
    const invalid = read();
    app.closeDocumentGenerator();
    return { blank, valid, invalid };
  });
  assert.deepEqual(selectorCases, {
    blank: { contact: '', process: '' },
    valid: { contact: 'contact-test-001', process: 'process-test-001' },
    invalid: { contact: '', process: '' }
  }, 'Contatos/processos só podem ser pré-selecionados por IDs válidos explícitos.');

  const resolution = await page.evaluate(aliases => {
    const app = window.portalApp;
    const aliasResults = {};
    for (const alias of Object.keys(aliases)) {
      aliasResults[alias] = { opened: app.openDocumentGenerator({ type: alias }), canonical: document.getElementById('docGenTypeSelect').value };
      app.closeDocumentGenerator();
    }
    const defaultOpened = app.openDocumentGenerator();
    const defaultType = document.getElementById('docGenTypeSelect').value;
    app.closeDocumentGenerator();
    const preview = document.getElementById('docGenPreviewText');
    preview.value = 'SENTINELA — NÃO GERAR';
    const unknownOpened = app.openDocumentGenerator({ type: 'tipo-inexistente' });
    return {
      aliasResults,
      defaultOpened,
      defaultType,
      unknownOpened,
      unknownPreview: preview.value,
      unknownHidden: document.getElementById('docGeneratorBackdrop').classList.contains('hidden')
    };
  }, EXPECTED_ALIASES);
  assert.deepEqual(resolution.aliasResults, Object.fromEntries(Object.entries(EXPECTED_ALIASES).map(([alias, canonical]) => [alias, { opened: true, canonical }])));
  assert.equal(resolution.defaultOpened, true);
  assert.equal(resolution.defaultType, 'procuracao');
  assert.equal(resolution.unknownOpened, false);
  assert.equal(resolution.unknownPreview, 'SENTINELA — NÃO GERAR');
  assert.equal(resolution.unknownHidden, true);

  const financialCases = await page.evaluate(() => {
    const app = window.portalApp;
    const open = (type, processId) => {
      const opened = app.openDocumentGenerator({ type, contactId: 'contact-test-001', processId });
      const preview = document.getElementById('docGenPreviewText').value;
      app.closeDocumentGenerator();
      return { opened, preview };
    };
    return {
      zeroPercentContract: open('contrato_honorarios', 'process-zero-percent'),
      zeroPercentRpv: open('prestacao_contas_rpv', 'process-zero-percent'),
      zeroFixed: open('contrato_honorarios', 'process-zero-fixed'),
      invalidFee: open('contrato_honorarios', 'process-invalid-fee'),
      rpv: open('prestacao_contas_rpv', 'process-rpv')
    };
  });
  assert.equal(financialCases.zeroPercentContract.opened, true);
  assert.match(financialCases.zeroPercentContract.preview, /Honorários contratuais de 0%/);
  assert.doesNotMatch(financialCases.zeroPercentContract.preview, /Honorários contratuais de 30%/);
  assert.match(financialCases.zeroPercentRpv.preview, /HONORÁRIOS ADVOCATÍCIOS CONTRATUAIS \(0%\)/);
  assert.match(financialCases.zeroPercentRpv.preview, /\[0% de Honorários\]/);
  assert.match(financialCases.zeroFixed.preview, /Honorários fixos no valor de R\$ 0/);
  assert.equal(financialCases.invalidFee.opened, false);
  assert.equal(financialCases.invalidFee.preview, '');
  assert.match(financialCases.rpv.preview, /VALOR BRUTO LEVANTADO[^\n]+R\$ 10\.000,00/);
  assert.match(financialCases.rpv.preview, /R\$ 1\.000,00 \(10%\)/);
  assert.match(financialCases.rpv.preview, /R\$ 9\.000,00/);
  assert.equal(financialCases.rpv.preview.includes('R$ 999'), false, 'RPV não pode usar feeAmount como valor bruto.');

  const clipboard = await page.evaluate(async () => {
    const area = document.getElementById('docGenPreviewText');
    area.value = 'TEXTO SINTÉTICO PARA CLIPBOARD';
    const calls = [];
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async text => { calls.push(text); } } });
    await window.portalApp.copyDocToClipboard();
    return calls;
  });
  assert.deepEqual(clipboard, ['TEXTO SINTÉTICO PARA CLIPBOARD'], 'Clipboard preferencial deve escrever exatamente uma vez.');

  const fallback = await page.evaluate(async () => {
    const area = document.getElementById('docGenPreviewText');
    area.value = 'TEXTO SINTÉTICO PARA FALLBACK';
    let selects = 0;
    let execCalls = 0;
    const originalSelect = area.select.bind(area);
    area.select = () => { selects++; originalSelect(); };
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => { throw new Error('clipboard indisponível'); } } });
    const originalExecCommand = document.execCommand;
    document.execCommand = command => {
      if (command === 'copy') execCalls++;
      return true;
    };
    try {
      await window.portalApp.copyDocToClipboard();
      return { selects, execCalls };
    } finally {
      document.execCommand = originalExecCommand;
    }
  });
  assert.deepEqual(fallback, { selects: 1, execCalls: 1 }, 'Fallback deve selecionar o textarea e executar copy uma vez.');

  await page.evaluate(() => {
    window.portalApp.renderDocuments();
    window.portalApp.openDocumentGenerator({ type: 'procuracao' });
    window.portalApp.updateDocPreview();
    window.portalApp.closeDocumentGenerator();
  });
  const safety = await page.evaluate(() => ({
    stateAfter: JSON.stringify(window.Atrium.Store.state),
    stateBefore: window.__documentsStateBefore,
    writes: window.__documentsWriteCounts
  }));
  assert.equal(safety.stateAfter, safety.stateBefore, 'Render/open/preview/copy/close não podem mutar Store.state.');
  assert.deepEqual(safety.writes, { save: 0, flush: 0 }, 'Documents não pode chamar save/flush.');
  assert.deepEqual(featureRequests, [], `Documents não pode gerar requests: ${JSON.stringify(featureRequests)}.`);
  assert.deepEqual(pageErrors, [], `Feature Documents gerou pageerror: ${pageErrors.join(' | ')}.`);

  await context.close();
  console.log('Feature Documents aprovada: arquitetura, textos, gerador, financeiro, clipboard, download e zero rede no fluxo de minutas.');
} finally {
  await browser.close();
  await server.stop();
}

function createUnitHarness() {
  const listeners = {};
  const elements = {};
  const addElement = (id, extra = {}) => {
    const element = {
      id,
      value: '',
      dataset: {},
      addEventListener(type, listener) {
        listeners[id] ||= {};
        listeners[id][type] ||= [];
        listeners[id][type].push(listener);
      },
      ...extra
    };
    elements[id] = element;
    return element;
  };
  for (const id of [
    'quickDocGenButton', 'btnOpenDocGenModal', 'btnGenDocProcess', 'btnGenDocContact',
    'btnGenDocPrestacao', 'docGenClose', 'docGenCancel', 'docGenCopyButton',
    'docGenDownloadButton'
  ]) addElement(id);
  const modalContent = addElement('modalContent');
  const docGeneratorBackdrop = addElement('docGeneratorBackdrop');
  addElement('docGenTypeSelect', { value: 'procuracao' });
  addElement('docGenContactSelect');
  addElement('docGenProcessSelect');
  addElement('docGenPreviewText', { value: 'MINUTA SINTÉTICA', select() {} });

  const blobs = [];
  const anchors = [];
  const revokedUrls = [];
  const toasts = [];
  const documentRef = {
    getElementById: id => elements[id] || null,
    execCommand: () => true,
    createElement(tag) {
      assert.equal(tag, 'a');
      const anchor = { href: '', download: '', clicks: 0, click() { this.clicks++; } };
      anchors.push(anchor);
      return anchor;
    }
  };
  const windowRef = {
    Blob: class TestBlob {
      constructor(parts, options) {
        this.parts = parts;
        this.options = options;
        blobs.push(this);
      }
    },
    URL: {
      createObjectURL() { return `blob:documents-test-${blobs.length}`; },
      revokeObjectURL(url) { revokedUrls.push(url); }
    }
  };
  const store = { state: { contacts: [], processes: [], settings: {}, terms: [] } };
  const feature = createDocumentsFeature({
    store,
    documentRef,
    windowRef,
    navigatorRef: {},
    escapeHtml: value => String(value ?? ''),
    normalizeText: value => String(value ?? '').trim().toLowerCase(),
    showToast: (...args) => toasts.push(args),
    getIsoDate: () => '2026-08-29'
  });
  return {
    feature,
    store,
    documentRef,
    windowRef,
    listeners,
    elements: { ...elements, modalContent, docGeneratorBackdrop },
    blobs,
    anchors,
    revokedUrls,
    toasts,
    fire(id, type, event = {}) {
      for (const listener of listeners[id]?.[type] || []) listener(event);
    }
  };
}

async function setupMaster(baseUrl) {
  let response = await postJson(`${baseUrl}/api/auth/setup`, {
    username: 'admin.documents.feature',
    displayName: 'Administradora Sintética',
    password: 'Documents-Feature-2026!'
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
