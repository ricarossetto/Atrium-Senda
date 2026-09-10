const defaultEscapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
}[character]));

export function createInpiIntegrationFeature({
  documentRef = globalThis.document,
  windowRef = globalThis.window,
  secureFetch = (...args) => windowRef?.KellerAuth?.secureFetch(...args),
  escapeHtml = defaultEscapeHtml,
  showToast = () => {},
  store = null
} = {}) {
  let initialized = false;
  let inpiData = null;
  let inpiStatus = null;
  let isScanning = false;

  const state = {
    search: '',
    monitor: 'all',
    field: 'all',
    sort: 'recent'
  };

  const byId = id => documentRef?.getElementById(id);

  function normalize(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toUpperCase();
  }

  function formatDate(value) {
    if (!value) return '-';
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      const [year, month, day] = value.split('-');
      return `${day}/${month}/${year}`;
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat('pt-BR', {
      dateStyle: 'short',
      timeStyle: value.includes('T') ? 'short' : undefined
    }).format(date);
  }

  function formatNumber(value) {
    return new Intl.NumberFormat('pt-BR').format(value || 0);
  }

  function processText(match) {
    return [
      match.processo,
      match.marca?.nome,
      match.procuradores?.join(' '),
      match.requerentes?.map(item => item.nome).join(' '),
      match.despachos?.map(item => `${item.codigo} ${item.nome} ${item.texto}`).join(' '),
      match.classes?.map(item => `${item.codigo} ${item.status} ${item.especificacao}`).join(' ')
    ].join(' ');
  }

  function fieldText(match, field) {
    if (field === 'marca') return match.marca?.nome || '';
    if (field === 'procurador') return match.procuradores?.join(' ') || '';
    if (field === 'requerente') return match.requerentes?.map(item => item.nome).join(' ') || '';
    if (field === 'despacho') return match.despachos?.map(item => `${item.codigo} ${item.nome} ${item.texto}`).join(' ') || '';
    if (field === 'classe') return match.classes?.map(item => `${item.codigo} ${item.status} ${item.especificacao}`).join(' ') || '';
    return processText(match);
  }

  function getFilteredMatches() {
    const data = inpiData || {};
    const query = normalize(state.search);

    const matches = (data.matches || []).filter(match => {
      if (state.monitor !== 'all') {
        const hasMonitor = (match.monitores || []).some(m => m.id === state.monitor);
        if (!hasMonitor) return false;
      }

      if (state.field !== 'all') {
        const monitorHitsField = (match.monitores || []).some(m => (m.fields || []).includes(state.field));
        if (!monitorHitsField && !normalize(fieldText(match, state.field)).includes(query)) {
          if (!query) return false;
        }
      }

      if (query) {
        const searchable = state.field === 'all' ? processText(match) : fieldText(match, state.field);
        if (!normalize(searchable).includes(query)) return false;
      }

      return true;
    });

    matches.sort((a, b) => {
      if (state.sort === 'brand') return String(a.marca?.nome || '').localeCompare(String(b.marca?.nome || ''), 'pt-BR');
      if (state.sort === 'process') return String(a.processo || '').localeCompare(String(b.processo || ''), 'pt-BR');
      return Number(b.revista?.numero || 0) - Number(a.revista?.numero || 0);
    });

    return matches;
  }

  function renderStatus() {
    const statusPill = byId('inpiStatusPill');
    const subtitle = byId('inpiPanelSubtitle');
    if (!statusPill) return;

    if (isScanning) {
      statusPill.textContent = 'Varrendo RPI...';
      statusPill.className = 'status-chip syncing';
      return;
    }

    const generatedAt = inpiData?.generatedAt;
    if (generatedAt) {
      statusPill.textContent = 'Atualizado';
      statusPill.className = 'status-chip connected';
      if (subtitle) {
        subtitle.textContent = `Última sincronização em ${formatDate(generatedAt)} · Publicação semanal às terças-feiras.`;
      }
    } else {
      statusPill.textContent = 'Aguardando 1ª carga';
      statusPill.className = 'status-chip draft';
      if (subtitle) {
        subtitle.textContent = 'Nenhuma varredura anterior localizada. Clique em "Verificar RPI Agora" para a primeira leitura.';
      }
    }
  }

  function renderMetrics(matches) {
    const data = inpiData || {};
    const latest = data.statistics?.latestRevista;
    const processes = new Set(matches.map(m => m.processo).filter(Boolean));
    const revistas = new Set(matches.map(m => m.revista?.numero).filter(Boolean));

    const elMatches = byId('inpiMetricMatches');
    const elProcesses = byId('inpiMetricProcesses');
    const elRevistas = byId('inpiMetricRevistas');
    const elLatest = byId('inpiMetricLatest');

    if (elMatches) elMatches.textContent = formatNumber(matches.length);
    if (elProcesses) elProcesses.textContent = formatNumber(processes.size);
    if (elRevistas) elRevistas.textContent = formatNumber(revistas.size || data.statistics?.totalRevistas || 0);
    if (elLatest) elLatest.textContent = latest?.numero ? `RPI ${latest.numero}` : '—';
  }

  function renderMonitors() {
    const monitors = inpiStatus?.monitors || inpiData?.lastRun?.monitors || [];
    const matches = inpiData?.matches || [];
    const container = byId('inpiMonitorsList');
    const countEl = byId('inpiMonitorsCount');
    if (countEl) countEl.textContent = `${monitors.length} advogado(s) do escritório`;
    if (!container) return;

    if (!monitors.length) {
      container.innerHTML = '<p style="color:var(--v2-color-muted-foreground,#8c96a5); font-size:12px; margin:0;">Nenhum advogado detectado no escritório. Verifique as configurações de Identidade do Escritório ou Termos.</p>';
      return;
    }

    container.innerHTML = monitors.map(monitor => {
      const hits = matches.filter(m => (m.monitores || []).some(hit => hit.id === monitor.id)).length;
      return `
        <div class="inpi-monitor-tag">
          <b>${escapeHtml(monitor.label)}</b>
          ${monitor.oab ? `<span class="inpi-monitor-badge">${escapeHtml(monitor.oab)}</span>` : ''}
          <span class="inpi-monitor-hits">${formatNumber(hits)} ocorrência${hits === 1 ? '' : 's'}</span>
        </div>
      `;
    }).join('');

    // Atualiza opções do select
    const select = byId('inpiMonitorFilter');
    if (select) {
      const current = state.monitor;
      select.innerHTML = '<option value="all">Todos os advogados</option>' + monitors.map(m => `
        <option value="${escapeHtml(m.id)}" ${m.id === current ? 'selected' : ''}>${escapeHtml(m.label)}</option>
      `).join('');
    }
  }

  function renderResults(matches) {
    const list = byId('inpiResultsList');
    const emptyState = byId('inpiEmptyState');
    const countBadge = byId('inpiResultCount');
    if (countBadge) countBadge.textContent = `${formatNumber(matches.length)} registro${matches.length === 1 ? '' : 's'}`;
    if (!list) return;

    if (emptyState) emptyState.classList.toggle('hidden', matches.length > 0);
    if (!matches.length) {
      list.innerHTML = '';
      return;
    }

    list.innerHTML = matches.map(match => {
      const dispatch = (match.despachos || [])[0] || {};
      const classes = (match.classes || []).slice(0, 2).map(item => `NCL ${item.codigo}${item.status ? ` · ${item.status}` : ''}`).join(' | ') || 'Classe não informada';
      const monitorsStr = (match.monitores || []).map(item => item.label).join(', ') || 'Advogado monitorado';
      const requerentes = (match.requerentes || []).map(item => item.uf ? `${item.nome} (${item.uf})` : item.nome).join('; ') || 'Titular não informado';
      const procuradores = (match.procuradores || []).join('; ') || 'Não informado';

      return `
        <article class="inpi-result-card" role="listitem">
          <div class="inpi-card-header">
            <div class="inpi-card-headline">
              <span class="inpi-process-pill">Proc. ${escapeHtml(match.processo || '—')}</span>
              <span class="inpi-brand-name">${escapeHtml(match.marca?.nome || 'Marca sem elemento nominativo')}</span>
            </div>
            <div class="inpi-card-headline">
              <span class="inpi-rpi-badge">RPI ${escapeHtml(match.revista?.numero || '—')} · ${escapeHtml(formatDate(match.revista?.data))}</span>
            </div>
          </div>

          <div class="inpi-card-grid">
            <div class="inpi-card-block">
              <span class="label">Advogado Correspondente</span>
              <p><strong>${escapeHtml(monitorsStr)}</strong></p>
              <div class="inpi-dispatch-box" style="margin-top:6px;">
                <strong>${escapeHtml(dispatch.codigo ? `Despacho ${dispatch.codigo}` : 'Despacho')}</strong>
                ${dispatch.nome ? ` · ${escapeHtml(dispatch.nome)}` : ''}
                ${dispatch.texto ? `<p style="margin:4px 0 0; font-size:11.5px;">${escapeHtml(dispatch.texto)}</p>` : ''}
              </div>
            </div>

            <div class="inpi-card-block">
              <span class="label">Especificação & Classe Nice</span>
              <p>${escapeHtml(classes)}</p>
              ${match.marca?.natureza ? `<p style="font-size:11.5px; color:var(--v2-color-muted-foreground); margin-top:4px;">Natureza: ${escapeHtml(match.marca.natureza)}${match.marca.apresentacao ? ` · Apresentação: ${escapeHtml(match.marca.apresentacao)}` : ''}</p>` : ''}
            </div>

            <div class="inpi-card-block">
              <span class="label">Titular & Procuradores</span>
              <p><strong>Requerente:</strong> ${escapeHtml(requerentes)}</p>
              <p style="margin-top:4px;"><strong>Procurador no INPI:</strong> ${escapeHtml(procuradores)}</p>
            </div>
          </div>

          <div class="inpi-card-footer">
            <span class="inpi-hits-summary">Identificado por termos vinculados ao escritório</span>
            <div class="inpi-actions">
              ${match.links?.pdf ? `<a class="inpi-action-link primary" href="${escapeHtml(match.links.pdf)}" target="_blank" rel="noreferrer" title="Abrir caderno oficial em PDF da RPI">PDF Oficial</a>` : ''}
              ${match.links?.xml ? `<a class="inpi-action-link" href="${escapeHtml(match.links.xml)}" target="_blank" rel="noreferrer" title="Baixar arquivo XML original da RPI">XML INPI</a>` : ''}
            </div>
          </div>
        </article>
      `;
    }).join('');
  }

  function render() {
    const matches = getFilteredMatches();
    renderStatus();
    renderMetrics(matches);
    renderMonitors();
    renderResults(matches);
  }

  const feature = {
    init() {
      if (initialized) return false;
      initialized = true;

      byId('inpiPanelClose')?.addEventListener('click', () => this.closeModal());
      byId('inpiPanelBackdrop')?.addEventListener('click', event => {
        if (event.target === byId('inpiPanelBackdrop')) this.closeModal();
      });
      documentRef?.addEventListener('keydown', event => {
        if (event.key === 'Escape' && !byId('inpiPanelBackdrop')?.classList.contains('hidden')) {
          this.closeModal();
        }
      });

      byId('btnInpiScanNow')?.addEventListener('click', () => this.triggerScan());

      byId('inpiSearchInput')?.addEventListener('input', event => {
        state.search = event.target.value;
        render();
      });

      byId('inpiMonitorFilter')?.addEventListener('change', event => {
        state.monitor = event.target.value;
        render();
      });

      byId('inpiFieldFilter')?.addEventListener('change', event => {
        state.field = event.target.value;
        render();
      });

      byId('inpiSortFilter')?.addEventListener('change', event => {
        state.sort = event.target.value;
        render();
      });

      byId('inpiResetFilters')?.addEventListener('click', () => {
        state.search = '';
        state.monitor = 'all';
        state.field = 'all';
        state.sort = 'recent';
        if (byId('inpiSearchInput')) byId('inpiSearchInput').value = '';
        if (byId('inpiMonitorFilter')) byId('inpiMonitorFilter').value = 'all';
        if (byId('inpiFieldFilter')) byId('inpiFieldFilter').value = 'all';
        if (byId('inpiSortFilter')) byId('inpiSortFilter').value = 'recent';
        render();
      });

      return true;
    },

    async loadData() {
      try {
        const [dataRes, statusRes] = await Promise.all([
          secureFetch('/api/integrations/inpi/data', { headers: { Accept: 'application/json' } }),
          secureFetch('/api/integrations/inpi/status', { headers: { Accept: 'application/json' } })
        ]);
        if (dataRes.ok) inpiData = await dataRes.json();
        if (statusRes.ok) inpiStatus = await statusRes.json();
        render();
      } catch (err) {
        showToast('Não foi possível carregar os dados do INPI.', 'error');
      }
    },

    async openModal() {
      this.init();
      const backdrop = byId('inpiPanelBackdrop');
      if (backdrop) {
        backdrop.classList.remove('hidden');
        backdrop.setAttribute('aria-hidden', 'false');
      }
      renderStatus();
      await this.loadData();
    },

    closeModal() {
      const backdrop = byId('inpiPanelBackdrop');
      if (backdrop) {
        backdrop.classList.add('hidden');
        backdrop.setAttribute('aria-hidden', 'true');
      }
    },

    async triggerScan() {
      if (isScanning) return;
      isScanning = true;
      const btn = byId('btnInpiScanNow');
      const originalText = btn ? btn.innerHTML : '';
      if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span>Varrendo RPI...</span>';
      }
      renderStatus();

      try {
        const response = await secureFetch('/api/integrations/inpi/scan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ limit: 1, force: true })
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(payload.message || 'Falha ao executar varredura.');
        }
        showToast(payload.message || 'Varredura da RPI concluída com sucesso.', 'success');
        await this.loadData();
      } catch (err) {
        showToast(err.message || 'Falha ao consultar a RPI.', 'error');
      } finally {
        isScanning = false;
        if (btn) {
          btn.disabled = false;
          btn.innerHTML = originalText;
        }
        renderStatus();
      }
    }
  };

  return feature;
}
