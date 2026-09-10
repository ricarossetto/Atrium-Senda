(() => {
  document.documentElement.dataset.ui = 'v2';
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
})();

