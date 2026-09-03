import { Store, isoDate, uid } from '../core/store.js';
import { buildClientContext } from '../core/client-context.js';
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
  openOwnerDocuments,
  openProcess,
  openTask,
  openPublication,
  openAgenda,
  openDocument,
  openFinancial,
  openAssistant,
  secureFetch,
  showToast = () => {}
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
          selectedContext: buildClientContext(store.state, store.state.contacts.find(item => String(item.id) === String(selectedContactId || ''))),
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
      if (target.hasAttribute('data-contact-assistant')) {
        const item = store.state.contacts.find(record => String(record.id) === String(selectedContactId));
        if (item) openAssistant?.(item);
        return;
      }
      const context = buildClientContext(store.state, store.state.contacts.find(item => String(item.id) === String(selectedContactId || '')));
      if (target.dataset.contactProcess) {
        const process = context.processes.find(item => String(item.id) === target.dataset.contactProcess);
        if (process) openProcess?.(process);
        return;
      }
      if (target.dataset.contactTask) {
        const task = context.tasks.find(item => String(item.id) === target.dataset.contactTask);
        if (task) openTask?.(task);
        return;
      }
      if (target.dataset.contactPublication) {
        const publication = context.publications.find(item => String(item.id) === target.dataset.contactPublication);
        if (publication) openPublication?.(publication);
        return;
      }
      if (target.dataset.contactAgenda) {
        const appointment = context.appointments.find(item => String(item.id) === target.dataset.contactAgenda);
        if (appointment) openAgenda?.(appointment);
        return;
      }
      if (target.dataset.contactDocument) {
        const document = context.documents.find(item => String(item.id) === target.dataset.contactDocument);
        if (document) openDocument?.(document);
        return;
      }
      if (target.dataset.contactFinancial) {
        const process = context.processes.find(item => String(item.id) === target.dataset.contactFinancial);
        if (process) openFinancial?.(process);
        return;
      }
      if (target.dataset.contactContextEvent) {
        const timelineEvent = context.timeline.find(item => item.contextId === target.dataset.contactContextEvent);
        if (!timelineEvent) return;
        if (timelineEvent.target === 'task') {
          const task = context.tasks.find(item => String(item.id) === timelineEvent.entityId);
          if (task) openTask?.(task);
        } else if (timelineEvent.target === 'publication') {
          const publication = context.publications.find(item => String(item.id) === timelineEvent.entityId);
          if (publication) openPublication?.(publication);
        } else if (timelineEvent.target === 'agenda') {
          const appointment = context.appointments.find(item => String(item.id) === timelineEvent.entityId);
          if (appointment) openAgenda?.(appointment);
        } else if (timelineEvent.target === 'document') {
          const document = context.documents.find(item => String(item.id) === timelineEvent.entityId);
          if (document) openDocument?.(document);
        } else if (timelineEvent.target === 'financial') {
          const process = context.processes.find(item => String(item.id) === timelineEvent.processId);
          if (process) openFinancial?.(process);
        }
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
      const modalDefaults = { source: 'Interna', contactRole: 'cliente', leadOrigin: 'indicacao', ...defaults };
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
      ], modalDefaults, v2 ? registryReviewShell() : '');
      if (v2) this.installRegistryReview(modalDefaults);
    },

    installRegistryReview(modalDefaults) {
      const panel = byId('contactRegistryReview');
      if (!panel || typeof secureFetch !== 'function') return false;
      let currentResult = null;
      let cepLookupActive = false;
      const setStatus = (message, state = 'neutral') => {
        const status = panel.querySelector('[data-registry-status]');
        if (!status) return;
        status.textContent = message;
        status.dataset.state = state;
      };
      byId('field-zip')?.addEventListener('change', () => {
        if (/^\d{8}$/.test(String(byId('field-zip')?.value || '').replace(/\D/g, ''))) panel.querySelector('[data-registry-action="cep"]')?.click();
      });
      panel.addEventListener('click', async event => {
        const action = event.target.closest('[data-registry-action]')?.dataset.registryAction;
        if (!action) return;
        if (action === 'document') {
          const documentInput = byId('field-document');
          const value = documentInput?.value || '';
          setStatus('Validando o documento informado…', 'loading');
          try {
            const validation = await registryRequest(secureFetch, `/api/registry/document/validate?value=${encodeURIComponent(value)}`);
            if (validation.type === 'cpf') {
              currentResult = null;
              panel.querySelector('[data-registry-results]').innerHTML = registryCpfResult(validation, escapeHtml);
              setStatus(validation.valid ? validation.message : 'CPF inválido. Revise os dígitos antes de salvar.', validation.valid ? 'attention' : 'error');
              return;
            }
            if (validation.type !== 'cnpj' || !validation.valid) throw new Error('CNPJ inválido. Revise os caracteres e os dígitos verificadores.');
            setStatus('Consultando a fonte pública de CNPJ…', 'loading');
            store.audit('Consulta cadastral iniciada', 'CNPJ · fonte pública supervisionada');
            currentResult = await registryRequest(secureFetch, `/api/registry/cnpj?value=${encodeURIComponent(validation.normalized)}`);
            const candidates = registryDuplicateCandidates(store.state, currentResult, modalDefaults.id);
            panel.querySelector('[data-registry-results]').innerHTML = registryCnpjResult(currentResult, candidates, registryCurrentValues(byId), escapeHtml);
            setStatus(`Consulta ${currentResult.registry?.freshness === 'cached' ? 'em cache' : 'ao vivo'} concluída. Revise antes de aplicar.`, 'success');
            return;
          } catch (error) {
            currentResult = null;
            panel.querySelector('[data-registry-results]').innerHTML = '';
            setStatus(error.message || 'Não foi possível consultar o cadastro.', 'error');
            return;
          }
        }
        if (action === 'cep') {
          if (cepLookupActive) return;
          cepLookupActive = true;
          const value = byId('field-zip')?.value || '';
          setStatus('Consultando o CEP informado…', 'loading');
          try {
            store.audit('Consulta cadastral iniciada', 'CEP · fonte pública supervisionada');
            const result = await registryRequest(secureFetch, `/api/registry/cep?value=${encodeURIComponent(value)}`);
            currentResult = { ...(currentResult || {}), ...result, registry: result.registry };
            panel.querySelector('[data-registry-results]').innerHTML = registryAddressResult(result, escapeHtml);
            setStatus(`Endereço ${result.registry?.freshness === 'cached' ? 'em cache' : 'consultado ao vivo'}. Revise antes de aplicar.`, 'success');
          } catch (error) {
            setStatus(error.message || 'Não foi possível consultar o CEP.', 'error');
          } finally {
            cepLookupActive = false;
          }
          return;
        }
        if (action === 'apply') {
          const selected = [...panel.querySelectorAll('[data-registry-field]:checked')];
          const appliedFields = [];
          selected.forEach(input => {
            const target = byId(`field-${input.dataset.registryField}`);
            if (!target) return;
            target.value = input.dataset.registryValue || '';
            target.dispatchEvent(new Event('input', { bubbles: true }));
            appliedFields.push(input.dataset.registryField);
          });
          if (!appliedFields.length) {
            setStatus('Selecione ao menos um campo para aplicar.', 'attention');
            return;
          }
          modalDefaults.registryProvenance = mergeRegistryProvenance(modalDefaults.registryProvenance, currentResult, appliedFields);
          store.audit('Campos cadastrais revisados', `${appliedFields.join(', ')} · aplicação humana`);
          setStatus(`${appliedFields.length} campo(s) aplicado(s). O salvamento continua sob sua confirmação.`, 'success');
          return;
        }
        if (action === 'keep-current' || action === 'cancel-review') {
          currentResult = null;
          panel.querySelector('[data-registry-results]').innerHTML = '';
          setStatus(action === 'keep-current' ? 'Cadastro atual mantido. Nenhum campo foi alterado.' : 'Revisão cancelada. Nenhum campo foi alterado.', 'neutral');
          return;
        }
        if (action === 'qsa') {
          const partnerIndex = Number(event.target.closest('[data-registry-partner-index]')?.dataset.registryPartnerIndex);
          const partner = currentResult?.qsa?.[partnerIndex];
          if (!partner?.name) return;
          const match = registryPartnerMatch(store.state.contacts, partner.name);
          if (match) {
            setStatus(`Já existe contato com o mesmo nome: ${match.name}. Nenhuma mesclagem foi feita.`, 'attention');
            return;
          }
          modalDefaults._registryQsaImports = Array.isArray(modalDefaults._registryQsaImports) ? modalDefaults._registryQsaImports : [];
          if (!modalDefaults._registryQsaImports.some(item => normalizeIdentity(item.name) === normalizeIdentity(partner.name))) {
            modalDefaults._registryQsaImports.push({ ...partner, sourceName: currentResult.legalName || currentResult.tradeName || 'Pessoa jurídica consultada' });
          }
          event.target.closest('[data-registry-partner-index]').disabled = true;
          event.target.closest('[data-registry-partner-index]').textContent = 'Importação preparada';
          setStatus('Sócio preparado como contato de papel “Outro”. A criação ocorrerá somente ao salvar.', 'success');
        }
      });
      return true;
    },

    saveContact(data, defaults = {}) {
      const editing = Boolean(defaults.id);
      const pendingQsaImports = Array.isArray(defaults._registryQsaImports) ? defaults._registryQsaImports : [];
      const safeDefaults = { ...defaults };
      delete safeDefaults._registryQsaImports;
      const record = {
        id: safeDefaults.id || uid('contact'),
        externalId: safeDefaults.externalId || null,
        registeredAt: safeDefaults.registeredAt || isoDate(),
        ...safeDefaults,
        ...data,
        updatedAt: new Date().toISOString()
      };
      store.upsert('contacts', record);
      store.audit(editing ? 'Contato atualizado' : 'Contato cadastrado', record.name);
      for (const partner of pendingQsaImports) {
        if (!partner?.name || registryPartnerMatch(store.state.contacts, partner.name)) continue;
        const related = {
          id: uid('contact'), externalId: null, registeredAt: isoDate(), updatedAt: new Date().toISOString(),
          name: partner.name, profession: partner.role || '', contactRole: 'outro', leadOrigin: 'outro',
          origin: `Quadro societário de ${partner.sourceName}`, source: 'BrasilAPI · importação QSA supervisionada',
          registryProvenance: [{ source: 'BrasilAPI · dados públicos de CNPJ', appliedFields: ['name', 'profession'], appliedAt: new Date().toISOString() }]
        };
        store.upsert('contacts', related);
        store.audit('Contato cadastrado', related.name);
      }
      if (pendingQsaImports.length) showToast(`${pendingQsaImports.length} vínculo(s) societário(s) revisado(s) no cadastro.`, 'success');
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

function registryReviewShell() {
  return `<section class="contact-registry-review" id="contactRegistryReview" aria-labelledby="contactRegistryHeading">
    <div class="contact-registry-heading"><div><span>INTELIGÊNCIA CADASTRAL</span><h3 id="contactRegistryHeading">Consultar antes de preencher</h3></div><p>Fontes públicas, com revisão humana antes de qualquer alteração.</p></div>
    <div class="contact-registry-actions">
      <button type="button" class="v2-button is-secondary" data-registry-action="document">Validar / consultar CPF ou CNPJ</button>
      <button type="button" class="v2-button is-secondary" data-registry-action="cep">Consultar CEP</button>
    </div>
    <p class="contact-registry-status" data-registry-status data-state="neutral" role="status" aria-live="polite">Nenhum dado é aplicado automaticamente.</p>
    <div class="contact-registry-results" data-registry-results></div>
  </section>`;
}

async function registryRequest(secureFetch, url) {
  const response = await secureFetch(url, { headers: { Accept: 'application/json' } });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.message || 'Consulta cadastral indisponível.');
  return payload;
}

function registryCpfResult(validation, escapeHtml) {
  return `<div class="registry-validation-card ${validation.valid ? 'is-valid' : 'is-invalid'}"><strong>${validation.valid ? 'CPF estruturalmente válido' : 'CPF inválido'}</strong><p>${escapeHtml(validation.message)}</p><small>A validação local não identifica a pessoa nem consulta situação cadastral.</small></div>`;
}

function registryCnpjResult(result, candidates, currentValues, escapeHtml) {
  const fields = [
    ['name', 'Razão social', result.legalName], ['email', 'E-mail', result.email], ['phone', 'Telefone', result.phone],
    ['address', 'Endereço', result.address], ['district', 'Bairro', result.district], ['city', 'Cidade', result.city],
    ['state', 'UF', result.state], ['zip', 'CEP', result.zip]
  ];
  const duplicates = candidates.length ? `<div class="registry-duplicate-hint"><strong>Possíveis registros ou relações a revisar</strong>${candidates.map(item => `<p><span>Nível ${escapeHtml(item.level)}</span>${escapeHtml(item.name)} · ${escapeHtml(item.reason)}</p>`).join('')}<small>É apenas um indício cadastral. Nenhuma mesclagem, vínculo ou conclusão de conflito foi realizada.</small></div>` : '';
  const qsa = result.qsa?.length ? `<section class="registry-qsa"><h4>Quadro societário</h4>${result.qsa.map((partner, index) => `<div><span><strong>${escapeHtml(partner.name)}</strong><small>${escapeHtml(partner.role || 'Qualificação não informada')}</small></span><button type="button" class="v2-button is-secondary" data-registry-action="qsa" data-registry-partner-index="${index}">Preparar contato</button></div>`).join('')}<p>Sócios são importados como “Outro” após confirmação; nunca como cliente automático.</p></section>` : '';
  const facts = [result.tradeName && `Nome fantasia: ${result.tradeName}`, result.primaryActivity && `CNAE principal: ${result.primaryActivity}`, result.statusDate && `Situação desde: ${result.statusDate}`, result.municipalityIbgeCode && `IBGE: ${result.municipalityIbgeCode}`, typeof result.simpleNational === 'boolean' && `Simples Nacional: ${result.simpleNational ? 'Sim' : 'Não'}`, typeof result.mei === 'boolean' && `MEI: ${result.mei ? 'Sim' : 'Não'}`].filter(Boolean);
  const registryLabel = `${result.registry?.freshness === 'cached' ? 'CACHE' : 'LIVE'} · ${result.registry?.source || 'Fonte pública'} · consulta ${result.registry?.consultedAt || 'sem horário informado'}`;
  return `<div class="registry-company-summary"><div><span>${escapeHtml(result.status || 'Situação não informada')}</span><strong>${escapeHtml(result.legalName || result.tradeName || 'Pessoa jurídica')}</strong><small>${escapeHtml(result.document)} · ${escapeHtml(registryLabel)}</small>${facts.length ? `<p>${facts.map(escapeHtml).join(' · ')}</p>` : ''}</div></div>${duplicates}<fieldset class="registry-field-review"><legend>Cadastro atual versus dado encontrado</legend>${fields.filter(([, , value]) => value).map(([field, label, value]) => `<label><input type="checkbox" data-registry-field="${field}" data-registry-value="${escapeHtml(value)}"><span><strong>${label}</strong><small><b>Atual</b> ${escapeHtml(currentValues[field] || 'não informado')}</small><small><b>Encontrado</b> ${escapeHtml(value)}</small></span></label>`).join('')}</fieldset><div class="registry-review-actions"><button type="button" class="v2-button is-secondary" data-registry-action="cancel-review">Cancelar revisão</button><button type="button" class="v2-button is-secondary" data-registry-action="keep-current">Manter cadastro atual</button><button type="button" class="v2-button is-primary registry-apply" data-registry-action="apply">Aplicar campos selecionados</button></div>${qsa}`;
}

function registryAddressResult(result, escapeHtml) {
  const fields = [['address', 'Endereço', result.address], ['district', 'Bairro', result.district], ['city', 'Cidade', result.city], ['state', 'UF', result.state], ['zip', 'CEP', result.zip]];
  return `${result.ibgeCode ? `<p class="registry-address-context">Município IBGE ${escapeHtml(result.ibgeCode)} · Brasil</p>` : ''}<fieldset class="registry-field-review"><legend>Endereço encontrado — revise antes de aplicar</legend>${fields.filter(([, , value]) => value).map(([field, label, value]) => `<label><input type="checkbox" checked data-registry-field="${field}" data-registry-value="${escapeHtml(value)}"><span><strong>${label}</strong><small>${escapeHtml(value)}</small></span></label>`).join('')}</fieldset><div class="registry-review-actions"><button type="button" class="v2-button is-secondary" data-registry-action="cancel-review">Cancelar revisão</button><button type="button" class="v2-button is-primary registry-apply" data-registry-action="apply">Aplicar endereço selecionado</button></div>`;
}

function registryDuplicateCandidates(state, result, currentId) {
  const contacts = state?.contacts || [];
  const document = normalizeDocument(result.normalizedDocument || result.document);
  const email = normalizeIdentity(result.email);
  const phone = String(result.phone || '').replace(/\D/g, '');
  const names = [result.legalName, result.tradeName].map(normalizeIdentity).filter(Boolean);
  const contactCandidates = contacts.filter(item => String(item.id) !== String(currentId || '')).map(item => {
    const itemName = normalizeIdentity(item.name);
    const nameStrength = Math.max(...names.map(name => identitySimilarity(name, itemName)), 0);
    const sameChannel = (email && normalizeIdentity(item.email) === email) || (phone && [item.mobile, item.phone].some(value => String(value || '').replace(/\D/g, '') === phone));
    const sameLocation = Boolean(result.city && normalizeIdentity(item.city) === normalizeIdentity(result.city));
    if ((document && normalizeDocument(item.document) === document) || (result.externalId && item.externalId === result.externalId)) return { level: 'A', name: item.name, reason: 'mesmo identificador forte' };
    if (nameStrength >= 0.72 && (sameChannel || sameLocation)) return { level: 'B', name: item.name, reason: `nome compatível + ${sameChannel ? 'canal de contato' : 'localidade'}` };
    if (nameStrength >= 0.72) return { level: 'C', name: item.name, reason: 'semelhança nominal; exige revisão humana' };
    return null;
  }).filter(Boolean);
  const relatedNames = new Set([...names, ...(result.qsa || []).map(item => normalizeIdentity(item.name))].filter(Boolean));
  const processCandidates = (state?.processes || []).flatMap(process => {
    const parties = [process.client, process.opponent, process.opposingParty].filter(Boolean);
    return parties.filter(party => [...relatedNames].some(name => identitySimilarity(name, normalizeIdentity(party)) >= 0.86)).map(party => ({ level: 'C', name: party, reason: `nome presente no processo ${process.number || 'sem número'}; vínculo não criado` }));
  });
  return [...contactCandidates, ...processCandidates].slice(0, 8);
}

function registryCurrentValues(byId) {
  return Object.fromEntries(['name', 'email', 'phone', 'address', 'district', 'city', 'state', 'zip'].map(field => [field, byId(`field-${field}`)?.value || '']));
}

function identitySimilarity(left, right) {
  const leftTokens = new Set(String(left || '').split(' ').filter(token => token.length > 1));
  const rightTokens = new Set(String(right || '').split(' ').filter(token => token.length > 1));
  if (!leftTokens.size || !rightTokens.size) return 0;
  const intersection = [...leftTokens].filter(token => rightTokens.has(token)).length;
  return (2 * intersection) / (leftTokens.size + rightTokens.size);
}

function registryPartnerMatch(contacts, name) {
  const normalized = normalizeIdentity(name);
  return (contacts || []).find(item => normalizeIdentity(item.name) === normalized) || null;
}

function mergeRegistryProvenance(current, result, appliedFields) {
  const previous = Array.isArray(current) ? current : [];
  const source = result?.registry?.source || 'Fonte pública cadastral';
  return [...previous, {
    source, freshness: result?.registry?.freshness || 'live', consultedAt: result?.registry?.consultedAt || new Date().toISOString(),
    appliedAt: new Date().toISOString(), applicationMode: 'human_selected', appliedFields: [...new Set(appliedFields)]
  }].slice(-10);
}
