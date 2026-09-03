export function createMonitoringFeature({
  store,
  documentRef = globalThis.document,
  escapeHtml = value => String(value ?? ''),
  formatDateTime = value => String(value ?? ''),
  initials = () => 'AD',
  uid = prefix => `${prefix}-${Date.now()}`,
  openModal = () => {},
  showToast = () => {},
  closeModal = () => {},
  getFilteredIntimations = () => store.state.intimations || [],
  onOpenJudicialSetup = () => {},
  onOpenCalendarConfig = () => {},
  renderV2Presentation = null
} = {}) {
  let initialized = false;
  const byId = id => documentRef.getElementById(id);

  const feature = {
    get initialized() {
      return initialized;
    },

    init() {
      if (initialized) return false;
      initialized = true;
      byId('newTermButton')?.addEventListener('click', () => feature.openTermModal());
      const primaryTermCard = byId('primaryTermCard');
      const openPrimaryTerm = () => {
        const term = store.state.terms[0] || { id: uid('term'), name: 'Dr(a). Advogado(a) Titular', registration: 'OAB/UF 000000', type: 'oab', active: true };
        feature.openTermModal(term);
      };
      primaryTermCard?.addEventListener('click', openPrimaryTerm);
      primaryTermCard?.addEventListener('keydown', event => {
        if (documentRef.documentElement?.dataset?.ui !== 'v2' || !['Enter', ' '].includes(event.key)) return;
        event.preventDefault();
        event.stopPropagation();
        openPrimaryTerm();
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
      return true;
    },

    render() {
      const term = store.state.terms[0] || { name: 'Dr(a). Advogado(a) Titular', registration: 'OAB/UF 000000' };
      const nameElement = byId('primaryTermName');
      const registrationElement = byId('primaryTermRegistration');
      const avatarElement = byId('primaryTermAvatar');
      if (nameElement) nameElement.textContent = term.name || 'Dr(a). Advogado(a) Titular';
      if (registrationElement) registrationElement.textContent = `${term.registration || 'OAB/UF 000000'} · Advogado(a) monitorado(a) principal`;
      if (avatarElement) avatarElement.textContent = initials(term.name || 'AD');
      const primaryTermCard = byId('primaryTermCard');
      if (documentRef.documentElement?.dataset?.ui === 'v2') {
        primaryTermCard?.setAttribute('role', 'button');
        primaryTermCard?.setAttribute('aria-label', `Editar termo principal ${term.name || 'Dr(a). Advogado(a) Titular'}, ${term.registration || 'OAB/UF 000000'}`);
      } else {
        primaryTermCard?.removeAttribute('role');
        primaryTermCard?.removeAttribute('aria-label');
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
        <div class="source-row" data-source-id="${escapeHtml(source.id)}" tabindex="0"><div class="source-name"><span class="source-mark">${escapeHtml(source.short)}</span><div><strong>${escapeHtml(source.name)}</strong><small>${escapeHtml(source.detail)}</small></div></div><span class="source-method">${escapeHtml(source.method)}</span><span class="source-check">${source.lastCheck ? formatDateTime(source.lastCheck) : 'Ainda não verificada'}</span><span>${source.status === 'ok' ? '<span class="status-chip connected">Ativo</span>' : source.status === 'attention' ? '<span class="status-chip warning">Atenção</span>' : source.status === 'error' ? '<span class="status-chip danger">Falha</span>' : source.status === 'planned' ? '<span class="status-chip planned">Preparado</span>' : '<span class="status-chip muted">Desativado</span>'}</span><span class="row-menu" aria-hidden="true">⚙</span></div>`).join('');
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
        feature.openTermModal(store.state.terms[0] || {});
      } else if (routeKind === 'datajud') {
        feature.openDataJudConfigModal();
      } else {
        if (store.state.sources.some(item => item.id === sourceId)) feature.openSourceModal(source);
      }
    },

    sourceRouteKind(source = {}) {
      const sourceId = String(source.id || '').toLowerCase();
      const haystack = [source.id, source.name, source.short, source.method, source.detail]
        .map(value => String(value || '').toLowerCase()).join(' ');
      if (sourceId === 'external-calendar' || /\b(?:webcal|ical)\b|agenda externa/.test(haystack)) return 'calendar';
      if (sourceId === 'datajud-cnj' || sourceId === 'datajud' || /\bdatajud\b/.test(haystack)) return 'datajud';
      if (sourceId === 'djen-cnj' || sourceId === 'djen' || /\bdjen\b|comunica pje/.test(haystack)) return 'term';
      if (sourceId === 'a1' || sourceId === 'pje'
        || /\beproc\b|pjeoffice|certificado|sess[aã]o local|portal judicial/.test(haystack)) return 'judicial';
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
        const ufMatch = registration.match(/([A-Z]{2})/i);
        if (ufMatch) defaultUf = ufMatch[1].toUpperCase();
        const numberMatch = registration.replace(/\D/g, '');
        if (numberMatch) defaultOab = numberMatch;
      }
      if (!defaultUf) defaultUf = 'RS';
      const ufOptions = [
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
      openModal('term', defaults.id ? 'Editar termo monitorado' : 'Adicionar termo monitorado', 'Monitoramento DJEN & Tribunais', [
        { name: 'name', label: 'Nome completo ou razão social', required: true, full: true, placeholder: 'Ex: André da Silva', value: defaults.name || '' },
        { name: 'type', label: 'Tipo de identificador', type: 'select', full: true, options: [{ value: 'oab', label: 'Inscrição OAB (Advogado)' }, { value: 'document', label: 'CPF ou CNPJ' }, { value: 'name', label: 'Nome Textual' }] },
        { name: 'oabNumber', label: 'Número da OAB (somente números)', placeholder: 'Ex: 123456', note: 'Digite somente os números da sua OAB, preservando o zero à esquerda quando existir.' },
        { name: 'oabUf', label: 'Estado / Seccional (UF)', type: 'select', value: defaultUf, options: ufOptions },
        { name: 'document', label: 'CPF ou CNPJ', placeholder: 'Ex: 000.000.000-00 ou 00.000.000/0001-00' }
      ], { type: 'oab', oabNumber: defaultOab, oabUf: defaultUf, ...defaults });

      const typeSelect = byId('field-type');
      const oabNumberField = byId('field-oabNumber')?.closest('.field');
      const oabUfField = byId('field-oabUf')?.closest('.field');
      const documentField = byId('field-document')?.closest('.field');
      const updateFieldsVisibility = () => {
        const value = typeSelect?.value || 'oab';
        if (oabNumberField) oabNumberField.style.display = value === 'oab' ? '' : 'none';
        if (oabUfField) oabUfField.style.display = value === 'oab' ? '' : 'none';
        if (documentField) documentField.style.display = value === 'document' ? '' : 'none';
      };
      typeSelect?.addEventListener('change', updateFieldsVisibility);
      updateFieldsVisibility();
    },

    openSourceModal(defaults = {}) {
      openModal('source', 'Detalhes da fonte', 'Monitoramento e integração', [
        { name: 'name', label: 'Fonte', required: true, full: true }, { name: 'short', label: 'Sigla' }, { name: 'method', label: 'Método' },
        { name: 'status', label: 'Situação', type: 'select', options: [{value:'ok',label:'Ativa'},{value:'attention',label:'Atenção'},{value:'error',label:'Falha'},{value:'planned',label:'Preparada'},{value:'off',label:'Desativada'}] },
        { name: 'detail', label: 'Detalhes operacionais', type: 'textarea', full: true, note: 'Não insira senhas, tokens ou conteúdo do certificado.' }
      ], defaults);
    },

    saveTerm(data, defaults = {}) {
      const editing = Boolean(defaults.id);
      let registration = data.registration;
      const oabNumber = data.oabNumber ? String(data.oabNumber).replace(/\D/g, '') : '';
      const oabUf = data.oabUf ? String(data.oabUf).toUpperCase() : '';
      if (data.type === 'oab' && oabNumber) registration = `OAB/${oabUf || 'RS'} ${oabNumber}`;
      else if (!registration) registration = data.document || data.name;
      const record = {
        id: defaults.id || uid('term'), active: true, ...defaults, ...data, registration,
        oabNumber: oabNumber || undefined, oabUf: oabUf || undefined, updatedAt: new Date().toISOString()
      };
      store.upsert('terms', record);
      if (store.state.terms[0]?.id === record.id) {
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
