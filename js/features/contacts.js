import { Store, isoDate, uid } from '../core/store.js';
import { renderContactsV2Workspace } from '../views/ui-v2/contacts-presenter.js';

export function createContactsFeature({
  store = Store,
  documentRef = globalThis.document,
  normalizeText,
  escapeHtml,
  formatDate,
  sortRecords,
  updateTableSortHeaders,
  openModal,
  openOwnerDocuments
} = {}) {
  let initialized = false;
  const sort = { field: 'name', direction: 'asc' };
  let roleFilter = 'all';
  let selectedContactId = null;
  let restoreContactId = null;
  const byId = id => documentRef?.getElementById(id);
  const isV2 = () => documentRef?.documentElement?.dataset?.ui === 'v2';

  const feature = {
    init() {
      if (initialized) return false;
      initialized = true;
      byId('newContactButton')?.addEventListener('click', () => this.openContactModal());
      byId('contactSearch')?.addEventListener('input', event => this.render(event.target.value));
      byId('contactsV2Workspace')?.addEventListener('click', event => this.handleWorkspaceClick(event));
      byId('contactsV2Workspace')?.addEventListener('keydown', event => this.handleWorkspaceKeydown(event));
      return true;
    },

    get roleFilter() { return roleFilter; },
    get selectedContactId() { return selectedContactId; },

    setRoleFilter(value) {
      const allowed = ['all', 'cliente', 'testemunha', 'perito', 'adverso', 'correspondente', 'preposto', 'outro'];
      roleFilter = allowed.includes(value) ? value : 'all';
      selectedContactId = null;
      this.render(byId('contactSearch')?.value || '');
      return roleFilter;
    },

    selectContact(id, { focusInspector = true } = {}) {
      const item = store.state.contacts.find(record => String(record.id) === String(id));
      if (!item) return null;
      selectedContactId = item.id;
      restoreContactId = item.id;
      this.render(byId('contactSearch')?.value || '');
      if (focusInspector) queueMicrotask(() => {
        const target = this.isMobileViewport()
          ? byId('contactInspector')?.querySelector('[data-contact-inspector-close]')
          : byId('contactInspectorHeading');
        target?.focus();
      });
      return item;
    },

    closeInspector({ restoreFocus = true } = {}) {
      const contactId = restoreContactId;
      selectedContactId = null;
      this.render(byId('contactSearch')?.value || '');
      if (restoreFocus && contactId) queueMicrotask(() => {
        [...documentRef.querySelectorAll('#contactsV2Workspace [data-contact-id]')]
          .find(element => String(element.dataset.contactId) === String(contactId))?.focus();
      });
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

    upsertExternalContact(record) {
      const incoming = safeExternalRecord(record);
      if (!meaningful(incoming.name)) return null;
      store.state.contacts = Array.isArray(store.state.contacts) ? store.state.contacts : [];
      const index = contactMatchIndex(store.state.contacts, incoming);
      const merged = mergeExternalContact(index >= 0 ? store.state.contacts[index] : null, incoming);
      if (!merged.id) merged.id = incoming.id || uid('contact');
      if (!meaningful(merged.contactRole) && isExternalContact(incoming)) merged.contactRole = 'outro';
      if (index >= 0) store.state.contacts[index] = merged;
      else store.state.contacts.unshift(merged);
      return merged;
    },

    render(query = '') {
      const needle = normalizeText(query);
      let records = store.state.contacts.filter(item => !needle || normalizeText(`${item.name} ${item.document} ${item.mobile} ${item.phone} ${item.email} ${item.origin} ${item.contactRole || ''} ${item.leadOrigin || ''} ${item.city || ''} ${item.registeredAt || item.createdAt || ''}`).includes(needle));
      records = sortRecords(records, sort);
      updateTableSortHeaders('contactTable', sort);
      byId('contactCount').textContent = `${store.state.contacts.length} contatos`;
      if (isV2()) {
        const visibleRecords = roleFilter === 'all'
          ? records
          : records.filter(item => item.contactRole === roleFilter);
        if (selectedContactId && !visibleRecords.some(item => String(item.id) === String(selectedContactId))) selectedContactId = null;
        byId('contactTableBody').innerHTML = '';
        byId('contactsV2Workspace').innerHTML = renderContactsV2Workspace({
          records: visibleRecords,
          allRecords: store.state.contacts,
          selectedId: selectedContactId,
          roleFilter,
          query,
          sort,
          escapeHtml,
          formatDate
        });
        this.syncInspectorSemantics();
        return visibleRecords;
      }
      byId('contactsV2Workspace').innerHTML = '';
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

    handleWorkspaceClick(event) {
      const target = event.target.closest('button');
      if (!target) return;
      if (target.dataset.contactRoleFilter) {
        this.setRoleFilter(target.dataset.contactRoleFilter);
        return;
      }
      if (target.dataset.contactSortField) {
        this.handleSort(target.dataset.contactSortField);
        return;
      }
      if (target.dataset.contactId) {
        this.selectContact(target.dataset.contactId);
        return;
      }
      if (target.hasAttribute('data-contact-inspector-close')) {
        this.closeInspector();
        return;
      }
      if (target.hasAttribute('data-contact-edit')) {
        const item = store.state.contacts.find(record => String(record.id) === String(selectedContactId));
        if (item) this.openContactModal(item);
        return;
      }
      if (target.hasAttribute('data-contact-documents')) {
        byId('btnGenDocContact')?.click();
        return;
      }
      if (target.hasAttribute('data-contact-archive')) {
        if (selectedContactId) openOwnerDocuments?.('contact', selectedContactId);
        return;
      }
      if (target.hasAttribute('data-contact-create')) this.openContactModal();
    },

    handleWorkspaceKeydown(event) {
      if (event.key === 'Escape' && selectedContactId) {
        event.preventDefault();
        event.stopPropagation();
        this.closeInspector();
        return;
      }
      if (event.key !== 'Tab' || !selectedContactId || !this.isMobileViewport()) return;
      const inspector = byId('contactInspector');
      const focusable = [...(inspector?.querySelectorAll('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])') || [])]
        .filter(element => element.getClientRects().length > 0);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable.at(-1);
      if (event.shiftKey && documentRef.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && documentRef.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    },

    syncInspectorSemantics() {
      const inspector = byId('contactInspector');
      if (!inspector) return;
      const mobile = this.isMobileViewport();
      inspector.setAttribute('role', mobile && selectedContactId ? 'dialog' : 'region');
      if (mobile && selectedContactId) inspector.setAttribute('aria-modal', 'true');
      else inspector.removeAttribute('aria-modal');
    },

    isMobileViewport() {
      return Boolean(documentRef?.defaultView?.matchMedia?.('(max-width: 760px)').matches);
    },

    openContactModal(defaults = {}) {
      const v2 = isV2();
      openModal?.('contact', defaults.id ? (v2 ? 'Editar contato' : 'Detalhes do contato') : 'Novo contato', v2 ? 'Pessoas e relacionamentos' : 'Cadastro de pessoas', [
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

function mergeExternalContact(existing, incoming) {
  const current = safeExternalRecord(existing);
  const external = safeExternalRecord(incoming);
  const merged = { ...current };
  for (const [field, value] of Object.entries(external)) {
    if (!meaningful(value) || ['source', 'relatedProcessNumbers', 'monitoredTermIds', 'contactRole'].includes(field)) continue;
    if (['datajudAlias', 'collectedAt'].includes(field) || !meaningful(merged[field])) merged[field] = value;
  }
  const currentWasExternal = /DataJud/i.test(String(current.source || ''));
  if (meaningful(external.contactRole) && (!meaningful(current.contactRole) || (currentWasExternal && current.contactRole === 'outro'))) {
    merged.contactRole = external.contactRole;
  }
  const source = mergeSources(current.source, external.source);
  if (source) merged.source = source;
  const relatedProcessNumbers = uniqueStrings([...(current.relatedProcessNumbers || []), ...(external.relatedProcessNumbers || [])]);
  if (relatedProcessNumbers.length) merged.relatedProcessNumbers = relatedProcessNumbers;
  const monitoredTermIds = uniqueStrings([...(current.monitoredTermIds || []), ...(external.monitoredTermIds || [])]);
  if (monitoredTermIds.length) merged.monitoredTermIds = monitoredTermIds;
  return merged;
}

function isExternalContact(record) {
  return meaningful(record?.externalId)
    || meaningful(record?.datajudAlias)
    || /DataJud/i.test(String(record?.source || ''));
}

function contactMatchIndex(records, incoming) {
  const document = normalizeDocument(incoming.document);
  let strongerIdentityAmbiguous = false;
  if (document) {
    const matches = matchingIndexes(records, record => normalizeDocument(record.document) === document);
    if (matches.length === 1) return matches[0];
    if (matches.length > 1) strongerIdentityAmbiguous = true;
  }
  const externalId = String(incoming.externalId || '').trim();
  if (externalId) {
    const matches = matchingIndexes(records, record => String(record.externalId || '').trim() === externalId);
    if (matches.length === 1) return matches[0];
    if (matches.length > 1) return -1;
  }
  if (strongerIdentityAmbiguous) return -1;
  const name = normalizeIdentity(incoming.name);
  if (!name) return -1;
  const matches = matchingIndexes(records, record => {
    if (normalizeIdentity(record.name) !== name) return false;
    const recordExternalId = String(record.externalId || '').trim();
    const conflictingExternalId = externalId && recordExternalId && recordExternalId !== externalId;
    const recordDocument = normalizeDocument(record.document);
    const conflictingDocument = document && recordDocument && recordDocument !== document;
    return !conflictingExternalId && !conflictingDocument;
  });
  return matches.length === 1 ? matches[0] : -1;
}

function matchingIndexes(records, predicate) {
  return records.map((record, index) => predicate(record) ? index : -1).filter(index => index >= 0);
}

function safeExternalRecord(record) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) return {};
  return Object.fromEntries(Object.entries(record).filter(([key]) => !['__proto__', 'prototype', 'constructor'].includes(key)));
}

function meaningful(value) {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim() !== '';
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

function normalizeDocument(value) {
  return String(value || '').replace(/[^A-Za-z0-9]/g, '').toLowerCase();
}

function normalizeIdentity(value) {
  return String(value || '').replace(/\s+/g, ' ').trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function mergeSources(left, right) {
  return [...new Set([...(String(left || '').split(' + ')), right].map(value => String(value || '').trim()).filter(Boolean))].join(' + ');
}

function uniqueStrings(values) {
  return [...new Set(values.map(value => String(value || '').trim()).filter(Boolean))];
}
