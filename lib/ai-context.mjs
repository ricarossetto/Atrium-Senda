const PROCESS_NUMBER_RE = /\b\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}\b/g;
const SEARCH_STOP_WORDS = new Set(['ainda', 'analise', 'como', 'com', 'dados', 'este', 'esta', 'isso', 'para', 'pela', 'pelo', 'processo', 'sobre', 'todos', 'uma', 'qual', 'quais']);

const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const compact = value => String(value || '').replace(/\s+/g, ' ').trim();

function mergeRecords(left = [], right = [], key = 'id') {
  const result = [...left];
  for (const record of right) {
    const value = record?.[key] ?? record?.id;
    const index = result.findIndex(item => (item?.[key] ?? item?.id) === value);
    if (index >= 0) result[index] = { ...result[index], ...record };
    else result.unshift(record);
  }
  return result;
}

function recordScore(record, query, rawQuery, tokens) {
  const processNumber = String(record?.number || record?.process || '').trim();
  if (processNumber && rawQuery.includes(processNumber)) return 100;
  let score = 0;
  for (const value of [record?.name, record?.client, record?.title, record?.opposingParty, record?.court]) {
    const candidate = normalize(value);
    if (candidate.length >= 5 && query.includes(candidate)) score += 30;
    for (const token of tokens) if (candidate.includes(token)) score += 2;
  }
  return score;
}

function selectRelevant(records, query, rawQuery, tokens, limit, includeGeneral = false) {
  const scored = records
    .map(record => ({ record, score: recordScore(record, query, rawQuery, tokens) }))
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .map(item => item.record);
  if (scored.length) return scored.slice(0, limit);
  return includeGeneral ? records.slice(0, limit) : [];
}

export function buildRelevantOfficeContext(state = {}, runtime = {}, message = '', selectedContext = {}) {
  const rawQuery = String(message || '');
  const query = normalize(rawQuery);
  const tokens = [...new Set(query.split(/[^a-z0-9]+/).filter(token => token.length >= 4 && !SEARCH_STOP_WORDS.has(token)))];
  const contacts = state.contacts || [];
  const processes = mergeRecords(state.processes || [], runtime.processes || [], 'number');
  const intimations = mergeRecords(state.intimations || [], runtime.intimations || [], 'id');
  const tasks = mergeRecords(state.tasks || [], runtime.tasks || [], 'id');
  const agenda = mergeRecords(state.agenda || [], runtime.events || [], 'id');

  const explicitNumbers = new Set(rawQuery.match(PROCESS_NUMBER_RE) || []);
  for (const record of [selectedContext.intimation, selectedContext.process]) {
    const number = String(record?.process || record?.number || '').trim();
    if (number) explicitNumbers.add(number);
  }

  const asksProcesses = /\b(process|acervo|carteira)\w*/.test(query);
  const asksIntimations = /\b(intim|publica[cç]|djen|diario)\w*/.test(query);
  const asksTasks = /\b(tarefa|prazo|kanban|pendencia)\w*/.test(query);
  const asksAgenda = /\b(agenda|audiencia|compromisso|evento)\w*/.test(query);
  const asksContacts = /\b(cliente|contato|parte)\w*/.test(query);

  let relevantProcesses = selectRelevant(processes, query, rawQuery, tokens, 8, asksProcesses && /\b(ativ|lista|todos|carteira|acervo)\w*/.test(query));
  if (explicitNumbers.size) {
    relevantProcesses = processes.filter(item => explicitNumbers.has(String(item.number || item.protocol || '').trim())).slice(0, 8);
  }
  const relatedNumbers = new Set([...explicitNumbers, ...relevantProcesses.map(item => String(item.number || item.protocol || '').trim()).filter(Boolean)]);

  const byRelatedProcess = record => relatedNumbers.has(String(record?.process || '').trim());
  let relevantIntimations = intimations.filter(byRelatedProcess);
  if (!relevantIntimations.length) relevantIntimations = selectRelevant(intimations, query, rawQuery, tokens, 6, asksIntimations);
  relevantIntimations = relevantIntimations.slice(0, 6);

  let relevantTasks = tasks.filter(byRelatedProcess);
  if (!relevantTasks.length) relevantTasks = selectRelevant(tasks, query, rawQuery, tokens, 8, asksTasks);
  relevantTasks = relevantTasks.slice(0, 8);

  let relevantAgenda = agenda.filter(byRelatedProcess);
  if (!relevantAgenda.length) relevantAgenda = selectRelevant(agenda, query, rawQuery, tokens, 6, asksAgenda);
  relevantAgenda = relevantAgenda.slice(0, 6);

  const relevantContacts = asksContacts ? selectRelevant(contacts, query, rawQuery, tokens, 5, false) : [];
  const sections = [];

  if (relevantProcesses.length) {
    sections.push(`[PROCESSOS RELEVANTES — ${relevantProcesses.length}]\n${relevantProcesses.map(item =>
      `- ${compact(item.number || item.protocol || 'Sem número')} | Cliente: ${compact(item.client || 'N/I')} | Parte contrária: ${compact(item.opposingParty || 'N/I')} | Órgão: ${compact(item.court || item.county || 'N/I')} | Ação/fase: ${compact([item.actionType, item.judicialPhase, item.stage].filter(Boolean).join(' · ') || 'N/I')} | Último andamento: ${compact(item.lastMovement || 'N/I')}`
    ).join('\n')}`);
  }
  if (relevantIntimations.length) {
    sections.push(`[INTIMAÇÕES RELEVANTES — ${relevantIntimations.length}]\n${relevantIntimations.map(item =>
      `- Processo: ${compact(item.process || 'N/I')} | Tribunal: ${compact(item.court || 'N/I')} | Publicação: ${compact(item.publishedAt || 'N/I')} | Prazo informado: ${compact(item.fatalDate || 'N/I')} | Teor: ${compact(item.text || item.summary || '').slice(0, 600)}`
    ).join('\n')}`);
  }
  if (relevantTasks.length) {
    sections.push(`[TAREFAS E PRAZOS RELEVANTES — ${relevantTasks.length}]\n${relevantTasks.map(item =>
      `- ${compact(item.title || 'Sem título')} | Processo: ${compact(item.process || 'Geral')} | Cliente: ${compact(item.client || 'N/I')} | Prazo fatal: ${compact(item.fatalDeadline || 'N/I')} | Prazo interno: ${compact(item.deadline || item.dueDate || 'N/I')} | Status: ${compact(item.status || 'pendente')} | Responsável: ${compact(item.responsible || item.lawyer || 'N/I')}`
    ).join('\n')}`);
  }
  if (relevantAgenda.length) {
    sections.push(`[AGENDA RELEVANTE — ${relevantAgenda.length}]\n${relevantAgenda.map(item =>
      `- ${compact(item.date || 'S/D')} ${compact(item.time || '')} | ${compact(item.title || 'Compromisso')} | Cliente: ${compact(item.client || 'N/I')} | Processo: ${compact(item.process || 'N/I')}`
    ).join('\n')}`);
  }
  if (relevantContacts.length) {
    sections.push(`[CONTATOS RELEVANTES — ${relevantContacts.length}]\n${relevantContacts.map(item =>
      `- ${compact(item.name || 'Sem nome')} | Papel: ${compact(item.contactRole || 'cliente')} | Localidade: ${compact([item.city, item.state].filter(Boolean).join('/') || 'N/I')}`
    ).join('\n')}`);
  }

  const body = sections.length ? sections.join('\n\n') : 'Nenhum registro interno foi selecionado para esta pergunta.';
  return `\n=== CONTEXTO INTERNO LIMITADO À PERGUNTA ===\n${body}`.slice(0, 24_000);
}
