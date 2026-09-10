import { Store, isoDate, uid } from '../core/store.js';
import { createProcessesV2Presenter } from '../views/ui-v2/processes-presenter.js';
import { iconSvg } from '../views/ui-v2/icons.js';
import { buildLegalTimeline } from '../core/legal-timeline.js';

export function createProcessesFeature({
  store = Store,
  documentRef = globalThis.document,
  normalizeText,
  escapeHtml,
  formatDate,
  formatMinutes,
  totalTimeMinutes,
  sortRecords,
  updateTableSortHeaders,
  openModal,
  showToast,
  secureFetch,
  getLinkedTasks,
  getLinkedIntimations,
  isTerminalStatus,
  openOwnerDocuments,
  openClient,
  openLinkedTasks,
  openTask,
  openPublication,
  openAgenda,
  openFinancial,
  openAssistant,
  exportJson,
  confirmProcessDeletion = number => globalThis.prompt?.(`Para excluir o processo ${number}, digite o número completo:`) || '',
  requestProcessReenable = () => globalThis.prompt?.('Digite o número CNJ cuja descoberta automática deve ser reativada:') || ''
} = {}) {
  let initialized = false;
  const sort = { field: 'registeredAt', direction: 'desc' };
  const byId = id => documentRef?.getElementById(id);
  const isV2 = () => documentRef?.documentElement?.dataset?.ui === 'v2';
  let processesPresenter;
  let pendingTjrsDraft = null;
  let pendingTjrsAppliedFields = new Map();
  let pendingAccessKeyProcess = null;
  const processAccessKeys = new Map();

  const getPresenter = () => {
    processesPresenter ||= createProcessesV2Presenter({
      documentRef,
      escapeHtml,
      formatDate,
      formatMinutes,
      getHasA1Certificate: () => store.state?.settings?.hasA1Certificate !== false,
      onEdit: item => feature.openProcessModal(item),
      onConsult: (button, item) => feature.consultTjrs(button, item),
      onDownloadAutos: (button, item) => feature.downloadAutos(button, item),
      onDownloadEprocA1: (button, item) => feature.downloadEprocA1(button, item),
      onDocuments: (item, documentId) => openOwnerDocuments?.('process', item.id, documentId),
      onPreviewDocument: async doc => {
        if (!doc?.id) throw new Error('Documento inválido');
        const secureFetchFn = globalThis.KellerAuth?.secureFetch || globalThis.fetch;
        const response = await secureFetchFn(`/api/documents/${encodeURIComponent(doc.id)}/preview`, {
          headers: { Accept: 'text/plain,image/png,image/jpeg,image/webp' }
        });
        if (!response.ok) throw new Error('Não foi possível carregar a visualização deste documento.');
        const contentType = String(response.headers.get('content-type') || '').toLowerCase();
        if (contentType.startsWith('image/')) {
          const buffer = await response.arrayBuffer();
          const bytes = new Uint8Array(buffer);
          let binary = '';
          for (let i = 0; i < bytes.length; i += 0x8000) {
            binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
          }
          return { type: 'image', src: `data:${contentType.split(';')[0]};base64,${globalThis.btoa(binary)}` };
        } else {
          const text = await response.text();
          return { type: 'text', text };
        }
      },
      onDownloadDocument: async doc => {
        const docId = doc?.id;
        if (!docId) return;
        const name = doc?.name || doc?.originalName || 'documento.pdf';
        const secureFetchFn = globalThis.KellerAuth?.secureFetch || globalThis.fetch;
        const response = await secureFetchFn(`/api/documents/${encodeURIComponent(docId)}/content`, {
          headers: { Accept: 'application/octet-stream' }
        });
        if (!response.ok) throw new Error('Falha ao baixar arquivo.');
        const blob = await response.blob();
        const url = globalThis.URL.createObjectURL(blob);
        const a = documentRef.createElement('a');
        a.href = url;
        a.download = name;
        a.click();
        globalThis.URL.revokeObjectURL(url);
      },
      onClient: item => openClient?.(item),
      onTasks: item => openLinkedTasks?.(item),
      onTask: task => openTask?.(task),
      onPublication: publication => openPublication?.(publication),
      onAgenda: event => {
        const appointment = (store.state.agenda || []).find(item => String(item.id) === String(event?.entityId || ''));
        if (appointment) openAgenda?.(appointment);
      },
      onFinancial: item => openFinancial?.(item),
      onAssistant: item => openAssistant?.(item),
      onAccessKey: item => feature.openAccessKeyDialog(item),
      onAccessKeyStatus: item => feature.refreshAccessKeyStatus(item),
      onCreateTask: item => {
        const linkedContact = (store.state.contacts || []).find(contact => String(contact.id) === String(item.contactId || ''))
          || (store.state.contacts || []).find(contact => normalizeText(contact.name) === normalizeText(item.client));
        openTask?.({
          processId: item.id || '',
          process: item.number || item.protocol || '',
          contactId: linkedContact?.id || item.contactId || '',
          client: linkedContact?.name || item.client || '',
          actionType: item.actionType || item.subject || '',
          source: 'Interna'
        });
      },
      onExport: item => feature.exportProcess(item),
      onDelete: item => feature.deleteProcess(item)
    });
    return processesPresenter;
  };

  const canConsultTjrs = item => String(item.number || '').includes('.8.21.') || String(item.court || '').toUpperCase().includes('TJRS');

  const getProcessSummary = item => {
    const processNumber = String(item?.number || item?.protocol || '').trim();
    const directLinks = records => (records || []).filter(record => String(record?.processId || '') === String(item?.id || ''));
    const ownerLinks = records => (records || []).filter(record => record?.ownerType === 'process' && String(record?.ownerId || '') === String(item?.id || ''));
    const numberLinks = records => (records || []).filter(record => processNumber && String(record?.process || record?.processNumber || '').trim() === processNumber);
    const uniqueLinks = records => [...new Map(records.filter(Boolean).map(record => [String(record.id || ''), record])).values()];
    const linkedTasks = item?.id ? uniqueLinks([...(getLinkedTasks?.(processNumber) || []), ...directLinks(store.state.tasks)]) : [];
    const linkedIntimations = item?.id ? uniqueLinks([...(getLinkedIntimations?.(processNumber) || []), ...directLinks(store.state.intimations)]) : [];
    const linkedAppointments = item?.id ? uniqueLinks([...directLinks(store.state.agenda), ...numberLinks(store.state.agenda)]) : [];
    const linkedDocuments = item?.id ? uniqueLinks([...ownerLinks(store.state.documents), ...directLinks(store.state.documents), ...numberLinks(store.state.documents)]).filter(record => !record.deletedAt) : [];
    const openTasks = linkedTasks.filter(task => !isTerminalStatus(task.status));
    const timeMinutes = linkedTasks.reduce((total, task) => total + totalTimeMinutes(task.timeLogs), 0);
    const nextDeadline = openTasks.map(task => task.fatalDeadline || task.deadline).filter(Boolean).sort()[0];
    return Object.freeze({
      processNumber,
      openTasks: openTasks.length,
      linkedIntimations: linkedIntimations.length,
      timeMinutes,
      nextDeadline,
      linkedTasks,
      linkedIntimationRecords: linkedIntimations,
      linkedAppointments,
      linkedDocuments,
      movements: Array.isArray(item.movements) ? item.movements : [],
      timeline: buildLegalTimeline(store.state, item, { order: 'autos' }),
      canConsultTjrs: canConsultTjrs(item)
    });
  };

  const feature = {
    init() {
      if (initialized) return false;
      initialized = true;
      byId('newProcessButton')?.addEventListener('click', () => this.openProcessModal());
      byId('btnSyncEprocA1')?.addEventListener('click', () => this.syncEprocA1());
      byId('processSearch')?.addEventListener('input', event => this.render(event.target.value));
      byId('processSuppressionButton')?.addEventListener('click', () => this.reenableProcessDiscovery());
      byId('processAccessKeyCancel')?.addEventListener('click', () => this.closeAccessKeyDialog());
      byId('processAccessKeyClose')?.addEventListener('click', () => this.closeAccessKeyDialog());
      byId('processAccessKeyBackdrop')?.addEventListener('click', event => {
        if (event.target === byId('processAccessKeyBackdrop')) this.closeAccessKeyDialog();
      });
      byId('processAccessKeyBackdrop')?.addEventListener('keydown', event => {
        if (event.key !== 'Escape') return;
        event.preventDefault();
        event.stopPropagation();
        this.closeAccessKeyDialog();
      });
      byId('processAccessKeyForm')?.addEventListener('submit', event => this.saveAccessKey(event));
      getPresenter().init();
      if (typeof globalThis.setTimeout === 'function') {
        globalThis.setTimeout(() => {
          const candidates = (store.state.processes || []).filter(p => {
            const isTjrs = String(p.number || '').includes('.8.21.') || String(p.court || '').toUpperCase().includes('TJRS');
            if (!isTjrs) return false;
            const client = String(p.client || '').trim();
            const isMissingClient = !client || /^(?:cliente\s+)?(?:geral|n[aã]o\s+informado|n[aã]o\s+identificado|modelo|do\s+escrit[oó]rio|sigilo|n\/?i|sem\s+cliente)$/i.test(client);
            const isSecrecy = Boolean(p.secrecy) || /sigilo|segredo/i.test(client);
            return isMissingClient || isSecrecy;
          });
          if (candidates.length > 0 && !this._autoSyncDone) {
            this._autoSyncDone = true;
            this.syncEprocA1({ silent: true }).catch(() => {});
          }
        }, 3500);
      }
      return true;
    },

    handleSort(field) {
      if (sort.field === field) {
        sort.direction = sort.direction === 'asc' ? 'desc' : 'asc';
      } else {
        sort.field = field;
        sort.direction = field.includes('At') || field.includes('date') ? 'desc' : 'asc';
      }
      this.render(byId('processSearch')?.value || '');
      return { ...sort };
    },

    upsertExternalProcess(record) {
      const incoming = safeExternalRecord(record);
      const identity = processIdentity(incoming);
      if (!identity) return null;
      if (isProcessSuppressed(store.state, incoming.number)) return null;
      store.state.processes = Array.isArray(store.state.processes) ? store.state.processes : [];
      const index = store.state.processes.findIndex(item => processIdentity(item) === identity);
      const merged = mergeExternalProcess(index >= 0 ? store.state.processes[index] : null, incoming);
      if (!merged.id) merged.id = incoming.id || uid('proc');
      if (index >= 0) store.state.processes[index] = merged;
      else store.state.processes.unshift(merged);
      return merged;
    },

    render(query = '') {
      const needle = normalizeText(query);
      const allProcesses = Array.isArray(store.state.processes) ? store.state.processes : [];
      const suppressions = processSuppressions(store.state);
      const suppressionButton = byId('processSuppressionButton');
      if (suppressionButton) {
        suppressionButton.classList.toggle('hidden', suppressions.length === 0);
        suppressionButton.textContent = `Reativar descoberta (${suppressions.length})`;
      }
      const btnSyncEproc = byId('btnSyncEprocA1');
      if (btnSyncEproc) {
        const hasA1 = store.state?.settings?.hasA1Certificate !== false;
        btnSyncEproc.classList.toggle('hidden', !hasA1);
      }
      let records = allProcesses
        .map(item => ({ ...item, resolvedClient: resolveProcessClient(item, store.state.contacts) }))
        .filter(item => !needle || normalizeText(`${item.number} ${item.resolvedClient || item.client} ${item.court} ${item.county || ''} ${item.nb || ''} ${item.opposingParty || ''} ${item.registeredAt || item.createdAt || ''}`).includes(needle));
      records = sortRecords(records, sort);
      updateTableSortHeaders('processTable', sort);
      const presenter = getPresenter();
      if (isV2()) {
        presenter.close({ restoreFocus: false });
        presenter.updateCount({ visible: records.length, total: allProcesses.length, query: String(query || '').trim() });
        byId('processTableBody').innerHTML = records.length
          ? presenter.renderRows(records)
          : presenter.renderEmpty({ hasProcesses: allProcesses.length > 0, query: String(query || '').trim() });
      } else {
        presenter.close({ restoreFocus: false });
        byId('processTableBody').innerHTML = records.length ? records.map(item => {
        const registeredDate = item.registeredAt || item.createdAt;
        let feeBadge = '';
        if (item.feeAmount && Number(item.feeAmount) > 0) {
          feeBadge = `<span class="fee-chip fixo">Valor: R$ ${Number(item.feeAmount).toLocaleString('pt-BR')}</span>`;
        } else if (item.feePercentage && Number(item.feePercentage) > 0) {
          const feeStatusClass = ['quitado', 'repassado', 'em_dia'].includes(item.feeStatus) ? 'fee-status-paid' : item.feeStatus === 'pendente' ? 'fee-status-pending' : 'fee-status-waiting';
          feeBadge = `<span class="fee-chip ${escapeHtml(item.feeType || 'exito')}">${escapeHtml(item.feePercentage)}% êxito<span class="fee-status-badge ${feeStatusClass}">${escapeHtml(item.feeStatus || 'regular')}</span></span>`;
        } else if (item.feeType && item.feeType !== 'exito' && item.feeType !== 'none') {
          const feeStatusClass = ['quitado', 'repassado', 'em_dia'].includes(item.feeStatus) ? 'fee-status-paid' : item.feeStatus === 'pendente' ? 'fee-status-pending' : 'fee-status-waiting';
          feeBadge = `<span class="fee-chip ${escapeHtml(item.feeType)}">${escapeHtml(item.feeType.toUpperCase())}<span class="fee-status-badge ${feeStatusClass}">${escapeHtml(item.feeStatus || 'regular')}</span></span>`;
        }

        const nbChip = item.nb ? `<span class="nb-chip" title="Número do Benefício INSS">NB ${escapeHtml(item.nb)}</span>` : '';
        const riskChip = item.risk ? `<span class="risk-chip ${item.risk === 'remoto' ? 'remoto' : item.risk === 'possivel' ? 'possivel' : 'provavel'}" title="Probabilidade de Êxito">${item.risk === 'remoto' ? 'Risco Alto' : item.risk === 'possivel' ? 'Risco Médio' : 'Êxito Provável'}</span>` : '';
        const tjrsButton = canConsultTjrs(item) ? `<button type="button" class="btn-tjrs-consult" data-tjrs-consult="${escapeHtml(item.number)}" title="Atualizar o processo com os dados disponíveis no TJRS">${iconSvg('court')}Atualizar TJRS</button>` : '';

        const clientPosition = item.clientPosition ? `<small style="color:var(--gold-soft);">${escapeHtml(item.clientPosition)}</small> ` : '';
        const opposingParty = item.opposingParty ? `<small> vs ${escapeHtml(item.opposingParty)}</small>` : '';

        return `
        <tr data-process-id="${escapeHtml(item.id)}" tabindex="0">
          <td>
            <strong>${escapeHtml(item.number || item.protocol || 'Sem número')}</strong>
            <small>${item.secrecy ? 'Segredo de justiça' : 'Consulta pública'}${item.caseFolder ? ` · ${escapeHtml(item.caseFolder)}` : ''}</small>
            ${nbChip}
          </td>
          <td>
            ${clientPosition}<strong>${escapeHtml(item.client)}</strong>${opposingParty}
            ${feeBadge ? `<br>${feeBadge}` : ''}
          </td>
          <td>
            <strong>${escapeHtml(item.court || item.county || '—')}</strong>
            <small>${escapeHtml([...new Set([item.actionType, item.judicialPhase, item.stage].filter(Boolean))].join(' · '))}</small>
            <div>${riskChip}</div>
          </td>
          <td>
            <strong>${formatDate(registeredDate)}</strong>
            <small>${escapeHtml(item.source || 'eproc / Cadastro')}</small>
            ${tjrsButton}
          </td>
          <td><strong>${escapeHtml(item.lastMovement || 'Sem movimentação')}</strong><small>${formatDate(item.lastMovementAt)}</small></td>
          <td>${item.monitoring === 'active' ? '<span class="status-chip connected">Monitorando</span>' : '<span class="status-chip warning">Atenção</span>'}</td>
        </tr>`;
        }).join('') : '<tr><td colspan="6">Nenhum processo encontrado.</td></tr>';
      }

      byId('processTableBody')?.querySelector('[data-process-create]')?.addEventListener('click', () => this.openProcessModal());

      documentRef.querySelectorAll('#processTableBody [data-process-id]').forEach(row => row.addEventListener('click', event => {
        if (event.target.closest('.btn-tjrs-consult, [data-tjrs-consult]')) return;
        const item = store.state.processes.find(record => record.id === row.dataset.processId);
        if (!item) return;
        if (isV2()) presenter.open(item, getProcessSummary(item), event.target.closest('[data-process-details]') || row);
        else this.openProcessModal(item);
      }));

      documentRef.querySelectorAll('#processTableBody [data-tjrs-consult]').forEach(button => {
        button.addEventListener('click', event => {
          event.stopPropagation();
          this.consultTjrs(button);
        });
      });
      return records;
    },

    closeInspector(options) {
      return getPresenter().close(options);
    },

    exportProcess(item) {
      const dossier = buildProcessDossier(store.state, item);
      const digits = String(item?.number || item?.id || 'sem-numero').replace(/\D/g, '') || 'sem-numero';
      exportJson?.(dossier, `processo-${digits}.json`);
      item.dossierDownloadedAt = new Date().toISOString();
      store.save();
      const button = byId('processInspectorExport');
      if (button) {
        button.textContent = 'Dados exportados';
        button.classList.add('is-complete');
        button.title = 'Exportar novamente o backup técnico deste processo';
      }
      showToast?.('Backup técnico exportado em JSON. Ele serve para guardar ou transferir os dados do processo; os autos em PDF ficam em “Gerar caderno em PDFs”.', 'success');
      return dossier;
    },

    async refreshAccessKeyStatus(item) {
      const panel = byId('processInspectorContent')?.querySelector('[data-process-access-key-status]');
      const keyButton = byId('processInspectorAccessKey');
      if (!item?.number) return false;
      try {
        const response = await secureFetch(`/api/integrations/tjrs-sidecar/processes/access-key/status?processNumber=${encodeURIComponent(item.number)}`, { headers: { Accept: 'application/json' } });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || !result.ok) throw new Error(result.message || 'Status indisponível.');
        if (panel) {
          panel.dataset.processAccessKeyStatus = result.configured ? 'configured' : 'missing';
          panel.querySelector('[data-process-access-key-copy]').textContent = result.configured
            ? 'Chave cadastrada no cofre cifrado. Ela será usada automaticamente nas próximas consultas.'
            : 'Chave ausente. Cadastre-a para consultar processos restritos e manter o monitoramento completo.';
          panel.querySelector('[data-process-access-key]').textContent = result.configured ? 'Trocar chave' : 'Adicionar chave';
        }
        if (keyButton) {
          if (result.configured) {
            keyButton.textContent = 'Chave cadastrada';
            keyButton.disabled = true;
            keyButton.classList.remove('is-available');
            keyButton.classList.add('is-configured', 'is-complete');
            keyButton.title = 'Chave de acesso do eproc já cadastrada para este processo.';
          } else {
            keyButton.textContent = 'Adicionar Chave';
            keyButton.disabled = false;
            keyButton.classList.add('is-available');
            keyButton.classList.remove('is-configured', 'is-complete');
            keyButton.title = 'Adicionar chave de acesso para consulta restrita e autos.';
          }
        }
        return result.configured;
      } catch {
        if (panel) {
          panel.dataset.processAccessKeyStatus = 'unknown';
          panel.querySelector('[data-process-access-key-copy]').textContent = 'Não foi possível confirmar a chave no cofre local.';
        }
        return false;
      }
    },

    openAccessKeyDialog(item, { reason = '' } = {}) {
      if (!item?.id || !item?.number) return false;
      pendingAccessKeyProcess = item;
      byId('processAccessKeyNumber').textContent = item.number;
      byId('processAccessKeyMessage').textContent = reason || 'Informe a chave exibida pelo eproc para liberar a consulta restrita deste processo.';
      byId('processAccessKeyInput').value = '';
      byId('processAccessKeyBackdrop').classList.remove('hidden');
      queueMicrotask(() => byId('processAccessKeyInput')?.focus());
      return true;
    },

    closeAccessKeyDialog() {
      byId('processAccessKeyBackdrop')?.classList.add('hidden');
      if (byId('processAccessKeyInput')) byId('processAccessKeyInput').value = '';
      pendingAccessKeyProcess = null;
      byId('processInspectorContent')?.querySelector('[data-process-access-key]')?.focus();
    },

    async saveAccessKey(event) {
      event?.preventDefault?.();
      const item = pendingAccessKeyProcess;
      const accessKey = cleanAccessKey(byId('processAccessKeyInput')?.value);
      if (!item || !accessKey) {
        showToast?.('Informe a chave de acesso do processo.', 'error');
        return false;
      }
      const submit = byId('processAccessKeySave');
      if (submit) { submit.disabled = true; submit.textContent = 'Validando…'; }
      try {
        const response = await secureFetch('/api/integrations/tjrs-sidecar/processes/access-key', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ processNumber: item.number, accessKey })
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || !result.ok) throw new Error(result.message || 'Não foi possível guardar a chave.');
        processAccessKeys.delete(item.id);
        this.closeAccessKeyDialog();
        await this.refreshAccessKeyStatus(item);
        try {
          const syncResponse = await secureFetch('/api/integrations/tjrs-sidecar/processes/sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({ processId: item.id, processNumber: item.number, revision: store.revision })
          });
          const syncResult = await syncResponse.json().catch(() => ({}));
          if (!syncResponse.ok || !syncResult.ok || !syncResult.process) throw new Error(syncResult.message || 'Use “Atualizar TJRS” para tentar novamente.');
          const index = store.state.processes.findIndex(process => process.id === item.id);
          if (index >= 0) store.state.processes[index] = syncResult.process;
          store.revision = syncResult.revision || store.revision;
          this.render(byId('processSearch')?.value || '');
          if (index >= 0) getPresenter().open(store.state.processes[index], getProcessSummary(store.state.processes[index]), null);
          showToast?.('Chave validada e processo atualizado com os dados do TJRS.', 'success');
        } catch (syncError) {
          showToast?.(`A chave foi validada e guardada. A atualização da ficha do processo ficou pendente: ${syncError.message}`, 'error');
        }
        return true;
      } catch (error) {
        showToast?.(error.message || 'Não foi possível guardar a chave.', 'error');
        return false;
      } finally {
        if (submit) { submit.disabled = false; submit.textContent = 'Validar e guardar chave'; }
      }
    },

    async deleteProcess(item) {
      const number = String(item?.number || item?.protocol || '').trim();
      if (!item?.id || !number) return false;
      const confirmation = String(await confirmProcessDeletion(number) || '').trim();
      if (confirmation !== number) {
        showToast?.('Exclusão cancelada: o número informado não confere.', 'error');
        return false;
      }
      const snapshot = snapshotProcessCollections(store.state);
      try {
        store.state.processes = (store.state.processes || []).filter(record => record.id !== item.id);
        unlinkProcessReferences(store.state, item);
        if (isExternallyDiscoveredProcess(item)) addProcessSuppression(store.state, item);
        store.audit('Processo excluído', `${number} · registros vinculados preservados e desvinculados`);
        if (!await store.flush()) throw new Error('Não foi possível persistir a exclusão do processo.');
        getPresenter().close({ restoreFocus: false });
        feature.render(byId('processSearch')?.value || '');
        showToast?.('Processo excluído. Registros vinculados foram preservados.', 'success');
        return true;
      } catch (error) {
        restoreProcessCollections(store.state, snapshot);
        feature.render(byId('processSearch')?.value || '');
        showToast?.(error.message || 'Não foi possível excluir o processo.', 'error');
        return false;
      }
    },

    async reenableProcessDiscovery(value) {
      const informed = String(value || await requestProcessReenable() || '').trim();
      const cnj = normalizeCnj(informed);
      const suppressions = processSuppressions(store.state);
      if (!cnj || !suppressions.some(item => normalizeCnj(item?.cnj || item) === cnj)) {
        showToast?.('Nenhuma supressão de descoberta foi localizada para esse número.', 'error');
        return false;
      }
      const previous = structuredClone(suppressions);
      store.state.settings ||= {};
      store.state.settings.processDiscoverySuppressions = suppressions.filter(item => normalizeCnj(item?.cnj || item) !== cnj);
      store.audit('Descoberta processual reativada', formatProcessNumber(cnj));
      if (!await store.flush()) {
        store.state.settings.processDiscoverySuppressions = previous;
        feature.render(byId('processSearch')?.value || '');
        showToast?.('Não foi possível persistir a reativação.', 'error');
        return false;
      }
      feature.render(byId('processSearch')?.value || '');
      showToast?.('Descoberta automática reativada para esse processo.', 'success');
      return true;
    },

    async consultTjrs(button, fallbackItem = null) {
      const processNumber = button?.dataset?.tjrsConsult || fallbackItem?.number;
      const cleanTarget = normalizeCnj(processNumber);
      const process = fallbackItem || store.state.processes.find(item => item.number === processNumber || (cleanTarget && normalizeCnj(item.number) === cleanTarget));
      if (!process?.id) {
        showToast?.('Processo local não encontrado para atualização.', 'error');
        return false;
      }

      const originalLabel = button.textContent;
      const inspectorWasOpen = Boolean(byId('processInspectorBackdrop') && !byId('processInspectorBackdrop').classList.contains('hidden'));
      const isTjrs = normalizeCnj(processNumber).slice(13, 16) === '821';
      showToast?.(isTjrs ? `Buscando os dados mais recentes do processo ${processNumber} no TJRS…` : `Consultando fontes judiciais oficiais para ${processNumber}…`);
      button.disabled = true;
      button.textContent = 'Atualizando…';
      try {
        const syncUrl = isTjrs ? '/api/integrations/tjrs-sidecar/processes/sync' : '/api/integrations/omni/processes/sync';
        const payload = { processId: process.id, processNumber, revision: store.revision };
        const accessKey = processAccessKeys.get(process.id) || '';
        if (isTjrs && accessKey) {
          payload.accessKey = accessKey;
          payload.chaveAcesso = accessKey;
        }
        const response = await secureFetch(syncUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || !result.ok || !result.process) {
          if (isTjrs && result.state === 'STALE') {
            this.openAccessKeyDialog(process, { reason: 'Este processo ainda não foi consultado pelo coletor. Informe a chave do eproc para fazer a primeira consulta ao TJRS.' });
          }
          showToast?.(result.message || (isTjrs ? 'Não foi possível obter os dados deste processo no TJRS.' : 'Não foi possível sincronizar com as fontes judiciais.'), 'error');
          return false;
        }
        const index = store.state.processes.findIndex(item => item.id === process.id);
        if (index >= 0) store.state.processes[index] = result.process;
        store.revision = result.revision || store.revision;
        this.render(byId('processSearch')?.value || '');
        if (inspectorWasOpen && index >= 0) {
          const updated = store.state.processes[index];
          getPresenter().open(updated, getProcessSummary(updated), null);
        }
        showToast?.(result.message || (isTjrs ? 'Dados mais recentes do TJRS incorporados ao processo.' : 'Dados judiciais incorporados ao processo.'), 'success');
        return true;
      } catch (error) {
        showToast?.(isTjrs ? `Falha ao consultar o coletor TJRS local: ${error.message}` : `Falha ao consultar fontes judiciais: ${error.message}`, 'error');
        return false;
      } finally {
        button.disabled = false;
        button.textContent = originalLabel;
      }
    },

    async downloadAutos(button, item) {
      const process = item || store.state.processes.find(record => record.id === button?.dataset?.processId);
      if (!process?.id || !canConsultTjrs(process)) {
        showToast?.('Este recurso exige um processo TJRS cadastrado.', 'error');
        return false;
      }
      const originalLabel = button?.textContent || 'Gerar caderno processual';
      if (button) {
        button.disabled = true;
        button.textContent = 'Gerando PDFs…';
      }
      try {
        const payload = { processId: process.id, processNumber: process.number, revision: store.revision };
        const accessKey = processAccessKeys.get(process.id) || '';
        if (accessKey) {
          payload.accessKey = accessKey;
          payload.chaveAcesso = accessKey;
        }
        const response = await secureFetch('/api/integrations/tjrs-sidecar/processes/download-autos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || !result.ok) {
          showToast?.(result.message || 'Não foi possível gerar o caderno processual.', 'error');
          return false;
        }
        if (Array.isArray(result.documents)) store.state.documents = result.documents;
        store.revision = result.revision || store.revision;
        const refreshed = store.state.processes.find(record => record.id === process.id) || process;
        getPresenter().open(refreshed, getProcessSummary(refreshed), null);
        showToast?.(result.message || 'Caderno processual adicionado ao acervo documental.', 'success');
        return true;
      } catch (error) {
        showToast?.(`Falha ao gerar o caderno processual: ${error.message}`, 'error');
        return false;
      } finally {
        if (button) {
          button.disabled = false;
          button.textContent = originalLabel;
        }
      }
    },

    async downloadEprocA1(button, item) {
      const process = item || store.state.processes.find(record => record.id === button?.dataset?.processId);
      if (!process?.id || !canConsultTjrs(process)) {
        showToast?.('Este recurso exige um processo TJRS cadastrado.', 'error');
        return false;
      }
      const originalHtml = button?.innerHTML || 'Baixar Autos com A1';
      if (button) {
        button.disabled = true;
        button.innerHTML = 'Baixando peças via A1…';
      }
      try {
        const payload = { processId: process.id, processNumber: process.number, revision: store.revision };
        const response = await secureFetch('/api/integrations/eproc/processes/download-autos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || !result.ok) {
          showToast?.(result.message || 'Não foi possível baixar os autos via Certificado A1.', 'error');
          return false;
        }
        if (Array.isArray(result.documents)) store.state.documents = result.documents;
        store.revision = result.revision || store.revision;
        const refreshed = store.state.processes.find(record => record.id === process.id) || process;
        getPresenter().open(refreshed, getProcessSummary(refreshed), null);
        showToast?.(result.message || `${result.piecesCount} peça(s) oficial(is) baixada(s) via Certificado A1 e arquivada(s) no acervo!`, 'success');
        return true;
      } catch (error) {
        showToast?.(`Falha ao baixar autos via A1: ${error.message}`, 'error');
        return false;
      } finally {
        if (button) {
          button.disabled = false;
          button.innerHTML = originalHtml;
        }
      }
    },

    async syncEprocA1({ silent = false } = {}) {
      if (this._syncEprocInFlight) return false;
      const btn = byId('btnSyncEprocA1');
      const originalHtml = btn?.innerHTML;
      this._syncEprocInFlight = true;
      if (btn) {
        btn.disabled = true;
        btn.classList.add('is-busy');
        btn.innerHTML = `<span class="auth-spinner" style="width:14px;height:14px;border-width:2px;display:inline-block;margin-right:6px;"></span><span>Sincronizando eproc A1...</span>`;
      }
      try {
        if (!silent) showToast?.('Iniciando varredura com Certificado Digital A1 no eproc TJRS...', 'info');
        const response = await secureFetch('/api/integrations/eproc/sweep', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ maxProcesses: 10 })
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || !result.ok) {
          throw new Error(result.message || 'Erro ao sincronizar com o eproc TJRS.');
        }
        await store.fetchState?.();
        this.render(byId('processSearch')?.value || '');
        const count = result.enrichedCount || 0;
        if (count > 0) {
          showToast?.(`${count} processo(s) TJRS sincronizado(s) e enriquecido(s) via Certificado A1!`, 'success');
        } else if (!silent) {
          showToast?.(result.message || 'Varredura eproc concluída. Todos os processos já estão enriquecidos.', 'info');
        }
        return true;
      } catch (err) {
        if (!silent) showToast?.(`Falha na sincronização eproc A1: ${err.message}`, 'error');
        console.warn('[processes] Erro ao sincronizar eproc A1:', err);
        return false;
      } finally {
        this._syncEprocInFlight = false;
        if (btn) {
          btn.disabled = false;
          btn.classList.remove('is-busy');
          if (originalHtml) btn.innerHTML = originalHtml;
        }
      }
    },

    openDetails(item) {
      return getPresenter().open(item, getProcessSummary(item), documentRef.activeElement);
    },

    openProcessModal(defaults = {}) {
      pendingTjrsDraft = null;
      pendingTjrsAppliedFields = new Map();
      const actionTypes = (store.state.configuration?.actionTypes || []).map(item => ({ value: item.name, label: item.name }));
      const actionGroups = (store.state.configuration?.actionGroups || []).map(item => ({ value: item.name, label: item.name }));
      const summary = getProcessSummary(defaults);
      const summaryHtml = defaults.id ? `<section class="process-summary-card" data-process-summary>
        <div class="process-summary-heading"><div><span>Resumo rápido do processo</span><strong>${escapeHtml(summary.processNumber || 'Processo sem número')}</strong></div><small>${escapeHtml(defaults.client || 'Cliente não informado')} · ${escapeHtml(defaults.court || 'Órgão não informado')}</small></div>
        <div class="process-summary-metrics">
          <div><strong>${summary.openTasks}</strong><span>Tarefas abertas</span></div>
          <div><strong>${summary.linkedIntimations}</strong><span>Intimações</span></div>
          <div><strong>${escapeHtml(formatMinutes(summary.timeMinutes))}</strong><span>Tempo apontado</span></div>
          <div><strong>${summary.nextDeadline ? formatDate(summary.nextDeadline) : '—'}</strong><span>Próximo prazo</span></div>
        </div>
        <p><b>Último andamento:</b> ${escapeHtml(defaults.lastMovement || 'Ainda não informado.')} ${defaults.lastMovementAt ? `· ${formatDate(defaults.lastMovementAt)}` : ''}</p>
      </section>` : '';

      const tjrsAssistHtml = `<section class="process-tjrs-assist" aria-labelledby="processTjrsAssistHeading">
        <div><span>Cadastro assistido</span><strong id="processTjrsAssistHeading">Consultar processo no TJRS</strong><p>Preenche somente dados judiciais disponíveis. Cliente e posição processual continuam sob sua revisão.</p></div>
        <button type="button" class="button ghost" id="processTjrsPreview">Consultar dados do TJRS</button>
        <div class="process-tjrs-assist-key">
          <label for="field-accessKey">Chave de acesso do eproc</label>
          <input type="password" id="field-accessKey" class="v2-input" autocomplete="off" maxlength="500" placeholder="Informe para processo em segredo de justiça">
          <small>A chave será guardada no cofre cifrado e reutilizada no monitoramento. Deixe em branco para manter a chave já cadastrada.</small>
        </div>
        <div class="process-tjrs-preview-status" id="processTjrsPreviewStatus" aria-live="polite">Informe um CNJ do TJRS no campo abaixo.</div>
      </section>`;

      openModal?.('process', defaults.id ? 'Detalhes do processo' : 'Cadastrar processo', 'Carteira processual', [
        { name: 'number', label: 'Número CNJ', full: true, placeholder: '0000000-00.0000.8.21.0000' },
        { name: 'oldNumber', label: 'Número antigo / físico', placeholder: 'Ex: 029/1.12.0001234-5' },
        { name: 'nb', label: 'NB — Número do Benefício (INSS)', placeholder: 'Ex: 123.456.789-0' },
        { name: 'client', label: 'Cliente principal', required: true },
        { name: 'clientPosition', label: 'Posição do cliente', type: 'select', options: [{value:'Autor(a)',label:'Autor(a)'},{value:'Réu / Ré',label:'Réu / Ré'},{value:'Exequente',label:'Exequente'},{value:'Executado(a)',label:'Executado(a)'},{value:'Reclamante',label:'Reclamante (Trabalhista)'},{value:'Reclamada',label:'Reclamada (Trabalhista)'},{value:'Terceiro Interessado',label:'Terceiro Interessado'},{value:'Litisconsorte',label:'Litisconsorte'}] },
        { name: 'opposingParty', label: 'Parte contrária principal', placeholder: 'Nome da parte adversa' },
        { name: 'actionGroup', label: 'Grupo de ação', type: actionGroups.length ? 'select' : 'text', options: [{value:'',label:'Selecione o grupo'}, ...actionGroups] },
        { name: 'actionType', label: 'Tipo de ação / Matéria', type: actionTypes.length ? 'select' : 'text', options: [{value:'',label:'Selecione o tipo de ação'}, ...actionTypes] },
        { name: 'judicialPhase', label: 'Fase processual', type: 'select', options: [{value:'Conhecimento',label:'Conhecimento'},{value:'Recursal',label:'Recursal'},{value:'Execução / Cumprimento',label:'Execução / Cumprimento'},{value:'Acordo',label:'Acordo'},{value:'Administrativo',label:'Administrativo'},{value:'Arquivado',label:'Arquivado'}] },
        { name: 'risk', label: 'Risco / Probabilidade de êxito (Opcional)', type: 'select', options: [{value:'',label:'Não informado / Sem prognóstico'},{value:'provavel',label:'Provável (Alto êxito)'},{value:'possivel',label:'Possível (Médio risco)'},{value:'remoto',label:'Remoto (Alto risco)'}] },
        { name: 'stage', label: 'Etapa do fluxo' },
        { name: 'protocol', label: 'Protocolo / Local' },
        { name: 'caseFolder', label: 'Pasta física / Caso' },
        { name: 'court', label: 'Tribunal / Órgão', placeholder: 'Ex: TJRS, TRF4, TST' },
        { name: 'county', label: 'Comarca / Seção Judiciária', placeholder: 'Ex: Ijuí, Porto Alegre' },
        { name: 'courtUnit', label: 'Vara / Unidade Judiciária', placeholder: 'Ex: 1ª Vara Cível, 2ª Vara Federal' },
        { name: 'responsible', label: 'Responsável principal' },
        { name: 'registeredAt', label: 'Data de distribuição / cadastro', type: 'date' },
        { name: 'lastMovementAt', label: 'Data do último andamento', type: 'date' },
        { name: 'lastMovement', label: 'Último andamento', type: 'textarea', full: true },
        { name: 'feeType', label: 'Tipo de honorários', type: 'select', options: [{value:'',label:'Não definido'},{value:'exito',label:'Êxito (Quota Litis %)'},{value:'fixo',label:'Fixo (Pró-labore)'},{value:'misto',label:'Misto (Fixo + Êxito)'},{value:'mensal',label:'Mensalidade (Partido)'},{value:'horas',label:'Cobrança por Hora'}] },
        { name: 'feePercentage', label: 'Percentual de êxito (%)', type: 'number', placeholder: 'Ex: 30' },
        { name: 'feeAmount', label: 'Valor fixo / causa (R$)', type: 'number', placeholder: 'Ex: 5000' },
        { name: 'feeMonthly', label: 'Valor mensal (R$)', type: 'number', placeholder: 'Ex: 1500' },
        { name: 'feeStatus', label: 'Situação dos honorários', type: 'select', options: [{value:'em_dia',label:'Em dia / Regular'},{value:'aguardando_exito',label:'Aguardando êxito processual'},{value:'pendente',label:'Pendente / Cobrança'},{value:'quitado',label:'Quitado'},{value:'repassado',label:'Quitado (compatibilidade legada)'}] },
        { name: 'requisitionType', label: 'Requisição judicial (RPV / Alvará)', type: 'select', options: [{value:'',label:'Nenhuma requisição ativa'},{value:'rpv_federal',label:'RPV Federal (TRF4)'},{value:'precatorio_federal',label:'Precatório Federal (TRF4)'},{value:'alvara_estadual',label:'Alvará Judicial Estadual (TJRS)'},{value:'alvara_trabalhista',label:'Alvará Trabalhista (TRT4)'}] },
        { name: 'requisitionAmount', label: 'Valor bruto requisitado (R$)', type: 'number', placeholder: 'Ex: 45000' },
        { name: 'requisitionBank', label: 'Banco depositário', type: 'select', options: [{value:'',label:'Não definido'},{value:'bb',label:'Banco do Brasil'},{value:'cef',label:'Caixa Econômica Federal'},{value:'banrisul',label:'Banrisul'},{value:'outro',label:'Outro banco'}] },
        { name: 'requisitionStatus', label: 'Status da requisição', type: 'select', options: [{value:'requisitado',label:'Requisitado / Expedido'},{value:'aguardando_deposito',label:'Aguardando Depósito Bancário'},{value:'disponivel_saque',label:'Disponível para Saque / Levantamento'},{value:'repassado',label:'Pago e Repassado ao Cliente'}] },
        { name: 'feeNotes', label: 'Condições de pagamento e faturamento', type: 'textarea', full: true },
        { name: 'secrecy', label: 'Visibilidade', type: 'select', options: [{value:'false',label:'Consulta pública'},{value:'true',label:'Segredo de justiça'}] },
        { name: 'monitoring', label: 'Monitoramento', type: 'select', options: [{value:'active',label:'Monitorando'},{value:'attention',label:'Precisa de atenção'}] },
        { name: 'notes', label: 'Anotações gerais', type: 'textarea', full: true }
      ], {
        secrecy: false,
        monitoring: 'active',
        feeStatus: 'em_dia',
        clientPosition: 'Autor(a)',
        judicialPhase: 'Conhecimento',
        risk: 'provavel',
        registeredAt: defaults.registeredAt || (defaults.createdAt ? defaults.createdAt.slice(0, 10) : isoDate()),
        ...defaults,
        secrecy: String(Boolean(defaults.secrecy))
      }, `${summaryHtml}${tjrsAssistHtml}`);
      byId('processTjrsPreview')?.addEventListener('click', event => this.previewTjrsDraft(event.currentTarget));
      byId('field-number')?.addEventListener('input', event => {
        if (!pendingTjrsDraft || normalizeCnj(event.currentTarget.value) === normalizeCnj(pendingTjrsDraft.number)) return;
        for (const [name, applied] of pendingTjrsAppliedFields) {
          const field = byId(`field-${name}`);
          if (!field || String(field.value) !== applied.value) continue;
          field.value = applied.previous;
          field.dispatchEvent?.(new Event('change', { bubbles: true }));
        }
        pendingTjrsDraft = null;
        pendingTjrsAppliedFields = new Map();
        const status = byId('processTjrsPreviewStatus');
        if (status) status.textContent = 'O CNJ foi alterado. Consulte novamente para carregar dados judiciais compatíveis.';
        const previewButton = byId('processTjrsPreview');
        if (previewButton) previewButton.textContent = 'Consultar dados locais';
      });
    },

    async previewTjrsDraft(button) {
      const processNumber = byId('field-number')?.value?.trim() || '';
      const accessKey = cleanAccessKey(byId('field-accessKey')?.value);
      const status = byId('processTjrsPreviewStatus');
      const field = byId('field-number');
      if (!processNumber) {
        if (status) status.textContent = 'Informe primeiro o número CNJ do processo.';
        byId('field-number')?.focus();
        return false;
      }
      const originalLabel = button?.textContent || 'Consultar dados do TJRS';
      if (button) {
        button.disabled = true;
        button.textContent = 'Consultando…';
      }
      if (status) status.textContent = 'Consultando os dados disponíveis no TJRS…';
      try {
        const isTjrs = normalizeCnj(processNumber).slice(13, 16) === '821';
        const previewUrl = isTjrs ? '/api/integrations/tjrs-sidecar/processes/preview' : '/api/integrations/omni/processes/preview';
        const payload = { processNumber };
        if (isTjrs && accessKey) {
          payload.accessKey = accessKey;
          payload.chaveAcesso = accessKey;
        }
        const response = await secureFetch(previewUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const result = await response.json().catch(() => ({}));
        if (byId('field-number') !== field || normalizeCnj(field?.value) !== normalizeCnj(processNumber)) return false;
        if (result.draft && normalizeCnj(result.draft.number) !== normalizeCnj(processNumber)) return false;
        if (!response.ok || !result.ok || !result.draft) {
          if (status) status.textContent = result.message || 'Ainda não foi possível carregar os dados deste processo.';
          return false;
        }
        const assistedFieldNames = ['court', 'county', 'courtUnit', 'actionType', 'registeredAt', 'lastMovementAt', 'lastMovement'];
        const previousValues = new Map(assistedFieldNames.map(name => [name, String(byId(`field-${name}`)?.value || '')]));
        const sameDraft = normalizeCnj(pendingTjrsDraft?.number) === normalizeCnj(result.draft.number);
        const previouslyApplied = sameDraft ? pendingTjrsAppliedFields : new Map();
        pendingTjrsDraft = structuredClone(result.draft);
        fillAssistedProcessFields(result.draft, { documentRef, today: isoDate() });
        pendingTjrsAppliedFields = new Map(previouslyApplied);
        for (const name of assistedFieldNames) {
          const value = String(byId(`field-${name}`)?.value || '');
          const previous = previousValues.get(name) || '';
          if (value !== previous) pendingTjrsAppliedFields.set(name, { previous, value });
        }
        const parties = Array.isArray(result.draft.judicialParties) ? result.draft.judicialParties : [];
        if (status) status.innerHTML = `<strong>Dados judiciais carregados para revisão.</strong><span>${escapeHtml(result.draft.court || 'TJRS')} · ${escapeHtml(result.draft.actionType || 'Classe não informada')} · ${escapeHtml(String(parties.length))} parte(s) · ${escapeHtml(String(result.summary?.movements || 0))} andamento(s).</span><small>Nenhuma parte foi definida automaticamente como cliente.</small>`;
        if (button) button.textContent = 'Consultar novamente';
        showToast?.(result.message || 'Dados judiciais carregados para revisão.', 'success');
        return true;
      } catch (error) {
        if (status) status.textContent = `Collector local indisponível: ${error.message}`;
        return false;
      } finally {
        if (button) {
          button.disabled = false;
          if (button.textContent === 'Consultando…') button.textContent = originalLabel;
        }
      }
    },

    saveProcess(data, defaults = {}) {
      const editing = Boolean(defaults.id);
      const accessKey = cleanAccessKey(data.accessKey || data.chaveAcesso || byId('field-accessKey')?.value);
      const safeData = { ...data };
      const safeDefaults = { ...defaults };
      delete safeData.accessKey;
      delete safeData.chaveAcesso;
      delete safeDefaults.accessKey;
      delete safeDefaults.chaveAcesso;
      const assistedDraft = !editing && pendingTjrsDraft && normalizeCnj(pendingTjrsDraft.number) === normalizeCnj(data.number)
        ? structuredClone(pendingTjrsDraft)
        : {};
      const parseOptionalNumber = (value, { percentage = false } = {}) => {
        if (value === '' || value === null || value === undefined) return null;
        const number = Number(value);
        if (!Number.isFinite(number) || number < 0 || (percentage && number > 100)) return undefined;
        return number;
      };
      const feePercentage = parseOptionalNumber(data.feePercentage, { percentage: true });
      const feeAmount = parseOptionalNumber(data.feeAmount);
      const feeMonthly = parseOptionalNumber(data.feeMonthly);
      const requisitionAmount = parseOptionalNumber(data.requisitionAmount);
      if ([feePercentage, feeAmount, feeMonthly, requisitionAmount].includes(undefined)) {
        showToast?.('Informe valores financeiros válidos, não negativos e percentual entre 0 e 100.', 'error');
        return null;
      }
      const record = {
        id: defaults.id || uid('proc'),
        source: defaults.source || assistedDraft.source || 'Interna',
        lastMovement: 'Cadastro manual',
        lastMovementAt: isoDate(),
        ...assistedDraft,
        ...safeDefaults,
        ...safeData,
        feePercentage,
        feeAmount,
        feeMonthly,
        requisitionAmount,
        secrecy: data.secrecy === 'true',
        updatedAt: new Date().toISOString()
      };
      store.upsert('processes', record);
      const persistedRecord = store.state.processes.find(item => item.id === record.id) || record;
      delete persistedRecord.accessKey;
      delete persistedRecord.chaveAcesso;
      if (accessKey) processAccessKeys.set(record.id, accessKey);
      store.audit(editing ? 'Processo atualizado' : 'Processo cadastrado', `${record.number || record.protocol || 'sem número'} · ${record.client}${record.feeType ? ` · ${record.feeType}` : ''}`);
      pendingTjrsDraft = null;
      pendingTjrsAppliedFields = new Map();
      return record;
    },

    async persistAccessKey(process) {
      const accessKey = processAccessKeys.get(process?.id) || '';
      if (!accessKey) return true;
      try {
        const response = await secureFetch('/api/integrations/tjrs-sidecar/processes/access-key', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ processId: process.id, processNumber: process.number, accessKey, chaveAcesso: accessKey })
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || !result.ok) throw new Error(result.message || 'Não foi possível guardar a chave de acesso.');
        return true;
      } catch (error) {
        showToast?.(error.message || 'Não foi possível guardar a chave de acesso.', 'error');
        return false;
      }
    }
  };

  return feature;
}

export function fillAssistedProcessFields(draft, { documentRef = globalThis.document, today = isoDate() } = {}) {
  if (!draft || !documentRef) return false;
  const values = {
    number: draft.number,
    court: draft.court,
    county: draft.county,
    courtUnit: draft.courtUnit,
    actionType: draft.actionType,
    registeredAt: String(draft.registeredAt || '').slice(0, 10),
    lastMovementAt: String(draft.lastMovementAt || '').slice(0, 10),
    lastMovement: draft.lastMovement
  };
  for (const [name, value] of Object.entries(values)) {
    if (value === undefined || value === null || String(value).trim() === '') continue;
    const field = documentRef.getElementById(`field-${name}`);
    if (!field) continue;
    const mayReplace = !String(field.value || '').trim() || name === 'number' || (name === 'registeredAt' && field.value === today);
    if (!mayReplace) continue;
    if (field.tagName === 'SELECT' && ![...field.options].some(option => option.value === String(value))) {
      const option = documentRef.createElement('option');
      option.value = String(value);
      option.textContent = String(value);
      field.append(option);
    }
    field.value = String(value);
    field.dispatchEvent?.(new Event('change', { bubbles: true }));
  }
  const secrecy = documentRef.getElementById('field-secrecy');
  if (secrecy && draft.secrecy === true) secrecy.value = 'true';
  return true;
}

function processSuppressions(state) {
  return Array.isArray(state?.settings?.processDiscoverySuppressions) ? state.settings.processDiscoverySuppressions : [];
}

function normalizeCnj(value) {
  const digits = String(value || '').replace(/\D/g, '');
  return digits.length === 20 ? digits : '';
}

function cleanAccessKey(value) {
  return String(value || '').trim().slice(0, 500);
}

function isProcessSuppressed(state, number) {
  const cnj = normalizeCnj(number);
  return Boolean(cnj && processSuppressions(state).some(item => normalizeCnj(item?.cnj || item) === cnj));
}

function isExternallyDiscoveredProcess(item) {
  return Boolean(normalizeCnj(item?.number) && (item?.externalId || item?.datajudAlias || /DJEN|DataJud|CNJ/i.test(String(item?.source || ''))));
}

function addProcessSuppression(state, item) {
  const cnj = normalizeCnj(item.number);
  if (!cnj || isProcessSuppressed(state, cnj)) return;
  state.settings ||= {};
  state.settings.processDiscoverySuppressions = [...processSuppressions(state), {
    cnj,
    deletedAt: new Date().toISOString(),
    source: String(item.source || 'Descoberta judicial').slice(0, 160),
    reason: 'user-deleted'
  }];
}

function snapshotProcessCollections(state) {
  return structuredClone({
    processes: state.processes,
    tasks: state.tasks,
    intimations: state.intimations,
    documents: state.documents,
    settings: state.settings,
    audit: state.audit
  });
}

function restoreProcessCollections(state, snapshot) {
  for (const key of ['processes', 'tasks', 'intimations', 'documents', 'settings', 'audit']) state[key] = snapshot[key];
}

function unlinkProcessReferences(state, item) {
  const number = String(item.number || '').trim();
  const cnj = normalizeCnj(number);
  for (const collection of ['tasks', 'intimations', 'documents']) {
    if (!Array.isArray(state[collection])) continue;
    state[collection] = state[collection].map(record => {
      const directId = String(record?.processId || '') === String(item.id);
      const owner = record?.ownerType === 'process' && String(record?.ownerId || '') === String(item.id);
      const linkedNumber = cnj && normalizeCnj(record?.process || record?.processNumber) === cnj;
      if (!directId && !owner && !linkedNumber) return record;
      const next = { ...record, unlinkedProcessNumber: number, unlinkedAt: new Date().toISOString() };
      if (directId) delete next.processId;
      if (owner) { delete next.ownerType; delete next.ownerId; }
      if (linkedNumber) {
        if ('process' in next) next.process = '';
        if ('processNumber' in next) next.processNumber = '';
      }
      return next;
    });
  }
}

function buildProcessDossier(state, item) {
  const number = String(item?.number || '').trim();
  const cnj = normalizeCnj(number);
  const linked = record => String(record?.processId || '') === String(item?.id)
    || (record?.ownerType === 'process' && String(record?.ownerId || '') === String(item?.id))
    || Boolean(cnj && normalizeCnj(record?.process || record?.processNumber) === cnj);
  const safe = value => stripSecrets(structuredClone(value));
  return {
    format: 'atrium-process-dossier',
    version: 1,
    exportedAt: new Date().toISOString(),
    scope: { processId: String(item?.id || ''), processNumber: number },
    process: safe(item),
    provenance: safe({ source: item?.source || '', externalId: item?.externalId || null, datajudAlias: item?.datajudAlias || null, collectedAt: item?.collectedAt || null, datajudUpdatedAt: item?.datajudUpdatedAt || null }),
    movements: safe(Array.isArray(item?.movements) ? item.movements : []),
    linked: {
      intimations: safe((state.intimations || []).filter(linked)),
      tasks: safe((state.tasks || []).filter(linked)),
      documents: safe((state.documents || []).filter(linked).map(document => ({
        id: document.id,
        name: document.name || document.fileName || document.title || '',
        type: document.type || document.mimeType || '',
        createdAt: document.createdAt || null,
        updatedAt: document.updatedAt || null,
        source: document.source || ''
      })))
    },
    audit: safe((state.audit || []).filter(entry => number && String(entry?.detail || '').includes(number)))
  };
}

function stripSecrets(value) {
  if (Array.isArray(value)) return value.map(stripSecrets);
  if (!value || typeof value !== 'object') return value;
  const result = {};
  for (const [key, item] of Object.entries(value)) {
    if (/(?:passphrase|password|secret|token|cookie|apiKey|certificate|pfx)/i.test(key)) continue;
    result[key] = stripSecrets(item);
  }
  return result;
}

function mergeExternalProcess(existing, incoming) {
  const current = safeExternalRecord(existing);
  const external = safeExternalRecord(incoming);
  const merged = { ...current };
  const officialFields = new Set(['court', 'actionType', 'subject', 'datajudAlias', 'collectedAt']);
  const authoritativeExternal = /DataJud|CNJ/i.test(String(external.source || ''));
  for (const [field, value] of Object.entries(external)) {
    if (!meaningful(value) || ['lastMovement', 'lastMovementAt', 'movements', 'monitoredTermIds', 'source'].includes(field)) continue;
    if (['id', 'externalId', 'number'].includes(field)) {
      if (!meaningful(merged[field])) merged[field] = value;
    } else if (field === 'datajudUpdatedAt') {
      if (!timestamp(merged[field]) || timestamp(value) >= timestamp(merged[field])) merged[field] = value;
    } else if (officialFields.has(field) && authoritativeExternal) {
      merged[field] = value;
    } else if (!meaningful(merged[field])) {
      merged[field] = value;
    }
  }
  merged.number = formatProcessNumber(external.number || current.number) || String(external.number || current.number || '').trim();
  const source = mergeSources(current.source, external.source);
  if (source) merged.source = source;
  const monitoredTermIds = uniqueStrings([...(current.monitoredTermIds || []), ...(external.monitoredTermIds || [])]);
  if (monitoredTermIds.length) merged.monitoredTermIds = monitoredTermIds;
  const currentMovementAt = timestamp(current.lastMovementAt);
  const incomingMovementAt = timestamp(external.lastMovementAt);
  if (incomingMovementAt && (!currentMovementAt || incomingMovementAt > currentMovementAt || (incomingMovementAt === currentMovementAt && !meaningful(current.lastMovement)))) {
    merged.lastMovementAt = external.lastMovementAt;
    if (meaningful(external.lastMovement)) merged.lastMovement = external.lastMovement;
  }
  if (Array.isArray(current.movements) || Array.isArray(external.movements)) merged.movements = mergeMovements(current.movements, external.movements);
  return merged;
}

function mergeMovements(left, right) {
  const byIdentity = new Map();
  for (const movement of [...(Array.isArray(left) ? left : []), ...(Array.isArray(right) ? right : [])]) {
    if (!movement || typeof movement !== 'object' || Array.isArray(movement)) continue;
    const clean = safeExternalRecord(movement);
    const key = `${clean.code || ''}:${timestamp(clean.at)}:${String(clean.name || '').trim()}`;
    if (!byIdentity.has(key)) byIdentity.set(key, clean);
  }
  return [...byIdentity.values()].sort((a, b) => timestamp(b.at) - timestamp(a.at)).slice(0, 20);
}

function processIdentity(record) {
  const digits = String(record?.number || '').replace(/\D/g, '');
  if (digits.length === 20) return `number:${digits}`;
  const externalId = String(record?.externalId || record?.id || '').trim();
  return externalId ? `external:${externalId}` : '';
}

function formatProcessNumber(value) {
  const digits = String(value || '').replace(/\D/g, '');
  return digits.length === 20
    ? `${digits.slice(0, 7)}-${digits.slice(7, 9)}.${digits.slice(9, 13)}.${digits.slice(13, 14)}.${digits.slice(14, 16)}.${digits.slice(16)}`
    : '';
}

function safeExternalRecord(record) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) return {};
  return Object.fromEntries(Object.entries(record).filter(([key]) => !['__proto__', 'prototype', 'constructor'].includes(key)));
}

function meaningful(value) {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim() !== '' && !/^cliente n[aã]o informado$/i.test(value.trim());
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

function resolveProcessClient(process, contacts = []) {
  if (meaningful(process?.client)) return String(process.client).trim();
  if (process?.contactId) {
    const linked = contacts.find(contact => contact?.id === process.contactId && contact.contactRole === 'cliente');
    if (linked?.name) return linked.name;
  }
  const number = String(process?.number || process?.protocol || '').replace(/\D/g, '');
  if (!number) return '';
  const linked = contacts.filter(contact => contact?.contactRole === 'cliente' && (contact.relatedProcessNumbers || []).some(value => String(value || '').replace(/\D/g, '') === number));
  return linked.length === 1 ? String(linked[0].name || '').trim() : '';
}

function mergeSources(left, right) {
  const sources = [left, right]
    .flatMap(value => String(value || '').split(' + '))
    .map(value => value.trim())
    .filter(Boolean);
  const unique = new Map();
  for (const source of sources) {
    const key = source.toLocaleLowerCase('pt-BR');
    if (!unique.has(key)) unique.set(key, source);
  }
  return [...unique.values()].join(' + ');
}

function timestamp(value) {
  const parsed = Date.parse(String(value || ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function uniqueStrings(values) {
  return [...new Set(values.map(value => String(value || '').trim()).filter(Boolean))];
}
