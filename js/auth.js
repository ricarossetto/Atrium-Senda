(() => {
  'use strict';

  const state = { authenticated: false, configured: false, csrfToken: null, setupToken: null, workspaceSetupToken: null, invitationSetupToken: null, invitationToken: null, invitationCompleted: false, resetToken: null, pendingUser: null, user: null, workspace: null, workspaceRegistrationEnabled: true, bootstrapRequired: false, setupMfaRequired: false, profileAvatarDraft: '', profileSnapshot: '' };
  let pendingSetupSession = null;
  let runtimeSessionKey = null;
  let registrationStep = 0;
  let registrationInFlight = false;
  let registrationLocks = [];
  const byId = id => document.getElementById(id);
  const resolveApiUrl = value => {
    const url = String(value || '');
    if (!url.startsWith('/api/')) return url;
    const base = String(globalThis.ATRIUM_CONFIG?.apiBaseUrl || '').trim().replace(/\/$/, '');
    return base ? `${base}${url}` : url;
  };

  const Auth = {
    get authenticated() { return state.authenticated; },
    get csrfToken() { return state.csrfToken; },
    get currentUser() { return state.user || state.pendingUser; },
    get currentWorkspace() { return state.workspace ? Object.freeze({ ...state.workspace }) : null; },
    get trustedDevice() { return Boolean(state.trustedDevice); },
    async init() {
      this.bind();
      try {
        const status = await request('/api/auth/status');
        state.configured = status.configured;
        state.workspaceRegistrationEnabled = status.workspaceRegistrationEnabled !== false;
        state.bootstrapRequired = Boolean(status.bootstrapRequired);
        state.setupMfaRequired = Boolean(status.setupMfaRequired);
        byId('authTabRegister')?.classList.toggle('hidden', !state.workspaceRegistrationEnabled);
        byId('authBootstrapField')?.toggleAttribute('hidden', !state.bootstrapRequired);
        if (byId('authBootstrapToken')) byId('authBootstrapToken').required = state.bootstrapRequired;
        byId('skipMfaButton')?.classList.toggle('hidden', state.setupMfaRequired);
        const inviteToken = new URLSearchParams(globalThis.location.search).get('invite')
          || new URLSearchParams(globalThis.location.hash.replace(/^#/, '')).get('invite');
        if (inviteToken) {
          try {
            const result = await request(`/api/auth/invitations/accept?token=${encodeURIComponent(inviteToken)}`);
            state.invitationToken = inviteToken;
            state.workspace = result.invitation.workspace;
            byId('authInvitationWorkspace').textContent = result.invitation.workspace.name;
            byId('authInvitationPerson').textContent = `${result.invitation.displayName} · ${result.invitation.email}`;
            if (byId('authInvitationIdentityBox')) byId('authInvitationIdentityBox').style.display = 'grid';
            if (byId('authInviteInputGroup')) byId('authInviteInputGroup').style.display = 'none';
            this.show('authInvitationForm');
            byId('authInvitationForm').elements.username.focus();
          } catch (error) {
            this.show(status.configured ? 'authLoginForm' : 'authSetupForm');
            this.feedback(error.message, 'error');
          }
          return;
        }
        const rawResetToken = new URLSearchParams(globalThis.location.search).get('reset')
          || new URLSearchParams(String(globalThis.location.hash || '').replace(/^#/, '')).get('reset');
        if (rawResetToken) {
          state.resetToken = rawResetToken;
          const cleanResetUrl = new URL(globalThis.location.href);
          cleanResetUrl.searchParams.delete('reset');
          cleanResetUrl.hash = '';
          globalThis.history.replaceState({}, '', cleanResetUrl);
          this.show('authResetForm');
          this.feedback('Informe sua nova senha para concluir a recuperação.', 'info');
          byId('authResetForm').elements.password.focus();
          return;
        }
        if (status.authenticated) {
          try { validateSessionIdentity(status, status.user); }
          catch (error) {
            clearSessionIdentity();
            this.show('authLoginForm'); this.feedback(error.message, 'error');
            return;
          }
          state.csrfToken = status.csrfToken; state.trustedDevice = Boolean(status.trustedDevice); state.user = status.user; state.workspace = status.workspace;
          this.enter(status.user);
        } else {
          state.workspace = null;
          const pathname = String(globalThis.location.pathname || '').toLowerCase();
          const urlParams = new URLSearchParams(globalThis.location.search);
          const hash = String(globalThis.location.hash || '').toLowerCase();
          const isDiscoverRoute = pathname.includes('/discover') || pathname.includes('/landing') || urlParams.has('discover') || hash.includes('discover');
          const landing = byId('landingPage');
          if (isDiscoverRoute && landing && status.configured) {
            landing.classList.remove('hidden');
            byId('authGate')?.classList.add('hidden');
            byId('appShell')?.classList.add('hidden');
            this.prepareSteps(status.configured ? 'authLoginForm' : 'authSetupForm');
          } else {
            if (landing) landing.classList.add('hidden');
            this.show(status.configured ? (urlParams.get('auth') === 'register' || hash.includes('register') ? 'authRegisterForm' : 'authLoginForm') : 'authSetupForm');
          }
        }
      } catch (error) {
        clearSessionIdentity();
        this.show('authLoading'); this.feedback(error.message || 'Não foi possível validar a proteção.', 'error');
      }
    },
    bind() {
      byId('authSetupForm').addEventListener('submit', event => this.setup(event));
      const setupOab = byId('authSetupForm')?.elements?.oab;
      const setupOabUf = byId('authSetupForm')?.elements?.oabUf;
      const setupMonitoringToggle = byId('authSetupForm')?.elements?.enableMonitoring;
      const setupMonitoringContinue = byId('authMonitoringContinue');
      const setupMonitoringDecisionHint = byId('authMonitoringDecisionHint');
      byId('authSetupNext').addEventListener('click', () => {
        const form = byId('authSetupForm');
        if (!form.reportValidity()) return;
        if (form.elements.password.value !== form.elements.confirmPassword.value) return this.feedback('As senhas não coincidem.', 'error');
        this.feedback('');
        byId('authIdentityStep').hidden = true;
        byId('authMonitoringStep').hidden = false;
        setupOab.focus();
      });
      byId('authSetupBack').addEventListener('click', () => {
        byId('authMonitoringStep').hidden = true;
        byId('authIdentityStep').hidden = false;
        byId('authSetupForm').elements.displayName.focus();
      });
      const updateMonitoringChoice = () => {
        const hasOab = Boolean(setupOab.value.trim());
        const hasUf = Boolean(setupOabUf.value);
        const ready = hasOab && hasUf;
        byId('authMonitoringChoice').hidden = !ready;
        if (!ready) setupMonitoringToggle.checked = false;
        const monitoringEnabled = ready && setupMonitoringToggle.checked;
        setupMonitoringContinue.textContent = monitoringEnabled
          ? 'Ativar monitoramento e continuar'
          : 'Continuar sem monitoramento';
        setupMonitoringDecisionHint.textContent = hasOab !== hasUf
          ? 'Complete o número e a UF da OAB ou limpe os campos para continuar sem monitoramento.'
          : monitoringEnabled
            ? 'A primeira busca começa automaticamente depois que você entrar.'
            : ready
              ? 'Sua OAB será salva, mas nenhuma busca automática será iniciada.'
              : 'Você poderá ativar o monitoramento depois em Fontes monitoradas.';
      };
      setupOab.addEventListener('input', updateMonitoringChoice);
      setupOabUf.addEventListener('change', updateMonitoringChoice);
      setupMonitoringToggle.addEventListener('change', updateMonitoringChoice);
      updateMonitoringChoice();
      byId('authTotpSetupForm').addEventListener('submit', event => this.verifySetup(event));
      byId('authLoginForm').addEventListener('submit', event => this.login(event));
      byId('authRegisterForm')?.addEventListener('submit', event => this.register(event));
      byId('authRegisterBack')?.addEventListener('click', () => {
        if (!registrationInFlight) this.showRegistrationStep(Math.max(0, registrationStep - 1));
      });
      byId('authRegisterForm')?.addEventListener('input', () => {
        if (!registrationInFlight) byId('authRegisterForm').elements.confirmPassword.setCustomValidity('');
      });
      byId('authGate')?.addEventListener('click', event => {
        if (!registrationInFlight) return;
        event.preventDefault();
        event.stopImmediatePropagation();
      }, true);
      byId('authGate')?.addEventListener('submit', event => {
        if (!registrationInFlight) return;
        event.preventDefault();
        event.stopImmediatePropagation();
      }, true);
      byId('authInvitationForm')?.addEventListener('submit', event => this.acceptInvitation(event));
      const setTabActive = (activeTabId) => {
        ['authTabLogin', 'authTabRegister', 'authTabInvite'].forEach(tabId => {
          const tab = byId(tabId);
          if (!tab) return;
          const isActive = tabId === activeTabId;
          tab.classList.toggle('active', isActive);
          tab.setAttribute('aria-selected', String(isActive));
        });
      };

      byId('authTabLogin')?.addEventListener('click', () => {
        setTabActive('authTabLogin');
        this.show('authLoginForm');
      });
      byId('authTabRegister')?.addEventListener('click', () => {
        if (!state.workspaceRegistrationEnabled) return;
        setTabActive('authTabRegister');
        this.show('authRegisterForm');
      });
      byId('authTabInvite')?.addEventListener('click', () => {
        setTabActive('authTabInvite');
        this.show('authInvitationForm');
      });
      byId('authBackToLoginLink')?.addEventListener('click', (event) => {
        event.preventDefault();
        byId('authTabLogin')?.click();
      });
      byId('authForgotPassLink')?.addEventListener('click', (event) => {
        event.preventDefault();
        this.feedback('');
        this.show('authForgotForm');
        byId('authForgotForm').elements.identifier.focus();
      });
      byId('authForgotForm')?.addEventListener('submit', event => this.requestPasswordReset(event));
      byId('authResetForm')?.addEventListener('submit', event => this.completePasswordReset(event));
      byId('authForgotBackBtn')?.addEventListener('click', () => {
        this.feedback('');
        this.show('authLoginForm');
        byId('authLoginForm').elements.username.focus();
      });
      byId('authResetBackBtn')?.addEventListener('click', () => {
        state.resetToken = null;
        this.feedback('');
        this.show('authForgotForm');
        byId('authForgotForm').elements.identifier.focus();
      });
      byId('authFooterInviteBtn')?.addEventListener('click', (event) => {
        event.preventDefault();
        byId('authTabInvite')?.click();
      });
      byId('authInvitationBackBtn')?.addEventListener('click', (event) => {
        event.preventDefault();
        byId('authTabLogin')?.click();
      });
      byId('authValidateInviteBtn')?.addEventListener('click', async () => {
        const raw = byId('authInviteTokenInput')?.value?.trim();
        if (!raw) return this.feedback('Informe o código ou link de convite.', 'error');
        let token = raw;
        try {
          if (raw.includes('invite=')) {
            const parsed = new URL(raw, globalThis.location.origin);
            token = parsed.searchParams.get('invite') || token;
          }
        } catch {}
        try {
          this.feedback('Validando convite...', 'info');
          const result = await request(`/api/auth/invitations/accept?token=${encodeURIComponent(token)}`);
          state.invitationToken = token;
          state.workspace = result.invitation.workspace;
          byId('authInvitationWorkspace').textContent = result.invitation.workspace.name;
          byId('authInvitationPerson').textContent = `${result.invitation.displayName} · ${result.invitation.email}`;
          if (byId('authInvitationIdentityBox')) byId('authInvitationIdentityBox').style.display = 'grid';
          if (byId('authInviteInputGroup')) byId('authInviteInputGroup').style.display = 'none';
          this.feedback('Convite validado com sucesso. Crie seu usuário e senha.', 'success');
          byId('authInvitationForm').elements.username.focus();
        } catch (err) {
          this.feedback(err.message || 'Convite inválido ou expirado.', 'error');
        }
      });
      // "Novo escritório" leva à aba de cadastro na primeira etapa.
      byId('authTabNewOffice')?.addEventListener('click', () => {
        if (!state.workspaceRegistrationEnabled) {
          this.feedback('O cadastro de novos escritórios não está habilitado nesta instalação.', 'info');
          return;
        }
        setTabActive('authTabRegister');
        this.show('authRegisterForm');
        this.showRegistrationStep(0, false);
      });
      byId('skipMfaButton')?.addEventListener('click', async () => {
        this.feedback('');
        try {
          if (state.workspaceSetupToken) {
            const result = await request('/api/auth/workspaces/register/verify', { method: 'POST', body: { setupToken: state.workspaceSetupToken, skipMfa: true } });
            state.workspaceSetupToken = null;
            sessionStorage.setItem('atrium_pending_product_tour', 'true');
            completeWorkspaceSession(result);
            return;
          }
          if (state.setupToken) {
            const result = await request('/api/auth/setup/verify', { method: 'POST', body: { setupToken: state.setupToken, skipMfa: true } });
            state.setupToken = null;
            await completeSetupSession(result);
            return;
          }
        } catch (error) { clearSessionIdentity(); this.feedback(error.message, 'error'); }
      });
      byId('copyRecoveryCodes').addEventListener('click', async () => {
        try { await navigator.clipboard.writeText(byId('authRecoveryCodes').textContent); this.feedback('Códigos copiados. Guarde-os fora deste computador.', 'success'); }
        catch { this.feedback('Não foi possível copiar automaticamente. Selecione e copie os códigos.', 'error'); }
      });
      byId('finishRecovery').addEventListener('click', async () => {
        if (state.invitationCompleted) {
          state.invitationCompleted = false;
          this.show('authLoginForm');
          this.feedback('Cadastro concluído. Entre com seu usuário, senha e código do autenticador.', 'success');
          byId('authLoginForm').elements.username.focus();
          return;
        }
        const button = byId('finishRecovery');
        if (button.disabled) return;
        button.disabled = true;
        try {
          if (pendingSetupSession) {
            const user = await refreshSessionWorkspace(pendingSetupSession.user);
            state.csrfToken = pendingSetupSession.csrfToken;
            state.pendingUser = user;
            pendingSetupSession = null;
          }
          const user = state.pendingUser;
          byId('authRecoveryCodes').textContent = '';
          this.enter(user);
        } catch (error) {
          pendingSetupSession = null;
          clearSessionIdentity();
          byId('authRecoveryCodes').textContent = '';
          this.show('authLoginForm'); this.feedback(error.message, 'error');
        } finally { button.disabled = false; }
      });
      byId('logoutButton')?.addEventListener('click', () => this.logout());
      byId('v2UtilitiesLogout')?.addEventListener('click', () => {
        byId('v2UtilitiesMenu')?.removeAttribute('open');
        this.logout();
      });
      byId('sidebarLogoutButton')?.addEventListener('click', () => {
        document.querySelector('.sidebar')?.classList.remove('open');
        document.documentElement.removeAttribute('data-v2-nav-open');
        this.logout();
      });
      document.addEventListener('click', event => {
        const target = event.target?.closest?.('[data-action="logout"]');
        if (target) {
          event.preventDefault();
          this.logout();
        }
      });
      byId('profileButton')?.addEventListener('click', () => { this.openProfile(); this.refreshMfaStatus(); });
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
      byId('btnProfileReset')?.addEventListener('click', () => this.resetProfile());
      byId('btnProfilePasswordChange')?.addEventListener('click', () => this.changePassword());
      byId('btnProfileMfaEnable')?.addEventListener('click', () => this.openMfaEnroll());
      byId('btnProfileMfaDisable')?.addEventListener('click', () => this.openMfaDisable());
      byId('mfaEnrollClose')?.addEventListener('click', () => this.closeMfaModal());
      byId('mfaEnrollCancel')?.addEventListener('click', () => this.closeMfaModal());
      byId('mfaEnrollBackdrop')?.addEventListener('click', event => {
        if (event.target === byId('mfaEnrollBackdrop')) this.closeMfaModal();
      });
      byId('mfaEnrollConfirm')?.addEventListener('click', () => this.confirmMfaModal());
      byId('btnProfileDelete')?.addEventListener('click', () => this.deleteProfile());
      byId('btnWorkspaceFactoryReset')?.addEventListener('click', () => this.openWorkspaceFactoryReset());
      byId('workspaceFactoryResetClose')?.addEventListener('click', () => this.closeWorkspaceFactoryReset());
      byId('workspaceFactoryResetCancel')?.addEventListener('click', () => this.closeWorkspaceFactoryReset());
      byId('workspaceFactoryResetBackdrop')?.addEventListener('click', event => {
        if (event.target === byId('workspaceFactoryResetBackdrop')) this.closeWorkspaceFactoryReset();
      });
      byId('workspaceFactoryResetToken')?.addEventListener('input', () => this.updateWorkspaceFactoryResetSubmit());
      byId('workspaceFactoryResetPassword')?.addEventListener('input', () => this.updateWorkspaceFactoryResetSubmit());
      byId('workspaceFactoryResetForm')?.addEventListener('submit', event => this.submitWorkspaceFactoryReset(event));
    },
    show(id) {
      if (registrationInFlight) return;
      document.querySelectorAll('.auth-step').forEach(element => element.classList.toggle('active', element.id === id));
      const standalone = ['authLoading', 'authSetupForm', 'authTotpSetupForm', 'authRecoveryStep', 'authForgotForm', 'authResetForm'].includes(id);
      const tabs = byId('authTabs');
      if (tabs) {
        tabs.classList.toggle('hidden', standalone || Boolean(state.invitationToken));
      }
      const footer = byId('authCardFooter');
      if (footer) {
        footer.classList.toggle('hidden', standalone || Boolean(state.invitationToken));
      }
      byId('authTabLogin')?.classList.toggle('active', id === 'authLoginForm');
      byId('authTabLogin')?.setAttribute('aria-selected', String(id === 'authLoginForm'));
      byId('authTabRegister')?.classList.toggle('active', id === 'authRegisterForm');
      byId('authTabRegister')?.setAttribute('aria-selected', String(id === 'authRegisterForm'));
      byId('authTabInvite')?.classList.toggle('active', id === 'authInvitationForm');
      byId('authTabInvite')?.setAttribute('aria-selected', String(id === 'authInvitationForm'));
      const landing = byId('landingPage');
      if (landing) landing.classList.add('hidden');
      byId('authGate').classList.remove('hidden'); byId('appShell').classList.add('hidden');
      state.authenticated = false;
    },
    prepareSteps(id) {
      if (registrationInFlight) return;
      document.querySelectorAll('.auth-step').forEach(element => element.classList.toggle('active', element.id === id));
      const standalone = ['authLoading', 'authSetupForm', 'authTotpSetupForm', 'authRecoveryStep', 'authForgotForm', 'authResetForm'].includes(id);
      const tabs = byId('authTabs');
      if (tabs) {
        tabs.classList.toggle('hidden', standalone || Boolean(state.invitationToken));
      }
      byId('authTabLogin')?.classList.toggle('active', id === 'authLoginForm');
      byId('authTabLogin')?.setAttribute('aria-selected', String(id === 'authLoginForm'));
      byId('authTabRegister')?.classList.toggle('active', id === 'authRegisterForm');
      byId('authTabRegister')?.setAttribute('aria-selected', String(id === 'authRegisterForm'));
      byId('authTabInvite')?.classList.toggle('active', id === 'authInvitationForm');
      byId('authTabInvite')?.setAttribute('aria-selected', String(id === 'authInvitationForm'));
    },
    showLanding() {
      if (registrationInFlight) return;
      const landing = byId('landingPage');
      if (landing) {
        document.documentElement.dataset.route = 'discover';
        if (globalThis.history?.pushState) {
          globalThis.history.pushState(null, '', '/discover');
        }
        landing.classList.remove('hidden');
        byId('authGate')?.classList.add('hidden');
        byId('appShell')?.classList.add('hidden');
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } else {
        this.show('authLoginForm');
      }
    },
    showLogin() {
      if (registrationInFlight) return;
      document.documentElement.dataset.route = 'app';
      if (globalThis.history?.pushState) {
        globalThis.history.pushState(null, '', '/');
      }
      this.show('authLoginForm');
    },
    showRegister() {
      if (registrationInFlight) return;
      document.documentElement.dataset.route = 'app';
      if (globalThis.history?.pushState) {
        globalThis.history.pushState(null, '', '/?auth=register');
      }
      this.show('authRegisterForm');
    },
    async acceptInvitation(event) {
      event.preventDefault();
      this.feedback('');
      const formElement = event.currentTarget;
      const form = new FormData(formElement);
      if (form.get('password') !== form.get('confirmPassword')) return this.feedback('As senhas não coincidem.', 'error');
      this.busy(formElement, true);
      try {
        const result = await request('/api/auth/invitations/accept', {
          method: 'POST',
          body: {
            inviteToken: state.invitationToken,
            username: form.get('username'),
            password: form.get('password')
          }
        });
        state.invitationToken = null;
        state.invitationSetupToken = result.setupToken;
        byId('authQrCode').src = result.qrCode;
        byId('authManualSecret').textContent = result.manualSecret;
        formElement.reset();
        const cleanUrl = new URL(globalThis.location.href);
        cleanUrl.searchParams.delete('invite');
        cleanUrl.hash = '';
        globalThis.history.replaceState({}, '', cleanUrl);
        this.show('authTotpSetupForm');
        byId('skipMfaButton').hidden = true;
        this.feedback('Convite aceito. Vincule o autenticador para concluir o cadastro.', 'success');
        byId('authTotpSetupForm').elements.code.focus();
      } catch (error) {
        this.feedback(error.message, 'error');
      } finally {
        this.busy(formElement, false);
      }
    },
    async requestPasswordReset(event) {
      event.preventDefault();
      this.feedback('');
      const formElement = event.currentTarget;
      const form = new FormData(formElement);
      this.busy(formElement, true);
      this.feedback('Solicitando link seguro…', 'info');
      try {
        const result = await request('/api/auth/password/forgot', { method: 'POST', body: { identifier: form.get('identifier') } });
        this.feedback(result.message || 'Verifique seu e-mail para continuar a redefinição.', 'success');
      } catch (error) {
        this.feedback(error.message, 'error');
      } finally {
        this.busy(formElement, false);
      }
    },
    async completePasswordReset(event) {
      event.preventDefault();
      const formElement = event.currentTarget;
      const form = new FormData(formElement);
      if (form.get('password') !== form.get('confirmPassword')) return this.feedback('As senhas não coincidem.', 'error');
      if (!state.resetToken) {
        this.show('authForgotForm');
        return this.feedback('Solicite um novo link de redefinição de senha.', 'error');
      }
      this.busy(formElement, true);
      try {
        const result = await request('/api/auth/password/reset', { method: 'POST', body: { token: state.resetToken, password: form.get('password') } });
        state.resetToken = null;
        formElement.reset();
        this.show('authLoginForm');
        this.feedback(result.message || 'Senha redefinida com sucesso. Entre com a nova senha.', 'success');
        byId('authLoginForm').elements.username.focus();
      } catch (error) {
        this.feedback(error.message, 'error');
      } finally {
        this.busy(formElement, false);
      }
    },
    async changePassword() {
      const currentPassword = byId('profileCurrentPassword')?.value || '';
      const newPassword = byId('profileNewPassword')?.value || '';
      const confirmation = byId('profileNewPasswordConfirm')?.value || '';
      const code = byId('profilePasswordCode')?.value || '';
      if (!currentPassword) return this.profilePasswordFeedback('Informe sua senha atual para confirmar a alteração.', 'error');
      if (newPassword.length < 10 || newPassword.length > 128) return this.profilePasswordFeedback('A nova senha deve ter entre 10 e 128 caracteres.', 'error');
      if (newPassword !== confirmation) return this.profilePasswordFeedback('A confirmação da nova senha não confere.', 'error');
      if (newPassword === currentPassword) return this.profilePasswordFeedback('A nova senha deve ser diferente da senha atual.', 'error');
      const button = byId('btnProfilePasswordChange');
      if (button) button.disabled = true;
      this.profilePasswordFeedback('Atualizando senha…');
      try {
        const response = await this.secureFetch('/api/auth/password/change', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ currentPassword, newPassword, code })
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.message || 'Não foi possível alterar a senha.');
        if (payload.csrfToken) state.csrfToken = payload.csrfToken;
        state.trustedDevice = false;
        if (payload.user) this.applyProfile(payload.user);
        ['profileCurrentPassword', 'profileNewPassword', 'profileNewPasswordConfirm', 'profilePasswordCode'].forEach(id => {
          const input = byId(id);
          if (input) input.value = '';
        });
        this.profilePasswordFeedback('Senha alterada. As demais sessões e navegadores confiáveis foram desconectados.', 'success');
      } catch (error) {
        this.profilePasswordFeedback(error.message, 'error');
      } finally {
        if (button) button.disabled = false;
      }
    },
    profilePasswordFeedback(message, type = '') {
      const element = byId('profilePasswordFeedback');
      if (!element) return;
      element.textContent = message || '';
      element.className = `profile-settings-feedback ${message ? '' : 'hidden'} ${type}`.trim();
    },
    async refreshMfaStatus() {
      const status = byId('profileMfaStatus');
      if (!status) return;
      try {
        const response = await this.secureFetch('/api/auth/mfa/status', { headers: { Accept: 'application/json' } });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.message || 'Não foi possível verificar o 2FA.');
        const enabled = payload.mfaEnabled === true;
        status.textContent = enabled ? 'Ativa nesta conta.' : 'Inativa. Ative para exigir o código do autenticador no login.';
        byId('btnProfileMfaEnable')?.classList.toggle('hidden', enabled);
        byId('btnProfileMfaDisable')?.classList.toggle('hidden', !enabled);
      } catch {
        status.textContent = 'Não foi possível verificar o 2FA agora.';
      }
    },
    mfaFeedback(message, type = '') {
      const element = byId('mfaEnrollFeedback');
      if (!element) return;
      element.textContent = message || '';
      element.className = `profile-settings-feedback ${message ? '' : 'hidden'} ${type}`.trim();
    },
    async openMfaEnroll() {
      this.mfaMode = 'enable';
      this.mfaFeedback('');
      byId('mfaRecoveryBox')?.classList.add('hidden');
      byId('mfaEnrollQr')?.removeAttribute('src');
      const secret = byId('mfaEnrollSecret');
      if (secret) secret.textContent = '';
      const confirm = byId('mfaEnrollConfirm');
      if (confirm) confirm.textContent = 'Confirmar e ativar';
      try {
        const response = await this.secureFetch('/api/auth/mfa/enroll', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: '{}'
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.message || 'Não foi possível iniciar a ativação do 2FA.');
        const qr = byId('mfaEnrollQr');
        if (qr && payload.qrCode) qr.src = payload.qrCode;
        if (secret) secret.textContent = payload.manualSecret || '';
        byId('mfaEnrollBackdrop')?.classList.remove('hidden');
        byId('mfaEnrollPassword')?.focus();
      } catch (error) {
        this.mfaFeedback(error.message, 'error');
      }
    },
    openMfaDisable() {
      this.mfaMode = 'disable';
      this.mfaFeedback('');
      byId('mfaRecoveryBox')?.classList.add('hidden');
      byId('mfaEnrollQr')?.removeAttribute('src');
      const secret = byId('mfaEnrollSecret');
      if (secret) secret.textContent = '';
      const confirm = byId('mfaEnrollConfirm');
      if (confirm) confirm.textContent = 'Confirmar e desativar';
      byId('mfaEnrollBackdrop')?.classList.remove('hidden');
      byId('mfaEnrollPassword')?.focus();
    },
    closeMfaModal() {
      byId('mfaEnrollBackdrop')?.classList.add('hidden');
      ['mfaEnrollPassword', 'mfaEnrollCode'].forEach(id => {
        const input = byId(id);
        if (input) input.value = '';
      });
    },
    async confirmMfaModal() {
      if (this.mfaMode === 'done') {
        this.closeMfaModal();
        this.mfaMode = 'enable';
        return;
      }
      const password = byId('mfaEnrollPassword')?.value || '';
      const code = byId('mfaEnrollCode')?.value || '';
      if (!password) return this.mfaFeedback('Informe sua senha para confirmar.', 'error');
      const button = byId('mfaEnrollConfirm');
      if (button) button.disabled = true;
      this.mfaFeedback('Confirmando…');
      try {
        const enabling = this.mfaMode !== 'disable';
        const response = await this.secureFetch(enabling ? '/api/auth/mfa/enable' : '/api/auth/mfa/disable', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ password, code })
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.message || 'Não foi possível concluir agora.');
        if (enabling && Array.isArray(payload.recoveryCodes)) {
          const list = byId('mfaRecoveryList');
          if (list) {
            list.innerHTML = payload.recoveryCodes
              .map(value => `<code>${String(value).replace(/[&<>"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[character]))}</code>`)
              .join('');
          }
          byId('mfaRecoveryBox')?.classList.remove('hidden');
          this.mfaFeedback('Proteção ativada. Guarde os códigos de recuperação.', 'success');
          if (button) button.textContent = 'Concluir';
          this.mfaMode = 'done';
          this.refreshMfaStatus();
          return;
        }
        this.mfaFeedback(enabling ? 'Proteção ativada.' : 'Proteção desativada.', 'success');
        this.closeMfaModal();
        this.refreshMfaStatus();
      } catch (error) {
        this.mfaFeedback(error.message, 'error');
      } finally {
        if (button) button.disabled = false;
      }
    },
    showRegistrationStep(step, focus = true) {
      if (registrationInFlight) return;
      registrationStep = step;
      const form = byId('authRegisterForm');
      form.querySelectorAll('[data-register-step]').forEach(element => {
        element.hidden = Number(element.dataset.registerStep) !== step;
      });
      form.querySelectorAll('.auth-register-progress li').forEach((element, index) => {
        if (index === Math.min(step, 1)) element.setAttribute('aria-current', 'step');
        else element.removeAttribute('aria-current');
      });
      byId('authRegisterBack').hidden = step === 0;
      byId('authRegisterNext').textContent = step >= 1 ? 'Cadastrar escritório' : 'Continuar';
      if (focus) {
        const panel = form.querySelector(`[data-register-step="${step}"]`);
        (panel.querySelector('[aria-checked="true"]') || panel.querySelector('input, select, button'))?.focus();
      }
    },
    validateRegistration(allSteps = false) {
      const form = byId('authRegisterForm');
      const confirmation = form.elements.confirmPassword;
      confirmation.setCustomValidity(form.elements.password.value !== confirmation.value ? 'As senhas não coincidem.' : '');
      const fields = allSteps ? [...form.elements] : [...form.querySelector(`[data-register-step="${registrationStep}"]`).querySelectorAll('input, select')];
      const invalid = fields.find(element => element.willValidate && !element.validity.valid);
      if (!invalid) return true;
      this.showRegistrationStep(Number(invalid.closest('[data-register-step]').dataset.registerStep), false);
      this.feedback(invalid.validationMessage, 'error');
      invalid.focus();
      invalid.reportValidity();
      return false;
    },
    registrationBusy(active) {
      registrationInFlight = active;
      byId('authRegisterForm').setAttribute('aria-busy', String(active));
      if (active) {
        registrationLocks = [...byId('authGate').querySelectorAll('input, select, button')].map(element => [element, element.disabled]);
        registrationLocks.forEach(([element]) => { element.disabled = true; });
        byId('authGate').querySelectorAll('a').forEach(element => element.setAttribute('aria-disabled', 'true'));
      } else {
        registrationLocks.forEach(([element, disabled]) => { element.disabled = disabled; });
        registrationLocks = [];
        byId('authGate').querySelectorAll('a').forEach(element => element.removeAttribute('aria-disabled'));
      }
    },
    async register(event) {
      event.preventDefault();
      if (registrationInFlight) return;
      const formElement = byId('authRegisterForm');
      if (!formElement.classList.contains('active')) return;
      this.feedback('');
      if (!this.validateRegistration(registrationStep >= 1)) return;
      if (registrationStep < 1) {
        this.showRegistrationStep(registrationStep + 1);
        return;
      }
      const form = new FormData(formElement);
      const focusTarget = document.activeElement;
      const submittedStep = registrationStep;
      let failed = false;
      this.registrationBusy(true);
      try {
        const result = await request('/api/auth/workspaces/register', {
          method: 'POST',
          body: {
            workspaceName: form.get('workspaceName'),
            displayName: form.get('displayName'),
            email: form.get('email'),
            username: form.get('username'),
            password: form.get('password'),
            oab: form.get('oab') || '',
            oabUf: form.get('oabUf') || '',
            enableMonitoring: form.get('enableMonitoring') === 'on' || form.get('enableMonitoring') === 'true'
          }
        });
        state.workspaceSetupToken = result.setupToken;
        byId('authQrCode').src = result.qrCode;
        byId('authManualSecret').textContent = result.manualSecret;
        formElement.reset();
        formElement.elements.confirmPassword.setCustomValidity('');
        this.registrationBusy(false);
        this.showRegistrationStep(0, false);
        this.show('authTotpSetupForm');
        if (byId('skipMfaButton')) byId('skipMfaButton').hidden = false;
        this.feedback('Vincule o autenticador ou entre sem 2FA para prosseguir.', 'success');
        byId('authTotpSetupForm').elements.code.focus();
      } catch (error) {
        failed = true;
        this.feedback(error.message, 'error');
      } finally {
        if (registrationInFlight) this.registrationBusy(false);
        if (failed && byId('authRegisterForm') === formElement && formElement.classList.contains('active') && registrationStep === submittedStep && formElement.querySelector(`[data-register-step="${submittedStep}"]`)?.getClientRects().length && formElement.contains(focusTarget) && !focusTarget.disabled && focusTarget.getClientRects().length) {
          focusTarget.focus();
        }
      }
    },
    async setup(event) {
      event.preventDefault(); this.feedback('');
      const formElement = event.currentTarget;
      const form = new FormData(formElement);
      if (form.get('password') !== form.get('confirmPassword')) return this.feedback('As senhas não coincidem.', 'error');
      if (!byId('authIdentityStep').hidden) { byId('authSetupNext').click(); return; }
      const hasOab = Boolean(String(form.get('oab') || '').trim());
      const hasOabUf = Boolean(form.get('oabUf'));
      if (hasOab !== hasOabUf) return this.feedback('Complete o número e a UF da OAB ou limpe os dois campos para continuar sem monitoramento.', 'error');
      const monitor = form.get('enableMonitoring') === 'on';
      if (monitor && (!String(form.get('oab') || '').trim() || !form.get('oabUf'))) return this.feedback('Informe a OAB e a UF para ativar o monitoramento.', 'error');
      this.busy(formElement, true);
      try {
        const result = await request('/api/auth/setup', { method: 'POST', body: {
          username: form.get('username'),
          workspaceName: form.get('workspaceName'),
          displayName: form.get('displayName'),
          email: form.get('email'),
          oab: form.get('oab'),
          oabUf: form.get('oabUf'),
          enableMonitoring: monitor,
          password: form.get('password'),
          bootstrapToken: form.get('bootstrapToken')
        } });
        state.setupToken = result.setupToken; byId('authQrCode').src = result.qrCode; byId('authManualSecret').textContent = result.manualSecret;
        formElement.reset(); this.show('authTotpSetupForm'); byId('authTotpSetupForm').elements.code.focus();
      } catch (error) { this.feedback(error.message, 'error'); }
      finally { this.busy(formElement, false); }
    },
    async verifySetup(event) {
      event.preventDefault(); this.feedback(''); const formElement = event.currentTarget; const form = new FormData(formElement); this.busy(formElement, true);
      try {
        if (state.invitationSetupToken) {
          const result = await request('/api/auth/register/verify', { method: 'POST', body: { setupToken: state.invitationSetupToken, code: form.get('code') } });
          state.invitationSetupToken = null;
          state.invitationCompleted = true;
          byId('authManualSecret').textContent = '';
          byId('authQrCode').removeAttribute('src');
          formElement.reset();
          byId('authRecoveryCodes').textContent = (result.recoveryCodes || []).join('\n');
          this.show('authRecoveryStep');
          this.feedback('Proteção em duas etapas ativada. Guarde os códigos de recuperação.', 'success');
          return;
        }
        if (state.workspaceSetupToken) {
          const result = await request('/api/auth/workspaces/register/verify', { method: 'POST', body: { setupToken: state.workspaceSetupToken, code: form.get('code') } });
          state.workspaceSetupToken = null;
          sessionStorage.setItem('atrium_initial_sync_pending', 'true');
          localStorage.setItem('atrium_tour_seen', 'true');
          if (!result.recoveryCodes?.length) sessionStorage.setItem('atrium_pending_a1_onboarding', 'true');
          completeWorkspaceSession(result);
          return;
        }
        const result = await request('/api/auth/setup/verify', { method: 'POST', body: { setupToken: state.setupToken, code: form.get('code') } });
        state.setupToken = null;
        sessionStorage.setItem('atrium_initial_sync_pending', 'true');
        sessionStorage.setItem('atrium_pending_product_tour', 'true');
        await completeSetupSession(result);
      } catch (error) { clearSessionIdentity(); this.feedback(error.message, 'error'); }
      finally { this.busy(formElement, false); }
    },
    async login(event) {
      event.preventDefault(); this.feedback(''); const formElement = event.currentTarget; const form = new FormData(formElement); this.busy(formElement, true);
      try {
        clearSessionIdentity();
        const result = await request('/api/auth/login', { method: 'POST', body: Object.fromEntries(form.entries()) });
        const user = await refreshSessionWorkspace(result.user);
        pendingSetupSession = null;
        state.csrfToken = result.csrfToken; state.trustedDevice = Boolean(result.trustedDevice); formElement.reset(); this.enter(user);
      } catch (error) {
        clearSessionIdentity();
        this.show('authLoginForm'); this.feedback(error.message, 'error');
      }
      finally { this.busy(formElement, false); }
    },
    enter(user) {
      try { validateSessionIdentity({ authenticated: true, user, workspace: state.workspace }, user); }
      catch (error) { clearSessionIdentity(); this.show('authLoginForm'); throw error; }
      const sessionKey = JSON.stringify([user?.workspaceId, user?.id || user?.username, user?.role]);
      if (runtimeSessionKey !== null && runtimeSessionKey !== sessionKey) {
        this.show('authLoading');
        globalThis.location.reload();
        return;
      }
      runtimeSessionKey = sessionKey;
      state.authenticated = true; state.pendingUser = null; state.user = user;
      byId('authGate').classList.add('hidden');
      const landing = byId('landingPage');
      if (landing) landing.classList.add('hidden');
      byId('appShell').classList.remove('hidden');
      this.feedback('');
      this.applyProfile(user);
      window.dispatchEvent(new CustomEvent('keller:authenticated', { detail: user }));
    },
    applyProfile(user) {
      if (!user) return;
      state.user = { ...(state.user || {}), ...user };
      // Chip compacto: primeiro nome + papel curto (nome longo sempre truncava
      // no topbar). Identidade completa no tooltip e no modal de perfil.
      const displayName = user.displayName || user.username || 'Usuário';
      const firstName = String(displayName).trim().split(/\s+/)[0] || 'Usuário';
      const fullRole = ({ master_admin: 'Advogado(a) Titular', admin: 'Administrador(a)', collaborator: 'Colaborador(a)' })[user.role] || 'Usuário(a)';
      const shortRole = ({ master_admin: 'Advogado', admin: 'Administrador', collaborator: 'Colaborador' })[user.role] || 'Usuário';
      const strong = document.querySelector('.profile-copy strong');
      if (strong) strong.textContent = firstName;
      const small = document.querySelector('.profile-copy small');
      if (small) small.textContent = shortRole;
      const profileButton = byId('profileButton');
      if (profileButton) {
        profileButton.title = `${displayName} · ${fullRole}`;
        profileButton.setAttribute('title', `Meu perfil: ${displayName}`);
      }
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
      byId('btnWorkspaceFactoryReset')?.classList.toggle('hidden', user.role !== 'master_admin');

      this.secureFetch('/api/user/notification-preferences')
        .then(res => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.json();
        })
        .then(data => {
          if (data && Array.isArray(data.preferences)) {
            for (const p of data.preferences) {
              if (p.event_type === 'PUBLICATION_NEW' && byId('userPrefPublicationCadence')) {
                byId('userPrefPublicationCadence').value = p.enabled ? p.cadence : 'DISABLED';
              }
              if (p.event_type === 'DEADLINE_CRITICAL' && byId('userPrefDeadlineCadence')) {
                byId('userPrefDeadlineCadence').value = p.enabled ? p.cadence : 'DISABLED';
              }
              if (p.event_type === 'HEARING_NEW' && byId('userPrefHearingCadence')) {
                byId('userPrefHearingCadence').value = p.enabled ? p.cadence : 'DISABLED';
              }
            }
          }
        }).catch(error => {
          window.console?.warn?.('Não foi possível carregar as preferências de notificação.', error?.message || error);
        });

      state.profileSnapshot = this.profileFormSnapshot();
      byId('profileSettingsFeedback')?.classList.add('hidden');
      byId('profileSettingsBackdrop')?.classList.remove('hidden');
      document.body.classList.add('profile-settings-open');
      queueMicrotask(() => byId('profileDisplayName')?.focus());
    },
    openWorkspaceFactoryReset() {
      if (state.user?.role !== 'master_admin') return;
      this.closeProfile({ force: true });
      byId('workspaceFactoryResetForm')?.reset();
      byId('workspaceFactoryResetFeedback')?.classList.add('hidden');
      this.updateWorkspaceFactoryResetSubmit();
      byId('workspaceFactoryResetBackdrop')?.classList.remove('hidden');
      queueMicrotask(() => byId('workspaceFactoryResetPassword')?.focus());
    },
    closeWorkspaceFactoryReset() {
      byId('workspaceFactoryResetBackdrop')?.classList.add('hidden');
      byId('workspaceFactoryResetForm')?.reset();
      this.updateWorkspaceFactoryResetSubmit();
    },
    updateWorkspaceFactoryResetSubmit() {
      const confirmed = byId('workspaceFactoryResetToken')?.value === 'ZERAR_ESCRITORIO';
      const hasPassword = Boolean(byId('workspaceFactoryResetPassword')?.value);
      if (byId('workspaceFactoryResetSubmit')) byId('workspaceFactoryResetSubmit').disabled = !(confirmed && hasPassword);
    },
    async submitWorkspaceFactoryReset(event) {
      event.preventDefault();
      if (state.user?.role !== 'master_admin') return;
      const submit = byId('workspaceFactoryResetSubmit');
      const feedback = byId('workspaceFactoryResetFeedback');
      submit.disabled = true;
      if (feedback) { feedback.textContent = 'Redefinindo o escritório com proteção de rollback…'; feedback.classList.remove('hidden'); }
      try {
        const response = await this.secureFetch('/api/admin/workspace/factory-reset', {
          method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({
            workspaceId: state.user.workspaceId,
            password: byId('workspaceFactoryResetPassword')?.value || '',
            code: byId('workspaceFactoryResetCode')?.value || '',
            confirmationToken: byId('workspaceFactoryResetToken')?.value || ''
          })
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.message || 'Não foi possível redefinir o escritório.');
        if (feedback) feedback.textContent = 'Escritório redefinido. Recarregando o onboarding inicial…';
        window.setTimeout(() => window.location.reload(), 500);
      } catch (error) {
        if (feedback) feedback.textContent = error.message;
        this.updateWorkspaceFactoryResetSubmit();
      }
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

        const pubCad = byId('userPrefPublicationCadence')?.value;
        const dlnCad = byId('userPrefDeadlineCadence')?.value;
        const hrgCad = byId('userPrefHearingCadence')?.value;
        if (pubCad || dlnCad || hrgCad) {
          const prefs = [];
          if (pubCad) prefs.push({ eventType: 'PUBLICATION_NEW', cadence: pubCad, enabled: pubCad !== 'DISABLED' });
          if (dlnCad) prefs.push({ eventType: 'DEADLINE_CRITICAL', cadence: dlnCad, enabled: dlnCad !== 'DISABLED' });
          if (hrgCad) prefs.push({ eventType: 'HEARING_NEW', cadence: hrgCad, enabled: hrgCad !== 'DISABLED' });
          const preferencesResponse = await this.secureFetch('/api/user/notification-preferences', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({ preferences: prefs })
          });
          if (!preferencesResponse.ok) {
            const preferenceError = await preferencesResponse.json().catch(() => ({}));
            throw new Error(preferenceError.message || 'O perfil foi salvo, mas as preferências de notificação não foram confirmadas.');
          }
        }

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
    async resetProfile() {
      if (!window.confirm('Deseja realmente redefinir as preferências e foto do seu perfil para os padrões iniciais?')) return;
      this.profileFeedback('Redefinindo…');
      try {
        const response = await this.secureFetch('/api/auth/profile/reset', {
          method: 'POST',
          headers: { Accept: 'application/json' }
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.message || 'Não foi possível redefinir o perfil.');
        state.profileAvatarDraft = '';
        this.applyProfile(payload.user);
        this.openProfile();
        this.profileFeedback('Perfil redefinido com sucesso.', 'success');
        window.dispatchEvent(new CustomEvent('keller:profile-updated', { detail: payload.user }));
      } catch (error) {
        this.profileFeedback(error.message, 'error');
      }
    },
    async deleteProfile() {
      const isMaster = state.user?.role === 'master_admin';
      const promptMsg = isMaster
        ? 'ATENÇÃO: Você é o Administrador titular deste escritório. Excluir este perfil apagará seu acesso e, caso não haja outros administradores, reinicializará as credenciais do sistema.\n\nDeseja realmente prosseguir com a exclusão?'
        : 'ATENÇÃO: Deseja realmente excluir permanentemente seu perfil de acesso? Esta ação não pode ser desfeita.';
      if (!window.confirm(promptMsg)) return;
      this.profileFeedback('Excluindo perfil…');
      try {
        const response = await this.secureFetch('/api/auth/profile/delete', {
          method: 'POST',
          headers: { Accept: 'application/json' }
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.message || 'Não foi possível excluir o perfil.');
        state.authenticated = false;
        state.csrfToken = null;
        state.trustedDevice = false;
        sessionStorage.clear();
        this.closeProfile({ force: true });
        this.show('authLoginForm');
        this.feedback('Perfil excluído com sucesso.', 'success');
      } catch (error) {
        this.profileFeedback(error.message, 'error');
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
      state.authenticated = false; state.csrfToken = null; state.trustedDevice = false; state.workspace = null; state.user = null; state.pendingUser = null; sessionStorage.clear();
      // A tela de login tem URL oficial em /login; mantém o endereço coerente ao sair.
      try { globalThis.history.replaceState({}, '', '/login'); } catch { /* histórico indisponível */ }
      this.show('authLoginForm');
      this.feedback('Sessão encerrada com segurança.', 'success');
    },
    async secureFetch(url, options = {}) {
      const method = String(options.method || 'GET').toUpperCase();
      const headers = new Headers(options.headers || {});
      if (!['GET', 'HEAD', 'OPTIONS'].includes(method) && state.csrfToken) headers.set('X-CSRF-Token', state.csrfToken);
      const send = () => fetch(resolveApiUrl(url), { ...options, headers, credentials: 'include' });
      let response = await send();
      // Um deploy reinicia o servidor e pode invalidar o token em memória desta aba.
      // Em vez de exigir recarregar a página, renova o token e repete a mutação uma vez.
      if (response.status === 403 && !['GET', 'HEAD', 'OPTIONS'].includes(method)) {
        const payload = await response.clone().json().catch(() => ({}));
        const message = String(payload.message || '').toLowerCase();
        if (message.includes('seguran') || message.includes('csrf')) {
          try {
            const statusResponse = await fetch(resolveApiUrl('/api/auth/status'), { credentials: 'include', cache: 'no-store' });
            if (statusResponse.ok) {
              const status = await statusResponse.json();
              if (status?.csrfToken && status.csrfToken !== state.csrfToken) {
                state.csrfToken = status.csrfToken;
                headers.set('X-CSRF-Token', state.csrfToken);
                response = await send();
              }
            }
          } catch { /* mantém a resposta original quando a renovação não é possível */ }
        }
      }
      if (response.status === 401) { state.authenticated = false; state.csrfToken = null; state.workspace = null; state.user = null; state.pendingUser = null; this.show('authLoginForm'); }
      return response;
    },
    busy(form, active) {
      form.querySelectorAll('input, button').forEach(element => { element.disabled = active; });
    },
    feedback(message, type = '') {
      const registrationActive = byId('authRegisterForm')?.classList.contains('active');
      const element = byId(registrationActive ? 'authRegisterFeedback' : 'authFeedback');
      const other = byId(registrationActive ? 'authFeedback' : 'authRegisterFeedback');
      if (other) { other.textContent = ''; other.className = 'auth-feedback hidden'; }
      element.textContent = message || ''; element.className = `auth-feedback ${message ? '' : 'hidden'} ${type}`.trim();
    }
  };

  function clearSessionIdentity() {
    state.authenticated = false; state.workspace = null; state.user = null; state.pendingUser = null; state.csrfToken = null; state.trustedDevice = false;
  }

  function completeWorkspaceSession(result) {
    clearSessionIdentity();
    byId('authManualSecret').textContent = ''; byId('authQrCode').removeAttribute('src');
    byId('authTotpSetupForm').reset();
    const hasRecoveryCodes = Boolean(result.recoveryCodes?.length);
    byId('authRecoveryCodes').textContent = (result.recoveryCodes || []).join('\n');
    Auth.show(hasRecoveryCodes ? 'authRecoveryStep' : 'authLoading');
    try {
      validateSessionIdentity({ authenticated: true, user: result.user, workspace: result.workspace }, result.user);
      state.csrfToken = result.csrfToken; state.pendingUser = result.user; state.workspace = result.workspace;
      if (!hasRecoveryCodes) Auth.enter(result.user);
    } catch (error) {
      clearSessionIdentity();
      if (!hasRecoveryCodes) Auth.show('authLoginForm');
      Auth.feedback(error.message, 'error');
    }
  }

  async function completeSetupSession(result) {
    clearSessionIdentity();
    pendingSetupSession = { user: result.user, csrfToken: result.csrfToken };
    state.pendingUser = result.user; state.csrfToken = result.csrfToken;
    byId('authManualSecret').textContent = ''; byId('authQrCode').removeAttribute('src');
    byId('authTotpSetupForm').reset();
    const hasRecoveryCodes = Boolean(result.recoveryCodes?.length);
    byId('authRecoveryCodes').textContent = (result.recoveryCodes || []).join('\n');
    Auth.show(hasRecoveryCodes ? 'authRecoveryStep' : 'authLoading');
    byId('finishRecovery').disabled = true;
    try {
      const user = await refreshSessionWorkspace(result.user);
      state.pendingUser = user;
      if (!hasRecoveryCodes) {
        pendingSetupSession = null;
        Auth.enter(user);
      }
    } catch (error) {
      clearSessionIdentity();
      if (!hasRecoveryCodes) {
        pendingSetupSession = null;
        Auth.show('authLoginForm');
      }
      Auth.feedback(error.message, 'error');
    } finally { byId('finishRecovery').disabled = false; }
  }

  function validateSessionIdentity(status, user) {
    if (!status.authenticated || !status.user?.username || !user?.username
      || status.user.username !== user.username || !status.workspace?.id
      || status.workspace.id !== status.user.workspaceId || status.workspace.id !== user.workspaceId
      || ((status.user.id != null || user.id != null) && status.user.id !== user.id)) {
      throw new Error('Não foi possível validar o escritório da sessão. Entre novamente.');
    }
  }

  async function refreshSessionWorkspace(user) {
    state.workspace = null;
    const status = await request('/api/auth/status');
    validateSessionIdentity(status, user);
    state.workspace = status.workspace;
    return status.user;
  }

  async function request(url, { method = 'GET', body } = {}) {
    const response = await fetch(resolveApiUrl(url), { method, credentials: 'include', headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.message || 'Operação não concluída.');
    return payload;
  }

  window.AtriumAuth = Auth;
  // Alias de compatibilidade (AGENTS 9): consumidores legados e mocks de teste
  // seguem funcionando — mesmo objeto.
  window.KellerAuth = window.AtriumAuth;
// Balões do sistema ficam abaixo do botão que descrevem, sem cobri-lo e dentro da tela.
// Login, site e campo de senha têm posição própria no CSS.
function placeTooltip(trigger, tip) {
  if (tip.closest('.auth-topbar-actions, .password-input-wrap, .landing-nav-actions')) return;
  const margin = 8;
  const box = trigger.getBoundingClientRect();
  Object.assign(tip.style, { position: 'fixed', right: 'auto', bottom: 'auto', left: '0px', top: '0px' });
  const origin = tip.getBoundingClientRect();
  const left = Math.min(Math.max(box.left + (box.width - origin.width) / 2, margin), window.innerWidth - origin.width - margin);
  tip.style.left = `${left - origin.left}px`;
  tip.style.top = `${box.bottom + 6 - origin.top}px`;
}

function installTooltipHints(root = document) {
  root.querySelectorAll('[aria-describedby][role="button"], button[aria-describedby]').forEach(trigger => {
    if (trigger.dataset.tooltipReady === 'true') return;
    trigger.dataset.tooltipReady = 'true';
    const ids = String(trigger.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean);
    const tip = ids.map(id => document.getElementById(id)).find(node => node?.getAttribute('role') === 'tooltip');
    if (!tip) return;
    const show = () => { placeTooltip(trigger, tip); tip.dataset.open = 'true'; };
    const hide = () => { delete tip.dataset.open; };
    trigger.addEventListener('mouseenter', show);
    trigger.addEventListener('mouseleave', hide);
    trigger.addEventListener('focus', show);
    trigger.addEventListener('blur', hide);
    trigger.addEventListener('keydown', event => { if (event.key === 'Escape') hide(); });
  });
}

function passwordToggleIcon(visible) {
  const script = [...document.scripts].find(item => /\/auth\.js(?:\?|$)/.test(item.src || ''));
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'atrium-icon');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', `assets/icons/atrium-ui-icons.svg?v=3.0.0#atrium-icon-${visible ? 'eye-off' : 'eye'}`);
  svg.appendChild(use);
  return svg;
}

function installPasswordToggles(root = document) {
  root.querySelectorAll('input[type="password"]:not([data-password-toggle-ready])').forEach(input => {
    input.dataset.passwordToggleReady = 'true';
    const wrapper = document.createElement('span'); wrapper.className = 'password-input-wrap';
    input.parentNode.insertBefore(wrapper, input); wrapper.appendChild(input);
    const tooltipId = `passwordToggleTip-${Math.random().toString(36).slice(2, 10)}`;
    const tooltip = document.createElement('span');
    tooltip.className = 'ui-tooltip'; tooltip.id = tooltipId; tooltip.setAttribute('role', 'tooltip');
    tooltip.textContent = 'Mostrar ou ocultar a senha digitada';
    const button = document.createElement('button'); button.type = 'button'; button.className = 'password-toggle'; button.setAttribute('aria-label', 'Mostrar conteúdo'); button.setAttribute('aria-pressed', 'false'); button.setAttribute('aria-describedby', tooltipId); button.appendChild(passwordToggleIcon(false));
    button.addEventListener('click', () => {
    const visible = input.type === 'text'; input.type = visible ? 'password' : 'text';
    button.setAttribute('aria-label', visible ? 'Mostrar conteúdo' : 'Ocultar conteúdo'); button.setAttribute('aria-pressed', String(!visible)); button.classList.toggle('visible', !visible);
    button.replaceChildren(passwordToggleIcon(!visible));
    });
    wrapper.appendChild(button);
    wrapper.appendChild(tooltip);
  });
}
document.addEventListener('DOMContentLoaded', () => {
  installPasswordToggles();
  installTooltipHints();
  new MutationObserver(mutations => mutations.forEach(mutation => mutation.addedNodes.forEach(node => { if (node.nodeType === 1) { installPasswordToggles(node); installTooltipHints(node); } }))).observe(document.body, { childList: true, subtree: true });
  Auth.init();
});
})();
