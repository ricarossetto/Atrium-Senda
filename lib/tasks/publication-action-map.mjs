/**
 * ATRIUM — Da providência à tarefa específica (publicação → catálogo oficial).
 *
 * O modelo escolhe apenas a **natureza** da providência em um vocabulário fixo (rótulos estáveis
 * preservam a calibração). Quem escolhe o **item do catálogo** é este mapeador determinístico sobre
 * `configuration.taskDefinitions` do escritório: o modelo nunca inventa nome de tarefa, e o item
 * sugerido é sempre um registro que já existe no catálogo — trocável por pessoa antes de confirmar.
 *
 * Nada aqui cria prazo, tarefa, tratamento ou ciência: são funções puras de leitura do catálogo.
 */

/** Vocabulário fixo do esquema `publication_action` (mesma ordem do schema). */
export const PUBLICATION_ACTION_IDS = Object.freeze([
  'contestar',
  'recorrer',
  'manifestar',
  'cumprir',
  'pagar_guia',
  'juntar_documento',
  'peticao_intermediaria',
  'preparar_audiencia',
  'cumprimento_sentenca',
  'outro'
]);

/** Rótulo legível por natureza escolhida (UI e resposta da API). */
export const PUBLICATION_ACTION_LABELS = Object.freeze({
  contestar: 'Contestar',
  recorrer: 'Recorrer',
  manifestar: 'Manifestar',
  cumprir: 'Cumprir determinação',
  pagar_guia: 'Pagar guia ou custas',
  juntar_documento: 'Juntar documento',
  peticao_intermediaria: 'Petição intermediária',
  preparar_audiencia: 'Preparar audiência',
  cumprimento_sentenca: 'Cumprimento de sentença',
  outro: 'Outro'
});

/**
 * Regras determinísticas por natureza: palavras-chave procuradas no nome do modelo do catálogo e
 * áreas preferenciais (usadas só como desempate). Nada é gerado além do que o catálogo já tem.
 */
const PUBLICATION_ACTION_RULES = Object.freeze({
  contestar: { keywords: ['contest', 'defesa', 'impugn', 'resposta'], areas: ['Cível', 'Consumidor'] },
  recorrer: { keywords: ['recurs', 'apela', 'agravo', 'embargos', 'inominado', 'recurso'], areas: ['Recursal'] },
  manifestar: { keywords: ['manifest', 'prestar informac', 'peticao intermediaria', 'parecer'], areas: ['Cível'] },
  cumprir: { keywords: ['cumpr', 'determinac', 'providenc', 'regulariz'], areas: [] },
  pagar_guia: { keywords: ['guia', 'custas', 'preparo', 'taxa', 'pagamento', 'recolhimento'], areas: ['Financeiro'] },
  juntar_documento: { keywords: ['document', 'procura', 'certidao', 'comprovante', 'substabelecimento', 'juntada'], areas: [] },
  peticao_intermediaria: { keywords: ['peticao', 'requerimento', 'habilitac', 'desistencia', 'petição'], areas: [] },
  preparar_audiencia: { keywords: ['audiencia', 'preparar', 'instrucao', 'conciliac', 'custodia'], areas: ['Audiência'] },
  cumprimento_sentenca: { keywords: ['cumprimento', 'sentenca', 'execuc', 'execução'], areas: [] },
  outro: { keywords: [], areas: [] }
});

function normalize(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/** Nome oficial do modelo (`name`) com o catálogo íntegro; ignora registros sem nome. */
export function catalogDefinitions(taskDefinitions) {
  return (Array.isArray(taskDefinitions) ? taskDefinitions : [])
    .filter(definition => definition && typeof definition === 'object')
    .map(definition => ({
      name: String(definition.name || '').trim(),
      points: Number(definition.points) || 0,
      area: String(definition.area || '').trim(),
      phase: String(definition.phase || '').trim(),
      estimatedMinutes: Number(definition.estimatedMinutes) || 0
    }))
    .filter(definition => definition.name);
}

/**
 * Item do catálogo para a natureza escolhida, ou `null` quando nenhum modelo do escritório casa —
 * nesse caso a UI pede a escolha humana e o servidor nunca cria tarefa com nome inventado.
 */
export function mapPublicationActionToTaskDefinition({ action = '', taskDefinitions = [] } = {}) {
  const natureza = String(action || '').trim();
  const regra = PUBLICATION_ACTION_RULES[natureza];
  const catalogo = catalogDefinitions(taskDefinitions);
  if (!regra || catalogo.length === 0) return null;
  if (natureza === 'outro' || regra.keywords.length === 0) return null;
  const areas = regra.areas.map(normalize);
  const pontuados = catalogo.map((definition, index) => {
    const nome = normalize(definition.name);
    let score = 0;
    const casadas = [];
    for (const palavra of regra.keywords) {
      if (nome.includes(normalize(palavra))) {
        score += 3;
        casadas.push(palavra);
      }
    }
    if (score > 0 && areas.includes(normalize(definition.area))) score += 1;
    return { definition, index, score, casadas };
  }).filter(item => item.score > 0);
  if (pontuados.length === 0) return null;
  // Empate resolve pela ordem do catálogo: mesma entrada, mesma saída (auditável e testável).
  pontuados.sort((left, right) => (right.score - left.score) || (left.index - right.index));
  const vencedor = pontuados[0];
  return {
    name: vencedor.definition.name,
    points: vencedor.definition.points,
    area: vencedor.definition.area,
    matchedBy: vencedor.casadas.slice(0, 3).join(', ')
  };
}

/**
 * Título da tarefa criada: sempre o nome exato do modelo do catálogo (nunca texto do modelo de IA).
 * A providência entra na descrição como contexto humano-legível, junto da **referência** da data
 * declarada pela fonte quando existir — referência não é prazo: o campo `deadline` continua vazio
 * (decisão do operador, 2026-09-30) e o valor fica em `sourceDeadlineReference` para consulta.
 */
export function buildProvidenciaTask({ definitionName = '', action = '', publication = {}, sourceDeadlineReference = '', contextBlock = '' } = {}) {
  const titulo = String(definitionName || '').trim();
  if (!titulo) return null;
  const rotulo = PUBLICATION_ACTION_LABELS[String(action || '').trim()] || 'Providência';
  const publicacao = String(publication?.title || publication?.event || publication?.id || '').trim().slice(0, 160);
  const referencia = String(sourceDeadlineReference || '').trim();
  const referenciaLegivel = /^\d{4}-\d{2}-\d{2}/.test(referencia)
    ? `${referencia.slice(8, 10)}/${referencia.slice(5, 7)}/${referencia.slice(0, 4)}`
    : referencia;
  const contexto = `Providência "${rotulo}"${publicacao ? ` a partir da publicação: ${publicacao}` : ''}. Criada do prazo à providência — prazo em branco, para conferência humana.`;
  const notaReferencia = referenciaLegivel
    ? ` Referência da fonte: ${referenciaLegivel} (não é o prazo; registre a data se ela continuar valendo).`
    : '';
  // Bloco de contexto determinístico (3 a 5 linhas, cada uma com a origem declarada).
  const bloco = String(contextBlock || '').slice(0, 2_000);
  return {
    title: titulo,
    description: `${contexto}${notaReferencia}${bloco}`,
    sourceDeadlineReference: referencia,
    deadline: '',
    fatalDeadline: '',
    status: 'triagem',
    priority: 'normal',
    timeLogs: [],
    history: []
  };
}
