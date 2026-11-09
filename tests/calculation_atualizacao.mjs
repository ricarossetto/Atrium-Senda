import assert from 'node:assert/strict';
import { AtualizacaoError, tetoVigente, fatorAtualizacao, corrigirSalario, fontesAtualizacao } from '../lib/calc/tabelas-atualizacao.mjs';
import { toFixedString, parseDec } from '../lib/calc/decimal.mjs';

assert.equal(tetoVigente('1998-08').teto, '1081.50');
assert.equal(tetoVigente('2004-01').teto, '2400.00');
assert.equal(tetoVigente('2004-06').teto, '2508.72');
assert.equal(tetoVigente('2025-02').teto, '8157.41', 'Teto de 2025 vale até a próxima portaria.');
assert.equal(tetoVigente('2026-01').teto, '8475.55');
assert.equal(tetoVigente('2026-09').teto, '8475.55', 'Teto vigente segue até nova portaria.');
assert.throws(() => tetoVigente('1990-01'), AtualizacaoError);
assert.throws(() => tetoVigente('2026-13'), Error);

const fontes = fontesAtualizacao();
assert.match(fontes.tetos, /Portarias Interministeriais/);
assert.match(fontes.inpc, /SGS\/BCB/);

const fator2004 = fatorAtualizacao('2004-01', '2025-02');
assert.ok(Math.abs(Number(fator2004.indice) - 3.189919) < 0.0001, `Fator 01/2004→02/2025 próximo do oficial (${fator2004.indice}).`);
assert.equal(fator2004.indice, '3.189917');
assert.equal(fatorAtualizacao('2024-01', '2025-02').indice, '1.063185', 'Fator 01/2024→02/2025 confere com o oficial.');
assert.equal(fatorAtualizacao('2025-02', '2025-02').indice, '1.014800', 'Regra inclusiva: fev/2025 usa o próprio INPC de fev/2025.');
assert.equal(fatorAtualizacao('2025-01', '2025-02').indice, '1.014800', 'jan/2025 + fev/2025 (jan = 0,00%) também resulta no índice oficial.');
assert.throws(() => fatorAtualizacao('2025-03', '2025-02'), AtualizacaoError);
assert.throws(() => fatorAtualizacao('2025-02', '2025-02', { serie: [] }), AtualizacaoError);

const serieSintetica = [
  { competencia: '2024-01', taxa: '1.00' },
  { competencia: '2024-02', taxa: '2.00' }
];
assert.equal(fatorAtualizacao('2024-01', '2024-02', { serie: serieSintetica }).indice, '1.030200', 'Série injetável: 1% e 2% inclusivos.');
assert.equal(fatorAtualizacao('2024-02', '2024-02', { serie: serieSintetica }).indice, '1.020000');

const corrigido = corrigirSalario('2004-01', '3000.00', '2025-02');
assert.equal(corrigido.teto, '2400.00');
assert.equal(corrigido.considerado, '2400.00', 'Salário acima do teto da época é limitado antes de corrigir.');
assert.equal(corrigido.indice, '3.189917');
assert.equal(corrigido.corrigido, '7655.80', '2400 × 3,189917 = 7.655,80.');
assert.equal(corrigirSalario('2004-01', '1000.00', '2025-02').considerado, '1000.00');
assert.throws(() => corrigirSalario('2004-01', '-1', '2025-02'), AtualizacaoError);

console.log('Atualização de salários aprovada: tetos oficiais, INPC embutido, regra inclusiva, teto antes da correção e séries injetáveis PASS.');
