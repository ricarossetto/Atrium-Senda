import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { analisarPdfCnis } from '../lib/calc/cnis-pdf.mjs';
import { parseCnisExtrato } from '../lib/calc/cnis-extrato.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT = path.join(ROOT, 'artifacts', 'calc-cnis');
fs.mkdirSync(OUTPUT, { recursive: true });

const vinculosSinteticos = [
  { cnpj: 'CNPJ 11.111.111/0001-11', empregador: 'Empresa Exemplo Alfa Ltda', inicio: '01/03/2015', fim: '31/12/2019', remuneracoes: [['01/2019', '2.000,00', ''], ['04/2019', '2.500,00', 'PEXT'], ['05/2019', '2.500,00', '']] },
  { cnpj: 'CNPJ 22.222.222/0001-22', empregador: 'Empresa Exemplo Beta S.A.', inicio: '01/06/2018', fim: '31/12/2019', remuneracoes: [['01/2019', '1.500,00', ''], ['03/2019', '1.800,00', 'PREC']] }
];
const beneficios = [['NB 123.456.789-0', '01/02/2020', '30/06/2020', '1.045,00']];

const html = `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><title>Extrato Previdenciário (CNIS) — fixture sintética</title>
<style>
  body { font-family: Arial, Helvetica, sans-serif; font-size: 11px; color: #111; }
  h1 { font-size: 14px; margin: 0 0 8px; }
  h2 { font-size: 12px; margin: 14px 0 6px; border-bottom: 1px solid #333; padding-bottom: 2px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
  th, td { border: 1px solid #999; padding: 3px 5px; text-align: left; }
  th { background: #eee; }
  .aviso { margin-top: 14px; font-size: 10px; color: #333; }
</style></head>
<body>
  <h1>Extrato Previdenciário (CNIS) — Relações Previdenciárias e Remunerações</h1>
  <p><strong>Segurado(a):</strong> Segurada Teste &nbsp; <strong>CPF:</strong> 000.000.000-00 &nbsp; <strong>NIT:</strong> 000.00000.00-0</p>
  <p class="aviso">Documento sintético gerado para testes do ATRIUM. Não contém dados de pessoa real.</p>
  <h2>Relações Previdenciárias</h2>
  <table><thead><tr><th>CNPJ</th><th>Empregador</th><th>Início</th><th>Fim</th></tr></thead><tbody>
    ${vinculosSinteticos.map(vinculo => `<tr><td>${vinculo.cnpj}</td><td>${vinculo.empregador}</td><td>${vinculo.inicio}</td><td>${vinculo.fim}</td></tr>`).join('')}
  </tbody></table>
  <h2>Remunerações</h2>
  ${vinculosSinteticos.map(vinculo => `
    <p><strong>${vinculo.cnpj} ${vinculo.empregador} ${vinculo.inicio} ${vinculo.fim}</strong></p>
    <table><thead><tr><th>Competência</th><th>Remuneração (R$)</th><th>Indicadores</th></tr></thead><tbody>
      ${vinculo.remuneracoes.map(linha => `<tr><td>${linha[0]}</td><td>${linha[1]}</td><td>${linha[2]}</td></tr>`).join('')}
    </tbody></table>`).join('')}
  <h2>Benefícios</h2>
  <table><thead><tr><th>Número</th><th>Início</th><th>Fim</th><th>Valor</th></tr></thead><tbody>
    ${beneficios.map(linha => `<tr><td>${linha[0]}</td><td>${linha[1]}</td><td>${linha[2]}</td><td>${linha[3]}</td></tr>`).join('')}
  </tbody></table>
</body></html>`;

const browser = await chromium.launch({ headless: true });
let pdfBuffer;
try {
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: 'load' });
  pdfBuffer = await page.pdf({ format: 'A4', printBackground: true });
} finally {
  await browser.close();
}
assert.ok(pdfBuffer.length > 1000, 'PDF sintético precisa ser gerado com conteúdo.');

const arquivoSintetico = path.join(OUTPUT, 'cnis-sintetico.pdf');
fs.writeFileSync(arquivoSintetico, pdfBuffer);

const analise = await analisarPdfCnis(pdfBuffer);
assert.equal(analise.qualidade.utilizavel, true, `PDF sintético precisa ter texto utilizável: ${analise.qualidade.motivos.join(' ')}`);
assert.equal(analise.modoRecomendado, 'texto');
assert.equal(analise.qualidade.metricas.competenciasReconhecidas >= 5, true);
assert.equal(analise.qualidade.metricas.cnpjReconhecidos >= 2, true);

const extrato = parseCnisExtrato(analise.texto, { origem: 'texto' });
assert.equal(extrato.vinculos.length, 2);
assert.equal(extrato.resumo.competencias, 5);
assert.equal(extrato.resumo.beneficios, 1);
assert.deepEqual(extrato.concomitancias, [{ competencia: '2019-01', vinculos: [0, 1] }]);
assert.deepEqual(extrato.lacunas, ['2019-02']);
assert.deepEqual(extrato.indicadores.map(item => item.codigo).sort(), ['PEXT', 'PREC']);
assert.deepEqual(extrato.competencias.map(item => `${item.competencia}:${item.salario}`), [
  '2019-01:2000.00',
  '2019-01:1500.00',
  '2019-03:1800.00',
  '2019-04:2500.00',
  '2019-05:2500.00'
]);
assert.equal(extrato.vinculos[0].empregador, 'Empresa Exemplo Alfa Ltda');
assert.equal(extrato.vinculos[1].empregador, 'Empresa Exemplo Beta S.A.');

console.log(`CNIS sintético aprovado: PDF de ${analise.totalPages} página(s), ${extrato.resumo.vinculos} vínculos, ${extrato.resumo.competencias} competências, ${extrato.resumo.indicadores} indicadores, ${extrato.resumo.lacunas} lacuna, ${extrato.resumo.concomitancias} concomitância e ${extrato.resumo.beneficios} benefício. Evidência: ${path.relative(ROOT, arquivoSintetico)}`);
