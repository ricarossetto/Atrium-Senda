/**
 * Decodificação de entidades HTML para o teor de publicações no servidor
 * (e-mail, texto puro e leitura de fontes que entregam HTML).
 *
 * Cobre o conjunto Latin-1, pontuação e símbolos usados nos portais
 * judiciais. Entidades desconhecidas são preservadas, nunca descartadas.
 */

const ENTITY_MAP = Object.freeze({
  quot: '"', amp: '&', apos: "'", lt: '<', gt: '>', nbsp: ' ',
  iexcl: '¡', cent: '¢', pound: '£', curren: '¤', yen: '¥', brvbar: '¦', sect: '§', uml: '¨',
  copy: '©', ordf: 'ª', laquo: '«', not: '¬', shy: '­', reg: '®', macr: '¯', deg: '°',
  plusmn: '±', sup2: '²', sup3: '³', acute: '´', micro: 'µ', para: '¶', middot: '·',
  cedil: '¸', sup1: '¹', ordm: 'º', raquo: '»', frac14: '¼', frac12: '½', frac34: '¾',
  iquest: '¿', Agrave: 'À', Aacute: 'Á', Acirc: 'Â', Atilde: 'Ã', Auml: 'Ä', Aring: 'Å',
  AElig: 'Æ', Ccedil: 'Ç', Egrave: 'È', Eacute: 'É', Ecirc: 'Ê', Euml: 'Ë', Igrave: 'Ì',
  Iacute: 'Í', Icirc: 'Î', Iuml: 'Ï', ETH: 'Ð', Ntilde: 'Ñ', Ograve: 'Ò', Oacute: 'Ó',
  Ocirc: 'Ô', Otilde: 'Õ', Ouml: 'Ö', times: '×', Oslash: 'Ø', Ugrave: 'Ù', Uacute: 'Ú',
  Ucirc: 'Û', Uuml: 'Ü', Yacute: 'Ý', THORN: 'Þ', szlig: 'ß', agrave: 'à', aacute: 'á',
  acirc: 'â', atilde: 'ã', auml: 'ä', aring: 'å', aelig: 'æ', ccedil: 'ç', egrave: 'è',
  eacute: 'é', ecirc: 'ê', euml: 'ë', igrave: 'ì', iacute: 'í', icirc: 'î', iuml: 'ï',
  eth: 'ð', ntilde: 'ñ', ograve: 'ò', oacute: 'ó', ocirc: 'ô', otilde: 'õ', ouml: 'ö',
  divide: '÷', oslash: 'ø', ugrave: 'ù', uacute: 'ú', ucirc: 'û', uuml: 'ü', yacute: 'ý',
  thorn: 'þ', yuml: 'ÿ', OElig: 'Œ', oelig: 'œ', Scaron: 'Š', scaron: 'š', Yuml: 'Ÿ',
  fnof: 'ƒ', circ: 'ˆ', tilde: '˜', ensp: ' ', emsp: ' ', thinsp: ' ', zwnj: '‌',
  zwj: '‍', lrm: '‎', rlm: '‏', ndash: '–', mdash: '—', lsquo: '‘', rsquo: '’',
  sbquo: '‚', ldquo: '“', rdquo: '”', bdquo: '„', dagger: '†', Dagger: '‡', bull: '•',
  hellip: '…', permil: '‰', prime: '′', Prime: '″', lsaquo: '‹', rsaquo: '›', oline: '‾',
  frasl: '⁄', euro: '€', trade: '™', larr: '←', uarr: '↑', rarr: '→', darr: '↓', harr: '↔',
  crarr: '↵', lArr: '⇐', uArr: '⇑', rArr: '⇒', dArr: '⇓', hArr: '⇔', forall: '∀', part: '∂',
  exist: '∃', empty: '∅', nabla: '∇', isin: '∈', notin: '∉', ni: '∋', prod: '∏', sum: '∑',
  minus: '−', lowast: '∗', radic: '√', prop: '∝', infin: '∞', ang: '∠', and: '∧', or: '∨',
  cap: '∩', cup: '∪', int: '∫', there4: '∴', sim: '∼', cong: '≅', asymp: '≈', ne: '≠',
  equiv: '≡', le: '≤', ge: '≥', sub: '⊂', sup: '⊃', nsub: '⊄', sube: '⊆', supe: '⊇',
  oplus: '⊕', otimes: '⊗', perp: '⊥', sdot: '⋅', lceil: '⌈', rceil: '⌉', lfloor: '⌊',
  rfloor: '⌋', lang: '〈', rang: '〉', loz: '◊', spades: '♠', clubs: '♣', hearts: '♥',
  diams: '♦'
});

export function decodeHtmlEntities(value) {
  let text = String(value ?? '');
  if (!text.includes('&')) return text;
  for (let pass = 0; pass < 2; pass += 1) {
    const before = text;
    text = text
      .replace(/&#x([0-9a-f]+);/gi, (match, hex) => {
        try { return String.fromCodePoint(parseInt(hex, 16)); } catch { return match; }
      })
      .replace(/&#(\d+);/g, (match, decimal) => {
        try { return String.fromCodePoint(Number(decimal)); } catch { return match; }
      })
      .replace(/&([a-zA-Z][a-zA-Z0-9]+);/g, (match, name) => ENTITY_MAP[name] ?? match);
    if (text === before) break;
  }
  return text;
}

export function stripHtmlToText(value) {
  let text = String(value ?? '');
  if (!text) return '';
  text = text.replace(/<\s*(script|style|head)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, ' ');
  text = text.replace(/<\s*br\s*\/?\s*>/gi, '\n');
  text = text.replace(/<\s*\/\s*(p|div|li|tr|h[1-6]|blockquote|section|article)\s*>/gi, '\n');
  text = text.replace(/<[^>]+>/g, ' ');
  text = decodeHtmlEntities(text);
  return text
    .replace(/[ \t\f\v]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n\n')
    .replace(/ *\n */g, '\n')
    .trim();
}
