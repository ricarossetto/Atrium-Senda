const plural = (count, singular, pluralForm) => `${count} ${Number(count) === 1 ? singular : pluralForm}`;
const MODEL_GROUP_FREE = 'Opções gratuitas';
const MODEL_GROUP_OTHER = 'Outros modelos';
const MODEL_GROUP_RULES = Object.freeze([
  { label: 'Claude (Anthropic)', test: id => id.startsWith('claude-') },
  { label: 'GPT (OpenAI)', test: id => id.startsWith('gpt-') },
  { label: 'Gemini (Google)', test: id => id.startsWith('gemini-') },
  { label: 'Grok (xAI)', test: id => id.startsWith('grok-') },
  { label: 'DeepSeek', test: id => id.startsWith('deepseek-') },
  { label: 'GLM (Zhipu)', test: id => id.startsWith('glm-') },
  { label: 'Kimi (Moonshot)', test: id => id.startsWith('kimi-') },
  { label: 'MiniMax', test: id => id.startsWith('minimax-') },
  { label: 'Qwen (Alibaba)', test: id => id.startsWith('qwen') },
  { label: 'MiMo (Xiaomi)', test: id => id.startsWith('mimo-') }
]);

export function createAssistantFeature({
  documentRef = globalThis.document,
  windowRef = globalThis.window,
  secureFetch,
  escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c])),
  showToast = () => {},
  audit = () => {},
  getSelectedIntimation = () => null,
  getContextCandidates = () => ({}),
  getLegalSkills = () => [],
  renderV2Presentation = () => false,
  installComboboxes = () => {},
  installPanelSizeToggle = () => {},
  resetPanelSize = () => {}
} = {}) {
  let configured = false;
  let chatHistory = [];
  let isTyping = false;
  let initialized = false;
  let selectedContextKey = '';
  let manualContextSelection = false;
  let providers = [];
  let selectedProviderId = '';
  let activeProviderId = '';
  let attachments = [];
  const citationReviews = new Map();
  let citationReviewSequence = 0;
  const draftReviews = new Map();
  let draftReviewSequence = 0;
  const agenticPlans = new Map();
  const planDrafts = new Map();
  let planStreamAbort = null;
  const byId = id => documentRef.getElementById(id);
  const compact = value => String(value || '').replace(/\s+/g, ' ').trim();

  function contextDescriptors() {
    const records = getContextCandidates() || {};
    const descriptors = [];
    const append = (type, group, items, labelFor, metaFor, sourcesFor) => {
      (Array.isArray(items) ? items : []).filter(item => item?.id).slice(0, 500).forEach(item => descriptors.push({
        key: `${type}:${item.id}`,
        type,
        id: String(item.id),
        group,
        label: compact(labelFor(item)) || `${group} sem identificação`,
        meta: compact(metaFor(item)),
        sources: sourcesFor(item)
      }));
    };
    append('process', 'Processos', records.processes, item => item.number || item.protocol || item.client, item => [item.client, item.actionType || item.subject, item.court].filter(Boolean).join(' · '), () => ['Dados do sistema']);
    append('document', 'Documentos', records.documents?.filter(item => !item.deletedAt), item => item.name || item.originalName, item => [item.documentType, item.documentDate].filter(Boolean).join(' · '), item => ['Dados do sistema', ...(item.intelligence?.ocr?.checksum ? ['Texto extraído'] : [])]);
    append('intimation', 'Publicações', records.intimations, item => item.process || item.number || item.title, item => [item.title, item.court, item.publishedAt].filter(Boolean).join(' · '), item => ['Dados do sistema', ...((item.text || item.summary) ? ['Texto original'] : [])]);
    append('contact', 'Clientes e contatos', records.contacts, item => item.name, item => [item.contactRole, item.city, item.state].filter(Boolean).join(' · '), () => ['Dados do sistema']);
    return descriptors.sort((left, right) => left.group.localeCompare(right.group, 'pt-BR') || left.label.localeCompare(right.label, 'pt-BR'));
  }

  function activeContextDescriptor() {
    const descriptors = contextDescriptors();
    if (!manualContextSelection) {
      const selectedIntimation = getSelectedIntimation();
      selectedContextKey = selectedIntimation?.id ? `intimation:${selectedIntimation.id}` : '';
    }
    const selected = descriptors.find(item => item.key === selectedContextKey) || null;
    if (selectedContextKey && !selected) selectedContextKey = '';
    return { descriptors, selected };
  }

  function formatMarkdown(text) {
    if (!text) return '';
    let html = escapeHtml(text);
    // Code blocks
    html = html.replace(/```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g, (match, lang, code) => `<pre><code class="lang-${lang}">${code.trim()}</code></pre>`);
    html = html.replace(/```([\s\S]*?)```/g, (match, code) => `<pre><code>${code.trim()}</code></pre>`);
    // Inline code
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
    // Headings
    html = html.replace(/^### (.*$)/gim, '<h4 class="md-h4">$1</h4>');
    html = html.replace(/^## (.*$)/gim, '<h3 class="md-h3">$1</h3>');
    html = html.replace(/^# (.*$)/gim, '<h2 class="md-h2">$1</h2>');
    // Blockquotes
    html = html.replace(/^\> (.*$)/gim, '<blockquote>$1</blockquote>');
    // Bold & Italic
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/__([^_]+)__/g, '<strong>$1</strong>');
    html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    html = html.replace(/_([^_]+)_/g, '<em>$1</em>');
    // Unordered lists
    html = html.replace(/^\s*[-•*]\s+(.*)$/gim, '<ul><li>$1</li></ul>');
    html = html.replace(/<\/ul>\s*<ul>/g, '');
    // Ordered lists
    html = html.replace(/^\s*\d+\.\s+(.*)$/gim, '<ol><li>$1</li></ol>');
    html = html.replace(/<\/ol>\s*<ol>/g, '');
    // Paragraphs
    const blocks = html.split(/\n{2,}/);
    html = blocks.map(block => {
      const trimmed = block.trim();
      if (!trimmed) return '';
      if (/^<(h[2-4]|ul|ol|pre|blockquote)/i.test(trimmed)) return trimmed;
      return `<p>${trimmed.replace(/\n/g, '<br>')}</p>`;
    }).join('');
    return html;
  }

  function renderModelOptions(provider) {
    const input = byId('aiProviderModel');
    const listbox = byId('aiProviderModelListbox');
    const groupsHost = byId('aiProviderModelGroups');
    listbox?.classList.add('hidden');
    input?.setAttribute('aria-expanded', 'false');
    input?.removeAttribute('aria-activedescendant');
    if (!groupsHost) return;
    const groups = new Map();
    for (const raw of (Array.isArray(provider?.models) ? provider.models : [])) {
      const model = String(raw || '').trim();
      if (!model) continue;
      const label = /-free$/.test(model)
        ? MODEL_GROUP_FREE
        : (MODEL_GROUP_RULES.find(rule => rule.test(model))?.label || MODEL_GROUP_OTHER);
      if (!groups.has(label)) groups.set(label, []);
      groups.get(label).push(model);
    }
    const order = [...MODEL_GROUP_RULES.map(rule => rule.label), MODEL_GROUP_OTHER, MODEL_GROUP_FREE];
    groupsHost.innerHTML = order.filter(label => groups.has(label)).map(label => (
      `<div class="modal-combobox-group" role="group" aria-label="${escapeHtml(label)}" data-combobox-group>` +
      `<p class="modal-combobox-group-title">${escapeHtml(label)}</p>` +
      groups.get(label).map(model => `<button type="button" role="option" data-combobox-option data-value="${escapeHtml(model)}" aria-selected="false"><strong>${escapeHtml(model)}</strong></button>`).join('') +
      '</div>'
    )).join('');
  }

  const feature = {
    get configured() {
      return configured;
    },

    set configured(value) {
      configured = Boolean(value);
    },

    get chatHistory() {
      return chatHistory;
    },

    set chatHistory(value) {
      chatHistory = Array.isArray(value) ? value : [];
    },

    get isTyping() {
      return isTyping;
    },

    set isTyping(value) {
      isTyping = Boolean(value);
    },

    get initialized() {
      return initialized;
    },

    init() {
      if (initialized) return false;
      initialized = true;
      installComboboxes(byId('geminiKeyBackdrop'));
      installPanelSizeToggle(byId('geminiKeyBackdrop')?.querySelector?.('.gemini-key-modal'));
      byId('btnOpenGeminiKeyModal')?.addEventListener('click', () => feature.openKeyModal());
      byId('geminiKeyClose')?.addEventListener('click', () => feature.closeKeyModal());
      byId('geminiKeyCancel')?.addEventListener('click', () => feature.closeKeyModal());
      byId('geminiKeyBackdrop')?.addEventListener('click', event => {
        if (event.target === byId('geminiKeyBackdrop')) feature.closeKeyModal();
      });
      byId('geminiKeyBackdrop')?.addEventListener('keydown', event => {
        const backdrop = byId('geminiKeyBackdrop');
        if (!backdrop || backdrop.classList.contains('hidden')) return;
        if (event.key === 'Escape') {
          event.preventDefault();
          feature.closeKeyModal();
          return;
        }
        if (event.key !== 'Tab') return;
        const focusable = [...backdrop.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')]
          .filter(element => !element.hidden && element.getAttribute('aria-hidden') !== 'true');
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && documentRef.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && documentRef.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      });
      byId('geminiKeyForm')?.addEventListener('submit', event => feature.handleKeySubmit(event));
      byId('btnOpenKeyModalFromCard')?.addEventListener('click', () => feature.openKeyModal());
      byId('btnRetryAiProviders')?.addEventListener('click', () => feature.loadProviders().catch(() => false));
      byId('btnClearAiConversation')?.addEventListener('click', () => feature.clearConversation());
      byId('btnRemoveGeminiKey')?.addEventListener('click', () => feature.removeKey().catch(error => showToast(error.message, 'error')));
      byId('btnSaveDecisionKey')?.addEventListener('click', () => feature.saveJevKey().catch(error => showToast(error.message, 'error')));
      byId('btnClearDecisionKey')?.addEventListener('click', () => feature.clearJevKey().catch(error => showToast(error.message, 'error')));
      byId('aiProviderSelect')?.addEventListener('change', event => feature.selectProvider(event.target.value));
      byId('btnAiChatAttach')?.addEventListener('click', () => byId('aiChatAttachmentInput')?.click());
      byId('aiChatAttachmentInput')?.addEventListener('change', event => feature.handleAttachmentSelection(event.target));
      byId('aiChatAttachments')?.addEventListener('click', event => {
        const chip = event.target?.closest?.('[data-attachment-id]');
        if (chip) feature.removeAttachment(chip.dataset.attachmentId);
      });
      byId('assistantContextSelect')?.addEventListener('change', event => feature.selectContext(event.target.value));
      byId('btnClearAssistantContext')?.addEventListener('click', () => {
        feature.selectContext('');
        const search = byId('assistantContextSearch');
        if (search) search.value = '';
      });
      documentRef.querySelectorAll('.quick-prompt-btn').forEach(button => {
        // Atalhos de ação rápida: só envia quando há prompt. Botão que apenas navega
        // (`data-view-link`, sem `data-prompt`) segue o fluxo normal de navegação do shell —
        // antes ele chamava `sendMessage(undefined)` e derrubava a view.
        button.addEventListener('click', () => {
          const prompt = String(button.dataset.prompt || '').trim();
          if (!prompt) return;
          feature.sendQuickPrompt(prompt);
        });
      });
      byId('aiChatForm')?.addEventListener('submit', event => feature.handleChatSubmit(event));
      byId('aiChatMessages')?.addEventListener('click', event => {
        const draftReviewButton = event.target.closest?.('[data-draft-review-id]');
        if (draftReviewButton) {
          void feature.runDraftReview(draftReviewButton.dataset.draftReviewId);
          return;
        }
        const reviewButton = event.target.closest?.('[data-citation-review-id]');
        if (reviewButton) {
          feature.toggleCitationReview(reviewButton.dataset.citationReviewId);
          return;
        }
        const overrideButton = event.target.closest?.('[data-citation-override]');
        if (overrideButton) {
          void feature.submitCitationOverride(overrideButton.dataset.citationOverride);
          return;
        }
        const planButton = event.target.closest?.('[data-plan-action]');
        if (planButton) void feature.runPlanAction(planButton.dataset.planId, planButton.dataset.planAction);
      });
      byId('btnAiPlan')?.addEventListener('click', () => { void feature.planAgenticDraft(); });
      byId('aiChatInput')?.addEventListener('keydown', event => {
        if (event.key === 'Enter' && !event.shiftKey) {
          event.preventDefault();
          byId('aiChatForm').requestSubmit();
        }
      });

      const skillSelect = byId('codexSkillSelect');
      if (skillSelect) {
        feature.renderSkillOptions();
        skillSelect.addEventListener('change', () => feature.updateSkillDescription());
        feature.updateSkillDescription();
      }
      byId('btnApplyCodexSkill')?.addEventListener('click', () => feature.applySelectedSkill());
      feature.syncPresentation();
      return true;
    },

    syncPresentation() {
      const { descriptors, selected } = activeContextDescriptor();
      return renderV2Presentation({
        documentRef,
        configured,
        contexts: descriptors,
        selectedContext: selected,
        escapeHtml
      });
    },

    contextOptions() {
      return contextDescriptors();
    },

    selectedContext() {
      const { selected } = activeContextDescriptor();
      return selected ? { [selected.type]: { id: selected.id } } : {};
    },

    selectContext(key) {
      selectedContextKey = String(key || '');
      manualContextSelection = true;
      feature.syncPresentation();
      return feature.selectedContext();
    },

    async checkStatus() {
      const chip = byId('aiKeyStatusChip');
      const banner = byId('aiOnboardingBanner');
      try {
        const response = await secureFetch('/api/ai/status', { headers: { Accept: 'application/json' } });
        const data = await response.json().catch(() => ({}));
        configured = Boolean(data.configured);
      } catch {
        configured = false;
      }
      if (chip) {
        chip.textContent = configured ? 'Chave Ativa' : 'Chave não configurada';
        chip.className = configured ? 'status-chip connected' : 'status-chip warning';
      }
      if (banner) banner.style.display = configured ? 'none' : 'block';
      feature.syncKeyManagement();
      feature.syncPresentation();
      return configured;
    },

    openKeyModal() {
      const input = byId('geminiApiKeyInput');
      if (input) input.value = '';
      const feedback = byId('geminiKeyFeedback');
      if (feedback) {
        feedback.className = 'gemini-key-feedback hidden';
        feedback.textContent = '';
      }
      const backdrop = byId('geminiKeyBackdrop');
      if (backdrop) {
        backdrop.__assistantReturnFocus = documentRef.activeElement;
        backdrop.classList.remove('hidden');
      }
      if (documentRef.documentElement?.dataset?.ui === 'v2') byId('appShell')?.setAttribute('inert', '');
      documentRef.body.style.overflow = 'hidden';
      windowRef.setTimeout(() => input?.focus(), 50);
      feature.loadProviders().catch(() => false);
      feature.loadJevStatus().catch(() => false);
    },

    async loadJevStatus() {
      const status = byId('decisionKeyStatus');
      if (status) status.textContent = 'Situação: verificando…';
      try {
        const response = await secureFetch('/api/ai/jev', { headers: { Accept: 'application/json' } });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.message || 'consulta falhou');
        if (!status) return;
        if (!data.configured) {
          status.textContent = 'Situação: não configurada. Sem ela, o Atrium IA usa o provedor acima.';
          return;
        }
        const origem = data.source === 'platform'
          ? ' (plataforma — todos os escritórios)'
          : (data.source === 'workspace' ? ' (este escritório)' : (data.source === 'env' ? ' (ambiente do servidor)' : ''));
        const quando = data.updatedAt ? ' · atualizada em ' + new Date(data.updatedAt).toLocaleString('pt-BR') : '';
        status.textContent = 'Situação: configurada' + origem + quando + '.';
      } catch {
        if (status) status.textContent = 'Situação: não foi possível consultar.';
      }
    },

    async saveJevKey() {
      const input = byId('decisionApiKeyInput');
      const apiKey = String(input?.value || '').trim();
      if (apiKey.length < 20) throw new Error('Cole a chave completa do JEV (Command Code).');
      const response = await secureFetch('/api/ai/jev', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ apiKey })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || 'Não foi possível salvar a chave do JEV.');
      if (input) input.value = '';
      audit('Chave do JEV atualizada', 'Chave do modelo de decisão JEV (Command Code) trocada pelo painel.');
      showToast('Chave do JEV salva.', 'success');
      await feature.loadJevStatus();
    },

    async clearJevKey() {
      const response = await secureFetch('/api/ai/jev', { method: 'DELETE', headers: { Accept: 'application/json' } });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || 'Não foi possível remover a chave do JEV.');
      audit('Chave do JEV removida', 'A chave do painel foi removida; vale a do ambiente, se existir.');
      showToast(data.source === 'env' ? 'Chave do painel removida; a do ambiente segue valendo.' : 'Chave do JEV removida.', 'success');
      await feature.loadJevStatus();
    },

    closeKeyModal() {
      const backdrop = byId('geminiKeyBackdrop');
      if (!backdrop || backdrop.classList.contains('hidden')) return;
      backdrop.classList.add('hidden');
      resetPanelSize(byId('geminiKeyBackdrop')?.querySelector?.('.gemini-key-modal'));
      byId('appShell')?.removeAttribute('inert');
      if (byId('modalBackdrop')?.classList.contains('hidden')) documentRef.body.style.overflow = '';
      const returnFocus = backdrop.__assistantReturnFocus;
      backdrop.__assistantReturnFocus = null;
      if (returnFocus?.isConnected) returnFocus.focus();
    },

    async saveKey(apiKey) {
      const normalizedKey = String(apiKey || '').trim();
      if (!normalizedKey || normalizedKey.length < 20) {
        throw new Error('Chave inválida. Copie a chave completa gerada pelo provedor.');
      }
      if (!providers.length) {
        throw new Error('Provedores de IA indisponíveis no momento. Use "Tentar novamente" no seletor de provedor.');
      }
      const provider = providers.find(item => item.id === selectedProviderId) || null;
      const body = { apiKey: normalizedKey, provider: selectedProviderId };
      if (provider && provider.kind !== 'gemini') {
        const baseUrl = byId('aiProviderBaseUrl')?.value?.trim() || provider.baseUrl || '';
        const model = byId('aiProviderModel')?.value?.trim() || provider.defaultModel || '';
        if (!baseUrl) throw new Error('Informe a URL base do provedor de IA.');
        if (!model) throw new Error('Informe o modelo do provedor de IA.');
        body.baseUrl = baseUrl;
        body.model = model;
      }
      const response = await secureFetch('/api/ai/configure', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || 'Falha ao validar a chave com o provedor de IA.');

      const label = provider?.label || 'Provedor de IA';
      audit('Provedor de IA configurado', `${label} ativado com modelo ${data.model || 'padrão'}.`);
      await feature.checkStatus();
      await feature.loadProviders().catch(() => false);
      return data;
    },

    async loadProviders() {
      const select = byId('aiProviderSelect');
      if (!select) return false;
      const feedback = byId('aiProviderFeedback');
      const feedbackText = byId('aiProviderFeedbackText');
      const retry = byId('btnRetryAiProviders');
      select.disabled = true;
      select.innerHTML = '<option value="">Carregando provedores…</option>';
      if (feedback) feedback.classList.add('hidden');
      if (feedbackText) feedbackText.textContent = '';
      if (retry) retry.classList.add('hidden');
      try {
        const response = await secureFetch('/api/ai/providers', { headers: { Accept: 'application/json' } });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !Array.isArray(data.providers) || !data.providers.length) throw new Error('CATALOG_UNAVAILABLE');
        providers = data.providers;
        activeProviderId = data.active || '';
        const preferred = providers.find(provider => provider.id === 'zen');
        selectedProviderId = activeProviderId
          || (providers.some(provider => provider.id === selectedProviderId) ? selectedProviderId : '')
          || preferred?.id
          || providers[0].id;
        const groups = new Map();
        for (const provider of providers) {
          const group = provider.id === 'gemini' ? 'Google' : provider.id.startsWith('zen') ? 'OpenCode' : 'Outros provedores';
          if (!groups.has(group)) groups.set(group, []);
          groups.get(group).push(provider);
        }
        select.innerHTML = [...groups.entries()].map(([label, items]) =>
          `<optgroup label="${escapeHtml(label)}">${items.map(provider => `<option value="${escapeHtml(provider.id)}">${escapeHtml(provider.label)}${provider.configured ? ' · configurado' : ''}</option>`).join('')}</optgroup>`
        ).join('');
        select.value = selectedProviderId;
        select.disabled = false;
        feature.applyProviderSelection();
        return true;
      } catch {
        providers = [];
        activeProviderId = '';
        select.innerHTML = '<option value="">Provedores indisponíveis</option>';
        select.disabled = true;
        if (feedbackText) feedbackText.textContent = 'Não foi possível carregar os provedores de IA.';
        if (feedback) feedback.classList.remove('hidden');
        if (retry) retry.classList.remove('hidden');
        return false;
      }
    },

    applyProviderSelection() {
      const provider = providers.find(item => item.id === selectedProviderId) || null;
      const isGemini = !provider || provider.kind === 'gemini';
      const baseField = byId('aiProviderBaseUrlField');
      const modelField = byId('aiProviderModelField');
      if (baseField) {
        if (isGemini) baseField.classList.add('hidden');
        else baseField.classList.remove('hidden');
      }
      if (modelField) {
        if (isGemini) modelField.classList.add('hidden');
        else modelField.classList.remove('hidden');
      }
      const baseInput = byId('aiProviderBaseUrl');
      if (baseInput && !isGemini) baseInput.value = provider.baseUrl || '';
      const modelInput = byId('aiProviderModel');
      if (modelInput && !isGemini) modelInput.value = provider.model || provider.defaultModel || '';
      renderModelOptions(isGemini ? null : provider);
      feature.syncKeyManagement();
      feature.renderProviderGuide();
      return true;
    },

    renderProviderGuide() {
      const box = byId('aiKeyGuideBox');
      if (!box) return false;
      const provider = providers.find(item => item.id === selectedProviderId) || null;
      const label = provider?.label || 'provedor de IA';
      const docsUrl = provider?.docsUrl || '';
      const panel = docsUrl
        ? `<a href="${escapeHtml(docsUrl)}" target="_blank" rel="noopener noreferrer">painel do ${escapeHtml(label)}</a>`
        : `painel do ${escapeHtml(label)}`;
      const keyHint = selectedProviderId === 'gemini' ? ' A chave do Gemini começa com <code>AIzaSy...</code>.' : '';
      box.innerHTML = `<h4>Como obter sua chave de API (${escapeHtml(label)})</h4>
        <ol>
          <li>Acesse o ${panel} e faça login.</li>
          <li>Crie uma nova chave de API (API key).</li>
          <li>Copie a chave gerada e cole no campo abaixo.${keyHint}</li>
        </ol>`;
      return true;
    },

    selectProvider(id) {
      selectedProviderId = String(id || 'gemini');
      feature.applyProviderSelection();
      return true;
    },

    readFileBase64(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || '').split(',').pop() || '');
        reader.onerror = () => reject(new Error('Não foi possível ler o arquivo selecionado.'));
        reader.readAsDataURL(file);
      });
    },

    async handleAttachmentSelection(input) {
      const files = [...(input?.files || [])].slice(0, 5);
      if (!files.length) return false;
      for (const file of files) {
        if (file.size > 20_000_000) {
          showToast(`${file.name}: excede o limite de 20 MB.`, 'error');
          continue;
        }
        try {
          const contentBase64 = await feature.readFileBase64(file);
          const response = await secureFetch('/api/ai/attachments', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({ name: file.name, contentBase64 })
          });
          const data = await response.json().catch(() => ({}));
          if (!response.ok) {
            if (response.status >= 502) throw new Error('Servidor temporariamente sobrecarregado ao processar o anexo. Aguarde alguns instantes e tente novamente.');
            throw new Error(data.message || 'Falha ao processar o anexo.');
          }
          attachments.push({ id: data.id, name: data.name, chars: data.chars || 0, engine: data.engine || '' });
          showToast(`Anexo processado: ${data.name}`, 'success');
        } catch (error) {
          showToast(error.message, 'error');
        }
      }
      if (input) input.value = '';
      feature.renderAttachments();
      return true;
    },

    renderAttachments() {
      const container = byId('aiChatAttachments');
      if (!container) return false;
      if (!attachments.length) {
        container.innerHTML = '';
        container.classList.add('hidden');
        return true;
      }
      container.innerHTML = attachments.map(attachment =>
        `<span class="ai-attachment-chip" data-attachment-id="${escapeHtml(attachment.id)}">${escapeHtml(attachment.name)} <small>${Math.max(1, Math.round((attachment.chars || 0) / 1000))}k</small> <button type="button" aria-label="Remover anexo ${escapeHtml(attachment.name)}">×</button></span>`
      ).join('');
      container.classList.remove('hidden');
      return true;
    },

    removeAttachment(id) {
      attachments = attachments.filter(attachment => attachment.id !== id);
      return feature.renderAttachments();
    },

    syncKeyManagement() {
      const provider = providers.find(item => item.id === selectedProviderId) || null;
      const selectionConfigured = provider ? provider.configured : configured;
      const removeButton = byId('btnRemoveGeminiKey');
      if (removeButton) {
        if (selectionConfigured) removeButton.classList.remove('hidden');
        else removeButton.classList.add('hidden');
      }
      const openButton = byId('btnOpenGeminiKeyModal');
      if (openButton) openButton.textContent = configured ? 'Alterar chave de IA' : 'Configurar Chave de IA';
      return true;
    },

    async removeKey() {
      if (!configured) return false;
      const provider = providers.find(item => item.id === selectedProviderId) || null;
      const targetId = provider?.configured ? provider.id : activeProviderId;
      const targetLabel = provider?.configured
        ? provider.label
        : (providers.find(item => item.id === activeProviderId)?.label || 'ativo');
      const confirmed = typeof windowRef.confirm === 'function'
        ? windowRef.confirm(`Remover a chave de IA do provedor ${targetLabel}? O Assistente deixará de responder por esse provedor até uma nova configuração.`)
        : true;
      if (!confirmed) return false;
      const url = targetId ? `/api/ai/configure?provider=${encodeURIComponent(targetId)}` : '/api/ai/configure';
      const response = await secureFetch(url, { method: 'DELETE', headers: { Accept: 'application/json' } });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || 'Falha ao remover a chave de IA.');
      audit('Chave de IA removida', data.configured ? `Provedor ${targetId} removido; ${data.provider} permanece ativo.` : 'O Assistente voltará a solicitar configuração.');
      await feature.checkStatus();
      await feature.loadProviders().catch(() => false);
      showToast(data.message || 'Chave de IA removida.', data.configured ? 'warning' : 'success');
      return true;
    },

    async handleKeySubmit(event) {
      event.preventDefault();
      const key = byId('geminiApiKeyInput')?.value?.trim() || '';
      const feedback = byId('geminiKeyFeedback');
      const submitButton = byId('geminiKeySubmit');
      if (submitButton) {
        submitButton.disabled = true;
        submitButton.textContent = 'Validando chave com o provedor…';
      }
      try {
        const result = await feature.saveKey(key);
        const keyInput = byId('geminiApiKeyInput');
        if (keyInput) keyInput.value = '';
        if (feedback) {
          feedback.className = 'gemini-key-feedback success';
          feedback.textContent = result.message || 'Chave validada com sucesso!';
          feedback.classList.remove('hidden');
        }
        showToast('Provedor de IA ativado com sucesso!', 'success');
        windowRef.setTimeout(() => feature.closeKeyModal(), 1000);
      } catch (error) {
        if (feedback) {
          feedback.className = 'gemini-key-feedback error';
          feedback.textContent = error.message;
          feedback.classList.remove('hidden');
        }
        showToast(error.message, 'error');
      } finally {
        if (submitButton) {
          submitButton.disabled = false;
          submitButton.textContent = 'Validar e Salvar Chave';
        }
      }
    },

    clearConversation() {
      chatHistory = [];
      const container = byId('aiChatMessages');
      if (container) {
        container.innerHTML = `
          <div class="ai-message assistant-message">
            <div class="message-avatar">
              ${ASSISTANT_ICON}
            </div>
            <div class="message-body">
              <div class="message-text">
                <p>Conversa reiniciada. Em que posso auxiliá-lo(a) agora com suas intimações, prazos ou minutas?</p>
              </div>
              <div class="message-meta">Assistente ATRIUM</div>
            </div>
          </div>`;
      }
      showToast('Conversa reiniciada.', 'success');
    },

    sendQuickPrompt(promptText) {
      const input = byId('aiChatInput');
      if (input) input.value = promptText;
      return feature.sendMessage(promptText);
    },

    handleChatSubmit(event) {
      event.preventDefault();
      const input = byId('aiChatInput');
      const message = input.value.trim();
      if (!message) return;
      input.value = '';
      return feature.sendMessage(message);
    },

    async sendMessage(messageText) {
      // Guarda contra chamada sem texto: um botão de ação rápida sem `data-prompt`
      // (ex.: o atalho que só navega) chegava aqui com `undefined` e derrubava a view com
      // `TypeError: reading 'trim'` + relatório de erro na cara do usuário.
      const text = String(messageText ?? '').trim();
      if (!text) return;
      if (isTyping) return;

      const container = byId('aiChatMessages');
      if (!container) return;

      if (!configured) {
        feature.openKeyModal();
        showToast('Configure a chave do provedor de IA para usar o assistente.', 'warning');
        return;
      }

      const userDiv = documentRef.createElement('div');
      userDiv.className = 'ai-message user-message';
      userDiv.innerHTML = `
        <div class="message-avatar">EU</div>
        <div class="message-body">
          <div class="message-text">${escapeHtml(text).replace(/\n/g, '<br>')}</div>
          <div class="message-meta">Você · ${new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(new Date())}</div>
        </div>`;
      container.appendChild(userDiv);

      isTyping = true;
      const typingDiv = documentRef.createElement('div');
      typingDiv.className = 'ai-message assistant-message ai-typing-row';
      typingDiv.innerHTML = `
        <div class="message-avatar">
          ${ASSISTANT_ICON}
        </div>
        <div class="message-body">
          <div class="ai-typing-indicator">
            <span>Assistente formulando resposta…</span>
            <div class="ai-typing-dots"><span></span><span></span><span></span></div>
          </div>
        </div>`;
      container.appendChild(typingDiv);
      container.scrollTop = container.scrollHeight;

      const context = feature.selectedContext();
      const pendingAttachments = attachments.map(attachment => ({ id: attachment.id }));
      const requestBody = { message: text, context, history: chatHistory.slice(-12) };
      if (pendingAttachments.length) {
        requestBody.attachments = pendingAttachments;
        attachments = [];
        feature.renderAttachments();
      }

      try {
        const response = await secureFetch('/api/ai/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(requestBody)
        });

        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          if (response.status >= 502) throw new Error('O servidor do ATRIUM está temporariamente sobrecarregado. Aguarde alguns instantes e tente novamente.');
          throw new Error(data.message || 'Falha ao consultar o provedor de IA.');
        }

        typingDiv.remove();
        const replyHtml = formatMarkdown(data.reply);
        const intelligenceNote = feature.describeIntelligence(data.intelligence, data.reply);
        const assistantDiv = documentRef.createElement('div');
        assistantDiv.className = 'ai-message assistant-message';
        assistantDiv.innerHTML = `
          <div class="message-avatar">
            ${ASSISTANT_ICON}
          </div>
          <div class="message-body">
            <div class="message-text">${replyHtml}</div>
            <div class="message-meta">${escapeHtml(data.model || 'Assistente IA')} · ${new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(new Date())}</div>
            ${intelligenceNote}
          </div>`;
        container.appendChild(assistantDiv);

        chatHistory.push({ role: 'user', text: messageText });
        chatHistory.push({ role: 'assistant', text: data.reply });
      } catch (error) {
        typingDiv.remove();
        const overload = Number(error?.status || 0) >= 502 || /sobrecarregado/i.test(String(error?.message || ''));
        const message = error?.name === 'TypeError'
          ? 'Não foi possível conectar ao servidor do ATRIUM. Verifique a conexão e tente novamente.'
          : String(error?.message || 'Falha inesperada na consulta.');
        const hint = overload
          ? 'O serviço está sob carga elevada no momento. Tente novamente em alguns instantes.'
          : 'Confira a chave e o modelo do provedor de IA configurado e tente novamente.';
        const errorDiv = documentRef.createElement('div');
        errorDiv.className = 'ai-message assistant-message';
        errorDiv.innerHTML = `
          <div class="message-avatar" style="background:rgba(255,77,79,0.2);color:#ff4d4f;border-color:rgba(255,77,79,0.4);">!</div>
          <div class="message-body">
            <div class="message-text" style="background:#201111;border-color:#4a1c1c;color:#ff8585;">
              <p><strong>Erro na consulta ao Assistente IA:</strong> ${escapeHtml(message)}</p>
              <p style="font-size:12px;margin-top:6px;color:#c59999;">${escapeHtml(hint)}</p>
            </div>
          </div>`;
        container.appendChild(errorDiv);
      } finally {
        isTyping = false;
        container.scrollTop = container.scrollHeight;
      }
    },

    loadPrompt(promptText) {
      const input = byId('aiChatInput');
      if (!input) return false;
      input.value = promptText;
      input.style.height = 'auto';
      input.style.height = Math.min(Math.max(input.scrollHeight, 60), 200) + 'px';
      input.focus();
      windowRef.setTimeout(() => {
        input.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 100);
      return true;
    },

    renderSkillOptions() {
      const skillSelect = byId('codexSkillSelect');
      const skills = getLegalSkills();
      if (!skillSelect || !Array.isArray(skills) || !skills.length) return false;
      const previous = skillSelect.value;
      skillSelect.innerHTML = skills
        .map(skill => `<option value="${escapeHtml(skill.id)}">${escapeHtml(skill.title || skill.name || skill.id)}</option>`)
        .join('');
      if (skills.some(skill => skill.id === previous)) skillSelect.value = previous;
      return true;
    },

    describeIntelligence(intelligence, draft = '') {
      if (!intelligence || intelligence.active !== true) return '';
      const moduleIds = new Set((intelligence.modules || []).map(module => module.id));
      const labels = [];
      if (['legal-ingest', 'peticao-analyzer', 'legal-agent'].some(id => moduleIds.has(id))) labels.push('análise documental');
      if (['rom.master-core', 'tese-juridica-validator'].some(id => moduleIds.has(id))) labels.push('validação jurídica');
      if (intelligence.research?.status === 'discovery') labels.push('pesquisa em discovery');
      if (intelligence.research?.status === 'unavailable') labels.push('pesquisa externa indisponível');
      if (intelligence.research?.partial) labels.push('pesquisa parcial (fonte em falha)');
      if (['legal-draft-br', 'legal-audit'].some(id => moduleIds.has(id))) labels.push('revisão adversarial');
      const citations = intelligence.citations || null;
      const citationEntries = Array.isArray(citations?.entries) ? citations.entries : [];
      if (!labels.length && !citationEntries.length) return '';
      const gateStatus = intelligence.gates?.status;
      const gateLabel = gateStatus === 'PASS'
        ? 'gates aprovados'
        : gateStatus === 'PASS_WITH_WARNINGS'
          ? 'gates com ressalvas'
          : gateStatus === 'FAIL'
            ? 'gates com pendências'
            : '';
      const noteHtml = labels.length
        ? `<div class="ai-intelligence-note" style="font-size:11px;color:var(--muted);margin-top:6px;">Inteligência jurídica: ${escapeHtml(labels.join(' · '))}${gateLabel ? ` · ${escapeHtml(gateLabel)}` : ''}</div>`
        : '';
      const draftReviewId = `dr-${++draftReviewSequence}`;
      draftReviews.set(draftReviewId, {
        id: draftReviewId,
        draft: String(draft || ''),
        pieceType: intelligence.pieceType || '',
        area: intelligence.area || '',
        citations: citationEntries.map(entry => entry.raw).filter(Boolean).slice(0, 20)
      });
      const draftReviewHtml = String(draft || '').trim()
        ? `<div class="ai-draft-review">
            <span class="ai-draft-review-summary">Revisão por pares: segunda leitura adversarial da minuta, sem alterar o texto.</span>
            <button type="button" class="button ghost btn-draft-review" data-draft-review-id="${escapeHtml(draftReviewId)}">Revisar minuta</button>
            <div class="draft-review-slot" data-draft-review-slot="${escapeHtml(draftReviewId)}" hidden></div>
          </div>`
        : '';
      if (!citationEntries.length) return `${noteHtml}${draftReviewHtml}`;
      const reviewId = `cr-${++citationReviewSequence}`;
      citationReviews.set(reviewId, { id: reviewId, draft: String(draft || ''), citations });
      const counts = citations.review?.counts || { total: citationEntries.length };
      const blocked = (citations.review?.blockers || []).length;
      const summary = `${plural(counts.total, 'citação', 'citações')}: ${plural(counts.verified || 0, 'verificada', 'verificadas')} · ${plural(counts.pending || 0, 'pendente', 'pendentes')} · ${plural(counts.unverified || 0, 'não verificada', 'não verificadas')}${counts.conflict ? ` · ${counts.conflict} em conflito` : ''}`;
      return `${noteHtml}${draftReviewHtml}
        <div class="ai-citation-review">
          <span class="ai-citation-summary">${escapeHtml(summary)}</span>
          <button type="button" class="button ghost btn-citation-review" data-citation-review-id="${escapeHtml(reviewId)}">Revisar citações${blocked ? ` (${blocked} bloqueio${blocked === 1 ? '' : 's'})` : ''}</button>
          <div class="citation-review-slot" data-citation-slot="${escapeHtml(reviewId)}" hidden></div>
        </div>`;
    },

    async runDraftReview(reviewId) {
      const record = draftReviews.get(String(reviewId));
      const slot = documentRef.querySelector?.(`[data-draft-review-slot="${String(reviewId)}"]`);
      if (!record || !slot) return false;
      if (!slot.hidden && slot.dataset.state === 'ready') {
        slot.hidden = true;
        return true;
      }
      slot.hidden = false;
      slot.dataset.state = 'loading';
      slot.innerHTML = '<p class="draft-review-status">Executando a segunda leitura adversarial da minuta…</p>';
      try {
        const response = await secureFetch('/api/legal-intelligence/reviews', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            draft: record.draft,
            pieceType: record.pieceType,
            area: record.area,
            citations: record.citations
          })
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.message || 'Não foi possível revisar a minuta.');
        slot.dataset.state = 'ready';
        slot.innerHTML = feature.renderDraftReview(data.review || {});
        return true;
      } catch (error) {
        slot.dataset.state = 'error';
        slot.innerHTML = `<p class="draft-review-status is-error">${escapeHtml(error?.message || 'Falha ao revisar a minuta.')}</p>`;
        showToast(error?.message || 'Falha ao revisar a minuta.', 'error');
        return false;
      }
    },

    renderDraftReview(review) {
      const verdictLabels = {
        approved: 'Aprovada na segunda leitura',
        approved_with_findings: 'Aprovada com achados',
        changes_required: 'Requer alterações antes do protocolo',
        unparsed: 'Resposta não estruturada — conferir manualmente'
      };
      const severityLabels = { blocking: 'Bloqueante', high: 'Alta', medium: 'Média', low: 'Baixa' };
      const categoryLabels = { fato: 'Fato', fundamento: 'Fundamento', pedido: 'Pedido', processual: 'Processual', citacao: 'Citação', clareza: 'Clareza', prazo: 'Prazo' };
      const verdict = verdictLabels[review?.verdict] ? review.verdict : 'unparsed';
      const findings = Array.isArray(review?.findings) ? review.findings : [];
      const summary = compact(review?.summary || '');
      const items = findings.map(finding => `
        <li class="draft-review-finding is-${escapeHtml(finding.severity || 'medium')}">
          <div class="draft-review-finding-head">
            <strong>${escapeHtml(severityLabels[finding.severity] || 'Achado')}</strong>
            <span>${escapeHtml(categoryLabels[finding.category] || 'Geral')}</span>
          </div>
          ${finding.excerpt ? `<blockquote>${escapeHtml(finding.excerpt)}</blockquote>` : ''}
          ${finding.recommendation ? `<small>${escapeHtml(finding.recommendation)}</small>` : ''}
        </li>`).join('');
      const rawNote = verdict === 'unparsed' && review?.raw
        ? `<small class="draft-review-raw">Resposta bruta do revisor: ${escapeHtml(String(review.raw).slice(0, 600))}</small>`
        : '';
      return `<div class="draft-review-panel">
        <div class="draft-review-head">
          <strong class="draft-review-verdict is-${escapeHtml(verdict)}">${escapeHtml(verdictLabels[verdict])}</strong>
          ${review?.model ? `<span>${escapeHtml(String(review.model))}</span>` : ''}
        </div>
        ${summary ? `<p class="draft-review-summary">${escapeHtml(summary)}</p>` : ''}
        ${items ? `<ul class="draft-review-list">${items}</ul>` : ''}
        ${rawNote}
        <small class="draft-review-note">Revisão informativa: nada foi alterado automaticamente. A decisão sobre a minuta continua humana.</small>
      </div>`;
    },

    toggleCitationReview(reviewId) {
      const record = citationReviews.get(String(reviewId));
      const slot = documentRef.querySelector?.(`[data-citation-slot="${String(reviewId)}"]`);
      if (!record || !slot) return false;
      if (!slot.hidden) {
        slot.hidden = true;
        slot.innerHTML = '';
        return true;
      }
      slot.innerHTML = feature.renderCitationReview(record);
      slot.hidden = false;
      return true;
    },

    renderCitationReview(record) {
      const entries = record?.citations?.entries || [];
      const review = record?.citations?.review || {};
      const statusLabel = {
        verified: 'Verificada nas fontes',
        pending: 'Pendente de conferência',
        unverified: 'Não verificada',
        conflict: 'Conflito com a fonte'
      };
      const items = entries.map(entry => `
        <li class="citation-review-item is-${escapeHtml(entry.status)}">
          <strong>${escapeHtml(entry.raw)}</strong>
          <span class="citation-review-status">${escapeHtml(statusLabel[entry.status] || entry.status)}</span>
          <small>${escapeHtml(entry.note || '')}</small>
        </li>`).join('');
      const blockers = Array.isArray(review.blockers) ? review.blockers : [];
      const blockersHtml = blockers.length
        ? `<div class="citation-review-blockers">
            <strong>Bloqueios para exportação</strong>
            <ul>${blockers.map(blocker => `<li>${escapeHtml(blocker.raw)} — ${escapeHtml(blocker.message)}</li>`).join('')}</ul>
            <label for="citationOverrideJustification">Justificativa da conferência (registrada na auditoria)</label>
            <textarea id="citationOverrideJustification" data-citation-justification rows="3" maxlength="500" placeholder="Ex.: referência conferida manualmente no site oficial do tribunal em 20/09/2026."></textarea>
            <button type="button" class="button gold" data-citation-override="${escapeHtml(record.id)}">Registrar conferência</button>
          </div>`
        : '<p class="citation-review-clear">Nenhum bloqueio: a minuta pode ser exportada com a conferência humana registrada.</p>';
      const overrideNote = review.overrideApplied
        ? `<p class="citation-review-override">Override registrado por ${escapeHtml(review.override?.actor || 'usuário autenticado')} em ${escapeHtml(review.override?.at || '')}.</p>`
        : '';
      return `<div class="citation-review-panel"><ul class="citation-review-list">${items}</ul>${blockersHtml}${overrideNote}</div>`;
    },

    async submitCitationOverride(reviewId) {
      const record = citationReviews.get(String(reviewId));
      const slot = documentRef.querySelector?.(`[data-citation-slot="${String(reviewId)}"]`);
      if (!record || !slot) return false;
      const justification = String(slot.querySelector?.('[data-citation-justification]')?.value || '').replace(/\s+/g, ' ').trim();
      if (justification.length < 10) {
        showToast('Descreva a conferência com ao menos 10 caracteres.', 'error');
        return false;
      }
      const button = slot.querySelector?.('[data-citation-override]');
      if (button) button.disabled = true;
      try {
        const response = await secureFetch('/api/legal-intelligence/citations/review', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ draft: record.draft, override: { justification } })
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.message || 'Não foi possível registrar a conferência.');
        record.citations = {
          entries: Array.isArray(data.citations?.entries) ? data.citations.entries : record.citations.entries,
          review: data.review || record.citations.review
        };
        slot.innerHTML = feature.renderCitationReview(record);
        slot.hidden = false;
        showToast('Conferência registrada na auditoria. A minuta pode ser exportada com o bloqueio assumido.', 'success');
        return true;
      } catch (error) {
        showToast(String(error?.message || 'Falha ao registrar a conferência.'), 'error');
        if (button) button.disabled = false;
        return false;
      }
    },

    // ── Planos agênticos supervisionados ────────────────────────────────────

    async planAgenticDraft() {
      const input = byId('aiChatInput');
      const message = String(input?.value || '').trim();
      if (!message) {
        showToast('Descreva a peça antes de planejar.', 'error');
        return false;
      }
      const button = byId('btnAiPlan');
      if (button) button.disabled = true;
      try {
        const response = await secureFetch('/api/legal-intelligence/plans', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ message, context: feature.selectedContext(), supervision: true })
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.message || 'Não foi possível criar o plano.');
        if (input) { input.value = ''; input.style.height = 'auto'; }
        feature.renderAgenticPlan(data.plan, data.analysis);
        feature.subscribePlanEvents(data.plan.id);
        showToast('Plano criado. Aprove a pesquisa externa para executar as próximas etapas.', 'success');
        return true;
      } catch (error) {
        showToast(String(error?.message || 'Falha ao planejar a peça.'), 'error');
        return false;
      } finally {
        if (button) button.disabled = false;
      }
    },

    renderAgenticPlan(plan, analysis = null) {
      const container = byId('aiChatMessages');
      if (!container || !plan?.id) return false;
      const previous = agenticPlans.get(plan.id);
      agenticPlans.set(plan.id, { plan, analysis: analysis || previous?.analysis || null });
      let slot = container.querySelector?.(`[data-plan-id="${plan.id}"]`);
      if (!slot) {
        slot = documentRef.createElement('div');
        slot.className = 'ai-message assistant-message agentic-plan-message';
        slot.dataset.planId = plan.id;
        container.appendChild(slot);
      }
      const active = documentRef.activeElement;
      const activeAction = active?.dataset?.planAction || null;
      slot.innerHTML = feature.renderAgenticPlanPanel(plan, agenticPlans.get(plan.id)?.analysis || null);
      if (activeAction) {
        const restored = slot.querySelector?.(`[data-plan-action="${activeAction}"]`);
        restored?.focus?.();
      } else if (active && typeof slot.contains === 'function' && slot.contains(active)) {
        slot.setAttribute?.('tabindex', '-1');
        slot.focus?.();
      }
      container.scrollTop = container.scrollHeight;
      return true;
    },

    renderAgenticPlanPanel(plan, analysis = null) {
      const statusLabels = {
        done: 'Concluída',
        skipped: 'Dispensada',
        failed: 'Falhou',
        running: 'Em execução',
        approved: 'Aprovada',
        'pending-approval': 'Aguarda aprovação',
        pending: 'Pendente',
        blocked: 'Bloqueada'
      };
      const planLabels = {
        'awaiting-approval': 'Aguarda aprovação',
        'awaiting-human': 'Aguarda conferência humana',
        in_progress: 'Em andamento',
        running: 'Em execução',
        done: 'Concluído',
        failed: 'Falhou'
      };
      const steps = plan.steps || [];
      const pendingApproval = steps.find(step => step.status === 'pending-approval');
      const runnable = steps.find(step => ['approved', 'pending'].includes(step.status));
      const awaitingHuman = plan.status === 'awaiting-human';
      const failed = plan.status === 'failed';
      const stepHtml = steps.map(step => `
        <li class="agentic-plan-step is-${escapeHtml(step.status)}">
          <span class="agentic-plan-step-label">${escapeHtml(step.label)}</span>
          <span class="agentic-plan-step-status">${escapeHtml(statusLabels[step.status] || step.status)}</span>
          ${step.summary ? `<small>${escapeHtml(step.summary)}</small>` : ''}
          ${step.error ? `<small class="is-error">${escapeHtml(step.error)}</small>` : ''}
        </li>`).join('');
      const actions = [
        pendingApproval ? `<button type="button" class="button ghost" data-plan-id="${escapeHtml(plan.id)}" data-plan-action="approve">Aprovar pesquisa externa</button>` : '',
        runnable ? `<button type="button" class="button gold" data-plan-id="${escapeHtml(plan.id)}" data-plan-action="run">Executar próxima etapa</button>` : '',
        awaitingHuman ? `<button type="button" class="button gold" data-plan-id="${escapeHtml(plan.id)}" data-plan-action="confirm">Registrar conferência humana</button>` : '',
        failed ? `<button type="button" class="button ghost" data-plan-id="${escapeHtml(plan.id)}" data-plan-action="recover">Retomar plano</button>` : ''
      ].filter(Boolean).join('');
      const draft = planDrafts.get(plan.id);
      const draftHtml = draft
        ? `<details class="agentic-plan-draft"><summary>Minuta gerada (${draft.length} caracteres)</summary><div class="agentic-plan-draft-body">${formatMarkdown(draft)}</div></details>`
        : '';
      const pieceLabel = plan.pieceType || analysis?.pieceType || 'peça';
      return `
        <div class="message-avatar">${ASSISTANT_ICON}</div>
        <div class="message-body">
          <div class="agentic-plan-panel" data-plan-id="${escapeHtml(plan.id)}">
            <header class="agentic-plan-header">
              <span class="agentic-plan-title">Plano · ${escapeHtml(pieceLabel)}</span>
              <span class="status-chip ${plan.status === 'failed' ? 'danger' : plan.status === 'done' ? 'connected' : 'warning'}" aria-live="polite">${escapeHtml(planLabels[plan.status] || plan.status)}</span>
            </header>
            <ol class="agentic-plan-steps">${stepHtml}</ol>
            ${actions ? `<div class="agentic-plan-actions">${actions}</div>` : ''}
            ${draftHtml}
          </div>
        </div>`;
    },

    async runPlanAction(planId, action) {
      const allowed = ['approve', 'run', 'recover', 'confirm'];
      if (!planId || !allowed.includes(action)) return false;
      const state = agenticPlans.get(planId);
      const button = documentRef.querySelector?.(`[data-plan-id="${planId}"] [data-plan-action="${action}"]`);
      if (button) button.disabled = true;
      try {
        const body = action === 'approve'
          ? { stepId: (state?.plan?.steps || []).find(step => step.status === 'pending-approval')?.id || 'pesquisa' }
          : {};
        const response = await secureFetch(`/api/legal-intelligence/plans/${encodeURIComponent(planId)}/${action}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(body)
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.message || 'Não foi possível executar a ação do plano.');
        if (data.draft) planDrafts.set(planId, data.draft);
        feature.renderAgenticPlan(data.plan);
        const toast = action === 'approve' ? 'Etapa aprovada.'
          : action === 'confirm' ? 'Conferência humana registrada.'
            : action === 'recover' ? 'Plano retomado.'
              : data.step?.status === 'failed' ? 'Etapa falhou; revise o erro e retome o plano.' : 'Etapa executada.';
        showToast(toast, data.step?.status === 'failed' ? 'warning' : 'success');
        return true;
      } catch (error) {
        showToast(String(error?.message || 'Falha na ação do plano.'), 'error');
        return false;
      } finally {
        if (button) button.disabled = false;
      }
    },

    subscribePlanEvents(planId) {
      if (!planId || typeof secureFetch !== 'function') return false;
      try { planStreamAbort?.abort(); } catch { /* stream anterior já encerrado */ }
      const controller = typeof windowRef?.AbortController === 'function' ? new windowRef.AbortController() : null;
      planStreamAbort = controller;
      secureFetch(`/api/legal-intelligence/plans/${encodeURIComponent(planId)}/events`, {
        headers: { Accept: 'text/event-stream' },
        ...(controller ? { signal: controller.signal } : {})
      }).then(async response => {
        if (!response.ok || !response.body || typeof response.body.getReader !== 'function') return;
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const frames = buffer.split('\n\n');
          buffer = frames.pop() || '';
          for (const frame of frames) {
            const dataLine = frame.split('\n').find(line => line.startsWith('data: '));
            if (!dataLine) continue;
            try {
              const plan = JSON.parse(dataLine.slice(6));
              if (plan?.id) feature.renderAgenticPlan(plan);
            } catch { /* frame inválido */ }
          }
        }
      }).catch(() => { /* stream encerrado ou abortado */ });
      return true;
    },

    updateSkillDescription() {
      const skillSelect = byId('codexSkillSelect');
      const skillDescription = byId('codexSkillDescription');
      const current = getLegalSkills().find(skill => skill.id === skillSelect?.value);
      if (skillDescription && current) {
        skillDescription.textContent = `${current.title}: ${current.description}`;
      }
    },

    applySelectedSkill() {
      const skillSelect = byId('codexSkillSelect');
      const current = getLegalSkills().find(skill => skill.id === skillSelect?.value);
      if (!current) return false;
      const input = byId('aiChatInput');
      if (input) {
        input.value = `[$${current.id}]\n${current.instructions.slice(0, 450)}...\n\n[INSTRUÇÃO DO USUÁRIO]: `;
        input.focus();
      }
      showToast(`Especialidade "${current.name}" carregada na mensagem.`, 'success');
      return true;
    },

    formatMarkdown
  };

  return feature;
}
const ASSISTANT_ICON = '<svg class="atrium-icon" aria-hidden="true" focusable="false"><use href="assets/icons/atrium-ui-icons.svg?v=3.0.2#atrium-icon-assistant"></use></svg>';
