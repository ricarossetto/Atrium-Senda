import { Store, isoDate, uid } from '../core/store.js';

export function createLeadsFeature({
  store = Store,
  documentRef = globalThis.document,
  normalizeText,
  escapeHtml,
  formatDate,
  formatCurrency,
  openModal,
  getCurrentUserName,
  getContacts = () => [],
  renderV2Workspace
} = {}) {
  let initialized = false;
  let statusFilter = 'all';
  const byId = id => documentRef?.getElementById(id);

  const feature = {
    get statusFilter() { return statusFilter; },

    init() {
      if (initialized) return false;
      initialized = true;
      byId('newLeadButton')?.addEventListener('click', () => this.openLeadModal());
      byId('leadStatusFilters')?.addEventListener('click', event => {
        const button = event.target.closest('button[data-lead-filter]');
        if (!button) return;
        statusFilter = button.dataset.leadFilter;
        byId('leadStatusFilters').querySelectorAll('button').forEach(item => item.classList.toggle('active', item === button));
        this.render();
      });
      byId('leadSearch')?.addEventListener('input', event => this.render(event.target.value));
      return true;
    },

    render(query = '') {
      const listEl = byId('leadTableBody');
      if (!listEl) return;
      const filter = statusFilter || 'all';
      const needle = normalizeText(query);
      const leads = store.state.leads || [];

      const filtered = leads.filter(lead => {
        if (filter !== 'all' && lead.status !== filter) return false;
        if (!needle) return true;
        return normalizeText(`${lead.client} ${lead.serviceType} ${lead.origin} ${lead.responsible}`).includes(needle);
      });

      const countEl = byId('leadCount');
      if (countEl) countEl.textContent = `${filtered.length} atendimentos`;

      byId('leadStatusFilters')?.querySelectorAll('button[data-lead-filter]').forEach(button => {
        const selected = button.dataset.leadFilter === filter;
        button.classList.toggle('active', selected);
        button.setAttribute('aria-pressed', String(selected));
      });

      const workspace = byId('leadsV2Workspace');
      const isV2 = documentRef?.documentElement?.dataset?.ui === 'v2';
      if (isV2 && workspace && renderV2Workspace) {
        listEl.innerHTML = '';
        workspace.innerHTML = renderV2Workspace({
          allLeads: leads,
          leads: filtered,
          statusFilter: filter,
          escapeHtml,
          formatDate,
          formatCurrency,
          fallbackDate: isoDate()
        });
        workspace.querySelectorAll('[data-lead-id]').forEach(record => {
          record.addEventListener('click', () => {
            const lead = store.state.leads.find(item => item.id === record.dataset.leadId);
            if (lead) this.openLeadModal(lead);
          });
        });
        return filtered;
      }
      if (workspace) workspace.innerHTML = '';

      if (!filtered.length) {
        listEl.innerHTML = '<tr><td colspan="7" class="empty-table" style="text-align:center;padding:24px;color:var(--muted);">Nenhum atendimento ou oportunidade registrada. Clique em "+ Novo Atendimento" para cadastrar.</td></tr>';
        return;
      }

      listEl.innerHTML = filtered.map(lead => {
        const statusMap = {
          novo: '<span class="lead-status-chip novo">Novo</span>',
          em_analise: '<span class="lead-status-chip em_analise">Em Análise</span>',
          proposta: '<span class="lead-status-chip proposta">Proposta Enviada</span>',
          fechado: '<span class="lead-status-chip fechado">Fechado</span>',
          declinado: '<span class="lead-status-chip declinado">Declinado</span>'
        };
        const statusHtml = statusMap[lead.status] || '<span class="lead-status-chip novo">Novo</span>';
        const valueFormatted = lead.estimatedFee ? formatCurrency(Number(lead.estimatedFee)) : 'A definir';

        return `
          <tr data-lead-id="${escapeHtml(lead.id)}" style="cursor:pointer;">
            <td><strong>${escapeHtml(lead.client || 'Interessado')}</strong></td>
            <td>${escapeHtml(lead.serviceType || 'Consulta Inicial')}</td>
            <td><span class="status-chip muted">${escapeHtml(lead.origin || 'Direto')}</span></td>
            <td><strong style="color:var(--gold);">${valueFormatted}</strong></td>
            <td>${escapeHtml(lead.responsible || 'Advogado(a)')}</td>
            <td>${formatDate(lead.registeredAt || isoDate())}</td>
            <td>${statusHtml}</td>
          </tr>
        `;
      }).join('');

      listEl.querySelectorAll('[data-lead-id]').forEach(row => {
        row.addEventListener('click', () => {
          const lead = store.state.leads.find(item => item.id === row.dataset.leadId);
          if (lead) this.openLeadModal(lead);
        });
      });
      return filtered;
    },

    openLeadModal(defaults = {}) {
      const editing = Boolean(defaults.id);
      const fields = [
        { name: 'client', label: 'Cliente / interessado', required: true, full: true, placeholder: 'Busque um contato ou informe um novo interessado', suggestions: getContacts().map(contact => ({ value: contact.name, label: [contact.mobile || contact.phone, contact.email].filter(Boolean).join(' · ') })), note: 'Selecione um contato existente quando aplicável; um nome novo não cria contato automaticamente.' },
        { name: 'serviceType', label: 'Tipo de Ação / Serviço Jurídico', required: true, full: true, placeholder: 'Ex: Concessão de Aposentadoria Especial' },
        {
          name: 'status', label: 'Status do Atendimento', type: 'select',
          options: [
            { value: 'novo', label: 'Novo Lead / Contato Inicial' },
            { value: 'em_analise', label: 'Em Análise Documental' },
            { value: 'proposta', label: 'Proposta de Honorários Enviada' },
            { value: 'fechado', label: 'Contrato Fechado (Virou Cliente)' },
            { value: 'declinado', label: 'Declinado / Não Viável' }
          ]
        },
        {
          name: 'origin', label: 'Origem da Captação', type: 'select',
          options: [
            { value: 'Indicação de Cliente', label: 'Indicação de Cliente' },
            { value: 'Google / Site', label: 'Google / Site' },
            { value: 'Instagram / Redes Sociais', label: 'Instagram / Redes Sociais' },
            { value: 'Parceiro / Correspondente', label: 'Parceiro / Correspondente' },
            { value: 'Sindicato / Associação', label: 'Sindicato / Associação' },
            { value: 'Passante / Balcão', label: 'Passante / Balcão' },
            { value: 'Outro', label: 'Outro' }
          ]
        },
        { name: 'estimatedFee', label: 'Honorários Estimados (R$)', type: 'number', placeholder: 'Ex: 5000' },
        { name: 'responsible', label: 'Responsável pelo Atendimento', placeholder: 'Ex: Dr. Ricardo' },
        { name: 'notes', label: 'Observações & Relato do Caso', type: 'textarea', full: true, placeholder: 'Descreva a pretensão do cliente e próximos passos...' }
      ];

      openModal?.('lead', editing ? 'Editar Atendimento' : 'Novo Atendimento / Oportunidade', 'CRM Jurídico', fields, {
        status: 'novo',
        origin: 'Indicação de Cliente',
        responsible: getCurrentUserName?.() || 'Advogado(a)',
        ...defaults
      });
    },

    saveLead(data, defaults = {}) {
      const editing = Boolean(defaults.id);
      const record = {
        id: defaults.id || uid('lead'),
        registeredAt: defaults.registeredAt || isoDate(),
        ...defaults,
        ...data,
        estimatedFee: data.estimatedFee ? Number(data.estimatedFee) : null,
        updatedAt: new Date().toISOString()
      };
      store.upsert('leads', record);
      store.audit(editing ? 'Atendimento atualizado' : 'Novo atendimento registrado', `${record.client} · ${record.serviceType}`);
      return record;
    }
  };

  return feature;
}
