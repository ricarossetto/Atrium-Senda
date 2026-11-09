import { findIntimationRecord } from '../core/publication-scope.js?v=3.0.1';
import { installPanelSizeToggle } from './panel-size.js?v=3.0.1';

// Contextual reading uses the canonical Store record without changing treatment.
// Ids absorvidos por fusão resolvem para o keeper (alias nunca abre).
export function openLinkedPublication(store, id, documentRef = document) {
  const record = findIntimationRecord(store.state.intimations, id);
  if (!record) return false;
  documentRef.getElementById('linkedPublicationReader')?.close();
  const invoker = documentRef.activeElement;
  const dialog = documentRef.createElement('dialog');
  dialog.id = 'linkedPublicationReader';
  dialog.className = 'linked-publication-reader';
  dialog.setAttribute('aria-labelledby', 'linkedPublicationTitle');
  dialog.innerHTML = '<header><button type="button" class="v2-button" autofocus><svg class="atrium-icon" aria-hidden="true" focusable="false"><use href="assets/icons/atrium-ui-icons.svg?v=3.0.1#atrium-icon-chevron-left"></use></svg> Voltar</button><button type="button" class="linked-publication-reader-size" data-panel-size-toggle aria-pressed="false" aria-label="Maximizar painel" title="Maximizar painel"><svg class="atrium-icon" aria-hidden="true" focusable="false"><use href="assets/icons/atrium-ui-icons.svg?v=3.0.1#atrium-icon-maximize"></use></svg></button><p>PUBLICAÇÃO VINCULADA</p><h2 id="linkedPublicationTitle"></h2><small></small></header><article tabindex="0"></article>';
  dialog.setAttribute('data-panel-size-anchor', 'fixed');
  dialog.querySelector('h2').textContent = record.title || 'Publicação';
  dialog.querySelector('small').textContent = [record.process, record.court, record.publishedAt?.slice(0, 10)].filter(Boolean).join(' · ');
  dialog.querySelector('article').textContent = record.text || 'Sem texto original disponível.';
  dialog.querySelector('button').addEventListener('click', () => dialog.close());
  installPanelSizeToggle(dialog);
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
