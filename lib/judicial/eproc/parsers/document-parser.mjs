/**
 * ATRIUM Sovereign Judicial Connectivity — Eproc Document Metadata Parser
 *
 * Generic, zero-DOM-dependency HTML parser for document metadata listings
 * across the eproc family.
 */

function cleanText(value) {
  return String(value || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

export function parseEprocDocuments(html) {
  if (!html || typeof html !== 'string') return [];
  const documents = [];
  const seenIds = new Set();

  // 1. Matches links with acao=acessar_documento or doc= or id_documento=
  const linkMatches = html.match(/<a[^>]+href=[\"']([^\"']*(?:acao=acessar_documento|acao=processo_documento|acao=arvore_documento|id_documento=|num_documento=|download)[^\"']*)[\"'][^>]*>([\s\S]*?)<\/a>/gi) || [];

  for (const aTag of linkMatches) {
    const hrefMatch = aTag.match(/href=[\"']([^\"']+)[\"']/i);
    if (!hrefMatch) continue;

    const href = hrefMatch[1].replace(/&amp;/g, '&');
    const title = cleanText(aTag) || 'Documento';

    // Ignore tree overview or general report links without specific document reference
    if (href.includes('arvore_documento_listar') && !/[?&]doc=/i.test(href)) continue;

    const idParamMatch = href.match(/[?&](?:id_documento|num_documento|doc|id)=([a-zA-Z0-9_-]+)/i);
    const docId = idParamMatch ? idParamMatch[1] : null;

    if (docId && seenIds.has(docId)) continue;
    if (docId) seenIds.add(docId);

    const isPdf = /\.pdf\b|tipo=pdf/i.test(href) || /\.pdf\b/i.test(title);

    documents.push({
      id: docId || `doc_${documents.length + 1}`,
      title,
      type: isPdf ? 'PDF' : 'ANEXO',
      accessUrl: href,
      availability: /sigilo|restrito|bloqueado/i.test(aTag) ? 'restricted' : 'available'
    });
  }

  // 2. If no anchor links found, check for document badges/codes in table cells (e.g. INIC1, DEC2)
  if (documents.length === 0) {
    const docBadges = html.match(/<td>\s*([A-Z]{3,8}\d{1,4})\s*<\/td>/gi) || [];
    for (const badge of docBadges) {
      const codeMatch = badge.match(/>\s*([A-Z0-9_-]{3,20})\s*</);
      if (codeMatch && !/^(?:CPF|CNPJ|OAB|SIM|NAO|NÃO)$/i.test(codeMatch[1])) {
        const docId = codeMatch[1];
        if (!seenIds.has(docId)) {
          seenIds.add(docId);
          documents.push({
            id: docId,
            title: docId,
            type: 'ANEXO',
            accessUrl: null,
            availability: 'available'
          });
        }
      }
    }
  }

  return documents;
}
