/**
 * Aquisição do snapshot público LC 142 a partir da Fábrica de Cálculos.
 *
 * Por que isto existe no SERVIDOR e não no navegador:
 * o snapshot carrega proveniência (`source_url`, `response_sha256`,
 * `retrieved_at`) e é a base de índices, piso e teto do cálculo. Se o
 * navegador pudesse montá-lo, um cliente adulterado forjaria índices e a
 * "proveniência" viraria teatro. O servidor busca na fonte oficial, calcula o
 * hash do corpo realmente recebido e devolve o snapshot pronto — o frontend só
 * guarda e reenvia o que o servidor emitiu.
 *
 * Falha fechada: sem `FC_API_KEY`, sem índice para a competência ou corpo
 * inesperado, o resultado é erro declarado, nunca snapshot sintético.
 */

import { createHash } from 'node:crypto';

import { Lc142SnapshotError } from './lc142-snapshot.mjs';
import { isValidCompetence } from './calendar-30360.mjs';
import { LC142_SNAPSHOT_URL_PREFIX } from './lc142-profile.mjs';

/** Campos de índice que o motor LC 142 consome. */
const CAMPOS_TAXA = Object.freeze(['inpc', 'igpdi', 'ipcr', 'inpc_inss']);

/**
 * Traduz os nomes de índice da Fábrica para os campos do snapshot.
 * A Fábrica usa rótulos/abreviações; o motor usa nomes oficiais estáveis.
 */
const ALIASES = Object.freeze({
  inpc: ['inpc', 'INPC', 'inpc_geral'],
  igpdi: ['igpdi', 'IGP-DI', 'igp_di', 'IGPDI'],
  ipcr: ['ipcr', 'IPC-R', 'ipc_r', 'IPCR'],
  inpc_inss: ['inpc_inss', 'INPC-INSS', 'inpc_inss_serie', 'INPC_INSS']
});

function primeiraChave(objeto, candidatos) {
  for (const chave of candidatos) {
    if (objeto && Object.prototype.hasOwnProperty.call(objeto, chave)) {
      const valor = objeto[chave];
      if (valor !== undefined && valor !== null) return valor;
    }
  }
  return null;
}

/**
 * Converte um percentual publicado em decimal de taxa (1% -> "0.01").
 *
 * A Fábrica publica variação percentual; o motor trabalha com fração decimal.
 * Nada de `Number` em dinheiro — aqui é taxa, e a conversão é puramente textual
 * para não perder a representação publicada.
 */
export function percentualParaTaxa(raw) {
  if (raw === null || raw === undefined || raw === '') return null;
  const texto = String(raw).trim().replace(/\s/g, '').replace(',', '.');
  if (!/^[+-]?\d+(\.\d+)?$/.test(texto)) {
    throw new Lc142SnapshotError(`Percentual de índice inválido: ${texto.slice(0, 24)}.`);
  }
  const negativo = texto.startsWith('-');
  const semSinal = texto.replace(/^[+-]/, '');
  const [inteira, fracao = ''] = semSinal.split('.');

  // Dividir por 100 = mover a vírgula 2 casas para a esquerda. Sobre os dígitos
  // puros, a vírgula fica a `fracao.length + 2` posições do fim.
  const digitos = `${inteira}${fracao}`;
  const deslocamento = fracao.length + 2;
  const preenchido = digitos.padStart(deslocamento + 1, '0');
  const corte = preenchido.length - deslocamento;
  const parteInteira = preenchido.slice(0, corte) || '0';
  const parteFracionaria = preenchido.slice(corte);

  const semZerosEsquerda = parteInteira.replace(/^0+(?=\d)/, '') || '0';
  const fracaoLimpa = parteFracionaria.replace(/0+$/, '');
  const montado = fracaoLimpa ? `${semZerosEsquerda}.${fracaoLimpa}` : semZerosEsquerda;
  const zero = /^0(\.0*)?$/.test(montado);
  return `${negativo && !zero ? '-' : ''}${montado}`;
}

/**
 * Extrai as linhas mensais do corpo da Fábrica, aceitando os formatos que a API
 * oficial já devolveu (array direto, `{ dados: [] }`, `{ tabela: [] }`).
 */
function extrairLinhas(payload) {
  if (Array.isArray(payload)) return payload;
  for (const chave of ['dados', 'tabela', 'rows', 'itens', 'data']) {
    if (Array.isArray(payload?.[chave])) return payload[chave];
  }
  return [];
}

/**
 * Normaliza uma linha da Fábrica para o formato do snapshot.
 * Devolve `null` quando a linha não é uma competência reconhecível.
 */
function normalizarLinha(linha) {
  if (!linha || typeof linha !== 'object') return null;
  const competencia = primeiraChave(linha, ['competencia', 'month', 'mes', 'periodo', 'data']);
  if (!competencia) return null;
  const texto = String(competencia).trim();
  // Aceita "AAAA-MM", "AAAA-MM-DD" e "MM/AAAA".
  let mes = null;
  if (/^\d{4}-\d{2}$/.test(texto)) mes = texto;
  else if (/^\d{4}-\d{2}-\d{2}$/.test(texto)) mes = texto.slice(0, 7);
  else {
    const br = /^(\d{1,2})\/(\d{4})$/.exec(texto);
    if (br) mes = `${br[2]}-${String(br[1]).padStart(2, '0')}`;
  }
  if (!mes || !isValidCompetence(mes)) return null;

  const taxas = {};
  for (const campo of CAMPOS_TAXA) {
    const bruto = primeiraChave(linha, ALIASES[campo]);
    taxas[campo] = bruto === null ? null : percentualParaTaxa(bruto);
  }
  const temAlgum = CAMPOS_TAXA.some(campo => taxas[campo] !== null);
  if (!temAlgum) return null;
  return { month: mes, ...taxas };
}

/**
 * Limites de piso e teto por competência.
 *
 * O perfil LC 142 exige `minimum`/`ceiling` por mês com fundamento declarado. A
 * Fábrica não devolve piso/teto RGPS no endpoint de índices, então o chamador
 * deve informá-los; sem eles o snapshot fica inválido e o motor bloqueia — que
 * é o comportamento honesto. Nunca preencher com constante inventada.
 */
function normalizarLimites(limites) {
  if (!Array.isArray(limites) || limites.length === 0) {
    throw new Lc142SnapshotError(
      'Limites de piso e teto não informados. O snapshot exige valor e fundamento por competência.'
    );
  }
  return limites.map(item => {
    const mes = String(item?.month ?? '').trim();
    if (!isValidCompetence(mes)) throw new Lc142SnapshotError('Competência de limite inválida.');
    return {
      month: mes,
      minimum: String(item.minimum ?? '').trim(),
      ceiling: String(item.ceiling ?? '').trim(),
      minimum_source: String(item.minimum_source ?? '').slice(0, 2000),
      ceiling_source: String(item.ceiling_source ?? '').slice(0, 2000)
    };
  });
}

/**
 * Monta o snapshot a partir do corpo bruto recebido da Fábrica.
 *
 * `corpoBruto` é a string EXATA recebida — o SHA-256 é calculado sobre ela, de
 * modo que a proveniência corresponde aos bytes realmente obtidos, e não a uma
 * reserialização nossa.
 */
export function montarSnapshotLc142({
  corpoBruto,
  payload,
  through,
  limites,
  sourceUrl,
  retrievedAt
}) {
  if (typeof corpoBruto !== 'string' || !corpoBruto) {
    throw new Lc142SnapshotError('Corpo do índice ausente; não é possível atestar proveniência.');
  }
  if (!isValidCompetence(String(through ?? ''))) {
    throw new Lc142SnapshotError('Competência de corte do snapshot inválida.');
  }
  const url = String(sourceUrl ?? '');
  if (!url.startsWith(LC142_SNAPSHOT_URL_PREFIX)) {
    throw new Lc142SnapshotError('URL de origem do snapshot fora do domínio oficial.');
  }
  const instante = String(retrievedAt ?? '');
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/.test(instante)) {
    throw new Lc142SnapshotError('Instante de coleta do snapshot inválido.');
  }

  const linhas = extrairLinhas(payload);
  const rates = [];
  const vistos = new Set();
  for (const linha of linhas) {
    const normalizada = normalizarLinha(linha);
    if (!normalizada) continue;
    if (normalizada.month > through) continue;
    if (vistos.has(normalizada.month)) continue;
    vistos.add(normalizada.month);
    rates.push(normalizada);
  }
  if (rates.length === 0) {
    throw new Lc142SnapshotError(
      'A Fábrica não devolveu índices utilizáveis para este intervalo; cálculo não pode prosseguir.'
    );
  }
  rates.sort((a, b) => (a.month < b.month ? -1 : a.month > b.month ? 1 : 0));

  return {
    through,
    source_url: url,
    response_sha256: createHash('sha256').update(corpoBruto, 'utf8').digest('hex'),
    retrieved_at: instante,
    rates,
    limits: normalizarLimites(limites)
  };
}
