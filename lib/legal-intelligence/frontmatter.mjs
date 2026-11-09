export function parseFrontmatter(source) {
  const text = String(source ?? '').replace(/\r\n?/g, '\n');
  if (!text.startsWith('---\n')) return { attributes: {}, body: text };
  const end = text.indexOf('\n---', 4);
  if (end < 0) return { attributes: {}, body: text };
  const header = text.slice(4, end);
  const body = text.slice(end + 4).replace(/^\n/, '');
  const attributes = {};
  const lines = header.split('\n');
  let currentKey = null;
  for (const line of lines) {
    const keyMatch = line.match(/^([A-Za-z0-9_-]+)\s*:\s*(.*)$/);
    if (keyMatch) {
      currentKey = keyMatch[1];
      const rawValue = keyMatch[2].trim();
      if (rawValue === '|' || rawValue === '>') {
        attributes[currentKey] = '';
      } else {
        attributes[currentKey] = rawValue.replace(/^["']|["']$/g, '');
      }
      continue;
    }
    if (currentKey && attributes[currentKey] !== undefined && /^\s+/.test(line)) {
      const chunk = line.trim();
      attributes[currentKey] = attributes[currentKey] ? `${attributes[currentKey]}\n${chunk}` : chunk;
    }
  }
  for (const key of Object.keys(attributes)) attributes[key] = String(attributes[key]).trim();
  return { attributes, body };
}

export function firstHeading(body) {
  const match = String(body ?? '').match(/^#\s+(.+)$/m);
  return match ? match[1].trim() : '';
}

export function previewText(text, maxChars = 1500) {
  const value = String(text ?? '').trim();
  if (value.length <= maxChars) return value;
  const sliced = value.slice(0, maxChars);
  const boundary = Math.max(sliced.lastIndexOf('\n\n'), sliced.lastIndexOf('\n'));
  const head = boundary > maxChars * 0.5 ? sliced.slice(0, boundary) : sliced;
  return `${head.trimEnd()}\n\n[Prévia do catálogo — o texto integral é aplicado pelo backend do ATRIUM.]`;
}

export function singleLine(text, maxChars = 480) {
  const value = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (value.length <= maxChars) return value;
  return `${value.slice(0, maxChars - 1).trimEnd()}…`;
}
