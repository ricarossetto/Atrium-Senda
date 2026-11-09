/**
 * ATRIUM — Segurança de links externos (anti-phishing)
 *
 * Classificação pura e informativa de endereços renderizados na interface.
 * Nunca bloqueia a navegação decidida pelo usuário; apenas identifica domínio
 * oficial, domínio externo e sinais de risco (http, IP, credenciais embutidas,
 * domínio com caracteres especiais) para exibir um aviso discreto ao lado do
 * link. A allowlist cobre sufixos oficiais brasileiros (jus.br, gov.br, leg.br,
 * mp.br); qualquer outro destino é externo e pede conferência.
 */

const OFFICIAL_SUFFIXES = Object.freeze(['jus.br', 'gov.br', 'leg.br', 'mp.br']);

function isIpHost(hostname) {
  const host = String(hostname || '').replace(/^\[|\]$/g, '');
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)) {
    return host.split('.').every(part => Number(part) <= 255);
  }
  return /^[0-9a-f:]+$/i.test(host) && host.includes(':');
}

function matchesOfficialSuffix(hostname) {
  const host = String(hostname || '').toLowerCase().replace(/\.$/, '');
  return OFFICIAL_SUFFIXES.some(suffix => host === suffix || host.endsWith(`.${suffix}`));
}

export function classifyLink(value) {
  const raw = String(value || '').trim();
  if (!raw) return { kind: 'invalid', host: '', reason: 'Endereço ausente.' };
  let url;
  try {
    url = new URL(raw);
  } catch {
    return { kind: 'invalid', host: '', reason: 'Endereço inválido.' };
  }
  const host = url.hostname.toLowerCase();
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { kind: 'unsafe', host, reason: 'Protocolo não suportado para navegação segura.' };
  }
  if (url.username || url.password) {
    return { kind: 'unsafe', host, reason: 'Endereço com credenciais embutidas — possível armadilha.' };
  }
  if (url.protocol === 'http:') {
    return { kind: 'unsafe', host, reason: 'Conexão não segura (http) — confirme o endereço antes de abrir.' };
  }
  if (isIpHost(host)) {
    return { kind: 'unsafe', host, reason: 'Endereço por IP, sem domínio — não abra sem conferir a origem.' };
  }
  if (host.startsWith('xn--') || host.includes('.xn--')) {
    return { kind: 'unsafe', host, reason: 'Domínio com caracteres especiais — possível imitação de site oficial.' };
  }
  if (url.port && url.port !== '443') {
    return { kind: 'unsafe', host, reason: `Porta não padrão (${url.port}) — confirme o endereço antes de abrir.` };
  }
  if (matchesOfficialSuffix(host)) {
    return { kind: 'official', host, reason: 'Domínio oficial brasileiro.' };
  }
  return { kind: 'external', host, reason: 'Domínio fora dos endereços oficiais — confirme antes de abrir.' };
}

export function describeLinkSafety(value) {
  const classification = classifyLink(value);
  const labels = { official: '', external: 'Domínio externo', unsafe: 'Link suspeito', invalid: 'Endereço inválido' };
  return {
    ...classification,
    label: labels[classification.kind] || '',
    warn: classification.kind === 'external' || classification.kind === 'unsafe'
  };
}

/**
 * Fonte de imagem aceitável para `src` de `<img>`.
 * Aceita apenas raster base64 (upload local de logo) ou http(s) explícito.
 * Bloqueia `javascript:`, `data:text/html`, `vbscript:`, SVG data-URL (pode
 * conter script quando usado fora de contexto `img`) e URLs relativas ambíguas.
 */
const SAFE_IMAGE_DATA_URL = /^data:image\/(?:png|jpe?g|webp|gif|svg\+xml);base64,[A-Za-z0-9+/=\s]+$/i;
const SAFE_SVG_ELEMENTS = new Set(['svg', 'g', 'defs', 'symbol', 'use', 'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'linearGradient', 'radialGradient', 'stop', 'title', 'desc']);
const SAFE_SVG_ATTRIBUTES = new Set(['id', 'xmlns', 'viewBox', 'width', 'height', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r', 'rx', 'ry', 'd', 'points', 'transform', 'fill', 'fill-rule', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'stroke-dasharray', 'opacity', 'offset', 'stop-color', 'stop-opacity', 'gradientUnits', 'gradientTransform', 'preserveAspectRatio']);

function isSafeSvgDataUrl(raw) {
  if (typeof DOMParser !== 'function') return false;
  try {
    const encoded = raw.slice(raw.indexOf(',') + 1).replace(/\s/g, '');
    const text = new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(atob(encoded), char => char.charCodeAt(0)));
    const parsed = new DOMParser().parseFromString(text, 'image/svg+xml');
    const root = parsed.documentElement;
    if (root.localName !== 'svg' || root.namespaceURI !== 'http://www.w3.org/2000/svg' || parsed.querySelector('parsererror')) return false;
    for (const element of [root, ...root.querySelectorAll('*')]) {
      if (element.namespaceURI !== root.namespaceURI || !SAFE_SVG_ELEMENTS.has(element.localName)) return false;
      for (const attr of element.attributes) {
        if (attr.name === 'href' || attr.name === 'xlink:href') {
          if (element.localName !== 'use' || !/^#[A-Za-z][\w.-]*$/.test(attr.value)) return false;
        } else if (!SAFE_SVG_ATTRIBUTES.has(attr.name)) return false;
      }
    }
    return true;
  } catch { return false; }
}

export function safeImageSource(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  if (SAFE_IMAGE_DATA_URL.test(raw)) {
    if (/^data:image\/svg\+xml;base64,/i.test(raw) && !isSafeSvgDataUrl(raw)) return '';
    return raw;
  }
  try {
    const url = new URL(raw);
    if (url.protocol === 'https:' || url.protocol === 'http:') return url.toString();
  } catch { return ''; }
  return '';
}
