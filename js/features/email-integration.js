const defaultEscapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
}[character]));

export function createEmailIntegrationFeature({
  documentRef = globalThis.document,
  windowRef = globalThis.window,
  secureFetch = (...args) => windowRef?.KellerAuth?.secureFetch(...args),
  escapeHtml = defaultEscapeHtml,
  showToast = () => {},
  getCurrentUser = () => windowRef?.KellerAuth?.currentUser,
  getOfficeName = () => '',
  confirmFn = message => windowRef?.confirm?.(message) ?? false,
  withReauth = exec => exec({}),
  presentation = null
} = {}) {
  let initialized = false;
  let emailReceivers = [];
  let currentStatus = null;
  let preferencesLoaded = false;
  let preferencesSaving = false;
  const unsupportedPreferences = new Set();
  const preferenceFields = [
    ['PUBLICATION_NEW', 'mailPrefPublication'],
    ['DEADLINE_CRITICAL', 'mailPrefDeadline'],
    ['HEARING_NEW', 'mailPrefHearing'],
    ['MOVEMENT_NEW', 'mailPrefMovements'],
    ['SYNC_FAILED', 'mailPrefSyncFailed'],
    ['A1_CERT_EXPIRING', 'mailPrefCertificate']
  ];
  const normalizeCadence = (cadence, enabled = true) => {
    if (!enabled || cadence === 'DISABLED') return 'DISABLED';
    return ['BULLETINS', 'IMMEDIATE', 'SYNC_DIGEST', 'DAILY'].includes(cadence) ? 'BULLETINS' : 'DISABLED';
  };
  const byId = id => documentRef?.getElementById(id);
  const logError = (...args) => windowRef?.console?.error?.(...args);

  const feature = {
    get receivers() { return emailReceivers; },
    set receivers(value) { emailReceivers = Array.isArray(value) ? value : []; },

    init() {
      if (initialized) return false;
      initialized = true;
      presentation?.init?.();

      // ATRIUM Mail toggle switch
      byId('atriumMailToggleCheckbox')?.addEventListener('change', event => {
        this.toggleAtriumMail(event.target.checked);
      });

      // Test email modal
      byId('btnTestAtriumMail')?.addEventListener('click', () => this.openTestModal());
      byId('btnTestEmail')?.addEventListener('click', () => this.openTestModal());
      byId('emailTestClose')?.addEventListener('click', () => this.closeTestModal());
      byId('emailTestCancel')?.addEventListener('click', () => this.closeTestModal());
      byId('emailTestBackdrop')?.addEventListener('click', event => {
        if (event.target === byId('emailTestBackdrop')) this.closeTestModal();
      });
      byId('emailTestForm')?.addEventListener('submit', event => this.submitTest(event));

      byId('btnConfigureMailPreferences')?.addEventListener('click', () => this.openPreferencesDrawer());
      byId('mailPreferencesClose')?.addEventListener('click', () => this.closePreferencesDrawer());
      byId('mailPreferencesCancel')?.addEventListener('click', () => this.closePreferencesDrawer());
      byId('mailPreferencesBackdrop')?.addEventListener('click', event => {
        if (event.target === byId('mailPreferencesBackdrop')) this.closePreferencesDrawer();
      });
      byId('mailPreferencesForm')?.addEventListener('submit', event => this.savePreferences(event));
      for (const [eventType, id] of preferenceFields) {
        byId(id)?.addEventListener('change', () => unsupportedPreferences.delete(eventType));
      }

      // External recipients management
      byId('btnAddExternalRecipient')?.addEventListener('click', () => this.openReceiverModal());
      byId('btnAddEmailReceiver')?.addEventListener('click', () => this.openReceiverModal());
      byId('emailReceiverModalClose')?.addEventListener('click', () => this.closeReceiverModal());
      byId('receiverCancelBtn')?.addEventListener('click', () => this.closeReceiverModal());
      byId('emailReceiverModalBackdrop')?.addEventListener('click', event => {
        if (event.target === byId('emailReceiverModalBackdrop')) this.closeReceiverModal();
      });
      byId('emailReceiverForm')?.addEventListener('submit', event => this.submitReceiver(event));
      byId('receiverTypeInternal')?.addEventListener('change', () => this.switchReceiverType('internal'));
      byId('receiverTypeExternal')?.addEventListener('change', () => this.switchReceiverType('external'));

      byId('emailReceiversList')?.addEventListener('click', event => {
        const toggleButton = event.target.closest('[data-receiver-action="toggle"]');
        if (toggleButton) {
          const id = toggleButton.dataset.receiverId;
          const currentEnabled = toggleButton.dataset.receiverEnabled === 'true';
          this.toggleReceiver(id, !currentEnabled);
          return;
        }
        const editButton = event.target.closest('[data-receiver-action="edit"]');
        if (editButton) {
          const receiver = emailReceivers.find(item => item.id === editButton.dataset.receiverId);
          if (receiver) this.openReceiverModal(receiver);
          return;
        }
        const deleteButton = event.target.closest('[data-receiver-action="delete"]');
        if (deleteButton) this.deleteReceiver(deleteButton.dataset.receiverId);
      });

      // Legacy SMTP modal listeners (for rollback compatibility if enabled)
      byId('btnConfigureEmail')?.addEventListener('click', () => this.openConfigModal());
      byId('emailConfigClose')?.addEventListener('click', () => this.closeConfigModal());
      byId('emailConfigCancel')?.addEventListener('click', () => this.closeConfigModal());
      byId('emailConfigBackdrop')?.addEventListener('click', event => {
        if (event.target === byId('emailConfigBackdrop')) this.closeConfigModal();
      });
      byId('emailConfigForm')?.addEventListener('submit', event => this.submitConfig(event));

      return true;
    },

    async loadStatus() {
      const chip = byId('emailIntegrationStatus');
      const detail = byId('emailIntegrationDetail');
      const toggleCheckbox = byId('atriumMailToggleCheckbox');
      const toggleLabel = byId('atriumMailToggleLabel');
      const currentUser = getCurrentUser();
      const isMasterAdmin = currentUser?.role === 'master_admin';
      byId('btnTestAtriumMail')?.classList.toggle('hidden', !isMasterAdmin);

      try {
        const response = await secureFetch('/api/admin/mail/status');
        if (!response.ok) {
          if (response.status === 403) {
            // User is not master_admin; hide admin switch
            if (byId('atriumMailSwitchContainer')) byId('atriumMailSwitchContainer').style.display = 'none';
            await this.loadReceivers();
          }
          return null;
        }

        const data = await response.json().catch(() => ({}));
        currentStatus = data;
        const stats = data.stats || {};
        const isEnabled = Boolean(stats.enabled);

        if (chip) {
          chip.textContent = !isEnabled ? 'Desativado' : data.configured ? 'Ativo' : 'Não configurado';
          chip.className = `status-chip ${data.configured && isEnabled ? 'connected' : 'muted'}`;
        }

        if (toggleCheckbox) toggleCheckbox.checked = isEnabled;
        if (toggleLabel) toggleLabel.textContent = isEnabled ? 'Ativo' : 'Desativado';

        if (detail) {
          detail.textContent = !data.configured
            ? 'E-mail não configurado. Nenhum e-mail será enviado até o provedor (Resend) ser configurado.'
            : isEnabled
              ? 'E-mail conectado pelo Resend. Notificações automáticas ativas.'
              : 'E-mail conectado pelo Resend. Envios automáticos pausados neste escritório. Marque a chave para ativar.';
        }

        // Update telemetry counters
        if (byId('atriumMailTodayCount') && data.limits) {
          byId('atriumMailTodayCount').textContent = `${stats.sentToday || 0} / ${data.limits.daily || 100}`;
        }
        if (byId('atriumMailMonthCount') && data.limits) {
          byId('atriumMailMonthCount').textContent = `${stats.sentMonth || 0} / ${data.limits.monthly || 3000}`;
        }
        if (byId('atriumMailQueueCount')) {
          const queued = stats.queue?.QUEUED || 0;
          byId('atriumMailQueueCount').textContent = `${queued} na fila`;
        }

        await this.loadReceivers();
        return data;
      } catch (error) {
        logError('Falha ao carregar status do ATRIUM Mail:', error);
        if (chip) {
          chip.textContent = 'Indisponível';
          chip.className = 'status-chip muted';
        }
        return null;
      }
    },

    async toggleAtriumMail(enabled) {
      const toggleCheckbox = byId('atriumMailToggleCheckbox');
      const toggleLabel = byId('atriumMailToggleLabel');
      const chip = byId('emailIntegrationStatus');

      if (byId('mailPreferencesBackdrop') && !byId('mailPreferencesBackdrop').classList.contains('hidden')) {
        this.closePreferencesDrawer();
      }

      try {
        const response = await withReauth(stepUp => secureFetch('/api/admin/mail/toggle', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ enabled, ...stepUp })
        }));
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          if (response.reauthCancelled) {
            showToast('Alteração cancelada. Nenhuma mudança foi aplicada.', 'warning');
            await this.loadStatus();
            return false;
          }
          throw new Error(data.message || 'Não foi possível alterar a situação do e-mail.');
        }

        if (toggleCheckbox) toggleCheckbox.checked = enabled;
        if (toggleLabel) toggleLabel.textContent = enabled ? 'Ativo' : 'Desativado';
        if (chip) {
          chip.textContent = enabled ? 'Ativo' : 'Desativado';
          chip.className = `status-chip ${enabled ? 'connected' : 'muted'}`;
        }

        showToast(`ATRIUM Mail ${enabled ? 'ativado' : 'desativado'} com sucesso!`, 'success');
        await this.loadStatus();
        return true;
      } catch (error) {
        if (toggleCheckbox) toggleCheckbox.checked = !enabled;
        showToast(error.message || 'Não foi possível alterar a situação do e-mail.', 'error');
        await this.loadStatus();
        return false;
      }
    },

    async loadReceivers() {
      const currentUser = getCurrentUser();
      const isAdmin = currentUser?.role === 'master_admin';
      const section = byId('emailReceiversSection');
      const addButtons = ['btnAddExternalRecipient', 'btnAddEmailReceiver'].map(id => byId(id)).filter(Boolean);

      if (!isAdmin) {
        section?.classList.add('hidden');
        addButtons.forEach(button => button.classList.add('hidden'));
        return [];
      }
      addButtons.forEach(button => button.classList.remove('hidden'));

      try {
        const response = await secureFetch('/api/admin/mail/recipients', { headers: { Accept: 'application/json' } });
        if (!response.ok) return emailReceivers;
        const data = await response.json().catch(() => ({}));
        emailReceivers = Array.isArray(data.recipients) ? data.recipients : [];
        this.renderReceivers(emailReceivers);
      } catch (error) {
        logError('Erro ao carregar destinatários externos:', error);
      }
      return emailReceivers;
    },

    renderReceivers(receivers = []) {
      const count = byId('emailReceiversCount');
      const list = byId('emailReceiversList');
      byId('emailReceiversSection')?.classList.toggle('hidden', receivers.length === 0);
      if (count) count.textContent = `${receivers.length} cadastrado${receivers.length === 1 ? '' : 's'}`;
      if (!list) return receivers;
      if (!receivers.length) {
        list.innerHTML = '';
        return receivers;
      }
      byId('emailReceiversSection')?.classList.remove('hidden');
      list.innerHTML = receivers.map(receiver => this.receiverHtml(receiver)).join('');
      return receivers;
    },

    receiverHtml(receiver) {
      const statusBadge = receiver.enabled
        ? '<span class="badge-chip email-receiver-status success">Ativo</span>'
        : '<span class="badge-chip email-receiver-status muted">Pausado</span>';

      const prefs = Array.isArray(receiver.preferences) ? receiver.preferences : [];
      const prefBadges = prefs
        .filter(p => p.enabled && p.cadence !== 'DISABLED')
        .map(p => {
          const labels = {
            PUBLICATION_NEW: 'Publicações',
            HEARING_NEW: 'Audiências',
            DEADLINE_CRITICAL: 'Prazos',
            SYNC_FAILED: 'Falhas Sync',
            A1_CERT_EXPIRING: 'Certificado A1'
          };
          return `<span class="badge-chip" style="font-size:10px; background:var(--panel-soft); border:1px solid var(--line);">${labels[p.eventType] || p.eventType}</span>`;
        })
        .join(' ');

      return `
        <div class="email-receiver-item card" data-receiver-id="${escapeHtml(receiver.id)}" style="display:flex; justify-content:space-between; align-items:center; padding:10px 12px; background:var(--panel-soft); border-radius:8px; border:1px solid var(--line); margin-bottom:6px;">
          <div class="email-receiver-identity">
            <div class="email-receiver-heading" style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
              <strong style="color:var(--ivory); font-size:13px;">${escapeHtml(receiver.name || 'Sem nome')}</strong>
              ${statusBadge}
            </div>
            <span class="email-receiver-address" style="display:block; color:var(--muted); font-size:12px; margin-top:2px;">${escapeHtml(receiver.email || 'Sem e-mail')}</span>
            <div style="display:flex; gap:4px; margin-top:6px; flex-wrap:wrap;">
              ${prefBadges || '<span class="email-receiver-empty-events">Nenhum evento ativo</span>'}
            </div>
          </div>
          <div class="email-receiver-actions">
            <button class="button ghost" data-receiver-action="toggle" data-receiver-id="${escapeHtml(receiver.id)}" data-receiver-enabled="${receiver.enabled ? 'true' : 'false'}">${receiver.enabled ? 'Pausar' : 'Ativar'}</button>
            <button class="button ghost" data-receiver-action="edit" data-receiver-id="${escapeHtml(receiver.id)}">Editar</button>
            <button class="button ghost email-receiver-delete" data-receiver-action="delete" data-receiver-id="${escapeHtml(receiver.id)}" title="Excluir destinatário">Excluir</button>
          </div>
        </div>`;
    },

    openTestModal(recipient) {
      const backdrop = byId('emailTestBackdrop');
      if (!backdrop) return false;
      const recipientInput = byId('emailTestRecipientInput');
      const currentUser = getCurrentUser();
      const restored = typeof recipient === 'string' && recipient.trim();
      if (recipientInput) recipientInput.value = restored ? recipient.trim() : (currentUser?.email || '');
      backdrop.classList.remove('hidden');
      presentation?.open?.('emailTest');
      return true;
    },

    closeTestModal() {
      byId('emailTestBackdrop')?.classList.add('hidden');
      presentation?.close?.('emailTest');
    },

    async openPreferencesDrawer() {
      const backdrop = byId('mailPreferencesBackdrop');
      if (!backdrop || preferencesSaving) return false;
      const isAdmin = ['admin', 'master_admin'].includes(getCurrentUser()?.role);
      const fields = preferenceFields.filter(([, id]) => isAdmin || !['mailPrefSyncFailed', 'mailPrefCertificate'].includes(id));
      const feedback = byId('mailPreferencesFeedback');
      preferencesLoaded = false;
      unsupportedPreferences.clear();
      feedback?.classList.add('hidden');
      for (const id of ['mailPrefSyncFailedField', 'mailPrefCertificateField']) {
        if (byId(id)) byId(id).hidden = !isAdmin;
      }
      for (const [, id] of preferenceFields) {
        if (byId(id)) { byId(id).value = 'DISABLED'; byId(id).disabled = true; }
      }
      if (byId('mailPreferencesSubmit')) byId('mailPreferencesSubmit').disabled = true;
      try {
        const response = await secureFetch('/api/user/notification-preferences', { headers: { Accept: 'application/json' } });
        const data = await response.json();
        if (!response.ok || !Array.isArray(data.preferences)) throw new Error('Não foi possível carregar as preferências. Feche e abra o painel para tentar novamente.');
        for (const [eventType, id] of fields) {
          const preference = data.preferences.find(item => (item.event_type || item.eventType) === eventType);
          if (byId(id)) {
            byId(id).value = preference ? normalizeCadence(preference.cadence, preference.enabled) : 'BULLETINS';
            byId(id).disabled = false;
          }
          if (preference && preference.enabled !== false && preference.enabled !== 0 && !['BULLETINS', 'IMMEDIATE', 'SYNC_DIGEST', 'DAILY', 'DISABLED'].includes(preference.cadence)) unsupportedPreferences.add(eventType);
        }
        preferencesLoaded = true;
        if (byId('mailPreferencesSubmit')) byId('mailPreferencesSubmit').disabled = false;
        if (unsupportedPreferences.size && feedback) {
          feedback.textContent = 'Algumas preferências não são reconhecidas. Serão preservadas, salvo se você escolher uma opção nesses campos.';
          feedback.className = 'mail-preferences-feedback warning';
        }
      } catch (error) {
        if (feedback) { feedback.textContent = error.message; feedback.className = 'mail-preferences-feedback error'; }
        showToast(error.message, 'error');
      }
      backdrop.classList.remove('hidden');
      documentRef.body.style.overflow = 'hidden';
      presentation?.open?.('mailPreferences');
      if (!preferencesLoaded) byId('mailPreferencesClose')?.focus?.();
      return true;
    },

    closePreferencesDrawer() {
      if (preferencesSaving) return false;
      byId('mailPreferencesBackdrop')?.classList.add('hidden');
      if (documentRef.body) documentRef.body.style.overflow = '';
      presentation?.close?.('mailPreferences');
    },

    async savePreferences(event) {
      event?.preventDefault?.();
      if (!preferencesLoaded || preferencesSaving) return false;
      const isAdmin = ['admin', 'master_admin'].includes(getCurrentUser()?.role);
      const preferences = preferenceFields
        .filter(([eventType, id]) => byId(id) && !unsupportedPreferences.has(eventType) && (isAdmin || !['SYNC_FAILED', 'A1_CERT_EXPIRING'].includes(eventType)))
        .map(([eventType, id]) => {
          const cadence = normalizeCadence(byId(id).value);
          return { eventType, cadence, enabled: cadence !== 'DISABLED' };
        });
      const feedback = byId('mailPreferencesFeedback');
      preferencesSaving = true;
      if (byId('mailPreferencesSubmit')) byId('mailPreferencesSubmit').disabled = true;
      byId('mailPreferencesForm')?.setAttribute?.('aria-busy', 'true');
      try {
        const response = await secureFetch('/api/user/notification-preferences', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ preferences })
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.message || 'Não foi possível salvar as preferências.');
        feedback?.classList.add('hidden');
        showToast('Preferências de e-mail salvas.', 'success');
        preferencesSaving = false;
        this.closePreferencesDrawer();
        return true;
      } catch (error) {
        if (feedback) { feedback.textContent = error.message; feedback.className = 'mail-preferences-feedback error'; }
        byId('mailPreferencesSubmit')?.scrollIntoView?.({ block: 'nearest' });
        showToast(error.message, 'error');
        return false;
      } finally {
        preferencesSaving = false;
        if (byId('mailPreferencesSubmit')) byId('mailPreferencesSubmit').disabled = !preferencesLoaded;
        byId('mailPreferencesForm')?.removeAttribute?.('aria-busy');
      }
    },

    async submitTest(event) {
      event?.preventDefault?.();
      const submitButton = byId('emailTestSubmitBtn');
      const recipient = byId('emailTestRecipientInput')?.value?.trim();
      if (!recipient) {
        showToast('Informe o e-mail de destino do teste.', 'warning');
        return false;
      }

      if (submitButton) {
        submitButton.disabled = true;
        submitButton.textContent = 'Enviando teste...';
      }

      // O prompt genérico de step-up usa #modalBackdrop (z-index 80). Este backdrop
      // vem depois no DOM e o encobriria, tornando o retry impossível: o modal do
      // teste fecha antes da request e é restaurado se a ação não concluir.
      this.closeTestModal();
      try {
        const response = await withReauth(stepUp => secureFetch('/api/admin/mail/test', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ recipient, ...stepUp })
        }));
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          if (response.reauthCancelled) {
            showToast('Envio de teste cancelado. Nenhuma mensagem foi enfileirada.', 'warning');
            this.openTestModal(recipient);
            await this.loadStatus();
            return false;
          }
          throw new Error(data.message || 'Falha no envio de teste.');
        }
        showToast(`E-mail de teste enfileirado para ${recipient}!`, 'success');
        await this.loadStatus();
        return true;
      } catch (error) {
        showToast(error.message || 'Erro ao enviar e-mail de teste.', 'error');
        this.openTestModal(recipient);
        await this.loadStatus();
        return false;
      } finally {
        if (submitButton) {
          submitButton.disabled = false;
          submitButton.textContent = 'Enviar Teste Agora';
        }
      }
    },

    openReceiverModal(receiverToEdit = null) {
      const backdrop = byId('emailReceiverModalBackdrop');
      if (!backdrop) return false;

      // Clean or populate fields
      if (byId('emailReceiverModalTitle')) {
        byId('emailReceiverModalTitle').textContent = receiverToEdit ? 'Editar Destinatário Externo' : 'Adicionar Destinatário Externo';
      }
      if (byId('receiverIdInput')) byId('receiverIdInput').value = receiverToEdit?.id || '';
      if (byId('receiverNameInput')) byId('receiverNameInput').value = receiverToEdit?.name || '';
      if (byId('receiverEmailInput')) byId('receiverEmailInput').value = receiverToEdit?.email || '';
      if (byId('receiverEnabledInput')) byId('receiverEnabledInput').checked = receiverToEdit ? Boolean(receiverToEdit.enabled) : true;

      // Hide internal user selector if present
      byId('receiverTypeSelectorContainer')?.classList.add('hidden');
      byId('receiverInternalFields')?.classList.add('hidden');
      byId('receiverExternalFields')?.classList.remove('hidden');

      backdrop.classList.remove('hidden');
      if (documentRef?.body) documentRef.body.style.overflow = 'hidden';
      presentation?.open?.('emailReceiver');
      return true;
    },

    switchReceiverType(type) {
      const internal = type === 'internal';
      byId('receiverInternalFields')?.classList.toggle('hidden', !internal);
      byId('receiverExternalFields')?.classList.toggle('hidden', internal);
      return internal;
    },

    closeReceiverModal() {
      byId('emailReceiverModalBackdrop')?.classList.add('hidden');
      if (documentRef?.body) documentRef.body.style.overflow = '';
      presentation?.close?.('emailReceiver');
    },

    async submitReceiver(event) {
      event?.preventDefault?.();
      const submitButton = byId('receiverSubmitBtn');
      const id = byId('receiverIdInput')?.value;
      const isEditing = Boolean(id);
      const name = byId('receiverNameInput')?.value?.trim();
      const email = byId('receiverEmailInput')?.value?.trim();
      const enabled = Boolean(byId('receiverEnabledInput')?.checked);

      if (!name || !email) {
        showToast('Nome e e-mail são obrigatórios.', 'warning');
        return false;
      }

      if (submitButton) {
        submitButton.disabled = true;
        submitButton.textContent = 'Salvando...';
      }

      try {
        const url = isEditing ? `/api/admin/mail/recipients/${encodeURIComponent(id)}` : '/api/admin/mail/recipients';
        const method = isEditing ? 'PATCH' : 'POST';
        const response = await secureFetch(url, {
          method,
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ name, email, enabled })
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.message || 'Falha ao salvar destinatário.');

        this.closeReceiverModal();
        showToast(`Destinatário ${isEditing ? 'atualizado' : 'adicionado'} com sucesso!`, 'success');
        await this.loadReceivers();
        return true;
      } catch (error) {
        showToast(error.message || 'Erro ao salvar destinatário.', 'error');
        return false;
      } finally {
        if (submitButton) {
          submitButton.disabled = false;
          submitButton.textContent = isEditing ? 'Salvar Alterações' : 'Cadastrar Destinatário';
        }
      }
    },

    async toggleReceiver(id, enabled) {
      try {
        const response = await secureFetch(`/api/admin/mail/recipients/${encodeURIComponent(id)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ enabled })
        });
        if (!response.ok) throw new Error('Não foi possível atualizar a situação.');
        showToast(`Destinatário ${enabled ? 'ativado' : 'pausado'}.`, 'success');
        await this.loadReceivers();
      } catch (error) {
        showToast(error.message || 'Erro ao alterar status.', 'error');
      }
    },

    async deleteReceiver(id) {
      if (!confirmFn('Deseja realmente remover este destinatário externo?')) return;
      try {
        const response = await secureFetch(`/api/admin/mail/recipients/${encodeURIComponent(id)}`, {
          method: 'DELETE',
          headers: { Accept: 'application/json' }
        });
        if (!response.ok) throw new Error('Falha ao excluir destinatário.');
        showToast('Destinatário removido com sucesso.', 'success');
        await this.loadReceivers();
      } catch (error) {
        showToast(error.message || 'Erro ao excluir destinatário.', 'error');
      }
    },

    // Legacy SMTP helpers (for rollback mode)
    openConfigModal() {
      byId('emailConfigBackdrop')?.classList.remove('hidden');
      presentation?.open?.('emailConfig');
    },
    closeConfigModal() {
      byId('emailConfigBackdrop')?.classList.add('hidden');
      presentation?.close?.('emailConfig');
    },
    async submitConfig(event) {
      event?.preventDefault?.();
      showToast('SMTP Legado desabilitado. O sistema utiliza ATRIUM Mail nativo.', 'warning');
    }
  };

  return feature;
}
