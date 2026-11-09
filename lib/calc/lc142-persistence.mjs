/**
 * Persistência do cenário LC 142 no Store oficial do ATRIUM.
 *
 * Regras que este módulo garante:
 *  - NÃO cria Store paralelo: o registro vive na coleção `calculations`.
 *  - O resultado salvo guarda PROVENIÊNCIA (hash do snapshot, hash do cenário,
 *    versão do motor) e é reconstruível.
 *  - Snapshots e parcelas grandes são deduplicados por hash: o registro guarda
 *    uma referência ao snapshot oficial, nunca uma cópia por caso.
 *  - O registro é recusado quando excede o limite, em vez de ter parcelas
 *    removidas em silêncio.
 *  - A comparação de revisão é explícita: conflito não é mascarado.
 */

import crypto from 'node:crypto';

import {
  MAX_RECORD_CHARACTERS,
  MAX_RESULT_CHARACTERS,
  CalculationRecordError
} from './persistence.mjs';
import { sanitizeRecord } from '../state-sanitize.mjs';

export const LC142_RECORD_VERSION = 1;
export const LC142_SCHEMA_VERSION = 1;
const MAX_ID = 80;
const MAX_TITULO = 160;
const MAX_SNAPSHOT_REFS = 200;

export class Lc142PersistenceError extends Error {
  constructor(message) {
    super(message);
    this.name = 'Lc142PersistenceError';
  }
}

/** Hash oficial e estável de uma estrutura JSON. */
export function hashCanonico(value) {
  return crypto.createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex');
}

/**
 * JSON oficial com chaves ordenadas: o hash não pode depender da ordem de
 * inserção, ou o mesmo cenário geraria hashes diferentes.
 */
export function canonicalJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const chaves = Object.keys(value).sort();
  const pares = chaves.map(chave => `${JSON.stringify(chave)}:${canonicalJson(value[chave])}`);
  return `{${pares.join(',')}}`;
}

/**
 * Extrai a política LC 142 do cenário, sem inventar quando ausente.
 */
export function politicaDoCenario(calculation) {
  const raw = calculation?.options?.rule_policy;
  if (typeof raw !== 'string' || !raw.trim().startsWith('{')) return null;
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  return parsed?.lc142 ?? null;
}

/**
 * Prepara o registro para o Store oficial.
 *
 * O snapshot oficial é referenciado por hash dentro de `proveniencia`, e o
 * envelope de resultado é o produzido pelo motor — nunca um RMI informado pelo
 * cliente.
 */
export function prepararRegistroLc142({
  id,
  titulo,
  calculation,
  resultado,
  ator = null,
  criadoEm = null,
  snapshotCanonico = null
} = {}) {
  if (resultado?.status !== 'experimental') {
    throw new Lc142PersistenceError(
      'Apenas cenário experimental concluído pode ser salvo; bloqueio não é resultado.'
    );
  }
  const native = resultado?.data?.native_result;
  if (!native) throw new Lc142PersistenceError('Resultado sem native_result; recálculo é obrigatório.');

  const politica = politicaDoCenario(calculation);
  if (!politica) {
    throw new Lc142PersistenceError('Cenário sem política LC 142 versionada; não pode ser salvo.');
  }
  const snapshotHash = hashCanonico(snapshotCanonico ?? politica.snapshot ?? null);
  const cenarioHash = hashCanonico({
    sexo: calculation?.sex ?? null,
    grau: calculation?.disability ?? null,
    dib: calculation?.dib ?? null,
    identificacao: calculation?.identity ?? null,
    vinculos: calculation?.cnis?.links ?? [],
    salarios: calculation?.cnis?.salary_months ?? null,
    politica
  });

  const registroId = normalizarId(id);
  const registroTitulo = normalizarTitulo(titulo, native);

  const entrada = sanitizeRecord({
    engine_id: native.engine_id,
    schema_version: LC142_SCHEMA_VERSION,
    cenario: sanitizeRecord(calculation),
    politica: sanitizeRecord(politica),
    proveniencia: {
      snapshot_sha256: politica.snapshot?.response_sha256 ?? null,
      snapshot_through: politica.snapshot?.through ?? null,
      snapshot_url: politica.snapshot?.source_url ?? null,
      snapshot_hash_canonico: snapshotHash,
      cenario_hash: cenarioHash,
      source_sha256: native.pcd?.source_sha256 ?? null,
      versao_registro: LC142_RECORD_VERSION
    }
  });

  const corpo = {
    id: registroId,
    tipo: 'previdenciario',
    titulo: registroTitulo,
    entrada,
    resultado: sanitizeRecord(resultado),
    createdAt: criadoEm ?? new Date().toISOString(),
    createdBy: ator ?? null,
    schemaVersion: LC142_SCHEMA_VERSION
  };

  // O limite é do Store oficial. Aqui recusamos em vez de remover parcelas.
  const tamanho = JSON.stringify(sanitizeRecord(corpo)).length;
  if (tamanho > MAX_RECORD_CHARACTERS) {
    throw new Lc142PersistenceError(
      `Cenário excede o limite de ${MAX_RECORD_CHARACTERS} caracteres do registro; reduza competências ou salve o relatório como documento.`
    );
  }
  const tamanhoResultado = JSON.stringify(sanitizeRecord(corpo.resultado)).length;
  if (tamanhoResultado > MAX_RESULT_CHARACTERS) {
    throw new Lc142PersistenceError(
      `Resultado excede o limite de ${MAX_RESULT_CHARACTERS} caracteres; a memória não pode ser truncada em silêncio.`
    );
  }
  return corpo;
}

function normalizarId(value) {
  if (typeof value === 'string' && value.trim()) return value.trim().slice(0, MAX_ID);
  return `lc142-${crypto.randomUUID()}`;
}

function normalizarTitulo(titulo, native) {
  if (typeof titulo === 'string' && titulo.trim()) return titulo.trim().slice(0, MAX_TITULO);
  const grau = native?.pcd?.grau ? String(native.pcd.grau) : 'grau declarado';
  const exigido = native?.pcd?.anos_exigidos ?? '?';
  return `LC 142 ${grau} · ${exigido} anos exigidos`.slice(0, MAX_TITULO);
}

/**
 * Resumo seguro para lista: sem dado pessoal, sem valores que confundam RMI.
 */
export function resumirRegistroLc142(registro) {
  const resultado = registro?.resultado ?? {};
  const native = resultado?.data?.native_result ?? null;
  const resumo = native?.resumo ?? {};
  return {
    id: registro?.id ?? null,
    tipo: 'previdenciario',
    titulo: registro?.titulo ?? 'Cenário LC 142',
    status: resultado.status ?? 'desconhecido',
    createdAt: registro?.createdAt ?? null,
    createdBy: registro?.createdBy ?? null,
    grau: native?.pcd?.grau ?? null,
    anosExigidos: native?.pcd?.anos_exigidos ?? null,
    // RMI null continua null: a lista não pode exibir R$ 0,00 para ausência.
    rmi: resumo.rmi ?? null,
    salarioBeneficio: resumo.salario_beneficio ?? null,
    competencias: resumo.competencias ?? null,
    carenciaMeses: resumo.carencia_meses ?? null,
    tempoAtingido: native?.pcd?.tempo_atingido_no_cenario ?? null,
    preenchidosPorHipotese: native?.pcd?.filled_minimum_count ?? 0,
    projecoes: native?.pcd?.projection_count ?? 0,
    actualEntitlementVerified: native?.pcd?.actual_entitlement_verified ?? false,
    snapshotSha256: native?.pcd?.snapshot_sha256 ?? null,
    cenarioHash: registro?.entrada?.proveniencia?.cenario_hash ?? null,
    memoriaCompactada: false
  };
}

/**
 * Verifica conflito de revisão antes de salvar. Recebe a revisão vista pelo
 * cliente e a revisão atual do Store. Nunca "resolve" sozinho.
 */
export function verificarRevisao({ expectedRevision, currentRevision } = {}) {
  if (expectedRevision === undefined || expectedRevision === null) {
    throw new Lc142PersistenceError('Salvar exige a revisão esperada do estado; não salve às cegas.');
  }
  if (Number(expectedRevision) !== Number(currentRevision)) {
    throw Object.assign(
      new Lc142PersistenceError(
        'O estado do escritório mudou desde que este cenário foi aberto. Recarregue antes de salvar para não sobrescrever trabalho de outra pessoa.'
      ),
      { statusCode: 409, code: 'REVISION_CONFLICT' }
    );
  }
  return true;
}

/**
 * Coleção de referências de snapshot por workspace, para deduplicação.
 * Retorna a decisão sem I/O: quem persiste é o Store oficial.
 */
export function deduplicarSnapshot(snapshotExistente, snapshotNovo) {
  const hashNovo = hashCanonico(snapshotNovo ?? null);
  if (!snapshotExistente) return { acao: 'criar', hash: hashNovo };
  const hashExistente = hashCanonico(snapshotExistente ?? null);
  return hashExistente === hashNovo
    ? { acao: 'reutilizar', hash: hashNovo }
    : { acao: 'criar', hash: hashNovo };
}

/**
 * Reconstrói o cenário salvo para recálculo e regeração de PDF. O resultado
 * gravado NÃO é a autoridade: o chamador recalcula e compara o hash.
 */
export function reconstruirCenario(registro) {
  const cenario = registro?.entrada?.cenario;
  const politica = registro?.entrada?.politica;
  if (!cenario || !politica) {
    throw new Lc142PersistenceError('Registro sem cenário/política reconstruível.');
  }
  return {
    calculation: structuredClone(cenario),
    politica: structuredClone(politica),
    cenarioHashEsperado: registro?.entrada?.proveniencia?.cenario_hash ?? null
  };
}

/**
 * Compara o hash do recálculo com o hash gravado. Divergência é incidente de
 * contrato, não detalhe: significa que o motor ou a tabela mudou.
 */
export function conferirRecalculo({ registro, cenario, politica, resultado }) {
  const hashGravado = registro?.entrada?.proveniencia?.cenario_hash ?? null;
  const hashAtual = hashCanonico({
    sexo: cenario?.sex ?? null,
    grau: cenario?.disability ?? null,
    dib: cenario?.dib ?? null,
    identificacao: cenario?.identity ?? null,
    vinculos: cenario?.cnis?.links ?? [],
    salarios: cenario?.cnis?.salary_months ?? null,
    politica
  });
  if (hashGravado !== hashAtual) {
    throw new Lc142PersistenceError(
      'O cenário recalculado diverge do registro salvo. Não regenere o relatório como se fosse o mesmo cálculo.'
    );
  }
  const rmiGravada = registro?.resultado?.data?.native_result?.resumo?.rmi ?? null;
  const rmiAtual = resultado?.data?.native_result?.resumo?.rmi ?? null;
  if (rmiGravada !== rmiAtual) {
    throw new Lc142PersistenceError(
      'A RMI recalculada diverge da salva; trate como incidente de contrato e não sobrescreva em silêncio.'
    );
  }
  return true;
}

export { CalculationRecordError };
