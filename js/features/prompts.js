const PROMPTS_ICON_NAMES = new Set(['assistant', 'check', 'copy', 'search']);
const iconSvg = name => {
  const safeName = PROMPTS_ICON_NAMES.has(name) ? name : 'search';
  return `<svg class="atrium-icon" aria-hidden="true" focusable="false"><use href="assets/icons/atrium-ui-icons.svg#atrium-icon-${safeName}"></use></svg>`;
};

export function createPromptsFeature({
  store,
  documentRef = globalThis.document,
  windowRef = globalThis.window,
  navigatorRef = globalThis.navigator,
  escapeHtml = value => String(value ?? ''),
  normalizeText = value => String(value ?? '').toLowerCase(),
  showToast = () => {},
  getDefaultPrompts = () => [],
  uid = prefix => `${prefix}-${Date.now()}`,
  openModal = () => {},
  switchView = () => {},
  onUsePrompt = () => {},
  renderV2Presentation = null
} = {}) {
  let filter = { search: '', category: 'all', type: 'all' };
  let initialized = false;
  let previewPrompt = null;
  let previewInvoker = null;
  let previewBodyOverflow = '';
  const byId = id => documentRef.getElementById(id);
  const allPrompts = () => [...(store.state.customPrompts || []), ...getDefaultPrompts()];

  const feature = {
    get filter() {
      return filter;
    },

    set filter(value) {
      filter = {
        search: value?.search || '',
        category: value?.category || 'all',
        type: value?.type || 'all'
      };
    },

    get initialized() {
      return initialized;
    },

    init() {
      if (initialized) return false;
      initialized = true;
      byId('promptsSearchInput')?.addEventListener('input', event => {
        filter.search = event.target.value;
        byId('btnClearPromptsSearch')?.classList.toggle('hidden', !event.target.value);
        feature.render();
      });
      byId('btnClearPromptsSearch')?.addEventListener('click', () => {
        const input = byId('promptsSearchInput');
        if (input) input.value = '';
        filter.search = '';
        byId('btnClearPromptsSearch')?.classList.add('hidden');
        feature.render();
        input?.focus();
      });
      byId('promptCategorySelect')?.addEventListener('change', event => {
        filter.category = event.target.value;
        byId('promptsCategoryChips')?.querySelectorAll('.prompt-chip').forEach(chip => {
          chip.classList.toggle('active', chip.dataset.category === filter.category);
        });
        feature.render();
      });
      byId('promptTypeSelect')?.addEventListener('change', event => {
        filter.type = event.target.value;
        feature.render();
      });
      byId('promptsCategoryChips')?.addEventListener('click', event => {
        const chip = event.target.closest('.prompt-chip');
        if (!chip) return;
        filter.category = chip.dataset.category || 'all';
        const select = byId('promptCategorySelect');
        if (select) select.value = filter.category;
        feature.render();
      });
      byId('btnNewPrompt')?.addEventListener('click', () => feature.openNewPromptModal());
      byId('promptsGrid')?.addEventListener('click', event => {
        const previewButton = event.target.closest('[data-view-prompt]');
        if (previewButton) {
          feature.openPreview(previewButton.dataset.viewPrompt, previewButton);
          return;
        }
        const copyButton = event.target.closest('[data-copy-prompt]');
        if (copyButton) {
          const prompt = allPrompts().find(item => item.id === copyButton.dataset.copyPrompt);
          if (prompt) feature.copy(prompt.prompt, copyButton);
          return;
        }
        const useButton = event.target.closest('[data-use-prompt]');
        if (useButton) {
          const prompt = allPrompts().find(item => item.id === useButton.dataset.usePrompt);
          if (prompt) feature.useInAssistant(prompt.prompt);
          return;
        }
        const editButton = event.target.closest('[data-edit-prompt]');
        if (editButton) {
          const prompt = (store.state.customPrompts || []).find(item => item.id === editButton.dataset.editPrompt && item.isCustom === true);
          if (prompt) feature.openNewPromptModal(prompt);
          return;
        }
        const deleteButton = event.target.closest('[data-delete-prompt]');
        if (deleteButton) feature.deletePrompt(deleteButton.dataset.deletePrompt);
      });
      byId('promptPreviewClose')?.addEventListener('click', () => feature.closePreview());
      byId('promptPreviewBackdrop')?.addEventListener('click', event => {
        if (event.target === byId('promptPreviewBackdrop')) feature.closePreview();
      });
      byId('promptPreviewBackdrop')?.addEventListener('keydown', event => {
        if (event.key === 'Escape') {
          event.preventDefault();
          feature.closePreview();
          return;
        }
        if (event.key !== 'Tab') return;
        const focusable = [...byId('promptPreviewBackdrop').querySelectorAll('button:not([disabled])')].filter(element => element.getClientRects().length > 0);
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable.at(-1);
        if (event.shiftKey && documentRef.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && documentRef.activeElement === last) { event.preventDefault(); first.focus(); }
      });
      byId('promptPreviewCopy')?.addEventListener('click', event => {
        if (previewPrompt) feature.copy(previewPrompt.prompt, event.currentTarget);
      });
      byId('promptPreviewUse')?.addEventListener('click', () => {
        if (!previewPrompt) return;
        const text = previewPrompt.prompt;
        feature.closePreview({ restoreFocus: false });
        feature.useInAssistant(text);
      });
      return true;
    },

    openPreview(promptId, invoker = null) {
      const prompt = allPrompts().find(item => String(item.id) === String(promptId));
      const backdrop = byId('promptPreviewBackdrop');
      if (!prompt || !backdrop) return false;
      previewPrompt = prompt;
      previewInvoker = invoker || documentRef.activeElement;
      previewBodyOverflow = documentRef.body?.style?.overflow || '';
      byId('promptPreviewTitle').textContent = prompt.title || 'Texto completo';
      byId('promptPreviewText').textContent = prompt.prompt || '';
      backdrop.classList.remove('hidden');
      byId('appShell')?.setAttribute('inert', '');
      if (documentRef.body) documentRef.body.style.overflow = 'hidden';
      windowRef.setTimeout(() => byId('promptPreviewClose')?.focus(), 0);
      return true;
    },

    closePreview({ restoreFocus = true } = {}) {
      const backdrop = byId('promptPreviewBackdrop');
      const wasOpen = Boolean(backdrop && !backdrop.classList.contains('hidden'));
      backdrop?.classList.add('hidden');
      byId('appShell')?.removeAttribute('inert');
      if (wasOpen && documentRef.body) documentRef.body.style.overflow = previewBodyOverflow;
      if (wasOpen && restoreFocus && previewInvoker?.isConnected && typeof previewInvoker.focus === 'function') previewInvoker.focus();
      previewPrompt = null;
      previewInvoker = null;
      return wasOpen;
    },

    copy(promptText, buttonElement) {
      if (!navigatorRef.clipboard) {
        showToast('Área de transferência indisponível neste navegador.', 'error');
        return Promise.resolve(false);
      }
      return navigatorRef.clipboard.writeText(promptText).then(() => {
        if (buttonElement) {
          const originalText = buttonElement.innerHTML;
          buttonElement.innerHTML = documentRef.documentElement?.dataset?.ui === 'v2'
            ? `${iconSvg('check')}<span>Copiado!</span>`
            : `
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
            <span>Copiado!</span>`;
          buttonElement.classList.add('copied');
          windowRef.setTimeout(() => {
            buttonElement.innerHTML = originalText;
            buttonElement.classList.remove('copied');
          }, 2000);
        }
        showToast('Prompt copiado para a área de transferência!', 'success');
        return true;
      }).catch(() => {
        showToast('Não foi possível copiar o texto do prompt.', 'error');
        return false;
      });
    },

    useInAssistant(promptText) {
      switchView('assistant');
      onUsePrompt(promptText);
      showToast('Prompt carregado no Assistente IA! Complete com os fatos e envie.', 'success');
    },

    render() {
      const prompts = allPrompts();
      const grid = byId('promptsGrid');
      const chipsContainer = byId('promptsCategoryChips');
      const categorySelect = byId('promptCategorySelect');
      const countDisplay = byId('promptsCountDisplay');
      const categories = ['all', ...new Set(prompts.map(prompt => prompt.category))];

      if (categorySelect && (categorySelect.options.length <= 1 || categorySelect.options.length !== categories.length)) {
        const currentValue = categorySelect.value || 'all';
        categorySelect.innerHTML = categories.map(category => {
          const label = category === 'all' ? `Todas as Áreas (${prompts.length} prompts)` : category;
          return `<option value="${escapeHtml(category)}">${escapeHtml(label)}</option>`;
        }).join('');
        if (categories.includes(currentValue)) categorySelect.value = currentValue;
      }

      const topCategories = ['all', ...[...new Set(prompts.map(prompt => prompt.category))].slice(0, 12)];
      const searchNeedle = normalizeText(filter.search || '');
      const filtered = prompts.filter(prompt => {
        if (filter.category !== 'all' && prompt.category !== filter.category) return false;
        if (filter.type !== 'all' && normalizeText(prompt.type) !== normalizeText(filter.type)) return false;
        if (searchNeedle) {
          const haystack = normalizeText(`${prompt.title} ${prompt.description} ${(prompt.tags || []).join(' ')} ${prompt.prompt}`);
          if (!haystack.includes(searchNeedle)) return false;
        }
        return true;
      });

      const v2Presentation = documentRef.documentElement?.dataset?.ui === 'v2' && typeof renderV2Presentation === 'function'
        ? renderV2Presentation({ prompts: filtered, topCategories, selectedCategory: filter.category, escapeHtml, normalizeText })
        : null;
      if (chipsContainer) {
        chipsContainer.innerHTML = v2Presentation?.chipsHtml || topCategories.map(category => {
          const selected = filter.category === category;
          const label = category === 'all' ? 'Todas as Áreas' : category;
          return `<button type="button" class="prompt-chip ${selected ? 'active' : ''}" data-category="${escapeHtml(category)}">${escapeHtml(label)}</button>`;
        }).join('');
      }

      if (countDisplay) countDisplay.textContent = `Mostrando ${filtered.length} de ${prompts.length} prompts`;
      if (!grid) return;
      if (v2Presentation) {
        grid.innerHTML = v2Presentation.libraryHtml;
        return;
      }
      if (!filtered.length) {
        grid.innerHTML = `
          <div class="prompts-empty card">
            <div class="empty-icon">⌕</div>
            <h3>Nenhum prompt encontrado</h3>
            <p>Tente ajustar os termos da pesquisa ou selecione outra área do direito.</p>
          </div>`;
        return;
      }

      grid.innerHTML = filtered.map(prompt => {
        const typeClass = prompt.type ? `type-${normalizeText(prompt.type).replace(/\s+/g, '-')}` : 'type-geral';
        const tagsHtml = (prompt.tags || []).slice(0, 5).map(tag => `<span class="prompt-tag">${escapeHtml(tag)}</span>`).join('');
        const customBadge = prompt.isCustom ? `<span class="prompt-cat-badge custom-prompt-badge">Personalizado</span>` : '';
        const customActions = prompt.isCustom ? `
          <button type="button" class="button ghost btn-edit-prompt" data-edit-prompt="${escapeHtml(prompt.id)}" title="Editar prompt">Editar</button>
          <button type="button" class="button danger-ghost btn-delete-prompt" data-delete-prompt="${escapeHtml(prompt.id)}" title="Excluir prompt">Excluir</button>
        ` : '';
        return `
          <article class="card prompt-card ${prompt.isCustom ? 'custom-card' : ''}" data-prompt-id="${escapeHtml(prompt.id)}">
            <div class="prompt-card-top">
              <div class="prompt-badges">
                ${customBadge}
                <span class="prompt-cat-badge">${escapeHtml(prompt.category)}</span>
                <span class="prompt-type-badge ${typeClass}">${escapeHtml(prompt.type || 'Geral')}</span>
              </div>
            </div>
            <h4 class="prompt-title">${escapeHtml(prompt.title)}</h4>
            <p class="prompt-desc">${escapeHtml(prompt.description || 'Modelo especializado para aplicação prática jurídica.')}</p>
            ${tagsHtml ? `<div class="prompt-tags-list">${tagsHtml}</div>` : ''}
            <div class="prompt-box">
              <pre class="prompt-text">${escapeHtml(prompt.prompt)}</pre>
            </div>
            <div class="prompt-card-actions">
              <button type="button" class="button ghost btn-copy-prompt" data-copy-prompt="${escapeHtml(prompt.id)}" title="Copiar texto do prompt">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                </svg>
                <span>Copiar</span>
              </button>
              <button type="button" class="button gold btn-use-prompt" data-use-prompt="${escapeHtml(prompt.id)}" title="Carregar no chat do Assistente IA">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8z"/>
                </svg>
                <span>Usar na IA</span>
              </button>
              ${customActions}
            </div>
          </article>
        `;
      }).join('');
    },

    openNewPromptModal(defaults = {}) {
      openModal('prompt', defaults.id ? 'Editar prompt personalizado' : 'Novo prompt jurídico', 'Inteligência Artificial', [
        { name: 'title', label: 'Título do prompt', required: true, full: true, placeholder: 'Ex: Recurso Especial — Violação ao CPC', value: defaults.title || '' },
        { name: 'category', label: 'Área do Direito', required: true, placeholder: 'Ex: Cível, Previdenciário, Trabalhista...', value: defaults.category || 'Cível' },
        { name: 'type', label: 'Tipo de Ação / Finalidade', type: 'select', options: [{value:'Redação',label:'Redação de Peça'},{value:'Análise',label:'Análise de Riscos / Fatos'},{value:'Pesquisa',label:'Pesquisa Jurisprudencial'},{value:'Assistente',label:'Assistente Estratégico'},{value:'Geral',label:'Geral'}], value: defaults.type || 'Redação' },
        { name: 'tags', label: 'Palavras-chave / Tags', full: true, placeholder: 'Ex: apelação, cpc, tempestividade, omissão (separados por vírgula)', value: Array.isArray(defaults.tags) ? defaults.tags.join(', ') : (defaults.tags || '') },
        { name: 'description', label: 'Resumo / Instruções de uso', full: true, placeholder: 'Ex: Estrutura especializada para demonstrar negativa de prestação jurisdicional.', value: defaults.description || '' },
        { name: 'prompt', label: 'Texto completo do Prompt (com variáveis [CLIENTE], [FATO], etc.)', type: 'textarea', full: true, required: true, value: defaults.prompt || '', note: 'Você pode usar marcações entre colchetes como [PROCESSO], [FATOS] para orientar o preenchimento.' }
      ], defaults);
    },

    savePrompt(data, defaults = {}) {
      const editing = Boolean(defaults.id);
      const record = {
        id: defaults.id || uid('prompt'),
        isCustom: true,
        title: data.title || 'Prompt sem título',
        category: data.category || 'Geral',
        type: data.type || 'Geral',
        description: data.description || '',
        tags: String(data.tags || '').split(/[,;]/).map(tag => tag.trim()).filter(Boolean),
        prompt: data.prompt || '',
        createdAt: defaults.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      store.state.customPrompts = store.state.customPrompts || [];
      const index = store.state.customPrompts.findIndex(prompt => prompt.id === record.id);
      if (index >= 0) store.state.customPrompts[index] = record;
      else store.state.customPrompts.unshift(record);
      store.audit(editing ? 'Prompt personalizado atualizado' : 'Prompt personalizado criado', record.title);
      return record;
    },

    async deletePrompt(promptId) {
      const snapshot = JSON.parse(JSON.stringify(store.state));
      const index = (store.state.customPrompts || []).findIndex(prompt => prompt.id === promptId && prompt.isCustom === true);
      if (index < 0) return false;
      try {
        const [removed] = store.state.customPrompts.splice(index, 1);
        store.audit('Prompt personalizado excluído', removed?.title || promptId);
        store.save();
        feature.render();
        if (!await store.flush()) throw new Error('Não foi possível persistir a exclusão. Tente novamente.');
        showToast('Prompt excluído com sucesso.', 'success');
        return true;
      } catch (error) {
        store.state = snapshot;
        feature.render();
        showToast(error.message || 'Não foi possível excluir o prompt.', 'error');
        return false;
      }
    }
  };

  return feature;
}
