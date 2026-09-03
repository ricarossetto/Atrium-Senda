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
  presentation = null
} = {}) {
  let initialized = false;
  let emailReceivers = [];
  let smtpGuideDismissed = false;
  const initialSnapshots = new Map();
  const byId = id => documentRef?.getElementById(id);
  const logError = (...args) => windowRef?.console?.error?.(...args);

  const feature = {
    get receivers() { return emailReceivers; },
    set receivers(value) { emailReceivers = Array.isArray(value) ? value : []; },

    init() {
      if (initialized) return false;
      initialized = true;
      presentation?.init?.();

      byId('btnConfigureEmail')?.addEventListener('click', () => this.openConfigModal());
      byId('emailConfigClose')?.addEventListener('click', () => this.requestClose('config'));
      byId('emailConfigCancel')?.addEventListener('click', () => this.requestClose('config'));
      byId('emailConfigBackdrop')?.addEventListener('click', event => {
        if (event.target === byId('emailConfigBackdrop')) this.requestClose('config');
      });
      byId('emailConfigForm')?.addEventListener('submit', event => this.submitConfig(event));
      byId('dismissSmtpGuide')?.addEventListener('click', () => {
        byId('smtpFirstUseGuide')?.classList.add('hidden');
        smtpGuideDismissed = true;
        byId('emailHostInput')?.focus();
      });

      byId('btnTestEmail')?.addEventListener('click', () => this.openTestModal());
      byId('emailTestClose')?.addEventListener('click', () => this.requestClose('test'));
      byId('emailTestCancel')?.addEventListener('click', () => this.requestClose('test'));
      byId('emailTestBackdrop')?.addEventListener('click', event => {
        if (event.target === byId('emailTestBackdrop')) this.requestClose('test');
      });
      byId('emailTestForm')?.addEventListener('submit', event => this.submitTest(event));

      byId('btnAddEmailReceiver')?.addEventListener('click', () => this.openReceiverModal());
      byId('emailReceiverModalClose')?.addEventListener('click', () => this.requestClose('receiver'));
      byId('receiverCancelBtn')?.addEventListener('click', () => this.requestClose('receiver'));
      byId('emailReceiverModalBackdrop')?.addEventListener('click', event => {
        if (event.target === byId('emailReceiverModalBackdrop')) this.requestClose('receiver');
      });
      byId('receiverTypeInternal')?.addEventListener('change', () => {
        byId('receiverInternalFields')?.classList.remove('hidden');
        byId('receiverExternalFields')?.classList.add('hidden');
      });
      byId('receiverTypeExternal')?.addEventListener('change', () => {
        byId('receiverInternalFields')?.classList.add('hidden');
        byId('receiverExternalFields')?.classList.remove('hidden');
      });
      byId('emailReceiverForm')?.addEventListener('submit', event => this.submitReceiver(event));
      byId('emailReceiversList')?.addEventListener('click', event => {
        const toggleButton = event.target.closest('[data-receiver-action="toggle"]');
        if (toggleButton) {
          this.toggleReceiver(toggleButton.dataset.receiverId, toggleButton.dataset.receiverEnabled === 'true');
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
      return true;
    },

    formSnapshot(key) {
      const ids = key === 'config'
        ? ['emailHostInput', 'emailPortInput', 'emailSecureInput', 'emailUserInput', 'emailPasswordInput', 'emailFromNameInput', 'emailFromAddressInput']
        : key === 'test'
          ? ['emailTestRecipientInput']
          : ['receiverIdInput', 'receiverEditTypeInput', 'receiverTypeInternal', 'receiverTypeExternal', 'receiverUserSelect', 'receiverNameInput', 'receiverEmailInput', 'receiverEnabledInput'];
      return JSON.stringify(ids.map(id => {
        const element = byId(id);
        return { id, value: element?.value || '', checked: Boolean(element?.checked) };
      }));
    },

    rememberSnapshot(key) {
      initialSnapshots.set(key, this.formSnapshot(key));
    },

    hasUnsavedChanges(key) {
      const initial = initialSnapshots.get(key);
      return Boolean(initial && initial !== this.formSnapshot(key));
    },

    requestClose(key) {
      const labels = { config: 'configuração de e-mail', test: 'teste de e-mail', receiver: 'destinatário' };
      if (this.hasUnsavedChanges(key)
        && !confirmFn(`Há alterações não salvas em ${labels[key]}. Deseja realmente fechar e descartá-las?`)) return false;
      if (key === 'config') this.closeConfigModal();
      else if (key === 'test') this.closeTestModal();
      else this.closeReceiverModal();
      return true;
    },

    async loadStatus() {
      const chip = byId('emailIntegrationStatus');
      const detail = byId('emailIntegrationDetail');
      const configButton = byId('btnConfigureEmail');
      const testButton = byId('btnTestEmail');

      try {
        const response = await secureFetch('/api/integrations/email/status');
        const data = await response.json().catch(() => ({}));
        const status = data?.status || {};

        if (status.configured) {
          if (chip) {
            chip.textContent = 'SMTP conectado';
            chip.className = 'status-chip connected';
          }
          if (detail) {
            const lastTestInfo = status.lastTestAt
              ? ` · Último teste: ${new Date(status.lastTestAt).toLocaleDateString('pt-BR')} (${status.lastTestStatus === 'success' ? 'Sucesso' : 'Falhou'})`
              : '';
            detail.textContent = `Host: ${status.host}:${status.port} · Remetente: ${status.fromAddress}${lastTestInfo}`;
          }
          if (configButton) configButton.textContent = 'Reconfigurar SMTP';
          testButton?.classList.remove('hidden');
        } else {
          if (chip) {
            chip.textContent = 'Não configurado';
            chip.className = 'status-chip muted';
          }
          if (detail) detail.textContent = 'Configure o transporte SMTP seguro para envio de comunicações e boletins do escritório.';
          if (configButton) configButton.textContent = 'Configurar SMTP';
          testButton?.classList.add('hidden');
        }
        await this.loadReceivers();
        return status;
      } catch {
        if (chip) {
          chip.textContent = 'Erro ao verificar';
          chip.className = 'status-chip danger';
        }
        return null;
      }
    },

    async openConfigModal() {
      const backdrop = byId('emailConfigBackdrop');
      if (!backdrop) return false;
      try {
        const response = await secureFetch('/api/integrations/email/status');
        const data = await response.json().catch(() => ({}));
        const status = data?.status || {};
        const passwordInput = byId('emailPasswordInput');

        if (byId('emailHostInput')) byId('emailHostInput').value = status.host || '';
        if (byId('emailPortInput')) byId('emailPortInput').value = status.port || 465;
        if (byId('emailSecureInput')) byId('emailSecureInput').checked = status.secure !== false;
        if (byId('emailUserInput')) byId('emailUserInput').value = status.userMasked || '';
        if (passwordInput) {
          passwordInput.value = '';
          passwordInput.placeholder = status.configured ? 'Deixe em branco para manter a senha atual' : 'Digite a senha SMTP ou senha de app';
          passwordInput.required = !status.configured;
        }
        if (byId('emailFromNameInput')) byId('emailFromNameInput').value = status.fromName || getOfficeName() || '';
        if (byId('emailFromAddressInput')) byId('emailFromAddressInput').value = status.fromAddress || '';
        const firstUseGuide = byId('smtpFirstUseGuide');
        if (firstUseGuide) firstUseGuide.classList.toggle('hidden', status.configured || smtpGuideDismissed);
        this.rememberSnapshot('config');
        backdrop.classList.remove('hidden');
        presentation?.open?.('emailConfig');
        return true;
      } catch {
        showToast('Não foi possível carregar a configuração SMTP.', 'error');
        return false;
      }
    },

    closeConfigModal() {
      byId('emailConfigBackdrop')?.classList.add('hidden');
      initialSnapshots.delete('config');
      const passwordInput = byId('emailPasswordInput');
      if (passwordInput) passwordInput.value = '';
      presentation?.close?.('emailConfig');
    },

    async submitConfig(event) {
      event?.preventDefault?.();
      const submitButton = byId('emailConfigSubmitBtn');
      if (submitButton) {
        submitButton.disabled = true;
        submitButton.textContent = '⏳ Validando conexão SMTP...';
      }

      const payload = {
        host: byId('emailHostInput')?.value?.trim(),
        port: Number(byId('emailPortInput')?.value),
        secure: byId('emailSecureInput')?.checked,
        user: byId('emailUserInput')?.value?.trim(),
        password: byId('emailPasswordInput')?.value,
        fromName: byId('emailFromNameInput')?.value?.trim(),
        fromAddress: byId('emailFromAddressInput')?.value?.trim()
      };

      try {
        const response = await secureFetch('/api/integrations/email/configure', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.message || 'Falha ao salvar configuração SMTP.');
        this.closeConfigModal();
        showToast('Configuração SMTP validada e salva com sucesso!', 'success');
        await this.loadStatus();
        return true;
      } catch (error) {
        showToast(error.message || 'Erro ao conectar ao servidor SMTP.', 'error');
        return false;
      } finally {
        if (submitButton) {
          submitButton.disabled = false;
          submitButton.textContent = 'Salvar e Validar Conexão';
        }
      }
    },

    openTestModal() {
      const backdrop = byId('emailTestBackdrop');
      if (!backdrop) return false;
      const recipientInput = byId('emailTestRecipientInput');
      if (recipientInput) recipientInput.value = '';
      this.rememberSnapshot('test');
      backdrop.classList.remove('hidden');
      presentation?.open?.('emailTest');
      return true;
    },

    closeTestModal() {
      byId('emailTestBackdrop')?.classList.add('hidden');
      initialSnapshots.delete('test');
      presentation?.close?.('emailTest');
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
        submitButton.textContent = '⏳ Enviando e-mail de teste...';
      }
      try {
        const response = await secureFetch('/api/integrations/email/test', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ recipient })
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.message || 'Falha no envio de teste.');
        this.closeTestModal();
        showToast(data.message || `E-mail de teste enviado para ${recipient}!`, 'success');
        await this.loadStatus();
        return true;
      } catch (error) {
        showToast(error.message || 'Erro ao enviar e-mail de teste.', 'error');
        return false;
      } finally {
        if (submitButton) {
          submitButton.disabled = false;
          submitButton.innerHTML = `${presentation?.icon?.('send') || '🚀 '}Enviar Teste Agora`;
        }
      }
    },

    async loadReceivers() {
      const currentUser = getCurrentUser();
      const isAdmin = currentUser?.role === 'master_admin' || currentUser?.role === 'admin';
      const section = byId('emailReceiversSection');
      const addButton = byId('btnAddEmailReceiver');
      if (!isAdmin) {
        section?.classList.add('hidden');
        addButton?.classList.add('hidden');
        return [];
      }
      section?.classList.remove('hidden');
      addButton?.classList.remove('hidden');
      try {
        const response = await secureFetch('/api/integrations/email/receivers', { headers: { Accept: 'application/json' } });
        if (!response.ok) return emailReceivers;
        const data = await response.json().catch(() => ({}));
        emailReceivers = Array.isArray(data.receivers) ? data.receivers : [];
        this.renderReceivers(emailReceivers);
      } catch (error) {
        logError('Erro ao carregar destinatários de e-mail:', error);
      }
      return emailReceivers;
    },

    renderReceivers(receivers = []) {
      const count = byId('emailReceiversCount');
      const list = byId('emailReceiversList');
      if (count) count.textContent = `${receivers.length} cadastrado${receivers.length === 1 ? '' : 's'}`;
      if (!list) return receivers;
      if (!receivers.length) {
        list.innerHTML = '<div class="email-receivers-empty"><p>Nenhum destinatário cadastrado para receber publicações.</p></div>';
        return receivers;
      }
      list.innerHTML = receivers.map(receiver => this.receiverHtml(receiver)).join('');
      return receivers;
    },

    receiverHtml(receiver) {
      const isInternal = receiver.type === 'internal';
      const isUserInactive = isInternal && receiver.userStatus && receiver.userStatus !== 'active';
      const statusBadge = isUserInactive
        ? '<span class="badge-chip email-receiver-status danger">Usuário Inativo</span>'
        : receiver.enabled
          ? '<span class="badge-chip email-receiver-status success">Ativo</span>'
          : '<span class="badge-chip email-receiver-status muted">Inativo</span>';
      const typeBadge = isInternal
        ? '<span class="badge-chip email-receiver-type">Usuário interno</span>'
        : '<span class="badge-chip email-receiver-type">Externo</span>';
      return `
        <div class="email-receiver-item" data-receiver-id="${escapeHtml(receiver.id)}">
          <div class="email-receiver-identity">
            <div class="email-receiver-heading">
              <strong>${escapeHtml(receiver.name || 'Sem nome')}</strong>${typeBadge}${statusBadge}
            </div>
            <span class="email-receiver-address">${escapeHtml(receiver.email || 'Sem e-mail')}</span>
          </div>
          <div class="email-receiver-actions">
            <button class="button ghost" data-receiver-action="toggle" data-receiver-id="${escapeHtml(receiver.id)}" data-receiver-enabled="${receiver.enabled ? 'true' : 'false'}" title="${receiver.enabled ? 'Desativar recebimento' : 'Ativar recebimento'}">${receiver.enabled ? 'Desativar' : 'Ativar'}</button>
            <button class="button ghost" data-receiver-action="edit" data-receiver-id="${escapeHtml(receiver.id)}" title="Editar destinatário">Editar</button>
            <button class="button ghost email-receiver-delete" data-receiver-action="delete" data-receiver-id="${escapeHtml(receiver.id)}" aria-label="Remover destinatário ${escapeHtml(receiver.name || receiver.email || '')}" title="Remover destinatário">${presentation?.icon?.('delete') || '✕'}</button>
          </div>
        </div>`;
    },

    async openReceiverModal(receiverToEdit = null) {
      const backdrop = byId('emailReceiverModalBackdrop');
      if (!backdrop) return false;
      let activeUsers = [];
      try {
        const response = await secureFetch('/api/auth/users', { headers: { Accept: 'application/json' } });
        if (response.ok) {
          const data = await response.json().catch(() => ({}));
          activeUsers = (data.users || []).filter(user => user.status === 'active' && user.email?.trim());
        }
      } catch (error) {
        logError('Falha ao obter lista de usuários:', error);
      }

      const userSelect = byId('receiverUserSelect');
      if (userSelect) {
        userSelect.innerHTML = activeUsers.length
          ? activeUsers.map(user => `<option value="${escapeHtml(user.id)}">${escapeHtml(user.displayName || user.username)} (${escapeHtml(user.email)})</option>`).join('')
          : '<option value="">Nenhum usuário ativo com e-mail cadastrado</option>';
      }

      if (receiverToEdit) {
        if (byId('emailReceiverModalTitle')) byId('emailReceiverModalTitle').textContent = 'Editar destinatário de publicações';
        if (byId('receiverIdInput')) byId('receiverIdInput').value = receiverToEdit.id;
        if (byId('receiverEditTypeInput')) byId('receiverEditTypeInput').value = receiverToEdit.type;
        byId('receiverTypeSelectorContainer')?.classList.add('hidden');
        if (receiverToEdit.type === 'internal') {
          byId('receiverInternalFields')?.classList.remove('hidden');
          byId('receiverExternalFields')?.classList.add('hidden');
          if (userSelect) {
            userSelect.value = receiverToEdit.userId;
            userSelect.disabled = true;
          }
        } else {
          byId('receiverInternalFields')?.classList.add('hidden');
          byId('receiverExternalFields')?.classList.remove('hidden');
          if (byId('receiverNameInput')) byId('receiverNameInput').value = receiverToEdit.name || '';
          if (byId('receiverEmailInput')) byId('receiverEmailInput').value = receiverToEdit.email || '';
        }
        if (byId('receiverEnabledInput')) byId('receiverEnabledInput').checked = Boolean(receiverToEdit.enabled);
      } else {
        if (byId('emailReceiverModalTitle')) byId('emailReceiverModalTitle').textContent = 'Adicionar destinatário de publicações';
        if (byId('receiverIdInput')) byId('receiverIdInput').value = '';
        if (byId('receiverEditTypeInput')) byId('receiverEditTypeInput').value = '';
        byId('receiverTypeSelectorContainer')?.classList.remove('hidden');
        if (byId('receiverTypeInternal')) byId('receiverTypeInternal').checked = true;
        if (byId('receiverTypeExternal')) byId('receiverTypeExternal').checked = false;
        byId('receiverInternalFields')?.classList.remove('hidden');
        byId('receiverExternalFields')?.classList.add('hidden');
        if (userSelect) {
          userSelect.disabled = false;
          if (activeUsers.length) userSelect.selectedIndex = 0;
        }
        if (byId('receiverNameInput')) byId('receiverNameInput').value = '';
        if (byId('receiverEmailInput')) byId('receiverEmailInput').value = '';
        if (byId('receiverEnabledInput')) byId('receiverEnabledInput').checked = true;
      }
      this.rememberSnapshot('receiver');
      backdrop.classList.remove('hidden');
      if (documentRef?.body) documentRef.body.style.overflow = 'hidden';
      presentation?.open?.('emailReceiver');
      return true;
    },

    closeReceiverModal() {
      byId('emailReceiverModalBackdrop')?.classList.add('hidden');
      initialSnapshots.delete('receiver');
      if (byId('modalBackdrop')?.classList.contains('hidden') && documentRef?.body) documentRef.body.style.overflow = '';
      presentation?.close?.('emailReceiver');
    },

    async submitReceiver(event) {
      event?.preventDefault?.();
      const submitButton = byId('receiverSubmitBtn');
      const id = byId('receiverIdInput')?.value;
      const editType = byId('receiverEditTypeInput')?.value;
      const isEditing = Boolean(id);
      const isInternal = isEditing ? editType === 'internal' : Boolean(byId('receiverTypeInternal')?.checked);
      const enabled = Boolean(byId('receiverEnabledInput')?.checked);
      if (submitButton) {
        submitButton.disabled = true;
        submitButton.textContent = '⏳ Salvando...';
      }
      try {
        if (isEditing) {
          const payload = { enabled };
          if (!isInternal) {
            payload.name = byId('receiverNameInput')?.value?.trim();
            payload.email = byId('receiverEmailInput')?.value?.trim();
          }
          const response = await secureFetch(`/api/integrations/email/receivers/${encodeURIComponent(id)}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify(payload)
          });
          const data = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(data.message || 'Falha ao atualizar destinatário.');
          showToast('Destinatário atualizado com sucesso!', 'success');
        } else {
          const payload = { type: isInternal ? 'internal' : 'external', enabled };
          if (isInternal) {
            payload.userId = byId('receiverUserSelect')?.value;
            if (!payload.userId) throw new Error('Selecione um usuário ativo.');
          } else {
            payload.name = byId('receiverNameInput')?.value?.trim();
            payload.email = byId('receiverEmailInput')?.value?.trim();
            if (!payload.name) throw new Error('Informe o nome do destinatário.');
            if (!payload.email) throw new Error('Informe o e-mail do destinatário.');
          }
          const response = await secureFetch('/api/integrations/email/receivers', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify(payload)
          });
          const data = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(data.message || 'Falha ao cadastrar destinatário.');
          showToast('Destinatário cadastrado com sucesso!', 'success');
        }
        this.closeReceiverModal();
        await this.loadReceivers();
        return true;
      } catch (error) {
        showToast(error.message || 'Erro ao processar destinatário.', 'error');
        return false;
      } finally {
        if (submitButton) {
          submitButton.disabled = false;
          submitButton.textContent = 'Salvar Destinatário';
        }
      }
    },

    async toggleReceiver(id, currentEnabled) {
      if (!id) return false;
      try {
        const response = await secureFetch(`/api/integrations/email/receivers/${encodeURIComponent(id)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ enabled: !currentEnabled })
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.message || 'Falha ao alterar status.');
        showToast(`Destinatário ${!currentEnabled ? 'ativado' : 'desativado'}.`, 'success');
        await this.loadReceivers();
        return true;
      } catch (error) {
        showToast(error.message || 'Erro ao alterar status.', 'error');
        return false;
      }
    },

    async deleteReceiver(id) {
      if (!id || !confirmFn('Remover este destinatário das notificações de publicações?')) return false;
      try {
        const response = await secureFetch(`/api/integrations/email/receivers/${encodeURIComponent(id)}`, {
          method: 'DELETE', headers: { Accept: 'application/json' }
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.message || 'Falha ao remover destinatário.');
        showToast('Destinatário removido.', 'success');
        await this.loadReceivers();
        return true;
      } catch (error) {
        showToast(error.message || 'Erro ao remover destinatário.', 'error');
        return false;
      }
    }
  };

  return feature;
}
