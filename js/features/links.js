import { Store, uid } from '../core/store.js';
import { iconSvg } from '../views/ui-v2/icons.js';

export const LINK_CATEGORIES = Object.freeze([
  { value: 'Legislação', label: 'Legislação & Códigos' },
  { value: 'Jurisprudência', label: 'Jurisprudência & Tribunais' },
  { value: 'Ferramentas IA', label: 'Ferramentas com IA' },
  { value: 'Órgãos Públicos', label: 'Órgãos Públicos / Cartórios' },
  { value: 'Outros', label: 'Outros Links' }
]);

export function normalizeExternalUrl(value) {
  try {
    const url = new URL(String(value || '').trim());
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : '';
  } catch {
    return '';
  }
}

export function createLinksFeature({
  store = Store,
  documentRef = globalThis.document,
  escapeHtml,
  openModal,
  showToast,
  createId = uid
} = {}) {
  let initialized = false;
  const byId = id => documentRef?.getElementById(id);

  const feature = {
    get initialized() { return initialized; },

    init() {
      if (initialized) return false;
      initialized = true;
      byId('btnNewLink')?.addEventListener('click', () => this.openModal());
      byId('customLinksGrid')?.addEventListener('click', event => {
        const deleteButton = event.target.closest('[data-delete-link]');
        if (!deleteButton) return;
        event.preventDefault();
        event.stopPropagation();
        void this.deleteRecord(deleteButton.dataset.deleteLink);
      });
      return true;
    },

    render() {
      const customLinks = store.state.customLinks || [];
      const section = byId('customLinksSection');
      const grid = byId('customLinksGrid');
      if (!section || !grid) return;
      if (!customLinks.length) {
        section.classList.add('hidden');
        grid.innerHTML = '';
        return;
      }
      section.classList.remove('hidden');
      grid.innerHTML = customLinks.map(link => {
        const safeUrl = normalizeExternalUrl(link.url);
        const title = link.title || 'Link sem título';
        let domain = '';
        try { domain = new URL(safeUrl).hostname.replace(/^www\./, ''); } catch { domain = 'Endereço inválido'; }
        const openLabel = `Abrir ${title} em nova guia`;
        const openIcon = safeUrl
          ? `<a href="${escapeHtml(safeUrl)}" target="_blank" rel="noopener noreferrer" class="external-icon" aria-label="${escapeHtml(openLabel)}">${iconSvg('external-link')}</a>`
          : `<span class="external-icon link-action-disabled" aria-label="Endereço inválido">${iconSvg('external-link')}</span>`;
        const openAction = safeUrl
          ? `<a href="${escapeHtml(safeUrl)}" target="_blank" rel="noopener noreferrer" class="link-tag" aria-label="${escapeHtml(openLabel)}">Acessar</a>`
          : '<span class="link-tag link-action-disabled">Indisponível</span>';
        return `
          <article class="link-card card custom-link-card" aria-label="${escapeHtml(`${title}, ${link.category || 'Link Personalizado'}`)}">
            <div class="link-card-header">
              <div class="link-badge">${escapeHtml(link.category || 'Link Personalizado')}</div>
              <div class="link-card-top-actions">
                ${openIcon}
                <button type="button" class="btn-delete-link" data-delete-link="${escapeHtml(link.id)}" aria-label="${escapeHtml(`Excluir link ${title}`)}" title="Excluir este link">${iconSvg('delete')}</button>
              </div>
            </div>
            <h4>${escapeHtml(title)}</h4>
            <p>${escapeHtml(link.description || 'Link personalizado adicionado ao escritório.')}</p>
            <div class="link-card-meta">
              <span class="link-domain">${escapeHtml(domain)}</span>
              ${openAction}
            </div>
          </article>`;
      }).join('');
    },

    openModal(defaults = {}) {
      openModal?.('link', defaults.id ? 'Editar link útil' : 'Adicionar novo link útil', 'Acesso rápido oficial', [
        { name: 'title', label: 'Nome / Título da referência', required: true, full: true, placeholder: 'Ex: Código de Trânsito Brasileiro (CTB)', value: defaults.title || '' },
        { name: 'url', label: 'Endereço Web (URL)', required: true, full: true, placeholder: 'Ex: https://www.planalto.gov.br/ccivil_03/leis/l9503compilado.htm', value: defaults.url || '' },
        { name: 'category', label: 'Categoria', type: 'select', options: LINK_CATEGORIES, value: defaults.category || 'Legislação' },
        { name: 'description', label: 'Descrição / O que é este link', type: 'textarea', full: true, placeholder: 'Ex: Lei Federal nº 9.503/1997 compilada com todas as normas de trânsito.', value: defaults.description || '' }
      ], defaults);
    },

    saveRecord(data, defaults = {}) {
      const normalizedUrl = normalizeExternalUrl(data.url);
      if (!normalizedUrl) {
        showToast?.('Informe um endereço HTTP ou HTTPS válido.', 'error');
        return null;
      }
      const isEditing = Boolean(defaults.id);
      const record = {
        id: defaults.id || createId('link'),
        title: data.title || 'Link sem título',
        url: normalizedUrl,
        category: data.category || 'Legislação',
        description: data.description || '',
        createdAt: defaults.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      store.state.customLinks ||= [];
      const index = store.state.customLinks.findIndex(link => link.id === record.id);
      if (index >= 0) store.state.customLinks[index] = record;
      else store.state.customLinks.unshift(record);
      store.audit(isEditing ? 'Link útil atualizado' : 'Link útil adicionado', record.title);
      return record;
    },

    async deleteRecord(linkId) {
      const customLinksBefore = structuredClone(store.state.customLinks || []);
      const auditBefore = structuredClone(store.state.audit || []);
      const index = (store.state.customLinks || []).findIndex(link => link.id === linkId);
      if (index < 0) return false;
      const removed = store.state.customLinks.splice(index, 1)[0];
      try {
        store.audit('Link útil excluído', removed?.title || linkId);
        store.save();
        if (!await store.flush()) throw new Error('Não foi possível persistir a exclusão do link.');
      } catch (error) {
        store.state.customLinks = customLinksBefore;
        store.state.audit = auditBefore;
        this.render();
        showToast?.(error.message || 'Não foi possível excluir o link útil.', 'error');
        return false;
      }
      this.render();
      showToast?.('Link útil excluído com sucesso.', 'success');
      return true;
    }
  };

  return feature;
}
