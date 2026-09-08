// Contextual reading uses the canonical Store record without changing treatment.
export function openLinkedPublication(store, id, documentRef = document) {
  const record = store.state.intimations?.find(item => String(item.id) === String(id));
  if (!record) return false;
  documentRef.getElementById('linkedPublicationReader')?.close();
  const invoker = documentRef.activeElement;
  const dialog = documentRef.createElement('dialog');
  dialog.id = 'linkedPublicationReader';
  dialog.className = 'linked-publication-reader';
  dialog.setAttribute('aria-labelledby', 'linkedPublicationTitle');
  dialog.innerHTML = '<header><button type="button" class="v2-button" autofocus>← Voltar</button><p>PUBLICAÇÃO VINCULADA</p><h2 id="linkedPublicationTitle"></h2><small></small></header><article tabindex="0"></article>';
  dialog.querySelector('h2').textContent = record.title || 'Publicação';
  dialog.querySelector('small').textContent = [record.process, record.court, record.publishedAt?.slice(0, 10)].filter(Boolean).join(' · ');
  dialog.querySelector('article').textContent = record.text || 'Sem texto original disponível.';
  dialog.querySelector('button').addEventListener('click', () => dialog.close());
  // Escape belongs to the top reader, not to underlying application editors.
  dialog.addEventListener('keydown', event => event.stopPropagation());
  dialog.addEventListener('close', () => {
    dialog.remove();
    if (invoker?.isConnected) invoker.focus();
  }, { once: true });
  documentRef.body.append(dialog);
  dialog.showModal();
  return true;
}
