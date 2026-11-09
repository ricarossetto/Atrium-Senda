export const LEGAL_AREA = Object.freeze(['civil', 'trabalhista', 'previdenciario', 'criminal', 'tributario', 'fazenda', 'marcas', 'outro']);

const LEGAL_AREA_ALIASES = Object.freeze({
  civel: 'civil',
  cível: 'civil',
  trab: 'trabalhista',
  prev: 'previdenciario',
  previdenciário: 'previdenciario',
  penal: 'criminal',
  fiscal: 'tributario',
  fazenda_publica: 'fazenda',
  'fazenda pública': 'fazenda',
  fazendapublica: 'fazenda',
  publico: 'fazenda',
  poder_publico: 'fazenda',
  marca: 'marcas',
  propriedade_industrial: 'marcas',
  pi: 'marcas',
  inpi: 'marcas'
});

export function normalizeLegalArea(value) {
  const key = String(value || '').trim().toLowerCase();
  if (LEGAL_AREA.includes(key)) return key;
  const aliased = LEGAL_AREA_ALIASES[key];
  if (aliased) return aliased;
  const error = new Error(`Área jurídica desconhecida: ${value}`);
  error.code = 'UNKNOWN_LEGAL_AREA';
  throw error;
}

export function assertLegalArea(value, { context = 'legal-area' } = {}) {
  try {
    return normalizeLegalArea(value);
  } catch {
    const error = new Error(`Área jurídica inválida em ${context}: ${value}`);
    error.code = 'UNKNOWN_LEGAL_AREA';
    throw error;
  }
}

export function isLegalArea(value) {
  try {
    normalizeLegalArea(value);
    return true;
  } catch {
    return false;
  }
}
