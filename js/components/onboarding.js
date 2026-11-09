import { safeImageSource } from '../core/link-safety.js?v=3.0.2';

function escapeAttribute(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[character]));
}

export function createOnboarding({ getSettings, saveState, showToast, onSlideChange, onTimerChange, onNavigate, onActivateAi, isAiEnabled, onOpenTour = null } = {}) {
  let initialized = false;
  let currentSlide = 0;
  let tourTimer = null;
  let draftPhoto = null;
  let draftLogo = null;
  let selectedTheme = 'dark';

  function init() {
    if (initialized) return;
    initialized = true;

    const openTour = () => (onOpenTour ? onOpenTour() : open(true));
    document.getElementById('tourButton')?.addEventListener('click', openTour);
    document.getElementById('btnOpenTourFromConfig')?.addEventListener('click', openTour);
    document.getElementById('tourCloseButton')?.addEventListener('click', close);
    document.getElementById('tourSkipButton')?.addEventListener('click', close);
    document.getElementById('tourRegisterA1Now')?.addEventListener('click', () => {
      selectA1Option('certOptNow');
      close();
      onNavigate?.('integrations');
      showToast?.('Abra Conexões com tribunais para vincular seu Certificado A1.', 'success');
    });
    document.getElementById('tourPrevButton')?.addEventListener('click', () => showSlide(currentSlide - 1));
    document.getElementById('tourNextButton')?.addEventListener('click', () => showSlide(currentSlide + 1));
    // Ativação do Atrium IA direto no walkthrough: mesma rota oficial do painel (admin + CSRF),
    // e a pessoa pode desligar depois em Configurações. Nesta fase é gratuita.
    document.getElementById('tourActivateAi')?.addEventListener('click', async () => {
      const botao = document.getElementById('tourActivateAi');
      const rotulo = document.getElementById('tourActivateAiLabel');
      const status = document.getElementById('tourActivateAiStatus');
      if (!botao || !status) return;
      botao.disabled = true;
      status.textContent = 'Ativando…';
      const ativado = typeof onActivateAi === 'function' ? await onActivateAi(true) : false;
      botao.disabled = false;
      if (ativado) {
        if (rotulo) rotulo.textContent = 'Atrium IA ativado';
        status.textContent = 'Pronto: o robô começa pelas publicações abertas.';
        showToast?.('Atrium IA ativado. Você pode desligar quando quiser em Configurações.', 'success');
      } else {
        status.textContent = 'Não foi possível ativar agora — tente em Configurações.';
      }
    });
    document.getElementById('guidedTourBackdrop')?.addEventListener('click', event => {
      if (event.target === document.getElementById('guidedTourBackdrop')) close();
    });
    document.getElementById('tourDots')?.addEventListener('click', event => {
      const dot = event.target.closest('.tour-dot');
      if (dot && dot.dataset.slideTarget !== undefined) showSlide(Number(dot.dataset.slideTarget));
    });

    // Stepper header navigation
    document.getElementById('tourStepper')?.addEventListener('click', event => {
      const step = event.target.closest('.tour-step-indicator');
      if (step && step.dataset.step !== undefined) showSlide(Number(step.dataset.step));
    });

    // Photo upload
    document.getElementById('btnOnboardingChoosePhoto')?.addEventListener('click', () => {
      document.getElementById('onboardingPhotoInput')?.click();
    });
    document.getElementById('onboardingPhotoInput')?.addEventListener('change', event => {
      const file = event.target.files?.[0];
      if (file) handlePhotoUpload(file);
    });
    document.getElementById('btnOnboardingRemovePhoto')?.addEventListener('click', removePhoto);

    // Logo upload
    document.getElementById('btnOnboardingChooseLogo')?.addEventListener('click', () => {
      document.getElementById('onboardingLogoInput')?.click();
    });
    document.getElementById('onboardingLogoInput')?.addEventListener('change', event => {
      const file = event.target.files?.[0];
      if (file) handleLogoUpload(file);
    });
    document.getElementById('btnOnboardingRemoveLogo')?.addEventListener('click', removeLogo);

    // Live typing listeners to update badge preview
    ['onboardingLawyerName', 'onboardingLawyerOab', 'onboardingLawyerUf', 'onboardingOfficeName', 'onboardingOfficeCity'].forEach(id => {
      document.getElementById(id)?.addEventListener('input', updateBadgePreview);
      document.getElementById(id)?.addEventListener('change', updateBadgePreview);
    });

    // Theme selector
    const setupCardAction = (el, action) => {
      if (!el) return;
      el.addEventListener('click', action);
      el.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          action();
        }
      });
    };
    setupCardAction(document.getElementById('onboardingThemeCardDark'), () => selectTheme('dark'));
    setupCardAction(document.getElementById('onboardingThemeCardLight'), () => selectTheme('light'));

    // A1 Choice card selectors in Slide 4
    ['certOptNow', 'certOptLater', 'certOptNone'].forEach(optId => {
      setupCardAction(document.getElementById(optId), () => selectA1Option(optId));
    });

    document.addEventListener('keydown', event => {
      const backdrop = document.getElementById('guidedTourBackdrop');
      if (!backdrop || backdrop.classList.contains('hidden')) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopImmediatePropagation();
        close();
        return;
      }
      if (event.key === 'ArrowRight') showSlide(currentSlide + 1);
      else if (event.key === 'ArrowLeft') showSlide(currentSlide - 1);
    });
  }

  function handlePhotoUpload(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
      draftPhoto = e.target.result;
      const img = document.getElementById('onboardingAvatarImg');
      const initials = document.getElementById('onboardingAvatarInitials');
      const removeBtn = document.getElementById('btnOnboardingRemovePhoto');
      if (img) {
        img.src = draftPhoto;
        img.classList.remove('hidden');
      }
      if (initials) initials.classList.add('hidden');
      if (removeBtn) removeBtn.classList.remove('hidden');
      updateBadgePreview();
    };
    reader.readAsDataURL(file);
  }

  function removePhoto() {
    draftPhoto = null;
    const img = document.getElementById('onboardingAvatarImg');
    const initials = document.getElementById('onboardingAvatarInitials');
    const removeBtn = document.getElementById('btnOnboardingRemovePhoto');
    const input = document.getElementById('onboardingPhotoInput');
    if (input) input.value = '';
    if (img) {
      img.src = '';
      img.classList.add('hidden');
    }
    if (initials) initials.classList.remove('hidden');
    if (removeBtn) removeBtn.classList.add('hidden');
    updateBadgePreview();
  }

  function handleLogoUpload(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
      draftLogo = safeImageSource(e.target.result);
      if (!draftLogo) {
        showToast?.('Imagem de logo inválida. Use PNG ou JPEG.', 'error');
        return;
      }
      const img = document.getElementById('onboardingLogoImg');
      const placeholder = document.getElementById('onboardingLogoPlaceholder');
      const removeBtn = document.getElementById('btnOnboardingRemoveLogo');
      if (img) {
        img.src = draftLogo;
        img.classList.remove('hidden');
      }
      if (placeholder) placeholder.classList.add('hidden');
      if (removeBtn) removeBtn.classList.remove('hidden');
      updateBadgePreview();
    };
    reader.readAsDataURL(file);
  }

  function removeLogo() {
    draftLogo = null;
    const img = document.getElementById('onboardingLogoImg');
    const placeholder = document.getElementById('onboardingLogoPlaceholder');
    const removeBtn = document.getElementById('btnOnboardingRemoveLogo');
    const input = document.getElementById('onboardingLogoInput');
    if (input) input.value = '';
    if (img) {
      img.src = '';
      img.classList.add('hidden');
    }
    if (placeholder) placeholder.classList.remove('hidden');
    if (removeBtn) removeBtn.classList.add('hidden');
    updateBadgePreview();
  }

  let selectedA1Option = 'certOptNone';

  function selectA1Option(optId) {
    selectedA1Option = optId;
    ['certOptNow', 'certOptLater', 'certOptNone'].forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.classList.toggle('active', id === optId);
        el.setAttribute('aria-checked', String(id === optId));
      }
    });
    const uploadArea = document.getElementById('onboardingA1UploadFields');
    if (uploadArea) {
      uploadArea.classList.toggle('hidden', optId !== 'certOptNow');
    }
    const guideBox = document.getElementById('onboardingA1GuideBox');
    if (guideBox) {
      guideBox.classList.toggle('hidden', optId !== 'certOptNow');
    }
  }

  function selectTheme(theme) {
    selectedTheme = theme === 'dark' ? 'dark' : 'light';
    document.getElementById('onboardingThemeCardDark')?.classList.toggle('active', selectedTheme === 'dark');
    document.getElementById('onboardingThemeCardLight')?.classList.toggle('active', selectedTheme === 'light');

    if (selectedTheme === 'light') {
      document.documentElement.setAttribute('data-theme', 'light');
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
    try { localStorage.setItem('atrium_theme', selectedTheme); } catch {}
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', selectedTheme === 'light' ? '#eef1f1' : '#0c0c0b');

    document.querySelectorAll('[data-theme-toggle]').forEach(button => {
      button.setAttribute('aria-pressed', selectedTheme === 'light' ? 'true' : 'false');
    });

    showToast?.(`Tema alternado para Modo ${selectedTheme === 'light' ? 'Claro' : 'Escuro'}.`, 'success');
  }

  function updateBadgePreview() {
    const lawyerNameVal = document.getElementById('onboardingLawyerName')?.value?.trim() || 'Dr(a). Advogado(a) Titular';
    const lawyerOabVal = document.getElementById('onboardingLawyerOab')?.value?.trim();
    const lawyerUfVal = document.getElementById('onboardingLawyerUf')?.value?.trim() || 'RS';
    const officeNameVal = document.getElementById('onboardingOfficeName')?.value?.trim() || 'Meu Escritório';
    const officeCityVal = document.getElementById('onboardingOfficeCity')?.value?.trim() || 'Porto Alegre / RS';

    const words = lawyerNameVal.replace(/^(Dr\.|Dra\.|Dr\(a\)\.)\s*/i, '').trim().split(/\s+/).filter(Boolean);
    const initials = words.length > 1 ? (words[0][0] + words[words.length - 1][0]).toUpperCase() : (words[0]?.slice(0, 2)?.toUpperCase() || 'DR');

    const avatarInitials = document.getElementById('onboardingAvatarInitials');
    if (avatarInitials && !draftPhoto) avatarInitials.textContent = initials;

    // Badge Elements
    const badgeName = document.getElementById('badgeLawyerName');
    if (badgeName) badgeName.textContent = lawyerNameVal;

    const badgeOab = document.getElementById('badgeLawyerOab');
    if (badgeOab) badgeOab.textContent = lawyerOabVal ? `OAB/${lawyerUfVal} ${lawyerOabVal}` : `OAB/${lawyerUfVal} 000000`;

    const badgeOffice = document.getElementById('badgeOfficeName');
    if (badgeOffice) badgeOffice.textContent = officeNameVal;

    const badgeCity = document.getElementById('badgeOfficeCity');
    if (badgeCity) badgeCity.textContent = `· ${officeCityVal}`;

    const badgeAvatarImg = document.getElementById('badgeAvatarImg');
    const badgeAvatarInit = document.getElementById('badgeAvatarInitials');
    if (badgeAvatarImg && badgeAvatarInit) {
      if (draftPhoto) {
        badgeAvatarImg.src = draftPhoto;
        badgeAvatarImg.classList.remove('hidden');
        badgeAvatarInit.classList.add('hidden');
      } else {
        badgeAvatarImg.src = '';
        badgeAvatarImg.classList.add('hidden');
        badgeAvatarInit.textContent = initials;
        badgeAvatarInit.classList.remove('hidden');
      }
    }

    const badgeLogoMini = document.getElementById('badgeOfficeLogoMini');
    if (badgeLogoMini) {
      if (draftLogo) {
        badgeLogoMini.src = draftLogo;
        badgeLogoMini.classList.remove('hidden');
      } else {
        badgeLogoMini.src = '';
        badgeLogoMini.classList.add('hidden');
      }
    }
  }

  function checkFirstAccess() {
    if (!initialized) init();
    if (hasBeenSeen()) return;
    cancelTimer();
    tourTimer = window.setTimeout(() => {
      tourTimer = null;
      onTimerChange?.(null);
      if (document.querySelector?.('.modal-backdrop:not(.hidden):not(#guidedTourBackdrop)')) return;
      open();
    }, 600);
    onTimerChange?.(tourTimer);
  }

  function cancelTimer() {
    if (tourTimer) window.clearTimeout(tourTimer);
    tourTimer = null;
    onTimerChange?.(null);
  }

  function open(force = false) {
    if (!initialized) init();
    if (hasBeenSeen() && !force) return;

    // Load initial settings into inputs
    const settings = getSettings?.() || {};
    const lawyerNameInput = document.getElementById('onboardingLawyerName');
    if (lawyerNameInput && !lawyerNameInput.value && settings.lawyerName) lawyerNameInput.value = settings.lawyerName;

    const lawyerOabInput = document.getElementById('onboardingLawyerOab');
    if (lawyerOabInput && !lawyerOabInput.value && settings.lawyerOab) {
      const parts = settings.lawyerOab.split(/[\/\s]+/);
      lawyerOabInput.value = parts[parts.length - 1] || '';
      if (parts[0] && parts[0].length === 2) {
        const ufSel = document.getElementById('onboardingLawyerUf');
        if (ufSel) ufSel.value = parts[0].toUpperCase();
      }
    }

    const officeNameInput = document.getElementById('onboardingOfficeName');
    if (officeNameInput && !officeNameInput.value && settings.officeName) officeNameInput.value = settings.officeName;

    const officeSloganInput = document.getElementById('onboardingOfficeSlogan');
    if (officeSloganInput && !officeSloganInput.value && settings.officeSlogan) officeSloganInput.value = settings.officeSlogan;

    const officeCityInput = document.getElementById('onboardingOfficeCity');
    if (officeCityInput && !officeCityInput.value && settings.city) officeCityInput.value = settings.city;

    if (settings.officeLogo && !draftLogo) {
      draftLogo = safeImageSource(settings.officeLogo);
      const logoImg = document.getElementById('onboardingLogoImg');
      const placeholder = document.getElementById('onboardingLogoPlaceholder');
      const removeBtn = document.getElementById('btnOnboardingRemoveLogo');
      if (logoImg && draftLogo) {
        logoImg.src = draftLogo;
        logoImg.classList.remove('hidden');
      }
      if (draftLogo && placeholder) placeholder.classList.add('hidden');
      if (draftLogo && removeBtn) removeBtn.classList.remove('hidden');
    }

    const currentThemeAttr = document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
    selectedTheme = currentThemeAttr;
    document.getElementById('onboardingThemeCardDark')?.classList.toggle('active', currentThemeAttr === 'dark');
    document.getElementById('onboardingThemeCardLight')?.classList.toggle('active', currentThemeAttr === 'light');

    updateBadgePreview();
    syncAiCard();
    showSlide(0);
    document.getElementById('guidedTourBackdrop')?.classList.remove('hidden');
  }

  /** Reflete no cartão do walkthrough o estado real do Atrium IA neste escritório. */
  function syncAiCard() {
    const rotulo = document.getElementById('tourActivateAiLabel');
    const status = document.getElementById('tourActivateAiStatus');
    if (!rotulo) return;
    const ativo = typeof isAiEnabled === 'function' && isAiEnabled();
    rotulo.textContent = ativo ? 'Atrium IA ativado' : 'Ativar o Atrium IA';
    if (status && ativo) status.textContent = 'Já ativado neste escritório.';
  }

  function close() {
    const backdrop = document.getElementById('guidedTourBackdrop');
    if (!backdrop || backdrop.classList.contains('hidden')) return;
    cancelTimer();
    backdrop.classList.add('hidden');
    localStorage.setItem('atrium_tour_seen', 'true');
    localStorage.setItem('jurisflow_tour_seen', 'true');

    const settings = getSettings?.();
    if (settings) {
      settings.guidedTourSeen = true;
      settings.a1Choice = selectedA1Option;

      const lawyerName = document.getElementById('onboardingLawyerName')?.value?.trim();
      const lawyerOab = document.getElementById('onboardingLawyerOab')?.value?.trim();
      const lawyerUf = document.getElementById('onboardingLawyerUf')?.value?.trim() || 'RS';
      const officeName = document.getElementById('onboardingOfficeName')?.value?.trim();
      const officeSlogan = document.getElementById('onboardingOfficeSlogan')?.value?.trim();
      const officeAddress = document.getElementById('onboardingOfficeAddress')?.value?.trim();
      const officeCity = document.getElementById('onboardingOfficeCity')?.value?.trim();

      if (lawyerName) settings.lawyerName = lawyerName;
      if (lawyerOab) settings.lawyerOab = `OAB/${lawyerUf} ${lawyerOab}`;
      if (officeName) settings.officeName = officeName;
      if (officeSlogan) settings.officeSlogan = officeSlogan;
      if (officeAddress) settings.lawyerAddress = officeAddress;
      if (officeCity) settings.city = officeCity;
      const deadlineModeChoice = document.querySelector('input[name="onboardingDeadlineMode"]:checked');
      if (deadlineModeChoice) settings.deadlineMode = deadlineModeChoice.value === 'manual' ? 'manual' : 'auto';
      if (draftLogo) settings.officeLogo = draftLogo;

      saveState?.();

      // Reflect in sidebar & header immediately
      const nameEl = document.getElementById('sidebarOfficeName');
      const labelEl = document.getElementById('sidebarOfficeLabel');
      if (nameEl && settings.officeName) nameEl.textContent = settings.officeName;
      if (labelEl && settings.officeSlogan) labelEl.textContent = settings.officeSlogan;

      const avatarEl = document.querySelector('.sidebar-office .office-avatar-icon');
      const safeLogo = safeImageSource(settings.officeLogo);
      if (avatarEl && safeLogo) {
        avatarEl.innerHTML = `<img src="${escapeAttribute(safeLogo)}" class="office-custom-logo" alt="Logo">`;
        avatarEl.style.background = 'transparent';
        avatarEl.style.backgroundImage = 'none';
      }

      if (draftPhoto && typeof window !== 'undefined' && window.KellerAuth?.currentUser) {
        window.KellerAuth.currentUser.photo = draftPhoto;
        const profileImg = document.getElementById('profileAvatarImage');
        if (profileImg) {
          profileImg.src = draftPhoto;
          profileImg.hidden = false;
        }
      }
    }
  }

  function showSlide(index) {
    if (!initialized) init();
    const slides = document.querySelectorAll('.tour-slide');
    const dots = document.querySelectorAll('.tour-dot');
    const stepIndicators = document.querySelectorAll('#tourStepper .tour-step-indicator');
    const total = slides.length || 6;
    if (index < 0) index = 0;
    if (index >= total) {
      close();
      showToast?.('Apresentação concluída! Bom trabalho.', 'success');
      return;
    }

    currentSlide = index;
    onSlideChange?.(index);

    // Slide transition
    const track = document.getElementById('tourSlidesTrack');
    if (track) {
      track.style.transform = 'none';
    }

    const container = document.querySelector('.tour-slides-container');
    if (container) {
      container.scrollTop = 0;
    }

    slides.forEach((slide, slideIndex) => {
      const isActive = slideIndex === index;
      slide.classList.toggle('active', isActive);
      if (isActive) {
        slide.scrollTop = 0;
      }
    });
    dots.forEach((dot, dotIndex) => {
      dot.classList.toggle('active', dotIndex === index);
      dot.setAttribute('aria-selected', String(dotIndex === index));
    });
    stepIndicators.forEach((indicator, stepIndex) => {
      indicator.classList.toggle('active', stepIndex === index);
    });

    updateBadgePreview();

    const previousButton = document.getElementById('tourPrevButton');
    const nextButton = document.getElementById('tourNextButton');
    if (previousButton) previousButton.style.display = index > 0 ? 'inline-block' : 'none';
    if (nextButton) nextButton.innerHTML = index === total - 1 ? 'Começar a usar o Atrium' : 'Próximo ' + '<svg class="atrium-icon" aria-hidden="true" focusable="false"><use href="assets/icons/atrium-ui-icons.svg?v=3.0.2#atrium-icon-chevron-right"></use></svg>';
  }

  function hasBeenSeen() {
    return localStorage.getItem('atrium_tour_seen')
      || localStorage.getItem('jurisflow_tour_seen')
      || getSettings?.()?.guidedTourSeen;
  }

  return Object.freeze({
    init,
    checkFirstAccess,
    cancelTimer,
    open,
    close,
    showSlide,
    get currentSlide() { return currentSlide; },
    get timer() { return tourTimer; }
  });
}
