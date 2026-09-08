/**
 * ATRIUM Sovereign Omni-Collector — Canonical Normalizer
 *
 * Normalizes raw court payloads into canonical process models with
 * deterministic movement fingerprints and strict FACT provenance.
 */

import { cleanCnj, formatCnj, FACT_TYPE, SOURCE_TYPE, resolveCourtFromCnj } from './contracts.mjs';
import { computeMovementFingerprint, computeSha256 } from './fingerprint.mjs';

export class CanonicalNormalizer {
  constructor(version = '1.0.0') {
    this.version = version;
  }

  /**
   * Universal dispatcher mapping any raw court result into CanonicalProcessDetail.
   */
  normalizeRaw(result) {
    const src = String(result?.source || '').toUpperCase();
    const tribunal = String(result?.tribunal || result?.courtCode || '').toUpperCase();

    if (src.includes('DATAJUD')) return this.normalizeDataJud(result.rawPayload, result);
    if (src.includes('TJRS') || tribunal === 'TJRS') {
      return this.normalizeTjrs(result.rawPayload, result);
    }
    if (src.includes('TJDFT') || tribunal === 'TJDFT') {
      return this.normalizeTjdft(result.rawPayload, result);
    }
    if (src.includes('TJSP') || tribunal === 'TJSP') {
      return this.normalizeTjsp(result.rawPayload, result);
    }
    if (src.includes('DATAJUD') || result.rawPayload?.hits || result.rawPayload?.dadosBasicos) {
      return this.normalizeDataJud(result.rawPayload, result);
    }

    return this.normalizeGeneric(result);
  }

  /**
   * Normalizes TJRS raw JSON or SPA payload.
   */
  normalizeTjrs(payload, context = {}) {
    const rawCnj = payload?.metadata?.rawCnj || payload?.processo?.numeroProcesso || payload?.numeroProcesso || payload?.cnj || context?.cnj || '';
    const cnj = cleanCnj(rawCnj);
    const meta = payload?.metadata || payload?.processo || payload || {};

    const metadata = {
      cnj,
      rawCnj: formatCnj(cnj),
      court: 'TJRS',
      district: meta.district || meta.comarca || meta.municipio || null,
      districtCode: meta.districtCode != null ? Number(meta.districtCode) : null,
      judicialUnit: meta.judicialUnit || meta.orgaoJulgador || meta.vara || null,
      system: meta.system || 'EPROC',
      processClass: meta.processClass || meta.classeProcessual || meta.classe || null,
      classCode: meta.classCode != null ? Number(meta.classCode) : null,
      subject: meta.subject || meta.assuntoPrincipal || meta.assunto || null,
      subjectCode: meta.subjectCode != null ? Number(meta.subjectCode) : null,
      distributionDate: meta.distributionDate || meta.dataDistribuicao || null,
      isSecret: Boolean(meta.isSecret || meta.segredoJustica || meta.nivelSigilo > 0),
      value: meta.value != null ? Number(meta.value) : (meta.valorCausa != null ? Number(meta.valorCausa) : null)
    };

    const rawParties = Array.isArray(payload?.parties) ? payload.parties : (Array.isArray(meta?.polos) ? this.#extractPolos(meta.polos) : []);
    const parties = rawParties.map(p => ({
      name: String(p.name || p.nome || '').trim(),
      role: String(p.role || p.polo || p.tipo || 'OUTRO').toUpperCase(),
      documentType: p.documentType || p.tipoDocumento || null,
      documentRedacted: p.documentRedacted || p.documento || null,
      lawyers: Array.isArray(p.lawyers) ? p.lawyers.map(l => ({
        name: String(l.name || l.nome || '').trim(),
        oabNumber: cleanCnj(l.oabNumber || l.numeroOab || l.oab || ''),
        oabUf: String(l.oabUf || l.ufOab || l.uf || '').toUpperCase()
      })) : []
    }));

    const rawMovements = Array.isArray(payload?.movements) ? payload.movements : (Array.isArray(payload?.movimentacoes) ? payload.movimentacoes : []);
    const movements = rawMovements.map((m, idx) => {
      const eventNumber = m.eventNumber != null ? Number(m.eventNumber) : (idx + 1);
      const sequenceNumber = m.sequenceNumber != null ? Number(m.sequenceNumber) : eventNumber;
      const date = m.date || m.dataHora || '';
      const description = String(m.description || m.nome || m.texto || m.descricao || '').trim();
      const cnjCode = m.cnjCode != null ? Number(m.cnjCode) : (m.codigo != null ? Number(m.codigo) : null);
      const docRefs = Array.isArray(m.documentReferences) ? m.documentReferences : [];

      const canonicalMovement = {
        eventNumber,
        sequenceNumber,
        date,
        description,
        cnjCode,
        documentReferences: docRefs
      };
      canonicalMovement.fingerprint = m.fingerprint || computeMovementFingerprint(canonicalMovement);
      return canonicalMovement;
    });

    return {
      cnj,
      metadata,
      parties,
      movements,
      movementCount: movements.length,
      provenance: {
        source: SOURCE_TYPE.TJRS_PUBLIC,
        provider: 'TJRS_OBSERVER',
        queryTimestamp: context.collectedAt || new Date().toISOString(),
        collectorVersion: this.version,
        queryKind: 'PROCESS_CNJ',
        sha256Payload: computeSha256(payload),
        factType: FACT_TYPE.FACT
      }
    };
  }

  /**
   * Normalizes TJDFT REST API response.
   */
  normalizeTjdft(payload, context = {}) {
    const rawCnj = payload?.numeroProcesso || payload?.numero || payload?.metadata?.rawCnj || context?.cnj || '';
    const cnj = cleanCnj(rawCnj);
    const meta = payload?.dadosBasicos || payload || {};

    const metadata = {
      cnj,
      rawCnj: formatCnj(cnj),
      court: 'TJDFT',
      district: meta.comarca || meta.orgaoJulgador?.municipio || 'Brasília',
      districtCode: 7,
      judicialUnit: meta.orgaoJulgador?.nomeOrgao || meta.orgaoJulgador || meta.vara || null,
      system: 'PJE',
      processClass: meta.classeProcessual?.nome || meta.classe || null,
      classCode: meta.classeProcessual?.codigo != null ? Number(meta.classeProcessual.codigo) : null,
      subject: meta.assuntoPrincipal?.nome || meta.assunto || null,
      subjectCode: meta.assuntoPrincipal?.codigo != null ? Number(meta.assuntoPrincipal.codigo) : null,
      distributionDate: meta.dataDistribuicao || meta.distribuicao || null,
      isSecret: Boolean(meta.nivelSigilo > 0 || meta.segredoJustica),
      value: meta.valorCausa != null ? Number(meta.valorCausa) : null
    };

    const parties = [];
    if (Array.isArray(meta.polo)) {
      for (const polo of meta.polo) {
        const role = String(polo.polo || polo.tipo || 'OUTRO').toUpperCase();
        if (Array.isArray(polo.parte)) {
          for (const parte of polo.parte) {
            const pessoa = parte.pessoa || {};
            parties.push({
              name: String(pessoa.nome || parte.nome || '').trim(),
              role,
              documentType: pessoa.numeroDocumentoPrincipal ? 'CPF' : null,
              documentRedacted: pessoa.numeroDocumentoPrincipal || null,
              lawyers: Array.isArray(parte.advogado) ? parte.advogado.map(adv => ({
                name: String(adv.nome || '').trim(),
                oabNumber: cleanCnj(adv.numeroOAB || adv.oab || ''),
                oabUf: String(adv.ufOAB || adv.uf || 'DF').toUpperCase()
              })) : []
            });
          }
        }
      }
    }

    const rawMovements = Array.isArray(payload?.movimentacoes) ? payload.movimentacoes : (Array.isArray(payload?.movements) ? payload.movements : []);
    const movements = rawMovements.map((m, idx) => {
      const eventNumber = m.eventNumber != null ? Number(m.eventNumber) : (idx + 1);
      const sequenceNumber = m.sequenceNumber != null ? Number(m.sequenceNumber) : eventNumber;
      const date = m.dataHora || m.date || '';
      const description = String(m.movimentoNacional?.nome || m.descricao || m.description || '').trim();
      const cnjCode = m.movimentoNacional?.codigo != null ? Number(m.movimentoNacional.codigo) : null;

      const canonicalMovement = {
        eventNumber,
        sequenceNumber,
        date,
        description,
        cnjCode,
        documentReferences: []
      };
      canonicalMovement.fingerprint = computeMovementFingerprint(canonicalMovement);
      return canonicalMovement;
    });

    return {
      cnj,
      metadata,
      parties,
      movements,
      movementCount: movements.length,
      provenance: {
        source: SOURCE_TYPE.TJDFT_REST_API,
        provider: 'TJDFT_REST',
        queryTimestamp: context.collectedAt || new Date().toISOString(),
        collectorVersion: this.version,
        queryKind: 'PROCESS_CNJ',
        sha256Payload: computeSha256(payload),
        factType: FACT_TYPE.FACT
      }
    };
  }

  /**
   * Normalizes TJSP 1G/2G e-SAJ response.
   */
  normalizeTjsp(payload, context = {}) {
    const rawCnj = payload?.cnj || payload?.numeroProcesso || context?.cnj || '';
    const cnj = cleanCnj(rawCnj);
    const meta = payload?.metadata || payload?.capa || payload || {};

    const metadata = {
      cnj,
      rawCnj: formatCnj(cnj),
      court: 'TJSP',
      district: meta.foro || meta.comarca || null,
      districtCode: meta.foroNumero != null ? Number(meta.foroNumero) : null,
      judicialUnit: meta.vara || meta.orgaoJulgador || null,
      system: 'ESAJ',
      processClass: meta.classe || meta.processClass || null,
      classCode: null,
      subject: meta.assunto || meta.subject || null,
      subjectCode: null,
      distributionDate: meta.distribuicao || meta.distributionDate || null,
      isSecret: Boolean(meta.isSecret || meta.segredoJustica),
      value: meta.valorAcao != null ? Number(meta.valorAcao) : (meta.value != null ? Number(meta.value) : null)
    };

    const rawParties = Array.isArray(payload?.partes) ? payload.partes : (Array.isArray(payload?.parties) ? payload.parties : []);
    const parties = rawParties.map(p => ({
      name: String(p.nome || p.name || '').trim(),
      role: String(p.tipo || p.role || 'PARTE').toUpperCase(),
      documentType: null,
      documentRedacted: null,
      lawyers: Array.isArray(p.advogados) ? p.advogados.map(a => ({
        name: String(a.nome || a.name || '').trim(),
        oabNumber: cleanCnj(a.oab || a.oabNumber || ''),
        oabUf: String(a.uf || a.oabUf || 'SP').toUpperCase()
      })) : []
    }));

    const rawMovements = Array.isArray(payload?.movimentacoes) ? payload.movimentacoes : (Array.isArray(payload?.movements) ? payload.movements : []);
    const movements = rawMovements.map((m, idx) => {
      const eventNumber = m.eventNumber != null ? Number(m.eventNumber) : (rawMovements.length - idx);
      const sequenceNumber = eventNumber;
      const date = m.data || m.date || '';
      const description = String(m.descricao || m.description || m.texto || '').trim();

      const canonicalMovement = {
        eventNumber,
        sequenceNumber,
        date,
        description,
        cnjCode: null,
        documentReferences: []
      };
      canonicalMovement.fingerprint = computeMovementFingerprint(canonicalMovement);
      return canonicalMovement;
    });

    return {
      cnj,
      metadata,
      parties,
      movements,
      movementCount: movements.length,
      provenance: {
        source: SOURCE_TYPE.TJSP_ESAJ_PUBLIC,
        provider: 'TJSP_ESAJ',
        queryTimestamp: context.collectedAt || new Date().toISOString(),
        collectorVersion: this.version,
        queryKind: 'PROCESS_CNJ',
        sha256Payload: computeSha256(payload),
        factType: FACT_TYPE.FACT
      }
    };
  }

  /**
   * Normalizes DataJud Elasticsearch hit.
   */
  normalizeDataJud(hit, context = {}) {
    const source = hit?._source || hit || {};
    const rawCnj = source.numeroProcesso || source.numero || context?.cnj || '';
    const cnj = cleanCnj(rawCnj);
    const dados = source.dadosBasicos || source;

    const court = resolveCourtFromCnj(cnj) || source.tribunal || 'CNJ';

    const metadata = {
      cnj,
      rawCnj: formatCnj(cnj),
      court,
      district: dados.orgaoJulgador?.municipio || null,
      districtCode: dados.orgaoJulgador?.codigoMunicipioIBGE != null ? Number(dados.orgaoJulgador.codigoMunicipioIBGE) : null,
      judicialUnit: dados.orgaoJulgador?.nomeOrgao || null,
      system: dados.sistema?.nome || 'DATAJUD',
      processClass: dados.classeProcessual?.nome || dados.classe?.nome || null,
      classCode: dados.classeProcessual?.codigo != null ? Number(dados.classeProcessual.codigo) : null,
      subject: dados.assuntoPrincipal?.nome || (Array.isArray(dados.assunto) ? dados.assunto[0]?.nome : null),
      subjectCode: dados.assuntoPrincipal?.codigo != null ? Number(dados.assuntoPrincipal.codigo) : null,
      distributionDate: dados.dataDistribuicao || dados.dataAjuizamento || null,
      isSecret: Boolean(dados.nivelSigilo > 0),
      value: dados.valorCausa != null ? Number(dados.valorCausa) : null
    };

    const parties = [];
    if (Array.isArray(dados.polo)) {
      for (const polo of dados.polo) {
        const role = String(polo.polo || polo.tipo || 'OUTRO').toUpperCase();
        if (Array.isArray(polo.parte)) {
          for (const parte of polo.parte) {
            const pessoa = parte.pessoa || {};
            parties.push({
              name: String(pessoa.nome || parte.nome || '').trim(),
              role,
              documentType: pessoa.numeroDocumentoPrincipal ? 'DOC' : null,
              documentRedacted: pessoa.numeroDocumentoPrincipal || null,
              lawyers: Array.isArray(parte.advogado) ? parte.advogado.map(adv => ({
                name: String(adv.nome || '').trim(),
                oabNumber: cleanCnj(adv.numeroOAB || adv.oab || ''),
                oabUf: String(adv.ufOAB || adv.uf || '').toUpperCase()
              })) : []
            });
          }
        }
      }
    }

    const rawMovements = Array.isArray(source.movimentos) ? source.movimentos : [];
    const movements = rawMovements.map((m, idx) => {
      const eventNumber = idx + 1;
      const sequenceNumber = eventNumber;
      const date = m.dataHora || '';
      const description = String(m.movimentoNacional?.nome || m.nome || m.descricao || '').trim();
      const cnjCode = m.movimentoNacional?.codigo != null ? Number(m.movimentoNacional.codigo) : (m.codigo != null ? Number(m.codigo) : null);

      const canonicalMovement = {
        eventNumber,
        sequenceNumber,
        date,
        description,
        cnjCode,
        documentReferences: []
      };
      canonicalMovement.fingerprint = computeMovementFingerprint(canonicalMovement);
      return canonicalMovement;
    });

    return {
      cnj,
      metadata,
      parties,
      movements,
      movementCount: movements.length,
      provenance: {
        source: SOURCE_TYPE.DATAJUD,
        provider: 'DATAJUD_CNJ',
        queryTimestamp: context.collectedAt || new Date().toISOString(),
        collectorVersion: this.version,
        queryKind: 'PROCESS_CNJ',
        sha256Payload: computeSha256(hit),
        factType: FACT_TYPE.FACT
      }
    };
  }

  /**
   * Generic fallback normalizer.
   */
  normalizeGeneric(result) {
    const raw = result?.rawPayload || result || {};
    const cnj = cleanCnj(raw.cnj || raw.processNumber || result?.queryCnj || '');
    return {
      cnj,
      metadata: {
        cnj,
        rawCnj: formatCnj(cnj),
        court: resolveCourtFromCnj(cnj) || 'DESCONHECIDO',
        district: null,
        districtCode: null,
        judicialUnit: null,
        system: 'GENERIC',
        processClass: null,
        classCode: null,
        subject: null,
        subjectCode: null,
        distributionDate: null,
        isSecret: false,
        value: null
      },
      parties: [],
      movements: [],
      movementCount: 0,
      provenance: {
        source: SOURCE_TYPE.MANUAL,
        provider: 'GENERIC',
        queryTimestamp: new Date().toISOString(),
        collectorVersion: this.version,
        queryKind: 'PROCESS_CNJ',
        sha256Payload: computeSha256(raw),
        factType: FACT_TYPE.UNVERIFIED
      }
    };
  }

  /**
   * Enriches process with DJEN publications.
   */
  enrichWithDjen(canonical, publications = []) {
    if (!Array.isArray(publications) || publications.length === 0) return canonical;

    const pubMovements = publications.map((pub, idx) => {
      const date = pub.data_disponibilizacao || pub.dataDisponibilizacao || pub.dataPublicacao || new Date().toISOString();
      const description = `[DJEN] ${pub.tipoComunicacao || pub.meio || 'Publicação Oficial'}: ${String(pub.texto || pub.conteudo || '').slice(0, 300)}`;
      const mov = {
        eventNumber: canonical.movements.length + idx + 1,
        sequenceNumber: canonical.movements.length + idx + 1,
        date,
        description,
        cnjCode: null,
        documentReferences: pub.link ? [{ id: String(pub.id || idx), name: 'Publicação DJEN' }] : []
      };
      mov.fingerprint = computeMovementFingerprint(mov);
      return mov;
    });

    return {
      ...canonical,
      movements: [...canonical.movements, ...pubMovements],
      movementCount: canonical.movements.length + pubMovements.length,
      publications: publications.map(p => ({
        id: p.id,
        date: p.data_disponibilizacao || p.dataDisponibilizacao,
        type: p.tipoComunicacao || 'PUBLICAÇÃO',
        content: p.texto || p.conteudo,
        factType: FACT_TYPE.FACT
      }))
    };
  }

  #extractPolos(polos) {
    const list = [];
    for (const polo of polos) {
      const role = String(polo.tipo || polo.role || 'OUTRO').toUpperCase();
      for (const p of (polo.partes || [])) {
        list.push({ ...p, role });
      }
    }
    return list;
  }
}
