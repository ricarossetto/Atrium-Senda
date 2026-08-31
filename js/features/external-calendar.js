export function createExternalCalendarFeature({
  store,
  documentRef = globalThis.document,
  windowRef = globalThis.window,
  secureFetch = (...args) => windowRef?.KellerAuth?.secureFetch(...args),
  showToast = () => {},
  onSyncAll = () => {},
  schedule = (callback, delay) => windowRef?.setTimeout?.(callback, delay) ?? globalThis.setTimeout(callback, delay),
  presentation = null
} = {}) {
  let initialized = false;
  const byId = id => documentRef?.getElementById(id);

  const feature = {
    init() {
      if (initialized) return false;
      initialized = true;
      presentation?.init?.();
      byId('configureCalendarButton')?.addEventListener('click', () => this.open());
      byId('calendarConfigClose')?.addEventListener('click', () => this.close());
      byId('calendarConfigCancel')?.addEventListener('click', () => this.close());
      byId('calendarConfigBackdrop')?.addEventListener('click', event => {
        if (event.target === byId('calendarConfigBackdrop')) this.close();
      });
      byId('calendarConfigForm')?.addEventListener('submit', event => this.submit(event));
      return true;
    },

    open() {
      const input = byId('calendarInputUrl');
      const url = store?.state?.settings?.calendarUrl || store?.state?.settings?.externalCalendarUrl || '';
      if (input) input.value = url;
      const status = byId('calendarConfigStatus');
      if (status) {
        status.className = 'calendar-sync-status hidden';
        status.textContent = '';
      }
      byId('calendarConfigBackdrop')?.classList.remove('hidden');
      if (documentRef?.body) documentRef.body.style.overflow = 'hidden';
      presentation?.open?.('externalCalendar');
      schedule(() => input?.focus?.(), 50);
      return url;
    },

    close() {
      const backdrop = byId('calendarConfigBackdrop');
      if (!backdrop || backdrop.classList.contains('hidden')) return false;
      backdrop.classList.add('hidden');
      if (byId('modalBackdrop')?.classList.contains('hidden') && documentRef?.body) documentRef.body.style.overflow = '';
      presentation?.close?.('externalCalendar');
      return true;
    },

    async submit(event) {
      event?.preventDefault?.();
      const calendarUrl = byId('calendarInputUrl')?.value?.trim() || '';
      const status = byId('calendarConfigStatus');
      const submitButton = byId('calendarConfigSubmit');
      if (!calendarUrl) {
        showToast('Informe a URL da agenda em formato Webcal ou iCal.', 'error');
        return false;
      }
      if (submitButton) {
        submitButton.disabled = true;
        submitButton.textContent = 'Sincronizando…';
      }
      if (status) {
        status.className = 'calendar-sync-status warning';
        status.textContent = 'Conectando e importando eventos da agenda externa…';
        status.classList.remove('hidden');
      }
      try {
        const response = await secureFetch('/api/calendar/configure', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ calendarUrl })
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.message || 'Falha ao salvar configuração da agenda.');

        store.state.settings.calendarUrl = calendarUrl;
        store.state.settings.externalCalendarUrl = calendarUrl;
        store.state.settings.calendarConfigured = true;
        store.audit('Agenda externa configurada', `${data.imported || 0} compromissos sincronizados.`);
        store.save();
        if (typeof store.flush === 'function' && !await store.flush()) {
          throw new Error('Não foi possível persistir a configuração da agenda.');
        }

        if (status) {
          status.className = data.error ? 'calendar-sync-status error' : 'calendar-sync-status success';
          status.textContent = data.message || 'Agenda sincronizada com sucesso!';
        }
        showToast(data.message || 'Agenda configurada com sucesso!', data.error ? 'error' : 'success');
        await onSyncAll();
        schedule(() => this.close(), 1200);
        return true;
      } catch (error) {
        if (status) {
          status.className = 'calendar-sync-status error';
          status.textContent = error.message;
        }
        showToast(error.message, 'error');
        return false;
      } finally {
        if (submitButton) {
          submitButton.disabled = false;
          submitButton.textContent = 'Salvar e Sincronizar Agora';
        }
      }
    }
  };

  return feature;
}
