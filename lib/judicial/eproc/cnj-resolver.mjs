/**
 * ATRIUM Sovereign Judicial Connectivity — Eproc CNJ Routing Engine
 *
 * Decomposes 20-digit CNJ numbers according to CNJ Resolution 65/2008 and resolves
 * candidate judicial portals with confidence scoring. Does NOT assume 100% eproc
 * for courts in partial migration/hybrid coexistence.
 */

import { EPROC_PORTALS, EPROC_STATUS } from './portal-registry.mjs';

const CNJ_PATTERN = /^(\d{7})-?(\d{2})\.?(\d{4})\.?(\d)\.?(\d{2})\.?(\d{4})$/;

export function parseCnj(cnj) {
  const clean = String(cnj || '').trim();
  const match = clean.match(CNJ_PATTERN);
  if (!match) return null;

  const [_, sequential, checkDigits, year, justice, region, originUnit] = match;
  const courtCode = `${justice}.${region}`;

  return {
    raw: clean,
    normalized: `${sequential}-${checkDigits}.${year}.${justice}.${region}.${originUnit}`,
    digits: `${sequential}${checkDigits}${year}${justice}${region}${originUnit}`,
    sequential,
    checkDigits,
    year: Number(year),
    justiceBranchCode: Number(justice),
    tribunalRegionCode: region,
    courtCode,
    originUnit
  };
}

export function resolveEprocCandidates(cnj) {
  const parsed = parseCnj(cnj);
  if (!parsed) return [];

  const matchingPortals = EPROC_PORTALS.filter(p => p.courtCode === parsed.courtCode);
  if (matchingPortals.length === 0) return [];

  const candidates = [];

  for (const portal of matchingPortals) {
    let confidence = 0.50;
    let priority = 10;
    let reason = 'fallback_candidate_matching_court_code';
    const isFederal4R = portal.courtCode === '4.04';

    // Heurística de Seção Judiciária da 4ª Região por código de origem da Vara Federal:
    // 7100-7199: Rio Grande do Sul (JFRS)
    // 7200-7299: Santa Catarina (JFSC)
    // 7000-7099: Paraná (JFPR)
    // 0000: Tribunal Regional Federal 2º Grau (TRF4)
    if (isFederal4R) {
      const originNum = Number(parsed.originUnit);
      if (portal.level === 2 && originNum === 0) {
        confidence = 0.98;
        priority = 1;
        reason = 'origin_unit_0000_suggests_second_degree_court';
      } else if (portal.id === 'jfrs-eproc-1g' && originNum >= 7100 && originNum <= 7199) {
        confidence = 0.98;
        priority = 1;
        reason = 'origin_unit_71xx_matches_federal_subdivision_rs';
      } else if (portal.id === 'jfsc-eproc-1g' && originNum >= 7200 && originNum <= 7299) {
        confidence = 0.98;
        priority = 1;
        reason = 'origin_unit_72xx_matches_federal_subdivision_sc';
      } else if (portal.id === 'jfpr-eproc-1g' && originNum >= 7000 && originNum <= 7099) {
        confidence = 0.98;
        priority = 1;
        reason = 'origin_unit_70xx_matches_federal_subdivision_pr';
      } else {
        confidence = 0.85;
        priority = portal.level === 1 ? 2 : 3;
        reason = 'origin_unit_outside_standard_ranges_suggests_general_4r_court';
      }
    } else if (portal.status === EPROC_STATUS.ACTIVE) {
      // Tribunais consolidados 100% no eproc (TJRS, TJSC, TJTO, TRF2, TRF6, TJMRS)
      confidence = portal.level === 1 ? 0.95 : 0.90;
      priority = portal.level === 1 ? 1 : 2;
      reason = 'state_or_federal_court_with_full_eproc_adoption';
    } else if (portal.status === EPROC_STATUS.PARTIAL || portal.status === EPROC_STATUS.PILOT) {
      // Tribunais com migração parcial ou piloto (TJSP, TJRJ, TJMG, TJBA)
      // O eproc é um forte candidato para novas ações, mas coexiste com sistemas legados (SAJ/PJe).
      confidence = 0.65;
      priority = 5;
      reason = 'hybrid_court_candidate_eproc_coexists_with_legacy_system';
    }

    candidates.push({
      portalId: portal.id,
      court: portal.court,
      courtCode: portal.courtCode,
      level: portal.level,
      status: portal.status,
      coverage: portal.coverage,
      confidence,
      priority,
      reason,
      isGuaranteed: false,
      system: 'eproc',
      portalUrl: portal.baseUrl
    });
  }

  // Ordena por confiança decrescente e prioridade
  return candidates.sort((a, b) => b.confidence - a.confidence || a.priority - b.priority);
}
