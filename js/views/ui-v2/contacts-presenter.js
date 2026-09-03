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
  selectedContext,
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
      ${renderContactInspector({ item: selected, context: selectedContext, escapeHtml, formatDate })}
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

function renderContactInspector({ item, context, escapeHtml, formatDate }) {
  if (!item) {
    return `<aside class="contacts-inspector is-empty" id="contactInspector" aria-labelledby="contactInspectorHeading">
      <div class="contact-inspector-empty">
        <span aria-hidden="true">${iconSvg('contacts')}</span>
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
      <button type="button" class="contact-inspector-close" data-contact-inspector-close aria-label="Fechar detalhes do contato">${iconSvg('close')}</button>
      <span class="contact-role-label"><span class="contact-role-marker is-${escapeHtml(role.key)}" aria-hidden="true"></span>${escapeHtml(role.label)}</span>
      <h3 id="contactInspectorHeading" tabindex="-1">${escapeHtml(item.name || 'Contato sem nome')}</h3>
      <p>${escapeHtml(item.profession || 'Profissão não informada')}<span aria-hidden="true"> · </span>${escapeHtml(location)}</p>
    </header>
    <div class="contact-inspector-body">
      ${renderLegalContextSummary({ item, context, escapeHtml, formatDate })}
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
      ${renderClientFinancialSummary({ context, escapeHtml })}
      ${renderRelatedProcesses({ context, escapeHtml })}
      ${renderUpcomingWork({ context, escapeHtml, formatDate })}
      ${renderRelatedDocuments({ context, escapeHtml, formatDate })}
      ${renderClientTimeline({ context, escapeHtml, formatDate })}
    </div>
    <footer class="contact-inspector-actions">
      <button type="button" class="v2-button is-secondary" data-contact-assistant>Usar no Assistente</button>
      <button type="button" class="v2-button is-secondary" data-contact-documents>${iconSvg('documents')}Gerar documento</button>
      <button type="button" class="v2-button is-secondary" data-contact-archive>${iconSvg('documents')}Ver acervo</button>
      <button type="button" class="v2-button is-primary" data-contact-edit>${iconSvg('edit')}Editar contato</button>
    </footer>
  </aside>`;
}

function renderLegalContextSummary({ item, context, escapeHtml, formatDate }) {
  const metrics = context?.metrics;
  if (!metrics) return '';
  const role = roleForPresentation(item);
  const integrity = role.key === 'cliente'
    ? 'Somente vínculos canônicos ou relações processuais registradas são exibidos.'
    : `Papel preservado como ${role.label.toLowerCase()}; este contato não é tratado como cliente.`;
  return `<section class="contact-legal-summary" aria-labelledby="contactLegalSummaryHeading">
    <div class="contact-context-heading"><div><p>Visão 360</p><h4 id="contactLegalSummaryHeading">Contexto jurídico</h4></div>${context.nextDeadline ? `<span>Próximo prazo ${escapeHtml(formatDate(context.nextDeadline))}</span>` : ''}</div>
    <div class="contact-context-metrics">
      ${contextMetric(metrics.processes, 'Processos')}
      ${contextMetric(metrics.openTasks, 'Providências')}
      ${contextMetric(metrics.publications, 'Publicações')}
      ${contextMetric(metrics.documents, 'Documentos')}
      ${contextMetric(metrics.appointments, 'Agenda')}
      ${contextMetric(metrics.financial, 'Financeiro')}
    </div>
    <p class="contact-context-integrity">${escapeHtml(integrity)}</p>
  </section>`;
}

function contextMetric(value, label) {
  return `<div><strong>${Number(value) || 0}</strong><span>${label}</span></div>`;
}

function renderClientFinancialSummary({ context, escapeHtml }) {
  const summary = context?.financialSummary;
  if (!summary || !context?.financialProcesses?.length) return '';
  return `<section class="contact-inspector-section contact-financial-summary"><h4>Visão financeira do cliente</h4>
    <dl>
      ${definition('Honorários contratados / parcelados', formatMoney(summary.contracted), escapeHtml)}
      ${definition('Recebido', formatMoney(summary.received), escapeHtml)}
      ${definition('Pendente', formatMoney(summary.pending), escapeHtml)}
      ${definition('Despesas processuais', formatMoney(summary.expenses), escapeHtml)}
    </dl>
    <p>${Number(summary.installments) || 0} parcela${summary.installments === 1 ? '' : 's'} · ${Number(summary.receipts) || 0} recebimento${summary.receipts === 1 ? '' : 's'} registrado${summary.receipts === 1 ? '' : 's'}. Valores informativos, sem escrituração fiscal.</p>
  </section>`;
}

function formatMoney(value) {
  const number = Number(value);
  return `R$ ${(Number.isFinite(number) ? number : 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function renderRelatedProcesses({ context, escapeHtml }) {
  if (!context?.processes?.length) return `<section class="contact-inspector-section contact-context-section"><h4>Processos relacionados</h4><p class="contact-context-empty">Nenhum processo explicitamente vinculado a este contato.</p></section>`;
  return `<section class="contact-inspector-section contact-context-section"><h4>Processos relacionados</h4><div class="contact-context-list">${context.processes.map(process => {
    const number = process.number || process.protocol || 'Processo sem número';
    const relationship = process.contextRelationship === 'canonical-client' ? 'Cliente canônico' : 'Relação registrada';
    const financial = context.financialProcesses.some(item => String(item.id) === String(process.id));
    return `<button type="button" data-contact-process="${escapeHtml(process.id)}" aria-label="Abrir processo ${escapeHtml(number)}"><span><strong>${escapeHtml(number)}</strong><small>${escapeHtml(process.actionType || process.subject || process.court || 'Classe não informada')}</small></span><span class="contact-context-link-meta">${escapeHtml(relationship)}${financial ? ' · Financeiro' : ''}<b aria-hidden="true">→</b></span></button>`;
  }).join('')}</div></section>`;
}

function renderUpcomingWork({ context, escapeHtml, formatDate }) {
  const terminal = ['concluida', 'concluido', 'arquivada', 'arquivado', 'finalizada', 'cancelada'];
  const tasks = [...(context?.tasks || [])]
    .filter(task => !terminal.includes(String(task.status || '').toLowerCase()))
    .sort((left, right) => String(left.fatalDeadline || left.deadline || '9999').localeCompare(String(right.fatalDeadline || right.deadline || '9999')))
    .slice(0, 5);
  const appointments = [...(context?.appointments || [])].sort((left, right) => String(left.date || '').localeCompare(String(right.date || ''))).slice(0, 3);
  if (!tasks.length && !appointments.length) return '';
  const items = [
    ...tasks.map(task => `<button type="button" data-contact-task="${escapeHtml(task.id)}" aria-label="Abrir tarefa ${escapeHtml(task.title || 'sem título')}"><span><strong>${escapeHtml(task.title || 'Tarefa sem título')}</strong><small>${escapeHtml(task.status || 'Status não informado')}</small></span><span class="contact-context-link-meta">${task.fatalDeadline || task.deadline ? escapeHtml(formatDate(task.fatalDeadline || task.deadline)) : 'Sem prazo'}<b aria-hidden="true">→</b></span></button>`),
    ...appointments.map(item => `<button type="button" data-contact-agenda="${escapeHtml(item.id)}" aria-label="Abrir compromisso ${escapeHtml(item.title || 'sem título')}"><span><strong>${escapeHtml(item.title || 'Compromisso sem título')}</strong><small>Agenda${item.time ? ` · ${escapeHtml(item.time)}` : ''}</small></span><span class="contact-context-link-meta">${escapeHtml(formatDate(item.date))}<b aria-hidden="true">→</b></span></button>`)
  ];
  return `<section class="contact-inspector-section contact-context-section"><h4>Próximas providências</h4><div class="contact-context-list">${items.join('')}</div></section>`;
}

function renderRelatedDocuments({ context, escapeHtml, formatDate }) {
  const documents = [...(context?.documents || [])].sort((left, right) => String(right.createdAt || right.updatedAt || '').localeCompare(String(left.createdAt || left.updatedAt || ''))).slice(0, 5);
  if (!documents.length) return '';
  return `<section class="contact-inspector-section contact-context-section"><h4>Acervo relacionado</h4><div class="contact-context-list">${documents.map(document => `<button type="button" data-contact-document="${escapeHtml(document.id)}" aria-label="Abrir documento ${escapeHtml(document.name || document.fileName || document.title || 'sem nome')}"><span><strong>${escapeHtml(document.name || document.fileName || document.title || 'Documento sem nome')}</strong><small>${escapeHtml(document.documentType || document.type || 'Documento')}</small></span><span class="contact-context-link-meta">${escapeHtml(formatDate(document.createdAt || document.updatedAt))}<b aria-hidden="true">→</b></span></button>`).join('')}</div></section>`;
}

function renderClientTimeline({ context, escapeHtml, formatDate }) {
  const events = (context?.timeline || []).slice(0, 12);
  if (!events.length) return '';
  const labels = { publication: 'Publicação', movement: 'Movimentação', deadline: 'Prazo', appointment: 'Agenda', task: 'Tarefa', document: 'Documento', financial: 'Financeiro', audit: 'Auditoria', process: 'Processo' };
  return `<section class="contact-inspector-section contact-context-section"><h4>Linha do tempo consolidada</h4><ol class="contact-context-timeline">${events.map(event => {
    const content = `<span class="contact-timeline-marker is-${escapeHtml(event.type)}" aria-hidden="true"></span><span><small>${escapeHtml(formatDate(event.date))} · ${escapeHtml(labels[event.type] || 'Registro')} · ${escapeHtml(event.processNumber || 'Sem processo')}</small><strong>${escapeHtml(event.title)}</strong>${event.detail ? `<em>${escapeHtml(event.detail)}</em>` : ''}</span>`;
    return `<li>${event.target ? `<button type="button" data-contact-context-event="${escapeHtml(event.contextId)}" aria-label="Abrir ${escapeHtml(labels[event.type] || 'registro')}: ${escapeHtml(event.title)}">${content}<b aria-hidden="true">→</b></button>` : `<div>${content}</div>`}</li>`;
  }).join('')}</ol></section>`;
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
    <span aria-hidden="true">${iconSvg('contacts')}</span>
    <strong>${filtered ? 'Nenhum contato encontrado.' : 'Nenhum contato cadastrado.'}</strong>
    <p>${filtered ? 'Revise a busca ou selecione outro papel.' : 'Cadastre a primeira pessoa para iniciar a base de relacionamentos.'}</p>
    ${filtered ? '' : `<button type="button" class="v2-button is-primary" data-contact-create>${iconSvg('add')}Novo contato</button>`}
  </div>`;
}

function roleCounts(records) {
  return records.reduce((counts, item) => {
    const role = String(item.contactRole || '').trim();
    if (ROLE_LABELS[role]) counts[role] = (counts[role] || 0) + 1;
    return counts;
  }, {});
}
import { iconSvg } from './icons.js';
