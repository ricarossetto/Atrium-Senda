import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createOfficeIdentityFeature } from '../js/features/office-identity.js';

const moduleSource = readFileSync(new URL('../js/features/office-identity.js', import.meta.url), 'utf8');
const portalSource = readFileSync(new URL('../js/portal.js', import.meta.url), 'utf8');
assert.match(moduleSource, /export function createOfficeIdentityFeature/);
assert.doesNotMatch(moduleSource, /\b(?:fetch|secureFetch|XMLHttpRequest)\b|portal\.js/);
// B8/WB11: a identidade usa somente termo elegível (de escritório, não processo). O fallback
// cego ao índice 0 saiu: `upsert('terms')` insere no início e um processo monitorado podia ser
// lido como OAB do titular e sobrescrito no submit.
assert.doesNotMatch(moduleSource, /terms\[0\]/);
assert.match(moduleSource, /const isIdentityTerm = term => Boolean\(term\)/);
assert.match(moduleSource, /String\(term\.type \|\| ''\)\.toLowerCase\(\) !== 'process'/);
assert.match(moduleSource, /String\(term\.scope \|\| ''\)\.toLowerCase\(\) !== 'private'/);
assert.match(moduleSource, /term\.privateOwnerUserId \|\| term\.ownerUserId/);
assert.match(moduleSource, /const primaryTermOf = \(\) => \{/);
assert.match(moduleSource, /terms\.find\(term => term\?\.primary === true && isIdentityTerm\(term\)\)/);
assert.match(moduleSource, /terms\.find\(isIdentityTerm\)/);
assert.match(portalSource, /renderOfficeIdentity\(\) \{ return getOfficeIdentityFeature\(\)\.render\(\); \}/);
assert.match(portalSource, /handleOfficeSetupSubmit\(event\) \{ return getOfficeIdentityFeature\(\)\.handleSubmit\(event\); \}/);

function makeClassList(initial = []) {
  const values = new Set(initial);
  return {
    add: name => values.add(name), remove: name => values.delete(name), contains: name => values.has(name),
    toggle(name, force) { if (force) values.add(name); else values.delete(name); }
  };
}
function makeElement(initial = []) {
  const listeners = new Map();
  return {
    value: '', innerHTML: '', textContent: '', style: {}, classList: makeClassList(initial), listeners,
    addEventListener(type, handler) { (listeners.get(type) || listeners.set(type, []).get(type)).push(handler); },
    click() { this.clicked = true; }
  };
}

const ids = ['sidebarOfficeName', 'sidebarOfficeLabel', 'officeSetupClose', 'officeSetupCancel', 'officeSetupBackdrop', 'btnChooseOfficeLogo', 'officeLogoInput', 'btnRemoveOfficeLogo', 'officeSetupForm', 'officeLogoPreview', 'officeInputName', 'officeInputSlogan', 'officeInputLawyer', 'officeInputOab', 'officeInputAddress', 'officeInputCity'];
const elements = Object.fromEntries(ids.map(id => [id, makeElement(id === 'officeSetupBackdrop' ? ['hidden'] : [])]));
const sidebar = makeElement();
const avatar = makeElement();
const documentRef = {
  getElementById: id => elements[id] || null,
  querySelector(selector) {
    if (selector === '.sidebar-office') return sidebar;
    if (selector === '.sidebar-office .office-avatar-icon') return avatar;
    return null;
  }
};
const audits = [];
const toasts = [];
let saveCalls = 0;
let flushResult = true;
let monitoringRenders = 0;
let closeConfirmResult = false;
const closeConfirmMessages = [];
const store = {
  state: {
    settings: {},
    terms: [
      { id: 'first', name: 'Primeira Pessoa', registration: 'OAB/RS 000001' },
      { id: 'primary', primary: true, name: 'Pessoa Primária', registration: 'OAB/RS 999999' }
    ]
  },
  audit(action, detail) { audits.push({ action, detail }); },
  save() { saveCalls++; },
  async flush() { return flushResult; }
};
let reader;
const feature = createOfficeIdentityFeature({
  store,
  documentRef,
  fileReaderFactory: () => (reader = {
    readAsDataURL(file) { this.onload({ target: { result: file.data } }); }
  }),
  escapeHtml: value => String(value ?? '').replaceAll('<', '&lt;'),
  showToast: (message, type) => toasts.push({ message, type }),
  onRenderMonitoring: () => { monitoringRenders++; },
  confirmFn: message => { closeConfirmMessages.push(message); return closeConfirmResult; }
});

assert.equal(feature.init(), true);
assert.equal(feature.init(), false);
for (const [element, type] of [[sidebar, 'click'], [elements.officeSetupClose, 'click'], [elements.officeSetupCancel, 'click'], [elements.officeSetupBackdrop, 'click'], [elements.btnChooseOfficeLogo, 'click'], [elements.officeLogoInput, 'change'], [elements.btnRemoveOfficeLogo, 'click'], [elements.officeSetupForm, 'submit']]) {
  assert.equal(element.listeners.get(type)?.length, 1, 'Listener de identidade duplicado.');
}

feature.render();
assert.equal(elements.sidebarOfficeName.textContent, 'Meu Escritório');
assert.equal(elements.sidebarOfficeLabel.textContent, 'Escritório');
assert.match(avatar.style.backgroundImage, /team\.svg/);
store.state.settings.officeName = 'Banca <Teste>';
store.state.settings.officeSlogan = 'Slogan Sintético';
feature.render();
assert.equal(elements.sidebarOfficeName.title, 'Banca <Teste> · Slogan Sintético');
store.state.settings.officeLogo = 'data:image/png;base64,iVBORw0KGgo=';
feature.render();
assert.equal(elements.sidebarOfficeName.textContent, 'Banca <Teste>');
assert.match(avatar.innerHTML, /data:image\/png;base64,iVBORw0KGgo=/);
store.state.settings.officeLogo = 'javascript:alert(1)';
feature.render();
assert.doesNotMatch(avatar.innerHTML, /<img|javascript:/);
store.state.settings.officeLogo = 'data:image/png;base64,iVBORw0KGgo=';
assert.equal(avatar.style.background, 'transparent');

store.state.settings = {};
feature.open();
// WB11: `primary: true` vence o índice 0 (o termo monitorado pode ser inserido no início).
assert.equal(elements.officeInputLawyer.value, 'Pessoa Primária');
assert.equal(elements.officeInputOab.value, 'OAB/RS 999999');
assert.equal(elements.officeSetupBackdrop.classList.contains('hidden'), false);
feature.close();
assert.equal(elements.officeSetupBackdrop.classList.contains('hidden'), true);

// Termo de processo no início da lista (caso real do `upsert`): não é identidade do titular
// e não pode ser lido como OAB nem sobrescrito no submit.
store.state.terms = [
  { id: 'process-term', type: 'process', name: 'Processo Monitorado Sintético', registration: '5000000-00.2026.8.21.0001' },
  { id: 'lawyer-term', name: 'Advogada Titular Sintética', registration: 'OAB/RS 111111' },
  { id: 'primary-term', primary: true, name: 'Advogada Primária Sintética', registration: 'OAB/RS 222222' }
];
const processTermBefore = structuredClone(store.state.terms[0]);
feature.open();
assert.equal(elements.officeInputLawyer.value, 'Advogada Primária Sintética', 'OAB do titular vem do termo principal, não do termo de processo.');
assert.equal(elements.officeInputOab.value, 'OAB/RS 222222');
elements.officeSetupBackdrop.classList.remove('hidden');
assert.equal(await feature.handleSubmit({ preventDefault() {} }), true);
assert.deepEqual(store.state.terms[0], processTermBefore, 'Termo de processo em terms[0] não pode ser sobrescrito pela Identidade.');
assert.equal(store.state.terms[2].name, 'Advogada Primária Sintética', 'Somente o termo principal recebe nome/OAB do titular.');

// Sem `primary`, o primeiro termo que não é de processo assume; sem nenhum termo, não há crash.
store.state.settings = {};
store.state.terms = [
  { id: 'process-only-first', type: 'process', name: 'Outro Processo Sintético', registration: '5000001-11.2026.8.21.0001' },
  { id: 'plain', name: 'Advogado Não Primário', registration: 'OAB/RS 333333' }
];
feature.open();
assert.equal(elements.officeInputLawyer.value, 'Advogado Não Primário');
assert.equal(elements.officeInputOab.value, 'OAB/RS 333333');
feature.close();

// B8: lista só de processos não tem termo elegível. A tela mantém os textos padrão e o
// salvamento não altera o CNJ monitorado.
store.state.settings = {};
store.state.terms = [
  { id: 'only-process', type: 'process', name: 'Processo Monitorado Sintético', registration: '5000002-22.2026.8.21.0001' }
];
const onlyProcessBefore = structuredClone(store.state.terms[0]);
feature.open();
assert.equal(elements.officeInputLawyer.value, 'Advogado(a) Titular', 'Termo de processo não é identidade do titular.');
assert.equal(elements.officeInputOab.value, 'OAB/UF 000000');
elements.officeInputLawyer.value = 'Advogada Teste';
elements.officeInputOab.value = 'OAB/RS 000000';
elements.officeSetupBackdrop.classList.remove('hidden');
assert.equal(await feature.handleSubmit({ preventDefault() {} }), true);
assert.deepEqual(store.state.terms[0], onlyProcessBefore, 'Sem termo elegível, o submit não altera dados de monitoramento.');
feature.close();

// B8: termo privado, ainda que `primary` e primeiro, não é lido nem sobrescrito.
store.state.settings = {};
store.state.terms = [
  { id: 'private-term', scope: 'private', privateOwnerUserId: 'user-sintetico', primary: true, name: 'OAB Privada Sintética', registration: 'OAB/RS 444444' },
  { id: 'office-term', scope: 'office', name: 'Advogada do Escritório', registration: 'OAB/RS 555555' }
];
const privateTermBefore = structuredClone(store.state.terms[0]);
feature.open();
assert.equal(elements.officeInputLawyer.value, 'Advogada do Escritório', 'Termo privado não serve de identidade do escritório.');
assert.equal(elements.officeInputOab.value, 'OAB/RS 555555');
elements.officeInputLawyer.value = 'Advogada Teste';
elements.officeInputOab.value = 'OAB/RS 000000';
elements.officeSetupBackdrop.classList.remove('hidden');
assert.equal(await feature.handleSubmit({ preventDefault() {} }), true);
assert.deepEqual(store.state.terms[0], privateTermBefore, 'Termo privado não é sobrescrito pela Identidade.');
assert.equal(store.state.terms[1].name, 'Advogada Teste', 'O termo de escritório recebe nome/OAB do titular.');
assert.equal(store.state.terms[1].registration, 'OAB/RS 000000');
feature.close();

// B8: lista só com termo privado também não oferece termo elegível.
store.state.settings = {};
store.state.terms = [
  { id: 'private-only', scope: 'private', privateOwnerUserId: 'user-sintetico', name: 'OAB Privada Sintética', registration: 'OAB/RS 444444' }
];
const privateOnlyBefore = structuredClone(store.state.terms[0]);
feature.open();
assert.equal(elements.officeInputLawyer.value, 'Advogado(a) Titular');
assert.equal(elements.officeInputOab.value, 'OAB/UF 000000');
elements.officeSetupBackdrop.classList.remove('hidden');
assert.equal(await feature.handleSubmit({ preventDefault() {} }), true);
assert.deepEqual(store.state.terms[0], privateOnlyBefore, 'Termo privado isolado permanece intacto.');
feature.close();
store.state.terms = [];
store.state.settings = {};
feature.open();
assert.equal(elements.officeInputLawyer.value, 'Advogado(a) Titular', 'Sem termos, mantém o texto padrão.');
assert.equal(elements.officeInputOab.value, 'OAB/UF 000000');
elements.officeSetupBackdrop.classList.remove('hidden');
assert.equal(await feature.handleSubmit({ preventDefault() {} }), true, 'Sem termos, salvar a identidade continua funcionando.');
feature.close();
store.state.terms = [
  { id: 'first', name: 'Primeira Pessoa', registration: 'OAB/RS 000001' },
  { id: 'primary', primary: true, name: 'Pessoa Primária', registration: 'OAB/RS 999999' }
];

feature.open();
elements.officeInputName.value = 'Edição ainda não salva';
assert.equal(feature.requestClose(), false);
assert.equal(elements.officeSetupBackdrop.classList.contains('hidden'), false, 'Edição pendente deve manter o painel aberto quando o descarte for recusado.');
assert.match(closeConfirmMessages.at(-1), /alterações não salvas/i);
closeConfirmResult = true;
assert.equal(feature.requestClose(), true);
assert.equal(elements.officeSetupBackdrop.classList.contains('hidden'), true, 'Confirmação explícita deve permitir descartar e fechar.');

assert.equal(feature.handleLogoUpload({ size: 2 * 1024 * 1024, data: 'data:image/png;base64,VALIDA' }), true);
assert.ok(reader);
assert.equal(feature.tempLogo, 'data:image/png;base64,VALIDA');
assert.match(elements.officeLogoPreview.innerHTML, /VALIDA/);
assert.equal(elements.btnRemoveOfficeLogo.classList.contains('hidden'), false);
const previousLogo = feature.tempLogo;
assert.equal(feature.handleLogoUpload({ size: 2 * 1024 * 1024 + 1, data: 'data:image/png;base64,INVALIDA' }), false);
assert.equal(feature.tempLogo, previousLogo);
assert.ok(toasts.some(toast => toast.message === 'A imagem deve ter no máximo 2MB.' && toast.type === 'danger'));

Object.assign(elements.officeInputName, { value: ' Escritório Sintético ' });
Object.assign(elements.officeInputSlogan, { value: ' Confiança ' });
Object.assign(elements.officeInputLawyer, { value: ' Advogada Teste ' });
Object.assign(elements.officeInputOab, { value: ' OAB/RS 000000 ' });
Object.assign(elements.officeInputAddress, { value: ' Rua Sintética, 1 ' });
Object.assign(elements.officeInputCity, { value: ' Ijuí / RS ' });
elements.officeSetupBackdrop.classList.remove('hidden');
const firstTermBefore = structuredClone(store.state.terms[0]);
const saveCallsBefore = saveCalls;
const monitoringBefore = monitoringRenders;
assert.equal(await feature.handleSubmit({ preventDefault() {} }), true);
assert.deepEqual(store.state.settings, {
  officeName: 'Escritório Sintético', officeSlogan: 'Confiança', lawyerName: 'Advogada Teste', lawyerOab: 'OAB/RS 000000',
  lawyerAddress: 'Rua Sintética, 1', city: 'Ijuí / RS', officeLogo: 'data:image/png;base64,VALIDA', deadlineMode: 'auto'
});
assert.deepEqual(store.state.terms[0], firstTermBefore, 'Termo não principal não é tocado pelo submit.');
assert.equal(store.state.terms[1].name, 'Advogada Teste');
assert.equal(store.state.terms[1].registration, 'OAB/RS 000000');
assert.deepEqual(audits.at(-1), { action: 'Identidade do escritório atualizada', detail: 'Escritório Sintético' });
assert.equal(saveCalls, saveCallsBefore + 1);
assert.equal(monitoringRenders, monitoringBefore + 1);
assert.equal(elements.officeSetupBackdrop.classList.contains('hidden'), true);
assert.ok(toasts.some(toast => toast.message === 'Identidade do escritório salva com sucesso!' && toast.type === 'success'));

flushResult = false;
elements.officeInputName.value = 'Edição não persistida';
elements.officeSetupBackdrop.classList.remove('hidden');
const successCount = toasts.filter(toast => toast.type === 'success').length;
assert.equal(await feature.handleSubmit({ preventDefault() {} }), false);
assert.equal(elements.officeSetupBackdrop.classList.contains('hidden'), false);
assert.equal(toasts.filter(toast => toast.type === 'success').length, successCount);
assert.equal(store.state.settings.officeName, 'Edição não persistida', 'Falha não pode perder edição silenciosamente.');
console.log('✓ Identidade modular aprovada: termo de escritório elegível (não processo, não privado), sem fallback cego, logo 2 MB, audit, flush e falha segura.');
