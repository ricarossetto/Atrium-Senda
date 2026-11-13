const plural = (count, singular, pluralForm) => `${count} ${Number(count) === 1 ? singular : pluralForm}`;
const iconSvg = name => `<svg class="atrium-icon" aria-hidden="true" focusable="false"><use href="assets/icons/atrium-ui-icons.svg?v=3.1.0#atrium-icon-${name}"></use></svg>`;

export function createMonitoringFeature({
  store,
  documentRef = globalThis.document,
  escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c])),
  formatDateTime = value => String(value ?? ''),
  initials = () => 'AD',
  uid = prefix => `${prefix}-${Date.now()}`,
  openModal = () => {},
  showToast = () => {},
  closeModal = () => {},
  getFilteredIntimations = () => store.state.intimations || [],
  onOpenJudicialSetup = () => {},
  onOpenCalendarConfig = () => {},
  onOpenInpiPanel = () => {},
  renderV2Presentation = null,
  renderCaptureErrorsPresentation = null,
  requestCaptureErrors = null,
  requestCaptureErrorRetry = null,
  onCaptureErrorsApplied = null
} = {}) {
  let initialized = false;
  let captureErrorsQueue = null;
  let captureErrorsRequested = false;
  let captureErrorsLoading = false;
  let captureErrorsRetrying = false;
  const byId = id => documentRef.getElementById(id);
  const isProcessTerm = term => String(term?.type || '').toLowerCase() === 'process';
  const formatProcess = value => {
    const digits = String(value || '').replace(/\D/g, '');
    return digits.length === 20
      ? `${digits.slice(0, 7)}-${digits.slice(7, 9)}.${digits.slice(9, 13)}.${digits.slice(13, 14)}.${digits.slice(14, 16)}.${digits.slice(16)}`
      : digits;
  };
  const primaryTerm = () => (Array.isArray(store.state.terms) ? store.state.terms.find(term => term?.primary === true) : null)
    || (Array.isArray(store.state.terms) ? store.state.terms.find(term => !isProcessTerm(term)) : null)
    || { id: uid('term'), name: 'Dr(a). Advogado(a) Titular', registration: 'OAB/UF 000000', type: 'oab', active: true };

  const feature = {
    get initialized() {
      return initialized;
    },

    init() {
      if (initialized) return false;
      initialized = true;
      byId('newTermButton')?.addEventListener('click', () => feature.openTermModal());
      const primaryTermCard = byId('primaryTermCard');
      const openPrimaryTerm = () => feature.openTermModal(primaryTerm());
      primaryTermCard?.addEventListener('click', openPrimaryTerm);
      primaryTermCard?.addEventListener('keydown', event => {
        if (documentRef.documentElement?.dataset?.ui !== 'v2' || !['Enter', ' '].includes(event.key)) return;
        event.preventDefault();
        event.stopPropagation();
        openPrimaryTerm();
      });
      byId('monitorTermList')?.addEventListener('click', event => {
        const button = event.target.closest?.('[data-term-id]');
        if (!button) return;
        const term = store.state.terms.find(item => String(item.id) === String(button.dataset.termId));
        if (term) feature.openTermModal(term);
      });
      const sourceList = byId('monitorSourceList');
      sourceList?.addEventListener('click', event => {
        const row = event.target.closest('[data-source-id]');
        if (row) feature.routeSource(row.dataset.sourceId);
      });
      sourceList?.addEventListener('keydown', event => {
        if (documentRef.documentElement?.dataset?.ui !== 'v2' || !['Enter', ' '].includes(event.key)) return;
        const row = event.target.closest('[data-source-id]');
        if (!row) return;
        event.preventDefault();
        event.stopPropagation();
        feature.routeSource(row.dataset.sourceId);
      });
      byId('djenCaptureErrorsList')?.addEventListener('click', event => {
        const button = event.target.closest?.('[data-retry-term-id]');
        if (!button) return;
        void feature.retryCaptureErrors(button.dataset.retryTermId);
      });
      byId('djenCaptureErrorsRetryAll')?.addEventListener('click', () => { void feature.retryCaptureErrors(); });
      return true;
    },

    render() {
      const term = primaryTerm();
      const nameElement = byId('primaryTermName');
      const registrationElement = byId('primaryTermRegistration');
      const avatarElement = byId('primaryTermAvatar');
      if (nameElement) nameElement.textContent = term.name || 'Dr(a). Advogado(a) Titular';
      if (registrationElement) registrationElement.textContent = `${!term.registration || /OAB\/UF 000000/.test(term.registration) ? 'Informe sua OAB para buscar publicações' : term.registration} · ${term.scope === 'private' ? 'OAB privada monitorada' : 'OAB do escritório monitorada'} principal`;
      if (avatarElement) avatarElement.textContent = initials(term.name || 'AD');
      const statusChipElement = byId('primaryTermStatusChip');
      if (statusChipElement) {
        const registration = String(term.registration || '').trim();
        const hasRealIdentity = Boolean((term.oabNumber || /OAB\s*\/?\s*[A-Z]{2}\s*\d{3,}/i.test(registration)) && !/000000/.test(registration));
        statusChipElement.className = `status-chip ${hasRealIdentity ? 'monitoring' : 'warning'}`;
        statusChipElement.innerHTML = hasRealIdentity
          ? '<i></i> Monitorando'
          : 'OAB não informada';
      }
      const primaryTermCard = byId('primaryTermCard');
      if (documentRef.documentElement?.dataset?.ui === 'v2') {
        primaryTermCard?.setAttribute('role', 'button');
        primaryTermCard?.setAttribute('aria-label', `Editar termo principal ${term.name || 'Dr(a). Advogado(a) Titular'}, ${term.registration || 'OAB/UF 000000'}`);
      } else {
        primaryTermCard?.removeAttribute('role');
        primaryTermCard?.removeAttribute('aria-label');
      }

      const termList = byId('monitorTermList');
      if (termList) {
        const additional = (Array.isArray(store.state.terms) ? store.state.terms : [])
          .filter(item => item && item.active !== false && String(item.id) !== String(term.id));
        termList.hidden = additional.length === 0;
        termList.innerHTML = additional.map(item => `
          <div class="monitor-term-row">
            <span class="monitor-term-avatar" aria-hidden="true">${escapeHtml(initials(item.name || 'AD'))}</span>
            <div class="monitor-term-copy">
              <strong>${escapeHtml(item.name || 'Termo adicional')}</strong>
              <span>${escapeHtml(item.registration || 'OAB/UF 000000')} · ${isProcessTerm(item)
                ? (item.scope === 'private' ? 'processo monitorado no DJEN, privado' : 'processo monitorado no DJEN')
                : (item.scope === 'private' ? 'termo privado monitorado' : 'termo adicional monitorado')}</span>
            </div>
            <button type="button" class="button ghost" data-term-id="${escapeHtml(item.id)}">Editar</button>
          </div>`).join('');
      }

      const issues = store.state.sources.filter(source => ['attention', 'error'].includes(source.status)).length;
      const activeCutoffIntimations = getFilteredIntimations();
      const newCount = activeCutoffIntimations.filter(item => item.status === 'nova').length;
      if (byId('termSourceCount')) byId('termSourceCount').textContent = store.state.sources.length;
      if (byId('termIssueCount')) byId('termIssueCount').textContent = issues;
      if (byId('termNewCount')) byId('termNewCount').textContent = newCount;
      const sourceList = byId('monitorSourceList');
      if (sourceList) {
        const v2Presentation = documentRef.documentElement?.dataset?.ui === 'v2' && typeof renderV2Presentation === 'function'
          ? renderV2Presentation({ sources: store.state.sources, escapeHtml, formatDateTime })
          : null;
        sourceList.innerHTML = v2Presentation?.sourceHtml || store.state.sources.map(source => `
        <div class="source-row" data-source-id="${escapeHtml(source.id)}" tabindex="0"><div class="source-name"><span class="source-mark">${escapeHtml(source.short)}</span><div><strong>${escapeHtml(source.name)}</strong><small>${escapeHtml(source.detail)}</small></div></div><span class="source-method">${escapeHtml(source.method)}</span><span class="source-check">${source.lastCheck ? formatDateTime(source.lastCheck) : 'Ainda não verificada'}</span><span>${source.status === 'ok' ? '<span class="status-chip connected">Ativo</span>' : source.status === 'attention' ? '<span class="status-chip warning">Atenção</span>' : source.status === 'error' ? '<span class="status-chip danger">Falha</span>' : source.status === 'planned' ? '<span class="status-chip planned">Preparado</span>' : '<span class="status-chip muted">Desativado</span>'}</span><span class="row-menu" aria-hidden="true">${iconSvg('configuration')}</span></div>`).join('');
      }
      const isV2 = documentRef.documentElement?.dataset?.ui === 'v2';
      if (isV2 && !captureErrorsRequested && typeof requestCaptureErrors === 'function') {
        captureErrorsRequested = true;
        void feature.loadCaptureErrors();
      } else {
        feature.renderCaptureErrors();
      }
    },

    async loadCaptureErrors() {
      if (typeof requestCaptureErrors !== 'function' || captureErrorsLoading) return captureErrorsQueue;
      captureErrorsLoading = true;
      try {
        const payload = await requestCaptureErrors();
        captureErrorsQueue = payload && typeof payload === 'object' ? payload : null;
      } catch {
        captureErrorsQueue = null;
      } finally {
        captureErrorsLoading = false;
      }
      feature.renderCaptureErrors();
      return captureErrorsQueue;
    },

    renderCaptureErrors() {
      const card = byId('djenCaptureErrorsCard');
      if (!card) return;
      const list = byId('djenCaptureErrorsList');
      const countElement = byId('djenCaptureErrorsCount');
      const detailElement = byId('djenCaptureErrorsDetail');
      const retryAllButton = byId('djenCaptureErrorsRetryAll');
      const terms = Array.isArray(captureErrorsQueue?.terms) ? captureErrorsQueue.terms : [];
      if (!terms.length) {
        card.hidden = true;
        if (list) list.innerHTML = '';
        if (retryAllButton) retryAllButton.disabled = false;
        return;
      }
      const presentation = documentRef.documentElement?.dataset?.ui === 'v2' && typeof renderCaptureErrorsPresentation === 'function'
        ? renderCaptureErrorsPresentation({ queue: captureErrorsQueue, escapeHtml, formatDateTime })
        : null;
      card.hidden = false;
      if (countElement) countElement.textContent = String(presentation?.count ?? terms.length);
      if (detailElement) detailElement.textContent = presentation?.detail || `${plural(terms.length, 'termo', 'termos')} com falha na última captura DJEN.`;
      if (list) list.innerHTML = presentation?.rowsHtml || '';
      if (retryAllButton) retryAllButton.disabled = captureErrorsRetrying;
    },

    async retryCaptureErrors(termId = '') {
      if (typeof requestCaptureErrorRetry !== 'function' || captureErrorsRetrying) return null;
      captureErrorsRetrying = true;
      const card = byId('djenCaptureErrorsCard');
      card?.setAttribute('aria-busy', 'true');
      const retryAllButton = byId('djenCaptureErrorsRetryAll');
      if (retryAllButton) retryAllButton.disabled = true;
      const retryButtons = byId('djenCaptureErrorsList')?.querySelectorAll?.('button[data-retry-term-id]');
      retryButtons?.forEach(button => { button.disabled = true; });
      try {
        const payload = await requestCaptureErrorRetry(termId ? { termId } : { all: true });
        if (payload?.queue && typeof payload.queue === 'object') captureErrorsQueue = payload.queue;
        else await feature.loadCaptureErrors();
        const added = Number(payload?.inboxAdded || 0);
        const updated = Number(payload?.inboxUpdated || 0);
        const failureCount = Array.isArray(payload?.failures) ? payload.failures.length : 0;
        if (failureCount) showToast(`Nova tentativa concluída com ${plural(failureCount, 'termo', 'termos')} ainda com falha.`, 'warning');
        else if (added || updated) showToast(`Captura reconsultada: +${plural(added, 'nova', 'novas')}, ${plural(updated, 'atualizada', 'atualizadas')}.`, 'success');
        else showToast('Captura reconsultada sem novas publicações.', 'success');
        if (typeof onCaptureErrorsApplied === 'function') await onCaptureErrorsApplied();
        return payload;
      } catch (error) {
        showToast(error?.message || 'Não foi possível reconsultar a captura agora.', 'error');
        return null;
      } finally {
        captureErrorsRetrying = false;
        card?.removeAttribute('aria-busy');
        feature.renderCaptureErrors();
      }
    },

    routeSource(sourceId) {
      const source = store.state.sources.find(item => item.id === sourceId) || { id: sourceId };
      const routeKind = feature.sourceRouteKind(source);
      if (routeKind === 'judicial') {
        onOpenJudicialSetup();
      } else if (routeKind === 'calendar') {
        onOpenCalendarConfig();
      } else if (routeKind === 'term') {
        feature.openTermModal(primaryTerm());
      } else if (routeKind === 'datajud') {
        feature.openDataJudConfigModal();
      } else if (routeKind === 'inpi') {
        onOpenInpiPanel();
      } else {
        if (store.state.sources.some(item => item.id === sourceId)) feature.openSourceModal(source);
      }
    },

    sourceRouteKind(source = {}) {
      const sourceId = String(source.id || '').toLowerCase();
      const haystack = [source.id, source.name, source.short, source.method, source.detail]
        .map(value => String(value || '').toLowerCase()).join(' ');
      if (sourceId === 'inpi-rpi' || sourceId === 'inpi'
        || /\b(?:inpi|rpi)\b|propriedade industrial|marcas/.test(haystack)) return 'inpi';
      if (sourceId === 'external-calendar' || /\b(?:webcal|ical)\b|agenda externa/.test(haystack)) return 'calendar';
      if (sourceId === 'datajud-cnj' || sourceId === 'datajud' || /\bdatajud\b/.test(haystack)) return 'datajud';
      if (sourceId === 'djen-cnj' || sourceId === 'djen' || /\bdjen\b|comunica pje/.test(haystack)) return 'term';
      if (sourceId === 'a1' || sourceId === 'pje'
        || /\b(?:eproc|pjeoffice|certificado|sess[aã]o local|portal judicial|tjrs|trf4|jfrs|jfsc|jfpr|tjsp|tjsc|stj|tst|chave cifrada|coletor local)\b/i.test(haystack)) return 'judicial';
      return 'details';
    },

    openDataJudConfigModal() {
      const currentKey = store.state.settings?.datajudApiKey || 'cDZHYzlZa0JadVREZDJCendQbXY6SkJlTzNjLV9TRENyQk1RdnFKZGRQdw==';
      const persistenceNote = documentRef.documentElement?.dataset?.ui === 'v2'
        ? '<div class="monitoring-contract-note" role="note"><strong>Persistência atual</strong><span>Somente a chave pública é salva. Enriquecimento e abrangência permanecem opções de apresentação do contrato existente.</span></div>'
        : '';
      openModal('datajud', 'Configuração DataJud / CNJ', 'Integração Oficial de Andamentos', [
        { name: 'apiKey', label: 'Chave Pública da API DataJud (CNJ)', full: true, value: currentKey, note: 'Chave pública oficial mantida pelo CNJ (datajud-wiki.cnj.jus.br).' },
        { name: 'autoSync', label: 'Enriquecimento Automático', type: 'select', options: [{ value: 'active', label: 'Ativo (buscar andamentos ao cadastrar processo)' }, { value: 'manual', label: 'Apenas manual (sob demanda)' }] },
        { name: 'tribunals', label: 'Abrangência de Tribunais', full: true, value: 'TJRS, TRF4, STJ, TST, TJSC, TJPR, TJSP' }
      ], { apiKey: currentKey, autoSync: 'active', tribunals: 'TJRS, TRF4, STJ, TST, TJSC, TJPR, TJSP' }, persistenceNote);
    },

    openTermModal(defaults = {}) {
      const registration = defaults.registration || '';
      let defaultOab = defaults.oabNumber || '';
      let defaultUf = defaults.oabUf || '';
      if (!defaultOab && registration) {
        const ufMatch = registration.match(/\bOAB\s*\/?\s*([A-Z]{2})\b/i);
        if (ufMatch) defaultUf = ufMatch[1].toUpperCase();
        const numberMatch = registration.replace(/\D/g, '');
        if (numberMatch) defaultOab = numberMatch;
      }
      const ufOptions = [
        { value: '', label: 'Selecione a UF' },
        { value: 'RS', label: 'RS — Rio Grande do Sul' }, { value: 'SP', label: 'SP — São Paulo' },
        { value: 'SC', label: 'SC — Santa Catarina' }, { value: 'PR', label: 'PR — Paraná' },
        { value: 'RJ', label: 'RJ — Rio de Janeiro' }, { value: 'MG', label: 'MG — Minas Gerais' },
        { value: 'DF', label: 'DF — Distrito Federal' }, { value: 'BA', label: 'BA — Bahia' },
        { value: 'GO', label: 'GO — Goiás' }, { value: 'PE', label: 'PE — Pernambuco' },
        { value: 'CE', label: 'CE — Ceará' }, { value: 'ES', label: 'ES — Espírito Santo' },
        { value: 'MT', label: 'MT — Mato Grosso' }, { value: 'MS', label: 'MS — Mato Grosso do Sul' },
        { value: 'MA', label: 'MA — Maranhão' }, { value: 'PA', label: 'PA — Pará' },
        { value: 'PB', label: 'PB — Paraíba' }, { value: 'RN', label: 'RN — Rio Grande do Norte' },
        { value: 'AL', label: 'AL — Alagoas' }, { value: 'SE', label: 'SE — Sergipe' },
        { value: 'PI', label: 'PI — Piauí' }, { value: 'TO', label: 'TO — Tocantins' },
        { value: 'RO', label: 'RO — Rondônia' }, { value: 'AC', label: 'AC — Acre' },
        { value: 'AM', label: 'AM — Amazonas' }, { value: 'AP', label: 'AP — Amapá' },
        { value: 'RR', label: 'RR — Roraima' }
      ];
      openModal('term', defaults.id ? 'Editar termo monitorado' : 'Adicionar termo monitorado', 'Monitoramento DJEN e Tribunais', [
        { name: 'name', label: 'Nome completo ou razão social', required: true, full: true, placeholder: 'Ex: André da Silva', value: defaults.name || '' },
        { name: 'type', label: 'Tipo de identificador', type: 'select', full: true, options: [{ value: 'oab', label: 'Inscrição OAB (Advogado)' }, { value: 'document', label: 'CPF ou CNPJ' }, { value: 'name', label: 'Nome Textual' }, { value: 'process', label: 'Número do processo (DJEN)' }] },
        { name: 'scope', label: 'Escopo do monitoramento', type: 'select', full: true, value: defaults.scope === 'private' ? 'private' : 'office', options: [{ value: 'office', label: 'OAB do escritório (compartilhada)' }, { value: 'private', label: 'Meu monitoramento privado (só eu vejo)' }], note: 'Escritório vence quando o mesmo CNJ aparece nos dois escopos. A OAB privada não vira OAB do escritório.' },
        { name: 'oabNumber', label: 'Número da OAB (somente números)', placeholder: 'Ex: 123456', note: 'Digite somente os números da sua OAB, preservando o zero à esquerda quando existir.' },
        { name: 'oabUf', label: 'Estado / Seccional (UF)', type: 'select', required: true, value: defaultUf, options: ufOptions },
        { name: 'document', label: 'CPF ou CNPJ', placeholder: 'Ex: 000.000.000-00 ou 00.000.000/0001-00' },
        { name: 'processNumber', label: 'Número do processo (CNJ)', full: true, placeholder: 'Ex: 5001620-76.2024.8.21.0028', note: 'O ATRIUM busca no DJEN as publicações deste processo, mesmo sem você estar habilitado. Movimentações sem publicação não aparecem.' }
      ], { type: 'oab', scope: defaults.scope || 'office', oabNumber: defaultOab, oabUf: defaultUf, ...defaults, ...(isProcessTerm(defaults) ? { processNumber: formatProcess(defaults.processNumber) } : {}) });

      const typeSelect = byId('field-type');
      const oabNumberField = byId('field-oabNumber')?.closest('.field');
      const oabUfField = byId('field-oabUf')?.closest('.field');
      const oabUfSelect = byId('field-oabUf');
      const documentField = byId('field-document')?.closest('.field');
      const processField = byId('field-processNumber')?.closest('.field');
      const updateFieldsVisibility = () => {
        const value = typeSelect?.value || 'oab';
        if (processField) processField.style.display = value === 'process' ? '' : 'none';
        if (oabNumberField) oabNumberField.style.display = value === 'oab' ? '' : 'none';
        if (oabUfField) oabUfField.style.display = value === 'oab' ? '' : 'none';
        if (oabUfSelect) oabUfSelect.required = value === 'oab';
        if (documentField) documentField.style.display = value === 'document' ? '' : 'none';
      };
      typeSelect?.addEventListener('change', updateFieldsVisibility);
      updateFieldsVisibility();
    },

    openSourceModal(defaults = {}) {
      const statusMap = {
        ok: '<span class="status-chip connected">Ativa</span>',
        attention: '<span class="status-chip warning">Atenção</span>',
        error: '<span class="status-chip danger">Falha</span>',
        planned: '<span class="status-chip planned">Preparada</span>',
        off: '<span class="status-chip muted">Desativada</span>'
      };
      const statusHtml = statusMap[defaults.status] || '<span class="status-chip muted">Informativo</span>';
      const topHtml = `
        <div class="source-telemetry-view" style="display:flex; flex-direction:column; gap:14px; padding:6px 0;">
          <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:12px; padding:14px; background:var(--panel-soft); border-radius:8px; border:1px solid var(--line);">
            <div>
              <h4 style="margin:0 0 4px; font-size:15px; font-weight:700; color:var(--ivory);">${escapeHtml(defaults.name || 'Fonte monitorada')}</h4>
              <p style="margin:0; font-size:12.5px; color:var(--muted);">${escapeHtml(defaults.short || '')} · ${escapeHtml(defaults.method || 'Coleta automatizada')}</p>
            </div>
            <div>${statusHtml}</div>
          </div>
          <div style="padding:14px; background:var(--panel-soft); border-radius:8px; border:1px solid var(--line);">
            <small style="color:var(--gold); font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:0.06em; display:block; margin-bottom:6px;">Telemetria e Detalhes Operacionais</small>
            <div style="font-size:13px; color:var(--ivory); line-height:1.5;">${escapeHtml(defaults.detail || 'Sem ocorrências registradas para esta fonte.')}</div>
            ${defaults.lastCheck ? `<div style="margin-top:10px; font-size:11.5px; color:var(--muted);">Última verificação confirmada: ${escapeHtml(formatDateTime(defaults.lastCheck))}</div>` : ''}
          </div>
        </div>
      `;
      openModal('source', 'Detalhes da fonte', 'Monitoramento e telemetria', [
        { name: 'name', label: 'Fonte', required: true, full: true }, { name: 'short', label: 'Sigla' }, { name: 'method', label: 'Método' },
        { name: 'status', label: 'Situação', type: 'select', options: [{value:'ok',label:'Ativa'},{value:'attention',label:'Atenção'},{value:'error',label:'Falha'},{value:'planned',label:'Preparada'},{value:'off',label:'Desativada'}] },
        { name: 'detail', label: 'Detalhes operacionais', type: 'textarea', full: true, note: 'Não insira senhas, tokens ou conteúdo do certificado.' }
      ], defaults, topHtml);
    },

    saveTerm(data, defaults = {}) {
      const editing = Boolean(defaults.id);
      let registration = data.registration;
      const oabNumber = data.oabNumber ? String(data.oabNumber).replace(/\D/g, '') : '';
      const oabUf = data.oabUf ? String(data.oabUf).toUpperCase() : '';
      if (data.type === 'oab' && oabNumber && !oabUf) {
        showToast('Selecione a UF da inscrição OAB.', 'error');
        return null;
      }
      const processNumber = data.type === 'process' ? String(data.processNumber || '').replace(/\D/g, '') : '';
      if (data.type === 'process' && processNumber.length !== 20) {
        showToast('Informe o número completo do processo, com 20 dígitos. Exemplo: 5001620-76.2024.8.21.0028.', 'error');
        return null;
      }
      if (data.type === 'process') registration = `Processo ${formatProcess(processNumber)}`;
      else if (data.type === 'oab' && oabNumber) registration = `OAB/${oabUf} ${oabNumber}`;
      else if (!registration) registration = data.document || data.name;
      const record = {
        id: defaults.id || uid('term'), active: true, ...defaults, ...data, registration,
        oabNumber: data.type === 'process' ? undefined : (oabNumber || undefined),
        oabUf: data.type === 'process' ? undefined : (oabUf || undefined),
        processNumber: processNumber || undefined, updatedAt: new Date().toISOString()
      };
      store.upsert('terms', record);
      if (String(primaryTerm().id) === String(record.id)) {
        store.state.settings.lawyerName = record.name;
        store.state.settings.lawyerOab = record.registration;
      }
      store.audit(editing ? 'Termo atualizado' : 'Termo adicionado', `${record.name} · ${record.registration}`);
      return record;
    },

    saveSource(data, defaults = {}) {
      const record = { ...defaults, ...data, updatedAt: new Date().toISOString() };
      store.upsert('sources', record);
      store.audit('Fonte atualizada', `${record.name} · ${record.status}`);
      return record;
    },

    async saveDataJud(data) {
      if (!store.state.settings) store.state.settings = {};
      store.state.settings.datajudApiKey = data.apiKey || '';
      store.audit('Configuração DataJud atualizada', `Chave configurada (${(data.apiKey || '').slice(0, 10)}…)`);
      store.save();
      feature.render();
      if (!await store.flush()) throw new Error('Não foi possível persistir a configuração. Tente novamente.');
      showToast('Configurações do DataJud salvas com sucesso!', 'success');
      closeModal();
      return true;
    }
  };

  return feature;
}
