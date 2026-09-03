export function createAssistantFeature({
  documentRef = globalThis.document,
  windowRef = globalThis.window,
  secureFetch,
  escapeHtml = value => String(value ?? ''),
  showToast = () => {},
  audit = () => {},
  getSelectedIntimation = () => null,
  getContextCandidates = () => ({}),
  getLegalSkills = () => [],
  renderV2Presentation = () => false
} = {}) {
  let configured = false;
  let chatHistory = [];
  let isTyping = false;
  let initialized = false;
  let selectedContextKey = '';
  let manualContextSelection = false;
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
      byId('btnSaveQuickAiKey')?.addEventListener('click', () => feature.handleQuickKeySubmit());
      byId('btnClearAiConversation')?.addEventListener('click', () => feature.clearConversation());
      byId('assistantContextSelect')?.addEventListener('change', event => feature.selectContext(event.target.value));
      documentRef.querySelectorAll('.quick-prompt-btn').forEach(button => {
        button.addEventListener('click', () => feature.sendQuickPrompt(button.dataset.prompt));
      });
      byId('aiChatForm')?.addEventListener('submit', event => feature.handleChatSubmit(event));
      byId('aiChatInput')?.addEventListener('keydown', event => {
        if (event.key === 'Enter' && !event.shiftKey) {
          event.preventDefault();
          byId('aiChatForm').requestSubmit();
        }
      });

      const skillSelect = byId('codexSkillSelect');
      if (skillSelect) {
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
    },

    closeKeyModal() {
      const backdrop = byId('geminiKeyBackdrop');
      if (!backdrop || backdrop.classList.contains('hidden')) return;
      backdrop.classList.add('hidden');
      byId('appShell')?.removeAttribute('inert');
      if (byId('modalBackdrop')?.classList.contains('hidden')) documentRef.body.style.overflow = '';
      const returnFocus = backdrop.__assistantReturnFocus;
      backdrop.__assistantReturnFocus = null;
      if (returnFocus?.isConnected) returnFocus.focus();
    },

    async saveKey(apiKey) {
      const normalizedKey = String(apiKey || '').trim();
      if (!normalizedKey || normalizedKey.length < 20) {
        throw new Error('Chave inválida. Copie a chave completa gerada no Google AI Studio.');
      }
      const response = await secureFetch('/api/ai/configure', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ apiKey: normalizedKey })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || 'Falha ao validar chave com o Google Gemini.');

      audit('Chave Gemini configurada', `Assistente IA ativado com modelo ${data.model || 'gemini-3.5-flash-lite'}.`);
      await feature.checkStatus();
      return data;
    },

    async handleKeySubmit(event) {
      event.preventDefault();
      const key = byId('geminiApiKeyInput')?.value?.trim() || '';
      const feedback = byId('geminiKeyFeedback');
      const submitButton = byId('geminiKeySubmit');
      if (submitButton) {
        submitButton.disabled = true;
        submitButton.textContent = 'Validando chave com Google…';
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
        showToast('Assistente IA ativado com sucesso!', 'success');
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

    async handleQuickKeySubmit() {
      const input = byId('aiQuickKeyInput');
      const button = byId('btnSaveQuickAiKey');
      const key = input?.value?.trim() || '';
      if (!key) return showToast('Cole sua Gemini API Key antes de continuar.', 'error');
      if (button) {
        button.disabled = true;
        button.textContent = 'Validando…';
      }
      try {
        await feature.saveKey(key);
        if (input) input.value = '';
        showToast('Assistente Google Gemini ativado!', 'success');
      } catch (error) {
        showToast(error.message, 'error');
      } finally {
        if (button) {
          button.disabled = false;
          button.textContent = 'Ativar Assistente Gratuito';
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
      if (!messageText.trim()) return;
      if (isTyping) return;

      const container = byId('aiChatMessages');
      if (!container) return;

      if (!configured) {
        feature.openKeyModal();
        showToast('Por favor, configure sua chave gratuita do Gemini para usar o assistente.', 'warning');
        return;
      }

      const userDiv = documentRef.createElement('div');
      userDiv.className = 'ai-message user-message';
      userDiv.innerHTML = `
        <div class="message-avatar">EU</div>
        <div class="message-body">
          <div class="message-text">${escapeHtml(messageText).replace(/\n/g, '<br>')}</div>
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

      try {
        const response = await secureFetch('/api/ai/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({
            message: messageText,
            context,
            history: chatHistory.slice(-12)
          })
        });

        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.message || 'Falha ao consultar a API do Google Gemini.');

        typingDiv.remove();
        const replyHtml = formatMarkdown(data.reply);
        const assistantDiv = documentRef.createElement('div');
        assistantDiv.className = 'ai-message assistant-message';
        assistantDiv.innerHTML = `
          <div class="message-avatar">
            ${ASSISTANT_ICON}
          </div>
          <div class="message-body">
            <div class="message-text">${replyHtml}</div>
            <div class="message-meta">${data.model || 'Google Gemini Flash'} · ${new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(new Date())}</div>
          </div>`;
        container.appendChild(assistantDiv);

        chatHistory.push({ role: 'user', text: messageText });
        chatHistory.push({ role: 'assistant', text: data.reply });
      } catch (error) {
        typingDiv.remove();
        const errorDiv = documentRef.createElement('div');
        errorDiv.className = 'ai-message assistant-message';
        errorDiv.innerHTML = `
          <div class="message-avatar" style="background:rgba(255,77,79,0.2);color:#ff4d4f;border-color:rgba(255,77,79,0.4);">!</div>
          <div class="message-body">
            <div class="message-text" style="background:#201111;border-color:#4a1c1c;color:#ff8585;">
              <p><strong>Erro na consulta ao Assistente IA:</strong> ${escapeHtml(error.message)}</p>
              <p style="font-size:12px;margin-top:6px;color:#c59999;">Verifique se a sua chave do Google Gemini foi inserida corretamente ou acesse <a href="https://aistudio.google.com/app/apikey" target="_blank" style="color:var(--gold);text-decoration:underline;">Google AI Studio</a> para gerar uma nova chave gratuita.</p>
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
      showToast(`Skill "${current.name}" carregada no prompt.`, 'success');
      return true;
    },

    formatMarkdown
  };

  return feature;
}
const ASSISTANT_ICON = '<svg class="atrium-icon" aria-hidden="true" focusable="false"><use href="assets/icons/atrium-ui-icons.svg#atrium-icon-assistant"></use></svg>';
