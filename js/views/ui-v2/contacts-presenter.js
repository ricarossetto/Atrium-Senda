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
  pagination,
  escapeHtml,
  formatDate
}) {
  const selected = (records || []).find(item => String(item.id) === String(selectedId || ''))
    || (allRecords || []).find(item => String(item.id) === String(selectedId || '')) || null;
  const page = pagination || { page: 1, pageSize: (records || []).length || 100, total: (records || []).length, totalPages: 1 };
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
      ${selected ? '<div class="contact-inspector-backdrop" data-contact-backdrop></div>' : ''}
      ${renderContactInspector({ item: selected, context: selectedContext, escapeHtml, formatDate })}
    </div>
    ${renderContactsPagination({ pagination: page, escapeHtml })}
  </div>`;
}

export function renderContactsPagination({ pagination, escapeHtml }) {
  const page = Math.max(1, Number(pagination?.page) || 1);
  const pageSize = Number(pagination?.pageSize) || 100;
  const total = Math.max(0, Number(pagination?.total) || 0);
  const totalPages = Math.max(1, Number(pagination?.totalPages) || 1);
  const totalLabel = total.toLocaleString('pt-BR');
  const firstDisabled = page <= 1 ? ' disabled' : '';
  const lastDisabled = page >= totalPages ? ' disabled' : '';
  const sizes = [25, 100, 500, 1000];
  return `<nav class="contact-pagination" aria-label="Paginação de contatos">`
    + `<p class="contact-pagination-status" aria-live="polite">Página ${page} de ${totalPages} · ${escapeHtml(totalLabel)} no filtro</p>`
    + `<div class="contact-pagination-nav" role="group" aria-label="Navegar páginas">`
    + `<button type="button" class="v2-button is-secondary contact-pagination-button" data-contact-page="first"${firstDisabled} aria-label="Primeira página">Primeira</button>`
    + `<button type="button" class="v2-button is-secondary contact-pagination-button" data-contact-page="prev"${firstDisabled} aria-label="Página anterior">Anterior</button>`
    + `<button type="button" class="v2-button is-secondary contact-pagination-button" data-contact-page="next"${lastDisabled} aria-label="Próxima página">Próxima</button>`
    + `<button type="button" class="v2-button is-secondary contact-pagination-button" data-contact-page="last"${lastDisabled} aria-label="Última página">Última</button>`
    + `</div>`
    + `<div class="contact-page-size" role="group" aria-label="Contatos por página"><span>Por página</span>`
    + sizes.map(size => `<button type="button" class="contact-page-size-option${size === pageSize ? ' is-active' : ''}" data-contact-page-size="${size}" aria-pressed="${size === pageSize}">${size}</button>`).join('')
    + `</div></nav>`;
}

export function roleForPresentation(item) {
  const key = String(item?.contactRole || '').trim();
  if (!key) return { key: 'sem_papel', label: 'Sem papel' };
  return {
    key,
    label: ROLE_LABELS[key] || key
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
  const location = [item.city, item.state].filter(Boolean).join(' / ') || '—';
  const phone = item.mobile || item.phone || '—';
  const registered = item.registeredAt || item.createdAt;
  const origin = originForPresentation(item);
  const primarySubtitle = item.profession || item.companyProfile?.tradeName || item.companyProfile?.primaryActivity || '';
  const companyAlert = isInactiveCompanyStatus(item.companyProfile?.status)
    ? `<span class="contact-company-alert">${escapeHtml(item.companyProfile.status)}</span>` : '';
  return `<button type="button" class="contact-record${selected ? ' is-selected' : ''}" role="listitem" data-contact-id="${escapeHtml(item.id)}" aria-label="Abrir contato ${escapeHtml(item.name || 'sem nome')}, papel ${escapeHtml(role.label)}" aria-current="${selected ? 'true' : 'false'}">
    <span class="contact-role-marker is-${escapeHtml(role.key)}" aria-hidden="true"></span>
    <span class="contact-record-primary">
      <span class="contact-record-role">${escapeHtml(role.label)}${companyAlert}</span>
      <strong>${escapeHtml(item.name || 'Contato sem nome')}</strong>
      ${primarySubtitle ? `<small>${escapeHtml(primarySubtitle)}</small>` : ''}
    </span>
    <span class="contact-record-channel"><strong>${escapeHtml(phone)}</strong><small>${escapeHtml(item.email || '')}</small></span>
    <span class="contact-record-context"><strong>${escapeHtml(location)}</strong><small>${escapeHtml(origin)}</small></span>
    <span class="contact-record-date"><strong>${escapeHtml(formatDate(registered))}</strong>${item.document ? '<small>Documento cadastrado</small>' : ''}</span>
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
  return `<aside class="contacts-inspector is-open" id="contactInspector" data-panel-size-anchor="fixed" aria-labelledby="contactInspectorHeading">
    <header class="contact-inspector-header">
      <button type="button" class="contact-inspector-close" data-contact-inspector-close aria-label="Fechar detalhes do contato">${iconSvg('close')}</button>
      <button type="button" class="contact-inspector-size" data-panel-size-toggle aria-pressed="false" aria-label="Maximizar painel" title="Maximizar painel">${iconSvg('maximize')}</button>
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
        definition('Estado civil', item.maritalStatus, escapeHtml),
        definition('Sexo', item.gender ?? item.eprocPerson?.gender, escapeHtml),
        definition('Nacionalidade', item.nationality ?? item.eprocPerson?.nationality, escapeHtml),
        definition('Naturalidade', item.birthPlace ?? item.eprocPerson?.birthPlace, escapeHtml),
        definition('Nome da mãe', item.motherName ?? item.eprocPerson?.motherName, escapeHtml),
        definition('Nome do pai', item.fatherName ?? item.eprocPerson?.fatherName, escapeHtml)
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
      ${renderContactEprocSection({ item, escapeHtml, formatDate })}
      ${renderContactCompanySection({ item, escapeHtml, formatDate })}
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

function formatEprocDateValue(value, formatDate) {
  const text = String(value ?? '').trim();
  if (!text) return '';
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) {
    const formatted = formatDate(text);
    return formatted && formatted !== '—' ? formatted : text;
  }
  return text;
}

export function renderContactEprocSection({ item, escapeHtml, formatDate }) {
  const ep = item?.eprocPerson;
  if (!ep || typeof ep !== 'object') return '';

  const personTypeLabel = ep.personType === 'PJ'
    ? 'Pessoa Jurídica (PJ)'
    : ep.personType === 'PF'
      ? 'Pessoa Física (PF)'
      : String(ep.personType || '').trim();
  const syncedLabel = formatEprocDateValue(ep.syncedAt, formatDate);
  const metaDefinitions = [
    definition('Tipo de pessoa', personTypeLabel, escapeHtml),
    definition('Portal eproc', ep.portalHost, escapeHtml),
    definition('Sincronizado em', syncedLabel, escapeHtml)
  ].filter(Boolean).join('');

  const addresses = Array.isArray(ep.addressHistory) ? ep.addressHistory.filter(Boolean) : [];
  const addressBlock = addresses.length
    ? `<div class="contact-eproc-subsection">
        <h5>Histórico de endereços</h5>
        <ul class="contact-eproc-address-list">
          ${addresses.map(addr => {
            const addressText = addr.raw || [addr.street, addr.district, addr.zip, addr.city, addr.state].filter(Boolean).join(' · ') || 'Endereço sem descrição';
            const hasStreet = typeof addr.hasStreet === 'boolean'
              ? addr.hasStreet
              : Boolean(addr.street && /[A-Za-zÀ-ÿ0-9]{2,}/.test(String(addr.street)));
            const includedLabel = addr.includedAtRaw || formatEprocDateValue(addr.includedAt, formatDate);
            const badgeClass = hasStreet ? 'is-complete' : 'is-incomplete';
            const badgeText = hasStreet ? 'Endereço completo' : 'Sem logradouro';
            return `<li class="contact-eproc-address-item">
              <div class="contact-eproc-address-head">
                ${addr.type ? `<span class="contact-eproc-address-type">${escapeHtml(addr.type)}</span>` : ''}
                <span class="contact-eproc-badge ${badgeClass}">${badgeText}</span>
              </div>
              <p class="contact-eproc-address-text">${escapeHtml(addressText)}</p>
              ${includedLabel ? `<small class="contact-eproc-address-date">Incluído em ${escapeHtml(includedLabel)}</small>` : ''}
            </li>`;
          }).join('')}
        </ul>
      </div>`
    : '';

  const names = Array.isArray(ep.nameHistory) ? ep.nameHistory.filter(Boolean) : [];
  const nameBlock = names.length
    ? `<div class="contact-eproc-subsection">
        <h5>Histórico de nomes</h5>
        <ul class="contact-eproc-name-list">
          ${names.map(entry => {
            const label = typeof entry === 'string' ? entry : (entry.name || '');
            if (!String(label).trim()) return '';
            const included = typeof entry === 'object' ? (entry.includedAtRaw || formatEprocDateValue(entry.includedAt, formatDate)) : '';
            return `<li><strong>${escapeHtml(label)}</strong>${included ? `<span>Incluído em ${escapeHtml(included)}</span>` : ''}</li>`;
          }).filter(Boolean).join('')}
        </ul>
      </div>`
    : '';

  if (!metaDefinitions && !addressBlock && !nameBlock) return '';

  return `<section class="contact-inspector-section contact-eproc-section" aria-labelledby="contactEprocHeading">
    <h4 id="contactEprocHeading">Dados judiciais (eproc)</h4>
    ${metaDefinitions ? `<dl>${metaDefinitions}</dl>` : ''}
    ${addressBlock}
    ${nameBlock}
  </section>`;
}

function isCnpjDocument(value) {
  return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '').length === 14;
}

function isInactiveCompanyStatus(status) {
  const cleanStatus = String(status || '').trim();
  return Boolean(cleanStatus && !/^ativa$/i.test(cleanStatus));
}

export function renderContactCompanySection({ item, escapeHtml, formatDate }) {
  const company = item?.companyProfile && typeof item.companyProfile === 'object' ? item.companyProfile : null;
  const hasCnpj = isCnpjDocument(item?.document);
  if (!company && !hasCnpj) return '';
  if (!company) {
    return `<section class="contact-inspector-section contact-company-section" aria-labelledby="contactCompanyHeading">
      <div class="contact-company-header">
        <h4 id="contactCompanyHeading">Perfil empresarial (CNPJ)</h4>
        <button type="button" class="v2-button is-secondary contact-company-refresh" data-contact-registry-refresh>Consultar CNPJ</button>
      </div>
      <p class="contact-company-placeholder">CNPJ cadastrado sem enriquecimento empresarial. Consulte na CNPJá Open para trazer situação cadastral, CNAE, Simples Nacional e quadro societário.</p>
    </section>`;
  }

  const inactive = isInactiveCompanyStatus(company.status);
  const badgeClass = inactive ? 'is-inactive' : 'is-active';
  const badgeLabel = [company.status, company.establishmentType].filter(Boolean).join(' · ') || 'CNPJ consultado';
  const capitalFormatted = Number.isFinite(Number(company.capital)) && Number(company.capital) > 0
    ? formatMoney(company.capital) : '';
  const sizeFormatted = company.size
    ? `${company.size}${company.sizeAcronym && !company.size.toUpperCase().includes(company.sizeAcronym.toUpperCase()) ? ` (${company.sizeAcronym})` : ''}`
    : '';
  const cnaeLabel = company.primaryActivity
    ? `${company.primaryActivityCode ? `${company.primaryActivityCode} · ` : ''}${company.primaryActivity}` : '';
  const simplesLabel = typeof company.simpleNational === 'boolean'
    ? (company.simpleNational ? `Sim${company.simpleNationalSince ? ` (desde ${formatEprocDateValue(company.simpleNationalSince, formatDate)})` : ''}` : 'Não')
    : '';
  const meiLabel = typeof company.mei === 'boolean' ? (company.mei ? 'Sim' : 'Não') : '';

  const defs = [
    definition('Nome fantasia', company.tradeName, escapeHtml),
    definition('Natureza jurídica', company.legalNature, escapeHtml),
    definition('Porte', sizeFormatted, escapeHtml),
    definition('Capital social', capitalFormatted, escapeHtml),
    definition('Abertura', formatEprocDateValue(company.openedAt, formatDate), escapeHtml),
    definition('Situação em', formatEprocDateValue(company.statusDate, formatDate), escapeHtml),
    definition('CNAE principal', cnaeLabel, escapeHtml),
    definition('Simples Nacional', simplesLabel, escapeHtml),
    definition('MEI', meiLabel, escapeHtml),
    definition('IBGE', company.municipalityIbgeCode, escapeHtml)
  ].filter(Boolean).join('');

  const secondaryList = Array.isArray(company.secondaryActivities) && company.secondaryActivities.length
    ? `<div class="contact-company-subsection"><h5>Atividades secundárias (${company.secondaryActivities.length})</h5><ul class="contact-company-cnae-list">${company.secondaryActivities.slice(0, 5).map(act => `<li>${escapeHtml([act.code, act.description].filter(Boolean).join(' · '))}</li>`).join('')}</ul></div>`
    : '';

  const taxEvents = Array.isArray(company.taxEvents) && company.taxEvents.length
    ? `<div class="contact-company-subsection"><h5>Eventos tributários recentes</h5><ul class="contact-company-cnae-list">${company.taxEvents.slice(0, 4).map(ev => `<li>${escapeHtml([ev.regime, formatEprocDateValue(ev.from, formatDate), ev.text].filter(Boolean).join(' · '))}</li>`).join('')}</ul></div>`
    : '';

  const qsaList = Array.isArray(company.qsa) && company.qsa.length
    ? `<div class="contact-company-subsection"><h5>Quadro societário (${company.qsa.length})</h5><ul class="contact-company-qsa-list">${company.qsa.map(partner => `<li><strong>${escapeHtml(partner.name)}</strong><span>${escapeHtml([partner.role, partner.personType, partner.since ? `desde ${formatEprocDateValue(partner.since, formatDate)}` : ''].filter(Boolean).join(' · ') || 'Participação registrada')}</span></li>`).join('')}</ul></div>`
    : '';

  const consultedLabel = formatEprocDateValue(company.consultedAt, formatDate);
  const provenanceParts = [company.source, consultedLabel ? `consultado em ${consultedLabel}` : ''].filter(Boolean).join(' · ');

  return `<section class="contact-inspector-section contact-company-section" aria-labelledby="contactCompanyHeading">
    <div class="contact-company-header">
      <div>
        <h4 id="contactCompanyHeading">Perfil empresarial (CNPJ)</h4>
        <span class="contact-company-status-badge ${badgeClass}">${escapeHtml(badgeLabel)}</span>
      </div>
      ${hasCnpj ? '<button type="button" class="v2-button is-secondary contact-company-refresh" data-contact-registry-refresh>Atualizar via CNPJ</button>' : ''}
    </div>
    ${defs ? `<dl>${defs}</dl>` : ''}
    ${secondaryList}
    ${taxEvents}
    ${qsaList}
    ${provenanceParts ? `<small class="contact-company-provenance">${escapeHtml(provenanceParts)}</small>` : ''}
  </section>`;
}

function renderLegalContextSummary({ item, context, escapeHtml, formatDate }) {
  const metrics = context?.metrics;
  if (!metrics) return '';
  const role = roleForPresentation(item);
  const integrity = role.key === 'cliente'
    ? 'Somente vínculos principais ou relações processuais registradas são exibidos.'
    : `Papel preservado como ${role.label.toLowerCase()}; este contato não é tratado como cliente.`;
  return `<section class="contact-legal-summary" aria-labelledby="contactLegalSummaryHeading">
    <div class="contact-context-heading"><div><p>Visão 360</p><h4 id="contactLegalSummaryHeading">Contexto jurídico</h4></div>${context.nextDeadline ? `<span>Próximo prazo ${escapeHtml(formatDate(context.nextDeadline))}</span>` : ''}</div>
    <div class="contact-context-metrics">
      ${contextMetric(metrics.processes, 'Processos', 'Processo')}
      ${contextMetric(metrics.openTasks, 'Providências', 'Providência')}
      ${contextMetric(metrics.publications, 'Publicações', 'Publicação')}
      ${contextMetric(metrics.documents, 'Documentos', 'Documento')}
      ${contextMetric(metrics.appointments, 'Agenda')}
      ${contextMetric(metrics.financial, 'Financeiro')}
    </div>
    <p class="contact-context-integrity">${escapeHtml(integrity)}</p>
  </section>`;
}

// Singular com 1 ("1 Providência", não "1 Providências"); Agenda e Financeiro são invariáveis.
function contextMetric(value, label, singular = label) {
  const count = Number(value) || 0;
  return `<div><strong>${count}</strong><span>${count === 1 ? singular : label}</span></div>`;
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
    const relationship = process.contextRelationship === 'canonical-client' ? 'Cliente principal' : 'Parte relacionada';
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
  // A mensagem diz o que de fato filtrou e oferece a saída: antes sugeria "selecione outro
  // papel" mesmo com "Todos" ativo e não tinha botão para limpar a busca.
  const hint = !filtered
    ? 'Cadastre a primeira pessoa para iniciar a base de relacionamentos.'
    : query && roleFilter !== 'all'
      ? 'Nenhum contato com este papel corresponde à busca.'
      : query
        ? 'Nenhum contato corresponde à busca.'
        : 'Nenhum contato com este papel.';
  const actions = [
    filtered && query ? '<button type="button" class="v2-button is-secondary" data-contact-clear-search>Limpar busca</button>' : '',
    filtered && roleFilter !== 'all' ? '<button type="button" class="v2-button is-secondary" data-contact-role-filter="all">Ver todos</button>' : '',
    `<button type="button" class="v2-button ${filtered ? 'is-secondary' : 'is-primary'}" data-contact-create>${iconSvg('add')}Novo contato</button>`
  ].filter(Boolean).join('');
  return `<div class="contact-empty-state">
    <span aria-hidden="true">${iconSvg('contacts')}</span>
    <strong>${filtered ? 'Nenhum contato encontrado.' : 'Nenhum contato cadastrado.'}</strong>
    <p>${hint}</p>
    <div class="contact-empty-actions">${actions}</div>
  </div>`;
}

function roleCounts(records) {
  return records.reduce((counts, item) => {
    const key = roleForPresentation(item).key;
    if (ROLE_LABELS[key]) counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {});
}
import { iconSvg } from './icons.js?v=3.4.0';
