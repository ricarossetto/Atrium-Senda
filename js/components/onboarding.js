export function createOnboarding({ getSettings, saveState, showToast, onSlideChange, onTimerChange } = {}) {
  let initialized = false;
  let currentSlide = 0;
  let tourTimer = null;

  function init() {
    if (initialized) return;
    initialized = true;

    document.getElementById('tourButton')?.addEventListener('click', () => open(true));
    document.getElementById('btnOpenTourFromConfig')?.addEventListener('click', () => open(true));
    document.getElementById('tourCloseButton')?.addEventListener('click', close);
    document.getElementById('tourSkipButton')?.addEventListener('click', close);
    document.getElementById('tourPrevButton')?.addEventListener('click', () => showSlide(currentSlide - 1));
    document.getElementById('tourNextButton')?.addEventListener('click', () => showSlide(currentSlide + 1));
    document.getElementById('guidedTourBackdrop')?.addEventListener('click', event => {
      if (event.target === document.getElementById('guidedTourBackdrop')) close();
    });
    document.getElementById('tourDots')?.addEventListener('click', event => {
      const dot = event.target.closest('.tour-dot');
      if (dot && dot.dataset.slideTarget !== undefined) showSlide(Number(dot.dataset.slideTarget));
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape') {
        close();
        return;
      }
      const backdrop = document.getElementById('guidedTourBackdrop');
      if (!backdrop || backdrop.classList.contains('hidden')) return;
      if (event.key === 'ArrowRight') showSlide(currentSlide + 1);
      else if (event.key === 'ArrowLeft') showSlide(currentSlide - 1);
    });
  }

  function checkFirstAccess() {
    if (hasBeenSeen()) return;
    if (tourTimer) window.clearTimeout(tourTimer);
    tourTimer = window.setTimeout(() => open(), 600);
    onTimerChange?.(tourTimer);
  }

  function open(force = false) {
    if (hasBeenSeen() && !force) return;
    showSlide(0);
    document.getElementById('guidedTourBackdrop')?.classList.remove('hidden');
  }

  function close() {
    if (tourTimer) window.clearTimeout(tourTimer);
    document.getElementById('guidedTourBackdrop')?.classList.add('hidden');
    localStorage.setItem('atrium_tour_seen', 'true');
    localStorage.setItem('jurisflow_tour_seen', 'true');
    const settings = getSettings?.();
    if (settings) {
      settings.guidedTourSeen = true;
      saveState?.();
    }
  }

  function showSlide(index) {
    const slides = document.querySelectorAll('.tour-slide');
    const dots = document.querySelectorAll('.tour-dot');
    const total = slides.length;
    if (index < 0) index = 0;
    if (index >= total) {
      close();
      showToast?.('Apresentação concluída! Bom trabalho.', 'success');
      return;
    }

    currentSlide = index;
    onSlideChange?.(index);
    slides.forEach((slide, slideIndex) => slide.classList.toggle('active', slideIndex === index));
    dots.forEach((dot, dotIndex) => {
      dot.classList.toggle('active', dotIndex === index);
      dot.setAttribute('aria-selected', String(dotIndex === index));
    });

    const previousButton = document.getElementById('tourPrevButton');
    const nextButton = document.getElementById('tourNextButton');
    if (previousButton) previousButton.style.display = index > 0 ? 'inline-block' : 'none';
    if (nextButton) nextButton.textContent = index === total - 1 ? '🚀 Começar a usar o Atrium' : 'Próximo →';
  }

  function hasBeenSeen() {
    return localStorage.getItem('atrium_tour_seen')
      || localStorage.getItem('jurisflow_tour_seen')
      || getSettings?.()?.guidedTourSeen;
  }

  return Object.freeze({
    init,
    checkFirstAccess,
    open,
    close,
    showSlide,
    get currentSlide() { return currentSlide; },
    get timer() { return tourTimer; }
  });
}
