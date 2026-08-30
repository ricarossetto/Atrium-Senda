const ROLE_LABELS = Object.freeze({
  cliente: 'Cliente',
  testemunha: 'Testemunha',
  perito: 'Perito judicial',
  adverso: 'Adverso',
  correspondente: 'Correspondente',
  preposto: 'Preposto',
  outro: 'Outro'
});

const ROLE_FILTERS = Object.freeze([
  ['all', 'Todos'],
  ['cliente', 'Clientes'],
  ['testemunha', 'Testemunhas'],
  ['perito', 'Peritos'],
  ['adverso', 'Adversos'],
  ['correspondente', 'Correspondentes'],
  ['preposto', 'Prepostos'],
  ['outro', 'Outros']
]);

const ORIGIN_LABELS = Object.freeze({
  indicacao: 'Indicação',
  parceria: 'Parceria profissional',
  balcao: 'Atendimento direto',
  redes_sociais: 'Redes sociais / WhatsApp',
  google_site: 'Google / site',
  convenio: 'Convênio / entidade',
  outro: 'Outra origem'
});

export function renderContactsV2Workspace({
  records,
  allRecords,
  selectedId,
  roleFilter,
  query,
  sort,
  escapeHtml,
  formatDate
}) {
  const selected = records.find(item => String(item.id) === String(selectedId || '')) || null;
  const counts = roleCounts(allRecords);
  const filterButtons = ROLE_FILTERS.map(([value, label]) => {
    const active = roleFilter === value;
    const count = value === 'all' ? allRecords.length : counts[value] || 0;
    return `<button type="button" class="contact-role-filter${active ? ' is-active' : ''}" data-contact-role-filter="${value}" aria-pressed="${active}">
      <span>${label}</span><small>${count}</small>
    </button>`;
  }).join('');

  return `<div class="contacts-v2-shell">
    <nav class="contact-role-filters" aria-label="Filtrar contatos por papel">${filterButtons}</nav>
    <div class="contacts-workspace-layout">
      <section class="contacts-master" aria-labelledby="contactsMasterHeading">
        <header class="contacts-master-header">
          <div><p>Pessoas cadastradas</p><h3 id="contactsMasterHeading">Relacionamentos</h3></div>
          <span aria-live="polite">${records.length} exibido${records.length === 1 ? '' : 's'}</span>
        </header>
        <div class="contacts-sort-controls" role="group" aria-label="Ordenar contatos">
          ${sortButton('name', 'Nome', sort)}
          ${sortButton('registeredAt', 'Cadastro', sort)}
          ${sortButton('city', 'Cidade', sort)}
        </div>
        <div class="contact-record-list" role="list" aria-label="Lista de contatos">
          ${records.length
            ? records.map(item => renderContactRecord({ item, selectedId, escapeHtml, formatDate })).join('')
            : renderEmpty({ hasContacts: allRecords.length > 0, query, roleFilter })}
        </div>
      </section>
      ${renderContactInspector({ item: selected, escapeHtml, formatDate })}
    </div>
  </div>`;
}

export function roleForPresentation(item) {
  const key = String(item?.contactRole || '').trim();
  return {
    key: ROLE_LABELS[key] ? key : (key || 'cliente'),
    label: ROLE_LABELS[key] || (key || 'Cliente')
  };
}

export function originForPresentation(item) {
  const leadOrigin = String(item?.leadOrigin || '').trim();
  if (leadOrigin) return ORIGIN_LABELS[leadOrigin] || leadOrigin;
  return String(item?.origin || '').trim() || 'Direta';
}

function renderContactRecord({ item, selectedId, escapeHtml, formatDate }) {
  const role = roleForPresentation(item);
  const selected = String(item.id) === String(selectedId || '');
  const location = [item.city, item.state].filter(Boolean).join(' / ') || 'Localidade não informada';
  const phone = item.mobile || item.phone || 'Contato não informado';
  const registered = item.registeredAt || item.createdAt;
  const origin = originForPresentation(item);
  return `<button type="button" class="contact-record${selected ? ' is-selected' : ''}" role="listitem" data-contact-id="${escapeHtml(item.id)}" aria-label="Abrir contato ${escapeHtml(item.name || 'sem nome')}, papel ${escapeHtml(role.label)}" aria-current="${selected ? 'true' : 'false'}">
    <span class="contact-role-marker is-${escapeHtml(role.key)}" aria-hidden="true"></span>
    <span class="contact-record-primary">
      <span class="contact-record-role">${escapeHtml(role.label)}</span>
      <strong>${escapeHtml(item.name || 'Contato sem nome')}</strong>
      <small>${escapeHtml(item.profession || 'Pessoa cadastrada')}</small>
    </span>
    <span class="contact-record-channel"><strong>${escapeHtml(phone)}</strong><small>${escapeHtml(item.email || '')}</small></span>
    <span class="contact-record-context"><strong>${escapeHtml(location)}</strong><small>${escapeHtml(origin)}</small></span>
    <span class="contact-record-date"><strong>${formatDate(registered)}</strong><small>${item.document ? `Documento cadastrado` : 'Sem documento informado'}</small></span>
    <span class="contact-record-arrow" aria-hidden="true">›</span>
  </button>`;
}

function renderContactInspector({ item, escapeHtml, formatDate }) {
  if (!item) {
    return `<aside class="contacts-inspector is-empty" id="contactInspector" aria-labelledby="contactInspectorHeading">
      <div class="contact-inspector-empty">
        <span aria-hidden="true">◇</span>
        <h3 id="contactInspectorHeading">Selecione uma pessoa</h3>
        <p>Abra um registro para consultar os dados de relacionamento sem entrar no formulário de edição.</p>
      </div>
    </aside>`;
  }

  const role = roleForPresentation(item);
  const location = [item.city, item.state].filter(Boolean).join(' / ') || 'Localidade não informada';
  const address = [item.address, item.district, item.zip].filter(Boolean).join(' · ');
  return `<aside class="contacts-inspector is-open" id="contactInspector" aria-labelledby="contactInspectorHeading">
    <header class="contact-inspector-header">
      <button type="button" class="contact-inspector-close" data-contact-inspector-close aria-label="Fechar detalhes do contato">×</button>
      <span class="contact-role-label"><span class="contact-role-marker is-${escapeHtml(role.key)}" aria-hidden="true"></span>${escapeHtml(role.label)}</span>
      <h3 id="contactInspectorHeading" tabindex="-1">${escapeHtml(item.name || 'Contato sem nome')}</h3>
      <p>${escapeHtml(item.profession || 'Profissão não informada')}<span aria-hidden="true"> · </span>${escapeHtml(location)}</p>
    </header>
    <div class="contact-inspector-body">
      ${inspectorSection('Contato', [
        definition('Celular', item.mobile, escapeHtml),
        definition('Telefone', item.phone, escapeHtml),
        definition('E-mail', item.email, escapeHtml)
      ])}
      ${inspectorSection('Identificação', [
        definition('CPF / CNPJ', item.document, escapeHtml),
        definition('RG', item.rg, escapeHtml),
        definition('Nascimento', item.birthDate ? formatDate(item.birthDate) : '', escapeHtml),
        definition('Estado civil', item.maritalStatus, escapeHtml)
      ], 'is-sensitive')}
      ${inspectorSection('Endereço', [
        definition('Endereço cadastrado', address, escapeHtml),
        definition('Cidade / UF', location, escapeHtml)
      ], 'is-sensitive')}
      ${inspectorSection('Relacionamento', [
        definition('Origem / captação', originForPresentation(item), escapeHtml),
        definition('Fonte', item.source || (item.externalId ? 'Externa' : 'Interna'), escapeHtml),
        definition('Registrado em', formatDate(item.registeredAt || item.createdAt), escapeHtml)
      ])}
      ${item.notes ? `<section class="contact-inspector-section contact-notes"><h4>Notas</h4><p>${escapeHtml(item.notes)}</p></section>` : ''}
    </div>
    <footer class="contact-inspector-actions">
      <button type="button" class="v2-button is-secondary" data-contact-documents>Gerar documento</button>
      <button type="button" class="v2-button is-primary" data-contact-edit>Editar contato</button>
    </footer>
  </aside>`;
}

function inspectorSection(title, definitions, className = '') {
  const content = definitions.filter(Boolean).join('');
  if (!content) return '';
  return `<section class="contact-inspector-section ${className}"><h4>${title}</h4><dl>${content}</dl></section>`;
}

function definition(label, value, escapeHtml) {
  if (value === null || value === undefined || String(value).trim() === '' || value === '—') return '';
  return `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`;
}

function sortButton(field, label, sort) {
  const active = sort.field === field;
  const direction = active ? sort.direction : 'none';
  const symbol = !active ? '↕' : sort.direction === 'asc' ? '↑' : '↓';
  return `<button type="button" data-contact-sort-field="${field}" aria-pressed="${active}" aria-label="Ordenar por ${label}, direção ${direction}">${label}<span aria-hidden="true">${symbol}</span></button>`;
}

function renderEmpty({ hasContacts, query, roleFilter }) {
  const filtered = hasContacts && (Boolean(query) || roleFilter !== 'all');
  return `<div class="contact-empty-state">
    <span aria-hidden="true">◇</span>
    <strong>${filtered ? 'Nenhum contato encontrado.' : 'Nenhum contato cadastrado.'}</strong>
    <p>${filtered ? 'Revise a busca ou selecione outro papel.' : 'Cadastre a primeira pessoa para iniciar a base de relacionamentos.'}</p>
    ${filtered ? '' : '<button type="button" class="v2-button is-primary" data-contact-create>Novo contato</button>'}
  </div>`;
}

function roleCounts(records) {
  return records.reduce((counts, item) => {
    const role = String(item.contactRole || '').trim();
    if (ROLE_LABELS[role]) counts[role] = (counts[role] || 0) + 1;
    return counts;
  }, {});
}
