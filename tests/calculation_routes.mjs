import assert from 'node:assert/strict';
import { createCalcHttpHandler, previewCivel, assertWindow, analisarEntradaCnis } from '../lib/http/calc-routes.mjs';
import { createCalcSource, resolverSerie, calcularJanela } from '../lib/calc/source.mjs';
import { normalizeSgsRows } from '../lib/calc/indices.mjs';
import { daysInMonth } from '../lib/calc/calendar.mjs';
import * as XLSX from 'xlsx';

function monthlyRows(pairs) {
  return pairs.map(([period, value]) => {
    const [year, month] = period.split('-').map(Number);
    const day = daysInMonth(period);
    return { data: `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`, valor: value };
  });
}

const FIXTURES = new Map([
  [433, monthlyRows([['2026-01', '0.50'], ['2026-02', '0.40'], ['2026-03', '0.30'], ['2026-04', '0.20']])],
  [29543, monthlyRows([['2026-01', '0.500000'], ['2026-02', '0.500000'], ['2026-03', '0.400000'], ['2026-04', '0.400000']])]
]);

let fetchCalls = 0;
const source = createCalcSource({
  fetchSeriesImpl: async (code, { from, to }) => {
    fetchCalls += 1;
    const rows = FIXTURES.get(code);
    if (!rows) throw Object.assign(new Error(`sem fixture para ${code}`), { statusCode: 500 });
    return normalizeSgsRows(rows.map(row => ({ ...row })), `fixture ${code}`);
  }
});

const csrfFlags = [];
const assertAuthenticated = (req, requireCsrf = false) => {
  csrfFlags.push(Boolean(requireCsrf));
  if (requireCsrf && req.headers?.['x-csrf-token'] !== 'token-teste') {
    throw Object.assign(new Error('CSRF inválido.'), { statusCode: 403 });
  }
  return { username: 'teste', role: 'admin' };
};

let nextBody = {};
const fabricaCalls = [];
const fakeFabrica = {
  configured: true,
  baseUrl: 'https://fabrica-de-calculos.app.trf3.jus.br',
  indices: async (tabela, query) => {
    fabricaCalls.push({ op: 'indices', tabela, query });
    return { status: 'ok', ok: true, result: { '2024-01': { ipca: '0,44' } } };
  },
  lerDocumento: async (tipo, options) => {
    fabricaCalls.push({ op: 'ler', tipo, bytes: options.buffer?.length || 0, text: options.text ? options.text.length : 0 });
    return {
      status: 'ok',
      ok: true,
      result: {
        dadosSegurado: { nome: 'Segurado Sintético', cpf: '000.000.000-00' },
        periodosContribuicao: [
          { dataInicial: '01/01/2020', dataFinal: '31/12/2020', descricao: 'Empresa Sintética Ltda', formaContagem: 'EMPREGADO' },
          { dataInicial: '2021-03-01', dataFinal: '2021-12-31', descricao: 'Segundo vínculo sintético', formaContagem: 'CONTRIBUINTE_INDIVIDUAL' }
        ],
        salarios: [
          { competencia: '2020-01', valor: 2000 },
          { competencia: '2020-02', valor: '2.000,00' }
        ]
      }
    };
  },
  calcularTempo: async () => ({ status: 'ok', ok: true, result: { totais: { simples: '1a' } } }),
  calcularTempoPorGrupos: async () => ({ status: 'ok', ok: true, result: [] }),
  calcularTempoPrevjud: async () => ({ status: 'ok', ok: true, result: {} }),
  calcularAtrasados: async () => ({ status: 'ok', ok: true, result: { totalDevido: { total: '0' } } }),
  calcularRmi: async () => ({ status: 'ok', ok: true, result: [] }),
  calcularRmiPorFundamento: async () => ({ status: 'ok', ok: true, result: [] }),
  calcularRmiDesvinculada: async () => ({ status: 'ok', ok: true, result: {} })
};
const fakeOcr = {
  disponivel: async () => true,
  reconhecer: async () => ({
    texto: 'Relações Previdenciárias\nCNPJ 44.444.444/0001-44 Empresa OCR Ltda\n01/2020 1.000,00\n02/2020 1.000,00',
    paginas: 2,
    dpi: 250
  })
};
const handler = createCalcHttpHandler({
  source,
  assertAuthenticated,
  readJson: async () => nextBody,
  /* Serializa como o servidor real (`res.end(JSON.stringify(payload))`): um stub que
   * só guarda o objeto esconde payload não serializável (BigInt derruba a rota). */
  json: (res, status, payload) => {
    res.statusCode = status;
    res.serializado = JSON.stringify(payload);
    res.body = JSON.parse(res.serializado);
  },
  ocr: fakeOcr,
  fabrica: fakeFabrica
});

function get(path, socket = '127.0.0.1') {
  const res = {
    writeHead(statusCode, headers) { res.statusCode = statusCode; res.headers = headers; },
    end(chunk) { res.raw = String(chunk ?? ''); }
  };
  const req = { method: 'GET', socket: { remoteAddress: socket }, headers: {} };
  return handler(req, res, new URL(`http://localhost${path}`)).then(handled => ({ handled, res }));
}

function post(path, body, headers = {}) {
  nextBody = body;
  const res = {};
  const req = { method: 'POST', socket: { remoteAddress: '127.0.0.1' }, headers };
  return handler(req, res, new URL(`http://localhost${path}`)).then(handled => ({ handled, res }));
}

const notCalc = await handler({ method: 'GET', socket: { remoteAddress: 'local' } }, {}, new URL('http://localhost/api/state'));
assert.equal(notCalc, false, 'Handler não pode capturar rotas fora de /api/calc/.');

const catalog = await get('/api/calc/catalog');
assert.equal(catalog.handled, true);
assert.equal(catalog.res.statusCode, 200);
assert.equal(catalog.res.body.ok, true);
assert.equal(catalog.res.body.series.length, 11);
assert.ok(catalog.res.body.series.some(serie => serie.key === 'IPCA' && serie.code === 433));
assert.ok(catalog.res.body.series.some(serie => serie.key === 'TR' && serie.code === 7811), 'Alias TR deve usar a série mensal 7811.');
assert.equal(catalog.res.body.regimes.length, 4);
assert.ok(catalog.res.body.regimes.find(track => track.track === 'geral').regimes.length === 3);
assert.ok(catalog.res.body.tabelas.resumo.total >= 20);
assert.deepEqual(catalog.res.body.especies, ['debito', 'amortizacao', 'custas', 'despesa', 'desconto']);

const series = await get('/api/calc/series/ipca?from=2026-01-01&to=2026-04-30');
assert.equal(series.res.statusCode, 200);
assert.equal(series.res.body.serie.code, 433);
assert.equal(series.res.body.ultimaCompetencia, '2026-04');
assert.equal(series.res.body.rows.length, 4);
assert.equal(series.res.body.rows[0].value, '0.500000');
assert.throws(() => resolverSerie('DESCONHECIDA'), { name: 'SerieError' });

const missingWindow = await get('/api/calc/series/IPCA').catch(error => error);
assert.equal(missingWindow.statusCode, 400);
const unknownSeries = await get('/api/calc/series/NAO-EXISTE?from=2026-01-01&to=2026-04-30').catch(error => error);
assert.equal(unknownSeries.statusCode, 400);
const hugeWindow = await get('/api/calc/series/IPCA?from=2000-01-01&to=2026-04-30').catch(error => error);
assert.equal(hugeWindow.statusCode, 400);
assert.throws(() => assertWindow('2026-04-01', '2026-01-01'), { name: 'CivelError' });

const previewBody = {
  atualizacaoAte: '2026-04-20',
  correcao: { serie: 'IPCA' },
  juros: { tipo: 'taxa-legal' },
  itens: [{ id: 'principal', especie: 'debito', descricao: 'Dano material', data: '2026-01-15', valor: '1000.00' }]
};

const csrfRejected = await post('/api/calc/civel/preview', previewBody).catch(error => error);
assert.equal(csrfRejected.statusCode, 403, 'Preview exige CSRF.');

const preview = await post('/api/calc/civel/preview', previewBody, { 'x-csrf-token': 'token-teste' });
assert.equal(preview.res.statusCode, 200);
assert.equal(preview.res.body.ok, true);
assert.equal(preview.res.body.calculo.itens[0].fatorCorrecao, '1.009026024000');
assert.equal(preview.res.body.calculo.resumo.total, '1023.41');
assert.equal(preview.res.body.calculo.memoria.some(entry => entry.tipo === 'juros'), true);
assert.equal(preview.res.body.entradas.correcao, 'serie');
assert.deepEqual(preview.res.body.series.map(item => item.key), ['IPCA']);
assert.equal(preview.res.body.taxaLegal.ultimaCompetencia, '2026-04');
assert.equal(csrfFlags.filter(Boolean).length >= 1, true, 'POST precisa sinalizar exigência de CSRF.');

const callsAfterFirst = fetchCalls;
const previewAgain = await post('/api/calc/civel/preview', previewBody, { 'x-csrf-token': 'token-teste' });
assert.equal(previewAgain.res.statusCode, 200);
assert.equal(fetchCalls, callsAfterFirst, 'Cache de séries deve evitar nova consulta idêntica.');
assert.ok(source.size() >= 2);

nextBody = { atualizacaoAte: '2026-04-20', itens: [] };
const invalidBody = await post('/api/calc/civel/preview', nextBody, { 'x-csrf-token': 'token-teste' }).catch(error => error);
assert.equal(invalidBody.statusCode, 400);

let rateLimited = null;
for (let index = 0; index < 61; index += 1) {
  try {
    await get('/api/calc/catalog', '10.0.0.9');
  } catch (error) {
    rateLimited = error;
  }
}
assert.equal(rateLimited?.statusCode, 429, 'Limite por socket deve responder 429.');

const missing = await get('/api/calc/inexistente');
assert.equal(missing.handled, true);
assert.equal(missing.res.statusCode, 404);

const trabalhistaBody = {
  salario: '3000.00',
  admissao: '2024-03-10',
  desligamento: '2026-04-15',
  tipoDesligamento: 'sem_justa_causa',
  diasTrabalhados: 15,
  aviso: 'indenizado',
  feriasVencidas: 1,
  saldoFgts: '10000.00'
};
const trabalhistaRejected = await post('/api/calc/trabalhista/preview', trabalhistaBody).catch(error => error);
assert.equal(trabalhistaRejected.statusCode, 403, 'Preview trabalhista exige CSRF.');
const trabalhista = await post('/api/calc/trabalhista/preview', trabalhistaBody, { 'x-csrf-token': 'token-teste' });
assert.equal(trabalhista.res.statusCode, 200);
assert.equal(trabalhista.res.body.calculo.resumo.liquido, '15350.00');
assert.equal(trabalhista.res.body.entradas.tipoDesligamento, 'sem_justa_causa');
assert.equal(trabalhista.res.body.calculo.parametros.projecaoAte, '2026-05-21');
const trabalhistaInvalid = await post('/api/calc/trabalhista/preview', { salario: '0' }, { 'x-csrf-token': 'token-teste' }).catch(error => error);
assert.equal(trabalhistaInvalid.statusCode, 400);

const previdenciarioBody = {
  sexo: 'feminino',
  competencias: [
    { competencia: '2024-01', salario: '2000.00' },
    { competencia: '2024-02', salario: '2000.00' },
    { competencia: '2024-03', salario: '2000.00' }
  ],
  teto: '7000.00',
  piso: '1518.00'
};
const previdenciarioRejected = await post('/api/calc/previdenciario/preview', previdenciarioBody).catch(error => error);
assert.equal(previdenciarioRejected.statusCode, 403, 'Preview previdenciário exige CSRF.');
const previdenciario = await post('/api/calc/previdenciario/preview', previdenciarioBody, { 'x-csrf-token': 'token-teste' });
assert.equal(previdenciario.res.statusCode, 200);
assert.equal(previdenciario.res.body.calculo.resumo.salarioBeneficio, '2000.00');
assert.equal(previdenciario.res.body.calculo.resumo.coeficiente, '60.00');
assert.equal(previdenciario.res.body.calculo.resumo.rmi, '1518.00', 'Piso aplicado sobre RMI de 1200.');
assert.equal(previdenciario.res.body.entradas.competencias, 3);
const previdenciarioCorrigido = await post('/api/calc/previdenciario/preview', {
  sexo: 'feminino',
  corrigirSalarios: true,
  referenciaCorrecao: '2025-02',
  competencias: [
    { competencia: '2004-01', salario: '3000.00' },
    { competencia: '2004-02', salario: '2000.00' }
  ]
}, { 'x-csrf-token': 'token-teste' });
assert.equal(previdenciarioCorrigido.res.statusCode, 200);
assert.equal(previdenciarioCorrigido.res.body.calculo.parametros.correcaoAtiva, true);
assert.equal(previdenciarioCorrigido.res.body.calculo.correcao.parcelas[0].corrigido, '7655.80');
assert.equal(previdenciarioCorrigido.res.body.calculo.resumo.salarioBeneficio, previdenciarioCorrigido.res.body.calculo.correcao.salarioBeneficio);
const previdenciarioInvalid = await post('/api/calc/previdenciario/preview', { sexo: 'feminino', competencias: [] }, { 'x-csrf-token': 'token-teste' }).catch(error => error);
assert.equal(previdenciarioInvalid.statusCode, 400);

const tempoPreview = await post('/api/calc/tempo/preview', {
  dataReferencia: '2026-01-31',
  vinculos: [
    { inicio: '2015-01-01', fim: '2024-12-31', empresa: 'Empresa Teste' }
  ],
  ultimaContribuicao: '2025-06-15',
  contribuicoesMeses: 130
}, { 'x-csrf-token': 'token-teste' });
assert.equal(tempoPreview.res.statusCode, 200);
assert.equal(tempoPreview.res.body.tempo.totalDias, 3653);
assert.equal(tempoPreview.res.body.tempo.carenciaMeses, 120);
assert.equal(tempoPreview.res.body.qualidade.fimPeriodo, '2027-06-30');
assert.equal(tempoPreview.res.body.qualidade.prorrogacao, true);
const tempoRejected = await post('/api/calc/tempo/preview', { vinculos: [] }).catch(error => error);
assert.equal(tempoRejected.statusCode, 403, 'Preview de tempo exige CSRF.');
const tempoInvalid = await post('/api/calc/tempo/preview', {}, { 'x-csrf-token': 'token-teste' }).catch(error => error);
assert.equal(tempoInvalid.statusCode, 400);

const complementar = await post('/api/calc/previdenciario/complementar', {
  pcd: { sexo: 'feminino', grau: 'grave', tempoMeses: 260, carenciaMeses: 210, media: '6554.10' },
  fator: { sexo: 'masculino', idadeAnos: 55, tempoContribuicaoMeses: 420, expectativaSobrevidaAnos: 25 },
  retorno: { rmi: '6554.10', mesesRecebimento: 300, idadeAnos: 57 }
}, { 'x-csrf-token': 'token-teste' });
assert.equal(complementar.res.statusCode, 200);
assert.equal(complementar.res.body.pcd.elegivel, true);
assert.equal(complementar.res.body.pcd.rmi, '6554.10');
assert.equal(complementar.res.body.fator.fator, '0.7198');
assert.equal(complementar.res.body.retorno.decimos, 25);
const complementarRejected = await post('/api/calc/previdenciario/complementar', { pcd: { sexo: 'feminino', grau: 'grave', tempoMeses: 1, carenciaMeses: 1 } }).catch(error => error);
assert.equal(complementarRejected.statusCode, 403, 'Análise complementar exige CSRF.');
const complementarVazio = await post('/api/calc/previdenciario/complementar', {}, { 'x-csrf-token': 'token-teste' }).catch(error => error);
assert.equal(complementarVazio.statusCode, 400);

const cnisRejected = await post('/api/calc/cnis/parse', { texto: '01/2024 1.000,00' }).catch(error => error);
assert.equal(cnisRejected.statusCode, 403, 'Importação de CNIS exige CSRF.');
const cnis = await post('/api/calc/cnis/parse', { texto: 'Empresa Exemplo — 01/2024 1.234,56\nEmpresa Exemplo — 02/2024 2.000,00' }, { 'x-csrf-token': 'token-teste' });
assert.equal(cnis.res.statusCode, 200);
assert.deepEqual(cnis.res.body.competencias.map(({ competencia, salario }) => ({ competencia, salario })), [
  { competencia: '2024-01', salario: '1234.56' },
  { competencia: '2024-02', salario: '2000.00' }
]);
assert.ok(Array.isArray(cnis.res.body.avisos));
const cnisInvalid = await post('/api/calc/cnis/parse', { texto: '' }, { 'x-csrf-token': 'token-teste' }).catch(error => error);
assert.equal(cnisInvalid.statusCode, 400);

const window = calcularJanela('2026-01-15', '2026-04-20');
assert.deepEqual(window, { fromPeriod: '2026-01', toPeriod: '2026-04', from: '2026-01-01', to: '2026-04-30' });

await assert.rejects(() => previewCivel({}, source), { name: 'CivelError' });

const extratoTexto = [
  'Relações Previdenciárias',
  'CNPJ 11.111.111/0001-11 Empresa Exemplo Alfa Ltda 01/03/2015',
  '01/2019 2.000,00',
  '02/2019 2.000,00',
  '04/2019 2.500,00 PEXT'
].join('\n');
const cnisTexto = await post('/api/calc/cnis/parse', { texto: extratoTexto }, { 'x-csrf-token': 'token-teste' });
assert.equal(cnisTexto.res.statusCode, 200);
assert.equal(cnisTexto.res.body.modo, 'texto');
assert.equal(cnisTexto.res.body.vinculos.length, 1);
assert.equal(cnisTexto.res.body.resumo.competencias, 3);
assert.equal(cnisTexto.res.body.indicadores.length, 1);
assert.ok(cnisTexto.res.body.avisos.some(aviso => /indicador/i.test(aviso)));

const cnisCsv = await post('/api/calc/cnis/parse', { filename: 'cnis.csv', content: 'Competência;Remuneração\n01/2020;1.000,00\n02/2020;1.000,00' }, { 'x-csrf-token': 'token-teste' });
assert.equal(cnisCsv.res.body.modo, 'planilha');
assert.equal(cnisCsv.res.body.resumo.competencias, 2);

const workbook = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([['Competência', 'Remuneração'], ['01/2021', '1.500,00']]), 'CNIS');
const xlsxBase64 = Buffer.from(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' })).toString('base64');
const cnisXlsx = await post('/api/calc/cnis/parse', { filename: 'cnis.xlsx', base64: xlsxBase64 }, { 'x-csrf-token': 'token-teste' });
assert.equal(cnisXlsx.res.body.modo, 'planilha');
assert.equal(cnisXlsx.res.body.resumo.competencias, 1);

const pdfInvalido = await post('/api/calc/cnis/parse', { filename: 'cnis.pdf', base64: Buffer.from('nao e pdf').toString('base64') }, { 'x-csrf-token': 'token-teste' }).catch(error => error);
assert.equal(pdfInvalido.statusCode, 400);

const template = await get('/api/calc/cnis/template');
assert.equal(template.res.statusCode, 200);
assert.match(template.res.raw, /Competência;Remuneração/);
assert.match(String(template.res.headers['Content-Disposition']), /modelo-cnis-atrium\.csv/);

const depsPdfIlegivel = {
  analisarPdfCnis: async () => ({
    totalPages: 11,
    texto: '\u0001\u0002\u0003'.repeat(300),
    qualidade: { utilizavel: false, motivos: ['Excesso de caracteres de controle'], metricas: { caracteres: 900 } },
    modoRecomendado: 'ocr'
  })
};
const precisaOcr = await analisarEntradaCnis({ filename: 'extrato.pdf', base64: Buffer.from('x').toString('base64') }, fakeOcr, depsPdfIlegivel);
assert.equal(precisaOcr.modo, 'ocr-necessario');
assert.equal(precisaOcr.precisaOcr, true);
assert.match(precisaOcr.avisos[0], /camada de texto/);

const viaOcr = await analisarEntradaCnis({ filename: 'extrato.pdf', base64: Buffer.from('x').toString('base64'), ocr: true }, fakeOcr, depsPdfIlegivel);
assert.equal(viaOcr.modo, 'ocr');
assert.equal(viaOcr.resumo.competencias, 2);
assert.match(viaOcr.avisos[0], /OCR/);

await assert.rejects(
  () => analisarEntradaCnis({ filename: 'extrato.pdf', base64: 'eA==', ocr: true }, { disponivel: async () => false, reconhecer: async () => ({}) }, depsPdfIlegivel),
  error => error.statusCode === 503
);

// ── Importação unificada: oficial primeiro, local como segunda opinião declarada ──
const importarRejected = await post('/api/calc/cnis/importar', { texto: extratoTexto }).catch(error => error);
assert.equal(importarRejected.statusCode, 403, 'Importação unificada exige CSRF.');

const importarOficial = await post('/api/calc/cnis/importar', { filename: 'cnis-sintetico.pdf', base64: Buffer.from('%PDF-1.4 sintetico').toString('base64') }, { 'x-csrf-token': 'token-teste' });
assert.equal(importarOficial.res.statusCode, 200);
assert.equal(importarOficial.res.body.modo, 'oficial');
assert.equal(importarOficial.res.body.fonte, 'fabrica');
assert.equal(importarOficial.res.body.dadosSegurado.nome, 'Segurado Sintético');
assert.equal(importarOficial.res.body.vinculos.length, 2);
assert.equal(importarOficial.res.body.vinculos[0].inicio, '2020-01-01');
assert.equal(importarOficial.res.body.vinculos[1].tipo, 'contribuinte_individual');
assert.deepEqual(importarOficial.res.body.competencias.map(({ competencia, salario }) => ({ competencia, salario })), [
  { competencia: '2020-01', salario: '2000.00' },
  { competencia: '2020-02', salario: '2000.00' }
]);
assert.equal(importarOficial.res.body.resumo.competencias, 2);
assert.ok(importarOficial.res.body.avisos.some(aviso => /Fábrica de Cálculos/.test(aviso)));
assert.ok(fabricaCalls.at(-1).bytes > 0, 'PDF do CNIS deve chegar à extração oficial como binário.');

const importarOficialTexto = await post('/api/calc/cnis/importar', { texto: extratoTexto }, { 'x-csrf-token': 'token-teste' });
assert.equal(importarOficialTexto.res.body.fonte, 'fabrica');
assert.ok(fabricaCalls.at(-1).text > 0, 'Texto colado também pode usar a extração oficial.');

const falhaFabricaHandler = createCalcHttpHandler({
  source,
  assertAuthenticated,
  readJson: async () => nextBody,
  json: (res, status, payload) => { res.statusCode = status; res.body = payload; },
  ocr: fakeOcr,
  fabrica: { configured: true, baseUrl: 'https://fabrica-de-calculos.app.trf3.jus.br', lerDocumento: async () => { throw new Error('oficial indisponível (teste)'); } }
});
nextBody = { texto: extratoTexto };
const falhaFabricaRes = {};
await falhaFabricaHandler({ method: 'POST', socket: { remoteAddress: '127.0.0.1' }, headers: { 'x-csrf-token': 'token-teste' } }, falhaFabricaRes, new URL('http://localhost/api/calc/cnis/importar'));
assert.equal(falhaFabricaRes.statusCode, 200, 'Falha oficial não pode derrubar a importação local.');
assert.equal(falhaFabricaRes.body.fonte, 'local');
assert.equal(falhaFabricaRes.body.oficial, false);
assert.equal(falhaFabricaRes.body.vinculos.length, 1);
assert.match(falhaFabricaRes.body.avisos[0], /extração oficial da Fábrica de Cálculos falhou/i);

const localHandler = createCalcHttpHandler({
  source,
  assertAuthenticated,
  readJson: async () => nextBody,
  json: (res, status, payload) => { res.statusCode = status; res.body = payload; },
  ocr: fakeOcr,
  fabrica: null
});
nextBody = { texto: extratoTexto };
const localRes = {};
await localHandler({ method: 'POST', socket: { remoteAddress: '127.0.0.1' }, headers: { 'x-csrf-token': 'token-teste' } }, localRes, new URL('http://localhost/api/calc/cnis/importar'));
assert.equal(localRes.body.fonte, 'local');
assert.ok(!localRes.body.avisos.some(aviso => /falhou/i.test(aviso)), 'Sem fábrica configurada não há falha a declarar.');

const importarVazio = await post('/api/calc/cnis/importar', {}, { 'x-csrf-token': 'token-teste' }).catch(error => error);
assert.equal(importarVazio.statusCode, 400);

// ── Fábrica de Cálculos (TRF3): rotas autenticadas e falha fechada sem chave ──
const fabricaStatus = await get('/api/calc/fabrica/status');
assert.equal(fabricaStatus.res.statusCode, 200);
assert.equal(fabricaStatus.res.body.configured, true);
assert.equal(fabricaStatus.res.body.limits.publicPostsPerMinute, 30);

const fabricaIndices = await get('/api/calc/fabrica/indices?tabela=tabela&competenciaInicial=2024-01&competenciaFinal=2024-01&indice=ipca');
assert.equal(fabricaIndices.res.statusCode, 200);
assert.equal(fabricaIndices.res.body.tabela, 'tabela');
assert.equal(fabricaIndices.res.body.envelope.result['2024-01'].ipca, '0,44');
assert.deepEqual(fabricaCalls.at(-1).query.indice, ['ipca']);

const fabricaDoc = await post('/api/calc/fabrica/documentos', {
  tipo: 'cnis',
  filename: 'cnis-sintetico.pdf',
  base64: Buffer.from('%PDF-1.4 sintetico').toString('base64')
}, { 'x-csrf-token': 'token-teste' });
assert.equal(fabricaDoc.res.statusCode, 200);
assert.equal(fabricaDoc.res.body.envelope.result.dadosSegurado.nome, 'Segurado Sintético');
assert.ok(fabricaCalls.at(-1).bytes > 0, 'Documento deve chegar ao cliente oficial como binário.');

const fabricaDocMissing = await post('/api/calc/fabrica/documentos', { tipo: 'cnis' }, { 'x-csrf-token': 'token-teste' }).catch(error => error);
assert.equal(fabricaDocMissing.statusCode, 400);
assert.equal(fabricaDocMissing.code, 'FABRICA_DOCUMENT_MISSING');

const fabricaDocNoCsrf = await post('/api/calc/fabrica/documentos', { tipo: 'cnis', text: 'x' }, {}).catch(error => error);
assert.equal(fabricaDocNoCsrf.statusCode, 403, 'Leitura documental exige CSRF.');

const fabricaTempo = await post('/api/calc/fabrica/calculo/tempo', { dataApuracao: '2026-09-21' }, { 'x-csrf-token': 'token-teste' });
assert.equal(fabricaTempo.res.statusCode, 200);
assert.equal(fabricaTempo.res.body.tipo, 'tempo');
assert.equal(fabricaTempo.res.body.envelope.result.totais.simples, '1a');

const fabricaTipoInvalido = await post('/api/calc/fabrica/calculo/inexistente', {}, { 'x-csrf-token': 'token-teste' }).catch(error => error);
assert.equal(fabricaTipoInvalido.statusCode, 400);

const semFabricaHandler = createCalcHttpHandler({  source,
  assertAuthenticated,
  readJson: async () => nextBody,
  json: (res, status, payload) => { res.statusCode = status; res.body = payload; },
  fabrica: { configured: false, baseUrl: 'https://fabrica-de-calculos.app.trf3.jus.br', indices: async () => ({ status: 'ok', result: {} }) }
});
const semFabricaRes = {};
const semFabricaHandled = await semFabricaHandler(
  { method: 'GET', socket: { remoteAddress: '127.0.0.1' }, headers: {} },
  semFabricaRes,
  new URL('http://localhost/api/calc/fabrica/indices?tabela=tabela')
).catch(error => error);
assert.equal(semFabricaHandled.statusCode, 409, 'Sem chave, a rota falha fechada com 409.');
assert.equal(semFabricaHandled.code, 'FABRICA_NOT_CONFIGURED');

console.log('Rotas de cálculo aprovadas: catálogo, séries, previews, CNIS por texto/CSV/XLSX/PDF com OCR, template e Fábrica de Cálculos (índices, documentos, cálculos e falha fechada) PASS.');
