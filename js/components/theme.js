import { iconSvg } from '../views/ui-v2/primitives.js?v=3.4.0';

// Botão com balão próprio não recebe também a dica do navegador: seriam dois textos sobre o mesmo ícone.
function setToggleHint(button, text) {
  if (button.hasAttribute('aria-describedby')) button.removeAttribute('title');
  else button.title = text;
}

function applyChrome(theme) {
  if (typeof globalThis.__atriumApplyThemeChrome === 'function') {
    globalThis.__atriumApplyThemeChrome(theme);
    return;
  }
  const dark = theme === 'dark';
  const bg = dark ? '#111315' : '#f3f4f2';
  const r = document.documentElement;
  r.dataset.theme = dark ? 'dark' : 'light';
  r.style.colorScheme = dark ? 'dark' : 'light';
  r.style.backgroundColor = bg;
  if (document.head) {
    document.head.querySelectorAll('meta[name="theme-color"]').forEach(m => m.remove());
    const meta = document.createElement('meta');
    meta.name = 'theme-color';
    meta.content = bg;
    document.head.appendChild(meta);
  }
}

function readStoredTheme() {
  try {
    return localStorage.getItem('atrium_theme') || localStorage.getItem('jurisflow_theme');
  } catch {
    return null;
  }
}

function getSystemTheme() {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)')?.matches ? 'dark' : 'light';
}

export function createTheme({ showToast, onChange } = {}) {
  let initialized = false;
  let currentTheme = 'light';
  let followSystem = false;

  function init() {
    if (initialized) return;
    initialized = true;
    const stored = readStoredTheme();
    if (stored === 'dark' || stored === 'light') {
      followSystem = false;
      applyTheme(stored, { persist: true });
    } else {
      followSystem = true;
      applyTheme(getSystemTheme(), { persist: stored !== 'system' });
    }
    const mediaQuery = typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-color-scheme: dark)')
      : null;
    const onSchemeChange = event => {
      if (followSystem || readStoredTheme() === 'system') {
        applyTheme(event.matches ? 'dark' : 'light', { persist: false });
      }
    };
    if (typeof mediaQuery?.addEventListener === 'function') {
      mediaQuery.addEventListener('change', onSchemeChange);
    } else if (typeof mediaQuery?.addListener === 'function') {
      mediaQuery.addListener(onSchemeChange);
    }
    document.querySelectorAll('[data-theme-toggle]').forEach(button => button.addEventListener('click', toggleTheme));
  }

  function applyTheme(theme, { persist = true } = {}) {
    currentTheme = theme === 'dark' ? 'dark' : 'light';
    applyChrome(currentTheme);

    document.querySelectorAll('[data-theme-toggle]').forEach(button => {
      const icon = button.querySelector('[data-theme-toggle-icon]');
      const text = button.querySelector('[data-theme-toggle-text]');
      if (currentTheme === 'light') {
        if (icon) icon.innerHTML = iconSvg('theme-light');
        if (text) text.textContent = 'Tema Claro';
        setToggleHint(button, 'Tema Claro ativo. Clique para alternar para o Modo Escuro');
        button.setAttribute('aria-label', 'Tema claro ativo. Alternar para tema escuro');
        button.setAttribute('aria-pressed', 'true');
      } else {
        if (icon) icon.innerHTML = iconSvg('theme-dark');
        if (text) text.textContent = 'Tema Escuro';
        setToggleHint(button, 'Tema Escuro ativo. Clique para alternar para o Modo Claro');
        button.setAttribute('aria-label', 'Tema escuro ativo. Alternar para tema claro');
        button.setAttribute('aria-pressed', 'false');
      }
    });
    if (persist) {
      try { localStorage.setItem('atrium_theme', currentTheme); } catch {}
    }
    onChange?.(currentTheme);
  }

  function setTheme(theme) {
    if (theme === 'system') {
      followSystem = true;
      try { localStorage.setItem('atrium_theme', 'system'); } catch {}
      applyTheme(getSystemTheme(), { persist: false });
      return;
    }
    followSystem = false;
    applyTheme(theme === 'dark' ? 'dark' : 'light', { persist: true });
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
