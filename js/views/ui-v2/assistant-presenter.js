const textValue = value => String(value ?? '').trim();

function publicationLabel(item) {
  return textValue(item?.processNumber)
    || textValue(item?.process)
    || textValue(item?.title)
    || 'Publicação selecionada';
}

export function renderAssistantV2Presentation({
  documentRef = globalThis.document,
  configured = false,
  selectedIntimation = null
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
  const hasContext = Boolean(selectedIntimation);

  if (context) context.hidden = !hasContext;
  if (contextTitle) contextTitle.textContent = hasContext ? 'Contexto ativo: Publicação selecionada' : '';
  if (contextMeta) contextMeta.textContent = hasContext ? publicationLabel(selectedIntimation) : '';
  return true;
}
