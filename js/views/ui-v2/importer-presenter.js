import { iconSvg } from './icons.js';

const COUNT_DEFINITIONS = Object.freeze([
  Object.freeze({ key: 'processes', label: 'Processos', icon: 'processes' }),
  Object.freeze({ key: 'contacts', label: 'Contatos', icon: 'contacts' }),
  Object.freeze({ key: 'tasks', label: 'Tarefas', icon: 'tasks' })
]);

export function createImporterPresenter({ documentRef = globalThis.document } = {}) {
  let initialized = false;
  const byId = id => documentRef?.getElementById(id);
  const isV2 = () => documentRef?.documentElement?.dataset?.ui === 'v2';

  function setStepState(hasPreview) {
    const current = hasPreview ? 'review' : 'select';
    const order = ['prepare', 'select', 'review', 'confirm'];
    const currentIndex = order.indexOf(current);
    for (const item of documentRef?.querySelectorAll?.('[data-importer-step]') || []) {
      const index = order.indexOf(item.dataset.importerStep);
      const state = index < currentIndex ? 'complete' : index === currentIndex ? 'current' : hasPreview ? 'available' : 'pending';
      item.dataset.state = state;
      if (index === currentIndex) item.setAttribute('aria-current', 'step');
      else item.removeAttribute('aria-current');
    }
  }

  function renderCounts(data) {
    const container = byId('importerBadges');
    if (!container) return;
    const fragment = documentRef.createDocumentFragment();
    for (const definition of COUNT_DEFINITIONS) {
      const count = Array.isArray(data?.[definition.key]) ? data[definition.key].length : 0;
      const item = documentRef.createElement('div');
      item.className = 'importer-count';
      item.dataset.importerCount = definition.key;
      item.insertAdjacentHTML('beforeend', iconSvg(definition.icon));
      const value = documentRef.createElement('strong');
      value.textContent = String(count);
      const label = documentRef.createElement('span');
      label.textContent = definition.label;
      item.append(value, label);
      fragment.append(item);
    }
    container.replaceChildren(fragment);
    container.setAttribute('aria-label', 'Registros identificados na importação');
  }

  return Object.freeze({
    init() {
      if (initialized) return false;
      initialized = true;
      byId('importerFileInput')?.setAttribute('aria-label', 'Selecionar planilha para importação');
      byId('importerDropzone')?.setAttribute('aria-describedby', 'importerDropzoneDescription');
      const description = documentRef?.querySelector?.('#importerDropzone .dropzone-content > p:not(.eyebrow)');
      if (description && !description.id) description.id = 'importerDropzoneDescription';
      setStepState(false);
      return true;
    },

    onPreview(data) {
      if (!isV2()) return false;
      renderCounts(data);
      const hasRows = Array.isArray(data?.preview) && data.preview.length > 0;
      byId('importerPreviewEmpty')?.classList.toggle('hidden', hasRows);
      byId('importerPreviewTable')?.classList.toggle('hidden', !hasRows);
      if (!hasRows) {
        if (byId('importerPreviewHead')) byId('importerPreviewHead').textContent = '';
        if (byId('importerPreviewBody')) byId('importerPreviewBody').textContent = '';
      }
      setStepState(true);
      return true;
    },

    onCancel() {
      if (!isV2()) return false;
      byId('importerPreviewEmpty')?.classList.add('hidden');
      byId('importerPreviewTable')?.classList.remove('hidden');
      setStepState(false);
      return true;
    }
  });
}
