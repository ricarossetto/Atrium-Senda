import { Store, isoDate, uid } from '../core/store.js';

export function createContactsFeature({
  store = Store,
  documentRef = globalThis.document,
  normalizeText,
  escapeHtml,
  formatDate,
  sortRecords,
  updateTableSortHeaders,
  openModal
} = {}) {
  let initialized = false;
  const sort = { field: 'name', direction: 'asc' };
  const byId = id => documentRef?.getElementById(id);

  const feature = {
    init() {
      if (initialized) return false;
      initialized = true;
      byId('newContactButton')?.addEventListener('click', () => this.openContactModal());
      byId('contactSearch')?.addEventListener('input', event => this.render(event.target.value));
      return true;
    },

    handleSort(field) {
      if (sort.field === field) {
        sort.direction = sort.direction === 'asc' ? 'desc' : 'asc';
      } else {
        sort.field = field;
        sort.direction = field.includes('At') || field.includes('date') ? 'desc' : 'asc';
      }
      this.render(byId('contactSearch')?.value || '');
      return { ...sort };
    },

    render(query = '') {
      const needle = normalizeText(query);
      let records = store.state.contacts.filter(item => !needle || normalizeText(`${item.name} ${item.document} ${item.mobile} ${item.phone} ${item.email} ${item.origin} ${item.contactRole || ''} ${item.leadOrigin || ''} ${item.city || ''} ${item.registeredAt || item.createdAt || ''}`).includes(needle));
      records = sortRecords(records, sort);
      updateTableSortHeaders('contactTable', sort);
      byId('contactCount').textContent = `${store.state.contacts.length} contatos`;
      const roleMap = { cliente: 'Cliente', testemunha: 'Testemunha', perito: 'Perito Judicial', adverso: 'Adv. Adverso', correspondente: 'Correspondente', preposto: 'Preposto', outro: 'Outro' };
      byId('contactTableBody').innerHTML = records.length ? records.map(item => {
        const registeredDate = item.registeredAt || item.createdAt;
        const roleLabel = roleMap[item.contactRole] || (item.contactRole ? escapeHtml(item.contactRole) : 'Cliente');
        const roleBadge = `<span class="fee-chip fixo" style="font-size:0.72rem;padding:2px 6px;margin-right:4px;">${roleLabel}</span>`;
        const originLabel = item.leadOrigin ? escapeHtml(item.leadOrigin) : escapeHtml(item.origin || 'Direta');
        return `
        <tr data-contact-id="${escapeHtml(item.id)}" tabindex="0">
          <td>
            ${roleBadge}<strong>${escapeHtml(item.name)}</strong>
            <small>${escapeHtml(item.profession || 'Pessoa cadastrada')}</small>
          </td>
          <td><strong>${escapeHtml(item.document || '—')}</strong><small>${escapeHtml(item.rg || '')}</small></td>
          <td><strong>${escapeHtml(item.mobile || item.phone || '—')}</strong><small>${escapeHtml(item.email || '')}</small></td>
          <td><strong>${escapeHtml(item.city || '—')}</strong><small>${escapeHtml([item.state, item.country].filter(Boolean).join(' · '))}</small></td>
          <td><strong>${formatDate(registeredDate)}</strong><small>${item.externalId ? `ID ${escapeHtml(item.externalId)}` : 'Manual'}</small></td>
          <td>${originLabel}</td>
        </tr>`;
      }).join('') : '<tr><td colspan="6">Nenhum contato encontrado.</td></tr>';
      documentRef.querySelectorAll('#contactTableBody [data-contact-id]').forEach(row => row.addEventListener('click', () => {
        const item = store.state.contacts.find(record => record.id === row.dataset.contactId);
        if (item) this.openContactModal(item);
      }));
      return records;
    },

    openContactModal(defaults = {}) {
      openModal?.('contact', defaults.id ? 'Detalhes do contato' : 'Novo contato', 'Cadastro de pessoas', [
        { name: 'name', label: 'Nome completo / razão social', required: true, full: true },
        { name: 'contactRole', label: 'Papel do contato', type: 'select', options: [{value:'cliente',label:'Cliente / Outorgante'},{value:'testemunha',label:'Testemunha'},{value:'perito',label:'Perito Judicial / Assistente'},{value:'adverso',label:'Advogado Adverso / Parte Contrária'},{value:'correspondente',label:'Correspondente Jurídico'},{value:'preposto',label:'Preposto / Representante'},{value:'outro',label:'Outro Contato'}] },
        { name: 'leadOrigin', label: 'Origem do contato / captação', type: 'select', options: [{value:'indicacao',label:'Indicação de Cliente'},{value:'parceria',label:'Parceria Profissional'},{value:'balcao',label:'Balcão / Atendimento Direto'},{value:'redes_sociais',label:'Redes Sociais / WhatsApp'},{value:'google_site',label:'Google / Site do Escritório'},{value:'convenio',label:'Convênio / Entidade Sindical'},{value:'outro',label:'Outra Origem'}] },
        { name: 'document', label: 'CPF / CNPJ' }, { name: 'rg', label: 'RG' },
        { name: 'birthDate', label: 'Data de nascimento', type: 'date' }, { name: 'profession', label: 'Profissão' }, { name: 'maritalStatus', label: 'Estado civil' },
        { name: 'mobile', label: 'Celular' }, { name: 'phone', label: 'Telefone' }, { name: 'email', label: 'E-mail', type: 'email' },
        { name: 'origin', label: 'Origem (texto livre)' }, { name: 'city', label: 'Cidade' }, { name: 'state', label: 'Estado' },
        { name: 'address', label: 'Endereço', full: true }, { name: 'district', label: 'Bairro' }, { name: 'zip', label: 'CEP' },
        { name: 'notes', label: 'Anotações gerais', type: 'textarea', full: true }
      ], { source: 'Interna', contactRole: 'cliente', leadOrigin: 'indicacao', ...defaults });
    },

    saveContact(data, defaults = {}) {
      const editing = Boolean(defaults.id);
      const record = {
        id: defaults.id || uid('contact'),
        externalId: defaults.externalId || null,
        registeredAt: defaults.registeredAt || isoDate(),
        ...defaults,
        ...data,
        updatedAt: new Date().toISOString()
      };
      store.upsert('contacts', record);
      store.audit(editing ? 'Contato atualizado' : 'Contato cadastrado', record.name);
      return record;
    }
  };

  return feature;
}
