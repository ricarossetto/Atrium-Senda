/**
 * Rotas HTTP do perfil previdenciário LC 142 de grau constante.
 *
 * Rotas NOVAS, declaradas como novas: não reutilizam nem renomeiam contratos
 * antigos. Seguem o padrão das rotas de cálculo do ATRIUM: sessão obrigatória,
 * CSRF em toda mutação, corpo limitado, erro de domínio em 400 e limitação por
 * socket em 429.
 *
 * Envelope de resposta é distinto do envelope de domínio: o HTTP carrega
 * `{ok, resultado}` e o domínio carrega `status`/`blockers`/`warnings`. Um
 * HTTP 200 com `status: "blocked"` é resposta bem-sucedida de um cenário
 * bloqueado, não sucesso financeiro.
 *
 * Nenhum dado pessoal é registrado em log, telemetria ou query string.
 */

import { calculateCase, calculateLc142, parseRulePolicy } from '../calc/lc142.mjs';
import {
  Lc142SnapshotError,
  canonicalSnapshotDecimal,
  validateSnapshot
} from '../calc/lc142-snapshot.mjs';
import {
  Lc142OverlayError,
  validateContributionReview,
  validateSourceLinks,
  projectContributionReview
} from '../calc/lc142-overlays.mjs';
import { Lc142CalendarError } from '../calc/calendar-30360.mjs';
import { DecimalError } from '../calc/decimal.mjs';
import { montarSnapshotLc142 } from '../calc/lc142-snapshot-source.mjs';
import { LC142_SNAPSHOT_URL_PREFIX } from '../calc/lc142-profile.mjs';

/**
 * O renderer de PDF é carregado sob demanda: as rotas de cálculo não devem
 * pagar o custo do gerador de documentos, e o módulo de PDF pode evoluir sem
 * derrubar a prévia.
 */
const LC142_REPORT_FAMILIES = Object.freeze([
  'detailed',
  'summary',
  'periods',
  'salaries',
  'memory',
  'transitions',
  'indicators'
]);

async function carregarRenderer() {
  const modulo = await import('../calc/pdf/lc142-report.mjs');
  if (typeof modulo.renderLc142Report !== 'function') {
    throw Object.assign(
      new Error('Renderer de relatório indisponível neste ambiente.'),
      { statusCode: 503 }
    );
  }
  return modulo.renderLc142Report;
}

const PREFIX = '/api/calc/previdenciario/lc142/';
const MAX_PREVIEW_BYTES = 512 * 1024;
const MAX_REPORT_BYTES = 1024 * 1024;
const RATE_WINDOW_MS = 60_000;
const RATE_MAX_REQUESTS = 60;

const DOMAIN_ERRORS = new Set([
  'Lc142Error',
  'Lc142SnapshotError',
  'Lc142OverlayError',
  'Lc142CalendarError',
  'DecimalError',
  'PcdError',
  'CalendarError'
]);

/**
 * Cria o handler. Retorna `false` quando a URL não pertence a este módulo, para
 * que o roteador do servidor siga adiante.
 */
export function createLc142HttpHandler({
  assertAuthenticated,
  readJson,
  json,
  sendBinary,
  currentSession = null,
  fabricaClient = null
} = {}) {
  if (typeof assertAuthenticated !== 'function' || typeof readJson !== 'function' || typeof json !== 'function') {
    throw new TypeError('Dependências HTTP do cenário LC 142 são obrigatórias.');
  }
  if (!PREFIX) throw new TypeError('Prefixo de rota inválido.');
  const windows = new Map();

  /**
   * Busca os índices oficiais e atesta a proveniência. Falha fechada: sem
   * cliente configurado, sem índices ou sem limites, o erro é declarado — nunca
   * um snapshot sintético que faria o cálculo parecer legítimo.
   */
  async function snapshotPayload(body) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw Object.assign(new Error('Corpo de snapshot inválido.'), { statusCode: 422 });
    }
    const through = String(body.through ?? '').trim();
    if (!/^\d{4}-\d{2}$/.test(through)) {
      throw Object.assign(
        new Error('Informe a competência de corte do snapshot (AAAA-MM).'),
        { statusCode: 422 }
      );
    }
    if (!fabricaClient || typeof fabricaClient.indices !== 'function') {
      throw Object.assign(
        new Error(
          'A Fábrica de Cálculos não está disponível neste servidor; os índices oficiais não podem ser obtidos.'
        ),
        { statusCode: 503, code: 'FABRICA_NOT_CONFIGURED' }
      );
    }
    const limites = Array.isArray(body.limites) ? body.limites : [];
    let resposta;
    try {
      resposta = await fabricaClient.indices('tabela', { competencia: through });
    } catch (error) {
      throw Object.assign(
        new Error(
          `Não foi possível obter os índices oficiais: ${error?.message || 'falha na Fábrica de Cálculos'}.`
        ),
        { statusCode: 502, code: 'FABRICA_UNAVAILABLE' }
      );
    }
    const payload = resposta?.result ?? resposta?.payload ?? null;
    const corpoBruto = typeof resposta?.raw === 'string' ? resposta.raw : null;
    if (!corpoBruto) {
      throw Object.assign(
        new Error('A Fábrica de Cálculos respondeu sem corpo verificável; proveniência não pode ser atestada.'),
        { statusCode: 502, code: 'FABRICA_UNVERIFIABLE' }
      );
    }
    return montarSnapshotLc142({
      corpoBruto,
      payload,
      through,
      limites,
      sourceUrl: `${LC142_SNAPSHOT_URL_PREFIX}tabela`,
      retrievedAt: new Date().toISOString()
    });
  }

  return async function handleLc142Request(req, res, url) {
    if (!url.pathname.startsWith(PREFIX)) return false;
    try {
      return await dispatch(req, res, url);
    } catch (error) {
      if (DOMAIN_ERRORS.has(error?.name) && !error.statusCode) error.statusCode = 400;
      throw error;
    }

    async function dispatch(request, response, parsedUrl) {
      const route = parsedUrl.pathname.slice(PREFIX.length);

      if (request.method === 'GET' && route === 'capacidades') {
        assertAuthenticated(request);
        enforceRateLimit(windows, request, response);
        json(response, 200, { ok: true, capacidades: capacidadesPayload() });
        return true;
      }

      if (request.method === 'POST' && route === 'preview') {
        assertAuthenticated(request, true);
        enforceRateLimit(windows, request, response);
        const body = await readJson(request, MAX_PREVIEW_BYTES);
        json(response, 200, previewPayload(body));
        return true;
      }

      if (request.method === 'POST' && route === 'relatorio') {
        assertAuthenticated(request, true);
        enforceRateLimit(windows, request, response);
        const body = await readJson(request, MAX_REPORT_BYTES);
        const relatorio = await relatorioPayload(body);
        if (typeof sendBinary !== 'function') {
          json(response, 200, {
            ok: true,
            relatorio: {
              familia: relatorio.familia,
              filename: relatorio.filename,
              contentType: relatorio.contentType,
              bytesBase64: relatorio.bytes.toString('base64')
            }
          });
          return true;
        }
        sendBinary(response, 200, relatorio.bytes, {
          'Content-Type': relatorio.contentType,
          'Content-Disposition': `attachment; filename="${relatorio.filename}"`,
          'Cache-Control': 'no-store, private',
          'X-Content-Type-Options': 'nosniff'
        });
        return true;
      }

      /* Aquisição do snapshot público: o servidor busca os índices na Fábrica
       * de Cálculos, atesta a proveniência com o SHA-256 do corpo recebido e
       * devolve o snapshot pronto. É o passo que faltava entre "premissas" e
       * "calcular" — sem ele o motor bloqueia com `lc142_snapshot`.
       *
       * POST porque consulta a fonte externa e devolve material que vira base
       * do cálculo; exige CSRF como as demais mutações do módulo. */
      if (request.method === 'POST' && route === 'snapshot') {
        assertAuthenticated(request, true);
        enforceRateLimit(windows, request, response);
        const body = await readJson(request, MAX_PREVIEW_BYTES);
        const snapshot = await snapshotPayload(body);
        json(response, 200, { ok: true, snapshot });
        return true;
      }

      if (request.method === 'POST' && route === 'validar-hipotese') {
        assertAuthenticated(request, true);
        enforceRateLimit(windows, request, response);
        const body = await readJson(request, MAX_PREVIEW_BYTES);
        json(response, 200, validarHipotesePayload(body));
        return true;
      }

      return false;
    }
  };
}

/**
 * Metadados de capacidade: o que este módulo faz e o que NÃO faz. Serve à UI
 * para não prometer outra coisa.
 */
export function capacidadesPayload() {
  return {
    engine_id: 'lc142-constant-grade-v1',
    politica_version: 'rgps-core-observational-v1',
    grau_constante: true,
    sexos: ['masculino', 'feminino'],
    graus: ['leve', 'moderada', 'grave'],
    convencao_tempo: 'declared_30_360_inclusive_union',
    relatorios: LC142_REPORT_FAMILIES,
    suportado: [
      'pbc_desde_1994_07',
      'correcao_composta_ipcr_inpc_igpdi',
      'descarte_80_por_cento',
      'tempo_30_360_union',
      'carencia_por_competencia',
      'rmi_100_por_cento_limitada',
      'premissas_declaradas_com_evidencia'
    ],
    nao_suportado: [
      'graus_mistos',
      'atividade_especial',
      'ctc_automatica',
      'fator_previdenciario',
      'conversao_moeda_historica',
      'rural',
      'revisao_de_beneficio',
      'validacao_juridica'
    ],
    legal_validation_performed: false,
    actual_entitlement_verified: false
  };
}

/**
 * Prévia: calcula sem persistir nada. Corpo aceita:
 *  - `{calculation, politica}` — política explícita; ou
 *  - `{calculation}` — a política é lida de `calculation.options.rule_policy`.
 */
export function previewPayload(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw Object.assign(new Error('Corpo da prévia inválido.'), { statusCode: 422 });
  }
  const { calculation, politica } = body;
  if (!calculation || typeof calculation !== 'object' || Array.isArray(calculation)) {
    throw Object.assign(new Error('Informe o cenário de cálculo.'), { statusCode: 422 });
  }
  if (politica !== undefined && politica !== null) {
    if (typeof politica !== 'object' || Array.isArray(politica)) {
      throw Object.assign(new Error('Política do cenário inválida.'), { statusCode: 422 });
    }
    assertPoliticaSemSegredo(politica);
    return { ok: true, resultado: calculateLc142(calculation, politica) };
  }
  assertPoliticaSemSegredo(calculation?.options);
  return { ok: true, resultado: calculateCase(calculation) };
}

/**
 * Relatório: o servidor NÃO confia no envelope do browser. Exige o cenário e
 * recalcula antes de renderizar, para que o PDF nunca carregue uma RMI fabricada.
 */
export async function relatorioPayload(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw Object.assign(new Error('Corpo do relatório inválido.'), { statusCode: 422 });
  }
  const familia = typeof body.familia === 'string' ? body.familia.trim() : '';
  if (!LC142_REPORT_FAMILIES.includes(familia)) {
    throw Object.assign(
      new Error(`Família de relatório inválida. Use: ${LC142_REPORT_FAMILIES.join(', ')}.`),
      { statusCode: 422 }
    );
  }
  const { calculation, politica, metadados = {}, identificacao = null } = body;
  if (!calculation || typeof calculation !== 'object' || Array.isArray(calculation)) {
    throw Object.assign(
      new Error('Relatório exige o cenário oficial para recálculo no servidor.'),
      { statusCode: 422 }
    );
  }
  assertPoliticaSemSegredo(politica ?? calculation?.options);
  const resultado =
    politica !== undefined && politica !== null
      ? calculateLc142(calculation, politica)
      : calculateCase(calculation);
  if (resultado.status !== 'experimental') {
    throw Object.assign(
      new Error('Relatório exige cálculo concluído; cenário bloqueado não gera PDF de resultado.'),
      { statusCode: 409 }
    );
  }
  const identificacaoNormalizada = normalizarIdentificacao(identificacao);
  const renderLc142Report = await carregarRenderer();
  return renderLc142Report({
    familia,
    resultado,
    metadados: normalizarMetadados(metadados),
    identificacao: identificacaoNormalizada,
    geradoEm: new Date().toISOString()
  });
}

/**
 * Validação de hipótese sem calcular: útil ao assistente, para apontar campo e
 * bloqueio antes de o operador apertar "calcular".
 */
export function validarHipotesePayload(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw Object.assign(new Error('Corpo de validação inválido.'), { statusCode: 422 });
  }
  const { calculation, politica } = body;
  if (!calculation || typeof calculation !== 'object' || Array.isArray(calculation)) {
    throw Object.assign(new Error('Informe o cenário de cálculo.'), { statusCode: 422 });
  }
  const resultado =
    politica !== undefined && politica !== null
      ? calculateLc142(calculation, politica)
      : calculateCase(calculation);
  const bloqueado = resultado.status === 'blocked';
  return {
    ok: true,
    valido: !bloqueado,
    status: resultado.status,
    blockers: resultado.blockers ?? [],
    warnings: resultado.warnings ?? []
  };
}

/**
 * Guarda contra segredo em corpo de requisição: a chave da Fábrica de Cálculos
 * nunca deve chegar ao browser nem voltar dele.
 */
export function assertPoliticaSemSegredo(politica) {
  const texto = JSON.stringify(politica ?? {});
  for (const chave of ['FC_API_KEY', 'apiKey', 'api_key', 'x-api-key', 'authorization']) {
    if (texto.includes(chave)) {
      throw Object.assign(
        new Error('A política não pode transportar credencial. A chave do provedor fica no servidor.'),
        { statusCode: 422 }
      );
    }
  }
}

/**
 * Normaliza a identificação opcional. Desligada por padrão; quando ligada,
 * exige nome e um documento declarado pelo operador.
 */
export function normalizarIdentificacao(identificacao) {
  if (!identificacao || typeof identificacao !== 'object' || Array.isArray(identificacao)) return null;
  if (identificacao.habilitada !== true) return null;
  const nome = typeof identificacao.nome === 'string' ? identificacao.nome.trim() : '';
  const cpf = typeof identificacao.cpf === 'string' ? identificacao.cpf.trim() : '';
  if (!nome) {
    throw Object.assign(
      new Error('Identificação habilitada exige nome do segurado.'),
      { statusCode: 422 }
    );
  }
  return {
    habilitada: true,
    nome: nome.slice(0, 200),
    cpf: cpf.slice(0, 32),
    documento: typeof identificacao.documento === 'string' ? identificacao.documento.slice(0, 120) : '',
    processo: typeof identificacao.processo === 'string' ? identificacao.processo.slice(0, 64) : ''
  };
}

function normalizarMetadados(metadados) {
  if (!metadados || typeof metadados !== 'object' || Array.isArray(metadados)) return {};
  const out = {};
  for (const campo of ['escritorio', 'responsavel', 'cenarioId', 'clienteReferencia']) {
    if (typeof metadados[campo] === 'string' && metadados[campo].trim()) {
      out[campo] = metadados[campo].trim().slice(0, 200);
    }
  }
  return out;
}

/**
 * Limite por socket: 60 requisições por minuto, com `Retry-After` honesto.
 * A decisão usa o socket, nunca `X-Forwarded-For`.
 *
 * A chave é o IP do socket, SEM a porta: `remotePort` muda a cada conexão TCP
 * nova, então inclui-lo no balde criava um contador novo por conexão — um
 * cliente que rotaciona sockets nunca recebia `429`. Além disso o mapa era
 * podado só por janela, acumulando uma entrada por porta indefinidamente.
 * Agora a chave é estável por origem e há poda com teto.
 */
const RATE_MAX_ENTRIES = 4096;

export function enforceRateLimit(windows, req, res) {
  const now = Date.now();
  const socket = req.socket ?? null;
  const key = socket?.remoteAddress || 'anon';
  const entry = windows.get(key);
  if (!entry || now - entry.start >= RATE_WINDOW_MS) {
    // Poda barata: só quando o mapa cresce, remove janelas vencidas.
    if (windows.size >= RATE_MAX_ENTRIES) {
      for (const [chave, valor] of windows) {
        if (now - valor.start >= RATE_WINDOW_MS) windows.delete(chave);
      }
      // Se ainda estourar (origens todas ativas), descarta a mais antiga.
      if (windows.size >= RATE_MAX_ENTRIES) {
        const maisAntiga = windows.keys().next();
        if (!maisAntiga.done) windows.delete(maisAntiga.value);
      }
    }
    windows.set(key, { start: now, count: 1 });
    return;
  }
  entry.count += 1;
  if (entry.count > RATE_MAX_REQUESTS) {
    const retryAfter = Math.max(1, Math.ceil((RATE_WINDOW_MS - (now - entry.start)) / 1000));
    res.setHeader('Retry-After', String(retryAfter));
    throw Object.assign(
      new Error('Muitas requisições de cálculo; aguarde antes de repetir.'),
      { statusCode: 429 }
    );
  }
}

/** Exposição para testes: normalização de decimais do snapshot público. */
export function normalizarDecimalPublico(value) {
  return canonicalSnapshotDecimal(value);
}

/** Exposição para testes de validação isolada do snapshot. */
export function validarSnapshot(value) {
  return validateSnapshot(value);
}

/** Exposição para testes de overlay isolado. */
export function validarOverlays(calculation) {
  validateSourceLinks(calculation);
  if (calculation?.contribution_review) {
    validateContributionReview(calculation.contribution_review, calculation);
    return projectContributionReview(calculation.contribution_review);
  }
  return [];
}

/** Reexporta para que a rota não importe o módulo de domínio em dois lugares. */
export { parseRulePolicy, Lc142SnapshotError, Lc142OverlayError, Lc142CalendarError, DecimalError };
