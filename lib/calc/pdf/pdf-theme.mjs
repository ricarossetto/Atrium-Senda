// Tipografia, espaçamento, paleta e estilos de tabela dos relatórios LC 142.
//
// Sem dependência externa: as métricas abaixo são as larguras AFM das fontes
// padrão PDF (Helvetica / Helvetica-Bold / Times-Roman / Times-Bold), tabeladas
// em unidades de 1/1000 em. Acentos do português usam a largura da letra-base,
// que é a convenção das próprias AFMs para o bloco Latin-1 (ã = a, ç = c, é = e).
// A fonte PDF correspondente é declarada como uma das 14 fontes padrão com
// /Encoding /WinAnsiEncoding, portanto nenhum arquivo de fonte é embutido.

export const PAGE = Object.freeze({
  width: 595.28,
  height: 841.89,
  margin: 48
});

export const LAYOUT = Object.freeze({
  contentLeft: PAGE.margin,
  contentRight: PAGE.width - PAGE.margin,
  contentWidth: PAGE.width - (PAGE.margin * 2),
  contentTop: PAGE.height - 124,
  contentBottom: 100,
  headerTitleY: PAGE.height - 52,
  headerMetaY: PAGE.height - 68,
  headerRuleY: PAGE.height - 90,
  footerRuleY: 90,
  footerTextY: 76
});

export const FONTS = Object.freeze({
  body: { resource: 'F4', baseFont: 'Times-Roman', metrics: 'Times-Roman' },
  'body-bold': { resource: 'F5', baseFont: 'Times-Bold', metrics: 'Times-Bold' },
  // Times-Italic tem métricas próprias distintas; usar as de Times-Roman é uma
  // aproximação conservadora e documentada (o relatório só usa itálico em notas curtas).
  'body-italic': { resource: 'F6', baseFont: 'Times-Italic', metrics: 'Times-Roman' },
  ui: { resource: 'F1', baseFont: 'Helvetica', metrics: 'Helvetica' },
  'ui-bold': { resource: 'F2', baseFont: 'Helvetica-Bold', metrics: 'Helvetica-Bold' },
  'ui-italic': { resource: 'F3', baseFont: 'Helvetica-Oblique', metrics: 'Helvetica' }
});

export const COLORS = Object.freeze({
  ink: '#1A1A1A',
  graphite: '#333333',
  muted: '#5E5E5E',
  faint: '#8A8A8A',
  rule: '#C4C4C4',
  ruleStrong: '#6E6E6E',
  panel: '#F1F1F1',
  panelAlt: '#F8F8F8',
  accent: '#7A5C1E',
  accentSoft: '#D8C9A3',
  danger: '#7A1B1B',
  dangerPanel: '#FAF1F1',
  white: '#FFFFFF'
});

export const TYPE = Object.freeze({
  title: { font: 'body-bold', size: 16, leading: 20, color: 'ink' },
  family: { font: 'ui', size: 7.4, leading: 9.6, color: 'muted' },
  h2: { font: 'body-bold', size: 11.4, leading: 15, color: 'ink' },
  h3: { font: 'ui-bold', size: 8.6, leading: 11.4, color: 'graphite' },
  body: { font: 'body', size: 9.5, leading: 13.2, color: 'graphite' },
  bodySmall: { font: 'body', size: 8.4, leading: 11.4, color: 'graphite' },
  note: { font: 'ui', size: 7.6, leading: 10.2, color: 'muted' },
  table: { font: 'body', size: 7.8, leading: 10, color: 'graphite' },
  tableHeader: { font: 'ui-bold', size: 6.8, leading: 9, color: 'graphite' },
  micro: { font: 'ui', size: 6.6, leading: 9, color: 'muted' }
});

export const SPACING = Object.freeze({
  sectionBefore: 13,
  sectionAfter: 5,
  paragraphAfter: 6.5,
  bulletAfter: 2.6,
  tableAfter: 9,
  noteBefore: 5,
  noteAfter: 8,
  kvRowGap: 2.6,
  cellPadX: 4,
  cellPadY: 3,
  notePadX: 7,
  notePadY: 6
});

export const TABLE = Object.freeze({
  headerFill: 'panel',
  zebraFill: 'panelAlt',
  borderColor: 'rule',
  headerBorderColor: 'ruleStrong',
  rowBorderColor: '#E2E2E2'
});

// Larguras AFM (1/1000 em) para o intervalo ASCII imprimível.
const HELVETICA = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556,
  1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778,
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556,
  333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556,
  556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584
];

const HELVETICA_BOLD = [
  278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611,
  975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778,
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556,
  333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611,
  611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584
];

const TIMES_ROMAN = [
  250, 333, 408, 500, 500, 833, 778, 180, 333, 333, 500, 564, 250, 333, 250, 278,
  500, 500, 500, 500, 500, 500, 500, 500, 500, 500, 278, 278, 564, 564, 564, 444,
  921, 722, 667, 667, 722, 611, 556, 722, 722, 333, 389, 722, 611, 889, 722, 722,
  556, 722, 667, 556, 611, 722, 722, 944, 722, 722, 611, 333, 278, 333, 469, 500,
  333, 444, 500, 444, 500, 444, 333, 500, 500, 278, 278, 500, 278, 778, 500, 500,
  500, 500, 333, 389, 278, 500, 500, 722, 500, 500, 444, 480, 200, 480, 541
];

const TIMES_BOLD = [
  250, 333, 555, 500, 500, 1000, 833, 278, 333, 333, 500, 570, 250, 333, 250, 278,
  500, 500, 500, 500, 500, 500, 500, 500, 500, 500, 333, 333, 570, 570, 570, 500,
  930, 722, 667, 722, 722, 667, 611, 778, 778, 389, 500, 778, 667, 944, 722, 778,
  611, 778, 722, 556, 667, 722, 722, 1000, 722, 722, 667, 333, 278, 333, 581, 500,
  333, 500, 556, 444, 556, 444, 333, 500, 556, 278, 333, 556, 278, 833, 556, 500,
  556, 556, 444, 389, 333, 556, 500, 722, 500, 500, 444, 394, 220, 394, 520
];

const WIDTH_TABLES = Object.freeze({
  Helvetica: HELVETICA,
  'Helvetica-Bold': HELVETICA_BOLD,
  'Times-Roman': TIMES_ROMAN,
  'Times-Bold': TIMES_BOLD
});

// Latin-1: acentos e sinais usam a largura da letra-base (convenção da AFM).
const LATIN_BASE = {
  'À': 'A', 'Á': 'A', 'Â': 'A', 'Ã': 'A', 'Ä': 'A', 'Å': 'A', 'Ç': 'C',
  'È': 'E', 'É': 'E', 'Ê': 'E', 'Ë': 'E', 'Ì': 'I', 'Í': 'I', 'Î': 'I', 'Ï': 'I',
  'Ñ': 'N', 'Ò': 'O', 'Ó': 'O', 'Ô': 'O', 'Õ': 'O', 'Ö': 'O', 'Ø': 'O',
  'Ù': 'U', 'Ú': 'U', 'Û': 'U', 'Ü': 'U', 'Ý': 'Y',
  'à': 'a', 'á': 'a', 'â': 'a', 'ã': 'a', 'ä': 'a', 'å': 'a', 'ç': 'c',
  'è': 'e', 'é': 'e', 'ê': 'e', 'ë': 'e', 'ì': 'i', 'í': 'i', 'î': 'i', 'ï': 'i',
  'ñ': 'n', 'ò': 'o', 'ó': 'o', 'ô': 'o', 'õ': 'o', 'ö': 'o', 'ø': 'o',
  'ù': 'u', 'ú': 'u', 'û': 'u', 'ü': 'u', 'ý': 'y', 'ÿ': 'y',
  'ª': 'a', 'º': 'o'
};

// Pontuação tipográfica e sinais usados no relatório, com larguras AFM.
const EXTRA_WIDTHS = {
  Helvetica: { '–': 556, '—': 1000, '‘': 222, '’': 222, '“': 333, '”': 333, '•': 350, '…': 1000, '·': 278, '°': 400, '§': 556, '±': 584, '×': 584, '÷': 584, '€': 556 },
  'Helvetica-Bold': { '–': 556, '—': 1000, '‘': 278, '’': 278, '“': 500, '”': 500, '•': 350, '…': 1000, '·': 278, '°': 400, '§': 556, '±': 584, '×': 584, '÷': 584, '€': 556 },
  'Times-Roman': { '–': 500, '—': 1000, '‘': 333, '’': 333, '“': 444, '”': 444, '•': 350, '…': 1000, '·': 250, '°': 400, '§': 500, '±': 564, '×': 564, '÷': 564, '€': 500 },
  'Times-Bold': { '–': 500, '—': 1000, '‘': 333, '’': 333, '“': 500, '”': 500, '•': 350, '…': 1000, '·': 250, '°': 400, '§': 500, '±': 570, '×': 570, '÷': 570, '€': 500 }
};

// Caracteres que não existem em WinAnsi e são traduzidos antes da medição/escrita.
const TEXT_SUBSTITUTIONS = [
  [/[\u2010\u2011\u2012\u2013\u2014\u2212]/g, '-'],
  [/[\u2018\u2019\u201B]/g, "'"],
  [/[\u201C\u201D\u201F]/g, '"'],
  [/\u2026/g, '...'],
  [/\u00A0/g, ' '],
  [/\u2022/g, '*'],
  [/\u00AD/g, '-']
];

export function normalizeText(value) {
  let text = String(value ?? '');
  for (const [pattern, replacement] of TEXT_SUBSTITUTIONS) text = text.replace(pattern, replacement);
  return text;
}

function metricsName(fontKey) {
  const font = FONTS[fontKey] ?? FONTS[TYPE[fontKey]?.font];
  if (!font) throw new Error(`Fonte PDF desconhecida: ${fontKey}.`);
  return font.metrics;
}

function glyphWidth(metrics, character) {
  const table = WIDTH_TABLES[metrics];
  const code = character.codePointAt(0);
  if (code >= 32 && code <= 126) return table[code - 32];
  const extra = EXTRA_WIDTHS[metrics]?.[character];
  if (extra != null) return extra;
  const base = LATIN_BASE[character];
  if (base) {
    const baseCode = base.codePointAt(0);
    if (baseCode >= 32 && baseCode <= 126) return table[baseCode - 32];
  }
  // Aproximação conservadora para qualquer outro caractere Latin-1.
  return metrics.startsWith('Times') ? 500 : 556;
}

/**
 * Largura real (em pontos) de um texto na fonte indicada.
 * @param {string} text
 * @param {string} fontKey chave de FONTS
 * @param {number} size tamanho em pt
 */
export function measureText(text, fontKey, size) {
  const metrics = metricsName(fontKey);
  let units = 0;
  for (const character of normalizeText(text)) units += glyphWidth(metrics, character);
  return (units * size) / 1000;
}

/**
 * Quebra de texto por largura real. Respeita palavras; palavra maior que a
 * largura disponível é fatiada por caractere para nunca vazar a coluna.
 */
export function wrapText(text, fontKey, size, maxWidth) {
  const normalized = normalizeText(text);
  if (!normalized) return [''];
  const limit = Math.max(1, maxWidth);
  const paragraphs = normalized.split('\n');
  const lines = [];
  for (const paragraph of paragraphs) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (!words.length) {
      lines.push('');
      continue;
    }
    let current = '';
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (measureText(candidate, fontKey, size) <= limit) {
        current = candidate;
        continue;
      }
      if (current) {
        lines.push(current);
        current = '';
      }
      if (measureText(word, fontKey, size) <= limit) {
        current = word;
        continue;
      }
      let fragment = '';
      for (const character of word) {
        if (measureText(fragment + character, fontKey, size) <= limit) {
          fragment += character;
        } else {
          if (fragment) lines.push(fragment);
          fragment = character;
        }
      }
      current = fragment;
    }
    if (current) lines.push(current);
  }
  return lines.length ? lines : [''];
}

/** Ascendente aproximado (fração do tamanho) para posicionar a linha de base. */
export function ascender(fontKey) {
  return fontKey.startsWith('body') ? 0.683 : 0.718;
}

export function baselineOffset(fontKey, size, leading) {
  return ((leading - size) / 2) + (ascender(fontKey) * size);
}

const HEX_PATTERN = /^#([0-9a-fA-F]{6})$/;

/** Converte '#RRGGBB' em [r, g, b] normalizados, como o operador rg/RG espera. */
export function toRgb(hex) {
  const match = HEX_PATTERN.exec(String(hex));
  if (!match) throw new Error(`Cor hexadecimal inválida: ${hex}.`);
  const value = match[1];
  return [
    Number.parseInt(value.slice(0, 2), 16) / 255,
    Number.parseInt(value.slice(2, 4), 16) / 255,
    Number.parseInt(value.slice(4, 6), 16) / 255
  ];
}

export function color(name) {
  if (Array.isArray(name)) return name;
  const hex = COLORS[name] ?? name;
  return toRgb(hex);
}

export const THEME = Object.freeze({
  page: PAGE,
  layout: LAYOUT,
  fonts: FONTS,
  colors: COLORS,
  type: TYPE,
  spacing: SPACING,
  table: TABLE,
  measureText,
  wrapText,
  baselineOffset,
  color
});
