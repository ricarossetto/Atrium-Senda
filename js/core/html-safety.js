import { safeImageSource } from './link-safety.js?v=3.0.0';

const ALLOWED_ELEMENTS = new Set([
  'A', 'B', 'BLOCKQUOTE', 'BR', 'CODE', 'DIV', 'EM', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
  'HEADER', 'FOOTER', 'HR', 'I', 'IMG', 'LI', 'MAIN', 'OL', 'P', 'PRE', 'S', 'SECTION', 'SMALL', 'SPAN', 'STRONG', 'TABLE',
  'TBODY', 'TD', 'TFOOT', 'TH', 'THEAD', 'TR', 'U', 'UL'
]);

const ALLOWED_STYLES = new Set([
  'background-color', 'border', 'border-bottom', 'border-collapse', 'border-color',
  'border-left', 'border-radius', 'border-right', 'border-style', 'border-top',
  'border-width', 'color', 'font-family', 'font-size', 'font-style', 'font-weight',
  'height', 'line-height', 'margin', 'margin-bottom', 'margin-left', 'margin-right',
  'margin-top', 'max-width', 'padding', 'padding-bottom', 'padding-left',
  'padding-right', 'padding-top', 'text-align', 'text-decoration', 'vertical-align', 'white-space', 'width'
]);

function safeLink(value) {
  const raw = String(value ?? '').trim();
  if (raw.startsWith('#')) return raw;
  try {
    const url = new URL(raw);
    return ['https:', 'http:', 'mailto:', 'tel:'].includes(url.protocol) ? raw : '';
  } catch {
    return '';
  }
}

function safeStyle(value) {
  return String(value ?? '').split(';').map(declaration => {
    const separator = declaration.indexOf(':');
    if (separator < 0) return '';
    const name = declaration.slice(0, separator).trim().toLowerCase();
    const content = declaration.slice(separator + 1).trim();
    if (!ALLOWED_STYLES.has(name) || !content || /[\\@{}<>\x00-\x1f]|\/\*|(?:url|expression|image-set)\s*\(/i.test(content)) return '';
    if (!/^[\w#% .,'"()/\-]+$/.test(content)) return '';
    return `${name}: ${content}`;
  }).filter(Boolean).join('; ');
}

export function sanitizeRichHtml(html) {
  const template = document.createElement('template');
  template.innerHTML = String(html ?? '');
  for (const element of [...template.content.querySelectorAll('*')]) {
    if (!ALLOWED_ELEMENTS.has(element.tagName)) {
      element.remove();
      continue;
    }
    for (const attribute of [...element.attributes]) {
      const name = attribute.name.toLowerCase();
      const value = attribute.value;
      element.removeAttribute(attribute.name);
      if (name === 'class' || name === 'title' || name === 'alt') element.setAttribute(name, value);
      if (name === 'style') {
        const style = safeStyle(value);
        if (style) element.setAttribute('style', style);
      }
      if (name === 'href' && element.tagName === 'A') {
        const href = safeLink(value);
        if (href) element.setAttribute('href', href);
      }
      if (name === 'src' && element.tagName === 'IMG') {
        const src = safeImageSource(value);
        if (src) element.setAttribute('src', src);
      }
      if ((name === 'colspan' || name === 'rowspan') && ['TD', 'TH'].includes(element.tagName) && /^\d{1,2}$/.test(value)) {
        element.setAttribute(name, value);
      }
    }
    if (element.tagName === 'A') element.setAttribute('rel', 'noopener noreferrer');
  }
  return template.innerHTML;
}
