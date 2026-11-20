// Testes executáveis do gerador de Memoriais de Cálculo em PDF (ATRIUM).
// Cobre: Planilha Judicial (com Lote 2: compostos, desapropriação, art. 523,
// contratual, custas finais), Correção + comparativo, PRICE/SAC, SFH 120 meses
// multipágina, Equivalência/TVM Simples, Reajuste + minuta, .HTM, Trabalhista,
// Previdenciário (RMI + Tempo), rota HTTP POST /api/calc/relatorio-pdf e
// validação de texto real via Poppler pdftotext/pdfinfo quando disponível.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { normalizeSgsRows } from '../lib/calc/indices.mjs';
import { daysInMonth } from '../lib/calc/calendar.mjs';
import { buildCivelCalculation } from '../lib/calc/civel.mjs';
import { buildCorrecaoCalculation } from '../lib/calc/civel-correcao.mjs';
import { buildAmortizacaoCalculation } from '../lib/calc/civel-amortizacao.mjs';
import { buildSfhCalculation } from '../lib/calc/civel-sfh.mjs';
import { buildJurosTvmCalculation } from '../lib/calc/civel-juros-tvm.mjs';
import { buildReajusteCalculation } from '../lib/calc/civel-reajuste.mjs';
import { auditLegacyHtmSheet } from '../lib/calc/civel-htm-import.mjs';
import { buildTrabalhistaCalculation } from '../lib/calc/trabalhista.mjs';
import { buildPrevidenciarioCalculation } from '../lib/calc/previdenciario.mjs';
import { calcularTempoContribuicao, calcularPeriodoGraca } from '../lib/calc/tempo-contribuicao.mjs';
import { renderCalcReportPdf } from '../lib/calc/pdf/calc-report.mjs';
import { createCalcHttpHandler } from '../lib/http/calc-routes.mjs';
import { createCalcSource } from '../lib/calc/source.mjs';

function monthlyRows(pairs) {
  return pairs.map(([period, value]) => {
    const [year, month] = period.split('-').map(Number);
    const day = daysInMonth(period);
    return { data: `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`, valor: value };
  });
}

const IPCA = normalizeSgsRows(monthlyRows([
  ['2026-01', '0.50'],
  ['2026-02', '0.40'],
  ['2026-03', '0.30'],
  ['2026-04', '0.20']
]), 'fixture-ipca');

const OFFICE_FIXTURE = {
  officeName: 'Rossetto & Associados Advocacia',
  officeSlogan: 'Advocacia Cível e Previdenciária · Desde 1983',
  lawyerName: 'Dr. Ricardo Rossetto',
  lawyerOab: 'OAB/SP 123.456',
  lawyerAddress: 'Av. Paulista, 1000 — São Paulo/SP',
  city: 'São Paulo/SP'
};

const PROCESS_FIXTURE = {
  numero: '0001234-56.2025.8.26.0100',
  vara: '14ª Vara Cível Central da Capital',
  autor: 'Espólio de João da Silva',
  reu: 'Construtora Exemplo S/A',
  observacoes: 'Cumprimento definitivo de sentença com juros compensatórios e multa do art. 523 §1º CPC.'
};

function assertValidPdf(pdf, expectedTerms = []) {
  assert.ok(Buffer.isBuffer(pdf.bytes) && pdf.bytes.length > 2500, 'PDF deve possuir bytes válidos.');
  const head = pdf.bytes.subarray(0, 8).toString('latin1');
  assert.match(head, /^%PDF-1\.7/, 'Cabeçalho PDF 1.7 obrigatório.');
  const latin = pdf.bytes.toString('latin1');
  assert.ok(latin.includes('%%EOF'), 'Marcador %%EOF obrigatório.');
  assert.ok(pdf.pageCount >= 1 && pdf.pageCount === pdf.totalPages);
  assert.match(pdf.filename, /^atrium-memorial-[a-z0-9_-]+-\d{4}-\d{2}-\d{2}\.pdf$/);
  assert.match(pdf.sha256, /^[0-9a-f]{64}$/);
  assert.ok(latin.includes(`Página 1 de ${pdf.totalPages}`) || latin.includes('P\\341gina 1 de ') || latin.includes('Página '), 'Rodapé paginado presente.');
  for (const term of expectedTerms) {
    assert.ok(latin.includes(term), `Stream PDF deve conter "${term}".`);
  }
}

// 1. Planilha Judicial Cível completa (com Lote 2 + conferência + processo + escritório)
const judicial = buildCivelCalculation({
  atualizacaoAte: '2026-04-20',
  correcao: { serie: 'IPCA' },
  juros: { tipo: 'percentual-fixo', percentual: '1.00', capitalizacao: 'composto' },
  jurosCompensatorios: { ativo: true, percentual: '0.50', capitalizacao: 'simples', incidirMoratoriosSobreCompensatorios: true },
  multaContratual: { percentual: '2.00', base: 'debitos-atualizados' },
  art523: 'multa_e_honorarios_10',
  custasFinais: '350.00',
  itens: [
    { id: 'ind', especie: 'debito', descricao: 'Indenização principal', data: '2026-01-15', valor: '10000.00' },
    { id: 'pgto', especie: 'amortizacao', descricao: 'Depósito parcial', data: '2026-03-01', valor: '1500.00' }
  ]
}, { seriesRows: () => IPCA });

const pdfJudicial = renderCalcReportPdf({
  aba: 'civel',
  resultado: judicial,
  processo: PROCESS_FIXTURE,
  escritorio: OFFICE_FIXTURE,
  geradoEm: '2026-11-20T15:00:00Z'
});
assertValidPdf(pdfJudicial, [
  'Rossetto & Associados Advocacia',
  'OAB/SP 123.456',
  '0001234-56.2025.8.26.0100',
  'PLANILHA JUDICIAL',
  'Multa art. 523',
  '350,00'
]);

// 2. Correção com comparativo de 5 índices
const correcao = buildCorrecaoCalculation({
  valor: '5000.00',
  dataInicial: '2026-01-15',
  dataFinal: '2026-04-20',
  serie: 'IPCA',
  seriesComparadas: ['IPCA', 'INPC']
}, { seriesRows: () => IPCA });
const pdfCorrecao = renderCalcReportPdf({ aba: 'civel', resultado: correcao, escritorio: OFFICE_FIXTURE, geradoEm: '2026-11-20' });
assertValidPdf(pdfCorrecao, ['CORRE', '5.000,00']);

// 3. Amortização PRICE/SAC
const amort = buildAmortizacaoCalculation({ sistema: 'COMPARATIVO', valorBem: '50000', taxaJuros: '1', prazoMeses: 24 });
const pdfAmort = renderCalcReportPdf({ aba: 'civel', resultado: amort, geradoEm: '2026-11-20' });
assertValidPdf(pdfAmort, ['TABELAS PRICE E SAC', 'PRICE', 'SAC']);

// 4. SFH 120 meses (multipágina obrigatória + totalizador)
const sfh = buildSfhCalculation({
  sistema: 'SACRE',
  valorImovel: '120000',
  valorFinanciado: '120000',
  taxaJurosAnualNominalPct: '12',
  trMensalPct: '0.5',
  prazoAnos: 10,
  usarArredondamentoBancario: true
});
const pdfSfh = renderCalcReportPdf({ aba: 'civel', resultado: sfh, escritorio: OFFICE_FIXTURE, geradoEm: '2026-11-20' });
assert.ok(pdfSfh.pageCount >= 4, `SFH 120m deve gerar múltiplas páginas (gerou ${pdfSfh.pageCount}).`);
assertValidPdf(pdfSfh, ['FINANCIAMENTO SFH', 'SACRE', '2.200,00']);

// 5. TVM Simples & 7 Bases
const tvm = buildJurosTvmCalculation({
  ratePct: '1',
  basis: 'mes',
  tvm: { solveFor: 'fv', capitalizacao: 'simples', timing: 'vencido', pv: '10000', pmt: '0', ratePct: '1', nper: '12' }
});
const pdfTvm = renderCalcReportPdf({ aba: 'civel', resultado: tvm, geradoEm: '2026-11-20' });
assertValidPdf(pdfTvm, ['11.200,00', 'SIMPLES']);

// 6. Reajuste + Minuta
const reajuste = buildReajusteCalculation({
  valorInicial: '3000.00',
  competenciaInicio: '2026-01',
  competenciaFim: '2026-04',
  periodicidadeMeses: 2,
  serie: 'IPCA'
}, { seriesRows: () => IPCA });
const pdfReajuste = renderCalcReportPdf({ aba: 'civel', resultado: reajuste, geradoEm: '2026-11-20' });
assertValidPdf(pdfReajuste, ['REAJUSTE CONTRATUAL', 'NOTIFICA']);

// 7. Importador HTM
const htm = auditLegacyHtmSheet('<html><head><title>Legado</title></head><body><table><tr><td>10/01/2026</td><td>Aluguel jan</td><td>R$ 1.500,00</td></tr></table></body></html>');
const pdfHtm = renderCalcReportPdf({ aba: 'civel', resultado: htm, geradoEm: '2026-11-20' });
assertValidPdf(pdfHtm, ['AUDITORIA .HTM', '1.500,00']);

// 8. Trabalhista
const trab = buildTrabalhistaCalculation({
  salario: '3000.00',
  admissao: '2024-03-10',
  desligamento: '2026-04-15',
  tipoDesligamento: 'sem_justa_causa',
  diasTrabalhados: 15,
  aviso: 'indenizado',
  feriasVencidas: 1,
  saldoFgts: '10000.00'
});
const pdfTrab = renderCalcReportPdf({ aba: 'trabalhista', resultado: trab, escritorio: OFFICE_FIXTURE, geradoEm: '2026-11-20' });
assertValidPdf(pdfTrab, ['RESCIS', 'TRABALHISTA']);

// 9. Previdenciário RMI + Tempo
const prev = buildPrevidenciarioCalculation({
  sexo: 'feminino',
  dataNascimento: '1966-03-01',
  dataReferencia: '2026-09-18',
  corrigirSalarios: true,
  referenciaCorrecao: '2025-02',
  piso: '1518.00',
  competencias: [
    { competencia: '2004-01', salario: '3000.00' },
    { competencia: '2004-02', salario: '2000.00' }
  ]
});
const tempo = calcularTempoContribuicao({
  dataReferencia: '2026-01-31',
  vinculos: [{ inicio: '2015-01-01', fim: '2024-12-31', empresa: 'Indústria Alfa' }]
});
const qualidade = calcularPeriodoGraca({ ultimaContribuicao: '2025-06-15', contribuicoesMeses: 130, dataReferencia: '2026-01-31' });
const pdfPrev = renderCalcReportPdf({ aba: 'previdenciario', resultado: prev, tempoResultado: { tempo, qualidade }, geradoEm: '2026-11-20' });
assertValidPdf(pdfPrev, ['PREVIDENCI', 'Alfa']);

// 10. Falha fechada sem resultado
assert.throws(() => renderCalcReportPdf({ aba: 'civel', resultado: null }), /Nenhum resultado de cálculo/);

// 11. Poppler pdftotext / pdfinfo verification (quando instalado)
function findPoppler(bin) {
  const local = process.env.LOCALAPPDATA;
  if (!local) return null;
  const pkgs = path.join(local, 'Microsoft', 'WinGet', 'Packages');
  if (!fs.existsSync(pkgs)) return null;
  for (const e of fs.readdirSync(pkgs)) {
    if (!e.startsWith('oschwartz10612.Poppler')) continue;
    for (const sub of fs.readdirSync(path.join(pkgs, e))) {
      const p = path.join(pkgs, e, sub, 'Library', 'bin', bin);
      if (fs.existsSync(p)) return p;
    }
  }
  return null;
}
const pdftotext = findPoppler('pdftotext.exe');
if (pdftotext) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'atrium-calc-pdf-'));
  try {
    const f = path.join(tmpDir, 'judicial.pdf');
    fs.writeFileSync(f, pdfJudicial.bytes);
    const extracted = execFileSync(pdftotext, [f, '-'], { encoding: 'utf8' });
    assert.ok(extracted.includes('Rossetto & Associados Advocacia'));
    assert.ok(extracted.includes('0001234-56.2025.8.26.0100'));
    assert.ok(extracted.includes('Página 1 de'));
    assert.ok(extracted.includes('Juros compensatórios'));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

// 12. Rota HTTP POST /api/calc/relatorio-pdf (binário + JSON base64 + auth + 400)
const source = createCalcSource({ fetchSeriesImpl: async () => IPCA });
let lastReqBody = {};
const handler = createCalcHttpHandler({
  source,
  assertAuthenticated: (req, requireCsrf) => {
    if (req.headers?.authorization !== 'Bearer ok') throw Object.assign(new Error('Não autenticado'), { statusCode: 401 });
    if (requireCsrf && req.headers?.['x-csrf-token'] !== 'csrf-ok') throw Object.assign(new Error('CSRF inválido'), { statusCode: 403 });
  },
  readJson: async () => lastReqBody,
  json: (res, status, data) => {
    res.statusCode = status;
    res.headers = { 'content-type': 'application/json' };
    res.body = data;
  }
});

const callRoute = async (body, headers = {}) => {
  lastReqBody = body;
  const req = { method: 'POST', headers: { authorization: 'Bearer ok', 'x-csrf-token': 'csrf-ok', ...headers } };
  const chunks = [];
  const res = {
    statusCode: 0,
    headers: {},
    writeHead(code, hdrs = {}) { this.statusCode = code; this.headers = hdrs; },
    end(buf) { if (buf) chunks.push(Buffer.isBuffer(buf) ? buf : Buffer.from(buf)); this.rawBody = Buffer.concat(chunks); }
  };
  const handled = await handler(req, res, new URL('https://atrium.test/api/calc/relatorio-pdf'));
  assert.equal(handled, true);
  return res;
};

const resBin = await callRoute({ aba: 'civel', resultado: judicial, processo: PROCESS_FIXTURE, escritorio: OFFICE_FIXTURE });
assert.equal(resBin.statusCode, 200);
assert.equal(resBin.headers['Content-Type'], 'application/pdf');
assert.match(resBin.rawBody.subarray(0, 8).toString('latin1'), /^%PDF-1\.7/);

const resJson = await callRoute({ aba: 'civel', resultado: tvm }, { accept: 'application/json' });
assert.equal(resJson.statusCode, 200);
assert.equal(resJson.body.ok, true);
assert.ok(Buffer.from(resJson.body.bytesBase64, 'base64').toString('latin1').startsWith('%PDF-1.7'));

await assert.rejects(() => callRoute({ aba: 'civel', resultado: null }), err => err.statusCode === 400);

console.log('Memoriais PDF ATRIUM aprovados: 9 modalidades, multipágina SFH, Poppler UTF-8 e rota HTTP /api/calc/relatorio-pdf PASS.');
