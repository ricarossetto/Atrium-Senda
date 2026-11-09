/**
 * ATRIUM — Insights determinísticos de carteira de tarefas (sem modelo, sem escrita).
 *
 * Três leituras puras sobre o acervo do workspace:
 *
 * 1. **Consistência** — incoerências estruturais. Só entram em `fixes` as que têm **evidência
 *    inequívoca** e correção **aditiva em campo seguro** (ex.: concluída sem `completedAt`).
 *    Tudo que exigiria apagar ou reinterpretar dado humano vira `suggestion` — nunca correção.
 * 2. **Carteira** — resumo em linguagem (abertas, atrasadas, vencendo, sem responsável, aguardando
 *    terceiros). Informa; não decide, não prioriza e não cria prazo.
 * 3. **Responsável** — sugestão de quem já conduziu tarefas do mesmo tipo no escritório, com a
 *    base declarada e sem atribuir nada.
 */

const TERMINAL_STATUSES = Object.freeze(['concluida', 'cancelada']);

function text(value) {
  return String(value ?? '').trim();
}

function timestampOf(value) {
  const parsed = Date.parse(text(value));
  return Number.isFinite(parsed) ? parsed : 0;
}

function daysUntil(dateValue, today) {
  const alvo = timestampOf(dateValue);
  const base = timestampOf(today);
  if (!alvo || !base) return Number.POSITIVE_INFINITY;
  return Math.round((alvo - base) / 86_400_000);
}

function isOpen(task) {
  if (!task || typeof task !== 'object') return false;
  if (task.active === false || task.absorbedInto) return false;
  return !TERMINAL_STATUSES.includes(text(task.status));
}

/**
 * 1. Consistência: `fixes` (correção aditiva com evidência) e `suggestions` (só aponta).
 */
export function planTaskConsistency({ tasks = [], users = [] } = {}) {
  const fixes = [];
  const suggestions = [];
  const nomes = new Set((Array.isArray(users) ? users : [])
    .map(user => text(user?.name || user?.displayName).toLowerCase())
    .filter(Boolean));
  const porId = new Map((Array.isArray(tasks) ? tasks : [])
    .filter(task => task && text(task.id))
    .map(task => [text(task.id), task]));

  for (const task of Array.isArray(tasks) ? tasks : []) {
    if (!task || !text(task.id)) continue;
    // Evidência: a própria etapa diz concluída e o marco simplesmente não existe (dado aditivo,
    // nada humano é sobrescrito).
    if (text(task.status) === 'concluida' && !text(task.completedAt)) {
      fixes.push({
        taskId: text(task.id),
        field: 'completedAt',
        current: '',
        proposed: text(task.updatedAt || task.createdAt) || new Date().toISOString(),
        evidence: 'tarefa está em "concluida" e sem data de conclusão registrada',
        title: text(task.title).slice(0, 120)
      });
    }
    // Sugestões: apontam sem tocar (apagar responsável ou desfazer absorção seria perda de dado).
    const responsavel = text(task.responsible);
    if (responsavel && nomes.size > 0 && !nomes.has(responsavel.toLowerCase())) {
      suggestions.push({
        taskId: text(task.id),
        field: 'responsible',
        current: responsavel,
        evidence: 'responsável não consta na equipe do escritório',
        title: text(task.title).slice(0, 120)
      });
    }
    if (task.absorbedInto && !porId.has(text(task.absorbedInto))) {
      suggestions.push({
        taskId: text(task.id),
        field: 'absorbedInto',
        current: text(task.absorbedInto),
        evidence: 'oficial apontada pela absorção não existe mais no acervo',
        title: text(task.title).slice(0, 120)
      });
    }
    if (isOpen(task) && text(task.status) === 'concluida') {
      suggestions.push({ taskId: text(task.id), field: 'status', current: text(task.status), evidence: 'estado inconsistente', title: text(task.title).slice(0, 120) });
    }
  }
  return { fixes, suggestions };
}

/**
 * 2. Carteira: resumo em linguagem (relatório assistido — não decide nada).
 */
const plural = (count, singular, pluralForm) => `${count} ${count === 1 ? singular : pluralForm}`;

export function buildPortfolioBrief({ tasks = [], now = new Date().toISOString().slice(0, 10) } = {}) {
  const abertas = (Array.isArray(tasks) ? tasks : []).filter(isOpen);
  const comPrazo = abertas.map(task => {
    const prazo = text(task.fatalDeadline) || text(task.deadline);
    return { task, prazo, dias: prazo ? daysUntil(prazo, now) : Number.POSITIVE_INFINITY };
  });
  const atrasadas = comPrazo.filter(item => Number.isFinite(item.dias) && item.dias < 0);
  const vencendo = comPrazo.filter(item => Number.isFinite(item.dias) && item.dias >= 0 && item.dias <= 7);
  const semResponsavel = abertas.filter(task => !text(task.responsible));
  const aguardando = abertas.filter(task => text(task.status) === 'aguardando' || text(task.status) === 'aguardando-terceiros');
  const semPrazo = abertas.filter(task => !text(task.fatalDeadline) && !text(task.deadline));
  const linhas = [
    `Carteira: ${plural(abertas.length, 'tarefa aberta', 'tarefas abertas')} em ${plural(new Set(abertas.map(task => text(task.process)).filter(Boolean)).size, 'processo', 'processos')}.`,
    atrasadas.length
      ? `Atrasadas: ${atrasadas.length} — ${atrasadas.slice(0, 3).map(item => text(item.task.title).slice(0, 60)).join(' · ')}${atrasadas.length > 3 ? ` · e mais ${atrasadas.length - 3}` : ''}.`
      : 'Nenhuma tarefa atrasada no momento.',
    vencendo.length ? `Vencem em até 7 dias: ${vencendo.length}.` : 'Nada vencendo nos próximos 7 dias.',
    semResponsavel.length ? `Sem responsável definido: ${semResponsavel.length}.` : 'Toda tarefa aberta tem responsável definido.',
    aguardando.length ? `Aguardando terceiro ou documento: ${aguardando.length}.` : 'Nada parado por terceiro.',
    semPrazo.length ? `Sem prazo informado: ${semPrazo.length} (o prazo é decisão humana; nada é estimado aqui).` : 'Todas as tarefas abertas têm prazo informado.'
  ];
  return { lines: linhas, counts: { abertas: abertas.length, atrasadas: atrasadas.length, vencendo: vencendo.length, semResponsavel: semResponsavel.length, aguardando: aguardando.length, semPrazo: semPrazo.length } };
}

/**
 * 3. Responsável: quem já concluiu tarefas do mesmo tipo (histórico do próprio escritório), com a
 * base declarada. Nunca atribui — só sugere, e só quando há evidência (2+ conclusões).
 */
export function suggestTaskAssignments({ tasks = [], users = [], maxSuggestions = 10 } = {}) {
  const lista = Array.isArray(tasks) ? tasks : [];
  const concluidas = lista.filter(task => task && text(task.status) === 'concluida' && text(task.completedBy));
  const porTipo = new Map();
  for (const task of concluidas) {
    const tipo = text(task.actionType || task.taskDefinition || task.category || 'geral').toLowerCase();
    const autor = text(task.completedBy);
    if (!autor) continue;
    if (!porTipo.has(tipo)) porTipo.set(tipo, new Map());
    const balde = porTipo.get(tipo);
    balde.set(autor, (balde.get(autor) || 0) + 1);
  }
  const membros = new Set((Array.isArray(users) ? users : [])
    .map(user => text(user?.name || user?.displayName).toLowerCase())
    .filter(Boolean));
  const sugestoes = [];
  for (const task of lista) {
    if (!isOpen(task) || text(task.responsible)) continue;
    const tipo = text(task.actionType || task.taskDefinition || task.category || 'geral').toLowerCase();
    const balde = porTipo.get(tipo);
    if (!balde) continue;
    const [nome, total] = [...balde.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0];
    const totalTipo = [...balde.values()].reduce((soma, valor) => soma + valor, 0);
    if (total < 2 || totalTipo === 0) continue;
    if (membros.size > 0 && !membros.has(nome.toLowerCase())) continue;
    sugestoes.push({
      taskId: text(task.id),
      name: nome,
      confidence: Number((total / totalTipo).toFixed(2)),
      basis: `${total} de ${plural(totalTipo, 'tarefa deste tipo concluída', 'tarefas deste tipo concluídas')} por ${nome}`
    });
  }
  return { suggestions: sugestoes.slice(0, Math.max(1, Number(maxSuggestions) || 10)) };
}
