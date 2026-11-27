(() => {
  document.documentElement.dataset.ui = 'v2';
  try {
    const host = String(location.hostname || '').toLowerCase();
    const basicHost = host === 'basic.atrium.adv.br' || host.endsWith('.basic.atrium.adv.br') || host === 'senda.atrium.adv.br' || host.endsWith('.senda.atrium.adv.br') || host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '';
    let density = null;
    try { density = String(localStorage.getItem('atrium_ui_density') || '').trim().toLowerCase(); } catch {}
    if (density !== 'basic' && density !== 'pro') {
      density = basicHost ? 'basic' : 'pro';
    }
    document.documentElement.dataset.uiDensity = density;
  } catch {
    document.documentElement.dataset.uiDensity = 'basic';
  }
  try {
    const p = String(location.pathname || '').toLowerCase();
    const s = new URLSearchParams(location.search);
    const h = String(location.hash || '').toLowerCase();
    const isDiscover = p.includes('/discover') || p.includes('/landing') || s.has('discover') || h.includes('discover');
    document.documentElement.dataset.route = isDiscover ? 'discover' : 'app';
  } catch {}
  function applyThemeChrome(theme) {
    const dark = theme === 'dark';
    const bg = dark ? '#111315' : '#f3f4f2';
    const r = document.documentElement;
    r.dataset.theme = dark ? 'dark' : 'light';
    if (r.style) {
      r.style.colorScheme = dark ? 'dark' : 'light';
      r.style.backgroundColor = bg;
    }
    if (document.head) {
      document.head.querySelectorAll('meta[name="theme-color"]').forEach(m => m.remove());
      const meta = document.createElement('meta');
      meta.name = 'theme-color';
      meta.content = bg;
      document.head.appendChild(meta);
    } else {
      document.querySelector?.('meta[name="theme-color"]')?.setAttribute?.('content', bg);
    }
  }
  globalThis.__atriumApplyThemeChrome = applyThemeChrome;

  function readStoredTheme() {
    try {
      return localStorage.getItem('atrium_theme') || localStorage.getItem('jurisflow_theme');
    } catch {
      return null;
    }
  }

  const mediaQuery = typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-color-scheme: dark)')
    : null;
  const storedTheme = readStoredTheme();
  const initialTheme = (storedTheme === 'dark' || storedTheme === 'light')
    ? storedTheme
    : (mediaQuery?.matches ? 'dark' : 'light');
  applyThemeChrome(initialTheme);

  const handleSystemSchemeChange = event => {
    const latest = readStoredTheme();
    if (!latest || latest === 'system') {
      applyThemeChrome(event.matches ? 'dark' : 'light');
    }
  };
  if (typeof mediaQuery?.addEventListener === 'function') {
    mediaQuery.addEventListener('change', handleSystemSchemeChange);
  } else if (typeof mediaQuery?.addListener === 'function') {
    mediaQuery.addListener(handleSystemSchemeChange);
  }
})();

