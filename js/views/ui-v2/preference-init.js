(() => {
  const UI_MODE_KEY = 'atrium:ui:mode';
  let mode = 'classic';
  try {
    const savedMode = localStorage.getItem(UI_MODE_KEY);
    if (savedMode === 'classic' || savedMode === 'v2') mode = savedMode;
  } catch {
    // A apresentação Classic continua sendo o fallback seguro sem storage local.
  }
  document.documentElement.dataset.ui = mode;
})();
