export function renderDocumentsV2Catalog({ catalog, escapeHtml }) {
  return catalog.map((template, index) => `
    <article class="prompt-card document-template-card">
      <div class="prompt-card-header">
        <span class="document-template-index" aria-hidden="true">${String(index + 1).padStart(2, '0')}</span>
        <span class="prompt-category-badge">${escapeHtml(template.category)}</span>
        <span class="document-template-origin">Modelo interno</span>
      </div>
      <div class="document-template-copy">
        <h3>${escapeHtml(template.title)}</h3>
        <p>${escapeHtml(template.description)}</p>
      </div>
      <div class="prompt-card-actions">
        <button type="button" class="button ghost btn-full" data-generate-doc-type="${escapeHtml(template.id)}" aria-label="Gerar ${escapeHtml(template.title)}">
          Abrir modelo <svg class="atrium-icon" aria-hidden="true" focusable="false"><use href="assets/icons/atrium-ui-icons.svg?v=3.0.1#atrium-icon-chevron-right"></use></svg>
        </button>
      </div>
    </article>
  `).join('');
}
