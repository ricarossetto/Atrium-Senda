/**
 * Rótulo determinístico das tarefas de prazo criadas por fonte oficial.
 *
 * Regra do produto: o título identifica **o ato** (e o expediente), nunca uma data que
 * possa ser confundida com o prazo. A data operacional vive no campo `deadline`, com a
 * origem declarada em `deadlineSource`.
 *
 * Tudo aqui é derivação por padrão textual, sem modelo de IA e sem o JEV: o mesmo texto
 * do painel produz o mesmo rótulo em qualquer execução.
 */

const PJE_ACT_RE = /\b(Acórdão|Decisão|Despacho|Sentença|Intimação|Certidão|Edital|Resolução|Ofício|Ato|Publicação)\s*\(\s*(\d{4,})\s*\)/i;
const PJE_CLASSE_RE = /\b\d{2}:\d{2}\s+([A-ZÀ-Ý][A-Za-zÀ-ÿ]{1,11})\s+\d{7}-\d{2}\.\d{4}/;
const DATE_RE = /\b\d{2}\/\d{2}\/\d{4}\b/;

function collapse(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

/** Rótulo do expediente PJe: "Decisão (54342666) · CumSen". */
export function derivePjeActLabel({ summary = '', fallback = 'Intimação PJe' } = {}) {
  const text = collapse(summary);
  const act = PJE_ACT_RE.exec(text);
  const classe = PJE_CLASSE_RE.exec(text)?.[1] || '';
  if (!act) {
    const base = collapse(fallback) || 'Intimação PJe';
    return classe ? `${base} · ${classe}` : base;
  }
  return `${act[1]} (${act[2]})${classe ? ` · ${classe}` : ''}`;
}

/**
 * Rótulo do prazo eproc. O portal usa `event` ora com o ato, ora com uma data de
 * referência (a data que aparecia sozinha no título antigo e se confundia com o prazo).
 * Ordem: assunto → evento textual → data rotulada como intimação. O texto de origem do
 * eproc começa pelo número do processo, então não serve como rótulo.
 */
export function deriveEprocActLabel({ subject = '', event = '', fallback = 'item pendente' } = {}) {
  const subjectText = collapse(subject);
  if (subjectText && !DATE_RE.test(subjectText)) return subjectText.slice(0, 72);
  const eventText = collapse(event);
  if (eventText && !/^\d{2}\/\d{2}\/\d{4}/.test(eventText)) return eventText.slice(0, 72);
  const date = DATE_RE.exec(eventText)?.[0] || '';
  if (date) return `intimação de ${date}`;
  return collapse(fallback) || 'item pendente';
}

export function pjeTaskTitle({ auto = true, summary = '', fallback = '' } = {}) {
  return `${auto ? 'Prazo PJe' : 'Conferir prazo PJe'} — ${derivePjeActLabel({ summary, fallback: fallback || 'Intimação PJe' })}`;
}

export function eprocTaskTitle({ auto = true, subject = '', event = '' } = {}) {
  return `${auto ? 'Prazo eproc' : 'Conferir prazo informado pelo eproc'} — ${deriveEprocActLabel({ subject, event })}`;
}

/** Títulos gerados pelo sistema (podem ser atualizados quando o ato muda). */
export const GENERATED_SOURCE_TITLE_RE = /^(Prazo PJe|Conferir prazo PJe|Prazo eproc|Conferir prazo informado pelo eproc) — /;

/**
 * Títulos antigos do PJe, que usavam o rótulo da situação ("Pendentes de ciência ou de
 * resposta"). Só esses são reescritos na atualização; título editado por pessoa é preservado.
 */
export const LEGACY_PJE_BUCKET_TITLE_RE = /^(Prazo PJe|Conferir prazo PJe) — (Pendentes|Apenas|Ciência|Cujo|Sem prazo|Respondidos)/;
