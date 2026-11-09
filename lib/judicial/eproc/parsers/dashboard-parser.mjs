/**
 * ATRIUM Sovereign Judicial Connectivity — Eproc Dashboard & Action Map Parser
 *
 * Implements the Report-First / Index Hub navigation model for the eproc Lawyer Panel
 * (Painel do Advogado, 1º e 2º Graus). Parses counters, indicator blocks, and discovers
 * official action endpoints dynamically without hardcoding session hashes.
 */

/**
 * Read-Only Allowlist: Official eproc actions that the collector is permitted to execute.
 * All other actions are blocked by the safety gate.
 */
export const READ_ONLY_ALLOWED_ACTIONS = Object.freeze([
  'relatorio_processo_procurador_listar',
  'relatorio_processo_gerar_planilha',
  'processo_ultimas_movimentacoes_listar',
  'citacao_intimacao_prazo_aberto_listar',
  'citacao_intimacao_prazo_aberto_gerar_planilha',
  'citacao_intimacao_decurso_prazo_listar',
  'audiencia_listar',
  'audiencia_conciliacao_listar',
  'intimacao_de_pauta_listar',
  'custas_pagar_listar',
  'deposito_judicial_aberto_listar',
  'recurso_tribunal_listar',
  'processo_seleciona_publica',
  'processo_consultar',
  'processo_arvore_documento',
  'processo_documento',
  'acessar_documento',
  'painel_adv_listar'
]);

/**
 * Prohibited Write Actions: Any action that could alter procedural status,
 * file a petition, sign, acknowledge notice (dar ciência), or produce legal effects.
 */
export const PROHIBITED_WRITE_ACTIONS = Object.freeze([
  'peticao_inicial_montar',
  'peticao_intercorrente_montar',
  'peticionar',
  'protocolar',
  'assinar',
  'confirmar_intimacao',
  'dar_ciencia',
  'abrir_prazo',
  'receber_citacao',
  'transmissao'
]);

/**
 * Validates that an action is strictly read-only and safe for automated execution.
 * Throws a JudicialSafetyError with isScienceRisk: true if the action is write-capable.
 *
 * @param {string} actionName Canonical action string
 * @returns {boolean} True if permitted
 */
export function assertJudicialActionSafe(actionName) {
  const norm = String(actionName || '').trim().toLowerCase();
  if (!norm) {
    throw Object.assign(new Error('Ação judicial não especificada para validação de segurança.'), {
      code: 'INVALID_ACTION_NAME',
      isScienceRisk: true
    });
  }

  const isProhibited = PROHIBITED_WRITE_ACTIONS.some(p => norm.includes(p));
  if (isProhibited) {
    throw Object.assign(
      new Error(`OPERAÇÃO JUDICIAL PROIBIDA: Ação "${actionName}" é uma operação de escrita, peticionamento, ciência ou protocolo judicial e NÃO PODE ser executada pelo coletor ATRIUM.`),
      {
        code: 'PROHIBITED_JUDICIAL_WRITE_OPERATION',
        isScienceRisk: true,
        actionName
      }
    );
  }

  const isAllowed = READ_ONLY_ALLOWED_ACTIONS.includes(norm);
  if (!isAllowed) {
    throw Object.assign(
      new Error(`OPERAÇÃO JUDICIAL NÃO AUTORIZADA: Ação "${actionName}" não consta na allowlist de leitura do ATRIUM.`),
      {
        code: 'UNAUTHORIZED_JUDICIAL_ACTION',
        isScienceRisk: true,
        actionName
      }
    );
  }

  return true;
}

/**
 * Safe execution gate for judicial actions.
 * Enforces DEFAULT DENY via assertJudicialActionSafe BEFORE performing any HTTP request or page navigation.
 *
 * @param {string} actionName Canonical action string
 * @param {Object} [options]
 * @param {Function} [options.requestFn] Custom request executor callback (async)
 * @param {import('playwright').Page} [options.page] Playwright page for navigation
 * @param {string} [options.baseUrl] Base URL for action
 * @returns {Promise<Object>} Execution result
 */
export async function executeJudicialAction(actionName, { requestFn, page, baseUrl, ...extra } = {}) {
  // STRICT READ-ONLY GATE: Must pass assertJudicialActionSafe BEFORE any network or page action
  assertJudicialActionSafe(actionName);

  if (typeof requestFn === 'function') {
    return await requestFn(actionName, { baseUrl, ...extra });
  }

  if (page && typeof page.goto === 'function') {
    const url = baseUrl ? `${baseUrl.replace(/\/$/, '')}/controlador.php?acao=${encodeURIComponent(actionName)}` : `controlador.php?acao=${encodeURIComponent(actionName)}`;
    const response = await page.goto(url);
    return {
      ok: response?.ok() ?? true,
      action: actionName,
      status: response?.status() ?? 200,
      url
    };
  }

  return {
    ok: true,
    action: actionName,
    executed: true,
    readOnly: true
  };
}

function cleanText(value) {
  return String(value || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function parseCount(text) {
  const m = String(text || '').match(/\b\d+\b/);
  return m ? parseInt(m[0], 10) : 0;
}

/**
 * Parses the lawyer panel HTML into a structured navigation and counter map.
 *
 * @param {string} html Raw HTML of painel_adv_listar
 * @param {Object} [options]
 * @param {string} [options.portalId]
 * @returns {Object} Structured dashboard action model
 */
export function parseEprocDashboardActions(html, options = {}) {
  if (!html || typeof html !== 'string') {
    return {
      counters: {},
      actions: {},
      portalId: options.portalId || 'eproc-generic',
      extractedAt: new Date().toISOString()
    };
  }

  const portalId = options.portalId || 'eproc-generic';
  const extractedAt = new Date().toISOString();

  const counters = {
    openDeadlines: 0,
    urgentDeadlines: 0,
    pendingNotices: 0,
    pendingUrgentNotices: 0,
    agreementNotices: 0,
    cpc334Notices: 0,
    elapsedDeadlines30d: 0,
    deadlinesExpiringToday: 0,
    futureHearings: 0,
    futureConciliations: 0,
    costsToPay: 0,
    openDeposits: 0,
    courtAppeals: 0
  };

  const actions = {};

  function registerAction(key, { actionType, canonicalAction, count, href, label }) {
    if (typeof count === 'number') {
      counters[key] = count;
    }
    const cleanAction = String(canonicalAction || '').toLowerCase();
    const isSafeToExecute = READ_ONLY_ALLOWED_ACTIONS.includes(cleanAction);
    const isWriteOp = PROHIBITED_WRITE_ACTIONS.some(p => cleanAction.includes(p));

    actions[key] = {
      actionType,
      canonicalAction,
      count: typeof count === 'number' ? count : undefined,
      href: href || '',
      label: label || key,
      portalId,
      discoveredAt: extractedAt,
      isExecutable: isSafeToExecute && !isWriteOp,
      isWriteOperation: isWriteOp,
      safetyCategory: isWriteOp ? 'PROHIBITED_WRITE' : (isSafeToExecute ? 'READ_ONLY_ALLOWED' : 'UNVERIFIED_ACTION')
    };
  }

  // 1. Top navigation / header links
  const topLinks = [
    {
      regex: /href=["']([^"']*acao=relatorio_processo_procurador_listar[^"']*)["'][^>]*>([\s\S]*?)<\/a>/i,
      key: 'processReport',
      actionType: 'PROCESS_REPORT',
      canonicalAction: 'relatorio_processo_procurador_listar',
      label: 'Relação de processos'
    },
    {
      regex: /href=["']([^"']*acao=processo_ultimas_movimentacoes_listar[^"']*)["'][^>]*>([\s\S]*?)<\/a>/i,
      key: 'lastMovements',
      actionType: 'LAST_MOVEMENTS',
      canonicalAction: 'processo_ultimas_movimentacoes_listar',
      label: 'Últimas movimentações'
    },
    {
      regex: /href=["']([^"']*acao=peticao_inicial_montar[^"']*)["'][^>]*>([\s\S]*?)<\/a>/i,
      key: 'initialPetition',
      actionType: 'INITIAL_PETITION',
      canonicalAction: 'peticao_inicial_montar',
      label: 'Petição inicial'
    }
  ];

  for (const t of topLinks) {
    const match = html.match(t.regex);
    if (match) {
      registerAction(t.key, {
        actionType: t.actionType,
        canonicalAction: t.canonicalAction,
        href: match[1],
        label: t.label
      });
    }
  }

  // 2. Table row matches in Citações/Intimações, Audiências, Financeiro, etc.
  const trMatches = [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)];
  for (const tr of trMatches) {
    const rowContent = tr[1];
    const tdMatches = [...rowContent.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)];
    if (tdMatches.length >= 2) {
      const colLabelHtml = tdMatches[0][1];
      const colLabel = cleanText(colLabelHtml);
      const colValHtml = tdMatches[1][1];
      const colVal = parseCount(cleanText(colValHtml));

      // Extract href from either label cell or value cell
      const hrefMatch = (colValHtml + ' ' + colLabelHtml).match(/href=["']([^"']+)["']/i);
      const href = hrefMatch ? hrefMatch[1] : '';
      const canonicalMatch = href.match(/acao=([a-zA-Z0-9_]+)/);
      const canonicalAction = canonicalMatch ? canonicalMatch[1] : '';

      if (/Processos com prazo em aberto - urgente/i.test(colLabel)) {
        registerAction('urgentDeadlines', {
          actionType: 'URGENT_DEADLINES',
          canonicalAction: canonicalAction || 'citacao_intimacao_prazo_aberto_listar',
          count: colVal,
          href,
          label: 'Processos com prazo em aberto - urgente'
        });
      } else if (/Processos com prazo em aberto/i.test(colLabel)) {
        registerAction('openDeadlines', {
          actionType: 'OPEN_DEADLINES',
          canonicalAction: canonicalAction || 'citacao_intimacao_prazo_aberto_listar',
          count: colVal,
          href,
          label: 'Processos com prazo em aberto'
        });
      } else if (/pendentes de citação\/intimação - Urgentes/i.test(colLabel)) {
        registerAction('pendingUrgentNotices', {
          actionType: 'PENDING_URGENT_NOTICES',
          canonicalAction: canonicalAction || 'citacao_intimacao_pendente_listar_urgente',
          count: colVal,
          href,
          label: 'Processos pendentes de citação/intimação - Urgentes'
        });
      } else if (/pendentes de citação\/intimação/i.test(colLabel)) {
        registerAction('pendingNotices', {
          actionType: 'PENDING_NOTICES',
          canonicalAction: canonicalAction || 'citacao_intimacao_pendente_listar',
          count: colVal,
          href,
          label: 'Processos pendentes de citação/intimação'
        });
      } else if (/homologação de acordo/i.test(colLabel)) {
        registerAction('agreementNotices', {
          actionType: 'AGREEMENT_NOTICES',
          canonicalAction: canonicalAction || 'citacao_intimacao_pendente_listar_acordo',
          count: colVal,
          href,
          label: 'Processos pendentes de intimação de homologação de acordo'
        });
      } else if (/art\.?\s*334\s*CPC/i.test(colLabel)) {
        registerAction('cpc334Notices', {
          actionType: 'CPC_334_NOTICES',
          canonicalAction: canonicalAction || 'citacao_art334_pendente_listar',
          count: colVal,
          href,
          label: 'Processos pendentes de citação - art 334 CPC'
        });
      } else if (/Decursos de prazo/i.test(colLabel)) {
        registerAction('elapsedDeadlines30d', {
          actionType: 'ELAPSED_DEADLINES_30D',
          canonicalAction: canonicalAction || 'citacao_intimacao_decurso_prazo_listar',
          count: colVal,
          href,
          label: 'Decursos de prazo nos últimos 30 dias'
        });
      } else if (/Audiências Futuras de Conciliação/i.test(colLabel)) {
        registerAction('futureConciliations', {
          actionType: 'FUTURE_CONCILIATIONS',
          canonicalAction: canonicalAction || 'audiencia_conciliacao_listar',
          count: colVal,
          href,
          label: 'Audiências Futuras de Conciliação'
        });
      } else if (/Audiências Futuras/i.test(colLabel)) {
        registerAction('futureHearings', {
          actionType: 'FUTURE_HEARINGS',
          canonicalAction: canonicalAction || 'audiencia_listar',
          count: colVal,
          href,
          label: 'Audiências Futuras'
        });
      } else if (/Custas a pagar/i.test(colLabel)) {
        registerAction('costsToPay', {
          actionType: 'COSTS_TO_PAY',
          canonicalAction: canonicalAction || 'custas_pagar_listar',
          count: colVal,
          href,
          label: 'Custas a pagar'
        });
      } else if (/Depósitos judiciais em Aberto/i.test(colLabel)) {
        registerAction('openDeposits', {
          actionType: 'OPEN_DEPOSITS',
          canonicalAction: canonicalAction || 'deposito_judicial_aberto_listar',
          count: colVal,
          href,
          label: 'Depósitos judiciais em Aberto'
        });
      } else if (/Agravo de Instrumento Distribuído/i.test(colLabel)) {
        registerAction('courtAppeals', {
          actionType: 'COURT_APPEALS',
          canonicalAction: canonicalAction || 'recurso_tribunal_listar',
          count: colVal,
          href,
          label: 'Agravo de Instrumento Distribuído'
        });
      }
    }
  }

  // 3. Prazos vencendo hoje (frequentemente exibido como footer span com ícone de alarme)
  const expiringTodayMatch = html.match(/(?:Processos com prazo vencendo hoje|vence_hoje)[^<]*?:?\s*<a[^>]*href=["']([^"']*)["'][^>]*>(\d+)<\/a>/i);
  if (expiringTodayMatch) {
    const count = parseInt(expiringTodayMatch[2], 10);
    const href = expiringTodayMatch[1];
    registerAction('deadlinesExpiringToday', {
      actionType: 'DEADLINES_EXPIRING_TODAY',
      canonicalAction: 'citacao_intimacao_prazo_aberto_listar',
      count,
      href,
      label: 'Processos com prazo vencendo hoje'
    });
  }

  return {
    counters,
    actions,
    portalId,
    extractedAt
  };
}
