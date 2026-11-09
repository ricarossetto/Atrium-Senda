import { periodsInRange } from './calendar.mjs';

export class TabelaError extends Error {
  constructor(message) {
    super(message);
    this.name = 'TabelaError';
  }
}

const STATUS = new Set(['automatica', 'pendente-curadoria']);
const ATUALIZACOES = new Set(['diaria', 'mensal', 'eventual']);

function definirTabela(id, orgao, nome, categoria, indices, fonte, atualizacao, status, nota) {
  if (!id || !orgao || !nome) throw new TabelaError('Tabela exige id, órgão e nome.');
  if (!STATUS.has(status)) throw new TabelaError(`Status inválido para ${id}: ${status}.`);
  if (!ATUALIZACOES.has(atualizacao)) throw new TabelaError(`Atualização inválida para ${id}: ${atualizacao}.`);
  if (!Array.isArray(indices) || indices.length === 0) throw new TabelaError(`Tabela ${id} exige índices declarados.`);
  if (!fonte || !fonte.url) throw new TabelaError(`Tabela ${id} exige fonte oficial.`);
  return Object.freeze({ id, orgao, nome, categoria, indices: Object.freeze(indices), fonte: Object.freeze(fonte), atualizacao, status, nota: nota || null });
}

export const TABELAS = Object.freeze({
  'federal-sgs-ipca': definirTabela('federal-sgs-ipca', 'BCB/IBGE', 'IPCA — variação mensal (SGS 433)', 'federal', ['IPCA'], { url: 'https://api.bcb.gov.br/dados/serie/bcdata.sgs.433/dados?formato=json', tipo: 'api' }, 'mensal', 'automatica'),
  'federal-sgs-inpc': definirTabela('federal-sgs-inpc', 'BCB/IBGE', 'INPC — variação mensal (SGS 188)', 'federal', ['INPC'], { url: 'https://api.bcb.gov.br/dados/serie/bcdata.sgs.188/dados?formato=json', tipo: 'api' }, 'mensal', 'automatica'),
  'federal-sgs-igpm': definirTabela('federal-sgs-igpm', 'BCB/FGV', 'IGP-M — variação mensal (SGS 189)', 'federal', ['IGP-M'], { url: 'https://api.bcb.gov.br/dados/serie/bcdata.sgs.189/dados?formato=json', tipo: 'api' }, 'mensal', 'automatica', 'A Calculadora do Cidadão usa a série 28655 para correção; conferir contra a fonte oficial.'),
  'federal-sgs-ipca15': definirTabela('federal-sgs-ipca15', 'BCB/IBGE', 'IPCA-15 — variação mensal (SGS 7478)', 'federal', ['IPCA-15'], { url: 'https://api.bcb.gov.br/dados/serie/bcdata.sgs.7478/dados?formato=json', tipo: 'api' }, 'mensal', 'automatica'),
  'federal-sgs-ipcae': definirTabela('federal-sgs-ipcae', 'BCB/IBGE', 'IPCA-E — variação mensal (SGS 10764)', 'federal', ['IPCA-E'], { url: 'https://api.bcb.gov.br/dados/serie/bcdata.sgs.10764/dados?formato=json', tipo: 'api' }, 'mensal', 'automatica'),
  'federal-sgs-selic-mensal': definirTabela('federal-sgs-selic-mensal', 'BCB', 'SELIC acumulada no mês (SGS 4390)', 'federal', ['SELIC'], { url: 'https://api.bcb.gov.br/dados/serie/bcdata.sgs.4390/dados?formato=json', tipo: 'api' }, 'mensal', 'automatica'),
  'federal-sgs-tr': definirTabela('federal-sgs-tr', 'BCB', 'TR — Taxa Referencial mensal (SGS 7811, taxa do dia 1º)', 'federal', ['TR'], { url: 'https://api.bcb.gov.br/dados/serie/bcdata.sgs.7811/dados?formato=json', tipo: 'api' }, 'mensal', 'automatica', 'A série 226 divulga a mesma taxa com frequência diária; use 7811 em cadeias mensais.'),
  'federal-sgs-poupanca': definirTabela('federal-sgs-poupanca', 'BCB', 'Poupança a partir de 04/05/2012 (SGS 195)', 'federal', ['Poupança'], { url: 'https://api.bcb.gov.br/dados/serie/bcdata.sgs.195/dados?formato=json', tipo: 'api' }, 'mensal', 'automatica'),
  'federal-taxa-legal': definirTabela('federal-taxa-legal', 'BCB/CMN', 'Taxa Legal mensal (SGS 29543, Res. CMN 5.171/2024)', 'federal', ['Taxa Legal'], { url: 'https://api.bcb.gov.br/dados/serie/bcdata.sgs.29543/dados?formato=json', tipo: 'api', documento: 'https://www.trf4.jus.br/trf4/controlador.php?acao=pagina_visualizar&id_pagina=5220' }, 'mensal', 'automatica', 'Recalcular a partir dos fatores 29541/29542 e comparar com a série publicada.'),
  'cnj-303-je-np': definirTabela('cnj-303-je-np', 'CNJ', 'Resolução CNJ 303/2019 — precatórios expedidos após 25/03/2015 e débitos da Fazenda antes do precatório', 'justica-estadual', ['INPC', 'IPCA-E', 'UFIR', 'TR', 'SELIC'], { url: 'https://atos.cnj.jus.br/atos/detalhar/4451', tipo: 'norma' }, 'eventual', 'pendente-curadoria', 'Aguardando ingestão da tabela JE_NP da fonte; não usar fatores digitados manualmente.'),
  'cnj-303-je-npm': definirTabela('cnj-303-je-npm', 'CNJ', 'Resolução CNJ 303/2019 — precatórios expedidos até 25/03/2015 (modulada)', 'justica-estadual', ['ORTN', 'OTN', 'IPC', 'BTN', 'INPC', 'IPCA-E', 'UFIR', 'TR', 'SELIC'], { url: 'https://atos.cnj.jus.br/atos/detalhar/4451', tipo: 'norma' }, 'eventual', 'pendente-curadoria', 'Tabela JE_NPM; a cessão de crédito não altera a linha do tempo.'),
  encoge: definirTabela('encoge', 'ENCOGE', 'Tabela ENCOGE (XI Encontro — Carta de São Luís)', 'justica-estadual', ['INPC', 'IPCA-E', 'TR', 'SELIC'], { url: 'https://www.aasp.org.br/produtos-servicos/indices-economicos/indices-judiciais/', tipo: 'publicacao' }, 'eventual', 'pendente-curadoria', 'Ratificada pelo 54º ENCOGE e recomendada pelo CNJ; atualizada pela Lei 14.905/2024.'),
  'tjrs-igpm': definirTabela('tjrs-igpm', 'TJRS', 'Tabela prática do TJRS — correção por IGP-M', 'justica-estadual', ['IGP-M', 'IPCA', 'Taxa Legal'], { url: 'https://www.tjrs.jus.br/', tipo: 'portal' }, 'mensal', 'pendente-curadoria', 'Conferir o FAM vigente (débitos expurgados e não expurgados) antes do cálculo.'),
  'tjsp-14905': definirTabela('tjsp-14905', 'TJSP', 'Tabela do TJSP — INPC/IPCA-15 com Lei 14.905/2024', 'justica-estadual', ['INPC', 'IPCA-15', 'Taxa Legal'], { url: 'https://www.tjsp.jus.br/', tipo: 'portal' }, 'mensal', 'pendente-curadoria', 'Mapear a planilha oficial e validar um caso-âncora antes de liberar o uso.'),
  'tjrj-tabela': definirTabela('tjrj-tabela', 'TJRJ', 'Tabela do TJRJ — atualização de débitos', 'justica-estadual', ['INPC', 'IPCA-E', 'Taxa Legal'], { url: 'https://www.tjrj.jus.br/', tipo: 'portal' }, 'mensal', 'pendente-curadoria', 'Mapear a planilha oficial e validar um caso-âncora antes de liberar o uso.'),
  'tjmg-tabela': definirTabela('tjmg-tabela', 'TJMG', 'Tabela do TJMG — expurgada e não expurgada', 'justica-estadual', ['INPC', 'IGP-M', 'IPCA-E'], { url: 'https://www.tjmg.jus.br/', tipo: 'portal' }, 'mensal', 'pendente-curadoria', 'Distinguir as linhas expurgada e não expurgada na ingestão.'),
  'tjpr-tabela': definirTabela('tjpr-tabela', 'TJPR', 'Tabela do TJPR — precatórios e condenatórias', 'justica-estadual', ['IPCA-E', 'IGP-DI', 'INPC', 'SELIC'], { url: 'https://www.tjpr.jus.br/tabelas-precatorios', tipo: 'portal' }, 'mensal', 'pendente-curadoria', 'Ingerir as tabelas publicadas e guardar o hash do arquivo de origem.'),
  'tjdft-juriscalc': definirTabela('tjdft-juriscalc', 'TJDFT', 'Juriscalc — atualização monetária do TJDFT', 'justica-estadual', ['INPC', 'IGP-M', 'IPCA', 'SELIC'], { url: 'https://www.tjdft.jus.br/servicos/atualizacao-monetaria-1', tipo: 'portal' }, 'mensal', 'pendente-curadoria', 'Ingerir as tabelas publicadas e guardar o hash do arquivo de origem.'),
  'tjsc-icgj': definirTabela('tjsc-icgj', 'TJSC', 'Tabela do TJSC — ICGJ', 'justica-estadual', ['ICGJ', 'INPC'], { url: 'https://www.tjsc.jus.br/', tipo: 'portal' }, 'mensal', 'pendente-curadoria', 'Mapear a planilha oficial e validar um caso-âncora antes de liberar o uso.'),
  'jf-manual-267': definirTabela('jf-manual-267', 'JF', 'Justiça Federal — benefício previdenciário (Res. 267/2013)', 'justica-federal', ['INPC', 'SELIC'], { url: 'https://www.trf2.jus.br/trf2/artigo/dipre/tabelas-de-atualizacao-monetaria', tipo: 'portal' }, 'mensal', 'pendente-curadoria', 'Correção pelo INPC após a Lei 11.430/2006; juros conforme o período.'),
  'jf-condenatorias-fazenda': definirTabela('jf-condenatorias-fazenda', 'JF', 'Justiça Federal — condenatórias da Fazenda Pública', 'justica-federal', ['IPCA-E', 'SELIC'], { url: 'https://www.trf2.jus.br/trf2/artigo/dipre/tabelas-de-atualizacao-monetaria', tipo: 'portal' }, 'mensal', 'pendente-curadoria', 'EC 113/2021: SELIC única a partir de 09/12/2021, com consolidação em nov/2021.'),
  'jf-condenatorias-geral': definirTabela('jf-condenatorias-geral', 'JF', 'Justiça Federal — condenatórias em geral', 'justica-federal', ['INPC', 'IPCA-E', 'SELIC'], { url: 'https://www.trf2.jus.br/trf2/artigo/dipre/tabelas-de-atualizacao-monetaria', tipo: 'portal' }, 'mensal', 'pendente-curadoria', 'Ingerir as tabelas publicadas e guardar o hash do arquivo de origem.'),
  'tst-ipcae': definirTabela('tst-ipcae', 'JT/TST', 'Justiça do Trabalho — débitos trabalhistas por IPCA-E', 'justica-trabalho', ['IPCA-E', 'SELIC'], { url: 'https://www.tst.jus.br/', tipo: 'portal' }, 'mensal', 'pendente-curadoria', 'ADC 58 e EC 113/2021; conferir a tese vigente antes do cálculo.'),
  'tst-tr': definirTabela('tst-tr', 'JT/TST', 'Justiça do Trabalho — débitos trabalhistas por TR', 'justica-trabalho', ['TR', 'SELIC'], { url: 'https://www.tst.jus.br/', tipo: 'portal' }, 'mensal', 'pendente-curadoria', 'Períodos anteriores à ADC 58.'),
  ttbr: definirTabela('ttbr', 'JT/CSJT', 'TTBR — Tabela Uniforme para a Justiça do Trabalho', 'justica-trabalho', ['IPCA-E', 'SELIC'], { url: 'https://www.csjt.jus.br/', tipo: 'portal' }, 'mensal', 'pendente-curadoria', 'Ingerir as tabelas publicadas e guardar o hash do arquivo de origem.')
});

export function tabela(id) {
  const entry = TABELAS[id];
  if (!entry) throw new TabelaError(`Tabela desconhecida: ${id}.`);
  return entry;
}

export function tabelasPorOrgao(orgao) {
  if (!orgao) throw new TabelaError('Informe o órgão.');
  return Object.values(TABELAS).filter(entry => entry.orgao.toUpperCase() === String(orgao).toUpperCase());
}

export function tabelasPorStatus(status) {
  if (!STATUS.has(status)) throw new TabelaError(`Status inválido: ${status}.`);
  return Object.values(TABELAS).filter(entry => entry.status === status);
}

export function resumoCatalogo() {
  const porStatus = { automatica: 0, 'pendente-curadoria': 0 };
  const orgaos = new Set();
  for (const entry of Object.values(TABELAS)) {
    porStatus[entry.status] += 1;
    orgaos.add(entry.orgao);
  }
  return { total: Object.keys(TABELAS).length, porStatus, orgaos: [...orgaos].sort() };
}

export function validarCatalogo() {
  const ids = new Set();
  for (const [key, entry] of Object.entries(TABELAS)) {
    if (entry.id !== key) throw new TabelaError(`Chave ${key} diverge do id ${entry.id}.`);
    if (ids.has(entry.id)) throw new TabelaError(`Tabela duplicada: ${entry.id}.`);
    ids.add(entry.id);
    if (!entry.fonte.url.startsWith('https://')) throw new TabelaError(`Fonte de ${entry.id} deve usar HTTPS.`);
    if (entry.status === 'automatica' && entry.fonte.tipo !== 'api') {
      throw new TabelaError(`Tabela automática ${entry.id} deve ter fonte do tipo api.`);
    }
    if (entry.status === 'pendente-curadoria' && !entry.nota) {
      throw new TabelaError(`Tabela pendente ${entry.id} deve explicar a pendência na nota.`);
    }
    for (const indice of entry.indices) {
      if (!indice || typeof indice !== 'string') throw new TabelaError(`Índice inválido em ${entry.id}.`);
    }
  }
  return resumoCatalogo();
}

export function mesesDeDefasagem(ultimaCompetencia, competenciaReferencia) {
  if (!ultimaCompetencia || !competenciaReferencia) throw new TabelaError('Informe as competências para medir defasagem.');
  if (ultimaCompetencia >= competenciaReferencia) return 0;
  return periodsInRange(ultimaCompetencia, competenciaReferencia).length - 1;
}

export function alertaDefasagem(id, ultimaCompetencia, competenciaReferencia) {
  const entry = tabela(id);
  const defasagem = mesesDeDefasagem(ultimaCompetencia, competenciaReferencia);
  return {
    tabela: entry.id,
    defasagemMeses: defasagem,
    situacao: defasagem === 0 ? 'atualizada' : entry.status === 'pendente-curadoria' ? 'curadoria-pendente' : 'desatualizada'
  };
}

export function fontesOficiais() {
  const urls = new Set(Object.values(TABELAS).map(entry => entry.fonte.url));
  return [...urls].sort();
}
