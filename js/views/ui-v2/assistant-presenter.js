function contextOptionsMarkup(contexts, escapeHtml) {
  const groups = new Map();
  contexts.forEach(item => {
    if (!groups.has(item.group)) groups.set(item.group, []);
    groups.get(item.group).push(item);
  });
  return `<option value="">Sem contexto selecionado</option>${[...groups.entries()].map(([group, items]) => `<optgroup label="${escapeHtml(group)}">${items.map(item => `<option value="${escapeHtml(item.key)}">${escapeHtml(item.label)}</option>`).join('')}</optgroup>`).join('')}`;
}

export function renderAssistantV2Presentation({
  documentRef = globalThis.document,
  configured = false,
  contexts = [],
  selectedContext = null,
  escapeHtml = value => String(value ?? '')
} = {}) {
  if (documentRef?.documentElement?.dataset?.ui !== 'v2') return false;

  const status = documentRef.getElementById('assistantV2StatusText');
  if (status) {
    status.textContent = configured ? 'Gemini configurado' : 'Configuração necessária';
    status.dataset.state = configured ? 'configured' : 'unconfigured';
  }

  const context = documentRef.getElementById('assistantV2Context');
  const contextTitle = documentRef.getElementById('assistantV2ContextTitle');
  const contextMeta = documentRef.getElementById('assistantV2ContextMeta');
  const contextSelect = documentRef.getElementById('assistantContextSelect');
  const contextSources = documentRef.getElementById('assistantV2ContextSources');
  const contextHint = documentRef.getElementById('assistantV2ContextHint');

  if (context) context.hidden = false;
  if (contextTitle) contextTitle.textContent = 'Contexto do envio';
  if (contextSelect) {
    contextSelect.innerHTML = contextOptionsMarkup(contexts, escapeHtml);
    contextSelect.value = selectedContext?.key || '';
  }
  if (contextMeta) contextMeta.textContent = selectedContext
    ? [selectedContext.label, selectedContext.meta].filter(Boolean).join(' · ')
    : 'Nenhum registro interno será anexado automaticamente.';
  if (contextSources) contextSources.innerHTML = (selectedContext?.sources || [])
    .map(source => `<span>${escapeHtml(source)}</span>`).join('');
  if (contextHint) contextHint.textContent = selectedContext
    ? 'Somente o registro escolhido e os vínculos estritamente relacionados integram o contexto.'
    : 'Escolha um processo, documento, publicação ou cliente quando a pergunta depender do acervo.';
  return true;
}
