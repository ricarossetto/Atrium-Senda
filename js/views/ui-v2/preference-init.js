(() => {
  const UI_MODE_KEY = 'atrium:ui:mode';
  let mode = 'v2';
  try {
    const savedMode = localStorage.getItem(UI_MODE_KEY);
    if (savedMode === 'classic' || savedMode === 'v2') mode = savedMode;
  } catch {
    // A apresentação V2 é o baseline do produto mesmo sem storage local.
  }
  document.documentElement.dataset.ui = mode;
})();
