export function renderPromptsV2Presentation({
  prompts = [],
  topCategories = [],
  selectedCategory = 'all',
  escapeHtml,
  normalizeText
} = {}) {
  const chipsHtml = topCategories.map(category => {
    const selected = selectedCategory === category;
    const label = category === 'all' ? 'Todas as áreas' : category;
    return `<button type="button" class="prompt-chip ${selected ? 'active' : ''}" data-category="${escapeHtml(category)}" aria-pressed="${selected}">${escapeHtml(label)}</button>`;
  }).join('');

  const libraryHtml = prompts.length
    ? prompts.map(prompt => {
        const typeClass = prompt.type ? `type-${normalizeText(prompt.type).replace(/\s+/g, '-')}` : 'type-geral';
        const tagsHtml = (prompt.tags || []).slice(0, 5).map(tag => `<span class="prompt-tag">${escapeHtml(tag)}</span>`).join('');
        const origin = prompt.isCustom ? 'Personalizado' : 'Biblioteca Atrium';
        const customActions = prompt.isCustom ? `
          <button type="button" class="button ghost btn-edit-prompt" data-edit-prompt="${escapeHtml(prompt.id)}" aria-label="Editar prompt ${escapeHtml(prompt.title)}">${iconSvg('edit')}Editar</button>
          <button type="button" class="button danger-ghost btn-delete-prompt" data-delete-prompt="${escapeHtml(prompt.id)}" aria-label="Excluir prompt ${escapeHtml(prompt.title)}">${iconSvg('delete')}Excluir</button>
        ` : '';
        return `
          <article class="card prompt-card prompt-library-card ${prompt.isCustom ? 'custom-card' : ''}" data-prompt-id="${escapeHtml(prompt.id)}" data-prompt-origin="${prompt.isCustom ? 'custom' : 'default'}">
            <header class="prompt-card-top">
              <div class="prompt-badges">
                <span class="prompt-library-origin ${prompt.isCustom ? 'custom-prompt-badge' : ''}">${origin}</span>
                <span class="prompt-cat-badge">${escapeHtml(prompt.category)}</span>
                <span class="prompt-type-badge ${typeClass}">${escapeHtml(prompt.type || 'Geral')}</span>
              </div>
            </header>
            <div class="prompt-card-copy">
              <h3 class="prompt-title">${escapeHtml(prompt.title)}</h3>
              <p class="prompt-desc">${escapeHtml(prompt.description || 'Modelo especializado para aplicação prática jurídica.')}</p>
            </div>
            ${tagsHtml ? `<div class="prompt-tags-list" aria-label="Palavras-chave">${tagsHtml}</div>` : ''}
            <button type="button" class="prompt-box" data-view-prompt="${escapeHtml(prompt.id)}" aria-label="Abrir texto completo do prompt ${escapeHtml(prompt.title)}">
              <span class="prompt-text">${escapeHtml(prompt.prompt)}</span>
            </button>
            <footer class="prompt-card-actions">
              <button type="button" class="button ghost btn-use-prompt" data-use-prompt="${escapeHtml(prompt.id)}" aria-label="Usar prompt ${escapeHtml(prompt.title)} no Assistente">
                ${iconSvg('assistant')}<span>Usar no Assistente</span>
              </button>
              <button type="button" class="button ghost btn-copy-prompt" data-copy-prompt="${escapeHtml(prompt.id)}" aria-label="Copiar texto integral do prompt ${escapeHtml(prompt.title)}">
                ${iconSvg('copy')}<span>Copiar</span>
              </button>
              ${customActions}
            </footer>
          </article>`;
      }).join('')
    : `
      <div class="prompts-empty card" role="status">
        <div class="empty-icon" aria-hidden="true">${iconSvg('search')}</div>
        <h3>Nenhum prompt encontrado</h3>
        <p>Tente ajustar os termos da pesquisa ou selecione outra área do direito.</p>
      </div>`;

  return Object.freeze({ chipsHtml, libraryHtml });
}
import { iconSvg } from './icons.js';
