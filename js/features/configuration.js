const CONFIGURATION_SECTIONS = [
  ['taskDefinitions', 'Tarefas'],
  ['users', 'Usuários'],
  ['actionGroups', 'Grupos'],
  ['actionTypes', 'Tipos de ação'],
  ['stages', 'Etapas'],
  ['origins', 'Origens'],
  ['goals', 'Metas'],
  ['inboxSections', 'Caixa de entrada'],
  ['notificationAssignments', 'Notificações'],
  ['integrations', 'Integrações'],
  ['diagnostic', 'Diagnóstico & Saúde'],
  ['backups', 'Backups & Restauração']
];

const FIELDS_BY_SECTION = {
  taskDefinitions: [{name:'name',label:'Nome da tarefa',required:true,full:true},{name:'points',label:'Pontuação',type:'number'},{name:'phase',label:'Fase'}],
  users: [{name:'name',label:'Nome do usuário',required:true,full:true},{name:'role',label:'Função'},{name:'pointsGoal',label:'Meta de pontos'}],
  actionGroups: [{name:'name',label:'Grupo de ação',required:true,full:true},{name:'publicationResponsible',label:'Responsável pelas publicações',full:true}],
  actionTypes: [{name:'name',label:'Tipo de ação',required:true,full:true},{name:'group',label:'Grupo'}],
  stages: [{name:'name',label:'Etapa',required:true,full:true},{name:'classification',label:'Classificação'},{name:'phase',label:'Fase'}],
  origins: [{name:'name',label:'Origem',required:true,full:true}],
  goals: [{name:'group',label:'Grupo',required:true,full:true},{name:'monthlyClosings',label:'Meta mensal de fechamentos',type:'number'}],
  inboxSections: [{name:'value',label:'Nome da seção',required:true,full:true}],
  notificationAssignments: [{name:'event',label:'Evento',required:true,full:true},{name:'responsibles',label:'Responsáveis',full:true,placeholder:'Separe os nomes por vírgula'}],
  integrations: [{name:'name',label:'Integração',required:true,full:true},{name:'status',label:'Status'},{name:'method',label:'Método'}]
};

export function createConfigurationFeature({
  store,
  documentRef = globalThis.document,
  secureFetch,
  escapeHtml = value => String(value ?? ''),
  normalizeText = value => String(value ?? '').toLowerCase(),
  openModal = () => {},
  showToast = () => {},
  onRenderDiagnostic = () => {},
  onRenderBackups = () => {},
  presentation = null,
  warn = () => {}
} = {}) {
  let configurationSection = 'taskDefinitions';
  let authUsers = [];
  let currentAuthRole = 'collaborator';
  let initialized = false;
  const byId = id => documentRef.getElementById(id);

  const feature = {
    get section() { return configurationSection; },
    set section(value) { configurationSection = value || 'taskDefinitions'; },
    get users() { return authUsers; },
    set users(value) { authUsers = Array.isArray(value) ? value : []; },
    get role() { return currentAuthRole; },
    set role(value) { currentAuthRole = value || 'collaborator'; },
    get initialized() { return initialized; },

    init() {
      if (initialized) return false;
      initialized = true;
      byId('configurationSearch')?.addEventListener('input', () => feature.render(byId('configurationSearch')?.value || ''));
      byId('configurationTabs')?.addEventListener('click', event => {
        const button = event.target.closest('button[data-config-section]');
        if (!button) return;
        configurationSection = button.dataset.configSection;
        if (byId('configurationSearch')) byId('configurationSearch').value = '';
        if (configurationSection === 'users') feature.loadAuthUsers().then(() => feature.render());
        else feature.render();
      });
      byId('newConfigurationButton')?.addEventListener('click', () => feature.openModal());
      byId('configurationList')?.addEventListener('click', event => {
        const deleteButton = event.target.closest('[data-delete-config]');
        if (deleteButton) {
          event.preventDefault();
          event.stopPropagation();
          feature.deleteRecord(Number(deleteButton.dataset.deleteConfig));
          return;
        }
        const authStatusButton = event.target.closest('[data-auth-user-status]');
        if (authStatusButton) {
          event.preventDefault();
          event.stopPropagation();
          const row = authStatusButton.closest('[data-auth-user-id]');
          if (row) feature.manageAuthUser(row.dataset.authUserId, authStatusButton.dataset.authUserStatus);
          return;
        }
        const row = event.target.closest('[data-config-index]');
        if (!row) return;
        const index = Number(row.dataset.configIndex);
        const records = Array.isArray(store.state.configuration?.[configurationSection]) ? store.state.configuration[configurationSection] : [];
        if (records[index] !== undefined) feature.openModal(records[index], index);
      });
      presentation?.init?.();
      return true;
    },

    async loadAuthUsers() {
      try {
        const response = await secureFetch('/api/auth/users', { headers: { Accept: 'application/json' } });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.message || 'Não foi possível carregar os usuários de acesso.');
        authUsers = Array.isArray(payload.users) ? payload.users : [];
        currentAuthRole = payload.currentRole || 'collaborator';
        return authUsers;
      } catch (error) {
        authUsers = [];
        currentAuthRole = 'collaborator';
        warn('Falha ao carregar usuários de autenticação.');
        return [];
      }
    },

    async manageAuthUser(userId, status) {
      try {
        const response = await secureFetch('/api/auth/users/manage', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ userId, status })
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.message || 'Não foi possível atualizar o usuário.');
        await feature.loadAuthUsers();
        feature.render();
        showToast('Acesso do usuário atualizado.', 'success');
        return true;
      } catch (error) {
        showToast(error.message, 'error');
        return false;
      }
    },

    authUserRow(user) {
      const labels = { active: 'Ativo', inactive: 'Suspenso', pending_approval: 'Aguardando aprovação' };
      const canManage = currentAuthRole === 'master_admin' && user.role !== 'master_admin';
      const nextStatus = user.status === 'active' ? 'inactive' : 'active';
      const actionLabel = user.status === 'pending_approval' ? 'Aprovar' : user.status === 'active' ? 'Suspender' : 'Reativar';
      if (documentRef.documentElement?.dataset?.ui === 'v2') {
        const roleLabel = user.role === 'master_admin' ? 'Administrador mestre' : 'Colaborador';
        const statusLabel = labels[user.status] || user.status || 'Ativo';
        return `<article class="configuration-row configuration-user-row" role="listitem" data-auth-user-id="${escapeHtml(user.id)}" data-auth-user-state="${escapeHtml(user.status || 'active')}">
          <div class="config-row-info"><strong>${escapeHtml(user.displayName || user.username)}</strong><span>${escapeHtml(user.email || user.username)}</span><small>${escapeHtml(roleLabel)}</small></div>
          <span class="configuration-user-status status-${escapeHtml(user.status || 'active')}">${escapeHtml(statusLabel)}</span>
          <div class="configuration-row-actions">${canManage ? `<button type="button" class="button ghost" data-auth-user-status="${nextStatus}" aria-label="${actionLabel} acesso de ${escapeHtml(user.displayName || user.username)}">${actionLabel}</button>` : '<span class="configuration-protected-access">Acesso protegido</span>'}</div>
        </article>`;
      }
      return `<div class="configuration-row" data-auth-user-id="${escapeHtml(user.id)}">
        <div class="config-row-info"><strong>${escapeHtml(user.displayName || user.username)}</strong><span>${escapeHtml(user.email || user.username)} · ${user.role === 'master_admin' ? 'Administrador' : 'Colaborador'}</span><small>${escapeHtml(labels[user.status] || user.status || 'Ativo')}</small></div>
        ${canManage ? `<button type="button" class="button ghost" data-auth-user-status="${nextStatus}">${actionLabel}</button>` : ''}
      </div>`;
    },

    render(query = '') {
      const config = store.state.configuration || {};
      const tabs = byId('configurationTabs');
      if (tabs) tabs.innerHTML = CONFIGURATION_SECTIONS.map(([key, label]) => `<button type="button" class="${configurationSection === key ? 'active' : ''}" data-config-section="${key}">${label}</button>`).join('');
      const metrics = byId('configurationMetrics');
      if (metrics) {
        metrics.innerHTML = [
          ['Definições de tarefa', config.taskDefinitions?.length || 0],
          ['Tipos de ação', config.actionTypes?.length || 0],
          ['Etapas', config.stages?.length || 0],
          ['Usuários de acesso', authUsers.length],
          ['Contatos importados', store.state.contacts.length]
        ].map(([label, count]) => `<div class="configuration-metric"><strong>${count}</strong><span>${label}</span></div>`).join('');
      }
      const label = CONFIGURATION_SECTIONS.find(([key]) => key === configurationSection)?.[1] || 'Configuração';
      const isAuthUsers = configurationSection === 'users';
      const isSpecialSection = configurationSection === 'diagnostic' || configurationSection === 'backups';
      byId('newConfigurationButton')?.classList.toggle('hidden', isAuthUsers || isSpecialSection);
      byId('configurationSearch')?.closest('.table-search')?.classList.toggle('hidden', isSpecialSection);

      if (configurationSection === 'diagnostic') {
        if (byId('configurationHeading')) byId('configurationHeading').textContent = 'Diagnóstico & Saúde do Sistema';
        if (byId('configurationCount')) byId('configurationCount').textContent = 'Atrium v2.0';
        onRenderDiagnostic();
        presentation?.sync?.({ section: configurationSection, special: true });
        return;
      }
      if (configurationSection === 'backups') {
        if (byId('configurationHeading')) byId('configurationHeading').textContent = 'Cópias de Segurança & Restauração';
        if (byId('configurationCount')) byId('configurationCount').textContent = 'Zero Trust';
        onRenderBackups();
        presentation?.sync?.({ section: configurationSection, special: true });
        return;
      }

      const raw = isAuthUsers ? authUsers : (Array.isArray(config[configurationSection]) ? config[configurationSection] : []);
      const needle = normalizeText(query);
      const records = raw.map((item, index) => ({ item, index })).filter(({ item }) => !needle || normalizeText(typeof item === 'string' ? item : Object.values(item || {}).flat().join(' ')).includes(needle));
      if (byId('configurationHeading')) byId('configurationHeading').textContent = label;
      if (byId('configurationCount')) byId('configurationCount').textContent = `${records.length} itens`;
      const list = byId('configurationList');
      if (list) list.innerHTML = records.length ? records.map(({ item, index }) => isAuthUsers ? feature.authUserRow(item) : feature.row(item, index)).join('') : '<div class="empty-detail"><span>✓</span><h3>Nenhum item</h3><p>Não há registros nesta seção ou neste filtro.</p></div>';
      presentation?.sync?.({ section: configurationSection, authUsers: isAuthUsers });
    },

    row(item, index) {
      const v2 = documentRef.documentElement?.dataset?.ui === 'v2';
      if (typeof item === 'string') {
        if (v2) return `
          <article class="configuration-row" role="listitem" data-config-index="${index}">
            <button type="button" class="config-row-open" aria-label="Editar ${escapeHtml(item)}">
              <span class="config-row-info"><strong>${escapeHtml(item)}</strong><span>Seção da caixa de entrada</span><small>Ativa</small></span>
              <span class="configuration-edit-affordance" aria-hidden="true">Editar →</span>
            </button>
            <button type="button" class="btn-delete-config-row" data-delete-config="${index}" aria-label="Excluir ${escapeHtml(item)}">Excluir</button>
          </article>`;
        return `
          <div class="configuration-row" data-config-index="${index}">
            <div class="config-row-info">
              <strong>${escapeHtml(item)}</strong>
              <span>Seção da caixa de entrada</span>
              <small>Ativa · clique para editar</small>
            </div>
            <button type="button" class="btn-delete-config-row" data-delete-config="${index}" title="Excluir este item">×</button>
          </div>`;
      }
      if (!item || typeof item !== 'object') return '';
      const primary = item.name || item.event || item.group || 'Configuração';
      const secondary = item.role || item.phase || item.group || item.publicationResponsible || item.method || (item.responsibles || []).join(', ') || item.status || '—';
      const meta = Number.isFinite(item.points) ? `<span class="config-points">${item.points} pontos</span>` : item.monthlyClosings == null && 'monthlyClosings' in item ? '<small>Meta não definida</small>' : `<small>${escapeHtml(item.registeredAt || item.status || 'Ativo')}</small>`;
      if (v2) return `
        <article class="configuration-row" role="listitem" data-config-index="${index}">
          <button type="button" class="config-row-open" aria-label="Editar ${escapeHtml(primary)}">
            <span class="config-row-info"><strong>${escapeHtml(primary)}</strong><span>${escapeHtml(secondary)}</span>${meta}</span>
            <span class="configuration-edit-affordance" aria-hidden="true">Editar →</span>
          </button>
          <button type="button" class="btn-delete-config-row" data-delete-config="${index}" aria-label="Excluir ${escapeHtml(primary)}">Excluir</button>
        </article>`;
      return `
        <div class="configuration-row" data-config-index="${index}">
          <div class="config-row-info">
            <strong>${escapeHtml(primary)}</strong>
            <span>${escapeHtml(secondary)}</span>
            ${meta}
          </div>
          <button type="button" class="btn-delete-config-row" data-delete-config="${index}" title="Excluir este item">×</button>
        </div>`;
    },

    openModal(defaults = {}, index = null) {
      const fields = FIELDS_BY_SECTION[configurationSection] || [{ name: 'name', label: 'Nome', required: true, full: true }];
      const values = typeof defaults === 'string' ? { value: defaults } : { ...defaults };
      if (Array.isArray(values.responsibles)) values.responsibles = values.responsibles.join(', ');
      openModal('configuration', index === null ? 'Novo item de configuração' : 'Editar configuração', 'Estrutura do escritório', fields, { ...values, _section: configurationSection, _index: index });
    },

    saveRecord(data, defaults = {}) {
      const section = defaults._section;
      const index = defaults._index;
      const list = store.state.configuration[section];
      let record = { ...defaults, ...data };
      delete record._section;
      delete record._index;
      if (section === 'inboxSections') record = data.value;
      if (section === 'notificationAssignments') record.responsibles = String(data.responsibles || '').split(/[,;]/).map(item => item.trim()).filter(Boolean);
      if (section === 'taskDefinitions') record.points = Number(data.points) || 0;
      if (section === 'goals') record.monthlyClosings = data.monthlyClosings === '' ? null : Number(data.monthlyClosings);
      const creating = index === null || index === undefined || index === '';
      if (creating) list.push(record);
      else list[Number(index)] = record;
      store.save();
      store.audit(creating ? 'Configuração adicionada' : 'Configuração atualizada', `${section} · ${typeof record === 'string' ? record : record.name || record.event || record.group || 'item'}`);
      return record;
    },

    async deleteRecord(index) {
      const section = configurationSection;
      const list = store.state.configuration?.[section];
      if (!Array.isArray(list) || index < 0 || index >= list.length) return false;
      const snapshot = [...list];
      const removed = list.splice(index, 1)[0];
      store.audit('Configuração removida', `${section} · ${typeof removed === 'string' ? removed : (removed?.name || 'item')}`);
      store.save();
      try {
        if (!await store.flush()) throw new Error('Não foi possível persistir a exclusão. Tente novamente.');
        feature.render();
        showToast('Item removido com sucesso.', 'success');
        return true;
      } catch (error) {
        store.state.configuration[section] = snapshot;
        feature.render();
        showToast(error.message || 'Não foi possível excluir o item.', 'error');
        return false;
      }
    }
  };

  return feature;
}
