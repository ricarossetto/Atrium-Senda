// O preenchimento do navegador cobre a lista de contexto do ATRIUM e sugere dados de
// outros clientes. Fica desligado em todo o sistema. A tela de entrada mantém só os campos
// de credencial, para o gerenciador de senhas continuar funcionando.
const AUTH_AREA = '#authGate, #adminLoginScreen';
const AUTH_TOKENS = new Set(['username', 'current-password', 'new-password', 'one-time-code']);
const APP_TOKENS = new Set(['new-password', 'one-time-code']);
// O cadastro público de escritório pede os dados da própria pessoa: nome, e-mail e nome
// do escritório podem vir do navegador. Nenhum dado de cliente circula nesse formulário.
const REGISTER_AREA = '#authRegisterForm';
const REGISTER_TOKENS = new Set(['name', 'email', 'organization']);
const SKIPPED_TYPES = new Set(['hidden', 'checkbox', 'radio', 'file', 'range', 'color', 'button', 'submit', 'reset', 'image']);
const MANAGER_IGNORE = { 'data-lpignore': 'true', 'data-1p-ignore': 'true', 'data-bwignore': 'true', 'data-form-type': 'other' };

function setIfDifferent(element, name, value) {
  if (element.getAttribute(name) !== value) element.setAttribute(name, value);
}

export function guardField(element) {
  if (element.tagName === 'FORM') {
    if (!element.closest(AUTH_AREA)) setIfDifferent(element, 'autocomplete', 'off');
    return;
  }
  if (element.tagName === 'INPUT' && SKIPPED_TYPES.has(String(element.type).toLowerCase())) return;
  const token = String(element.getAttribute('autocomplete') || '').trim().toLowerCase();
  const inAuth = Boolean(element.closest(AUTH_AREA));
  if ((inAuth ? AUTH_TOKENS : APP_TOKENS).has(token)) return;
  if (inAuth && REGISTER_TOKENS.has(token) && element.closest(REGISTER_AREA)) return;
  const isPassword = element.tagName === 'INPUT' && element.type === 'password';
  // Em senha, o navegador ignora "off"; "new-password" é o que impede preencher a salva.
  setIfDifferent(element, 'autocomplete', isPassword ? 'new-password' : 'off');
  for (const [name, value] of Object.entries(MANAGER_IGNORE)) setIfDifferent(element, name, value);
}

function guardTree(node) {
  if (node.nodeType !== 1) return;
  const isField = node.tagName === 'INPUT' || node.tagName === 'TEXTAREA' || node.tagName === 'FORM';
  if (isField) guardField(node);
  if (node.childElementCount === 0) return;
  node.querySelectorAll('input, textarea, form').forEach(guardField);
}

let installed = false;

export function installBrowserAutofillGuard(root = document.documentElement) {
  if (installed) return;
  installed = true;
  guardTree(root);
  const pendingAdded = new Set();
  let flushScheduled = false;
  const flushAdded = () => {
    flushScheduled = false;
    const batch = [...pendingAdded];
    pendingAdded.clear();
    const queued = new Set(batch);
    for (const node of batch) {
      if (!node.isConnected) continue;
      let covered = false;
      for (let p = node.parentElement; p; p = p.parentElement) {
        if (queued.has(p)) { covered = true; break; }
      }
      if (!covered) guardTree(node);
    }
  };
  new MutationObserver(records => {
    for (const record of records) {
      if (record.type === 'attributes') {
        guardField(record.target);
      } else {
        for (const node of record.addedNodes) {
          if (node.nodeType !== 1) continue;
          if (node.childElementCount === 0 && node.tagName !== 'INPUT' && node.tagName !== 'TEXTAREA' && node.tagName !== 'FORM') continue;
          pendingAdded.add(node);
        }
      }
    }
    if (pendingAdded.size && !flushScheduled) {
      flushScheduled = true;
      queueMicrotask(flushAdded);
    }
  }).observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: ['autocomplete'] });
  // Rede de segurança: o navegador só decide ao focar o campo.
  root.addEventListener('focusin', event => {
    if (event.target?.matches?.('input, textarea')) guardField(event.target);
  }, true);
}

if (typeof document !== 'undefined') installBrowserAutofillGuard();
