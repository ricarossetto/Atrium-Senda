import { createProvenance, SOURCE_IDS, PROVENANCE_KINDS } from '../../core/provenance.mjs';
import { normalizeCnj } from './processes.mjs';
import { normalizeDocumentMetadata } from './documents.mjs';

function asArray(value) {
  if (Array.isArray(value)) return value;
  return value === null || value === undefined ? [] : [value];
}

function firstString(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return null;
}

function readCnj(raw) {
  const value = firstString(raw?.numeroProcesso, raw?.cnj, raw?.numeroProcessoMascara);
  if (!value) return null;
  try {
    return normalizeCnj(value);
  } catch {
    return value;
  }
}

function readPolo(raw) {
  return firstString(raw?.polo, raw?.tipoPolo, raw?.poloProcessual);
}

export function normalizeParty(raw, { sourcePortal = null } = {}) {
  return {
    name: firstString(raw?.nome, raw?.nomeParte, raw?.razaoSocial),
    document: firstString(raw?.documento, raw?.cpf, raw?.cnpj, raw?.documentoPrincipal)?.replace(/\D/g, '') ?? null,
    polo: readPolo(raw),
    oab: firstString(raw?.oab, raw?.numeroOab, raw?.inscricaoOab),
    type: firstString(raw?.tipoPessoa, raw?.tipo, raw?.natureza),
    source: SOURCE_IDS.PDPJ,
    sourcePortal
  };
}

export function normalizeMovement(raw, { sourcePortal = null } = {}) {
  const date = firstString(raw?.dataHora, raw?.data, raw?.dataMovimento);
  const description = firstString(raw?.nome, raw?.descricao, raw?.movimento, raw?.descricaoMovimento);
  return {
    sequence: Number.isFinite(Number(raw?.sequencia ?? raw?.sequence)) ? Number(raw.sequencia ?? raw.sequence) : null,
    date,
    description,
    tpuCode: firstString(raw?.codigoNacional, raw?.codigo ?? raw?.codigoMovimento) ?? null,
    cnjCode: firstString(raw?.codigoNacional) ?? null,
    organ: firstString(raw?.orgaoJulgador?.nome, raw?.orgao),
    source: SOURCE_IDS.PDPJ,
    sourcePortal
  };
}

export function normalizeProcessCandidate(raw, { sourcePortal = null } = {}) {
  return {
    cnj: readCnj(raw),
    court: firstString(raw?.tribunal?.sigla, raw?.siglaTribunal, raw?.tribunal),
    judicialUnit: firstString(raw?.orgaoJulgador?.nome, raw?.orgaoJulgador),
    processClass: firstString(raw?.classe?.nome, raw?.classe, raw?.classeProcessual?.nome),
    subject: asArray(raw?.assuntos ?? raw?.assunto).map(item => firstString(item?.nome, item)).filter(Boolean).join('; ') || null,
    distributionDate: firstString(raw?.dataDistribuicao, raw?.distribuicao?.data),
    isSecret: raw?.nivelSigilo !== undefined ? Number(raw.nivelSigilo) > 0 : (raw?.segredoJustica ?? null),
    provenance: createProvenance({
      source: SOURCE_IDS.PDPJ,
      sourcePortal,
      kind: PROVENANCE_KINDS.PROCESS_METADATA,
      queryKind: 'search',
      confidence: 0.9,
      payload: raw
    })
  };
}

export function normalizeProcess(raw, { sourcePortal = null, queryKind = 'process' } = {}) {
  const cnj = readCnj(raw);
  const documents = asArray(raw?.documentos ?? raw?.documentosPendentes)
    .map(document => normalizeDocumentMetadata(document, { cnj, sourcePortal }));
  return {
    cnj,
    metadata: {
      cnj,
      court: firstString(raw?.tribunal?.sigla, raw?.siglaTribunal, raw?.tribunal),
      judicialUnit: firstString(raw?.orgaoJulgador?.nome, raw?.orgaoJulgador),
      processClass: firstString(raw?.classe?.nome, raw?.classe, raw?.classeProcessual?.nome),
      subject: asArray(raw?.assuntos ?? raw?.assunto).map(item => firstString(item?.nome, item)).filter(Boolean).join('; ') || null,
      distributionDate: firstString(raw?.dataDistribuicao, raw?.distribuicao?.data),
      isSecret: raw?.nivelSigilo !== undefined ? Number(raw.nivelSigilo) > 0 : (raw?.segredoJustica ?? null),
      totalValue: raw?.valorCausa ?? null
    },
    parties: asArray(raw?.partes ?? raw?.dadosBasicos?.polo ?? raw?.polos)
      .map(party => normalizeParty(party, { sourcePortal }))
      .filter(party => party.name),
    movements: asArray(raw?.movimentos ?? raw?.movimentacoes)
      .map(movement => normalizeMovement(movement, { sourcePortal }))
      .filter(movement => movement.description || movement.date),
    documents,
    provenance: createProvenance({
      source: SOURCE_IDS.PDPJ,
      sourcePortal,
      kind: PROVENANCE_KINDS.AUTHENTICATED_EXPEDIENT,
      queryKind,
      confidence: 0.95,
      payload: raw
    })
  };
}
