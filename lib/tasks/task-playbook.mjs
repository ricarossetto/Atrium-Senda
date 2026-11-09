/**
 * ATRIUM — Playbook de providências por ato (publicação → rascunhos de tarefa).
 *
 * Determinístico e sem modelo: a partir do **ato** da publicação (e do catálogo do escritório),
 * propõe as providências típicas daquele ato, cada uma já mapeada para um item EXISTENTE de
 * `configuration.taskDefinitions` pelo mesmo mapeador do fluxo "do prazo à providência"
 * (`publication-action-map.mjs`). O nome da tarefa nunca é inventado: quando nenhum item do
 * catálogo casa, a providência sai sem modelo e a pessoa escolhe.
 *
 * Cada item é um **rascunho**: prazo em branco, sem prazo fatal, status triagem (§16) — a criação
 * continua sendo uma confirmação humana item a item (ou em lote pelo alerta de risco).
 */

import {
  PUBLICATION_ACTION_IDS,
  PUBLICATION_ACTION_LABELS,
  catalogDefinitions,
  mapPublicationActionToTaskDefinition,
  buildProvidenciaTask
} from './publication-action-map.mjs';
import { buildActRemedies, findModel, relatedBaseTitles } from './act-remedies.mjs';

export const PLAYBOOK_MAX_ITEMS = 5;

/**
 * Regras por ato: palavras-chave no rótulo do ato (ou no título da publicação) decidem quais
 * providências entram no playbook. Ordem = prioridade de apresentação.
 */
const ACT_RULES = Object.freeze([
  { action: 'contestar', keywords: ['contestac', 'contest', 'defesa', 'impugnac', 'embargos de declaracao nao'] },
  { action: 'recorrer', keywords: ['recurso', 'apelac', 'agravo', 'embargos', 'inominado', 'recursal'] },
  { action: 'preparar_audiencia', keywords: ['audiencia', 'instrucao', 'conciliac', 'custodia', 'una'] },
  { action: 'cumprimento_sentenca', keywords: ['cumprimento', 'execuc', 'execução', 'sentenca', 'liquida'] },
  { action: 'pagar_guia', keywords: ['custas', 'preparo', 'guia', 'taxa', 'recolhimento', 'dare', 'grerj'] },
  { action: 'juntar_documento', keywords: ['juntada', 'document', 'procurac', 'certidao', 'comprovante', 'substabelecimento'] },
  { action: 'manifestar', keywords: ['manifestac', 'manifest', 'intimac', 'intima', 'ciencia', 'informac', 'parecer'] },
  { action: 'cumprir', keywords: ['despacho', 'determinac', 'cumprir', 'providenc', 'regulariz', 'emenda'] },
  { action: 'peticao_intermediaria', keywords: ['peticao', 'requerimento', 'habilitac', 'desistencia', 'juntada de peticao'] }
]);

function normalize(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/** Naturezas do playbook para um ato — determinístico e estável para a mesma entrada. */
export function mapActToPlaybookActions(actLabel, { max = PLAYBOOK_MAX_ITEMS } = {}) {
  const texto = normalize(actLabel);
  if (!texto) return [];
  const acoes = [];
  for (const regra of ACT_RULES) {
    if (!regra.keywords.some(palavra => texto.includes(normalize(palavra)))) continue;
    if (PUBLICATION_ACTION_IDS.includes(regra.action) && !acoes.includes(regra.action)) acoes.push(regra.action);
  }
  // "Cumprimento" e "execução" também casam com juntar documento/manifestar em textos longos:
  // a ordem das regras já prioriza o ato mais específico, e o corte mantém o playbook enxuto.
  return acoes.slice(0, Math.max(1, Number(max) || PLAYBOOK_MAX_ITEMS));
}

/**
 * Playbook da publicação: itens prontos para virar tarefa, com o modelo do catálogo quando houver.
 * `definition: null` significa "escolha o modelo" — nunca um nome inventado.
 */
export function buildPublicationPlaybook({ publication = {}, taskDefinitions = [], maxItems = PLAYBOOK_MAX_ITEMS } = {}) {
  // A data da fonte às vezes vem no campo do evento: "06/10/2026 23:59:59" não é ato.
  const ato = [publication?.event, publication?.subject, publication?.title]
    .map(part => String(part || '').trim())
    .find(part => part && !/^\d{2}\/\d{2}\/\d{4}/.test(part)) || '';
  const texto = String(publication?.fullText || publication?.text || publication?.sourceText || publication?.description || '');
  const catalogo = catalogDefinitions(taskDefinitions);
  const analise = buildActRemedies({
    label: [publication?.event, publication?.subject, publication?.title].map(part => String(part || '')).join(' · '),
    text: texto,
    processNumber: publication?.process || publication?.processNumber || publication?.number || ''
  });

  const toItem = ({ action, label, legal = '', base = '', models = [] }, { fallbackToAction = true } = {}) => {
    const modelo = findModel(models, catalogo);
    const definition = modelo || (fallbackToAction && !models.length
      ? mapPublicationActionToTaskDefinition({ action, taskDefinitions: catalogo })
      : null);
    const rascunho = definition
      ? buildProvidenciaTask({ definitionName: definition.name, action, publication })
      : null;
    return {
      action,
      label,
      legal,
      base,
      definition: definition ? { name: definition.name, points: definition.points, area: definition.area } : null,
      draft: rascunho ? { title: rascunho.title, deadline: rascunho.deadline } : null
    };
  };

  let items = analise.items.map(item => toItem(item));
  if (!items.length && analise.kind === 'desconhecido') {
    // Sem tipo de ato no texto, só um rótulo específico decide. "Intimação" sozinha não diz nada.
    const especifico = ato.replace(/intima[çc][ãa]o|notifica[çc][ãa]o|ci[êe]ncia|outros/gi, ' ');
    items = mapActToPlaybookActions(especifico, { max: maxItems })
      .map(action => toItem({ action, label: PUBLICATION_ACTION_LABELS[action] || action }));
  }

  return {
    act: ato.slice(0, 160),
    actKind: analise.kind,
    actLabel: analise.actLabel,
    reason: analise.reason,
    note: analise.note,
    references: relatedBaseTitles(texto),
    items: items.slice(0, Math.max(1, Number(maxItems) || PLAYBOOK_MAX_ITEMS))
  };
}
