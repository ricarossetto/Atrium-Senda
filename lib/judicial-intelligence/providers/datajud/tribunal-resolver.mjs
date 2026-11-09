import { JudicialIntelligenceError, JI_ERROR_CODES } from '../../core/errors.mjs';
import { cleanCnj, resolveCourtFromCnj, parseCnjSegments } from '../../../judicial/omni/contracts.mjs';
import { aliasForProcess } from '../../../../collector/adapters/datajud.mjs';

export function resolveDatajudAlias(cnj) {
  const digits = cleanCnj(cnj);
  if (digits.length !== 20) {
    throw new JudicialIntelligenceError(JI_ERROR_CODES.INVALID_ARGUMENT, 'CNJ inválido para resolução de tribunal no DataJud.');
  }
  const alias = aliasForProcess(digits);
  if (!alias) {
    throw new JudicialIntelligenceError(JI_ERROR_CODES.NOT_FOUND, 'Não foi possível resolver o alias DataJud para este CNJ.');
  }
  return String(alias).toLowerCase();
}

export function resolveTribunalLabel(cnj) {
  const digits = cleanCnj(cnj);
  return resolveCourtFromCnj(digits) ?? parseCnjSegments(digits)?.segment ?? null;
}

export function describeTribunal(cnj) {
  const digits = cleanCnj(cnj);
  const segments = parseCnjSegments(digits);
  return {
    cnj: digits,
    segment: segments?.segment ?? null,
    court: resolveCourtFromCnj(digits),
    alias: resolveDatajudAlias(digits)
  };
}
