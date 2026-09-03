import { Store } from '../core/store.js';
import { iconSvg } from '../views/ui-v2/icons.js';

export function createOfficeIdentityFeature({
  store = Store,
  documentRef = globalThis.document,
  fileReaderFactory = () => new globalThis.FileReader(),
  escapeHtml,
  showToast,
  onRenderMonitoring,
  confirmFn = message => globalThis.window?.confirm?.(message) ?? false,
  presentation = null
} = {}) {
  let initialized = false;
  let tempOfficeLogo = null;
  let initialFormSnapshot = '';
  const byId = id => documentRef?.getElementById(id);

  const feature = {
    get initialized() { return initialized; },
    get tempLogo() { return tempOfficeLogo; },
    set tempLogo(value) { tempOfficeLogo = value; },

    init() {
      if (initialized) return false;
      initialized = true;
      documentRef?.querySelector('.sidebar-office')?.addEventListener('click', () => this.open());
      byId('officeSetupClose')?.addEventListener('click', () => this.requestClose());
      byId('officeSetupCancel')?.addEventListener('click', () => this.requestClose());
      byId('officeSetupBackdrop')?.addEventListener('click', event => {
        if (event.target === byId('officeSetupBackdrop')) this.requestClose();
      });
      byId('btnChooseOfficeLogo')?.addEventListener('click', () => byId('officeLogoInput')?.click());
      byId('officeLogoInput')?.addEventListener('change', event => this.handleLogoUpload(event.target.files?.[0]));
      byId('btnRemoveOfficeLogo')?.addEventListener('click', () => {
        tempOfficeLogo = null;
        this.updateLogoPreview();
      });
      byId('officeSetupForm')?.addEventListener('submit', event => this.handleSubmit(event));
      presentation?.init?.();
      return true;
    },

    render() {
      const settings = store?.state?.settings || {};
      const officeName = settings.officeName || 'Meu Escritório';
      const officeSlogan = settings.officeSlogan || 'Desde 1983';
      const officeLogo = settings.officeLogo || '';
      const nameEl = byId('sidebarOfficeName');
      const labelEl = byId('sidebarOfficeLabel');
      const avatarEl = documentRef?.querySelector('.sidebar-office .office-avatar-icon');
      if (nameEl) nameEl.textContent = officeName;
      if (labelEl) labelEl.textContent = officeSlogan;
      if (avatarEl) {
        if (officeLogo) {
          avatarEl.innerHTML = `<img src="${escapeHtml(officeLogo)}" class="office-custom-logo" alt="Logo">`;
          avatarEl.style.background = 'transparent';
          avatarEl.style.backgroundImage = 'none';
        } else {
          avatarEl.innerHTML = '';
          avatarEl.style.backgroundImage = "url('assets/icons/team.svg')";
          avatarEl.style.backgroundSize = 'cover';
          avatarEl.style.backgroundPosition = 'center';
        }
      }
    },

    open() {
      const settings = store.state.settings || {};
      const primaryTerm = store.state.terms?.[0] || {};
      byId('officeInputName').value = settings.officeName || 'Meu Escritório';
      byId('officeInputSlogan').value = settings.officeSlogan || 'Desde 1983';
      byId('officeInputLawyer').value = settings.lawyerName || primaryTerm.name || 'Advogado(a) Titular';
      byId('officeInputOab').value = settings.lawyerOab || primaryTerm.registration || 'OAB/UF 000000';
      byId('officeInputAddress').value = settings.lawyerAddress || '';
      byId('officeInputCity').value = settings.city || '';
      tempOfficeLogo = settings.officeLogo || null;
      this.updateLogoPreview();
      initialFormSnapshot = this.formSnapshot();
      byId('officeSetupBackdrop').classList.remove('hidden');
      presentation?.openOfficeIdentity?.();
    },

    formSnapshot() {
      return JSON.stringify({
        name: byId('officeInputName')?.value || '',
        slogan: byId('officeInputSlogan')?.value || '',
        lawyer: byId('officeInputLawyer')?.value || '',
        oab: byId('officeInputOab')?.value || '',
        address: byId('officeInputAddress')?.value || '',
        city: byId('officeInputCity')?.value || '',
        logo: tempOfficeLogo || ''
      });
    },

    hasUnsavedChanges() {
      return Boolean(initialFormSnapshot && this.formSnapshot() !== initialFormSnapshot);
    },

    requestClose() {
      const backdrop = byId('officeSetupBackdrop');
      if (!backdrop || backdrop.classList.contains('hidden')) return true;
      if (this.hasUnsavedChanges()
        && !confirmFn('Há alterações não salvas na identidade do escritório. Deseja realmente fechar e descartá-las?')) return false;
      this.close();
      return true;
    },

    close() {
      const backdrop = byId('officeSetupBackdrop');
      const wasOpen = backdrop && !backdrop.classList.contains('hidden');
      backdrop?.classList.add('hidden');
      initialFormSnapshot = '';
      if (wasOpen) presentation?.closeOfficeIdentity?.();
    },

    updateLogoPreview() {
      const preview = byId('officeLogoPreview');
      const removeButton = byId('btnRemoveOfficeLogo');
      if (!preview) return;
      if (tempOfficeLogo) {
        preview.innerHTML = `<img src="${escapeHtml(tempOfficeLogo)}" alt="Prévia">`;
        removeButton?.classList.remove('hidden');
      } else {
        preview.innerHTML = `${iconSvg('office', { className: 'nav-svg atrium-icon' })}<span class="office-logo-fallback-copy">Marca do escritório</span>`;
        removeButton?.classList.add('hidden');
      }
    },

    handleLogoUpload(file) {
      if (!file) return false;
      if (file.size > 2 * 1024 * 1024) {
        showToast?.('A imagem deve ter no máximo 2MB.', 'danger');
        return false;
      }
      const reader = fileReaderFactory();
      reader.onload = event => {
        tempOfficeLogo = event.target.result;
        this.updateLogoPreview();
        showToast?.('Logo carregada com sucesso.', 'success');
      };
      reader.readAsDataURL(file);
      return true;
    },

    async handleSubmit(event) {
      event.preventDefault();
      store.state.settings ||= {};
      store.state.settings.officeName = byId('officeInputName').value.trim();
      store.state.settings.officeSlogan = byId('officeInputSlogan').value.trim();
      store.state.settings.lawyerName = byId('officeInputLawyer').value.trim();
      store.state.settings.lawyerOab = byId('officeInputOab').value.trim();
      store.state.settings.lawyerAddress = byId('officeInputAddress').value.trim();
      store.state.settings.city = byId('officeInputCity').value.trim();
      store.state.settings.officeLogo = tempOfficeLogo;
      if (store.state.terms?.[0]) {
        store.state.terms[0].name = store.state.settings.lawyerName;
        store.state.terms[0].registration = store.state.settings.lawyerOab;
      }
      store.audit('Identidade do escritório atualizada', store.state.settings.officeName);
      store.save();
      this.render();
      onRenderMonitoring?.();
      try {
        if (!await store.flush()) return false;
      } catch (error) {
        showToast?.(error.message || 'Não foi possível salvar a identidade do escritório.', 'error');
        return false;
      }
      this.close();
      showToast?.('Identidade do escritório salva com sucesso!', 'success');
      return true;
    }
  };

  return feature;
}
