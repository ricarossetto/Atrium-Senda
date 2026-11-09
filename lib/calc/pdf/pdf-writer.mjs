// Núcleo do gerador de PDF dos relatórios LC 142.
//
// Escreve os objetos PDF diretamente (array de bytes, streams de conteúdo em
// claro, xref table e trailer). Nenhuma dependência npm, nenhuma compressão:
// o stream fica auditável por leitura direta e por pdftotext. As fontes são as
// 14 fontes padrão do formato com /Encoding /WinAnsiEncoding, o que cobre os
// acentos do português sem embutir arquivo de fonte.
//
// O módulo também contém o motor de paginação em duas passagens: a passagem de
// medição descobre o total M de páginas; a passagem de desenho escreve
// "Página N de M" no rodapé e repete o cabeçalho em todas as páginas.

import {
  PAGE,
  LAYOUT,
  FONTS,
  TYPE,
  SPACING,
  TABLE,
  measureText,
  wrapText,
  baselineOffset,
  color
} from './pdf-theme.mjs';

const PDF_VERSION = '1.7';
const TRAILER_ID = Buffer.from('e2e3cfd3', 'hex');

function fmt(value) {
  const rounded = Math.round(value * 1000) / 1000;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
}

function pad10(value) {
  return String(value).padStart(10, '0');
}

// WinAnsi: Latin-1 direto + bloco 0x80-0x9F dos caracteres tipográficos.
const WIN_ANSI_HIGH = new Map([
  [0x20ac, 0x80], [0x201a, 0x82], [0x0192, 0x83], [0x201e, 0x84],
  [0x2026, 0x85], [0x2020, 0x86], [0x2021, 0x87], [0x02c6, 0x88],
  [0x2030, 0x89], [0x0160, 0x8a], [0x2039, 0x8b], [0x0152, 0x8c],
  [0x017d, 0x8e], [0x2018, 0x91], [0x2019, 0x92], [0x201c, 0x93],
  [0x201d, 0x94], [0x2022, 0x95], [0x2013, 0x96], [0x2014, 0x97],
  [0x02dc, 0x98], [0x2122, 0x99], [0x0161, 0x9a], [0x203a, 0x9b],
  [0x0153, 0x9c], [0x017e, 0x9e], [0x0178, 0x9f]
]);

/**
 * Converte texto Unicode em bytes WinAnsi (retorna Buffer latin1-safe).
 * Caractere sem representação em WinAnsi vira '?' — nunca corrompe o stream.
 */
export function encodeWinAnsi(value) {
  const bytes = [];
  for (const character of String(value ?? '')) {
    const codePoint = character.codePointAt(0);
    if (codePoint === 0x0a) {
      bytes.push(0x20);
      continue;
    }
    if (codePoint < 0x20) {
      bytes.push(0x20);
      continue;
    }
    if (codePoint <= 0xff) {
      bytes.push(codePoint);
      continue;
    }
    const mapped = WIN_ANSI_HIGH.get(codePoint);
    bytes.push(mapped ?? 0x3f);
  }
  return Buffer.from(bytes);
}

/** Escapa ( ) \ para uso dentro de uma string literal PDF. */
export function escapePdfString(buffer) {
  const result = [];
  for (const byte of buffer) {
    if (byte === 0x28 || byte === 0x29 || byte === 0x5c) {
      result.push(0x5c, byte);
    } else {
      result.push(byte);
    }
  }
  return Buffer.from(result);
}

class ContentStream {
  constructor() {
    this.ops = [];
  }

  raw(op) {
    this.ops.push(op);
    return this;
  }

  save() {
    return this.raw('q');
  }

  restore() {
    return this.raw('Q');
  }

  fillColor(name) {
    const [r, g, b] = color(name);
    return this.raw(`${fmt(r)} ${fmt(g)} ${fmt(b)} rg`);
  }

  strokeColor(name) {
    const [r, g, b] = color(name);
    return this.raw(`${fmt(r)} ${fmt(g)} ${fmt(b)} RG`);
  }

  rectFill(x, y, width, height, name) {
    this.fillColor(name);
    return this.raw(`${fmt(x)} ${fmt(y)} ${fmt(width)} ${fmt(height)} re f`);
  }

  rectStroke(x, y, width, height, name, lineWidth = 0.5) {
    this.strokeColor(name);
    return this.raw(`${fmt(lineWidth)} w ${fmt(x)} ${fmt(y)} ${fmt(width)} ${fmt(height)} re S`);
  }

  line(x1, y1, x2, y2, name, lineWidth = 0.5) {
    this.strokeColor(name);
    return this.raw(`${fmt(lineWidth)} w ${fmt(x1)} ${fmt(y1)} m ${fmt(x2)} ${fmt(y2)} l S`);
  }

  text(text, x, y, fontKey, size, colorName = 'ink') {
    const font = FONTS[fontKey] ?? FONTS[TYPE[fontKey]?.font];
    if (!font) throw new Error(`Fonte PDF desconhecida: ${fontKey}.`);
    const encoded = escapePdfString(encodeWinAnsi(text));
    this.fillColor(colorName);
    this.raw('BT');
    this.raw(`/${font.resource} ${fmt(size)} Tf`);
    this.raw(`1 0 0 1 ${fmt(x)} ${fmt(y)} Tm`);
    this.ops.push(Buffer.concat([
      Buffer.from('(', 'latin1'),
      encoded,
      Buffer.from(') Tj', 'latin1')
    ]).toString('latin1'));
    this.raw('ET');
    return this;
  }

  toBuffer() {
    const chunks = this.ops.map(op => (typeof op === 'string' ? Buffer.from(`${op}\n`, 'latin1') : op));
    return Buffer.concat([...chunks, Buffer.from('\n', 'latin1')]);
  }
}

export class PdfWriter {
  constructor({ title = 'Relatório', author = 'ATRIUM', subject = '', creator = 'ATRIUM', producer = 'ATRIUM LTDA', creationDate = null } = {}) {
    this.pages = [];
    this.info = { title, author, subject, creator, producer, creationDate };
  }

  newPage() {
    const stream = new ContentStream();
    this.pages.push(stream);
    return stream;
  }

  get pageCount() {
    return this.pages.length;
  }

  build() {
    if (!this.pages.length) throw new Error('Documento PDF sem páginas.');
    const objects = [];
    const push = (buffer) => {
      objects.push(buffer);
      return objects.length; // id do objeto recém-adicionado
    };

    const catalogId = push(Buffer.from('<< /Type /Catalog /Pages 2 0 R >>', 'latin1'));
    const pagesId = push(null); // reservado; preenchido ao final

    const fontIds = new Map();
    for (const [key, font] of Object.entries(FONTS)) {
      if (fontIds.has(font.resource)) continue;
      const id = push(Buffer.from(
        `<< /Type /Font /Subtype /Type1 /BaseFont /${font.baseFont} /Encoding /WinAnsiEncoding >>`,
        'latin1'
      ));
      fontIds.set(font.resource, id);
    }

    const fontDictionary = [...fontIds.entries()]
      .map(([resource, id]) => `/${resource} ${id} 0 R`)
      .join(' ');
    const resources = Buffer.from(`<< /Font << ${fontDictionary} >> /ProcSet [/PDF /Text] >>`, 'latin1');

    const pageIds = [];
    for (const stream of this.pages) {
      const content = stream.toBuffer();
      const contentId = push(Buffer.concat([
        Buffer.from(`<< /Length ${content.length} >>\nstream\n`, 'latin1'),
        content,
        Buffer.from('endstream', 'latin1')
      ]));
      const pageId = push(Buffer.from(
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE.width} ${PAGE.height}] /Resources ${resources.toString('latin1')} /Contents ${contentId} 0 R >>`,
        'latin1'
      ));
      pageIds.push(pageId);
    }

    objects[pagesId - 1] = Buffer.from(
      `<< /Type /Pages /Count ${this.pages.length} /Kids [${pageIds.map(id => `${id} 0 R`).join(' ')}] >>`,
      'latin1'
    );

    const creationDate = this.info.creationDate ? formatPdfDate(this.info.creationDate) : null;
    const infoEntries = [
      `/Title ${literal(this.info.title)}`,
      `/Author ${literal(this.info.author)}`,
      `/Subject ${literal(this.info.subject)}`,
      `/Creator ${literal(this.info.creator)}`,
      `/Producer ${literal(this.info.producer)}`
    ];
    if (creationDate) infoEntries.push(`/CreationDate (${creationDate})`);
    const infoId = push(Buffer.from(`<< ${infoEntries.join(' ')} >>`, 'latin1'));

    const chunks = [Buffer.concat([
      Buffer.from(`%PDF-${PDF_VERSION}\n`, 'latin1'),
      Buffer.from([0x25, ...TRAILER_ID, 0x0a])
    ])];
    let length = chunks[0].length;
    const offsets = [];
    for (let index = 0; index < objects.length; index += 1) {
      const id = index + 1;
      const body = Buffer.concat([
        Buffer.from(`${id} 0 obj\n`, 'latin1'),
        objects[index],
        Buffer.from('\nendobj\n', 'latin1')
      ]);
      offsets[id] = length;
      chunks.push(body);
      length += body.length;
    }

    const xrefOffset = length;
    const xrefLines = [`xref\n0 ${objects.length + 1}\n`, '0000000000 65535 f \n'];
    for (let id = 1; id <= objects.length; id += 1) {
      xrefLines.push(`${pad10(offsets[id])} 00000 n \n`);
    }
    xrefLines.push(
      `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R /Info ${infoId} 0 R >>\n`,
      `startxref\n${xrefOffset}\n%%EOF\n`
    );
    chunks.push(Buffer.from(xrefLines.join(''), 'latin1'));
    return Buffer.concat(chunks);
  }
}

/**
 * String de texto PDF para o dicionário /Info.
 *
 * O /Info NÃO usa a codificação do stream de conteúdo: uma string literal ali
 * é lida como PDFDocEncoding, então U+2014 (—) sairia como "Š". Para manter o
 * texto dos metadados correto em qualquer leitor, todo valor é escrito como
 * string hexadecimal UTF-16BE com BOM (FE FF), que o formato define para texto
 * Unicode fora do domínio PDFDocEncoding.
 */
function literal(text) {
  const value = String(text ?? '');
  const utf16le = Buffer.from(value, 'utf16le');
  const utf16be = Buffer.alloc(utf16le.length);
  for (let index = 0; index < utf16le.length; index += 2) {
    utf16be[index] = utf16le[index + 1];
    utf16be[index + 1] = utf16le[index];
  }
  return `<FEFF${utf16be.toString('hex').toUpperCase()}>`;
}

function formatPdfDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const pad = (number) => String(number).padStart(2, '0');
  return [
    'D:',
    date.getUTCFullYear(),
    pad(date.getUTCMonth() + 1),
    pad(date.getUTCDate()),
    pad(date.getUTCHours()),
    pad(date.getUTCMinutes()),
    pad(date.getUTCSeconds()),
    "Z"
  ].join('');
}

// ---------------------------------------------------------------------------
// Motor de fluxo com paginação em duas passagens
// ---------------------------------------------------------------------------

const DANGER_TONES = new Set(['danger', 'aviso']);

export class ReportFlow {
  /**
   * @param {object} options
   * @param {boolean} options.dryRun passagem de medição (não desenha)
   * @param {number|null} options.totalPages total conhecido na passagem de desenho
   * @param {object} options.writer instância de PdfWriter
   * @param {object} options.header { title, family, metaLines: string[], rightLines: string[] }
   * @param {object} options.footer { left: string, right: string }
   */
  constructor({ dryRun = false, totalPages = null, writer = null, header = null, footer = null } = {}) {
    this.dryRun = dryRun;
    this.totalPages = totalPages;
    this.writer = writer;
    this.header = header;
    this.footer = footer;
    this.pageNumber = 0;
    this.stream = null;
    this.cursorY = LAYOUT.contentTop;
    this.started = false;
  }

  #emit(callback) {
    if (this.dryRun) return;
    callback(this.stream);
  }

  start() {
    if (this.started) return this;
    this.started = true;
    this.#beginPage();
    return this;
  }

  #beginPage() {
    this.pageNumber += 1;
    if (!this.dryRun) {
      this.stream = this.writer.newPage();
      this.#drawHeader();
      this.#drawFooter();
    }
    this.cursorY = LAYOUT.contentTop;
  }

  #drawHeader() {
    const header = this.header;
    if (!header) return;
    const stream = this.stream;
    stream.save();
    stream.text(header.family || '', LAYOUT.contentLeft, LAYOUT.headerTitleY + 16, TYPE.family.font, TYPE.family.size, 'muted');
    stream.text(header.title || '', LAYOUT.contentLeft, LAYOUT.headerTitleY, 'body-bold', 12.4, 'ink');
    const rightLines = header.rightLines || [];
    rightLines.forEach((line, index) => {
      const y = LAYOUT.headerTitleY - 2 - (index * 9.6);
      const width = measureText(line, 'micro', TYPE.micro.size);
      stream.text(line, LAYOUT.contentRight - width, y, 'micro', TYPE.micro.size, index === 0 ? 'graphite' : 'muted');
    });
    stream.line(LAYOUT.contentLeft, LAYOUT.headerRuleY, LAYOUT.contentRight, LAYOUT.headerRuleY, 'rule', 0.6);
    stream.restore();
  }

  #drawFooter() {
    const stream = this.stream;
    const footer = this.footer || {};
    stream.save();
    stream.line(LAYOUT.contentLeft, LAYOUT.footerRuleY, LAYOUT.contentRight, LAYOUT.footerRuleY, 'rule', 0.6);
    const left = footer.left || '';
    if (left) stream.text(left, LAYOUT.contentLeft, LAYOUT.footerTextY, 'micro', TYPE.micro.size, 'faint');
    const pageLabel = this.totalPages
      ? `Página ${this.pageNumber} de ${this.totalPages}`
      : `Página ${this.pageNumber}`;
    const labelWidth = measureText(pageLabel, 'ui-bold', TYPE.micro.size);
    stream.text(pageLabel, LAYOUT.contentRight - labelWidth, LAYOUT.footerTextY, 'ui-bold', TYPE.micro.size, 'graphite');
    if (footer.right) {
      const rightWidth = measureText(footer.right, 'micro', TYPE.micro.size);
      stream.text(footer.right, LAYOUT.contentRight - rightWidth, LAYOUT.footerTextY - 10, 'micro', TYPE.micro.size, 'faint');
    }
    stream.restore();
  }

  remaining() {
    return this.cursorY - LAYOUT.contentBottom;
  }

  ensureSpace(height) {
    if (height > this.remaining()) {
      this.pageBreak();
      return true;
    }
    return false;
  }

  pageBreak() {
    if (this.pageNumber === 0) {
      this.start();
      return;
    }
    this.#beginPage();
  }

  space(height) {
    this.cursorY -= height;
  }

  rule({ colorName = 'rule', width = 0.6, gap = 6 } = {}) {
    this.ensureSpace(gap + 2);
    this.cursorY -= gap;
    this.#emit(stream => stream.line(LAYOUT.contentLeft, this.cursorY, LAYOUT.contentRight, this.cursorY, colorName, width));
    this.cursorY -= gap;
  }

  heading(text, { size = null, keepWith = 54 } = {}) {
    const style = TYPE.h2;
    const fontSize = size ?? style.size;
    const lines = wrapText(text, style.font, fontSize, LAYOUT.contentWidth);
    const height = (lines.length * style.leading) + SPACING.sectionAfter + SPACING.sectionBefore;
    // Controle de órfã: o título não pode ficar sozinho no pé da página; exige
    // espaço para ele e para o início do bloco seguinte.
    if (height + keepWith > this.remaining()) this.pageBreak();
    this.cursorY -= SPACING.sectionBefore;
    this.#emit(stream => {
      let y = this.cursorY - baselineOffset(style.font, fontSize, style.leading);
      for (const line of lines) {
        stream.text(line, LAYOUT.contentLeft, y, style.font, fontSize, style.color);
        y -= style.leading;
      }
    });
    this.cursorY -= lines.length * style.leading;
    this.cursorY -= SPACING.sectionAfter;
    return this;
  }

  subheading(text) {
    const style = TYPE.h3;
    const lines = wrapText(text, style.font, style.size, LAYOUT.contentWidth);
    const height = lines.length * style.leading + 7;
    if (height + 24 > this.remaining()) this.pageBreak();
    this.cursorY -= 3;
    this.#emit(stream => {
      let y = this.cursorY - baselineOffset(style.font, style.size, style.leading);
      for (const line of lines) {
        stream.text(line, LAYOUT.contentLeft, y, style.font, style.size, style.color);
        y -= style.leading;
      }
    });
    this.cursorY -= lines.length * style.leading;
    this.cursorY -= 4;
    return this;
  }

  paragraph(text, { style = TYPE.body, gap = SPACING.paragraphAfter, indent = 0 } = {}) {
    let lines = wrapText(text, style.font, style.size, LAYOUT.contentWidth - indent);
    while (lines.length) {
      const available = Math.max(1, Math.floor(this.remaining() / style.leading));
      if (this.remaining() < style.leading * 2) {
        this.pageBreak();
        continue;
      }
      const chunk = lines.slice(0, available);
      lines = lines.slice(chunk.length);
      this.#emit(stream => {
        let y = this.cursorY - baselineOffset(style.font, style.size, style.leading);
        for (const line of chunk) {
          stream.text(line, LAYOUT.contentLeft + indent, y, style.font, style.size, style.color);
          y -= style.leading;
        }
      });
      this.cursorY -= chunk.length * style.leading;
      if (lines.length) this.pageBreak();
    }
    this.cursorY -= gap;
    return this;
  }

  bullets(items, { style = TYPE.body, marker = '–', gap = SPACING.bulletAfter, bulletIndent = 10 } = {}) {
    for (const item of items) {
      let lines = wrapText(item, style.font, style.size, LAYOUT.contentWidth - bulletIndent);
      let first = true;
      while (lines.length) {
        if (this.remaining() < style.leading * 2) this.pageBreak();
        const available = Math.max(1, Math.floor(this.remaining() / style.leading));
        const chunk = lines.slice(0, available);
        lines = lines.slice(chunk.length);
        this.#emit(stream => {
          let y = this.cursorY - baselineOffset(style.font, style.size, style.leading);
          if (first) {
            stream.text(marker, LAYOUT.contentLeft, y, style.font, style.size, 'muted');
          }
          for (const line of chunk) {
            stream.text(line, LAYOUT.contentLeft + bulletIndent, y, style.font, style.size, style.color);
            y -= style.leading;
          }
        });
        this.cursorY -= chunk.length * style.leading;
        if (lines.length) this.pageBreak();
        first = false;
      }
      this.cursorY -= gap;
    }
    return this;
  }

  note(text, { tone = 'neutral', title = null } = {}) {
    const isDanger = DANGER_TONES.has(tone);
    const titleStyle = { font: 'ui-bold', size: TYPE.note.size, leading: TYPE.note.leading + 1.2 };
    const style = TYPE.bodySmall;
    const padX = SPACING.notePadX;
    const padY = SPACING.notePadY;
    const width = LAYOUT.contentWidth;
    const innerWidth = width - (padX * 2) - 6;
    const titleLines = title ? wrapText(title, titleStyle.font, titleStyle.size, innerWidth) : [];
    const bodyLines = wrapText(text, style.font, style.size, innerWidth);
    const titleHeight = titleLines.length ? titleLines.length * titleStyle.leading : 0;
    const totalHeight = (padY * 2) + titleHeight + (bodyLines.length * style.leading);

    // Mantém o bloco inteiro na página seguinte quando não couber no espaço restante.
    if (totalHeight > this.remaining() && totalHeight <= (LAYOUT.contentTop - LAYOUT.contentBottom)) {
      this.pageBreak();
    }

    let firstChunk = true;
    let pending = bodyLines;
    while (pending.length) {
      const rest = this.remaining();
      // quanto cabe nesta página: padY + (eventual título) + N linhas de corpo + padY
      const headroom = rest - (padY * 2) - (firstChunk ? titleHeight : 0);
      const capacity = Math.max(1, Math.floor(headroom / style.leading));
      const chunk = pending.slice(0, Math.min(capacity, pending.length));
      pending = pending.slice(chunk.length);
      const chunkTitleHeight = firstChunk ? titleHeight : 0;
      const chunkHeight = (padY * 2) + chunkTitleHeight + (chunk.length * style.leading);
      const top = this.cursorY;

      this.#emit(stream => {
        stream.save();
        stream.rectFill(LAYOUT.contentLeft, top - chunkHeight, width, chunkHeight, isDanger ? 'dangerPanel' : 'panel');
        stream.rectFill(LAYOUT.contentLeft, top - chunkHeight, 2.4, chunkHeight, isDanger ? 'danger' : 'ruleStrong');
        let lineTop = top - padY;
        if (firstChunk) {
          for (const line of titleLines) {
            const baseline = lineTop - baselineOffset(titleStyle.font, titleStyle.size, titleStyle.leading);
            stream.text(line, LAYOUT.contentLeft + padX + 3, baseline, titleStyle.font, titleStyle.size, isDanger ? 'danger' : 'graphite');
            lineTop -= titleStyle.leading;
          }
        }
        for (const line of chunk) {
          const baseline = lineTop - baselineOffset(style.font, style.size, style.leading);
          stream.text(line, LAYOUT.contentLeft + padX + 3, baseline, style.font, style.size, isDanger ? 'danger' : 'graphite');
          lineTop -= style.leading;
        }
        stream.restore();
      });

      this.cursorY = top - chunkHeight - SPACING.noteAfter;
      firstChunk = false;
      if (pending.length) this.pageBreak();
    }
    return this;
  }

  /**
   * Tabela com cabeçalho repetido a cada quebra de página e células que
   * quebram linha (nunca corta linha ao meio).
   */
  table({ columns, rows, after = SPACING.tableAfter, fontSize = TYPE.table.size } = {}) {
    if (!Array.isArray(columns) || !columns.length) throw new Error('Tabela sem colunas.');
    if (!Array.isArray(rows)) throw new Error('Tabela sem linhas.');
    const style = { ...TYPE.table, size: fontSize };
    const headerStyle = TYPE.tableHeader;
    const padX = SPACING.cellPadX;
    const padY = SPACING.cellPadY;
    const totalWidth = columns.reduce((sum, column) => sum + column.width, 0);
    if (totalWidth > LAYOUT.contentWidth + 0.01) {
      throw new Error(`Tabela excede a largura da página (${fmt(totalWidth)} > ${fmt(LAYOUT.contentWidth)}).`);
    }

    const alignFor = (column) => column.align || 'left';
    const xFor = (column, index) => {
      let x = LAYOUT.contentLeft;
      for (let i = 0; i < index; i += 1) x += columns[i].width;
      return x;
    };

    const measureRow = (cells) => {
      const prepared = columns.map((column, index) => {
        const value = cells[index] == null ? '' : String(cells[index]);
        return wrapText(value, style.font, style.size, column.width - padX * 2);
      });
      const maxLines = Math.max(...prepared.map(lines => lines.length), 1);
      return { prepared, height: (maxLines * style.leading) + (padY * 2) };
    };

    const drawRow = (row, { header = false, zebra = false } = {}) => {
      const top = this.cursorY;
      this.#emit(stream => {
        stream.save();
        if (header) {
          stream.rectFill(LAYOUT.contentLeft, top - row.height, LAYOUT.contentWidth, row.height, TABLE.headerFill);
        } else if (zebra) {
          stream.rectFill(LAYOUT.contentLeft, top - row.height, LAYOUT.contentWidth, row.height, TABLE.zebraFill);
        }
        stream.line(LAYOUT.contentLeft, top - row.height, LAYOUT.contentRight, top - row.height, header ? TABLE.headerBorderColor : TABLE.rowBorderColor, 0.45);
        row.prepared.forEach((lines, index) => {
          const column = columns[index];
          const x = xFor(column, index);
          const align = alignFor(column);
          const fontKey = header ? headerStyle.font : style.font;
          const size = header ? headerStyle.size : style.size;
          const leading = header ? headerStyle.leading : style.leading;
          let y = top - padY - baselineOffset(fontKey, size, leading);
          for (const line of lines) {
            let drawX = x + padX;
            if (align === 'right') {
              drawX = x + column.width - padX - measureText(line, fontKey, size);
            } else if (align === 'center') {
              drawX = x + ((column.width - measureText(line, fontKey, size)) / 2);
            }
            stream.text(line, drawX, y, fontKey, size, header ? headerStyle.color : style.color);
            y -= leading;
          }
        });
        stream.restore();
      });
      this.cursorY -= row.height;
    };

    const headerRow = measureRow(columns.map(column => column.label));
    this.ensureSpace(headerRow.height + (rows.length ? style.leading : 0));
    drawRow(headerRow, { header: true });
    // linha sob o cabeçalho
    this.#emit(stream => {
      stream.line(LAYOUT.contentLeft, this.cursorY, LAYOUT.contentRight, this.cursorY, TABLE.headerBorderColor, 0.7);
    });

    rows.forEach((cells, index) => {
      const row = measureRow(cells);
      if (row.height > this.remaining()) {
        this.pageBreak();
        drawRow(headerRow, { header: true });
        this.#emit(stream => {
          stream.line(LAYOUT.contentLeft, this.cursorY, LAYOUT.contentRight, this.cursorY, TABLE.headerBorderColor, 0.7);
        });
      }
      drawRow(row, { zebra: index % 2 === 1 });
    });

    this.cursorY -= after;
    return this;
  }

  /**
   * Bloco de rótulo/valor sem cabeçalho de tabela. Com `columns: 2` os pares
   * são distribuídos lado a lado, o que reduz a altura pela metade em blocos
   * longos (indicadores, referência) sem virar tabela.
   */
  keyValueBlock(pairs, { labelWidth = 170, gap = SPACING.kvRowGap, columns = 1 } = {}) {
    const style = TYPE.body;
    const slots = Math.max(1, Math.min(2, columns));
    const slotWidth = LAYOUT.contentWidth / slots;
    // Com duas colunas o rótulo precisa ser estreito, senão o valor fica com
    // poucos pontos e quebra em duas linhas, dobrando a altura do bloco (o
    // oposto do objetivo de compactar).
    const effectiveLabelWidth = slots === 1 ? Math.min(labelWidth, slotWidth - 40) : Math.min(labelWidth, 118);
    const valueWidth = slotWidth - effectiveLabelWidth - 8;
    const perRow = slots;
    for (let index = 0; index < pairs.length; index += perRow) {
      const rowPairs = pairs.slice(index, index + perRow);
      const prepared = rowPairs.map(([label, value], slot) => {
        const x = LAYOUT.contentLeft + (slot * slotWidth);
        return {
          x,
          labelLines: wrapText(label, 'ui-bold', style.size, effectiveLabelWidth - 8),
          valueLines: wrapText(value == null ? '' : String(value), style.font, style.size, valueWidth)
        };
      });
      const rowHeight = Math.max(...prepared.map(slot => Math.max(slot.labelLines.length, slot.valueLines.length))) * style.leading;
      this.ensureSpace(rowHeight + style.leading);
      this.#emit(stream => {
        for (const slot of prepared) {
          let labelY = this.cursorY - baselineOffset('ui-bold', style.size, style.leading);
          for (const line of slot.labelLines) {
            stream.text(line, slot.x, labelY, 'ui-bold', style.size, 'graphite');
            labelY -= style.leading;
          }
          let valueY = this.cursorY - baselineOffset(style.font, style.size, style.leading);
          for (const line of slot.valueLines) {
            stream.text(line, slot.x + effectiveLabelWidth, valueY, style.font, style.size, style.color);
            valueY -= style.leading;
          }
        }
      });
      this.cursorY -= rowHeight + gap;
    }
    return this;
  }

  finish() {
    if (!this.started) this.start();
    if (this.pageNumber === 0) this.#beginPage();
    return this;
  }
}

/**
 * Executa o compositor em duas passagens: medição (descobre M) e desenho.
 * O compositor recebe o fluxo e deve ser puro em relação aos dados.
 */
export function paginate(compose, { writer, header, footer, info = {} }) {
  const measure = new ReportFlow({ dryRun: true, writer: null, header, footer });
  compose(measure);
  measure.finish();
  const totalPages = Math.max(1, measure.pageNumber);

  const target = writer || new PdfWriter(info);
  const draw = new ReportFlow({ dryRun: false, totalPages, writer: target, header, footer });
  compose(draw);
  draw.finish();
  return { bytes: target.build(), pageCount: draw.pageNumber, totalPages };
}

export { PAGE, LAYOUT, TYPE, SPACING, TABLE, measureText, wrapText };
