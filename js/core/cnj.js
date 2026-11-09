/**
 * ATRIUM — Número Único de Processos (CNJ)
 *
 * Fonte única do contrato de numeração definido pela Resolução CNJ nº 65/2008
 * (redação dada pelas Resoluções nº 223/2016 e nº 477/2022): estrutura
 * NNNNNNN-DD.AAAA.J.TR.OOOO, dígito verificador Módulo 97 Base 10 (ISO 7064)
 * e tabelas de segmento (J), tribunal (TR) e unidade de origem (OOOO).
 *
 * Módulo puro, sem dependências de navegador ou de Node: é consumido pelo
 * frontend e reexportado pelo backend em lib/judicial/omni/contracts.mjs.
 */

const UF_BY_TRIBUNAL_CODE = Object.freeze({
  '01': 'AC', '02': 'AL', '03': 'AP', '04': 'AM', '05': 'BA', '06': 'CE', '07': 'DF',
  '08': 'ES', '09': 'GO', '10': 'MA', '11': 'MT', '12': 'MS', '13': 'MG', '14': 'PA',
  '15': 'PB', '16': 'PR', '17': 'PE', '18': 'PI', '19': 'RJ', '20': 'RN', '21': 'RS',
  '22': 'RO', '23': 'RR', '24': 'SC', '25': 'SE', '26': 'SP', '27': 'TO'
});

export const CNJ_SEGMENTS = Object.freeze({
  '1': { name: 'Supremo Tribunal Federal', short: 'STF' },
  '2': { name: 'Conselho Nacional de Justiça', short: 'CNJ' },
  '3': { name: 'Superior Tribunal de Justiça', short: 'STJ' },
  '4': { name: 'Justiça Federal', short: 'JF' },
  '5': { name: 'Justiça do Trabalho', short: 'JT' },
  '6': { name: 'Justiça Eleitoral', short: 'JE' },
  '7': { name: 'Justiça Militar da União', short: 'JMU' },
  '8': { name: 'Justiça dos Estados e do Distrito Federal e Territórios', short: 'JE-Estados' },
  '9': { name: 'Justiça Militar Estadual', short: 'JME' }
});

function buildTribunals() {
  const table = {
    '1.00': { court: 'STF', name: 'Supremo Tribunal Federal' },
    '2.00': { court: 'CNJ', name: 'Conselho Nacional de Justiça' },
    '3.00': { court: 'STJ', name: 'Superior Tribunal de Justiça' },
    '4.90': { court: 'CJF', name: 'Conselho da Justiça Federal' },
    // TST e TSE constam dos Anexos III e IV da Resolução (TR 00 nos processos
    // originários), como STF/CNJ/STJ/STM.
    '5.00': { court: 'TST', name: 'Tribunal Superior do Trabalho' },
    '5.90': { court: 'CSJT', name: 'Conselho Superior da Justiça do Trabalho' },
    '6.00': { court: 'TSE', name: 'Tribunal Superior Eleitoral' },
    '7.00': { court: 'STM', name: 'Superior Tribunal Militar' },
    '9.13': { court: 'TJM-MG', name: 'Tribunal de Justiça Militar de Minas Gerais' },
    '9.21': { court: 'TJM-RS', name: 'Tribunal de Justiça Militar do Rio Grande do Sul' },
    '9.26': { court: 'TJM-SP', name: 'Tribunal de Justiça Militar de São Paulo' }
  };
  for (let region = 1; region <= 6; region += 1) {
    const code = String(region).padStart(2, '0');
    table[`4.${code}`] = { court: `TRF${region}`, name: `Tribunal Regional Federal da ${region}ª Região` };
  }
  for (let region = 1; region <= 24; region += 1) {
    const code = String(region).padStart(2, '0');
    table[`5.${code}`] = { court: `TRT${region}`, name: `Tribunal Regional do Trabalho da ${region}ª Região` };
  }
  for (let region = 1; region <= 12; region += 1) {
    const code = String(region).padStart(2, '0');
    table[`7.${code}`] = { court: `CJM-${region}`, name: `${region}ª Circunscrição Judiciária Militar` };
  }
  for (const [code, uf] of Object.entries(UF_BY_TRIBUNAL_CODE)) {
    table[`6.${code}`] = { court: `TRE-${uf}`, name: `Tribunal Regional Eleitoral (${uf})` };
    // Sigla consolidada do produto para o Distrito Federal é TJDFT.
    table[`8.${code}`] = { court: uf === 'DF' ? 'TJDFT' : `TJ${uf}`, name: `Tribunal de Justiça (${uf})` };
  }
  return Object.freeze(table);
}

export const CNJ_TRIBUNALS = buildTribunals();

/**
 * Remove pontuação e mantém apenas dígitos.
 */
export function cleanCnj(value) {
  return String(value || '').replace(/\D/g, '');
}

/**
 * Formata 20 dígitos em NNNNNNN-DD.AAAA.J.TR.OOOO; devolve a entrada quando
 * não há 20 dígitos (números provisórios e formatos antigos permanecem livres).
 */
export function formatCnj(value) {
  const digits = cleanCnj(value);
  if (digits.length !== 20) return String(value || '');
  return `${digits.slice(0, 7)}-${digits.slice(7, 9)}.${digits.slice(9, 13)}.${digits.slice(13, 14)}.${digits.slice(14, 16)}.${digits.slice(16, 20)}`;
}

/**
 * Dígito verificador Módulo 97 Base 10 (ISO 7064), Anexo VIII da Resolução.
 * Retorna dois dígitos (02 a 98) calculados sobre os 18 dígitos sem o DD.
 */
export function computeCnjCheckDigits(digitsWithoutCheck) {
  const base = cleanCnj(digitsWithoutCheck);
  if (base.length !== 18) return '';
  return String(98n - (BigInt(base) * 100n) % 97n).padStart(2, '0');
}

/**
 * Valida os 20 dígitos: formato, dígito verificador e rejeição de zeros.
 */
export function isValidCnj(value) {
  const digits = cleanCnj(value);
  if (!/^\d{20}$/.test(digits) || /^0+$/.test(digits)) return false;
  const base = digits.slice(0, 7) + digits.slice(9);
  return digits.slice(7, 9) === computeCnjCheckDigits(base);
}

/**
 * Corrige o dígito verificador de um número de 20 dígitos; null quando não há
 * o que corrigir (formato diferente ou dígito já correto).
 */
export function suggestCnjCorrection(value) {
  const digits = cleanCnj(value);
  if (digits.length !== 20 || /^0+$/.test(digits)) return null;
  const corrected = computeCnjCheckDigits(digits.slice(0, 7) + digits.slice(9));
  if (!corrected || corrected === digits.slice(7, 9)) return null;
  return formatCnj(digits.slice(0, 7) + corrected + digits.slice(9));
}

/**
 * Decompõe o número nos seis campos e deriva segmento, tribunal, unidade de
 * origem e grau/competência (art. 1º §6º e art. 3º §§2º-3º).
 */
export function parseCnjSegments(value) {
  const digits = cleanCnj(value);
  if (digits.length !== 20) return null;

  const sequential = digits.slice(0, 7);
  const digit = digits.slice(7, 9);
  const year = digits.slice(9, 13);
  const justice = digits.slice(13, 14);
  const tribunal = digits.slice(14, 16);
  const origin = digits.slice(16, 20);

  return {
    sequential,
    digit,
    year,
    justice,
    tribunal,
    origin,
    segment: `${justice}.${tribunal}`,
    formatted: `${sequential}-${digit}.${year}.${justice}.${tribunal}.${origin}`,
    unmasked: digits
  };
}

/**
 * Descritor completo do número: campos, nomes oficiais e grau derivado do OOOO.
 */
export function describeCnj(value) {
  const parsed = parseCnjSegments(value);
  if (!parsed) return null;

  const segment = CNJ_SEGMENTS[parsed.justice] || null;
  const tribunal = CNJ_TRIBUNALS[parsed.segment] || null;

  let degree = 'primeiro_grau';
  let degreeLabel = '1º grau';
  if (parsed.origin === '0000') {
    degree = 'originaria';
    degreeLabel = 'Competência originária';
  } else if (parsed.origin === '9999') {
    degree = 'delegada';
    degreeLabel = 'Recurso delegado';
  } else if (parsed.origin.startsWith('9')) {
    degree = 'turma_recursal';
    degreeLabel = 'Turma recursal';
  }

  return {
    ...parsed,
    valid: isValidCnj(parsed.unmasked),
    segmentName: segment?.name || null,
    segmentShort: segment?.short || null,
    court: tribunal?.court || null,
    courtName: tribunal?.name || null,
    degree,
    degreeLabel,
    delegated: parsed.origin === '9999',
    unitOfOrigin: parsed.origin
  };
}

/**
 * Compatibilidade: resolve a sigla do tribunal a partir de J.TR.
 */
export function resolveCourtFromCnj(value) {
  const parsed = parseCnjSegments(value);
  if (!parsed) return null;
  return CNJ_TRIBUNALS[parsed.segment]?.court || null;
}
