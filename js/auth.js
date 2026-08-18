(() => {
  'use strict';

  const state = { authenticated: false, configured: false, csrfToken: null, setupToken: null, pendingUser: null };
  const byId = id => document.getElementById(id);

  const Auth = {
    get authenticated() { return state.authenticated; },
    get csrfToken() { return state.csrfToken; },
    get trustedDevice() { return Boolean(state.trustedDevice); },
    async init() {
      this.bind();
      try {
        const status = await request('/api/auth/status');
        state.configured = status.configured;
        if (status.authenticated) {
          state.csrfToken = status.csrfToken; state.trustedDevice = Boolean(status.trustedDevice);
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
      byId('copyRecoveryCodes').addEventListener('click', async () => {
        try { await navigator.clipboard.writeText(byId('authRecoveryCodes').textContent); this.feedback('Códigos copiados. Guarde-os fora deste computador.', 'success'); }
        catch { this.feedback('Não foi possível copiar automaticamente. Selecione e copie os códigos.', 'error'); }
      });
      byId('finishRecovery').addEventListener('click', () => this.enter(state.pendingUser));
      byId('logoutButton').addEventListener('click', () => this.logout());
    },
    show(id) {
      document.querySelectorAll('.auth-step').forEach(element => element.classList.toggle('active', element.id === id));
      byId('authGate').classList.remove('hidden'); byId('appShell').classList.add('hidden');
      state.authenticated = false;
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
        const result = await request('/api/auth/setup/verify', { method: 'POST', body: { setupToken: state.setupToken, code: form.get('code') } });
        state.authenticated = true; state.csrfToken = result.csrfToken; state.pendingUser = result.user;
        byId('authManualSecret').textContent = ''; byId('authQrCode').removeAttribute('src');
        byId('authRecoveryCodes').textContent = result.recoveryCodes.join('\n'); this.show('authRecoveryStep');
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
      state.authenticated = true; state.pendingUser = null;
      byId('authGate').classList.add('hidden'); byId('appShell').classList.remove('hidden'); this.feedback('');
      if (user?.displayName) document.querySelector('.profile-copy strong').textContent = user.displayName;
      window.dispatchEvent(new CustomEvent('keller:authenticated', { detail: user }));
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
