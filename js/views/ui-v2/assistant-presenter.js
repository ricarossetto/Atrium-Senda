export function renderAssistantV2Presentation({
  documentRef = globalThis.document,
  configured = false,
  contexts = [],
  selectedContext = null,
  escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]))
} = {}) {
  if (documentRef?.documentElement?.dataset?.ui !== 'v2') return false;

  const status = documentRef.getElementById('assistantV2StatusText');
  if (status) {
    status.textContent = configured ? 'Provedor de IA configurado' : 'Configuração necessária';
    status.dataset.state = configured ? 'configured' : 'unconfigured';
  }

  const context = documentRef.getElementById('assistantV2Context');
  const contextTitle = documentRef.getElementById('assistantV2ContextTitle');
  const contextMeta = documentRef.getElementById('assistantV2ContextMeta');
  const contextSelect = documentRef.getElementById('assistantContextSelect');
  const contextSearch = documentRef.getElementById('assistantContextSearch');
  const contextClear = documentRef.getElementById('btnClearAssistantContext');
  const contextSources = documentRef.getElementById('assistantV2ContextSources');
  const contextHint = documentRef.getElementById('assistantV2ContextHint');

  if (context) context.hidden = false;
  if (contextTitle) contextTitle.textContent = 'Contexto do envio';
  if (contextSelect) contextSelect.value = selectedContext?.key || '';
  if (contextSearch && documentRef.activeElement !== contextSearch) {
    contextSearch.value = selectedContext?.label || '';
  }
  if (contextClear) contextClear.classList.toggle('hidden', !selectedContext);
  if (contextMeta) contextMeta.textContent = selectedContext
    ? [selectedContext.label, selectedContext.meta].filter(Boolean).join(' · ')
    : 'Nenhum registro interno será anexado automaticamente.';
  if (contextSources) contextSources.innerHTML = (selectedContext?.sources || [])
    .map(source => `<span>${escapeHtml(source)}</span>`).join('');
  if (contextHint) contextHint.textContent = selectedContext
    ? 'Somente o registro escolhido e os vínculos estritamente relacionados integram o contexto.'
    : 'Escolha um processo, documento, publicação ou cliente quando a pergunta depender deles.';
  return true;
}
