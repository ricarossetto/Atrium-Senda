/**
 * Overlays documentais do cenário LC 142: ajuste de vínculo e livro de contribuições.
 *
 * Regra central, herdada do motor de referência: overlay NUNCA altera o registro
 * importado. O histórico precisa reconstruir o estado atual exatamente, e o
 * estado inicial de cada registro de origem precisa ser idêntico ao importado.
 * Confiar apenas em `applied: true` do cliente não basta.
 */

import { isValidCompetence } from './calendar-30360.mjs';

export class Lc142OverlayError extends Error {
  constructor(message) {
    super(message);
    this.name = 'Lc142OverlayError';
  }
}

const REGIMES_VINCULO = new Set(['A confirmar', 'RGPS', 'RPPS', 'CTC a revisar']);
const MOEDAS = new Set(['unconfirmed', 'BRL', 'CRUZEIRO', 'CRUZADO', 'URV', 'OTHER']);
const ACOES_HISTORICO = new Set([
  'edit',
  'add',
  'confirm',
  'exclude',
  'restore',
  'merge',
  'undo',
  'currency',
  'apply'
]);

const RFC3339_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

function contagemCaracteres(value) {
  return typeof value === 'string' ? [...value].length : 0;
}

function isRfc3339(value) {
  return typeof value === 'string' && RFC3339_PATTERN.test(value) && Number.isFinite(Date.parse(value));
}

/**
 * Converte "1234.56" em centavos inteiros exatos, sem ponto flutuante.
 * Rejeita qualquer forma não oficial, como o motor de origem.
 */
export function valorEmCentavos(value) {
  if (typeof value !== 'string') {
    throw new Lc142OverlayError('Valor de contribuição deve usar centavos exatos.');
  }
  const separator = value.indexOf('.');
  if (separator < 0 || value.indexOf('.', separator + 1) >= 0) {
    throw new Lc142OverlayError('Valor de contribuição deve usar centavos exatos.');
  }
  const whole = value.slice(0, separator);
  const fraction = value.slice(separator + 1);
  if (
    whole.length === 0 ||
    whole.length > 17 ||
    (whole.length > 1 && whole.startsWith('0')) ||
    fraction.length !== 2 ||
    !/^[0-9]+$/.test(whole) ||
    !/^[0-9]+$/.test(fraction)
  ) {
    throw new Lc142OverlayError('Valor de contribuição não oficial.');
  }
  const centavos = Number(whole) * 100 + Number(fraction);
  if (!Number.isSafeInteger(centavos)) {
    throw new Lc142OverlayError('Valor de contribuição excede o limite de centavos.');
  }
  return centavos;
}

/** Chave de contribuição aceita: alfanumérico e `:._-`, até 100 caracteres. */
function chaveValida(key) {
  if (typeof key !== 'string' || key.length === 0 || key.length > 100) return false;
  for (const char of key) {
    const ok = /[A-Za-z0-9]/.test(char) || ':.\\_-'.includes(char);
    if (!ok) return false;
  }
  return true;
}

function competenceValida(value) {
  if (!isValidCompetence(value)) return false;
  if (value.slice(0, 4) === '0000') return false;
  return true;
}

/**
 * Valida um snapshot de vínculo editado.
 */
function validarSnapshotVinculo(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') {
    throw new Lc142OverlayError('Campos do ajuste de vínculo inválidos.');
  }
  const empregador = typeof snapshot.employer === 'string' ? snapshot.employer : '';
  const indicadores = typeof snapshot.indicators === 'string' ? snapshot.indicators : '';
  if (
    contagemCaracteres(empregador) > 1000 ||
    contagemCaracteres(indicadores) > 1000 ||
    !REGIMES_VINCULO.has(snapshot.regime)
  ) {
    throw new Lc142OverlayError('Campos do ajuste de vínculo inválidos.');
  }
  for (const campo of ['start_date', 'end_date']) {
    const date = snapshot[campo];
    if (typeof date !== 'string') {
      throw new Lc142OverlayError('Data declarada do vínculo inválida.');
    }
    if (date !== '' && !ehDataIsoValida(date)) {
      throw new Lc142OverlayError('Data declarada do vínculo inválida.');
    }
  }
  const start = snapshot.start_date;
  const end = snapshot.end_date;
  if (start !== '' && end !== '' && start > end) {
    throw new Lc142OverlayError('Fim do vínculo anterior ao início.');
  }
}

function ehDataIsoValida(value) {
  if (typeof value !== 'string' || value.length !== 10) return false;
  for (let index = 0; index < value.length; index += 1) {
    if (value.charCodeAt(index) > 127) return false;
  }
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1) return false;
  const total = month === 2
    ? ((year % 4 === 0 && year % 100 !== 0) || year % 400 === 0 ? 29 : 28)
    : [4, 6, 9, 11].includes(month) ? 30 : 31;
  return day <= total;
}

function snapshotDoVinculoManual(link) {
  return {
    employer: typeof link.employer === 'string' ? link.employer : '',
    start_date: typeof link.start_date === 'string' ? link.start_date : '',
    end_date: typeof link.end_date === 'string' ? link.end_date : '',
    regime: link.regime,
    indicators: typeof link.indicators === 'string' ? link.indicators : '',
    confirmed: link.confirmed === true,
    excluded: Boolean(link.source_review?.excluded)
  };
}

/**
 * `validate_source_links` — o ajuste de vínculo precisa ser uma cadeia
 * documentada sobre a origem, sem criar ou apagar prova.
 */
export function validateSourceLinks(calculation) {
  const manualLinks = Array.isArray(calculation.manual_links) ? calculation.manual_links : [];
  const sequences = new Set();
  const cnis = calculation.cnis ?? null;
  const sources = new Map();
  if (cnis && Array.isArray(cnis.links)) {
    for (const link of cnis.links) sources.set(link.sequence, link);
  }
  let operacoes = 0;
  for (const link of manualLinks) {
    const review = link.source_review;
    if (!review) continue;
    if (sequences.has(review.sequence) || !Array.isArray(review.history) || review.history.length > 200) {
      throw new Lc142OverlayError('Ajuste de vínculo duplicado ou histórico excedido.');
    }
    sequences.add(review.sequence);
    if (!cnis) throw new Lc142OverlayError('Ajuste de vínculo sem CNIS original.');
    const shaOrigem = cnis.metadata ? cnis.metadata.source_sha256 : null;
    if ((review.source_sha256 ?? null) !== (shaOrigem ?? null)) {
      throw new Lc142OverlayError('Ajuste de vínculo aponta a outro documento.');
    }
    const origem = sources.get(review.sequence);
    if (!origem) throw new Lc142OverlayError('Vínculo de origem não encontrado.');
    operacoes += review.history.length;
    if (operacoes > 50000) throw new Lc142OverlayError('Histórico de vínculos excede limite.');
    let indicadores = Array.isArray(origem.indicators) ? [...origem.indicators] : [];
    if (origem.prpps && !indicadores.includes('PRPPS')) indicadores.push('PRPPS');
    let estado = {
      employer: origem.raw_employer ?? '',
      start_date: origem.start_date ?? '',
      end_date: origem.end_date ?? '',
      regime: origem.prpps ? 'RPPS' : 'A confirmar',
      indicators: indicadores.join(', '),
      confirmed: false,
      excluded: false
    };
    for (const change of review.history) {
      const motivo = typeof change.reason === 'string' ? change.reason : '';
      if (
        motivo.trim() === '' ||
        contagemCaracteres(motivo) > 1000 ||
        (typeof change.at !== 'string' ? 0 : change.at.length) > 64 ||
        !isRfc3339(change.at)
      ) {
        throw new Lc142OverlayError('Ajuste de vínculo exige motivo e data de revisão válidos.');
      }
      if (!mesmoSnapshotVinculo(estado, change.before)) {
        throw new Lc142OverlayError('Histórico de vínculo não corresponde ao estado anterior.');
      }
      validarSnapshotVinculo(change.after);
      estado = change.after;
    }
    if (!mesmoSnapshotVinculo(estado, snapshotDoVinculoManual(link))) {
      throw new Lc142OverlayError('Vínculo alterado sem operação documentada.');
    }
    if ((link.confirmed === true || review.excluded === true) && review.history.length === 0) {
      throw new Lc142OverlayError('Conferência ou exclusão de vínculo exige justificativa.');
    }
  }
  return true;
}

function mesmoSnapshotVinculo(a, b) {
  if (!a || !b) return false;
  return (
    a.employer === b.employer &&
    a.start_date === b.start_date &&
    a.end_date === b.end_date &&
    a.regime === b.regime &&
    a.indicators === b.indicators &&
    a.confirmed === b.confirmed &&
    a.excluded === b.excluded
  );
}

function validarRegistroContribuicao(record, sourceIds, linkIds) {
  if (!chaveValida(record?.key)) throw new Lc142OverlayError('Chave de contribuição inválida.');
  if (!competenceValida(record.competence)) {
    throw new Lc142OverlayError('Competência de contribuição inválida.');
  }
  valorEmCentavos(record.amount);
  if (!MOEDAS.has(record.currency)) throw new Lc142OverlayError('Moeda de contribuição inválida.');
  if (
    contagemCaracteres(record.indicators) > 1000 ||
    contagemCaracteres(record.evidence) > 1000 ||
    ((record.confirmed === true || record.excluded === true) &&
      (typeof record.evidence !== 'string' || record.evidence.trim() === ''))
  ) {
    throw new Lc142OverlayError('Confirmação/exclusão exige justificativa dentro do limite.');
  }
  if (record.link_sequence !== null && record.link_sequence !== undefined) {
    if (!linkIds.has(record.link_sequence)) {
      throw new Lc142OverlayError('Vínculo de contribuição não encontrado na origem.');
    }
  }
  const indices = Array.isArray(record.source_indices) ? record.source_indices : [];
  if (indices.length > 10000) {
    throw new Lc142OverlayError('Origens de contribuição excedem o limite.');
  }
  const vistos = new Set();
  for (const index of indices) {
    if (vistos.has(index) || !sourceIds.has(index)) {
      throw new Lc142OverlayError('Origem de contribuição ausente ou duplicada.');
    }
    vistos.add(index);
  }
}

/**
 * Projeção do livro: registros ativos viram salários revisados.
 */
export function projectContributionReview(review) {
  const meses = new Set();
  const projetados = [];
  for (const record of review.records) {
    if (record.excluded === true) continue;
    valorEmCentavos(record.amount);
    if (
      record.confirmed !== true ||
      typeof record.evidence !== 'string' ||
      record.evidence.trim() === '' ||
      record.currency !== 'BRL' ||
      record.competence < '1994-07' ||
      (typeof record.indicators === 'string' ? record.indicators.trim() : '') !== ''
    ) {
      throw new Lc142OverlayError(
        'Contribuições ativas exigem BRL, revisão, justificativa e indicadores resolvidos.'
      );
    }
    if (meses.has(record.competence)) {
      throw new Lc142OverlayError('Concomitância exige consolidação documental por competência.');
    }
    meses.add(record.competence);
    projetados.push({
      competence: record.competence,
      amount: record.amount,
      indicators: record.indicators,
      confirmed: true
    });
  }
  if (projetados.length === 0) {
    throw new Lc142OverlayError('Livro não possui contribuições ativas.');
  }
  return projetados;
}

function validarProjecao(review, salaries) {
  const esperado = projectContributionReview(review);
  const informado = Array.isArray(salaries) ? salaries : [];
  if (
    informado.length !== esperado.length ||
    informado.some((atual, posicao) => {
      const alvo = esperado[posicao];
      return (
        atual.competence !== alvo.competence ||
        atual.amount !== alvo.amount ||
        atual.indicators !== alvo.indicators ||
        atual.confirmed !== alvo.confirmed
      );
    })
  ) {
    throw new Lc142OverlayError(
      'Salários aplicados divergem do livro de contribuições; reaplique a revisão.'
    );
  }
}

/**
 * `ContributionReview::validate` — reconstrói a cadeia do livro e confere contra
 * a origem importada. O estado inicial de cada lançamento precisa ser intocado.
 */
export function validateContributionReview(review, calculation) {
  if (!review || typeof review !== 'object') {
    throw new Lc142OverlayError('Versão ou quantidade de registros do livro de contribuições inválida.');
  }
  const records = Array.isArray(review.records) ? review.records : [];
  const history = Array.isArray(review.history) ? review.history : [];
  if (review.version !== 1 || records.length > 10000 || history.length > 200) {
    throw new Lc142OverlayError('Versão ou quantidade de registros do livro de contribuições inválida.');
  }
  const cnis = calculation.cnis ?? null;
  const shaOrigem = cnis?.metadata ? cnis.metadata.source_sha256 : null;
  if ((review.source_sha256 ?? null) !== (shaOrigem ?? null)) {
    throw new Lc142OverlayError('Livro de contribuições não corresponde ao documento de origem.');
  }
  const sourceIds = new Set();
  if (cnis && Array.isArray(cnis.salary_entries)) {
    for (const entry of cnis.salary_entries) sourceIds.add(entry.source.index);
  }
  const linkIds = new Set();
  if (cnis && Array.isArray(cnis.links)) {
    for (const link of cnis.links) linkIds.add(link.sequence);
  }
  if (cnis && Array.isArray(cnis.salary_entries) && sourceIds.size !== cnis.salary_entries.length) {
    throw new Lc142OverlayError('Origem contém índices duplicados.');
  }
  const chaves = new Set();
  const origens = new Set();
  for (const record of records) {
    validarRegistroContribuicao(record, sourceIds, linkIds);
    if (chaves.has(record.key)) throw new Lc142OverlayError('Contribuição com chave duplicada.');
    chaves.add(record.key);
    for (const index of record.source_indices) {
      if (origens.has(index)) {
        throw new Lc142OverlayError('Origem contabilizada em mais de uma contribuição.');
      }
      origens.add(index);
    }
  }
  if (cnis && Array.isArray(cnis.salary_entries)) {
    if (
      cnis.salary_entries.length !== origens.size ||
      cnis.salary_entries.some(entry => !origens.has(entry.source.index))
    ) {
      throw new Lc142OverlayError(
        'Livro omite lançamentos da origem; exclua da hipótese sem apagar a fonte.'
      );
    }
  }
  let linhasAuditoria = 0;
  history.forEach((change, index) => {
    const motivo = typeof change?.reason === 'string' ? change.reason : '';
    if (
      change?.sequence !== index + 1 ||
      !ACOES_HISTORICO.has(change.action) ||
      motivo.trim() === '' ||
      contagemCaracteres(motivo) > 1000 ||
      (typeof change.at !== 'string' ? 0 : change.at.length) > 64 ||
      !isRfc3339(change.at)
    ) {
      throw new Lc142OverlayError('Operação de revisão inválida ou sem justificativa.');
    }
    const antes = Array.isArray(change.before) ? change.before : [];
    const depois = Array.isArray(change.after) ? change.after : [];
    linhasAuditoria += antes.length + depois.length;
    if (linhasAuditoria > 50000) throw new Lc142OverlayError('Histórico de contribuições excede limite.');
    for (const lado of [antes, depois]) {
      const vistas = new Set();
      for (const record of lado) {
        validarRegistroContribuicao(record, sourceIds, linkIds);
        if (vistas.has(record.key)) throw new Lc142OverlayError('Histórico contém chave duplicada.');
        vistas.add(record.key);
      }
    }
  });
  // Reconstrói o estado para trás: sem confiar nos flags do cliente.
  const estado = new Map(records.map(record => [record.key, record]));
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const change = history[index];
    const antes = Array.isArray(change.before) ? change.before : [];
    const depois = Array.isArray(change.after) ? change.after : [];
    const afetadas = new Set([...antes, ...depois].map(record => record.key));
    for (const key of afetadas) {
      const esperado = depois.find(record => record.key === key) ?? null;
      const atual = estado.get(key) ?? null;
      if (!registrosIguais(atual, esperado)) {
        throw new Lc142OverlayError('Histórico não corresponde ao estado das contribuições.');
      }
    }
    for (const key of afetadas) estado.delete(key);
    for (const record of antes) estado.set(record.key, record);
  }
  if (cnis && Array.isArray(cnis.salary_entries)) {
    for (const entry of cnis.salary_entries) {
      const key = `source:${entry.source.index}`;
      const record = estado.get(key);
      if (!record) throw new Lc142OverlayError('Preparação inicial omite origem de contribuição.');
      const indices = Array.isArray(record.source_indices) ? record.source_indices : [];
      if (
        indices.length !== 1 ||
        indices[0] !== entry.source.index ||
        record.competence !== entry.competence ||
        valorEmCentavos(record.amount) !== entry.amount_centavos ||
        (record.link_sequence ?? null) !== (entry.link_sequence ?? null) ||
        record.currency !== 'unconfirmed' ||
        record.confirmed !== false ||
        record.excluded !== false ||
        (typeof record.evidence === 'string' ? record.evidence : '') !== ''
      ) {
        throw new Lc142OverlayError('Estado inicial alterou origem sem operação documentada.');
      }
    }
  }
  for (const record of estado.values()) {
    const indices = Array.isArray(record.source_indices) ? record.source_indices : [];
    if (indices.length === 0) {
      if (
        record.currency !== 'unconfirmed' ||
        record.confirmed !== false ||
        record.excluded !== false ||
        (typeof record.evidence === 'string' ? record.evidence : '') !== ''
      ) {
        throw new Lc142OverlayError('Preparação manual inicial exige revisão separada.');
      }
    } else if (indices.length !== 1 || record.key !== `source:${indices[0]}`) {
      throw new Lc142OverlayError('Origem consolidada exige operação rastreável.');
    }
  }
  if (cnis && Array.isArray(cnis.salary_entries)) {
    for (const entry of cnis.salary_entries) {
      const inicial = estado.get(`source:${entry.source.index}`);
      if (!inicial) throw new Lc142OverlayError('Origem inicial ausente.');
      let indicadores = Array.isArray(entry.indicators) ? [...entry.indicators] : [];
      const vinculo = (cnis.links ?? []).find(link => link.sequence === entry.link_sequence);
      const prpps = Boolean(vinculo?.prpps);
      if (prpps && !indicadores.includes('PRPPS')) indicadores.push('PRPPS');
      if (
        entry.excluded_from_validated_domain === true &&
        !prpps &&
        !indicadores.includes('origem_excluida_a_revisar')
      ) {
        indicadores.push('origem_excluida_a_revisar');
      }
      const unicos = [];
      const vistos = new Set();
      for (const item of indicadores) {
        if (vistos.has(item)) continue;
        vistos.add(item);
        unicos.push(item);
      }
      const esperado = unicos.join(', ');
      const atual = typeof inicial.indicators === 'string' ? inicial.indicators : '';
      if (atual !== esperado) {
        throw new Lc142OverlayError(
          'Indicadores originais foram alterados sem operação de revisão.'
        );
      }
    }
  }
  if (review.applied === true) {
    validarProjecao(review, calculation.manual_salaries);
  }
  return true;
}

function registrosIguais(a, b) {
  if (a === null || b === null) return a === b;
  if (typeof a !== 'object' || typeof b !== 'object') return a === b;
  return (
    a.key === b.key &&
    a.competence === b.competence &&
    a.amount === b.amount &&
    a.currency === b.currency &&
    (a.link_sequence ?? null) === (b.link_sequence ?? null) &&
    a.indicators === b.indicators &&
    a.confirmed === b.confirmed &&
    a.excluded === b.excluded &&
    a.evidence === b.evidence &&
    JSON.stringify(a.source_indices) === JSON.stringify(b.source_indices)
  );
}
