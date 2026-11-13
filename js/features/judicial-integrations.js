const plural = (count, singular, pluralForm) => `${count} ${Number(count) === 1 ? singular : pluralForm}`;
const iconSvg = name => `<svg class="atrium-icon" aria-hidden="true" focusable="false"><use href="assets/icons/atrium-ui-icons.svg?v=3.1.0#atrium-icon-${name}"></use></svg>`;

export function createJudicialIntegrationsFeature({
  documentRef = globalThis.document,
  windowRef = globalThis.window,
  secureFetch,
  escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c])),
  showToast = () => {},
  audit = () => {},
  onSyncAll = async () => {},
  warn = () => {},
  confirmFn = message => windowRef?.confirm?.(message) ?? false,
  presentation = null,
  transitionPageContent = (_documentRef, _selectors, _direction, render) => render(),
  onEprocStatus = () => {},
  pollIntervalMs = 1800,
  sleepFn = ms => new Promise(resolve => setTimeout(resolve, ms))
} = {}) {
  let judicialStatus = null;
  let initialized = false;
  let pendingTotpAccounts = [];
  let assistedSessionCheckTimer = null;
  let initialFormSnapshot = '';
  let eprocSyncJobId = null;
  let eprocSyncPollPromise = null;
  const byId = id => documentRef.getElementById(id);
  let pjeCommunicationsPage = 1;
  let pjeStatusCache = null;
  let pjeSectionHydrated = false;
  // Shell em abas do modal judicial: apresentacao, nao fonte de verdade. Cobertura,
  // credenciais e preferencias deixam de disputar o mesmo scroll.
  const jcoTabOrder = ['coverage', 'credentials', 'preferences'];
  const jcoTabIds = { coverage: 'jcoTabCoverage', credentials: 'jcoTabCredentials', preferences: 'jcoTabPreferences' };
  const jcoPanelIds = { coverage: 'jcoPanelCoverage', credentials: 'jcoPanelCredentials', preferences: 'jcoPanelPreferences' };
  let activeJcoTab = 'coverage';
  let jcoDrawerTrigger = null;
  const applyJcoTab = name => {
    if (!jcoTabOrder.includes(name)) return false;
    activeJcoTab = name;
    for (const tab of jcoTabOrder) {
      const selected = tab === name;
      const button = byId(jcoTabIds[tab]);
      if (button) {
        button.setAttribute('aria-selected', selected ? 'true' : 'false');
        button.tabIndex = selected ? 0 : -1;
      }
      const panel = byId(jcoPanelIds[tab]);
      if (panel) panel.hidden = !selected;
    }
    return true;
  };
  const handleJcoTabKeydown = event => {
    const index = jcoTabOrder.indexOf(activeJcoTab);
    if (index < 0) return;
    const lastIndex = jcoTabOrder.length - 1;
    let next = null;
    if (event.key === 'ArrowRight') next = jcoTabOrder[(index + 1) % jcoTabOrder.length];
    else if (event.key === 'ArrowLeft') next = jcoTabOrder[(index - 1 + jcoTabOrder.length) % jcoTabOrder.length];
    else if (event.key === 'Home') next = jcoTabOrder[0];
    else if (event.key === 'End') next = jcoTabOrder[lastIndex];
    if (!next) return;
    event.preventDefault();
    applyJcoTab(next);
    byId(jcoTabIds[next])?.focus?.();
  };
  const pjeFamilyLabels = { standard: 'PJe Standard', trabalhista: 'PJe Trabalhista', eleitoral: 'PJe Eleitoral', militar: 'PJe Militar', 'pje-cor': 'PJeCor' };
  const pjeRuntimeLabels = { auto: 'Automático', server: 'Servidor', local_sidecar: 'Runtime indisponível' };
  const pjeJobStatusLabels = { QUEUED: 'Na fila', RUNNING: 'Sincronizando', COMPLETED: 'Concluído', UNCHANGED: 'Sem alterações', SKIPPED_UNRELIABLE: 'Coleta não confiável', DEGRADED: 'Degradado', ERROR: 'Erro' };
  const pjeCommunicationStatusLabels = { new: 'Nova', in_review: 'Em análise', treated: 'Tratada', discarded: 'Descartada' };
  const pjeErrorMessages = {
    'AUTH-TOTP-REQUIRED': 'Segundo fator PDPJ ainda não configurado para este escritório.',
    'AUTH-HELPER-REQUIRED': 'O assinador PJeOffice não está disponível no runtime deste portal.',
    'AUTH-HELPER-REJECTED': 'O assinador PJeOffice recusou a autenticação deste portal.',
    'AUTH-MANUAL-REQUIRED': 'O portal exige confirmação manual no momento do login.',
    'PROCESS_RESTARTED': 'A execução foi interrompida por um reinício do servidor.',
    'PJE-RUNTIME-UNAVAILABLE': 'O runtime necessário não está disponível para este portal.'
  };
  const pjeErrorText = code => pjeErrorMessages[code] || 'A sincronização não foi concluída.';
  const pjeFinalStatuses = ['COMPLETED', 'UNCHANGED', 'SKIPPED_UNRELIABLE', 'DEGRADED', 'ERROR'];
  const readPjeStatus = async () => {
    const response = await secureFetch('/api/integrations/judicial/pje', { headers: { Accept: 'application/json' } });
    if (!response?.ok) return null;
    return response.json().catch(() => null);
  };
  const pjePortalLabel = portalId => {
    if (!portalId) return '-';
    const cached = (pjeStatusCache?.portals || []).find(item => item.id === portalId);
    if (cached?.name) return cached.name;
    const known = [...(judicialStatus?.portals || []), ...(judicialStatus?.managedCoverage || [])].find(item => item.id === portalId);
    return known?.name || portalId;
  };
  const refreshPjeSection = async () => {
    const grid = byId('pjePortalsGrid');
    if (!grid) return;
    const data = await readPjeStatus();
    if (!data) {
      grid.innerHTML = '<p>Não foi possível carregar o status PJe agora.</p>';
      return;
    }
    pjeStatusCache = data;
    const config = data.config || {};
    if (!pjeSectionHydrated) {
      const enabledInput = byId('pjeEnabledToggle');
      if (enabledInput) enabledInput.checked = config.pjeEnabled === true;
      const autoInput = byId('pjeAutomaticSyncToggle');
      if (autoInput) autoInput.checked = config.automaticSyncEnabled === true;
      const intervalInput = byId('pjeSyncIntervalInput');
      if (intervalInput && config.syncIntervalMinutes) intervalInput.value = String(config.syncIntervalMinutes);
      const runtimeSelect = byId('pjeRuntimeSelect');
      if (runtimeSelect && config.runtimePreference) runtimeSelect.value = config.runtimePreference;
      pjeSectionHydrated = true;
    }
    const portals = (data.portals || []).filter(portal => portal.enabled || ['pje-tjmt-1g', 'pje-tjmt-2g', 'pje-trt4-1g'].includes(portal.id));
    if (!portals.length) {
      grid.innerHTML = '<p>Nenhum portal PJe habilitado. Ative um portal abaixo para sincronizar.</p>';
      return;
    }
    grid.innerHTML = portals.map(portal => {
      const last = portal.lastSync;
      const counts = last ? 'Acervo: ' + (last.acervo || '-') + ' · Expedientes: ' + (last.expedientes || '-') : 'Sem sincronização ainda';
      const familyLabel = pjeFamilyLabels[portal.layoutFamily] || escapeHtml(portal.layoutFamily || 'PJe');
      const runtimeLabel = pjeRuntimeLabels[portal.runtimePreference] || escapeHtml(portal.runtimePreference || 'auto');
      const jobStatusLabel = last ? (pjeJobStatusLabels[last.status] || last.status) : '';
      const lastLine = last ? 'Último sync: ' + (last.finishedAt ? new Date(last.finishedAt).toLocaleString('pt-BR') : '-') + ' · ' + jobStatusLabel : '';
      const errorLine = last?.errorCode
        ? '<div class="pje-portal-error" title="' + escapeHtml(last.errorCode + (last.errorStage ? ' (estágio ' + last.errorStage + ')' : '')) + '">' + escapeHtml(pjeErrorText(last.errorCode)) + '</div>'
        : '';
      return '<div class="v2-eproc-portal-card pje-portal-card" data-portal="' + escapeHtml(portal.id) + '" data-status="' + escapeHtml(last?.status || '') + '">'
        + '<strong>' + escapeHtml(portal.name || portal.id) + '</strong>'
        + '<div data-role="pje-status">' + escapeHtml(portal.statusLabel || 'Não verificado') + ' · ' + escapeHtml(familyLabel) + ' · ' + escapeHtml(runtimeLabel) + '</div>'
        + '<div>' + escapeHtml(counts) + '</div>'
        + '<div>' + escapeHtml(lastLine) + '</div>'
        + errorLine
        + '<div class="pje-portal-card-actions">'
        + '<button type="button" class="button ghost" data-pje-sync="' + escapeHtml(portal.id) + '">Sincronizar agora</button>'
        + '<button type="button" class="button ghost" data-pje-toggle="' + escapeHtml(portal.id) + '">' + (portal.enabled ? 'Desabilitar' : 'Habilitar') + '</button>'
        + '</div></div>';
    }).join('');
    void renderPjeCommunications();
  };
  const savePjeConfig = async patch => {
    const response = await secureFetch('/api/integrations/judicial/pje/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(patch)
    });
    const data = await response.json().catch(() => null);
    if (!response?.ok || !data?.ok) {
      showToast(data?.error || 'Não foi possível salvar a configuração PJe.', 'error');
      return null;
    }
    return data.config;
  };
  const startPjeSyncFromUi = async portalId => {
    if (!portalId) return;
    const response = await secureFetch('/api/integrations/judicial/pje/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ portalId, runtime: byId('pjeRuntimeSelect')?.value || 'auto' })
    });
    const data = await response.json().catch(() => null);
    if (!response?.ok || !data?.jobId) {
      showToast(data?.error || 'Não foi possível iniciar a sincronização PJe.', 'error');
      return;
    }
    showToast(data.joinedExisting ? 'Sincronização PJe já em andamento; acompanhando o job existente.' : 'Sincronização PJe iniciada.', 'info');
    const card = documentRef.querySelector('[data-portal="' + portalId + '"]');
    const cardStatus = card?.querySelector?.('[data-role="pje-status"]');
    if (cardStatus) cardStatus.textContent = 'Sincronizando…';
    let job = null;
    for (let attempt = 0; attempt < 400; attempt += 1) {
      await sleepFn(pollIntervalMs);
      const statusResponse = await secureFetch('/api/integrations/judicial/pje/jobs/' + encodeURIComponent(data.jobId), { headers: { Accept: 'application/json' } });
      const payload = await statusResponse.json().catch(() => null);
      job = payload?.job || null;
      if (!job || pjeFinalStatuses.includes(job.status)) break;
    }
    if (!job || !pjeFinalStatuses.includes(job.status)) {
      showToast('Sincronização PJe ainda em execução; atualize para ver o resultado.', 'warning');
    } else if (job.status === 'ERROR') {
      showToast(pjeErrorText(job.errorCode) + (job.errorCode ? ' (' + job.errorCode + ')' : ''), 'error');
    } else if (job.status === 'SKIPPED_UNRELIABLE') {
      showToast('Coleta PJe não confiável: snapshot/importação não foram aplicados.', 'warning');
    } else if (job.status === 'UNCHANGED') {
      showToast('PJe sincronizado sem alterações reais.', 'success');
    } else {
      showToast('Sincronização PJe concluída (' + (job.collected ?? 0) + ' expedientes).', 'success');
    }
    await refreshPjeSection();
  };
  const renderPjeCommunications = async ({ page = pjeCommunicationsPage, direction = 0 } = {}) => {
    const list = byId('pjeCommunicationsList');
    if (!list) return;
    const pager = byId('pjeCommunicationsPager');
    const restorePagerFocus = direction && pager?.contains(documentRef.activeElement);
    pjeCommunicationsPage = Math.max(1, Number(page) || 1);
    const params = new URLSearchParams({ page: String(pjeCommunicationsPage), pageSize: '10' });
    const portalFilter = byId('pjeCommunicationsPortal')?.value;
    const statusFilter = byId('pjeCommunicationsStatus')?.value;
    if (portalFilter) params.set('portalId', portalFilter);
    if (statusFilter) params.set('status', statusFilter);
    if (byId('pjeCommunicationsWithDeadline')?.checked) params.set('hasSourceDeadline', 'true');
    const response = await secureFetch('/api/judicial/communications?' + params.toString(), { headers: { Accept: 'application/json' } });
    const data = await response.json().catch(() => null);
    if (!response?.ok || !data?.ok || !Array.isArray(data?.items)) {
      list.innerHTML = '<p>Não foi possível carregar os expedientes.</p>';
      return;
    }
    const portalSelect = byId('pjeCommunicationsPortal');
    if (portalSelect && portalSelect.options.length <= 1 && pjeStatusCache?.portals) {
      for (const portal of pjeStatusCache.portals) {
        const option = documentRef.createElement('option');
        option.value = portal.id;
        option.textContent = portal.name || portal.id;
        portalSelect.appendChild(option);
      }
    }
    await transitionPageContent(documentRef, { v2: '#pjeCommunicationsList .v2-table tbody' }, direction, () => {
      if (!data.items.length) {
        list.innerHTML = '<p>Nenhum expediente capturado ainda.</p>';
      } else {
        list.innerHTML = '<table class="v2-table"><thead><tr>'
          + '<th>Processo</th><th>Portal</th><th>Situação</th><th>Órgão</th><th>Ciência informada pela fonte</th><th>Prazo informado pelo portal</th><th>Última captura</th><th>Status</th>'
          + '</tr></thead><tbody>'
          + data.items.map(item => '<tr>'
            + '<td>' + escapeHtml(item.processNumber || '-') + '</td>'
            + '<td>' + escapeHtml(pjePortalLabel(item.portalId)) + '</td>'
            + '<td>' + escapeHtml((item.situationMemberships || []).join(', ') || '-') + '</td>'
            + '<td>' + escapeHtml(item.courtUnit || '-') + '</td>'
            + '<td>' + escapeHtml(item.sourceReportedScienceAt || '-') + '</td>'
            + '<td>' + escapeHtml(item.sourceReportedDeadlineAt || '-') + '</td>'
            + '<td>' + escapeHtml(item.lastSeenAt ? new Date(item.lastSeenAt).toLocaleString('pt-BR') : '-') + '</td>'
            + '<td>' + escapeHtml(pjeCommunicationStatusLabels[item.status] || item.status || '-') + '</td>'
            + '</tr>').join('')
          + '</tbody></table>';
      }
      if (pager) {
        const totalPages = Math.max(1, Math.ceil(data.total / data.pageSize));
        pager.innerHTML = '<button type="button" class="button ghost" data-pje-page="-1"' + (pjeCommunicationsPage <= 1 ? ' disabled' : '') + '>Anterior</button> '
          + '<span class="pje-communications-page-label">Página ' + pjeCommunicationsPage + ' de ' + totalPages + ' (' + data.total + ')</span> '
          + '<button type="button" class="button ghost" data-pje-page="1"' + (pjeCommunicationsPage >= totalPages ? ' disabled' : '') + '>Próxima</button>';
        if (restorePagerFocus) {
          const preferred = pager.querySelector(`[data-pje-page="${direction}"]:not([disabled])`);
          (preferred || pager.querySelector('[data-pje-page]:not([disabled])'))?.focus({ preventScroll: true });
        }
      }
    });
  };
  const eprocStateLabel = state => ({
    PENDING: 'Pendente',
    RUNNING: 'Em andamento',
    COMPLETED: 'Concluída',
    COMPLETED_WITH_WARNINGS: 'Concluída com ressalvas',
    PARTIAL: 'Parcial',
    ERROR: 'Erro',
    CANCELLED: 'Cancelada'
  })[state] || state || 'Em andamento';
  const eprocPhaseLabel = phase => {
    if (!phase) return '';
    const normalized = String(phase).trim().toLowerCase();
    return ({
      queued: 'Na fila',
      auth: 'Autenticação',
      connecting: 'Conexão segura',
      collecting: 'Coleta',
      processing_processes: 'Processamento',
      completed: 'Concluída',
      partial_error: 'Erro parcial'
    })[normalized] || normalized.replaceAll('_', ' ');
  };
  const eprocPortalLabel = portalId => {
    if (!portalId) return 'Sistemas judiciais';
    const portal = [...(judicialStatus?.portals || []), ...(judicialStatus?.managedCoverage || [])]
      .find(item => item.id === portalId);
    return portal?.name || portalId;
  };
  const readEprocSyncStatus = async () => {
    try {
      const response = await secureFetch('/api/integrations/eproc/sync/status', { headers: { Accept: 'application/json' } });
      if (!response?.ok) return { available: false, active: false, job: null };
      const data = await response.json().catch(() => null);
      if (!data) return { available: false, active: false, job: null };
      return {
        available: true,
        active: data.active === true || data.jobStatus?.active === true,
        job: data.job || data.jobStatus?.job || null
      };
    } catch {
      return { available: false, active: false, job: null };
    }
  };
  const readEprocSyncStatusWithRetry = async (attempts = 3) => {
    let snapshot = null;
    for (let attempt = 0; attempt < attempts; attempt++) {
      snapshot = await readEprocSyncStatus();
      if (snapshot.available) return snapshot;
      if (attempt < attempts - 1) await sleepFn(pollIntervalMs);
    }
    return snapshot;
  };

  const feature = {
    get status() {
      return judicialStatus;
    },

    set status(value) {
      judicialStatus = value;
    },

    get initialized() {
      return initialized;
    },

    switchJcoTab(name) {
      return applyJcoTab(name);
    },

    init() {
      if (initialized) return false;
      initialized = true;
      presentation?.init?.();
      byId('certificateGuideButton')?.addEventListener('click', () => feature.open());
      byId('judicialSetupClose')?.addEventListener('click', () => feature.requestClose());
      byId('judicialSetupBackdrop')?.addEventListener('click', event => {
        if (event.target === byId('judicialSetupBackdrop')) feature.requestClose();
      });
      byId('certificateFileInput')?.addEventListener('change', event => {
        const fileName = byId('certificateFileName');
        if (fileName) fileName.textContent = event.target.files[0]?.name || 'Selecionar certificado';
        event.target.closest('.file-picker')?.classList.toggle('has-file', Boolean(event.target.files[0]));
      });
      byId('certificateSetupForm')?.addEventListener('submit', event => feature.saveCertificate(event));
      byId('portalQrInput')?.addEventListener('change', event => {
        event.target.closest('.file-picker')?.classList.toggle('has-file', Boolean(event.target.files[0]));
        feature.readPortalQr(event.target.files[0]);
      });
      byId('portalTotpForm')?.addEventListener('submit', event => feature.savePortalTotp(event));
      byId('removePortalTotpButton')?.addEventListener('click', () => feature.removePortalTotp());
      byId('portalAccountForm')?.addEventListener('submit', event => feature.savePortalAccount(event));
      byId('removePortalAccountButton')?.addEventListener('click', () => feature.removePortalAccount());
      byId('accountPortalSelectAll')?.addEventListener('click', () => feature.setAllAccountPortals(true));
      byId('accountPortalClearAll')?.addEventListener('click', () => feature.setAllAccountPortals(false));
      byId('resetJudicialConnectionsButton')?.addEventListener('click', () => feature.resetConnections());
      byId('savePortalCoverageButton')?.addEventListener('click', () => feature.savePortalCoverage());
      byId('syncJudicialNowButton')?.addEventListener('click', () => feature.syncEprocNow());
      byId('btnRunA1Sweep')?.addEventListener('click', () => feature.runA1Sweep());
      byId('btnSyncEprocNow')?.addEventListener('click', () => feature.syncEprocNow());
      for (const tab of jcoTabOrder) {
        const button = byId(jcoTabIds[tab]);
        button?.addEventListener('click', () => applyJcoTab(tab));
        button?.addEventListener('keydown', handleJcoTabKeydown);
      }
  byId('pjePortalsGrid')?.addEventListener('click', event => {
    const syncButton = event.target.closest('[data-pje-sync]');
    if (syncButton) {
      void startPjeSyncFromUi(syncButton.getAttribute('data-pje-sync'));
      return;
    }
    const toggleButton = event.target.closest('[data-pje-toggle]');
    if (toggleButton) {
      const portalId = toggleButton.getAttribute('data-pje-toggle');
      const current = new Set(pjeStatusCache?.config?.enabledPortals || []);
      if (current.has(portalId)) current.delete(portalId); else current.add(portalId);
      void savePjeConfig({ enabledPortals: [...current] }).then(config => {
        if (config) {
          showToast('Configuração PJe atualizada.', 'success');
          feature.rememberSnapshot();
          void refreshPjeSection();
        }
      });
    }
  });
  byId('pjeConfigSave')?.addEventListener('click', () => {
    void savePjeConfig({
      pjeEnabled: byId('pjeEnabledToggle')?.checked === true,
      automaticSyncEnabled: byId('pjeAutomaticSyncToggle')?.checked === true,
      runtimePreference: byId('pjeRuntimeSelect')?.value || 'auto',
      syncIntervalMinutes: Number(byId('pjeSyncIntervalInput')?.value || 360)
    }).then(config => {
      if (config) {
        showToast('Configuração PJe salva.', 'success');
        feature.rememberSnapshot();
        void refreshPjeSection();
      }
    });
  });
  byId('pjeCommunicationsFilters')?.addEventListener('change', () => void renderPjeCommunications({ page: 1 }));
  byId('pjeCommunicationsPager')?.addEventListener('click', event => {
    const step = Number(event.target.closest('[data-pje-page]')?.getAttribute('data-pje-page') || 0);
    if (step) void renderPjeCommunications({ page: pjeCommunicationsPage + step, direction: step });
  });
  byId('eprocPortalsGrid')?.addEventListener('click', event => {
        const configBtn = event.target.closest('[data-open-portal-config]');
        if (configBtn) {
          void feature.openPortalConfiguration(configBtn.dataset.openPortalConfig);
        }
      });
      const closeSyncModal = () => {
        const modal = byId('eprocSyncModalBackdrop');
        if (modal) {
          modal.classList.add('hidden');
          modal.setAttribute?.('aria-hidden', 'true');
        }
      };
      const hideSyncModal = () => {
        closeSyncModal();
      };
      byId('eprocSyncModalClose')?.addEventListener('click', hideSyncModal);
      byId('eprocSyncModalMinimize')?.addEventListener('click', hideSyncModal);
      byId('eprocSyncModalDone')?.addEventListener('click', closeSyncModal);
      byId('portalCoverageList')?.addEventListener('click', event => {
        const totpButton = event.target.closest('[data-configure-totp]');
        if (totpButton) {
          byId('totpPortalSelect').value = totpButton.dataset.configureTotp;
          byId('totpSetupSection').scrollIntoView({ behavior: 'smooth', block: 'center' });
          byId('portalQrInput').focus();
          return;
        }
        const accountButton = event.target.closest('[data-configure-account]');
        if (accountButton) {
          const targetPortal = String(accountButton.dataset.configureAccount || '');
          const list = byId('accountPortalList');
          if (list?.querySelectorAll) {
            feature.setAllAccountPortals(false);
            const input = list.querySelector(`[data-account-portal="${targetPortal}"]`);
            if (input) input.checked = true;
          }
          if (byId('accountPortalSelect')) byId('accountPortalSelect').value = targetPortal;
          byId('portalAccountSetupSection').scrollIntoView({ behavior: 'smooth', block: 'center' });
          byId('portalAccountUsername').focus();
          return;
        }
        const reconnectButton = event.target.closest('[data-reconnect-portal]');
        if (reconnectButton) feature.reconnectPortal(reconnectButton.dataset.reconnectPortal, reconnectButton);
      });
      const dispatchPortalAction = actionBtn => {
        if (!actionBtn) return;
        const action = actionBtn.dataset.portalAction;
        const portalId = actionBtn.dataset.portalId;
        if (action === 'reconnect') {
          void feature.reconnectPortal(portalId, actionBtn);
        } else if (action === 'configure') {
          void feature.openPortalConfiguration(portalId);
        } else if (action === 'sync') {
          if (feature.isEprocPortal(portalId)) void feature.syncEprocNow(null, { portalIds: [portalId] });
          else if (feature.isPjePortal(portalId)) void startPjeSyncFromUi(portalId);
          else void feature.reconnectPortal(portalId, actionBtn);
        }
      };
      byId('managedCoverageList')?.addEventListener('click', event => {
        const detailBtn = event.target.closest('[data-portal-detail]');
        if (detailBtn) {
          void feature.openPortalDrawer(detailBtn.dataset.portalDetail, detailBtn);
          return;
        }
        dispatchPortalAction(event.target.closest('[data-portal-action]'));
      });
      byId('jcoPortalDrawer')?.addEventListener('click', event => {
        if (event.target.closest('#jcoDrawerClose')) {
          feature.closePortalDrawer();
          return;
        }
        dispatchPortalAction(event.target.closest('[data-portal-action]'));
      });
      // Escape fecha o drawer antes do modal (o handler global do portal fecha o modal).
      byId('judicialSetupBackdrop')?.addEventListener('keydown', event => {
        if (event.key === 'Escape' && !byId('jcoPortalDrawer')?.hidden) {
          event.preventDefault();
          event.stopPropagation();
          feature.closePortalDrawer();
        }
      });
      return true;
    },

    async open() {
      byId('judicialSetupBackdrop')?.classList.remove('hidden');
      documentRef.body.style.overflow = 'hidden';
      presentation?.open?.();
      applyJcoTab('coverage');
      await feature.refreshStatus(true);
      void feature.restoreEprocSync();
      await refreshPjeSection();
      feature.rememberSnapshot();
    },

    formSnapshot() {
      const fieldIds = [
        'certificateFileInput', 'certificatePassphrase', 'portalQrInput', 'totpPortalSelect',
        'portalTotpSecret', 'portalTotpCode', 'portalTotpAccountSelect'
      ];
      const fields = fieldIds.map(id => ({ id, value: byId(id)?.value || '' }));
      const portals = [...(documentRef.querySelectorAll?.('[data-portal-enabled]') || [])]
        .map(input => ({ value: input.value || '', checked: Boolean(input.checked) }));
      const pje = {
        enabled: byId('pjeEnabledToggle')?.checked === true,
        automaticSyncEnabled: byId('pjeAutomaticSyncToggle')?.checked === true,
        syncIntervalMinutes: byId('pjeSyncIntervalInput')?.value || '',
        runtimePreference: byId('pjeRuntimeSelect')?.value || ''
      };
      return JSON.stringify({ fields, portals, pje });
    },

    rememberSnapshot() {
      initialFormSnapshot = feature.formSnapshot();
    },

    hasUnsavedChanges() {
      return Boolean(initialFormSnapshot && feature.formSnapshot() !== initialFormSnapshot);
    },

    requestClose() {
      const backdrop = byId('judicialSetupBackdrop');
      if (!backdrop || backdrop.classList.contains('hidden')) return true;
      if (feature.hasUnsavedChanges()
        && !confirmFn('Há alterações judiciais não salvas. Deseja realmente fechar e descartá-las?')) return false;
      feature.close();
      return true;
    },

    close() {
      const backdrop = byId('judicialSetupBackdrop');
      if (!backdrop || backdrop.classList.contains('hidden')) return;
      windowRef.clearTimeout(assistedSessionCheckTimer);
      assistedSessionCheckTimer = null;
      backdrop.classList.add('hidden');
      if (byId('modalBackdrop')?.classList.contains('hidden')) documentRef.body.style.overflow = '';
      feature.clearSecrets();
      initialFormSnapshot = '';
      presentation?.close?.();
    },

    clearSecrets({ clearQr = false } = {}) {
      if (byId('portalTotpSecret')) byId('portalTotpSecret').value = '';
      if (byId('portalTotpCode')) byId('portalTotpCode').value = '';
      if (byId('certificatePassphrase')) byId('certificatePassphrase').value = '';
      if (byId('portalAccountPassword')) byId('portalAccountPassword').value = '';
      if (clearQr && byId('portalQrInput')) byId('portalQrInput').value = '';
      if (clearQr) byId('portalQrInput')?.closest('.file-picker')?.classList.remove('has-file');
      pendingTotpAccounts = [];
      const accountField = byId('portalTotpAccountField');
      const accountSelect = byId('portalTotpAccountSelect');
      accountField?.classList?.add('hidden');
      if (accountSelect) accountSelect.innerHTML = '<option value="">Selecione a conta</option>';
    },

    async refreshStatus(showError = false) {
      try {
        const response = await secureFetch('/api/integrations/judicial', { headers: { Accept: 'application/json' } });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.message || 'Não foi possível verificar o certificado.');
        judicialStatus = data;
        feature.renderStatus();
        await feature.refreshEprocStatus();
        return data;
      } catch (error) {
        if (showError) showToast(error.message, 'error');
        const chip = byId('certificateIntegrationStatus');
        if (chip) {
          chip.textContent = 'Servidor precisa ser reiniciado';
          chip.className = 'status-chip warning';
        }
        return null;
      }
    },

    renderStatus() {
      const status = judicialStatus;
      if (!status) return;
      const certificate = status.certificate || {};
      const portals = status.portals || [];
      feature.renderManagedCoverage();
      const totpCount = portals.filter(portal => portal.totpConfigured).length;
      const setStatusIcon = (id, ok) => {
        const element = byId(id);
        if (element) {
          element.className = `setup-status-icon ${ok ? 'ok' : 'off'}`;
          element.innerHTML = presentation?.icon?.(ok ? 'check' : 'warning') || iconSvg(ok ? 'check' : 'warning');
        }
      };
      setStatusIcon('setupCertificateIcon', certificate.valid);
      setStatusIcon('setupPjeOfficeIcon', status.pjeOffice?.available);
      setStatusIcon('setupTotpIcon', totpCount > 0);

      const certificateStatus = byId('setupCertificateStatus');
      if (certificateStatus) certificateStatus.textContent = certificate.valid ? 'A1 validado no teste' : certificate.accessible ? 'Senha ou contêiner inválido' : 'Selecione o PFX';
      const pjeStatus = byId('setupPjeOfficeStatus');
      if (pjeStatus) pjeStatus.textContent = status.pjeOffice?.available ? 'Aplicativo oficial disponível' : 'Abra o PJeOffice Pro';
      const totpStatus = byId('setupTotpStatus');
      if (totpStatus) totpStatus.textContent = totpCount ? `${plural(totpCount, 'portal vinculado', 'portais vinculados')}` : 'Nenhum QR vinculado';

      const fileBadge = byId('certificateFileBadge');
      if (fileBadge) {
        fileBadge.textContent = certificate.valid ? (certificate.status === 'operational' ? 'A1 OPERATIONAL' : 'Certificado Ativo') : 'Não configurado';
        fileBadge.className = `status-chip ${certificate.valid ? 'connected' : 'muted'}`;
      }

      const activeCard = byId('a1ActiveCard');
      const certificateForm = byId('certificateSetupForm');
      const sandboxButton = byId('btnRunA1Sandbox');
      const replaceButton = byId('btnReplaceCertToggle');
      const holderName = byId('a1HolderName');
      const documentAndIssuer = byId('a1DocAndIssuer');
      if (sandboxButton) sandboxButton.onclick = () => feature.testA1Sandbox();
      if (replaceButton && certificateForm && activeCard) {
        replaceButton.onclick = () => {
          certificateForm.classList.toggle('hidden');
          replaceButton.textContent = certificateForm.classList.contains('hidden') ? 'Substituir' : 'Cancelar';
        };
      }

      if (certificate.valid || certificate.accessible) {
        activeCard?.classList.remove('hidden');
        certificateForm?.classList.add('hidden');
        if (holderName) holderName.textContent = certificate.summary?.holder || certificate.fileName || 'Certificado A1 Ativo';
        if (documentAndIssuer) {
          documentAndIssuer.textContent = `${certificate.summary?.documentMasked ? 'CPF ' + certificate.summary.documentMasked + ' · ' : ''}${certificate.summary?.issuer ? certificate.summary.issuer.split(',')[0] : 'ICP-Brasil'}${certificate.summary?.notAfter ? ' · Vigente até ' + new Date(certificate.summary.notAfter).toLocaleDateString('pt-BR') : ''}`;
        }
      } else {
        activeCard?.classList.add('hidden');
        certificateForm?.classList.remove('hidden');
      }

      const hasManagedCoverage = Array.isArray(status.managedCoverage);
      const managed = status.managedCoverage || [];
      const connected = managed.filter(item => item.connectivityState === 'connected').length;
      const actionRequired = managed.filter(item => ['action_required', 'human_action_required', 'expired'].includes(item.connectivityState)).length;
      const integrationChip = byId('certificateIntegrationStatus');
      if (integrationChip) {
        integrationChip.textContent = !hasManagedCoverage
          ? certificate.valid ? `A1 Operacional · ${totpCount} 2FA` : 'Configuração necessária'
          : actionRequired ? `${plural(actionRequired, 'ação necessária', 'ações necessárias')}` : connected ? `${plural(connected, 'fonte conectada', 'fontes conectadas')}` : certificate.valid ? 'Credencial disponível' : 'Configuração necessária';
        integrationChip.className = `status-chip ${actionRequired ? 'warning' : connected || certificate.valid ? 'connected' : 'warning'}`;
      }
      const integrationDetail = byId('certificateIntegrationDetail');
      if (integrationDetail) {
        integrationDetail.textContent = !hasManagedCoverage ? (certificate.valid
          ? `${certificate.summary?.holder || certificate.fileName || 'Certificado'} validado no teste do certificado. ${plural(portals.filter(portal => portal.enabled).length, 'portal habilitado', 'portais habilitados')} e ${plural(totpCount, 'segundo fator protegido', 'segundos fatores protegidos')}.`
          : 'Ative o A1, selecione os tribunais e vincule um QR novo de cada portal em um único assistente protegido.') : certificate.valid
          ? `${certificate.summary?.holder || certificate.fileName || 'Certificado'} disponível no cofre protegido do escritório. A autenticação e o estado continuam independentes em cada portal.`
          : 'Configure só as credenciais que o escritório usa: certificado A1, PJeOffice ou segundo fator.';
      }

      const coverageList = byId('portalCoverageList');
      if (coverageList) {
        const portalGroups = portals.reduce((groups, portal) => { (groups[portal.group || 'Outros tribunais'] ||= []).push(portal); return groups; }, {});
        coverageList.innerHTML = portals.length ? Object.entries(portalGroups).map(([group, items]) => `
          <details class="portal-coverage-group" open data-portal-group="${escapeHtml(items.map(item => item.id).join(','))}">
            <summary><strong>${escapeHtml(group)}</strong><span>${items.filter(item => item.enabled).length}/${plural(items.length, 'selecionado', 'selecionados')}</span></summary>
            ${items.map(portal => `
              <label class="portal-coverage-row ${portal.automationLevel === 'experimental' ? 'experimental' : ''}">
                <input type="checkbox" data-portal-enabled value="${escapeHtml(portal.id)}" ${portal.enabled ? 'checked' : ''}>
                <span><strong>${escapeHtml(portal.name)}</strong><small>${escapeHtml(feature.portalCoverageDescription(portal))}</small></span>
                <span class="portal-method">${escapeHtml(portal.system || (portal.certificateMode === 'pjeoffice' ? 'PJeOffice oficial' : 'Certificado do Windows'))}</span>
                <span class="portal-row-actions">${portal.supportsTotp ? `<button class="button ghost portal-qr-button" type="button" data-configure-totp="${escapeHtml(portal.id)}">${portal.totpConfigured ? 'Trocar QR' : 'Vincular 2FA'}</button><button class="button ghost portal-qr-button" type="button" data-configure-account="${escapeHtml(portal.id)}">${portal.credentialsConfigured ? 'Trocar conta' : 'Vincular conta'}</button>` : ''}</span>
              </label>`).join('')}
          </details>`).join('') : '<div class="setup-loading">Nenhum portal com certificado foi configurado.</div>';
      }

      const totpSelect = byId('totpPortalSelect');
      if (totpSelect) {
        const selectedPortal = totpSelect.value;
        totpSelect.innerHTML = `<option value="">Selecione o tribunal</option>${portals.filter(portal => portal.supportsTotp).map(portal => `<option value="${escapeHtml(portal.id)}">${escapeHtml(portal.name)}${portal.totpConfigured ? ' · vinculado' : ''}</option>`).join('')}`;
        if (portals.some(portal => portal.id === selectedPortal && portal.supportsTotp)) totpSelect.value = selectedPortal;
      }

      const accountSelect = byId('accountPortalSelect');
      const accountList = byId('accountPortalList');
      if (accountSelect) {
        const selectedPortal = accountSelect.value;
        if (accountList) {
          const previousChecked = new Set(feature.selectedAccountPortals());
          accountList.innerHTML = portals.filter(portal => portal.supportsTotp).map(portal => `
            <li class="account-portal-row">
              <label>
                <input type="checkbox" data-account-portal="${escapeHtml(portal.id)}" ${previousChecked.has(portal.id) ? 'checked' : ''}>
                <span><strong>${escapeHtml(portal.name)}</strong><small>${portal.credentialsConfigured ? 'Conta configurada' : 'Sem conta configurada'}${portal.system ? ` · ${escapeHtml(portal.system)}` : ''}</small></span>
              </label>
            </li>`).join('') || '<li class="account-portal-empty">Nenhum tribunal com conta própria disponível.</li>';
        } else {
          accountSelect.innerHTML = `<option value="">Selecione o tribunal</option>${portals.filter(portal => portal.supportsTotp).map(portal => `<option value="${escapeHtml(portal.id)}">${escapeHtml(portal.name)}${portal.credentialsConfigured ? ' · conta configurada' : ''}</option>`).join('')}`;
          if (portals.some(portal => portal.id === selectedPortal && portal.supportsTotp)) accountSelect.value = selectedPortal;
        }
      }

      const launchButton = byId('launchPortalLoginButton');
      if (launchButton) {
        launchButton.disabled = false;
        launchButton.textContent = status.interactiveCollectorRunning ? 'Verificar conclusão do login' : 'Abrir sessão assistida';
      }
    },

    openPortalDrawer(portalId, trigger) {
      const item = (judicialStatus?.managedCoverage || []).find(entry => entry.id === portalId);
      const drawer = byId('jcoPortalDrawer');
      const body = byId('jcoDrawerBody');
      const foot = byId('jcoDrawerFoot');
      if (!item || !drawer || !body || !foot) return false;
      jcoDrawerTrigger = trigger || null;
      const title = byId('jcoDrawerTitle');
      if (title) title.textContent = item.name || item.id;
      const source = byId('jcoDrawerSource');
      if (source) source.textContent = `${item.system || 'Portal judicial'} · ${feature.strategyLabel(item.authStrategy)}`;
      body.innerHTML = feature.portalDrawerBody(item);
      foot.innerHTML = feature.portalDrawerActions(item);
      drawer.hidden = false;
      byId('jcoDrawerClose')?.focus?.({ preventScroll: true });
      if (item.authStrategy !== 'public' && feature.isPjePortal(item.id)) void feature.loadDrawerCommunications(item.id);
      return true;
    },

    closePortalDrawer() {
      const drawer = byId('jcoPortalDrawer');
      if (!drawer || drawer.hidden) return false;
      drawer.hidden = true;
      const body = byId('jcoDrawerBody');
      if (body) body.innerHTML = '';
      const foot = byId('jcoDrawerFoot');
      if (foot) foot.innerHTML = '';
      const trigger = jcoDrawerTrigger;
      jcoDrawerTrigger = null;
      trigger?.focus?.({ preventScroll: true });
      return true;
    },

    portalDrawerBody(item) {
      const isPublic = item.authStrategy === 'public';
      const credentialReady = !isPublic && item.connectivityState === 'not_configured' && item.totpConfigured;
      const state = isPublic ? 'Ativo' : credentialReady ? 'Credencial pronta' : feature.managedStateLabel(item.connectivityState);
      const chipClass = isPublic || item.connectivityState === 'connected' ? 'connected' : ['error', 'expired'].includes(item.connectivityState) ? 'warning' : 'muted';
      const meta = [['Estado', `<span class="status-chip ${chipClass}">${escapeHtml(state)}</span>`]];
      if (item.lastSuccessfulSyncAt) meta.push(['Última consulta', escapeHtml(feature.formatManagedTime(item.lastSuccessfulSyncAt))]);
      if (item.lastAttemptAt) meta.push(['Última tentativa', escapeHtml(feature.formatManagedTime(item.lastAttemptAt))]);
      if (item.nextRefreshAt) meta.push(['Próxima tentativa', escapeHtml(feature.formatManagedTime(item.nextRefreshAt))]);
      if (item.humanAction) meta.push(['Ação', escapeHtml(item.humanAction)]);
      if (item.lastError) meta.push(['Erro', escapeHtml(item.lastError)]);
      if (item.publicDetail) meta.push(['Detalhe', escapeHtml(item.publicDetail)]);
      const rows = meta.map(([label, value]) => `<div class="jco-drawer-row"><span>${escapeHtml(label)}</span><strong>${value}</strong></div>`).join('');
      let job = '';
      const portal = (pjeStatusCache?.portals || []).find(entry => entry.id === item.id);
      const last = portal?.lastSync;
      if (last) {
        const lines = [
          ['Situação', pjeJobStatusLabels[last.status] || last.status || '-'],
          last.finishedAt ? ['Concluída em', new Date(last.finishedAt).toLocaleString('pt-BR')] : null,
          last.durationMs ? ['Duração', `${Math.round(last.durationMs / 1000)}s`] : null,
          last.acervo ? ['Acervo', last.acervo] : null,
          last.expedientes ? ['Expedientes', last.expedientes] : null,
          last.expected != null ? ['Coletados', `${last.collected ?? 0}/${last.expected}`] : null,
          last.errorCode ? ['Erro', pjeErrorText(last.errorCode)] : null
        ].filter(Boolean);
        job = `<h4 class="jco-drawer-sub">Última sincronização PJe</h4>${lines.map(([label, value]) => `<div class="jco-drawer-row"><span>${escapeHtml(label)}</span><strong>${escapeHtml(String(value))}</strong></div>`).join('')}`;
      }
      const note = isPublic
        ? '<p class="jco-drawer-note">Fonte pública oficial, consultada somente leitura.</p>'
        : '<p class="jco-drawer-note">Somente leitura: o ATRIUM consulta; nunca pratica ciência, assinatura, petição ou protocolo.</p>';
      return `<div class="jco-drawer-meta">${rows}</div>${job}${note}<div id="jcoDrawerComms"></div>`;
    },

    portalDrawerActions(item) {
      if (item.authStrategy === 'public') return '';
      const id = escapeHtml(item.id);
      if (['action_required', 'human_action_required', 'expired'].includes(item.connectivityState)) {
        return `<button type="button" class="button gold" data-portal-action="reconnect" data-portal-id="${id}">Configurar autenticação</button>`;
      }
      if (item.connectivityState === 'not_configured') {
        return `<button type="button" class="button ghost" data-portal-action="configure" data-portal-id="${id}">Configurar</button>`;
      }
      return `<button type="button" class="button ghost" data-portal-action="sync" data-portal-id="${id}">${item.connectivityState === 'empty' ? 'Verificar agora' : 'Sincronizar'}</button>`;
    },

    async loadDrawerCommunications(portalId) {
      const container = byId('jcoDrawerComms');
      if (!container) return;
      container.innerHTML = '<p class="jco-drawer-note">Carregando expedientes…</p>';
      const params = new URLSearchParams({ portalId, page: '1', pageSize: '5' });
      const response = await secureFetch('/api/judicial/communications?' + params.toString(), { headers: { Accept: 'application/json' } }).catch(() => null);
      const data = await response?.json?.().catch(() => null);
      const target = byId('jcoDrawerComms');
      if (!target) return;
      if (!response?.ok || !data?.ok || !Array.isArray(data.items)) {
        target.innerHTML = '<p class="jco-drawer-note">Não foi possível carregar os expedientes agora.</p>';
        return;
      }
      if (!data.items.length) {
        target.innerHTML = '<h4 class="jco-drawer-sub">Expedientes capturados</h4><p class="jco-drawer-note">Nenhum expediente para este portal.</p>';
        return;
      }
      target.innerHTML = '<h4 class="jco-drawer-sub">Expedientes capturados</h4>'
        + data.items.map(entry => '<div class="jco-drawer-comm-item">'
          + `<strong>${escapeHtml(entry.processNumber || '-')}</strong>`
          + `<span>${escapeHtml((entry.situationMemberships || []).join(', ') || '-')}</span>`
          + `<span>${escapeHtml(entry.sourceReportedDeadlineAt ? 'Prazo informado: ' + entry.sourceReportedDeadlineAt : 'Sem prazo informado')}</span>`
          + '</div>').join('');
    },

    renderManagedCoverage() {
      const coverage = judicialStatus?.managedCoverage || [];
      const list = byId('managedCoverageList');
      const summary = byId('managedCoverageSummary');
      if (!list || !summary) return;
      const publicSources = coverage.filter(item => item.authStrategy === 'public');
      const authenticatedPortals = coverage.filter(item => item.authStrategy !== 'public');
      const connected = authenticatedPortals.filter(item => item.connectivityState === 'connected').length;
      const actionRequired = authenticatedPortals.filter(item => ['action_required', 'human_action_required', 'expired'].includes(item.connectivityState)).length;
      const errors = authenticatedPortals.filter(item => item.connectivityState === 'error').length;
      summary.textContent = `${plural(publicSources.length, 'fonte pública ativa', 'fontes públicas ativas')} · ${plural(connected, 'portal conectado', 'portais conectados')} · ${plural(actionRequired, 'requer', 'requerem')} ação · ${errors} com erro transitório`;
      const renderRows = items => items.map(item => {
        const isPublic = item.authStrategy === 'public';
        const credentialReady = !isPublic && item.connectivityState === 'not_configured' && item.totpConfigured;
        const state = isPublic ? 'Ativo' : credentialReady ? 'Credencial pronta' : feature.managedStateLabel(item.connectivityState);
        const emptyCoverage = item.connectivityState === 'empty';
        const detail = credentialReady ? 'Segundo fator vinculado; validação real no portal pendente.'
          : item.humanAction || item.lastError
          ? (item.humanAction || item.lastError)
          : emptyCoverage
          ? `Coleta autenticada sem expedientes pendentes${item.lastAttemptAt ? ` · Última verificação ${feature.formatManagedTime(item.lastAttemptAt)}` : ''}`
          : (isPublic && item.publicDetail
            ? `${item.publicDetail}${item.lastSuccessfulSyncAt ? ` · Última consulta ${feature.formatManagedTime(item.lastSuccessfulSyncAt)}` : ''}`
            : item.lastSuccessfulSyncAt
            ? `Última consulta ${feature.formatManagedTime(item.lastSuccessfulSyncAt)}`
            : isPublic ? 'API pública oficial · aguardando primeira consulta' : 'Ainda sem sincronização autenticada');
        const next = item.nextRefreshAt
          ? `Próxima tentativa ${feature.formatManagedTime(item.nextRefreshAt)}`
          : emptyCoverage
            ? 'Nova verificação na cadência do servidor'
            : item.humanAction
              ? 'Aguardando configuração do escritório'
              : isPublic
                ? 'Consulta somente leitura sob demanda'
                : 'Cadência começa após a primeira sincronização';
        const actionButton = !isPublic ? (
          ['action_required', 'human_action_required', 'expired'].includes(item.connectivityState)
            ? `<button type="button" class="button gold btn-action-portal" data-portal-action="reconnect" data-portal-id="${escapeHtml(item.id)}">Configurar autenticação</button>`
            : item.connectivityState === 'not_configured'
            ? `<button type="button" class="button ghost btn-action-portal" data-portal-action="configure" data-portal-id="${escapeHtml(item.id)}">Configurar</button>`
            : item.connectivityState === 'empty'
            ? `<button type="button" class="button ghost btn-action-portal" data-portal-action="sync" data-portal-id="${escapeHtml(item.id)}">Verificar agora</button>`
            : item.connectivityState === 'connected'
            ? `<button type="button" class="button ghost btn-action-portal" data-portal-action="sync" data-portal-id="${escapeHtml(item.id)}">Sincronizar</button>`
            : ''
        ) : '';
        return `<article class="managed-coverage-row" data-managed-state="${escapeHtml(isPublic ? 'public-active' : item.connectivityState || 'not_configured')}">
          <div class="managed-coverage-identity"><strong>${escapeHtml(item.name || item.id)}</strong><span>${escapeHtml(item.system || 'Portal judicial')} · ${escapeHtml(feature.strategyLabel(item.authStrategy))}</span></div>
          <div class="managed-coverage-status"><span class="status-chip ${isPublic || item.connectivityState === 'connected' ? 'connected' : ['error', 'expired'].includes(item.connectivityState) ? 'warning' : 'muted'}">${escapeHtml(state)}</span><small>${escapeHtml(detail)}</small></div>
          <div class="managed-coverage-next"><span>${escapeHtml(isPublic ? 'API pública oficial' : item.verification === 'verified' ? 'Verificado' : item.verification === 'experimental' ? 'Experimental' : 'Validação real pendente')}</span><small>${escapeHtml(next)}</small>${actionButton ? `<div class="managed-coverage-actions" style="margin-top:6px;">${actionButton}</div>` : ''}</div>
          <button type="button" class="jco-row-detail" data-portal-detail="${escapeHtml(item.id)}" aria-label="Ver detalhe de ${escapeHtml(item.name || item.id)}">${iconSvg('chevron-right')}</button>
        </article>`;
      }).join('');
      const visibleAuthenticated = authenticatedPortals.filter(item => item.enabled || item.connectivityState !== 'not_configured' || item.totpConfigured);
      const renderPublicGroup = items => items.length ? `<details class="managed-coverage-group" data-coverage-kind="public" open><summary><span>Fontes públicas</span><small>${plural(items.length, 'ativa', 'ativas')}</small></summary>${renderRows(items)}</details>` : '';
      const renderAuthenticatedGroup = items => items.length ? `<details class="managed-coverage-group" data-coverage-kind="authenticated"${items.some(item => item.connectivityState !== 'not_configured') ? ' open' : ''}><summary><span>Portais selecionados</span><small>${items.length} de ${authenticatedPortals.length}</small></summary>${renderRows(items)}</details>` : '';
      list.innerHTML = coverage.length ? `${renderPublicGroup(publicSources)}${renderAuthenticatedGroup(visibleAuthenticated)}` : '<div class="setup-loading">Nenhuma fonte judicial foi configurada.</div>';
    },

    portalCoverageDescription(portal) {
      if (!portal.managed) return portal.automationLevel === 'experimental' ? 'Cobertura experimental · primeiro acesso acompanhado' : portal.supportsTotp ? portal.totpConfigured ? '2FA vinculado e verificado' : 'Sem QR/2FA vinculado' : 'Sessão com certificado, sem TOTP vinculado';
      const verification = portal.managed?.verification === 'verified' ? 'verificado' : portal.managed?.verification === 'experimental' || portal.automationLevel === 'experimental' ? 'experimental' : 'não verificado em portal real';
      const state = feature.managedStateLabel(portal.managed?.connectivityState || 'not_configured');
      const factor = portal.supportsTotp ? portal.totpConfigured ? '2FA protegido' : '2FA não vinculado' : 'sem TOTP local';
      return `${state} · ${factor} · ${verification}`;
    },

    managedStateLabel(state) {
      return ({ connected: 'Conectado', authenticating: 'Autenticando', connecting: 'Conectando', action_required: 'Ação necessária', human_action_required: 'Ação necessária', expired: 'Sessão expirada', error: 'Erro com backoff', not_configured: 'Não configurado', not_verified: 'Não verificado', empty: 'Sem expedientes no momento' })[state] || 'Estado não informado';
    },

    strategyLabel(strategy) {
      return ({ public: 'Fonte pública', 'client-cert-mtls': 'Certificado mTLS', 'pjeoffice-local': 'PJeOffice no servidor', totp: 'TOTP', 'credentials-totp': 'Usuário, senha e TOTP', 'username-password-plus-totp': 'Usuário, senha e TOTP', 'windows-store': 'Certificado do Windows', 'interactive-human-required': 'Login acompanhado', 'manual-persistent-session': 'Sessão acompanhada' })[strategy] || 'Estratégia específica do portal';
    },

    formatManagedTime(value) {
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return 'não informado';
      return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(date);
    },

    isEprocPortal(portalId) {
      const portals = [
        ...(judicialStatus?.portals || []),
        ...(judicialStatus?.managedCoverage || [])
      ];
      return portals.some(portal => (portal.id === portalId || portal.canonicalId === portalId) && String(portal.system || '').trim().toLowerCase() === 'eproc');
    },

    isPjePortal(portalId) {
      if (!portalId) return false;
      const portals = [
        ...(judicialStatus?.portals || []),
        ...(judicialStatus?.managedCoverage || [])
      ];
      return portals.some(portal => (portal.id === portalId || portal.canonicalId === portalId)
        && (String(portal.system || '').trim().toLowerCase().startsWith('pje')
          || String(portal.id || '').trim().toLowerCase().startsWith('pje-')));
    },

    async openPortalConfiguration(portalId) {
      if (!portalId) return false;
      const backdrop = byId('judicialSetupBackdrop');
      if (backdrop?.classList.contains('hidden')) await feature.open();
      // Configuracao de credencial vive na aba Credenciais: sem ativar a aba, o
      // campo fica oculto e o foco/scroll nao acontecem.
      applyJcoTab('credentials');

      const eprocPortal = (judicialStatus?.portals || []).find(item => item.id === portalId || item.canonicalId === portalId);
      const configurationId = eprocPortal?.id || portalId;
      const portal = [...(documentRef.querySelectorAll?.('[data-portal-enabled]') || [])]
        .find(input => input.value === configurationId);
      if (portal) portal.checked = true;

      if (feature.isEprocPortal(portalId) && eprocPortal?.credentialConfigured) {
        await feature.syncEprocNow(null, { portalIds: [portalId] });
        return true;
      }

      const totpSelect = byId('totpPortalSelect');
      const hasTotpOption = (!feature.isEprocPortal(portalId) || Boolean(eprocPortal?.requiresTotp ?? eprocPortal?.supportsTotp))
        && [...(totpSelect?.options || [])].some(option => option.value === configurationId);
      if (hasTotpOption) {
        totpSelect.value = configurationId;
        [...(documentRef.querySelectorAll?.('details[data-portal-group]') || [])].find(group => group.dataset.portalGroup?.split(',').includes(portalId))?.setAttribute('open', '');
        byId('totpSetupSection')?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
        byId('portalQrInput')?.focus?.();
      } else {
        const certificateInput = byId('certificateFileInput');
        certificateInput?.closest?.('.setup-section')?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
        certificateInput?.focus?.();
      }
      return true;
    },

    async reconnectPortal(portalId, button) {
      if (!portalId) return false;
      if (feature.isPjePortal(portalId)) {
        if (button) button.disabled = true;
        try {
          await startPjeSyncFromUi(portalId);
          return true;
        } finally {
          if (button) button.disabled = false;
        }
      }
      if (feature.isEprocPortal(portalId)) {
        const portal = (judicialStatus?.portals || []).find(item => item.id === portalId || item.canonicalId === portalId);
        if (!portal?.credentialConfigured) return feature.openPortalConfiguration(portalId);
        if (button) button.disabled = true;
        try {
          await feature.syncEprocNow(null, { portalIds: [portalId] });
          return true;
        } finally {
          if (button) button.disabled = false;
        }
      }
      if (button) button.disabled = true;
      try {
        await feature.request('/api/integrations/judicial/connect', { portalIds: [portalId] });
        showToast('Conexão acompanhada aberta. Conclua somente as etapas exigidas pelo portal.', 'success');
        return true;
      } catch (error) {
        showToast(error.message, 'error');
        return false;
      } finally {
        if (button) button.disabled = false;
      }
    },

    async launchAssistedSession(button) {
      if (judicialStatus?.interactiveCollectorRunning) return feature.verifyAssistedSession();
      const portalIds = [...documentRef.querySelectorAll('[data-portal-enabled]:checked')].map(input => input.value);
      if (!portalIds.length) {
        showToast('Habilite ao menos um portal autenticado antes de abrir a sessão assistida.', 'warning');
        return false;
      }
      if (button) button.disabled = true;
      try {
        await feature.request('/api/integrations/judicial/connect', { portalIds });
        feature.setAssistedSessionFeedback('A janela do tribunal foi aberta. Conclua o login; o ATRIUM reconhecerá a autenticação e atualizará os dados automaticamente.', 'working');
        showToast('Sessão assistida aberta. Conclua pessoalmente as etapas exigidas pelo portal.', 'success');
        await feature.refreshStatus();
        windowRef.clearTimeout(assistedSessionCheckTimer);
        assistedSessionCheckTimer = windowRef.setTimeout(() => feature.verifyAssistedSession({ automatic: true }), 6_000);
        return true;
      } catch (error) {
        showToast(error.message, 'error');
        return false;
      } finally {
        if (button && !judicialStatus?.interactiveCollectorRunning) button.disabled = false;
      }
    },

    setAssistedSessionFeedback(message, state = '') {
      const feedback = byId('assistedSessionFeedback');
      if (!feedback) return;
      feedback.textContent = message || '';
      feedback.className = `assisted-session-feedback ${message ? '' : 'hidden'} ${state}`.trim();
    },

    scheduleAssistedSessionCheck(delay = 3_000) {
      windowRef.clearTimeout(assistedSessionCheckTimer);
      assistedSessionCheckTimer = windowRef.setTimeout(() => feature.verifyAssistedSession({ automatic: true }), delay);
    },

    async verifyAssistedSession({ automatic = false } = {}) {
      const status = await feature.refreshStatus(false);
      if (status?.interactiveCollectorRunning) {
        feature.setAssistedSessionFeedback('Aguardando o portal concluir o login. Assim que a sessão for reconhecida, os dados serão atualizados automaticamente.', automatic ? 'working' : 'warning');
        feature.scheduleAssistedSessionCheck();
        return false;
      }
      windowRef.clearTimeout(assistedSessionCheckTimer);
      assistedSessionCheckTimer = null;
      if (status?.interactiveCollectorState?.status === 'failed') {
        feature.setAssistedSessionFeedback(`A coleta encerrou com falha: ${status.interactiveCollectorState.lastError || 'não foi possível confirmar a sessão do portal.'}`, 'warning');
        showToast('A sessão judicial não foi confirmada. Verifique o aviso exibido no assistente.', 'error');
        return false;
      }
      const attemptedPortals = new Set(status?.interactiveCollectorState?.portalIds || []);
      const pendingPortal = (status?.managedCoverage || []).find(item => attemptedPortals.has(item.id)
        && ['action_required', 'human_action_required', 'expired', 'error'].includes(item.connectivityState));
      if (pendingPortal) {
        feature.setAssistedSessionFeedback(`${pendingPortal.name || 'O portal'} ainda requer ação: ${pendingPortal.humanAction || pendingPortal.lastError || 'conclua a autenticação e abra uma nova sessão assistida.'}`, 'warning');
        return false;
      }
      feature.setAssistedSessionFeedback('Login concluído. Atualizando os dados judiciais em modo somente leitura…', 'working');
      const synchronized = await onSyncAll({ silent: true });
      feature.setAssistedSessionFeedback('Sessão validada e dados judiciais atualizados com sucesso.', 'success');
      showToast('Sessão judicial validada e dados atualizados.', 'success');
      return Boolean(synchronized !== false);
    },

    async testA1Sandbox() {
      const button = byId('btnRunA1Sandbox');
      if (button) { button.disabled = true; button.innerHTML = `${presentation?.icon?.('certificate') || iconSvg('certificate')}Testando certificado…`; }
      try {
        const response = await secureFetch('/api/integrations/judicial/a1/sandbox', {
          method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({})
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.message || 'Não foi possível testar o certificado. Tente de novo.');
        const sandbox = data.sandbox || {};
        if (sandbox.steps) {
          for (const step of sandbox.steps) {
            const element = byId(`chkStep-${step.id}`);
            if (element) {
              const ok = step.status === 'OK';
              element.innerHTML = `<span>${escapeHtml(step.name)}:</span> <strong style="color:${ok ? '#4ade80' : '#f87171'}">${presentation?.icon?.(ok ? 'check' : 'warning') || iconSvg(ok ? 'check' : 'warning')}${ok ? 'OK' : 'Falha'}</strong>`;
            }
          }
        }
        if (sandbox.operational) {
          showToast('Certificado A1 validado 100% no Sandbox (mTLS + Playwright + Assinatura)!', 'success');
          const chip = byId('certificateFileBadge');
          if (chip) { chip.textContent = 'A1 OPERATIONAL'; chip.className = 'status-chip connected'; }
        } else showToast(`A1 Sandbox: ${sandbox.errorMessage || 'Falha na validação'}`, 'error');
      } catch (error) {
        showToast(`Erro no Sandbox: ${error.message}`, 'error');
      } finally {
        if (button) { button.disabled = false; button.innerHTML = `${presentation?.icon?.('certificate') || iconSvg('certificate')}Testar Certificado no Sandbox`; }
      }
    },

    async saveCertificate(event) {
      event.preventDefault();
      const form = event.currentTarget;
      const file = byId('certificateFileInput')?.files[0];
      const passphrase = byId('certificatePassphrase')?.value;
      if (!file || !passphrase) return showToast('Selecione o PFX e informe a senha atual.', 'error');
      feature.setFormBusy(form, true);
      try {
        if (file.size > 5_000_000) throw new Error('O certificado deve ter no máximo 5 MB.');
        const pfxBase64 = await feature.fileToBase64(file);
        await feature.request('/api/integrations/judicial/certificate', { fileName: file.name, pfxBase64, passphrase });
        form.reset();
        byId('certificateFileInput')?.closest('.file-picker')?.classList.remove('has-file');
        const fileName = byId('certificateFileName');
        if (fileName) fileName.textContent = 'Selecionar certificado';
        audit('Certificado A1 configurado', 'Contêiner armazenado cifrado no cofre do escritório.');
        showToast('Certificado validado com sucesso! Sincronizando dados judiciais...', 'success');
        await feature.refreshStatus();
        feature.rememberSnapshot();
        await onSyncAll({ silent: true });
      } catch (error) {
        showToast(error.message, 'error');
      } finally {
        feature.setFormBusy(form, false);
      }
    },

    async readPortalQr(file) {
      const status = byId('portalQrStatus');
      const secretInput = byId('portalTotpSecret');
      if (secretInput) secretInput.value = '';
      pendingTotpAccounts = [];
      byId('portalTotpAccountField')?.classList?.add('hidden');
      if (!file) {
        status.textContent = 'Selecionar QR code';
        feature.setTotpFeedback('Selecione uma imagem de QR Code ou informe a chave Base32.', 'error');
        return;
      }
      status.textContent = 'Decodificando imagem do QR code…';
      feature.setTotpFeedback('Lendo o QR Code em memória…', 'working');
      try {
        let raw = '';
        if (typeof windowRef.jsQR === 'function') {
          try {
            raw = await decodeQrWithJsQr(file, { windowRef, documentRef });
          } catch {
            warn('Falha ao ler QR com jsQR.');
          }
        }
        if (!raw && ('BarcodeDetector' in windowRef)) {
          try {
            const detector = new windowRef.BarcodeDetector({ formats: ['qr_code'] });
            const bitmap = await windowRef.createImageBitmap(file);
            const codes = await detector.detect(bitmap);
            bitmap.close?.();
            raw = codes.find(code => code.rawValue)?.rawValue?.trim() || '';
          } catch {
            warn('Falha ao ler QR com BarcodeDetector.');
          }
        }
        let parsed = null;
        if (raw) {
          parsed = await feature.request('/api/integrations/judicial/totp/parse', { qrData: raw });
          raw = '';
        } else if (file) {
          status.textContent = 'Decodificando no servidor seguro…';
          const arrayBuffer = await file.arrayBuffer();
          let binary = '';
          const bytes = new Uint8Array(arrayBuffer);
          const len = bytes.byteLength;
          for (let i = 0; i < len; i++) {
            binary += String.fromCharCode(bytes[i]);
          }
          const base64 = windowRef.btoa(binary);
          parsed = await feature.request('/api/integrations/judicial/totp/parse', { imageBase64: base64, fileName: file.name });
        } else {
          throw new Error('Não foi possível ler o QR Code da imagem. Verifique se o enquadramento está nítido ou cole a chave manual Base32.');
        }
        const parsedAccounts = parsed.type === 'migration' ? parsed.accounts : [parsed.account];
        pendingTotpAccounts = (parsedAccounts || []).filter(account => account?.secret).map(account => ({
          name: String(account.name || 'Conta sem nome').slice(0, 160),
          issuer: String(account.issuer || 'Authenticator').slice(0, 160),
          secret: String(account.secret || ''),
          digits: Number(account.digits || 6)
        }));
        if (!pendingTotpAccounts.length) throw new Error('O QR foi lido, mas não contém uma conta TOTP válida.');

        const accountField = byId('portalTotpAccountField');
        const accountSelect = byId('portalTotpAccountSelect');
        if (pendingTotpAccounts.length > 1) {
          if (!accountSelect) throw new Error('O QR contém múltiplas contas, mas o seletor seguro não está disponível.');
          accountSelect.innerHTML = `<option value="">Selecione a conta</option>${pendingTotpAccounts.map((account, index) => `<option value="${index}">${escapeHtml(account.issuer)} · ${escapeHtml(account.name)}</option>`).join('')}`;
          accountField?.classList?.remove('hidden');
          status.textContent = `${file.name} · ${pendingTotpAccounts.length} contas encontradas`;
          feature.setTotpFeedback('QR lido. Selecione a conta judicial correta e informe o código atual.', 'success');
          showToast('QR lido. Selecione a conta judicial correta antes de validar o código.', 'success');
        } else {
          accountField?.classList?.add('hidden');
          if (accountSelect) accountSelect.innerHTML = '<option value="0">Conta TOTP identificada</option>';
          status.textContent = `${file.name} · QR lido com sucesso`;
          feature.setTotpFeedback('QR Code lido. Informe o código atual do autenticador.', 'success');
          showToast('QR Code decodificado com sucesso! Digite o código atual para validar.', 'success');
        }
        byId('portalTotpCode').focus();
      } catch (error) {
        pendingTotpAccounts = [];
        byId('portalTotpAccountField')?.classList?.add('hidden');
        status.textContent = file.name;
        feature.setTotpFeedback(error.message, 'error');
        showToast(error.message, 'error');
      }
    },

    setTotpFeedback(message, state = '') {
      const feedback = byId('portalTotpFeedback');
      if (!feedback) return;
      feedback.textContent = message || '';
      feedback.className = `setup-feedback ${message ? '' : 'hidden'} ${state}`.trim();
    },

    async savePortalTotp(event) {
      event.preventDefault();
      const form = event.currentTarget;
      const portalId = byId('totpPortalSelect').value;
      let secret = String(byId('portalTotpSecret')?.value || '').trim();
      if (!secret && pendingTotpAccounts.length === 1) secret = pendingTotpAccounts[0].secret;
      if (!secret && pendingTotpAccounts.length > 1) {
        const selectedValue = byId('portalTotpAccountSelect')?.value || '';
        const selectedIndex = selectedValue === '' ? -1 : Number(selectedValue);
        if (Number.isInteger(selectedIndex) && selectedIndex >= 0) secret = pendingTotpAccounts[selectedIndex]?.secret || '';
      }
      const code = byId('portalTotpCode').value;
      if (!portalId || !secret || !/^\d{6}$/.test(code)) {
        const accountHint = pendingTotpAccounts.length > 1 && !byId('portalTotpAccountSelect')?.value ? ' Selecione também a conta do QR.' : '';
        const message = `Selecione o portal, o QR/chave e informe o código atual de seis dígitos.${accountHint}`;
        feature.setTotpFeedback(message, 'error');
        return showToast(message, 'error');
      }
      feature.setFormBusy(form, true);
      try {
        await feature.request('/api/integrations/judicial/2fa', { portalId, secret, code });
        secret = '';
        feature.clearSecrets({ clearQr: true });
        if (byId('portalQrStatus')) byId('portalQrStatus').textContent = 'Selecionar QR code';
        audit('Segundo fator judicial ativado', `${judicialStatus?.portals?.find(portal => portal.id === portalId)?.name || portalId} · código TOTP validado.`);
        feature.setTotpFeedback('Código validado. Credencial pronta; a validação real no portal ainda está pendente.', 'success');
        showToast('Código validado. Credencial pronta para este portal.', 'success');
        await feature.refreshStatus();
        feature.rememberSnapshot();
      } catch (error) {
        feature.setTotpFeedback(error.message, 'error');
        showToast(error.message, 'error');
      } finally {
        feature.setFormBusy(form, false);
      }
    },

    async removePortalTotp() {
      const portalId = byId('totpPortalSelect').value;
      if (!portalId) return showToast('Selecione o portal cujo vínculo local deve ser removido.', 'error');
      try {
        await feature.request('/api/integrations/judicial/2fa', { portalId, remove: true });
        feature.clearSecrets();
        audit('Segundo fator judicial removido', `${judicialStatus?.portals?.find(portal => portal.id === portalId)?.name || portalId} · segredo local removido.`);
        showToast('Vínculo local removido. Isso não desativa o 2FA no portal.', 'success');
        await feature.refreshStatus();
        feature.rememberSnapshot();
      } catch (error) {
        showToast(error.message, 'error');
      }
    },

    setAccountFeedback(message, state = '') {
      const feedback = byId('portalAccountFeedback');
      if (!feedback) return;
      feedback.textContent = message || '';
      feedback.className = `setup-feedback ${message ? '' : 'hidden'} ${state}`.trim();
    },

    /** Portais marcados na lista de conta do tribunal (mesma credencial). */
    selectedAccountPortals() {
      const list = byId('accountPortalList');
      if (!list?.querySelectorAll) {
        const single = String(byId('accountPortalSelect')?.value || '').trim();
        return single ? [single] : [];
      }
      return [...list.querySelectorAll('[data-account-portal]')]
        .filter(input => input.checked)
        .map(input => String(input.dataset.accountPortal || '').trim())
        .filter(Boolean);
    },

    setAllAccountPortals(checked) {
      const list = byId('accountPortalList');
      if (!list?.querySelectorAll) return;
      list.querySelectorAll('[data-account-portal]').forEach(input => { input.checked = checked === true; });
    },

    async savePortalAccount(event) {
      event.preventDefault();
      const form = event.currentTarget;
      const portalIds = feature.selectedAccountPortals();
      const username = String(byId('portalAccountUsername')?.value || '').trim();
      const password = String(byId('portalAccountPassword')?.value || '');
      if (portalIds.length === 0 || !username || !password) {
        const message = 'Marque ao menos um tribunal e informe usuário e senha da conta do tribunal.';
        feature.setAccountFeedback(message, 'error');
        return showToast(message, 'error');
      }
      feature.setFormBusy(form, true);
      try {
        const result = await feature.request('/api/integrations/judicial/credentials', { portalIds, username, password });
        if (byId('portalAccountPassword')) byId('portalAccountPassword').value = '';
        const saved = Array.isArray(result?.portalIds) ? result.portalIds : portalIds;
        const names = saved.map(id => judicialStatus?.portals?.find(portal => portal.id === id)?.name || id).join(', ');
        audit('Conta do tribunal vinculada', `${names} · credencial guardada no cofre cifrado.`);
        feature.setAccountFeedback(`Conta salva no cofre cifrado para ${plural(saved.length, 'tribunal', 'tribunais')}. A validação real acontece na próxima sincronização.`, 'success');
        showToast(`Conta do tribunal salva para ${plural(saved.length, 'tribunal', 'tribunais')}.`, 'success');
        await feature.refreshStatus();
        feature.rememberSnapshot();
      } catch (error) {
        feature.setAccountFeedback(error.message, 'error');
        showToast(error.message, 'error');
      } finally {
        feature.setFormBusy(form, false);
      }
    },

    async removePortalAccount() {
      const portalIds = feature.selectedAccountPortals();
      if (portalIds.length === 0) return showToast('Marque o tribunal cuja conta local deve ser removida.', 'error');
      try {
        await feature.request('/api/integrations/judicial/credentials', { portalIds, remove: true });
        if (byId('portalAccountPassword')) byId('portalAccountPassword').value = '';
        const names = portalIds.map(id => judicialStatus?.portals?.find(portal => portal.id === id)?.name || id).join(', ');
        audit('Conta do tribunal removida', `${names} · credencial local removida.`);
        showToast(`Conta removida do cofre do escritório (${plural(portalIds.length, 'tribunal', 'tribunais')}).`, 'success');
        await feature.refreshStatus();
        feature.rememberSnapshot();
      } catch (error) {
        showToast(error.message, 'error');
      }
    },

    async savePortalCoverage() {
      const enabledIds = [...documentRef.querySelectorAll('[data-portal-enabled]:checked')].map(input => input.value);
      try {
        await feature.request('/api/integrations/judicial/portals', { enabledIds });
        audit('Conexões com tribunais atualizadas', `Certificado habilitado em ${plural(enabledIds.length, 'portal', 'portais')}.`);
        showToast('Conexões com tribunais salvas.', 'success');
        await feature.refreshStatus();
        feature.rememberSnapshot();
      } catch (error) {
        showToast(error.message, 'error');
      }
    },

    async resetConnections() {
      const confirmed = windowRef.confirm('Isso removerá os vínculos QR/2FA, desmarcará os tribunais e apagará as sessões judiciais deste escritório no servidor. O certificado A1 será preservado. Continuar?');
      if (!confirmed) return;
      const button = byId('resetJudicialConnectionsButton');
      if (button) button.disabled = true;
      try {
        const result = await feature.request('/api/integrations/judicial/reset', { confirm: 'ZERAR_ACESSOS_JUDICIAIS' });
        feature.clearSecrets({ clearQr: true });
        audit('Acessos judiciais zerados', `QR/2FA, cobertura e sessões locais removidos. Certificado A1 ${result.certificatePreserved ? 'preservado' : 'não estava configurado'}.`);
        showToast(result.certificatePreserved ? 'Acessos zerados. O certificado A1 foi preservado.' : 'Acessos zerados; nenhum certificado estava configurado.', 'success');
        await feature.refreshStatus();
        feature.rememberSnapshot();
      } catch (error) {
        showToast(error.message, 'error');
      } finally {
        if (button) button.disabled = false;
      }
    },

    async syncNow() {
      return feature.syncEprocNow(null, { silent: true });
    },

    async runA1Sweep() {
      return feature.syncEprocNow();
    },

    async request(url, body) {
      const response = await secureFetch(url, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(body)
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || 'A configuração judicial não foi concluída.');
      return data;
    },

    setFormBusy(form, busy) {
      form.querySelectorAll('input, select, button').forEach(element => { element.disabled = busy; });
    },

    async fileToBase64(file) {
      const bytes = new Uint8Array(await file.arrayBuffer());
      let binary = '';
      for (let offset = 0; offset < bytes.length; offset += 32_768) binary += String.fromCharCode(...bytes.subarray(offset, offset + 32_768));
      return windowRef.btoa(binary);
    },

    async refreshEprocStatus() {
      try {
        const response = await secureFetch('/api/integrations/eproc/status', { headers: { Accept: 'application/json' } });
        if (!response.ok) return null;
        const data = await response.json();
        feature.renderEprocStatus(data);
        return data;
      } catch (err) {
        warn?.('Aviso ao carregar status eproc:', err?.message || err);
        return null;
      }
    },

    renderEprocStatus(data) {
      if (!data) return;
      const scheduleLabel = byId('eprocNextScheduleLabel');
      if (scheduleLabel && data.scheduler?.nextSyncFormatted) {
        scheduleLabel.textContent = `Agendamento: ${data.scheduler.nextSyncFormatted}`;
      }

      const grid = byId('eprocPortalsGrid');
      if (!grid) return;
      const portals = Array.isArray(data.portals) ? data.portals : [];
      if (!portals.length) {
        grid.innerHTML = '<div class="setup-loading">Nenhum portal eproc disponível.</div>';
        return;
      }

      grid.innerHTML = portals.map(p => {
        const isConnected = p.connectionVerified === true && p.status === 'connected';
        const badgeClass = p.badgeClass === 'connected' && isConnected ? 'connected' : 'warning';
        const metricEntries = p.metrics
          ? [
              ['processos consultados', p.metrics.processes],
              ['processos enriquecidos', p.metrics.enrichedProcesses],
              ['intimações novas', p.metrics.intimations]
            ].filter(([, value]) => typeof value === 'number')
          : [];
        return `
          <article class="v2-eproc-portal-card" data-portal-id="${escapeHtml(p.id)}">
            <div class="v2-eproc-card-top">
              <span class="v2-eproc-court-badge">
                ${presentation?.icon?.('court') || '<svg class="atrium-icon" aria-hidden="true"><use href="assets/icons/atrium-ui-icons.svg?v=3.1.0#atrium-icon-court"></use></svg>'}
                ${escapeHtml(p.acronym || p.id)}
              </span>
              <span class="status-chip ${badgeClass}">${escapeHtml(p.statusLabel || (isConnected ? 'Conectado' : 'Disponível'))}</span>
            </div>
            <div class="v2-eproc-card-body">
              <h4>${escapeHtml(p.name)}</h4>
              <p>${escapeHtml(p.court)} · Grau ${p.level}</p>
              <div class="v2-eproc-auth-method">
                ${presentation?.icon?.('security') || '<svg class="atrium-icon" aria-hidden="true"><use href="assets/icons/atrium-ui-icons.svg?v=3.1.0#atrium-icon-security"></use></svg>'}
                <span>${escapeHtml(p.authType)}</span>
              </div>
              <div class="v2-eproc-card-metrics">
                ${metricEntries.length
                  ? metricEntries.map(([label, value]) => `<span><strong>${value}</strong> ${label}</span>`).join('')
                  : '<span>Sem métricas de sincronização confirmadas</span>'}
              </div>
            </div>
            <div class="v2-eproc-card-footer">
              <span class="v2-eproc-last-sync">
                ${p.lastSuccessfulSyncAt ? `Última sincronização confirmada: ${feature.formatManagedTime(p.lastSuccessfulSyncAt)}` : 'Ainda sem sincronização confirmada'}
              </span>
              <div class="v2-eproc-card-actions">
                ${p.requiresA1 || p.requiresTotp ? `<button type="button" class="button ghost" data-open-portal-config="${escapeHtml(p.id)}">Configurar</button>` : ''}
                <a href="${escapeHtml(p.url)}" target="_blank" rel="noopener noreferrer" class="button ghost" title="Abrir portal oficial do tribunal" aria-label="Abrir ${escapeHtml(p.name)}">
                  ${presentation?.icon?.('external-link') || '<svg class="atrium-icon" aria-hidden="true"><use href="assets/icons/atrium-ui-icons.svg?v=3.1.0#atrium-icon-external-link"></use></svg>'}
                </a>
              </div>
            </div>
          </article>
        `;
      }).join('');
    },

    openEprocSyncModal() {
      const modal = byId('eprocSyncModalBackdrop');
      if (modal) {
        modal.classList.remove('hidden');
        modal.setAttribute?.('aria-hidden', 'false');
      }
    },

    async restoreEprocSync() {
      const snapshot = await readEprocSyncStatusWithRetry();
      const jobState = String(snapshot?.job?.state || snapshot?.job?.status || '').toUpperCase();
      if (snapshot?.active && snapshot.job?.id && ['RUNNING', 'PENDING'].includes(jobState)) {
        eprocSyncJobId = snapshot.job.id;
        return feature.syncEprocNow(snapshot.job.id, { silent: true });
      }
      return null;
    },

    async syncEprocNow(existingJobId = null, { silent = false, portalIds = null } = {}) {
      if (eprocSyncPollPromise) {
        if (!silent) feature.openEprocSyncModal();
        return eprocSyncPollPromise;
      }
      eprocSyncPollPromise = (async () => {
        const button = byId('btnSyncEprocNow');
        const originalText = button?.innerHTML || 'Sincronizar agora';
        if (button) {
          button.disabled = true;
          button.innerHTML = `${presentation?.icon?.('sync') || ''}<span style="margin-left: 6px;">Sincronizando...</span>`;
        }

        const statusLabel = byId('eprocSyncStatusLabel');
        const percentLabel = byId('eprocSyncPercentLabel');
        const modalTrack = byId('eprocSyncModalTrack');
        const modalFill = byId('eprocSyncModalFill');
        const currentAction = byId('eprocSyncCurrentAction');
        const consoleLogs = byId('eprocSyncConsoleLogs');
        const minimizeBtn = byId('eprocSyncModalMinimize');
        const doneBtn = byId('eprocSyncModalDone');
        const reportErrorBtn = byId('eprocSyncModalReportError');
        const portalLabel = byId('eprocSyncPortalLabel');
        const jobIdLabel = byId('eprocSyncJobIdLabel');
        const stateLabel = byId('eprocSyncStateLabel');
        const phaseLabel = byId('eprocSyncPhaseLabel');
        const countLabel = byId('eprocSyncCountLabel');
        const consoleStatus = byId('eprocSyncConsoleLiveDot');
        const updateGlobal = (state, detail, percent = null, determinate = percent !== null) => onEprocStatus?.({
          state, detail, percent, determinate, owner: state === 'syncing' ? 'eproc' : null,
          onActivate: ['syncing', 'error', 'partial'].includes(state) && eprocSyncJobId
            ? () => feature.openEprocSyncModal() : null
        });

        const appendLog = (text, type = 'info') => {
          if (!consoleLogs) return;
          const now = new Date();
          const timeStr = [now.getHours(), now.getMinutes(), now.getSeconds()]
            .map(value => String(value).padStart(2, '0')).join(':');
          if (documentRef?.createElement) {
            const line = documentRef.createElement('div');
            line.className = `eproc-sync-log-line is-${type}`;
            line.innerHTML = `<span class="log-time">[${timeStr}]</span> ${escapeHtml(text)}`;
            consoleLogs.appendChild(line);
          } else if (typeof consoleLogs.innerHTML === 'string') {
            consoleLogs.innerHTML += `<div class="eproc-sync-log-line is-${type}"><span class="log-time">[${timeStr}]</span> ${escapeHtml(text)}</div>`;
          }
          if (consoleLogs.scrollHeight) consoleLogs.scrollTop = consoleLogs.scrollHeight;
        };

        const setStepStatus = (stepNumber, status) => {
          const stepEl = byId(`eprocStep${stepNumber}`);
          if (stepEl) {
            if (stepEl.dataset) stepEl.dataset.status = status;
            else stepEl.setAttribute?.('data-status', status);
          }
        };

        const markTrackingUnavailable = message => {
          if (stateLabel) stateLabel.textContent = 'Estado: não confirmado';
          if (statusLabel) statusLabel.textContent = 'Acompanhamento não confirmado';
          if (currentAction) currentAction.textContent = message;
          if (consoleStatus) consoleStatus.textContent = 'Acompanhamento interrompido';
          updateGlobal('error', message, null, false);
          appendLog(message, 'warning');
          showToast(message, 'warning');
        };

        const renderJob = job => {
          const portals = Array.isArray(job.portals) ? job.portals : [];
          const currentPortalId = job.overall?.currentPortal;
          const activePortal = portals.find(portal => portal.portalId === currentPortalId || portal.state === 'RUNNING');
          const telemetryPortal = activePortal || [...portals].reverse().find(portal => portal.phase || portal.action || portal.determinate === true) || null;
          const jobState = String(job.state || job.status || '').toUpperCase();
          const stateText = eprocStateLabel(jobState);
          const phaseText = eprocPhaseLabel(telemetryPortal?.phase || job.overall?.phase);
          const portalText = eprocPortalLabel(telemetryPortal?.portalId || currentPortalId);
          const actionText = telemetryPortal?.action || job.action || 'Sincronização eproc em andamento...';
          const progressSource = telemetryPortal?.determinate === true
            ? telemetryPortal
            : (job.overall?.determinate === true ? job.overall : null);
          const percent = progressSource && Number.isFinite(progressSource.percent) ? progressSource.percent : null;
          const hasCounts = progressSource && Number.isFinite(progressSource.completed) && Number.isFinite(progressSource.total);

          if (portalLabel) portalLabel.textContent = portalText;
          if (stateLabel) stateLabel.textContent = `Estado: ${stateText}`;
          if (phaseLabel) phaseLabel.textContent = phaseText ? `Fase: ${phaseText}` : 'Fase: não informada';
          if (countLabel) countLabel.textContent = hasCounts ? `${progressSource.completed} de ${progressSource.total} itens` : 'Progresso não mensurável';
          if (modalFill) modalFill.style.width = percent === null ? '0%' : `${percent}%`;
          if (percentLabel) percentLabel.textContent = percent === null ? 'Em andamento' : `${percent}%`;
          if (modalTrack) {
            if (percent === null) modalTrack.removeAttribute?.('aria-valuenow');
            else modalTrack.setAttribute?.('aria-valuenow', String(percent));
            modalTrack.classList.toggle?.('is-indeterminate', percent === null);
          }
          updateGlobal(jobState === 'ERROR' ? 'error' : (jobState === 'COMPLETED_WITH_WARNINGS' ? 'warning' : 'syncing'), `${portalText}: ${actionText}`, percent, percent !== null);
          if (currentAction) currentAction.textContent = actionText;

          if (telemetryPortal?.action) appendLog(`[${telemetryPortal.portalId}] ${telemetryPortal.action}`);
          const backendStep = Number(telemetryPortal?.step || 0);
          if (backendStep > 0) {
            for (let step = 1; step <= 5; step++) {
              setStepStatus(step, step < backendStep ? 'completed' : (step === backendStep ? 'active' : 'waiting'));
            }
          }
          return { jobState, percent, portals };
        };

        if (!silent) feature.openEprocSyncModal();
        for (let step = 1; step <= 5; step++) setStepStatus(step, step === 1 ? 'active' : 'waiting');
        doneBtn?.classList.add('hidden');
        minimizeBtn?.classList.remove('hidden');
        reportErrorBtn?.classList.add('hidden');
        updateGlobal('syncing', 'Iniciando a sincronização com os tribunais...', null, false);
        modalTrack?.removeAttribute?.('aria-valuenow');
        modalTrack?.classList.add('is-indeterminate');
        if (modalFill) modalFill.style.width = '0%';
        if (percentLabel) percentLabel.textContent = 'Em andamento';
        if (statusLabel) statusLabel.textContent = 'Sincronizando...';
        if (consoleStatus) consoleStatus.textContent = 'Em execução';
        if (stateLabel) stateLabel.textContent = 'Estado: pendente';
        if (phaseLabel) phaseLabel.textContent = 'Fase: iniciando';
        if (countLabel) countLabel.textContent = 'Progresso não mensurável';
        if (currentAction) currentAction.textContent = 'Iniciando a sincronização com os tribunais...';
        appendLog(existingJobId ? 'Reconectando ao job de sincronização ativo...' : 'Disparando o pipeline real de sincronização dos tribunais...');

        try {
          let triggerRes;
          if (existingJobId) {
            triggerRes = { jobId: existingJobId, joinedExisting: true };
          } else {
            try {
              const selectedPortalIds = Array.isArray(portalIds) && portalIds.length
                ? portalIds
                : [...(documentRef.querySelectorAll?.('[data-portal-enabled]:checked') || [])].map(input => input.value).filter(Boolean);
              triggerRes = await feature.request('/api/integrations/eproc/sync', selectedPortalIds.length ? { portals: selectedPortalIds } : {});
            } catch (triggerError) {
              appendLog('A resposta de início não foi confirmada; consultando o estado do servidor.', 'warning');
              const recovered = await readEprocSyncStatusWithRetry();
              const recoveredState = String(recovered?.job?.state || recovered?.job?.status || '').toUpperCase();
              if (recovered?.active && recovered.job?.id && ['RUNNING', 'PENDING'].includes(recoveredState)) {
                triggerRes = { jobId: recovered.job.id, joinedExisting: true };
              } else {
                markTrackingUnavailable('Não foi possível confirmar o início. O servidor pode continuar processando; tente acompanhar novamente.');
                return false;
              }
            }
          }

          eprocSyncJobId = triggerRes.jobId || triggerRes.id || existingJobId;
          if (!eprocSyncJobId) {
            markTrackingUnavailable('O servidor não informou o identificador do job. O processamento não foi marcado como falha.');
            return false;
          }
          updateGlobal('syncing', 'Sincronização eproc em andamento.', null, false);
          if (jobIdLabel) jobIdLabel.textContent = `Job ${eprocSyncJobId}`;
          appendLog(triggerRes.joinedExisting
            ? `Conectado à sincronização ativa (Job ${eprocSyncJobId}).`
            : `Job de sincronização iniciado (ID: ${eprocSyncJobId}).`);

          while (true) {
            await sleepFn(pollIntervalMs);
            const snapshot = await readEprocSyncStatus();
            const job = snapshot?.job;
            if (!job?.id) continue;
            if (job.id !== eprocSyncJobId) {
              warn?.(`Status eproc ignorado: esperado ${eprocSyncJobId}, recebido ${job.id}.`);
              continue;
            }

            const { jobState, percent, portals } = renderJob(job);
            if (jobState === 'COMPLETED') {
              for (let step = 1; step <= 5; step++) setStepStatus(step, 'completed');
              if (percentLabel && percent === null) percentLabel.textContent = 'Concluída';
              if (statusLabel) statusLabel.textContent = 'Conclusão confirmada pelo backend';
              if (currentAction) currentAction.textContent = 'A sincronização dos tribunais foi confirmada pelo backend.';
              if (consoleStatus) consoleStatus.textContent = 'Concluída';
              updateGlobal('saved', 'Sincronização eproc concluída e confirmada pelo backend.', percent, percent !== null);
              modalTrack?.classList.remove('is-indeterminate');
              appendLog('Conclusão real confirmada pelo pipeline dos tribunais.', 'success');
              doneBtn?.classList.remove('hidden');
              minimizeBtn?.classList.add('hidden');
              reportErrorBtn?.classList.add('hidden');
              showToast('Sincronização eproc confirmada pelo backend.', 'success');
              audit('Sincronização judicial supervisionada', 'Pipeline dos tribunais concluído e confirmado pelo backend.');
              await feature.refreshStatus();
              return true;
            }

            if (jobState === 'COMPLETED_WITH_WARNINGS') {
              const partialPortal = portals.find(portal => portal.state === 'PARTIAL');
              const message = partialPortal?.error || job.error || 'A coleta avançou, mas registrou ressalvas em um ou mais itens.';
              for (let step = 1; step <= 5; step++) setStepStatus(step, 'completed');
              if (statusLabel) statusLabel.textContent = 'Concluída com ressalvas';
              if (stateLabel) stateLabel.textContent = 'Estado: Concluída com ressalvas';
              if (currentAction) currentAction.textContent = message;
              if (consoleStatus) consoleStatus.textContent = 'Concluída com ressalvas';
              if (percentLabel && percent === null) percentLabel.textContent = 'Com ressalvas';
              updateGlobal('warning', message, percent, percent !== null);
              modalTrack?.classList.remove('is-indeterminate');
              appendLog(`Concluída com ressalvas: ${message}`, 'warning');
              doneBtn?.classList.remove('hidden');
              minimizeBtn?.classList.add('hidden');
              reportErrorBtn?.classList.add('hidden');
              showToast('Sincronização concluída com ressalvas. O que foi coletado foi guardado.', 'warning');
              audit('Sincronização judicial supervisionada', `Pipeline dos tribunais concluído com ressalvas: ${message}`.slice(0, 500));
              await feature.refreshStatus();
              return true;
            }

            if (jobState === 'ERROR') {
              const failedPortal = portals.find(portal => portal.state === 'ERROR');
              const message = failedPortal?.error || job.error || 'Erro durante a sincronização eproc.';
              if (statusLabel) statusLabel.textContent = 'Erro confirmado pelo backend';
              if (stateLabel) stateLabel.textContent = 'Estado: Erro';
              if (currentAction) currentAction.textContent = message;
              if (consoleStatus) consoleStatus.textContent = 'Interrompida';
              updateGlobal('error', message, percent, percent !== null);
              modalTrack?.classList.remove('is-indeterminate');
              if (percentLabel) percentLabel.textContent = 'Interrompida';
              doneBtn?.classList.remove('hidden');
              minimizeBtn?.classList.add('hidden');
              if (reportErrorBtn && typeof onReportError === 'function') {
                reportErrorBtn.classList.remove('hidden');
                reportErrorBtn.onclick = () => {
                  void onReportError({
                    scope: `Sincronização eproc${failedPortal?.portalId ? ` · ${failedPortal.portalId}` : ''}`,
                    message,
                    details: [
                      `Job: ${eprocSyncJobId || 'não informado'}`,
                      `Portal: ${failedPortal?.portalId || 'não informado'}`,
                      `Estado: ${jobState}`,
                      `Quando: ${new Date().toISOString()}`
                    ].join('\n')
                  });
                };
              }
              appendLog(`Erro confirmado pelo backend: ${message}`, 'danger');
              showToast(`Falha na sincronização: ${message}`, 'error');
              await feature.refreshStatus();
              return false;
            }

            if (jobState === 'CANCELLED') {
              const message = job.error || 'A sincronização foi cancelada pelo backend.';
              if (statusLabel) statusLabel.textContent = 'Cancelamento confirmado pelo backend';
              if (stateLabel) stateLabel.textContent = 'Estado: Cancelada';
              if (currentAction) currentAction.textContent = message;
              if (consoleStatus) consoleStatus.textContent = 'Cancelada';
              updateGlobal('error', message, null, false);
              modalTrack?.classList.remove('is-indeterminate');
              if (percentLabel) percentLabel.textContent = 'Cancelada';
              doneBtn?.classList.remove('hidden');
              minimizeBtn?.classList.add('hidden');
              appendLog(message, 'warning');
              showToast(message, 'warning');
              await feature.refreshStatus();
              return false;
            }
          }
        } catch (error) {
          warn?.('Acompanhamento local do job eproc interrompido:', error?.message || error);
          markTrackingUnavailable('O acompanhamento local foi interrompido, mas o job não foi marcado como falha. Consulte novamente o estado do servidor.');
        } finally {
          eprocSyncPollPromise = null;
          if (button) {
            button.disabled = false;
            button.innerHTML = originalText;
          }
        }
      })();
      return eprocSyncPollPromise;
    }
  };

  return feature;
}

async function decodeQrWithJsQr(file, { windowRef, documentRef }) {
  let imageSource;
  let objectUrl = '';
  try {
    if (typeof windowRef.createImageBitmap === 'function') {
      imageSource = await windowRef.createImageBitmap(file);
    } else {
      const ImageConstructor = windowRef.Image || globalThis.Image;
      imageSource = new ImageConstructor();
      const imageLoaded = new Promise((resolve, reject) => {
        imageSource.onload = () => resolve();
        imageSource.onerror = () => reject(new Error('Falha ao carregar arquivo de imagem.'));
      });
      objectUrl = windowRef.URL.createObjectURL(file);
      imageSource.src = objectUrl;
      await imageLoaded;
    }
    const sourceWidth = imageSource.naturalWidth || imageSource.width;
    const sourceHeight = imageSource.naturalHeight || imageSource.height;
    if (!sourceWidth || !sourceHeight) throw new Error('A imagem do QR não possui dimensões válidas.');

    const largestSide = Math.max(sourceWidth, sourceHeight);
    const normalizedScale = largestSide > 2400 ? 2400 / largestSide : 1;
    const scales = [...new Set([
      normalizedScale,
      Math.min(normalizedScale * 1.5, 3000 / largestSide),
      largestSide < 1000 ? Math.min(normalizedScale * 2, 3000 / largestSide) : normalizedScale,
      Math.max(normalizedScale * 0.75, 0.25)
    ].map(value => Number(value.toFixed(3))))];
    const transformations = ['original', 'grayscale', 'contrast'];

    for (const scale of scales) {
      for (const addQuietZone of [false, true]) {
        const scaledWidth = Math.max(1, Math.round(sourceWidth * scale));
        const scaledHeight = Math.max(1, Math.round(sourceHeight * scale));
        const padding = addQuietZone ? Math.max(16, Math.round(Math.max(scaledWidth, scaledHeight) * 0.06)) : 0;
        const canvas = documentRef.createElement('canvas');
        canvas.width = scaledWidth + padding * 2;
        canvas.height = scaledHeight + padding * 2;
        const context = canvas.getContext('2d', { willReadFrequently: true });
        if (!context) continue;
        context.fillStyle = '#ffffff';
        context.fillRect?.(0, 0, canvas.width, canvas.height);
        context.imageSmoothingEnabled = false;
        context.drawImage(imageSource, padding, padding, scaledWidth, scaledHeight);
        const source = context.getImageData(0, 0, canvas.width, canvas.height);

        for (const transformation of transformations) {
          const candidate = transformation === 'original' ? source : transformQrPixels(source, transformation);
          const result = windowRef.jsQR(candidate.data, candidate.width, candidate.height, { inversionAttempts: 'attemptBoth' });
          if (result?.data) return String(result.data).trim();
        }
      }
    }
    return '';
  } finally {
    imageSource?.close?.();
    if (objectUrl) windowRef.URL.revokeObjectURL(objectUrl);
  }
}

function transformQrPixels(imageData, mode) {
  const data = new Uint8ClampedArray(imageData.data);
  let luminanceTotal = 0;
  for (let index = 0; index < data.length; index += 4) {
    luminanceTotal += Math.round(data[index] * 0.299 + data[index + 1] * 0.587 + data[index + 2] * 0.114);
  }
  const threshold = luminanceTotal / Math.max(1, data.length / 4);
  for (let index = 0; index < data.length; index += 4) {
    const luminance = Math.round(data[index] * 0.299 + data[index + 1] * 0.587 + data[index + 2] * 0.114);
    const value = mode === 'contrast' ? (luminance < threshold ? 0 : 255) : luminance;
    data[index] = value;
    data[index + 1] = value;
    data[index + 2] = value;
  }
  return { data, width: imageData.width, height: imageData.height };
}
