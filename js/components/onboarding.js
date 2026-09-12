export function createOnboarding({ getSettings, saveState, showToast, onSlideChange, onTimerChange } = {}) {
  let initialized = false;
  let currentSlide = 0;
  let tourTimer = null;
  let draftPhoto = null;
  let draftLogo = null;
  let selectedTheme = 'dark';

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
    document.getElementById('onboardingThemeCardDark')?.addEventListener('click', () => selectTheme('dark'));
    document.getElementById('onboardingThemeCardLight')?.addEventListener('click', () => selectTheme('light'));

    // A1 Choice card selectors in Slide 4
    ['certOptNow', 'certOptLater', 'certOptNone'].forEach(optId => {
      document.getElementById(optId)?.addEventListener('click', () => selectA1Option(optId));
    });

    // A1 File upload handlers in onboarding
    document.getElementById('btnOnboardingCertChoose')?.addEventListener('click', () => {
      document.getElementById('onboardingA1FileInput')?.click();
    });
    document.getElementById('onboardingA1FileInput')?.addEventListener('change', event => {
      const file = event.target.files?.[0];
      if (file) handleA1FileUpload(file);
    });
    document.getElementById('btnOnboardingInstallA1')?.addEventListener('click', handleA1Install);

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
      draftLogo = e.target.result;
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
  let a1FileDraft = null;

  function selectA1Option(optId) {
    selectedA1Option = optId;
    ['certOptNow', 'certOptLater', 'certOptNone'].forEach(id => {
      document.getElementById(id)?.classList.toggle('active', id === optId);
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

  function handleA1FileUpload(file) {
    a1FileDraft = file;
    const nameEl = document.getElementById('onboardingA1FileName');
    if (nameEl) {
      nameEl.textContent = file.name;
    }
  }

  function handleA1Install() {
    const pwd = document.getElementById('onboardingA1Password')?.value?.trim();
    const feedback = document.getElementById('onboardingA1Feedback');
    if (!a1FileDraft) {
      if (feedback) {
        feedback.textContent = 'Por favor, selecione o arquivo .pfx ou .p12 do seu certificado.';
        feedback.className = 'onboarding-a1-feedback error';
        feedback.classList.remove('hidden');
      }
      return;
    }
    if (!pwd) {
      if (feedback) {
        feedback.textContent = 'Por favor, digite a senha do certificado.';
        feedback.className = 'onboarding-a1-feedback error';
        feedback.classList.remove('hidden');
      }
      return;
    }

    const settings = getSettings?.();
    if (settings) {
      settings.hasA1Cert = true;
      settings.a1CertName = a1FileDraft.name;
      saveState?.();
    }
    if (feedback) {
      feedback.textContent = '✓ Certificado A1 validado e vinculado ao cofre criptográfico com sucesso!';
      feedback.className = 'onboarding-a1-feedback success';
      feedback.classList.remove('hidden');
    }
    showToast?.('Certificado A1 vinculado ao cofre local com sucesso!', 'success');
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
    if (hasBeenSeen()) return;
    if (tourTimer) window.clearTimeout(tourTimer);
    tourTimer = window.setTimeout(() => open(), 600);
    onTimerChange?.(tourTimer);
  }

  function open(force = false) {
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
      draftLogo = settings.officeLogo;
      const logoImg = document.getElementById('onboardingLogoImg');
      const placeholder = document.getElementById('onboardingLogoPlaceholder');
      const removeBtn = document.getElementById('btnOnboardingRemoveLogo');
      if (logoImg) {
        logoImg.src = draftLogo;
        logoImg.classList.remove('hidden');
      }
      if (placeholder) placeholder.classList.add('hidden');
      if (removeBtn) removeBtn.classList.remove('hidden');
    }

    const currentThemeAttr = document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
    selectedTheme = currentThemeAttr;
    document.getElementById('onboardingThemeCardDark')?.classList.toggle('active', currentThemeAttr === 'dark');
    document.getElementById('onboardingThemeCardLight')?.classList.toggle('active', currentThemeAttr === 'light');

    updateBadgePreview();
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
      if (draftLogo) settings.officeLogo = draftLogo;

      saveState?.();

      // Reflect in sidebar & header immediately
      const nameEl = document.getElementById('sidebarOfficeName');
      const labelEl = document.getElementById('sidebarOfficeLabel');
      if (nameEl && settings.officeName) nameEl.textContent = settings.officeName;
      if (labelEl && settings.officeSlogan) labelEl.textContent = settings.officeSlogan;

      const avatarEl = document.querySelector('.sidebar-office .office-avatar-icon');
      if (avatarEl && settings.officeLogo) {
        avatarEl.innerHTML = `<img src="${settings.officeLogo}" class="office-custom-logo" alt="Logo">`;
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
    if (nextButton) nextButton.textContent = index === total - 1 ? 'Começar a usar o Atrium' : 'Próximo →';
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
