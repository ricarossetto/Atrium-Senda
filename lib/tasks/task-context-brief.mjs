/**
 * ATRIUM — Contexto do processo/publicação no corpo da tarefa (3 a 5 linhas).
 *
 * Determinístico e sem modelo: cada linha sai de um dado **persistido** e declara a própria origem
 * ("Publicação:", "Processo:", "Fonte oficial:", "Histórico:", "Andamento:"). Nada é inferido e
 * nada de prazo é criado — a linha da fonte apenas **relata** a data que ela declarou (§16).
 */

function text(value) {
  return String(value ?? '').trim();
}

function formatBr(value) {
  const texto = text(value);
  if (!/^\d{4}-\d{2}-\d{2}/.test(texto)) return texto;
  return `${texto.slice(8, 10)}/${texto.slice(5, 7)}/${texto.slice(0, 4)}`;
}

/**
 * Linhas de contexto, na ordem em que a pessoa lê: o que chegou (publicação), de quem é o caso
 * (processo), o que a fonte declarou (referência, nunca prazo), o último andamento e o último ato
 * registrado na própria tarefa. Máximo de 5 linhas.
 */
export function buildTaskContextLines({ publication = null, process = null, task = null, limit = 5 } = {}) {
  const linhas = [];
  const publicacao = publication && typeof publication === 'object' ? publication : null;
  const processo = process && typeof process === 'object' ? process : null;
  const tarefa = task && typeof task === 'object' ? task : null;

  const tituloPublicacao = text(publicacao?.title || publicacao?.event || publicacao?.subject);
  if (tituloPublicacao) {
    const origem = text(publicacao?.source) || 'fonte não informada';
    const quando = formatBr(publicacao?.publishedAt || publicacao?.disponibilizadoEm);
    linhas.push(`Publicação: ${tituloPublicacao.slice(0, 160)}${quando ? ` · ${origem}, ${quando}` : ` · ${origem}`}`);
  }

  const numero = text(processo?.number || tarefa?.process);
  if (numero) {
    const cliente = text(processo?.client || processo?.clientName || tarefa?.client) || 'cliente não vinculado';
    const vara = text(processo?.courtUnit || processo?.court);
    linhas.push(`Processo: ${numero} · ${cliente}${vara ? ` · ${vara}` : ''}`);
  }

  const prazoFonte = formatBr(tarefa?.sourceReportedDeadlineAt || publicacao?.sourceReportedDeadlineAt);
  if (prazoFonte) {
    const vigente = formatBr(tarefa?.deadline);
    const divergente = vigente && vigente !== prazoFonte;
    linhas.push(`Fonte oficial: declarou ${prazoFonte}${divergente ? ` · a tarefa está com ${vigente} (digitação humana preservada)` : ' (referência, não é prazo)'}`);
  }

  const andamento = text(processo?.lastMovement || (Array.isArray(processo?.movements) ? processo.movements[0]?.text : ''));
  const quandoAndamento = formatBr(processo?.lastMovementAt || (Array.isArray(processo?.movements) ? processo.movements[0]?.date : ''));
  if (andamento) {
    linhas.push(`Andamento: ${andamento.slice(0, 160)}${quandoAndamento ? ` · ${quandoAndamento}` : ''}`);
  }

  const ultimoAto = Array.isArray(tarefa?.history) ? tarefa.history.slice(-1)[0] : null;
  if (ultimoAto?.action) {
    linhas.push(`Histórico: ${text(ultimoAto.action).slice(0, 140)}${text(ultimoAto.actor) ? ` · ${text(ultimoAto.actor)}` : ''}`);
  }

  return linhas.slice(0, Math.max(1, Number(limit) || 5));
}

/** Bloco de contexto para a descrição da tarefa: 3 a 5 linhas, cada uma com a origem declarada. */
export function buildTaskContextBlock({ publication = null, process = null, task = null } = {}) {
  const linhas = buildTaskContextLines({ publication, process, task });
  return linhas.length ? `\n\nContexto da conferência:\n${linhas.map(linha => `- ${linha}`).join('\n')}` : '';
}
