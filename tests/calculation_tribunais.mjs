import assert from 'node:assert/strict';
import {
  TabelaError,
  TABELAS,
  tabela,
  tabelasPorOrgao,
  tabelasPorStatus,
  resumoCatalogo,
  validarCatalogo,
  mesesDeDefasagem,
  alertaDefasagem,
  fontesOficiais
} from '../lib/calc/tribunais.mjs';

const resumo = validarCatalogo();
assert.equal(resumo.total, Object.keys(TABELAS).length);
assert.ok(resumo.total >= 20, 'Catálogo deve cobrir fóruns federal, estadual e trabalhista.');
assert.equal(resumo.porStatus.automatica, 9, 'Séries federais automáticas do BCB devem estar declaradas.');
assert.ok(resumo.porStatus['pendente-curadoria'] >= 10);
assert.ok(resumo.orgaos.includes('CNJ'));
assert.ok(resumo.orgaos.includes('TJRS'));
assert.ok(resumo.orgaos.includes('JF'));

assert.equal(Object.isFrozen(TABELAS), true);
assert.equal(Object.isFrozen(tabela('tjrs-igpm')), true);
assert.equal(tabela('tjrs-igpm').fonte.url, 'https://www.tjrs.jus.br/');
assert.equal(tabela('federal-taxa-legal').fonte.tipo, 'api');
assert.ok(tabela('federal-taxa-legal').fonte.documento.includes('trf4.jus.br'));
assert.match(tabela('cnj-303-je-np').fonte.url, /^https:\/\/atos\.cnj\.jus\.br/);
assert.equal(tabela('tst-ipcae').categoria, 'justica-trabalho');
assert.throws(() => tabela('inexistente'), TabelaError);

assert.equal(tabelasPorOrgao('CNJ').length, 2);
assert.equal(tabelasPorOrgao('jf').length, 3);
assert.equal(tabelasPorOrgao('BCB').length, 3);
assert.equal(tabelasPorOrgao('BCB/IBGE').length, 4);
assert.throws(() => tabelasPorOrgao(''), TabelaError);

const automaticas = tabelasPorStatus('automatica');
assert.equal(automaticas.length, 9);
assert.ok(automaticas.every(entry => entry.fonte.tipo === 'api'));
assert.ok(automaticas.every(entry => entry.fonte.url.includes('api.bcb.gov.br')));
assert.equal(tabelasPorStatus('pendente-curadoria').every(entry => Boolean(entry.nota)), true);
assert.throws(() => tabelasPorStatus('outro'), TabelaError);

const urls = fontesOficiais();
assert.ok(urls.length > 0);
assert.ok(urls.every(url => url.startsWith('https://')));
assert.deepEqual(urls, [...urls].sort());
assert.equal(new Set(urls).size, urls.length);

assert.equal(mesesDeDefasagem('2026-01', '2026-01'), 0);
assert.equal(mesesDeDefasagem('2026-01', '2026-04'), 3);
assert.equal(mesesDeDefasagem('2026-05', '2026-04'), 0);
assert.throws(() => mesesDeDefasagem('', '2026-04'), TabelaError);

assert.deepEqual(alertaDefasagem('federal-sgs-ipca', '2026-04', '2026-07'), {
  tabela: 'federal-sgs-ipca',
  defasagemMeses: 3,
  situacao: 'desatualizada'
});
assert.deepEqual(alertaDefasagem('federal-sgs-inpc', '2026-07', '2026-07'), {
  tabela: 'federal-sgs-inpc',
  defasagemMeses: 0,
  situacao: 'atualizada'
});
assert.deepEqual(alertaDefasagem('tjrs-igpm', '2026-04', '2026-07'), {
  tabela: 'tjrs-igpm',
  defasagemMeses: 3,
  situacao: 'curadoria-pendente'
});
assert.throws(() => alertaDefasagem('inexistente', '2026-04', '2026-07'), TabelaError);

console.log('Catálogo de tabelas aprovado: procedência HTTPS, séries automáticas do BCB, curadoria pendente explícita e alerta de defasagem PASS.');
