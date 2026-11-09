/**
 * Organização visual do texto oficial da publicação.
 *
 * DJEN, eproc, PJe, Domicílio e INPI entregam o teor em uma linha só: identificação,
 * advogados e decisão vêm colados. Este módulo só escolhe onde quebrar a linha. Nenhuma
 * palavra é alterada, removida ou reordenada; se a conferência final não bater, o texto
 * volta como veio. Não interpreta o teor, não calcula prazo e não classifica o ato.
 */

const MIN_LENGTH = 200;
const PARAGRAPH_TARGET = 320;
const PARAGRAPH_LIMIT = 560;

const PARTY_LABELS = [
  'ADVOGAD[OA]\\(A\\)', 'ADVOGAD[OA]S?', 'EXEQUENTES?', 'EXECUTAD[OA]S?', 'REQUERENTES?', 'REQUERID[OA]S?',
  'AUTOR(?:A|ES)?', 'RÉU', 'RÉ', 'RÉUS', 'AGRAVANTES?', 'AGRAVAD[OA]S?', 'APELANTES?', 'APELAD[OA]S?',
  'RECORRENTES?', 'RECORRID[OA]S?', 'RECLAMANTES?', 'RECLAMAD[OA]S?', 'EMBARGANTES?', 'EMBARGAD[OA]S?',
  'IMPETRANTES?', 'IMPETRAD[OA]S?', 'RELATOR(?:A)?', 'INTERESSAD[OA]S?', 'PROCURADOR(?:A)?', 'TIPO DE AÇÃO'
];
const TITLE_LABELS = [
  'Advogad[oa](?:\\(a\\))?', 'Exequente', 'Executad[oa]', 'Requerente', 'Requerid[oa]', 'Autor(?:a)?', 'Réu',
  'Agravante', 'Agravad[oa]', 'Apelante', 'Apelad[oa]', 'Recorrente', 'Recorrid[oa]', 'Relator(?:a)?',
  'Procurador(?:a)?', 'Juízo', 'Processo', 'Classe', 'Assunto', 'Órgão', 'Prazo', 'Último movimento',
  'Julgado em', 'Titular', 'Especificação', 'Tese de julgamento', 'Dispositivos relevantes citados',
  'Jurisprudência relevante citada'
];
const LABEL_SOURCE = `(?:${[...PARTY_LABELS, ...TITLE_LABELS].join('|')})\\s?:`;
const LABEL_BREAK = new RegExp(`(?<![\\p{L}(/-])${LABEL_SOURCE}`, 'gu');
const LABEL_LINE = new RegExp(`^(${LABEL_SOURCE})\\s*(.*)$`, 'su');
const PARTY_LINE = new RegExp(`^(?:${PARTY_LABELS.join('|')})\\s?:`, 'u');

const HEADING_SOURCE = '(?:CASO EM EXAME|QUESTÃO EM DISCUSSÃO|RAZÕES DE DECIDIR|DISPOSITIVO E TESE|DISPOSITIVO|FUNDAMENTAÇÃO|RELATÓRIO|EMENTA|ACÓRDÃO|VOTO|DECISÃO|DESPACHO|SENTENÇA)';
const HEADING_FULL = `${HEADING_SOURCE}(?:\\s?/\\s?${HEADING_SOURCE})*`;
const HEADING_BREAK = new RegExp(`(?<![\\p{L}/-])${HEADING_FULL}(?![\\p{L}/-])[:.]?`, 'gu');
const HEADING_LINE = new RegExp(`^${HEADING_FULL}[:.]?$`, 'u');

const OPENER_BREAK = /(?<=[.;:!?)] )(?:Vistos|Decido|Trata-se|Intimem-se|Intime-se|Cumpra-se|Cite-se|Publique-se|Registre-se|Diligências legais|Ante o exposto|Diante do exposto|Pelo exposto|Isso posto|Isto posto|Dessa forma|Assim sendo|Nesse sentido|Evento \d)(?![\p{L}])/gu;
const ENUMERATION_BREAK = /(?<=[.;:] )(?:[IVX]{1,4} ?[-–.]|\d{1,2}\.) ?(?=[A-ZÀ-Ú])/gu;
const AFTER_OAB = /\((?:OAB\s*)?[A-Z]{2}\s*\d{3,}[A-Z]?\)(?=\s)/gu;
const SENTENCE_END = /(?<![\s(](?:art|arts|inc|incs|n|nº|ns|fl|fls|p|pp|dr|dra|drs|min|rel|des|cf|ex|ltda|s\.a|v|vs|e\.g|i\.e|§|al|c))[.!?](?= [A-ZÀ-Ú"“(])/giu;

function compact(value) {
  return value.replace(/\s+/g, '');
}

function splitAt(text, positions) {
  const ordered = [...new Set(positions)].filter(index => index > 0 && index < text.length).sort((a, b) => a - b);
  const lines = [];
  let start = 0;
  for (const index of [...ordered, text.length]) {
    const line = text.slice(start, index).trim();
    if (line) lines.push(line);
    start = index;
  }
  return lines;
}

function splitLongParagraph(line) {
  if (line.length <= PARAGRAPH_LIMIT) return [line];
  const positions = [];
  let last = 0;
  for (const match of line.matchAll(SENTENCE_END)) {
    const end = match.index + match[0].length;
    if (end - last >= PARAGRAPH_TARGET && line.length - end >= 80) {
      positions.push(end);
      last = end;
    }
  }
  return splitAt(line, positions);
}

/** Nome em maiúsculas seguido da frase do ato: "RÉU: FULANO DE TAL Foi intimada...". */
function splitPartyValue(line) {
  if (!PARTY_LINE.test(line)) return [line];
  const labelEnd = line.indexOf(':') + 1;
  const value = line.slice(labelEnd);
  const match = value.match(/^(\s*[^a-zà-ú]{3,}?)\s(?=[A-ZÀ-Ú][a-zà-ú])/u);
  if (!match || value.length - match[0].length < 40) return [line];
  return splitAt(line, [labelEnd + match[0].length]);
}

/** Sinal solto ("-", "/", ":") não vira linha própria: fica junto do que vem antes. */
function mergeBareMarks(lines) {
  const merged = [];
  for (const line of lines) {
    if (merged.length && !/[\p{L}\d]/u.test(line)) merged[merged.length - 1] += ` ${line}`;
    else merged.push(line);
  }
  return merged;
}

function classify(line) {
  if (HEADING_LINE.test(line)) return { type: 'heading', text: line };
  const label = line.match(LABEL_LINE);
  if (label && label[2]) return { type: 'field', label: label[1], value: label[2] };
  return { type: 'paragraph', text: line };
}

function blockText(block) {
  return block.type === 'field' ? `${block.label}${block.value}` : block.text;
}

/**
 * @returns {{ structured: boolean, text: string, blocks: Array<{type: string, text?: string, label?: string, value?: string}> }}
 */
export function layoutPublicationText(value) {
  const text = String(value ?? '');
  const plain = { structured: false, text, blocks: [] };
  if (text.length < MIN_LENGTH || text.includes('\n')) return plain;

  const positions = [];
  for (const match of text.matchAll(LABEL_BREAK)) positions.push(match.index);
  for (const match of text.matchAll(HEADING_BREAK)) positions.push(match.index, match.index + match[0].length);
  for (const match of text.matchAll(OPENER_BREAK)) positions.push(match.index);
  for (const match of text.matchAll(ENUMERATION_BREAK)) positions.push(match.index);
  for (const match of text.matchAll(AFTER_OAB)) positions.push(match.index + match[0].length);

  const lines = mergeBareMarks(splitAt(text, positions)).flatMap(splitPartyValue).flatMap(splitLongParagraph);
  if (lines.length < 2) return plain;
  const blocks = lines.map(classify);
  // Garantia do contrato: a organização nunca muda o conteúdo oficial.
  if (compact(blocks.map(blockText).join('')) !== compact(text)) return plain;
  return { structured: true, text, blocks };
}
