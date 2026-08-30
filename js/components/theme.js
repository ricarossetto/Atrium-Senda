import { iconSvg } from '../views/ui-v2/primitives.js';

export function createTheme({ showToast, onChange } = {}) {
  let initialized = false;
  let currentTheme = 'dark';

  function init() {
    if (initialized) return;
    initialized = true;
    const savedTheme = localStorage.getItem('atrium_theme') || localStorage.getItem('jurisflow_theme') || 'dark';
    setTheme(savedTheme);
    document.getElementById('themeToggleButton')?.addEventListener('click', toggleTheme);
  }

  function setTheme(theme) {
    currentTheme = theme;
    const icon = document.getElementById('themeToggleIcon');
    const text = document.getElementById('themeToggleText');
    const button = document.getElementById('themeToggleButton');
    if (theme === 'light') {
      document.documentElement.setAttribute('data-theme', 'light');
      if (icon) icon.innerHTML = iconSvg('sun');
      if (text) text.textContent = 'Tema Claro';
      if (button) {
        button.title = 'Tema Claro ativo. Clique para alternar para o Modo Escuro';
        button.setAttribute('aria-label', 'Tema claro ativo. Alternar para tema escuro');
        button.setAttribute('aria-pressed', 'true');
      }
    } else {
      document.documentElement.removeAttribute('data-theme');
      if (icon) icon.innerHTML = iconSvg('moon');
      if (text) text.textContent = 'Tema Escuro';
      if (button) {
        button.title = 'Tema Escuro ativo. Clique para alternar para o Modo Claro';
        button.setAttribute('aria-label', 'Tema escuro ativo. Alternar para tema claro');
        button.setAttribute('aria-pressed', 'false');
      }
    }
    localStorage.setItem('atrium_theme', theme);
    onChange?.(theme);
  }

  function toggleTheme() {
    const nextTheme = currentTheme === 'light' ? 'dark' : 'light';
    setTheme(nextTheme);
    showToast?.(`Tema alternado para Modo ${nextTheme === 'light' ? 'Claro' : 'Escuro'}.`, 'success');
  }

  return Object.freeze({
    init,
    setTheme,
    toggleTheme,
    get currentTheme() { return currentTheme; }
  });
}
