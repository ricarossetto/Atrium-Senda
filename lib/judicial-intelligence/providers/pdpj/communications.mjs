import { createProvenance, SOURCE_IDS, PROVENANCE_KINDS } from '../../core/provenance.mjs';
import { extractItems } from './client.mjs';

export function normalizeCommunication(raw, { sourcePortal = null } = {}) {
  return {
    id: String(raw?.id ?? raw?.comunicacaoId ?? raw?.hash ?? ''),
    cnj: raw?.numeroProcesso ?? raw?.numeroProcessoMascara ?? raw?.cnj ?? null,
    type: raw?.tipoComunicacao ?? raw?.tipo ?? null,
    date: raw?.dataDisponibilizacao ?? raw?.data ?? null,
    publishedAt: raw?.dataPublicacao ?? null,
    text: raw?.texto ?? raw?.conteudo ?? null,
    organ: raw?.orgao ?? raw?.nomeOrgao ?? null,
    recipient: raw?.destinatario ?? null,
    certificateUrl: raw?.linkCertidao ?? null,
    officialLink: raw?.link ?? null,
    source: SOURCE_IDS.PDPJ,
    sourcePortal
  };
}

export async function listCommunications(client, query = {}, { sourcePortal = null } = {}) {
  const params = {};
  if (query.cnj) params.numeroProcesso = query.cnj;
  if (query.oab) params.numeroOab = String(query.oab).replace(/\D/g, '');
  if (query.uf) params.ufOab = String(query.uf).toUpperCase();
  if (query.dateFrom) params.dataDisponibilizacaoInicio = query.dateFrom;
  if (query.dateTo) params.dataDisponibilizacaoFim = query.dateTo;
  if (query.limit) params.itensPorPagina = Math.min(Math.max(1, Number(query.limit) || 50), 200);
  const result = await client.communicationsRaw(params);
  const communications = extractItems(JSON.parse(result.body.toString('utf8')))
    .map(raw => normalizeCommunication(raw, { sourcePortal }));
  return {
    communications,
    provenance: createProvenance({
      source: SOURCE_IDS.PDPJ,
      sourcePortal,
      kind: PROVENANCE_KINDS.PUBLICATION,
      queryKind: 'communications',
      confidence: 0.9,
      payload: communications.map(item => item.id)
    })
  };
}
