(() => {
  'use strict';

  const state = { authenticated: false, configured: false, csrfToken: null, setupToken: null, registrationSetupToken: null, pendingUser: null, user: null, profileAvatarDraft: '', profileSnapshot: '' };
  const byId = id => document.getElementById(id);

  const Auth = {
    get authenticated() { return state.authenticated; },
    get csrfToken() { return state.csrfToken; },
    get currentUser() { return state.user || state.pendingUser; },
    get trustedDevice() { return Boolean(state.trustedDevice); },
    async init() {
      this.bind();
      try {
        const status = await request('/api/auth/status');
        state.configured = status.configured;
        if (status.authenticated) {
          state.csrfToken = status.csrfToken; state.trustedDevice = Boolean(status.trustedDevice); state.user = status.user;
          this.enter(status.user);
        } else {
          this.show(status.configured ? 'authLoginForm' : 'authSetupForm');
        }
      } catch (error) {
        this.show('authLoading'); this.feedback(error.message || 'Não foi possível validar a proteção.', 'error');
      }
    },
    bind() {
      byId('authSetupForm').addEventListener('submit', event => this.setup(event));
      byId('authTotpSetupForm').addEventListener('submit', event => this.verifySetup(event));
      byId('authLoginForm').addEventListener('submit', event => this.login(event));
      byId('authRegisterForm')?.addEventListener('submit', event => this.register(event));
      byId('authTabLogin')?.addEventListener('click', () => {
        byId('authTabLogin')?.classList.add('active');
        byId('authTabRegister')?.classList.remove('active');
        byId('authTabLogin')?.setAttribute('aria-selected', 'true');
        byId('authTabRegister')?.setAttribute('aria-selected', 'false');
        this.show('authLoginForm');
      });
      byId('authTabRegister')?.addEventListener('click', () => {
        byId('authTabRegister')?.classList.add('active');
        byId('authTabLogin')?.classList.remove('active');
        byId('authTabRegister')?.setAttribute('aria-selected', 'true');
        byId('authTabLogin')?.setAttribute('aria-selected', 'false');
        this.show('authRegisterForm');
      });
      byId('skipMfaButton')?.addEventListener('click', async () => {
        this.feedback('');
        try {
          if (state.registrationSetupToken) {
            const result = await request('/api/auth/register/verify', { method: 'POST', body: { setupToken: state.registrationSetupToken, skipMfa: true } });
            state.registrationSetupToken = null;
            byId('authManualSecret').textContent = ''; byId('authQrCode').removeAttribute('src');
            byId('authTabLogin')?.classList.add('active'); byId('authTabRegister')?.classList.remove('active');
            byId('authTabLogin')?.setAttribute('aria-selected', 'true'); byId('authTabRegister')?.setAttribute('aria-selected', 'false');
            this.show('authLoginForm'); this.feedback(result.message, 'success');
            return;
          }
          if (state.setupToken) {
            const result = await request('/api/auth/setup/verify', { method: 'POST', body: { setupToken: state.setupToken, skipMfa: true } });
            state.authenticated = true; state.csrfToken = result.csrfToken; state.user = result.user;
            byId('authManualSecret').textContent = ''; byId('authQrCode').removeAttribute('src');
            this.enter(result.user);
          }
        } catch (error) { this.feedback(error.message, 'error'); }
      });
      byId('copyRecoveryCodes').addEventListener('click', async () => {
        try { await navigator.clipboard.writeText(byId('authRecoveryCodes').textContent); this.feedback('Códigos copiados. Guarde-os fora deste computador.', 'success'); }
        catch { this.feedback('Não foi possível copiar automaticamente. Selecione e copie os códigos.', 'error'); }
      });
      byId('finishRecovery').addEventListener('click', () => this.enter(state.pendingUser));
      byId('logoutButton').addEventListener('click', () => this.logout());
      byId('profileButton')?.addEventListener('click', () => this.openProfile());
      byId('profileSettingsClose')?.addEventListener('click', () => this.closeProfile());
      byId('profileSettingsCancel')?.addEventListener('click', () => this.closeProfile());
      byId('profileSettingsBackdrop')?.addEventListener('click', event => {
        if (event.target === byId('profileSettingsBackdrop')) this.closeProfile();
      });
      byId('profileSettingsForm')?.addEventListener('submit', event => this.saveProfile(event));
      byId('profilePhotoInput')?.addEventListener('change', event => this.readProfilePhoto(event));
      byId('profilePhotoRemove')?.addEventListener('click', () => {
        state.profileAvatarDraft = '';
        this.renderProfileAvatar('', byId('profileSettingsPreviewImage'), byId('profileSettingsPreviewInitials'));
      });
    },
    show(id) {
      document.querySelectorAll('.auth-step').forEach(element => element.classList.toggle('active', element.id === id));
      const tabs = byId('authTabs');
      if (tabs) {
        tabs.classList.toggle('hidden', id === 'authLoading' || id === 'authSetupForm' || id === 'authTotpSetupForm' || id === 'authRecoveryStep');
      }
      byId('authGate').classList.remove('hidden'); byId('appShell').classList.add('hidden');
      state.authenticated = false;
    },
    async register(event) {
      event.preventDefault(); this.feedback('');
      const formElement = event.currentTarget;
      const form = new FormData(formElement);
      if (form.get('password') !== form.get('confirmPassword')) {
        return this.feedback('As senhas não coincidem.', 'error');
      }
      this.busy(formElement, true);
      try {
        const result = await request('/api/auth/register', {
          method: 'POST',
          body: {
            displayName: form.get('displayName'),
            email: form.get('email'),
            username: form.get('username'),
            oab: form.get('oab'),
            password: form.get('password')
          }
        });
        state.registrationSetupToken = result.setupToken;
        byId('authQrCode').src = result.qrCode;
        byId('authManualSecret').textContent = result.manualSecret;
        formElement.reset();
        this.show('authTotpSetupForm');
        this.feedback('Vincule o autenticador ou clique em "Configurar mais tarde" para prosseguir.', 'success');
        byId('authTotpSetupForm').elements.code.focus();
      } catch (error) {
        this.feedback(error.message, 'error');
      } finally {
        this.busy(formElement, false);
      }
    },
    async setup(event) {
      event.preventDefault(); this.feedback('');
      const formElement = event.currentTarget;
      const form = new FormData(formElement);
      if (form.get('password') !== form.get('confirmPassword')) return this.feedback('As senhas não coincidem.', 'error');
      this.busy(formElement, true);
      try {
        const result = await request('/api/auth/setup', { method: 'POST', body: { username: form.get('username'), displayName: form.get('displayName'), password: form.get('password') } });
        state.setupToken = result.setupToken; byId('authQrCode').src = result.qrCode; byId('authManualSecret').textContent = result.manualSecret;
        formElement.reset(); this.show('authTotpSetupForm'); byId('authTotpSetupForm').elements.code.focus();
      } catch (error) { this.feedback(error.message, 'error'); }
      finally { this.busy(formElement, false); }
    },
    async verifySetup(event) {
      event.preventDefault(); this.feedback(''); const formElement = event.currentTarget; const form = new FormData(formElement); this.busy(formElement, true);
      try {
        if (state.registrationSetupToken) {
          const result = await request('/api/auth/register/verify', { method: 'POST', body: { setupToken: state.registrationSetupToken, code: form.get('code') } });
          state.registrationSetupToken = null;
          byId('authManualSecret').textContent = ''; byId('authQrCode').removeAttribute('src'); formElement.reset();
          byId('authTabLogin')?.classList.add('active'); byId('authTabRegister')?.classList.remove('active');
          byId('authTabLogin')?.setAttribute('aria-selected', 'true'); byId('authTabRegister')?.setAttribute('aria-selected', 'false');
          this.show('authLoginForm'); this.feedback(result.message, 'success');
          return;
        }
        const result = await request('/api/auth/setup/verify', { method: 'POST', body: { setupToken: state.setupToken, code: form.get('code') } });
        state.authenticated = true; state.csrfToken = result.csrfToken; state.pendingUser = result.user;
        byId('authManualSecret').textContent = ''; byId('authQrCode').removeAttribute('src');
        if (result.recoveryCodes && result.recoveryCodes.length > 0) {
          byId('authRecoveryCodes').textContent = result.recoveryCodes.join('\n');
          this.show('authRecoveryStep');
        } else {
          this.enter(result.user);
        }
      } catch (error) { this.feedback(error.message, 'error'); }
      finally { this.busy(formElement, false); }
    },
    async login(event) {
      event.preventDefault(); this.feedback(''); const formElement = event.currentTarget; const form = new FormData(formElement); this.busy(formElement, true);
      try {
        const result = await request('/api/auth/login', { method: 'POST', body: Object.fromEntries(form.entries()) });
        state.csrfToken = result.csrfToken; state.trustedDevice = Boolean(result.trustedDevice); formElement.reset(); this.enter(result.user);
      } catch (error) { this.feedback(error.message, 'error'); }
      finally { this.busy(formElement, false); }
    },
    enter(user) {
      state.authenticated = true; state.pendingUser = null; state.user = user;
      byId('authGate').classList.add('hidden'); byId('appShell').classList.remove('hidden'); this.feedback('');
      this.applyProfile(user);
      window.dispatchEvent(new CustomEvent('keller:authenticated', { detail: user }));
    },
    applyProfile(user) {
      if (!user) return;
      state.user = { ...(state.user || {}), ...user };
      const strong = document.querySelector('.profile-copy strong');
      if (strong) strong.textContent = user.displayName || user.username || 'Usuário';
      const small = document.querySelector('.profile-copy small');
      if (small) small.textContent = ({ master_admin: 'Advogado(a) Titular', admin: 'Administrador(a)', collaborator: 'Colaborador(a)' })[user.role] || 'Usuário(a)';
      this.renderProfileAvatar(user.avatar || '', byId('profileAvatarImage'), document.querySelector('.profile-initials'));
    },
    initials(name = state.user?.displayName || state.user?.username || 'AT') {
      return String(name).trim().split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase() || 'AT';
    },
    renderProfileAvatar(source, image, initialsElement) {
      const hasPhoto = /^data:image\/(?:png|jpeg|webp);base64,/i.test(String(source || ''));
      if (image) {
        image.hidden = !hasPhoto;
        if (hasPhoto) image.src = source;
        else image.removeAttribute('src');
      }
      if (initialsElement) {
        initialsElement.hidden = hasPhoto;
        initialsElement.textContent = this.initials();
      }
    },
    openProfile() {
      const user = state.user || {};
      byId('profileDisplayName').value = user.displayName || '';
      byId('profileEmail').value = user.email || '';
      byId('profilePhone').value = user.phone || '';
      state.profileAvatarDraft = user.avatar || '';
      this.renderProfileAvatar(state.profileAvatarDraft, byId('profileSettingsPreviewImage'), byId('profileSettingsPreviewInitials'));
      state.profileSnapshot = this.profileFormSnapshot();
      byId('profileSettingsFeedback')?.classList.add('hidden');
      byId('profileSettingsBackdrop')?.classList.remove('hidden');
      document.body.classList.add('profile-settings-open');
      queueMicrotask(() => byId('profileDisplayName')?.focus());
    },
    profileFormSnapshot() {
      return JSON.stringify({
        displayName: byId('profileDisplayName')?.value || '',
        email: byId('profileEmail')?.value || '',
        phone: byId('profilePhone')?.value || '',
        avatar: state.profileAvatarDraft || ''
      });
    },
    closeProfile({ force = false } = {}) {
      const backdrop = byId('profileSettingsBackdrop');
      if (!backdrop || backdrop.classList.contains('hidden')) return true;
      if (!force && state.profileSnapshot && this.profileFormSnapshot() !== state.profileSnapshot
        && !window.confirm('Há alterações não salvas no perfil. Deseja realmente fechar?')) return false;
      backdrop.classList.add('hidden');
      document.body.classList.remove('profile-settings-open');
      byId('profileButton')?.focus();
      return true;
    },
    async readProfilePhoto(event) {
      const file = event.target.files?.[0];
      event.target.value = '';
      if (!file) return;
      if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 512 * 1024) {
        return this.profileFeedback('Use uma imagem PNG, JPEG ou WebP de até 512 KB.', 'error');
      }
      const source = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('Não foi possível ler a imagem.'));
        reader.readAsDataURL(file);
      }).catch(error => { this.profileFeedback(error.message, 'error'); return ''; });
      if (!source) return;
      state.profileAvatarDraft = source;
      this.renderProfileAvatar(source, byId('profileSettingsPreviewImage'), byId('profileSettingsPreviewInitials'));
      this.profileFeedback('Foto pronta para ser salva.', 'success');
    },
    async saveProfile(event) {
      event.preventDefault();
      const form = event.currentTarget;
      this.busy(form, true);
      this.profileFeedback('Salvando…');
      try {
        const response = await this.secureFetch('/api/auth/profile', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({
            displayName: byId('profileDisplayName').value,
            email: byId('profileEmail').value,
            phone: byId('profilePhone').value,
            avatar: state.profileAvatarDraft
          })
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.message || 'Não foi possível salvar o perfil.');
        this.applyProfile(payload.user);
        state.profileSnapshot = this.profileFormSnapshot();
        this.profileFeedback('Perfil atualizado com sucesso.', 'success');
        window.dispatchEvent(new CustomEvent('keller:profile-updated', { detail: payload.user }));
        window.setTimeout(() => this.closeProfile({ force: true }), 450);
      } catch (error) {
        this.profileFeedback(error.message, 'error');
      } finally {
        this.busy(form, false);
      }
    },
    profileFeedback(message, type = '') {
      const element = byId('profileSettingsFeedback');
      if (!element) return;
      element.textContent = message || '';
      element.className = `profile-settings-feedback ${message ? '' : 'hidden'} ${type}`.trim();
    },
    async logout() {
      if (window.KellerCentral?.Store?.flush) await window.KellerCentral.Store.flush();
      try { await this.secureFetch('/api/auth/logout', { method: 'POST' }); } catch { /* a sessão será encerrada localmente mesmo assim */ }
      state.authenticated = false; state.csrfToken = null; state.trustedDevice = false; sessionStorage.clear(); this.show('authLoginForm');
      this.feedback('Sessão encerrada com segurança.', 'success');
    },
    async secureFetch(url, options = {}) {
      const method = String(options.method || 'GET').toUpperCase();
      const headers = new Headers(options.headers || {});
      if (!['GET', 'HEAD', 'OPTIONS'].includes(method) && state.csrfToken) headers.set('X-CSRF-Token', state.csrfToken);
      const response = await fetch(url, { ...options, headers, credentials: 'same-origin' });
      if (response.status === 401) { state.authenticated = false; state.csrfToken = null; this.show('authLoginForm'); }
      return response;
    },
    busy(form, active) {
      form.querySelectorAll('input, button').forEach(element => { element.disabled = active; });
    },
    feedback(message, type = '') {
      const element = byId('authFeedback'); element.textContent = message || ''; element.className = `auth-feedback ${message ? '' : 'hidden'} ${type}`.trim();
    }
  };

  async function request(url, { method = 'GET', body } = {}) {
    const response = await fetch(url, { method, credentials: 'same-origin', headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.message || 'Operação não concluída.');
    return payload;
  }

  window.KellerAuth = Auth;
  function installPasswordToggles(root = document) {
    root.querySelectorAll('input[type="password"]:not([data-password-toggle-ready])').forEach(input => {
      input.dataset.passwordToggleReady = 'true';
      const wrapper = document.createElement('span'); wrapper.className = 'password-input-wrap';
      input.parentNode.insertBefore(wrapper, input); wrapper.appendChild(input);
      const button = document.createElement('button'); button.type = 'button'; button.className = 'password-toggle'; button.setAttribute('aria-label', 'Mostrar conteúdo'); button.setAttribute('aria-pressed', 'false'); button.textContent = '◉';
      button.addEventListener('click', () => {
        const visible = input.type === 'text'; input.type = visible ? 'password' : 'text';
        button.setAttribute('aria-label', visible ? 'Mostrar conteúdo' : 'Ocultar conteúdo'); button.setAttribute('aria-pressed', String(!visible)); button.classList.toggle('visible', !visible);
      });
      wrapper.appendChild(button);
    });
  }
  document.addEventListener('DOMContentLoaded', () => {
    installPasswordToggles();
    new MutationObserver(mutations => mutations.forEach(mutation => mutation.addedNodes.forEach(node => { if (node.nodeType === 1) installPasswordToggles(node); }))).observe(document.body, { childList: true, subtree: true });
    Auth.init();
  });
})();
