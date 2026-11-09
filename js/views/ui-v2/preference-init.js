(() => {
  document.documentElement.dataset.ui = 'v2';
  try {
    const host = String(location.hostname || '').toLowerCase();
    const basicHost = host === 'basic.atrium.adv.br' || host.endsWith('.basic.atrium.adv.br');
    let density = null;
    try { density = String(localStorage.getItem('atrium_ui_density') || '').trim().toLowerCase(); } catch {}
    if (density !== 'basic' && density !== 'pro') {
      density = basicHost ? 'basic' : 'pro';
    }
    document.documentElement.dataset.uiDensity = density;
  } catch {
    document.documentElement.dataset.uiDensity = 'pro';
  }
  try {
    const p = String(location.pathname || '').toLowerCase();
    const s = new URLSearchParams(location.search);
    const h = String(location.hash || '').toLowerCase();
    const isDiscover = p.includes('/discover') || p.includes('/landing') || s.has('discover') || h.includes('discover');
    document.documentElement.dataset.route = isDiscover ? 'discover' : 'app';
  } catch {}
  let storedTheme = null;
  try {
    storedTheme = localStorage.getItem('atrium_theme') || localStorage.getItem('jurisflow_theme');
  } catch {}
  if (storedTheme === 'dark' || storedTheme === 'light') {
    document.documentElement.dataset.theme = storedTheme;
  } else if (typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    document.documentElement.dataset.theme = 'dark';
  } else {
    document.documentElement.dataset.theme = 'light';
  }
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', document.documentElement.dataset.theme === 'dark' ? '#0c0c0b' : '#eef1f1');
})();

