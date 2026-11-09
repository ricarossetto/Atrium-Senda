import assert from 'node:assert/strict';
import test from 'node:test';
import { SERIES_OFICIAIS, conferirIndicesOficiais } from '../lib/calc/conferencia-indices.mjs';

const TABELA = {
  '2025-01': { ipca: 0.001, inpc: 0.002, igpm: 0.001 },
  '2025-02': { ipca: 0.002, inpc: 0.003, igpm: 0.001 },
  '2025-03': { ipca: 0.003, inpc: 0.004, igpm: 0.001 }
};

const CALCULO = {
  fontes: [
    { serie: 'IPCA', de: '2025-01', ate: '2025-03' },
    { serie: 'INPC', de: '2025-01', ate: '2025-03' },
    { serie: 'IGP-M', de: '2025-01', ate: '2025-04' },
    { serie: 'IPCA-15', de: '2025-01', ate: '2025-03' },
    { serie: 'SELIC', de: '2025-01', ate: '2025-03' }
  ],
  memoria: [
    {
      tipo: 'correcao',
      segmentos: [
        { serie: 'IPCA', de: '2025-01', ate: '2025-03', fator: '1.006011006000' },
        { serie: 'INPC', de: '2025-01', ate: '2025-03', fator: '1.020000000000' },
        { serie: 'IGP-M', de: '2025-01', ate: '2025-04', fator: '1.003000000000' }
      ]
    }
  ]
};

test('mapeia as séries oficiais suportadas', () => {
  assert.deepEqual(Object.keys(SERIES_OFICIAIS).sort(), ['IGP-DI', 'IGP-M', 'INPC', 'IPCA', 'IPCA-E', 'SELIC', 'TAXA-LEGAL', 'taxa-legal (SGS 29543)'].sort());
});

test('confere o fator do ATRIUM com a tabela oficial', () => {
  const conferencia = conferirIndicesOficiais(CALCULO, TABELA, { agora: new Date('2026-10-22T12:00:00Z') });
  const porSerie = Object.fromEntries(conferencia.fontes.map(fonte => [fonte.serie, fonte]));
  assert.equal(porSerie.IPCA.status, 'confere');
  assert.equal(porSerie.IPCA.fatorOficial, '1.006011006000');
  assert.equal(porSerie.IPCA.fatorAtrium, '1.006011006000');
  assert.equal(porSerie.IPCA.diferencaPercentual, '0.000000');
  assert.equal(porSerie.INPC.status, 'divergente');
  assert.match(porSerie.INPC.motivo, /difere da tabela oficial/);
  assert.equal(porSerie['IGP-M'].status, 'sem-dado');
  assert.equal(porSerie['IGP-M'].faltante, '2025-04');
  assert.equal(porSerie['IPCA-15'].status, 'sem-fonte');
  assert.equal(porSerie.SELIC.status, 'ignorado');
  assert.deepEqual(conferencia.resumo, { conferem: 1, divergentes: 1, semDado: 1, semFonte: 1, ignoradas: 1 });
  assert.deepEqual(conferencia.competencias, { de: '2025-01', ate: '2025-04' });
  assert.equal(conferencia.ultimaCompetenciaOficial, '2025-03');
  assert.equal(conferencia.toleranciaPercentual, '0.10');
  assert.equal(conferencia.geradoEm, '2026-10-22T12:00:00.000Z');
});

test('respeita a tolerância declarada', () => {
  const calculo = {
    fontes: [{ serie: 'IPCA', de: '2025-01', ate: '2025-02' }],
    memoria: [{ tipo: 'correcao', segmentos: [{ serie: 'IPCA', de: '2025-01', ate: '2025-02', fator: '1.002000000000' }] }]
  };
  const estrito = conferirIndicesOficiais(calculo, TABELA, { tolerancia: '0.0000001' });
  assert.equal(estrito.fontes[0].status, 'divergente');
  const folgado = conferirIndicesOficiais(calculo, TABELA, { tolerancia: '0.01' });
  assert.equal(folgado.fontes[0].status, 'confere');
});

test('recusa tabela oficial inválida', () => {
  assert.throws(() => conferirIndicesOficiais(CALCULO, null), /Tabela oficial/);
  assert.throws(() => conferirIndicesOficiais(CALCULO, []), /Tabela oficial/);
});
