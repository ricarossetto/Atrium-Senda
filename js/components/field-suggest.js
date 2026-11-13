import { filterSuggestions } from '../core/field-context.js?v=3.1.0';

// Lista de sugestões própria do ATRIUM. Fica no body, em posição fixa, para não ser
// cortada pela rolagem do painel. Há uma só por página; só uma é usada de cada vez.
const POPUP_ID = 'fieldSuggestPopup';
let popup = null;
let current = null;

function ensurePopup() {
  if (popup?.isConnected) return popup;
  popup = document.createElement('div');
  popup.id = POPUP_ID;
  popup.className = 'field-suggest hidden';
  popup.setAttribute('role', 'listbox');
  popup.addEventListener('mousedown', event => event.preventDefault());
  popup.addEventListener('click', event => {
    const button = event.target.closest('[data-suggest-index]');
    if (button && current) choose(current, Number(button.dataset.suggestIndex));
  });
  document.body.append(popup);
  window.addEventListener('resize', () => { if (current) place(current.input); });
  document.addEventListener('scroll', event => {
    if (current && !popup.contains(event.target)) place(current.input);
  }, true);
  return popup;
}

function place(input) {
  const rect = input.getBoundingClientRect();
  if (!rect.width) { close(); return; }
  const margin = 6;
  const width = Math.min(Math.max(rect.width, 240), window.innerWidth - 16);
  popup.style.width = `${width}px`;
  popup.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - width - 8))}px`;
  const below = window.innerHeight - rect.bottom - margin - 8;
  const above = rect.top - margin - 8;
  const openUp = below < 160 && above > below;
  popup.style.maxHeight = `${Math.min(280, Math.max(openUp ? above : below, 120))}px`;
  popup.style.top = openUp ? 'auto' : `${rect.bottom + margin}px`;
  popup.style.bottom = openUp ? `${window.innerHeight - rect.top + margin}px` : 'auto';
}

function close() {
  if (!current) return;
  current.input.setAttribute('aria-expanded', 'false');
  current.input.removeAttribute('aria-activedescendant');
  current = null;
  popup?.classList.add('hidden');
}

function markActive(state, index) {
  state.active = index;
  popup.querySelectorAll('[data-suggest-index]').forEach((button, position) => {
    const on = position === index;
    button.setAttribute('aria-selected', String(on));
    if (on) {
      state.input.setAttribute('aria-activedescendant', button.id);
      button.scrollIntoView({ block: 'nearest' });
    }
  });
}

function open(input, config, query) {
  const options = filterSuggestions(config.getOptions() || [], query);
  const onlyItself = options.length === 1 && options[0].value === query.trim();
  if (!options.length || onlyItself) { close(); return; }
  ensurePopup();
  current = { input, config, options, active: -1 };
  popup.replaceChildren(...options.map((option, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.tabIndex = -1;
    button.id = `${POPUP_ID}-${index}`;
    button.setAttribute('role', 'option');
    button.setAttribute('aria-selected', 'false');
    button.dataset.suggestIndex = String(index);
    const strong = document.createElement('strong');
    strong.textContent = option.value;
    button.append(strong);
    if (option.label) {
      const small = document.createElement('small');
      small.textContent = option.label;
      button.append(small);
    }
    return button;
  }));
  popup.classList.remove('hidden');
  popup.scrollTop = 0;
  place(input);
  input.setAttribute('aria-expanded', 'true');
}

const lastSegment = value => String(value).split(',').pop().trimStart();

function choose(state, index) {
  const option = state.options[index];
  if (!option) return;
  const { input, config } = state;
  close();
  if (config.onChoose) {
    config.onChoose(option);
    return;
  }
  if (config.multiple) {
    const previous = String(input.value).split(',').slice(0, -1).map(item => item.trim()).filter(Boolean);
    input.value = `${[...previous, option.value].join(', ')}, `;
  } else {
    input.value = option.value;
  }
  input.dataset.suggestChoosing = 'true';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
  delete input.dataset.suggestChoosing;
  input.focus();
}

const attached = new WeakSet();

/** Liga a lista a um campo já existente, sem mudar seu nome, valor ou lugar no formulário. */
export function attachFieldSuggest(input, config) {
  if (!input || attached.has(input)) return;
  attached.add(input);
  ensurePopup();
  input.setAttribute('role', 'combobox');
  input.setAttribute('aria-autocomplete', 'list');
  input.setAttribute('aria-expanded', 'false');
  input.setAttribute('aria-controls', POPUP_ID);
  const queryOf = () => (config.multiple ? lastSegment(input.value) : input.value);

  input.addEventListener('input', () => {
    if (input.dataset.suggestChoosing) return;
    const query = queryOf();
    if (query.trim() || config.openOnClick) open(input, config, query);
    else close();
  });
  if (config.openOnClick) {
    input.addEventListener('click', () => {
      if (current?.input === input) close();
      else open(input, config, '');
    });
  }
  input.addEventListener('blur', () => { if (current?.input === input) close(); });
  input.addEventListener('keydown', event => {
    const isOpen = current?.input === input;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (!isOpen) open(input, config, config.openOnClick ? '' : queryOf());
      if (current?.input !== input) return;
      event.preventDefault();
      const size = current.options.length;
      const step = event.key === 'ArrowDown' ? 1 : -1;
      markActive(current, current.active < 0 ? (step > 0 ? 0 : size - 1) : (current.active + step + size) % size);
      return;
    }
    if (config.selectLike && event.key === 'Enter') event.preventDefault();
    if (!isOpen) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      close();
    } else if (event.key === 'Enter') {
      if (current.active >= 0) {
        event.preventDefault();
        choose(current, current.active);
      } else if (config.selectLike && current.options.length) {
        choose(current, 0);
      } else {
        close();
      }
    } else if (event.key === 'Tab') {
      close();
    }
  });
}

const enhanced = new WeakSet();

/**
 * Menu digitável. A lista nativa continua no formulário com o mesmo id e nome, só invisível:
 * o código de cada tela segue lendo e gravando nela, sem saber que há um campo por cima.
 */
export function enhanceSelect(select) {
  if (!select || enhanced.has(select)) return;
  enhanced.add(select);
  const proxy = document.createElement('input');
  proxy.type = 'text';
  proxy.className = 'field-select-proxy';
  proxy.id = `${select.id}-busca`;
  proxy.spellcheck = false;

  const realOptions = () => [...select.options].filter(option => option.value && !option.disabled);
  const sync = () => {
    const selected = select.options[select.selectedIndex];
    proxy.value = selected?.value ? selected.textContent.trim() : '';
    proxy.placeholder = [...select.options].find(option => !option.value)?.textContent.trim() || 'Digite para buscar';
    proxy.disabled = select.disabled;
    proxy.required = select.required;
  };

  const descriptor = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
  Object.defineProperty(select, 'value', {
    configurable: true,
    get() { return descriptor.get.call(this); },
    set(next) { descriptor.set.call(this, next); sync(); }
  });
  select.addEventListener('change', sync);
  new MutationObserver(sync).observe(select, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled', 'required'] });

  select.classList.add('field-select-native');
  select.tabIndex = -1;
  select.setAttribute('aria-hidden', 'true');
  select.addEventListener('focus', () => proxy.focus());
  select.before(proxy);
  const label = select.id ? select.closest('.field')?.querySelector(`label[for="${CSS.escape(select.id)}"]`) : null;
  if (label) label.htmlFor = proxy.id;
  sync();

  attachFieldSuggest(proxy, {
    selectLike: true,
    openOnClick: true,
    getOptions: () => realOptions().map(option => ({ value: option.textContent.trim() })),
    onChoose: option => {
      const match = realOptions().find(item => item.textContent.trim() === option.value);
      if (!match) return;
      select.value = match.value;
      select.dispatchEvent(new Event('input', { bubbles: true }));
      select.dispatchEvent(new Event('change', { bubbles: true }));
      proxy.focus();
    }
  });
  // Menu só aceita o que existe: ao sair, texto solto volta para a opção escolhida.
  proxy.addEventListener('blur', () => {
    if (proxy.value.trim()) { sync(); return; }
    if (select.value && [...select.options].some(option => !option.value)) {
      select.value = '';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    }
    sync();
  });
}
