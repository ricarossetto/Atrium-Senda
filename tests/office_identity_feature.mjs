import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createOfficeIdentityFeature } from '../js/features/office-identity.js';

const moduleSource = readFileSync(new URL('../js/features/office-identity.js', import.meta.url), 'utf8');
const portalSource = readFileSync(new URL('../js/portal.js', import.meta.url), 'utf8');
assert.match(moduleSource, /export function createOfficeIdentityFeature/);
assert.doesNotMatch(moduleSource, /\b(?:fetch|secureFetch|XMLHttpRequest)\b|portal\.js/);
assert.match(moduleSource, /store\.state\.terms\?\.\[0\]/);
assert.doesNotMatch(moduleSource, /\.find\([^\n]*primary/);
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
  onRenderMonitoring: () => { monitoringRenders++; }
});

assert.equal(feature.init(), true);
assert.equal(feature.init(), false);
for (const [element, type] of [[sidebar, 'click'], [elements.officeSetupClose, 'click'], [elements.officeSetupCancel, 'click'], [elements.officeSetupBackdrop, 'click'], [elements.btnChooseOfficeLogo, 'click'], [elements.officeLogoInput, 'change'], [elements.btnRemoveOfficeLogo, 'click'], [elements.officeSetupForm, 'submit']]) {
  assert.equal(element.listeners.get(type)?.length, 1, 'Listener de identidade duplicado.');
}

feature.render();
assert.equal(elements.sidebarOfficeName.textContent, 'Meu Escritório');
assert.equal(elements.sidebarOfficeLabel.textContent, 'Desde 1983');
assert.match(avatar.style.backgroundImage, /team\.svg/);
store.state.settings.officeName = 'Banca <Teste>';
store.state.settings.officeSlogan = 'Slogan Sintético';
store.state.settings.officeLogo = 'data:image/png;base64,<logo>';
feature.render();
assert.equal(elements.sidebarOfficeName.textContent, 'Banca <Teste>');
assert.match(avatar.innerHTML, /data:image\/png;base64,&lt;logo>/);
assert.equal(avatar.style.background, 'transparent');

store.state.settings = {};
feature.open();
assert.equal(elements.officeInputLawyer.value, 'Primeira Pessoa');
assert.equal(elements.officeInputOab.value, 'OAB/RS 000001');
assert.equal(elements.officeInputLawyer.value === store.state.terms[1].name, false, 'Fallback não pode trocar terms[0] por primary.');
assert.equal(elements.officeSetupBackdrop.classList.contains('hidden'), false);
feature.close();
assert.equal(elements.officeSetupBackdrop.classList.contains('hidden'), true);

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
const primaryBefore = structuredClone(store.state.terms[1]);
assert.equal(await feature.handleSubmit({ preventDefault() {} }), true);
assert.deepEqual(store.state.settings, {
  officeName: 'Escritório Sintético', officeSlogan: 'Confiança', lawyerName: 'Advogada Teste', lawyerOab: 'OAB/RS 000000',
  lawyerAddress: 'Rua Sintética, 1', city: 'Ijuí / RS', officeLogo: 'data:image/png;base64,VALIDA'
});
assert.equal(store.state.terms[0].name, 'Advogada Teste');
assert.equal(store.state.terms[0].registration, 'OAB/RS 000000');
assert.deepEqual(store.state.terms[1], primaryBefore);
assert.deepEqual(audits.at(-1), { action: 'Identidade do escritório atualizada', detail: 'Escritório Sintético' });
assert.equal(saveCalls, 1);
assert.equal(monitoringRenders, 1);
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
console.log('✓ Identidade modular aprovada: fallbacks, terms[0], logo 2 MB, audit, flush e falha segura.');
