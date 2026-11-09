import { CivelError, CIVEL_SPECIES, buildCivelCalculation, describeCivelInput } from '../calc/civel.mjs';
import { TrabalhistaError, buildTrabalhistaCalculation, describeTrabalhistaInput } from '../calc/trabalhista.mjs';
import { PrevidenciarioError, buildPrevidenciarioCalculation, describePrevidenciarioInput } from '../calc/previdenciario.mjs';
import { TempoContribuicaoError, calcularPeriodoGraca, calcularTempoContribuicao } from '../calc/tempo-contribuicao.mjs';
import { PcdError, avaliarAposentadoriaPcd } from '../calc/pcd.mjs';
import { RetornoError, calcularRetorno, fatorPrevidenciario } from '../calc/retorno.mjs';
import { ProjecaoError, envelopeProjecao } from '../calc/projecao.mjs';
import { PensaoError, envelopePensao } from '../calc/pensao.mjs';
import { QualidadeSeguradoError, avaliarQualidadeSegurado } from '../calc/qualidade-segurado.mjs';
import { CnisError, parseCnisText } from '../calc/cnis.mjs';
import { CnisExtratoError, parseCnisExtrato } from '../calc/cnis-extrato.mjs';
import { CnisPdfError, analisarPdfCnis } from '../calc/cnis-pdf.mjs';
import { CnisOcrError, createCnisOcr } from '../calc/cnis-ocr.mjs';
import { parseCnisPlanilha, planilhaCnisModelo } from '../calc/cnis-planilha.mjs';
import { resolverSerie, serializeRows, ultimaCompetencia, calcularJanela } from '../calc/source.mjs';
import { REGIME_TRACKS, regimeSummary } from '../calc/regimes.mjs';
import { TABELAS, resumoCatalogo } from '../calc/tribunais.mjs';
import { monthOf } from '../calc/calendar.mjs';
import { conferenceDeadline } from '../core/deadline-conference.mjs';
import { FabricaError, FABRICA_LIMITS } from '../calc/fabrica.mjs';
import { mapFabricaCnisResult } from '../calc/cnis-oficial.mjs';
import { conferirIndicesOficiais } from '../calc/conferencia-indices.mjs';

const DOMAIN_ERRORS = new Set(['CivelError', 'TrabalhistaError', 'PrevidenciarioError', 'TempoContribuicaoError', 'PcdError', 'RetornoError', 'ProjecaoError', 'PensaoError', 'QualidadeSeguradoError', 'CnisError', 'CnisExtratoError', 'CnisPdfError', 'CnisOcrError', 'SerieError', 'TabelaError', 'CalendarError', 'DecimalError', 'IndicesError', 'RegimeError']);
const MAX_SERIES_YEARS = 20;
const MAX_PREVIEW_BYTES = 512 * 1024;
const MAX_IMPORT_BYTES = 12_000_000;

export function createCalcHttpHandler({ source, assertAuthenticated, readJson, json, ocr = null, fabrica = null } = {}) {
  if (!source || typeof source.rows !== 'function' || typeof source.taxaLegalRates !== 'function') {
    throw new TypeError('Fonte de séries dos cálculos é obrigatória.');
  }
  if (typeof assertAuthenticated !== 'function' || typeof readJson !== 'function' || typeof json !== 'function') {
    throw new TypeError('Dependências HTTP dos cálculos são obrigatórias.');
  }
  const windows = new Map();
  let tabelaOficial = { at: 0, dados: null };

  async function carregarTabelaOficial() {
    if (tabelaOficial.dados && Date.now() - tabelaOficial.at < 6 * 60 * 60 * 1000) return tabelaOficial.dados;
    const envelope = await fabrica.indices('tabela');
    const dados = envelope?.result;
    if (!dados || typeof dados !== 'object' || Array.isArray(dados)) {
      throw new FabricaError('A Fábrica de Cálculos não retornou a tabela oficial de índices.', { statusCode: 502, code: 'FABRICA_INVALID_TABLE' });
    }
    tabelaOficial = { at: Date.now(), dados };
    return dados;
  }

  return async function handleCalcRequest(req, res, url) {
    if (!url.pathname.startsWith('/api/calc/')) return false;
    try {
      return await dispatch(req, res, url);
    } catch (error) {
      if (DOMAIN_ERRORS.has(error?.name) && !error.statusCode) error.statusCode = 400;
      throw error;
    }

    async function dispatch(request, response, parsedUrl) {
      if (request.method === 'GET' && parsedUrl.pathname === '/api/calc/catalog') {
        assertAuthenticated(request);
        enforceRateLimit(windows, request, response);
        json(response, 200, catalogPayload(source));
        return true;
      }
      if (request.method === 'GET' && parsedUrl.pathname === '/api/calc/tables') {
        assertAuthenticated(request);
        enforceRateLimit(windows, request, response);
        json(response, 200, { ok: true, resumo: resumoCatalogo(), tabelas: Object.values(TABELAS) });
        return true;
      }
      if (request.method === 'GET' && parsedUrl.pathname.startsWith('/api/calc/series/')) {
        assertAuthenticated(request);
        enforceRateLimit(windows, request, response);
        const key = decodeURIComponent(parsedUrl.pathname.slice('/api/calc/series/'.length));
        const resolved = resolverSerie(key);
        const from = parsedUrl.searchParams.get('from');
        const to = parsedUrl.searchParams.get('to');
        if (!from || !to) throw new CivelError('Informe from e to (AAAA-MM-DD) para consultar a série.');
        assertWindow(from, to);
        const rows = await source.rows(resolved.key, from, to);
        json(response, 200, {
          ok: true,
          serie: { key: resolved.key, rotulo: resolved.rotulo, code: resolved.entry.code, kind: resolved.entry.kind },
          ultimaCompetencia: ultimaCompetencia(rows),
          rows: serializeRows(rows, resolved.entry.kind)
        });
        return true;
      }
      if (request.method === 'POST' && parsedUrl.pathname === '/api/calc/civel/preview') {
        assertAuthenticated(request, true);
        enforceRateLimit(windows, request, response);
        const body = await readJson(request, MAX_PREVIEW_BYTES);
        json(response, 200, await previewCivel(body, source));
        return true;
      }
      if (request.method === 'POST' && parsedUrl.pathname === '/api/calc/civel/conferencia-oficial') {
        assertAuthenticated(request, true);
        enforceRateLimit(windows, request, response);
        const body = await readJson(request, MAX_PREVIEW_BYTES);
        requireFabrica(fabrica);
        const calculo = (await previewCivel(body, source)).calculo;
        const tabela = await carregarTabelaOficial();
        json(response, 200, { ok: true, conferencia: conferirIndicesOficiais(calculo, tabela) });
        return true;
      }
      if (request.method === 'POST' && parsedUrl.pathname === '/api/calc/deadline/conference') {
        assertAuthenticated(request, true);
        enforceRateLimit(windows, request, response);
        const body = await readJson(request, MAX_PREVIEW_BYTES);
        const conference = conferenceDeadline(body || {});
        if (!conference.ok) {
          const messages = {
            'invalid-start-date': 'Informe a data inicial no formato AAAA-MM-DD.',
            'invalid-days': `Informe de 1 a ${conference.maxDays || 365} dias.`,
            'invalid-mode': 'Contagem deve ser dias úteis ou corridos, e a direção depois ou antes do início.'
          };
          throw Object.assign(new Error(messages[conference.reason] || 'Conferência inválida.'), { statusCode: 400 });
        }
        json(response, 200, { ok: true, conference });
        return true;
      }
      if (request.method === 'POST' && parsedUrl.pathname === '/api/calc/trabalhista/preview') {
        assertAuthenticated(request, true);
        enforceRateLimit(windows, request, response);
        const body = await readJson(request, MAX_PREVIEW_BYTES);
        json(response, 200, { ok: true, entradas: describeTrabalhistaInput(body), calculo: buildTrabalhistaCalculation(body) });
        return true;
      }
      if (request.method === 'POST' && parsedUrl.pathname === '/api/calc/previdenciario/preview') {
        assertAuthenticated(request, true);
        enforceRateLimit(windows, request, response);
        const body = await readJson(request, MAX_PREVIEW_BYTES);
        json(response, 200, { ok: true, entradas: describePrevidenciarioInput(body), calculo: buildPrevidenciarioCalculation(body) });
        return true;
      }
      if (request.method === 'POST' && parsedUrl.pathname === '/api/calc/tempo/preview') {
        assertAuthenticated(request, true);
        enforceRateLimit(windows, request, response);
        const body = await readJson(request, MAX_PREVIEW_BYTES);
        const resposta = { ok: true };
        if (Array.isArray(body.vinculos) && body.vinculos.length > 0) {
          resposta.tempo = calcularTempoContribuicao({ vinculos: body.vinculos, dataReferencia: body.dataReferencia });
        }
        if (body.ultimaContribuicao) {
          resposta.qualidade = calcularPeriodoGraca({
            ultimaContribuicao: body.ultimaContribuicao,
            contribuicoesMeses: body.contribuicoesMeses,
            dataReferencia: body.dataReferencia,
            desempregoComprovado: body.desempregoComprovado === true
          });
        }
        if (!resposta.tempo && !resposta.qualidade) {
          throw new TempoContribuicaoError('Informe vínculos ou a última contribuição para calcular tempo ou qualidade de segurado.');
        }
        json(response, 200, resposta);
        return true;
      }
      if (request.method === 'POST' && parsedUrl.pathname === '/api/calc/previdenciario/complementar') {
        assertAuthenticated(request, true);
        enforceRateLimit(windows, request, response);
        const body = await readJson(request, MAX_PREVIEW_BYTES);
        const resposta = { ok: true };
        if (body.pcd) resposta.pcd = avaliarAposentadoriaPcd(body.pcd);
        if (body.fator) resposta.fator = fatorPrevidenciario(body.fator);
        if (body.retorno) resposta.retorno = calcularRetorno(body.retorno);
        if (!resposta.pcd && !resposta.fator && !resposta.retorno) {
          throw new RetornoError('Informe os dados de PcD, fator previdenciário ou retorno para a análise complementar.');
        }
        json(response, 200, resposta);
        return true;
      }
      /* --- Portas dos três motores que faltavam (projecao.rs, pension.rs, quality.rs) ---
       * Cada rota tem uma responsabilidade e devolve envelope de domínio no mesmo
       * contrato do LC 142: `status`, `legal_validation_performed: false`,
       * `actual_entitlement_verified: false` e `data.native_result` quando há
       * resultado. Bloqueio/ausência de suporte devolve `data: null`. */
      if (request.method === 'POST' && parsedUrl.pathname === '/api/calc/previdenciario/projecao') {
        assertAuthenticated(request, true);
        enforceRateLimit(windows, request, response);
        const body = await readJson(request, MAX_PREVIEW_BYTES);
        json(response, 200, { ok: true, ...envelopeProjecao(body) });
        return true;
      }
      if (request.method === 'POST' && parsedUrl.pathname === '/api/calc/previdenciario/pensao') {
        assertAuthenticated(request, true);
        enforceRateLimit(windows, request, response);
        const body = await readJson(request, MAX_PREVIEW_BYTES);
        json(response, 200, { ok: true, ...envelopePensao(body) });
        return true;
      }
      if (request.method === 'POST' && parsedUrl.pathname === '/api/calc/previdenciario/qualidade-segurado') {
        assertAuthenticated(request, true);
        enforceRateLimit(windows, request, response);
        const body = await readJson(request, MAX_PREVIEW_BYTES);
        json(response, 200, { ok: true, ...avaliarQualidadeSegurado(body) });
        return true;
      }
      if (request.method === 'POST' && parsedUrl.pathname === '/api/calc/cnis/parse') {
        assertAuthenticated(request, true);
        enforceRateLimit(windows, request, response);
        const body = await readJson(request, MAX_IMPORT_BYTES);
        json(response, 200, { ok: true, ...(await analisarEntradaCnis(body, ocr || createCnisOcr())) });
        return true;
      }
      if (request.method === 'POST' && parsedUrl.pathname === '/api/calc/cnis/importar') {
        assertAuthenticated(request, true);
        enforceRateLimit(windows, request, response);
        const body = await readJson(request, MAX_IMPORT_BYTES);
        json(response, 200, { ok: true, ...(await importarCnisOficialOuLocal({ body, fabrica, ocr: ocr || createCnisOcr() })) });
        return true;
      }
      if (request.method === 'GET' && parsedUrl.pathname === '/api/calc/cnis/template') {
        assertAuthenticated(request);
        enforceRateLimit(windows, request, response);
        const modelo = planilhaCnisModelo();
        const linhas = [modelo.cabecalho.join(';'), ...modelo.linhas.map(linha => linha.join(';'))];
        response.writeHead(200, {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': 'attachment; filename="modelo-cnis-atrium.csv"',
          'Cache-Control': 'no-store'
        });
        response.end('\uFEFF' + linhas.join('\n'));
        return true;
      }
      if (request.method === 'GET' && parsedUrl.pathname === '/api/calc/fabrica/status') {
        assertAuthenticated(request);
        enforceRateLimit(windows, request, response);
        json(response, 200, {
          ok: true,
          configured: Boolean(fabrica?.configured),
          baseUrl: fabrica?.baseUrl || null,
          limits: FABRICA_LIMITS
        });
        return true;
      }
      if (request.method === 'GET' && parsedUrl.pathname === '/api/calc/fabrica/indices') {
        assertAuthenticated(request);
        enforceRateLimit(windows, request, response);
        requireFabrica(fabrica);
        const tabela = String(parsedUrl.searchParams.get('tabela') || 'tabela').trim().toLowerCase();
        const envelope = await fabrica.indices(tabela, {
          competenciaInicial: parsedUrl.searchParams.get('competenciaInicial') || null,
          competenciaFinal: parsedUrl.searchParams.get('competenciaFinal') || null,
          indice: parsedUrl.searchParams.getAll('indice')
        });
        json(response, 200, { ok: true, tabela, envelope });
        return true;
      }
      if (request.method === 'POST' && parsedUrl.pathname === '/api/calc/fabrica/documentos') {
        assertAuthenticated(request, true);
        enforceRateLimit(windows, request, response);
        requireFabrica(fabrica);
        const body = await readJson(request, MAX_IMPORT_BYTES);
        const tipo = String(body?.tipo || 'cnis').trim().toLowerCase();
        const filename = String(body?.filename || `${tipo}.pdf`).slice(0, 120);
        let buffer = null;
        let text = null;
        if (typeof body?.base64 === 'string' && body.base64.trim()) {
          buffer = Buffer.from(body.base64, 'base64');
          if (buffer.length > MAX_IMPORT_BYTES) {
            throw new FabricaError('Documento acima do limite de envio da integração.', { statusCode: 413, code: 'FABRICA_PAYLOAD_TOO_LARGE' });
          }
        } else if (typeof body?.text === 'string' && body.text.trim()) {
          text = body.text.slice(0, 400_000);
        } else {
          throw new FabricaError('Envie o documento (PDF em base64 ou texto) para a leitura oficial.', { statusCode: 400, code: 'FABRICA_DOCUMENT_MISSING' });
        }
        const envelope = await fabrica.lerDocumento(tipo, { buffer, filename, text });
        // PII documental nunca é logada; a resposta segue para o fluxo autenticado da UI.
        json(response, 200, { ok: true, tipo, envelope });
        return true;
      }
      if (request.method === 'POST' && parsedUrl.pathname.startsWith('/api/calc/fabrica/calculo/')) {
        assertAuthenticated(request, true);
        enforceRateLimit(windows, request, response);
        requireFabrica(fabrica);
        const tipo = decodeURIComponent(parsedUrl.pathname.slice('/api/calc/fabrica/calculo/'.length)).trim().toLowerCase();
        const body = await readJson(request, MAX_PREVIEW_BYTES);
        const envelope = await callFabricaCalculo(fabrica, tipo, body);
        json(response, 200, { ok: true, tipo, envelope });
        return true;
      }
      json(response, 404, { message: 'Recurso de cálculos não encontrado.' });
      return true;
    }
  };
}

function requireFabrica(fabrica) {
  if (!fabrica || typeof fabrica.indices !== 'function') {
    throw new FabricaError('Integração com a Fábrica de Cálculos indisponível neste servidor.', {
      statusCode: 503,
      code: 'FABRICA_UNAVAILABLE'
    });
  }
  if (!fabrica.configured) {
    throw new FabricaError('A Fábrica de Cálculos não está configurada neste servidor (FC_API_KEY ausente).', {
      statusCode: 409,
      code: 'FABRICA_NOT_CONFIGURED'
    });
  }
}

async function callFabricaCalculo(fabrica, tipo, body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new FabricaError('Payload de cálculo inválido para a Fábrica de Cálculos.', { statusCode: 400, code: 'FABRICA_INVALID_PAYLOAD' });
  }
  switch (tipo) {
    case 'tempo': return fabrica.calcularTempo(body);
    case 'tempo-grupos': return fabrica.calcularTempoPorGrupos(body);
    case 'tempo-prevjud': return fabrica.calcularTempoPrevjud(body);
    case 'atrasados': return fabrica.calcularAtrasados(body);
    case 'rmi': return fabrica.calcularRmi(body);
    case 'rmi-fundamento': return fabrica.calcularRmiPorFundamento(body);
    case 'rmi-desvinculada': return fabrica.calcularRmiDesvinculada(body);
    default:
      throw new FabricaError('Tipo de cálculo não suportado pela integração oficial.', { statusCode: 400, code: 'FABRICA_CALC_TYPE' });
  }
}

function catalogPayload(source) {
  return {
    ok: true,
    series: source.catalog(),
    regimes: Object.entries(REGIME_TRACKS).map(([track, timeline]) => ({ track, regimes: timeline.map(regimeSummary) })),
    tabelas: { resumo: resumoCatalogo(), itens: Object.values(TABELAS) },
    especies: CIVEL_SPECIES
  };
}

export async function previewCivel(body, source) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new CivelError('Corpo do cálculo deve ser um objeto JSON.');
  }
  const keys = new Set();
  if (body.correcao && body.correcao.timeline) {
    for (const segment of body.correcao.timeline) keys.add(segment?.serie);
  } else if (body.correcao && body.correcao.serie) {
    keys.add(body.correcao.serie);
  }
  const juros = body.juros || { tipo: 'sem' };
  if (juros.tipo === 'serie-mensal') keys.add(juros.serie);
  keys.delete(undefined);
  keys.delete(null);
  const resolvedKeys = [...keys].map(key => resolverSerie(key).key);

  const dates = [];
  for (const item of Array.isArray(body.itens) ? body.itens : []) {
    if (item?.data) dates.push(item.data);
    if (item?.jurosDe) dates.push(item.jurosDe);
  }
  if (dates.length === 0 || !body.atualizacaoAte) {
    throw new CivelError('Informe itens com data e a data de atualização.');
  }
  const fromIso = dates.slice().sort()[0];
  const window = calcularJanela(fromIso, body.atualizacaoAte);
  const loaded = new Map();
  for (const key of resolvedKeys) {
    loaded.set(key, await source.rows(key, window.from, window.to));
  }
  const deps = {
    seriesRows: key => {
      const canonical = resolverSerie(key).key;
      const found = loaded.get(canonical);
      if (!found) throw new CivelError(`Série ${key} não carregada para o período do cálculo.`);
      return found;
    }
  };
  let taxaLegalFonte = null;
  if (juros.tipo === 'taxa-legal') {
    const rows = await source.rows('TAXA-LEGAL', window.from, window.to);
    const rates = new Map(rows.map(row => [row.period, row.value]));
    deps.taxaLegalRates = () => rates;
    taxaLegalFonte = { serie: 'TAXA-LEGAL', ultimaCompetencia: ultimaCompetencia(rows) };
  }
  const calculo = buildCivelCalculation(body, deps);
  return {
    ok: true,
    entradas: describeCivelInput(body),
    series: resolvedKeys.map(key => ({
      key,
      ultimaCompetencia: ultimaCompetencia(loaded.get(key))
    })),
    taxaLegal: taxaLegalFonte,
    calculo
  };
}

export function assertWindow(from, to) {
  const fromPeriod = monthOf(from);
  const toPeriod = monthOf(to);
  if (fromPeriod > toPeriod) throw new CivelError(`Período inválido: ${from} é posterior a ${to}.`);
  const years = Number(toPeriod.slice(0, 4)) - Number(fromPeriod.slice(0, 4));
  if (years > MAX_SERIES_YEARS) throw new CivelError(`Intervalo máximo de ${MAX_SERIES_YEARS} anos por consulta.`);
  return { fromPeriod, toPeriod };
}

/**
 * Importação unificada do CNIS: usa a extração oficial da Fábrica de Cálculos
 * quando a chave está configurada e cai para a leitura local com aviso honesto
 * quando a oficial falha ou não reconhece o documento. O formato de resposta é
 * o mesmo nos dois caminhos (vinculos, competencias, resumo, avisos).
 */
export async function importarCnisOficialOuLocal({ body, fabrica = null, ocr = null } = {}) {
  const temBase64 = typeof body?.base64 === 'string' && body.base64.trim();
  const texto = typeof body?.texto === 'string' && body.texto.trim()
    ? body.texto
    : (typeof body?.content === 'string' && body.content.trim() ? body.content : '');
  const podeOficial = Boolean(fabrica?.configured) && (temBase64 || Boolean(texto));

  const local = async () => analisarEntradaCnis(body, ocr || createCnisOcr());

  if (podeOficial) {
    try {
      const envelope = temBase64
        ? await fabrica.lerDocumento('cnis', { buffer: Buffer.from(String(body.base64), 'base64'), filename: String(body.filename || 'cnis.pdf').slice(0, 120) })
        : await fabrica.lerDocumento('cnis', { text: String(texto).slice(0, 400_000), filename: String(body.filename || 'cnis.txt').slice(0, 120) });
      const mapeado = mapFabricaCnisResult(envelope?.result || {});
      if (mapeado.competencias.length > 0 || mapeado.vinculos.length > 0) return mapeado;
      // Extração oficial vazia: segunda opinião local, declarada ao usuário.
      try {
        const alternativa = await local();
        return {
          ...alternativa,
          fonte: 'local',
          oficial: false,
          avisos: ['A extração oficial não reconheceu dados neste documento; usamos a leitura local.', ...(Array.isArray(alternativa.avisos) ? alternativa.avisos : [])]
        };
      } catch {
        return mapeado;
      }
    } catch (error) {
      const alternativa = await local();
      return {
        ...alternativa,
        fonte: 'local',
        oficial: false,
        avisos: [
          `A extração oficial da Fábrica de Cálculos falhou (${String(error?.message || 'erro').slice(0, 200)}); usamos a leitura local.`,
          ...(Array.isArray(alternativa.avisos) ? alternativa.avisos : [])
        ]
      };
    }
  }

  const alternativa = await local();
  return { ...alternativa, fonte: 'local', oficial: false };
}

export async function analisarEntradaCnis(body, ocr, deps = {}) {
  const analisarPdf = deps.analisarPdfCnis || analisarPdfCnis;
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new CivelError('Envie um arquivo (PDF/XLSX/CSV/TXT) ou o texto do CNIS.');
  }
  const arquivo = String(body.filename || '').toLowerCase();
  if (body.base64 && arquivo.endsWith('.pdf')) {
    const bytes = Buffer.from(String(body.base64), 'base64');
    const analise = await analisarPdf(bytes);
    if (analise.modoRecomendado === 'texto') {
      const extrato = parseCnisExtrato(analise.texto, { origem: 'texto' });
      return { modo: 'texto', pdf: { paginas: analise.totalPages, qualidade: analise.qualidade.metricas }, ...extrato };
    }
    if (body.ocr === true) {
      if (!(await ocr.disponivel())) {
        throw Object.assign(new CnisOcrError('OCR indisponível no servidor: instale tesseract-ocr, tesseract-ocr-por e poppler-utils para ler PDFs sem camada de texto.'), { statusCode: 503 });
      }
      const reconhecido = await ocr.reconhecer(bytes);
      const extrato = parseCnisExtrato(reconhecido.texto, { origem: 'ocr' });
      return { modo: 'ocr', pdf: { paginas: reconhecido.paginas, dpi: reconhecido.dpi }, ...extrato };
    }
    return {
      modo: 'ocr-necessario',
      precisaOcr: true,
      pdf: { paginas: analise.totalPages, qualidade: analise.qualidade.metricas },
      motivos: analise.qualidade.motivos,
      avisos: ['Este PDF não tem camada de texto utilizável. Rode o OCR para extrair as competências ou use o texto colado.']
    };
  }
  if (body.base64 && /\.(xlsx|xls)$/.test(arquivo)) {
    return parseCnisPlanilha({ base64: String(body.base64) });
  }
  if (typeof body.content === 'string' && body.content.trim()) {
    const primeiraLinha = body.content.split(/\r?\n/)[0] || '';
    const cabecalhoNormalizado = primeiraLinha.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    if (/competencia|remuneracao|salario|mes|valor/.test(cabecalhoNormalizado)) {
      return parseCnisPlanilha({ content: body.content });
    }
    try {
      return parseCnisExtrato(body.content, { origem: 'texto' });
    } catch (error) {
      return { modo: 'texto-simples', ...parseCnisText(body.content) };
    }
  }
  if (typeof body.texto === 'string' && body.texto.trim()) {
    try {
      return parseCnisExtrato(body.texto, { origem: 'texto' });
    } catch (error) {
      return { modo: 'texto-simples', ...parseCnisText(body.texto) };
    }
  }
  throw new CivelError('Envie um arquivo (PDF/XLSX/CSV/TXT) ou o texto do CNIS.');
}

function enforceRateLimit(windows, req, res) {
  const key = String(req.socket?.remoteAddress || 'local');
  const now = Date.now();
  const current = windows.get(key);
  const bucket = !current || now - current.startedAt >= 60_000 ? { startedAt: now, count: 0 } : current;
  bucket.count += 1;
  windows.set(key, bucket);
  if (bucket.count > 60) {
    res.setHeader?.('Retry-After', '60');
    throw Object.assign(new Error('Limite temporário de consultas de cálculo atingido.'), { statusCode: 429 });
  }
}
