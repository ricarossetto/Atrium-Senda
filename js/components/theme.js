import { iconSvg } from '../views/ui-v2/primitives.js';

export function createTheme({ showToast, onChange } = {}) {
  let initialized = false;
  let currentTheme = 'light';

  function init() {
    if (initialized) return;
    initialized = true;
    let savedTheme = 'light';
    try {
      savedTheme = localStorage.getItem('atrium_theme') || localStorage.getItem('jurisflow_theme') || 'light';
    } catch {}
    setTheme(savedTheme);
    document.querySelectorAll('[data-theme-toggle]').forEach(button => button.addEventListener('click', toggleTheme));
  }

  function setTheme(theme) {
    currentTheme = theme === 'dark' ? 'dark' : 'light';
    if (currentTheme === 'light') {
      document.documentElement.setAttribute('data-theme', 'light');
    } else {
      document.documentElement.removeAttribute('data-theme');
    }

    document.querySelectorAll('[data-theme-toggle]').forEach(button => {
      const icon = button.querySelector('[data-theme-toggle-icon]');
      const text = button.querySelector('[data-theme-toggle-text]');
      if (currentTheme === 'light') {
        if (icon) icon.innerHTML = iconSvg('sun');
        if (text) text.textContent = 'Tema Claro';
        button.title = 'Tema Claro ativo. Clique para alternar para o Modo Escuro';
        button.setAttribute('aria-label', 'Tema claro ativo. Alternar para tema escuro');
        button.setAttribute('aria-pressed', 'true');
      } else {
        if (icon) icon.innerHTML = iconSvg('moon');
        if (text) text.textContent = 'Tema Escuro';
        button.title = 'Tema Escuro ativo. Clique para alternar para o Modo Claro';
        button.setAttribute('aria-label', 'Tema escuro ativo. Alternar para tema claro');
        button.setAttribute('aria-pressed', 'false');
      }
    });
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', currentTheme === 'light' ? '#eef1f1' : '#0c0c0b');
    try { localStorage.setItem('atrium_theme', currentTheme); } catch {}
    onChange?.(currentTheme);
  }

  function toggleTheme(event) {
    const nextTheme = currentTheme === 'light' ? 'dark' : 'light';
    setTheme(nextTheme);
    if (event?.currentTarget?.dataset.themeSilent !== 'true') {
      showToast?.(`Tema alternado para Modo ${nextTheme === 'light' ? 'Claro' : 'Escuro'}.`, 'success');
    }
  }

  return Object.freeze({
    init,
    setTheme,
    toggleTheme,
    get currentTheme() { return currentTheme; }
  });
}
