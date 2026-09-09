(() => {
  document.documentElement.dataset.ui = 'v2';
  let storedTheme = null;
  try {
    storedTheme = localStorage.getItem('atrium_theme') || localStorage.getItem('jurisflow_theme');
  } catch {}
  if (storedTheme !== 'dark') document.documentElement.dataset.theme = 'light';
})();
