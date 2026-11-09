import { createHash } from 'node:crypto';
import { getPjeProfileForPortal } from '../profiles/tjmt.mjs';
import { reconcilePjeCollection, PJE_COLLECTION_STATES } from './standard-painel.mjs';

const CNJ_RE = /\b\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}\b/;

const EXPEDIENTE_ID_PATTERNS = Object.freeze([
  /(?:id|nu|num|cod(?:igo)?)[_.-]?expediente[_.-]?(?:id)?[=:'"(\s]+(\d{4,})/i,
  /expediente[_.-]?id[=:'"(\s]+(\d{4,})/i
]);

// Fingerprint determinístico do expediente: processo + órgão + datas estruturais.
// Texto mutável da linha (links, contadores, ordem de tabela) nunca entra na identidade.
function expedienteFingerprint(record) {
  const parts = [
    record.processNumber,
    record.orgaoJulgador,
    record.createdAt,
    record.audienciaAt,
    record.cienciaAt,
    record.prazoFinal
  ].map(value => collapse(value));
  return `fp:${createHash('sha1').update(parts.join('|')).digest('hex').slice(0, 20)}`;
}

export const PJE_JT_ROUTES = Object.freeze({
  home: '/pjekz/painel/usuario-externo?ocultarAvisos=true',
  acervo: '/pjekz/painel/usuario-externo/acervo-geral',
  expedientes: '/pjekz/painel/usuario-externo/pendentes-manifestacao'
});

function collapse(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function stripLabel(text, label) {
  const normalized = collapse(text);
  const index = normalized.toLowerCase().indexOf(label.toLowerCase());
  if (index < 0) return normalized;
  return normalized.slice(index + label.length).trim();
}

function extractDates(text) {
  return collapse(text).match(/\b\d{2}\/\d{2}\/\d{4}\b/g) || [];
}

// A célula "Processo" traz "Audiência em: dd/mm/aaaa hh:mm"; a coluna própria repete o dado.
// Sem nenhum dos dois marcadores não há audiência: a data da autuação nunca pode virar audiência.
function extractAcervoHearing(normalized) {
  const match = normalized.match(/Audi[êe]ncia\s+em:?\s*(\d{2}\/\d{2}\/\d{4})(?:\s+(\d{2}:\d{2}))?/i)
    || normalized.match(/Data\s+da\s+Audi[êe]ncia\s+(\d{2}\/\d{2}\/\d{4})(?:\s+(\d{2}:\d{2}))?/i);
  if (!match) return null;
  const [day, month, year] = match[1].split('/');
  const time = match[2] || '';
  return { date: match[1], time, scheduledAt: `${year}-${month}-${day}${time ? `T${time}:00` : ''}` };
}

function extractAcervoParties(normalized) {
  const marker = normalized.search(/Audi[êe]ncia\s+em\b/i);
  if (marker < 0) return '';
  const beforeMarker = normalized.slice(0, marker);
  const lastCnj = [...beforeMarker.matchAll(new RegExp(CNJ_RE.source, 'g'))].pop();
  if (!lastCnj) return '';
  const parties = beforeMarker.slice(lastCnj.index + lastCnj[0].length).replace(/^\s*partes:?\s*/i, '').trim();
  return /\sx\s/i.test(parties) ? parties.slice(0, 300) : '';
}

function extractAcervoCourt(normalized) {
  return normalized.match(/(?:\d+ª\s+)?VARA\s+DO\s+TRABALHO\s+DE\s+[A-ZÀ-Ý ]+?(?=\s+(?:\d+ª\s+)?VARA\s|\s+[A-Z]{3}\d|\s+Data\b|\s+\d{2}\/|$)/)?.[0] || '';
}

export function parsePjeJtAcervoRow(text) {
  const normalized = collapse(text);
  const processNumber = normalized.match(CNJ_RE)?.[0];
  if (!processNumber) return null;
  const classe = normalized.match(/([A-Za-zÀ-ÿ]+)\s*\d{7}-\d{2}\./)?.[1] || '';
  const hearing = extractAcervoHearing(normalized);
  return {
    hearing: hearing ? { ...hearing, parties: extractAcervoParties(normalized), court: extractAcervoCourt(normalized) } : null,
    processNumber,
    classe,
    orgaoJulgador: stripLabel(normalized, 'Órgão Julgador').split('Data da Audiência')[0].trim().slice(0, 200),
    dataAudiencia: hearing?.date || '',
    dataAutuacao: extractDates(stripLabel(normalized, 'Data da Autuação'))[0] || '',
    segredoOuPrioridade: /segredo|prioridade/i.test(normalized),
    summary: normalized.slice(0, 500)
  };
}

export function parsePjeJtExpedienteRow(text, { externalId = '' } = {}) {
  const normalized = collapse(text);
  const processNumber = normalized.match(CNJ_RE)?.[0];
  if (!processNumber) return null;
  const createdAt = extractDates(stripLabel(normalized, 'Data de Criação').split('Data da Audiência')[0])[0] || '';
  const cienciaAt = extractDates(stripLabel(normalized, 'Data da Ciência').split('Prazo Final')[0])[0] || '';
  const prazoFinal = extractDates(stripLabel(normalized, 'Prazo Final'))[0] || '';
  const audienciaAt = extractDates(stripLabel(normalized, 'Data da Audiência').split('Data da Ciência')[0])[0] || '';
  const record = {
    processNumber,
    orgaoJulgador: stripLabel(normalized, 'Órgão Julgador').split('Data de Criação')[0].trim().slice(0, 200),
    createdAt,
    audienciaAt,
    cienciaAt,
    prazoFinal,
    scienceAutomatic: /ciência automática|ciencia automatica/i.test(normalized),
    summary: normalized.slice(0, 500)
  };
  const stableId = String(externalId || '').trim();
  record.expedienteIdentity = stableId ? `id:${stableId}` : expedienteFingerprint(record);
  return record;
}

async function settle(page, ms) {
  await page.waitForLoadState('domcontentloaded', { timeout: 20_000 }).catch(() => {});
  await page.waitForTimeout(ms);
}

async function clickCardByText(page, text) {
  const card = page.locator('mat-card', { hasText: text }).first();
  const count = await card.count().catch(() => 0);
  if (!count) return false;
  // Clique que falha (interceptado, destacado, timeout) nao pode contar como
  // sucesso: sem isso o coletor acredita que navegou e nunca tenta o goto direto.
  try {
    await card.click({ timeout: 10_000 });
  } catch {
    return false;
  }
  return true;
}

export async function readPjeJtCardCounters(page) {
  return page.evaluate(() => {
    const result = {};
    for (const card of document.querySelectorAll('mat-card')) {
      const text = (card.innerText || '').replace(/\s+/g, ' ').trim();
      const match = text.match(/^(\d{1,5})\s+(Acervo Geral|Meus Expedientes|Arquivados)/i);
      const reversed = match ? null : text.match(/^(Acervo Geral|Meus Expedientes|Arquivados)\s+(\d{1,5})\b/i);
      const label = match?.[2] || reversed?.[1];
      if (!label) continue;
      const count = Number(match?.[1] ?? reversed?.[2]);
      result[label.toLowerCase() === 'acervo geral' ? 'acervo' : label.toLowerCase() === 'meus expedientes' ? 'expedientes' : 'arquivados'] = count;
    }
    return result;
  }).catch(() => ({}));
}

// Estrutura observada da pagina authentica: contagens por tag, classes e ids.
// Sem texto de expediente, nome de parte ou qualquer PII; apenas a forma do DOM,
// que e o que permite diagnosticar "a tabela nao existe" vs "a tabela mudou".
export function readPjeJtStructure(page) {
  return page.evaluate(() => {
    const visible = el => Boolean(el && el.getClientRects().length);
    const count = selector => document.querySelectorAll(selector).length;
    const cnjText = document.body.innerText || '';
    const visibleTables = [...document.querySelectorAll('table')].filter(visible);
    // Tamanho do texto das tabelas, sem copiar conteudo: separa "tabela vazia"
    // (estado vazio real) de "tabela populada sem CNJ" (formato inesperado).
    const tableTextLen = visibleTables.reduce((sum, table) => sum + String(table.innerText || '').length, 0);
    // Cards da home: o contador expected so existe se o regex casar. Registrar
    // quantos cards ha e quantos casam, sem copiar texto (que pode ter PII).
    const cardProbe = [...document.querySelectorAll('mat-card')].map(card => {
      const text = (card.innerText || '').replace(/\s+/g, ' ').trim();
      return {
        matched: /^(\d{1,5})\s+(Acervo Geral|Meus Expedientes|Arquivados)|^(Acervo Geral|Meus Expedientes|Arquivados)\s+\d{1,5}\b/i.test(text),
        textLen: text.length
      };
    });
    return {
      url: location.href,
      title: String(document.title || '').slice(0, 160),
      tableTextLen,
      cardProbe: cardProbe.slice(0, 12),
      counts: {
        tables: count('table'),
        visibleTables: visibleTables.length,
        tr: count('tr'),
        visibleTr: [...document.querySelectorAll('tr')].filter(visible).length,
        roleRow: count('[role="row"]'),
        matRow: count('mat-row'),
        matCard: count('mat-card'),
        anchors: count('a'),
        cnjOnPage: (cnjText.match(/\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}/g) || []).length
      },
      rowTags: [...new Set([...document.querySelectorAll('tr > *, [role="row"] > *, mat-row > *')]
        .filter(visible).map(el => el.tagName.toLowerCase()))].slice(0, 24),
      sampleIds: [...new Set([...document.querySelectorAll('[id]')]
        .map(el => String(el.id || '')).filter(id => id && id.length < 60))].slice(0, 30),
      sampleClasses: [...new Set([...document.querySelectorAll('[class]')]
        .flatMap(el => String(el.className || '').split(/\s+/)).filter(c => c && c.length < 48))].slice(0, 30)
    };
  }).catch(error => ({ error: String(error?.message || error) }));
}

export function readPjeJtRows(page) {
  return page.evaluate(() => {
    const collapse = value => (value || '').replace(/\s+/g, ' ').trim();
    const ID_PATTERNS = [
      /(?:id|nu|num|cod(?:igo)?)[_.-]?expediente[_.-]?(?:id)?[=:'"(\s]+(\d{4,})/i,
      /expediente[_.-]?id[=:'"(\s]+(\d{4,})/i
    ];
    const externalIdFor = (row, links) => {
      const candidates = [String(row.id || '')];
      for (const link of links) candidates.push(link.href, link.onclick, link.id, ...(link.data || []));
      for (const candidate of candidates) {
        if (!/expediente/i.test(candidate)) continue;
        for (const pattern of ID_PATTERNS) {
          const match = candidate.match(pattern);
          if (match) return match[1];
        }
      }
      return '';
    };
    const tables = [...document.querySelectorAll('table')].filter(table => table.getClientRects().length);
    const rows = [];
    for (const table of tables) {
      const prettyRows = [...table.querySelectorAll('tr')].filter(row => row.getClientRects().length);
      for (const row of prettyRows) {
        const text = collapse(row.innerText);
        if (!/\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}/.test(text)) continue;
        const links = [...row.querySelectorAll('a')].slice(0, 3).map(link => ({
          href: String(link.getAttribute('href') || '').slice(0, 160),
          onclick: String(link.getAttribute('onclick') || '').slice(0, 160),
          id: link.id || '',
          data: Object.values(link.dataset || {}).map(value => String(value || '').slice(0, 160))
        }));
        rows.push({
          id: String(row.id || ''),
          externalId: externalIdFor(row, links),
          text: text.slice(0, 800),
          links
        });
      }
    }
    return rows.slice(0, 500);
  }).catch(() => []);
}

const NEXT_PAGE_MARK = 'data-atrium-next-page';

/**
 * Marca o botão de próxima página. O portal pode identificar o botão só pela dica (tooltip),
 * que não vira atributo, ou só pelo ícone; por isso a busca não depende de um seletor fixo.
 * Ícone só vale perto do texto de paginação, para não confundir com botão de menu.
 * Quando nada casa, devolve o rótulo dos últimos botões fora das linhas, sem texto de processo.
 */
export function markPjeJtNextPage(page) {
  return page.evaluate(mark => {
    const collapse = value => (value || '').replace(/\s+/g, ' ').trim();
    const RANGE = /\d+\s*(?:-|–|a|até)\s*\d+\s*(?:de|of)\s*\d+/i;
    document.querySelectorAll(`[${mark}]`).forEach(element => element.removeAttribute(mark));
    const tooltipOf = button => (button.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean)
      .map(id => document.getElementById(id)?.textContent || '').join(' ');
    const labelOf = button => collapse([
      button.getAttribute('aria-label'),
      button.getAttribute('title'),
      button.getAttribute('mattooltip'),
      button.getAttribute('ng-reflect-message'),
      tooltipOf(button)
    ].filter(Boolean).join(' '));
    const iconOf = button => collapse([...button.querySelectorAll('i, mat-icon, svg, span')]
      .map(icon => `${icon.getAttribute('class') || ''} ${icon.tagName === 'MAT-ICON' ? icon.textContent : ''}`).join(' '));
    const buttons = [...document.querySelectorAll('button, a[role="button"]')]
      .filter(button => button.getClientRects().length && !button.closest('tr'));
    const nearPagination = button => {
      let node = button.parentElement;
      for (let depth = 0; node && depth < 5; depth += 1, node = node.parentElement) {
        const text = node.innerText || '';
        if (text.length < 400 && (RANGE.test(text) || /p[aá]gina/i.test(text))) return true;
      }
      return false;
    };
    const isDisabled = button => button.disabled === true
      || button.getAttribute('aria-disabled') === 'true'
      || /(^|\s)(mat-button-disabled|disabled)(\s|$)/.test(button.getAttribute('class') || '');
    let target = buttons.find(button => /next/i.test(button.getAttribute('class') || '') && /paginat|paginad/i.test(button.getAttribute('class') || ''));
    let matchedBy = target ? 'class' : '';
    if (!target) {
      target = buttons.find(button => {
        const label = labelOf(button);
        return /pr[oó]xim|seguinte|\bnext\b|avan[cç]ar/i.test(label) && !/[uú]ltim|\blast\b/i.test(label);
      });
      if (target) matchedBy = 'label';
    }
    if (!target) {
      const byIcon = buttons.filter(button => {
        const icon = iconOf(button);
        return /fa-(?:angle|chevron)-right|chevron_right|navigate_next|keyboard_arrow_right/i.test(icon)
          && !/double|last_page/i.test(icon)
          && nearPagination(button);
      });
      target = byIcon[byIcon.length - 1];
      if (target) matchedBy = 'icon';
    }
    const ranges = [...new Set(((document.body.innerText || '').match(new RegExp(RANGE.source, 'gi')) || []))].slice(0, 3);
    if (target) target.setAttribute(mark, '1');
    return {
      found: Boolean(target),
      matchedBy,
      disabled: target ? isDisabled(target) : false,
      ranges,
      candidates: target ? [] : buttons.slice(-12).map(button => ({
        label: labelOf(button).slice(0, 60),
        icon: iconOf(button).slice(0, 80),
        classes: String(button.getAttribute('class') || '').slice(0, 80),
        disabled: isDisabled(button)
      }))
    };
  }, NEXT_PAGE_MARK).catch(() => null);
}

/**
 * A tabela do PJe-JT mostra dez linhas por página. Ler só a primeira deixava a coleta
 * eternamente parcial. Avança apenas pelo botão de próxima página, que é navegação de leitura.
 * `diagnostics` recebe quantas páginas foram lidas e por que a leitura parou, sem conteúdo de processo.
 */
export async function collectPjeJtRowPages(page, { maxPages = 60, waitMs = 8_000, stepMs = 250, diagnostics = {} } = {}) {
  const seen = new Set();
  const rows = [];
  const stop = reason => {
    diagnostics.stopReason = reason;
    diagnostics.rows = rows.length;
  };
  diagnostics.pages = 0;
  for (let pageNumber = 0; pageNumber < maxPages; pageNumber += 1) {
    const current = await readPjeJtRows(page);
    diagnostics.pages += 1;
    for (const row of current) {
      if (seen.has(row.text)) continue;
      seen.add(row.text);
      rows.push(row);
    }
    if (typeof page.locator !== 'function') {
      stop('sem_paginador');
      break;
    }
    const marked = await markPjeJtNextPage(page);
    if (marked && !Array.isArray(marked)) {
      diagnostics.matchedBy = marked.matchedBy;
      diagnostics.ranges = marked.ranges;
      diagnostics.candidates = marked.candidates;
      if (!marked.found) {
        stop('botao_nao_encontrado');
        break;
      }
      if (marked.disabled) {
        stop('ultima_pagina');
        break;
      }
    }
    const next = page.locator(`[${NEXT_PAGE_MARK}]`).first();
    if (!(await next.count().catch(() => 0))) {
      stop('botao_nao_encontrado');
      break;
    }
    if (await next.isDisabled().catch(() => true)) {
      stop('ultima_pagina');
      break;
    }
    const clicked = await next.click({ timeout: 10_000 }).then(() => true).catch(() => false);
    if (!clicked) {
      stop('clique_falhou');
      break;
    }
    const before = current[0]?.text || '';
    const deadline = Date.now() + waitMs;
    let changed = false;
    while (Date.now() < deadline) {
      await page.waitForTimeout(stepMs);
      const firstRow = (await readPjeJtRows(page))[0]?.text || '';
      if (firstRow && firstRow !== before) {
        changed = true;
        break;
      }
    }
    if (!changed) {
      stop('pagina_nao_mudou');
      break;
    }
    stop('limite_de_paginas');
  }
  return rows;
}

// Lista sem processo com mensagem de vazio: é "nada pendente", não falha de carregamento.
export function readPjeJtEmptyState(page) {
  return page.evaluate(() => {
    const text = document.body.innerText || '';
    if (/\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}/.test(text)) return false;
    const tableText = [...document.querySelectorAll('table')].filter(table => table.getClientRects().length).map(table => table.innerText || '').join(' ');
    return /nenhum|não há|nao ha|sem registros|não foram encontrad|nao foram encontrad|sem resultados/i.test(tableText);
  }).catch(() => false);
}

export async function loadJtRoute(page, portal, routeKey, { settleMs = 4_000 } = {}) {
  // Rastro de navegacao: cada transicao registra a URL resultante. E o que separa
  // "o clique nao mudou de pagina" de "o goto direto falhou" quando a rota cai em
  // load_timeout. Sem texto, sem PII: so passos e URLs.
  const trace = [];
  const mark = step => {
    try {
      trace.push({ step, url: String(page.url?.() || '').slice(0, 200) });
    } catch {
      trace.push({ step, url: '' });
    }
  };
  const homeUrl = new URL(PJE_JT_ROUTES.home, portal.url).href;
  const homeMarker = '/pjekz/painel/usuario-externo?';
  mark('entrada');
  if (!page.url().includes(homeMarker)) {
    await page.goto(homeUrl, { waitUntil: 'domcontentloaded', timeout: 90_000 }).catch(() => {});
    await settle(page, settleMs);
    mark('apos-home');
  }
  const label = routeKey === 'acervo' ? 'Acervo Geral' : 'Meus Expedientes';
  let counters = await readPjeJtCardCounters(page);
  mark('contadores');
  if (!Object.keys(counters).length) {
    await page.goto(homeUrl, { waitUntil: 'domcontentloaded', timeout: 90_000 }).catch(() => {});
    await settle(page, settleMs);
    counters = await readPjeJtCardCounters(page);
    mark('apos-home-retry');
  }
  const clicked = await clickCardByText(page, label);
  // Clique engolido: o card existe mas a pagina nao saiu da home (observado no TRT4:
  // apos-clique mantem /usuario-externo?). Nesse caso o goto direto e obrigatorio.
  const stillHome = page.url().includes(homeMarker);
  if (clicked && !stillHome) {
    await settle(page, settleMs + 2_000);
    mark('apos-clique');
  } else {
    if (clicked) mark('clique-engolido');
    const target = new URL(PJE_JT_ROUTES[routeKey], portal.url).href;
    // O motivo do goto importa: chrome-error sem mensagem nao diz se foi timeout,
    // abort, conexao ou resposta do servidor. Registrar, nao engolir.
    const gotoError = await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 90_000 })
      .then(() => '')
      .catch(error => String(error?.message || error).slice(0, 200));
    if (gotoError) mark('goto-erro: ' + gotoError);
    await settle(page, settleMs);
    counters = Object.keys(counters).length ? counters : await readPjeJtCardCounters(page);
    mark('apos-goto-direto');
  }
  mark('final');
  return { counters, routeUrl: page.url(), navigation: trace };
}

export async function collectPjeJtFamily(page, portal, { budget = {} } = {}) {
  const limits = { settleMs: 4_000, ...budget };
  const collectedAt = new Date().toISOString();
  const profile = getPjeProfileForPortal(portal);
  void profile;

  const acervoNavigation = await loadJtRoute(page, portal, 'acervo', { settleMs: limits.settleMs });
  const acervoStructure = await readPjeJtStructure(page);
  const acervoPagination = {};
  const acervoRows = await collectPjeJtRowPages(page, { diagnostics: acervoPagination });
  const acervoRecords = [];
  for (const row of acervoRows) {
    const record = parsePjeJtAcervoRow(row.text);
    if (!record) continue;
    if (!acervoRecords.some(item => item.processNumber === record.processNumber)) {
      acervoRecords.push({ ...record, rowId: row.id });
    }
  }
  const acervoExpected = acervoNavigation.counters.acervo ?? null;
  const acervoReconcile = acervoExpected === null
    ? { state: acervoRecords.length ? PJE_COLLECTION_STATES.LOADED : PJE_COLLECTION_STATES.LOAD_TIMEOUT, expected: null, collected: acervoRecords.length }
    : reconcilePjeCollection({ expected: acervoExpected, collected: acervoRecords.length });

  const expedientesNavigation = await loadJtRoute(page, portal, 'expedientes', { settleMs: limits.settleMs });
  const expedientesStructure = await readPjeJtStructure(page);
  const expedientesPagination = {};
  const expedienteRows = await collectPjeJtRowPages(page, { diagnostics: expedientesPagination });
  const expedientesEmpty = expedienteRows.length ? false : await readPjeJtEmptyState(page);
  const expedientes = [];
  for (const row of expedienteRows) {
    const record = parsePjeJtExpedienteRow(row.text, { externalId: row.externalId });
    if (!record) continue;
    if (!expedientes.some(item => item.expedienteIdentity === record.expedienteIdentity)) {
      expedientes.push({ ...record, rowId: row.id });
    }
  }
  const expedienteExpected = expedientesNavigation.counters.expedientes ?? null;
  const expedienteReconcile = expedienteExpected === null
    ? { state: expedientes.length ? PJE_COLLECTION_STATES.LOADED : expedientesEmpty ? PJE_COLLECTION_STATES.EMPTY_CONFIRMED : PJE_COLLECTION_STATES.LOAD_TIMEOUT, expected: null, collected: expedientes.length }
    : reconcilePjeCollection({ expected: expedienteExpected, collected: expedientes.length });

  const processMap = new Map();
  for (const record of [...expedientes, ...acervoRecords]) {
    if (!record.processNumber || processMap.has(record.processNumber)) continue;
    processMap.set(record.processNumber, {
      processNumber: record.processNumber,
      summary: record.summary,
      dates: [record.dataAudiencia, record.dataAutuacao, record.createdAt, record.cienciaAt, record.prazoFinal].filter(Boolean),
      lastDate: record.prazoFinal || record.dataAutuacao || record.dataAudiencia || '',
      rowId: record.rowId || ''
    });
  }

  return {
    portalId: portal?.id || '',
    portalName: portal?.name || '',
    layoutFamily: 'trabalhista',
    collectorKey: 'trabalhista',
    collectedAt,
    counters: { acervo: acervoExpected, expedientes: expedienteExpected },
    // Estrutura observada por rota: e o que separa "a tabela nao existe" de
    // "a tabela mudou de forma" quando o estado cai em load_timeout.
    structure: {
      acervo: { ...acervoStructure, pagination: acervoPagination, expected: acervoExpected, collected: acervoRecords.length },
      expedientes: { ...expedientesStructure, emptyMessage: expedientesEmpty, pagination: expedientesPagination }
    },
    // Rastro de navegacao por rota: separa "o clique nao saiu da home" de
    // "o goto direto falhou" sem precisar reproduzir a sessao autenticada.
    navigation: { acervo: acervoNavigation.navigation || [], expedientes: expedientesNavigation.navigation || [] },
    routes: {
      acervo: acervoNavigation.routeUrl,
      expedientes: expedientesNavigation.routeUrl
    },
    acervo: {
      section: 'acervo',
      state: acervoReconcile.state,
      nodes: [],
      processes: acervoRecords,
      reconciliation: acervoReconcile,
      totals: { processes: acervoRecords.length, expected: acervoExpected },
      url: acervoNavigation.routeUrl,
      capturedAt: collectedAt
    },
    expedientes: {
      section: 'expedientes',
      state: expedienteReconcile.state,
      situations: [],
      groups: [],
      expedientes,
      processes: [...processMap.values()],
      reconciliation: expedienteReconcile,
      totals: { expedientes: expedientes.length, processes: processMap.size, expected: expedienteExpected },
      url: expedientesNavigation.routeUrl,
      capturedAt: collectedAt
    },
    processes: [...processMap.values()]
  };
}

export const pjeJtInternals = Object.freeze({
  parsePjeJtAcervoRow,
  parsePjeJtExpedienteRow,
  CNJ_RE
});
