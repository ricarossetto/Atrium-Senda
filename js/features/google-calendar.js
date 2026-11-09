const dateTime = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
const POLL_MS = 120_000;

function formatMoment(value) {
  const parsed = value ? new Date(value) : null;
  return parsed && !Number.isNaN(parsed.getTime()) ? dateTime.format(parsed) : '';
}

function countsMessage(counts) {
  if (!counts) return '';
  const sent = (counts.created || 0) + (counts.updated || 0) + (counts.deleted || 0);
  const parts = [];
  if (sent) parts.push(`${sent} ${sent === 1 ? 'alteração enviada' : 'alterações enviadas'}`);
  if (counts.received) parts.push(`${counts.received} ${counts.received === 1 ? 'recebida' : 'recebidas'}`);
  if (counts.restored) parts.push(`${counts.restored} ${counts.restored === 1 ? 'prazo ou audiência restaurado' : 'prazos ou audiências restaurados'}`);
  return parts.join(', ');
}

export function createGoogleCalendarFeature({
  documentRef = globalThis.document,
  windowRef = globalThis.window,
  secureFetch = (...args) => windowRef?.AtriumAuth?.secureFetch(...args),
  showToast = () => {},
  confirmFn = message => windowRef?.confirm?.(message) ?? false,
  onStateChanged = () => {},
  presentation = null
} = {}) {
  let initialized = false;
  let status = null;
  let pollTimer = null;
  let busy = false;
  const byId = id => documentRef?.getElementById(id);

  async function request(path, body) {
    const response = await secureFetch(`/api/google-calendar/${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { Accept: 'application/json', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || 'Não foi possível falar com o servidor. Tente de novo em instantes.');
    return data;
  }

  function setMessage(text = '', kind = '') {
    const element = byId('googleCalendarMessage');
    if (!element) return;
    element.textContent = text;
    element.className = `calendar-sync-status ${kind}${text ? '' : ' hidden'}`;
  }

  function setBusy(value, label) {
    busy = value;
    // Os menus ficam ativos: desativar o menu em uso tiraria o foco do painel e o Esc pararia de funcionar.
    for (const id of ['googleCalendarPrimary', 'googleCalendarDisconnect']) {
      const control = byId(id);
      if (control) control.disabled = value;
    }
    const primary = byId('googleCalendarPrimary');
    if (primary && label) primary.textContent = label;
    // Botão desativado perde o foco: ao terminar, o foco volta para dentro do painel.
    const panelOpen = byId('googleCalendarBackdrop') && !byId('googleCalendarBackdrop').classList.contains('hidden');
    if (!value && panelOpen && documentRef.activeElement === documentRef.body) primary?.focus?.();
  }

  function renderCard() {
    const chip = byId('googleCalendarStatus');
    const detail = byId('googleCalendarDetail');
    const button = byId('googleCalendarButton');
    if (!chip || !detail || !button) return;
    const needsReconnect = status?.status === 'reconnect_needed';
    if (!status?.configured) {
      chip.textContent = 'Em preparação';
      chip.className = 'status-chip muted';
      detail.textContent = 'A ligação com o Google ainda não está disponível. Até lá, a agenda externa por link traz compromissos para o ATRIUM.';
      button.textContent = 'Indisponível';
      button.disabled = true;
    } else if (needsReconnect) {
      chip.textContent = 'Conectar de novo';
      chip.className = 'status-chip warning';
      detail.textContent = 'A autorização do Google terminou e a sincronização parou. Conecte a agenda de novo.';
      button.textContent = 'Conectar de novo';
      button.disabled = false;
    } else if (status.connected) {
      chip.textContent = status.lastError ? 'Com aviso' : 'Conectada';
      chip.className = `status-chip ${status.lastError ? 'warning' : 'connected'}`;
      detail.textContent = status.account ? `Sincronizando com ${status.account}.` : 'Sincronizando com a sua conta Google.';
      button.textContent = 'Gerenciar conexão';
      button.disabled = false;
    } else {
      chip.textContent = 'Não conectada — opcional';
      chip.className = 'status-chip muted';
      detail.textContent = 'Veja compromissos e prazos do ATRIUM na sua agenda pessoal, e os compromissos dela aqui. Cada pessoa conecta a própria conta.';
      button.textContent = 'Conectar Google Agenda';
      button.disabled = false;
    }
  }

  function renderSheet() {
    const connected = Boolean(status?.connected);
    const needsReconnect = status?.status === 'reconnect_needed';
    byId('googleCalendarIntro')?.classList.toggle('hidden', connected && !needsReconnect);
    byId('googleCalendarConnected')?.classList.toggle('hidden', !connected);
    byId('googleCalendarDisconnect')?.classList.toggle('hidden', !connected);
    const primary = byId('googleCalendarPrimary');
    if (primary) primary.textContent = needsReconnect ? 'Conectar de novo' : connected ? 'Sincronizar agora' : 'Conectar Google Agenda';
    if (!connected) return;
    const account = byId('googleCalendarAccount');
    if (account) account.textContent = status.account || 'Conta Google conectada';
    const last = byId('googleCalendarLastSync');
    if (last) {
      const moment = formatMoment(status.lastSyncAt);
      last.textContent = moment ? `Última sincronização em ${moment}.` : 'A primeira sincronização está em andamento.';
    }
    const privacy = byId('googleCalendarPrivacy');
    if (privacy) privacy.value = status.privacy;
    const taskScope = byId('googleCalendarTaskScope');
    if (taskScope) taskScope.value = status.taskScope;
    const kept = byId('googleCalendarKept');
    if (kept) {
      kept.textContent = status.keptDeleted
        ? `${status.keptDeleted} ${status.keptDeleted === 1 ? 'compromisso apagado na sua agenda continua' : 'compromissos apagados na sua agenda continuam'} no ATRIUM, para o escritório não perder a informação.`
        : '';
      kept.classList.toggle('hidden', !status.keptDeleted);
    }
    // Mensagem do que a pessoa acabou de fazer não some por causa de um aviso anterior.
    if (status.lastError && !byId('googleCalendarMessage')?.textContent) setMessage(status.lastError, 'warning');
  }

  function adopt(next) {
    const previousInbound = status?.lastInboundAt || null;
    const hadStatus = Boolean(status);
    status = next;
    renderCard();
    renderSheet();
    if (hadStatus && next?.lastInboundAt && next.lastInboundAt !== previousInbound) onStateChanged();
    return next;
  }

  function startPolling() {
    if (pollTimer || !windowRef?.setInterval) return;
    pollTimer = windowRef.setInterval(() => {
      if (status?.connected && !documentRef?.hidden) feature.refreshStatus();
    }, POLL_MS);
  }

  async function handleReturn() {
    const location = windowRef?.location;
    if (!location?.search) return;
    const params = new URLSearchParams(location.search);
    const result = params.get('googleAgenda');
    if (!result) return;
    const connectionId = params.get('conexao');
    params.delete('googleAgenda');
    params.delete('conexao');
    const query = params.toString();
    windowRef.history?.replaceState?.({}, '', `${location.pathname}${query ? `?${query}` : ''}`);
    if (result === 'cancelado') {
      showToast('Conexão cancelada. Nada mudou na sua agenda.', 'warning');
    } else if (result === 'confirmar' && connectionId) {
      try {
        adopt(await request('confirm', { connectionId }));
        showToast('Google Agenda conectada. A primeira sincronização começou.', 'success');
        windowRef.setTimeout?.(() => feature.refreshStatus(), 8000);
      } catch (error) {
        showToast(error.message, 'error');
      }
    } else {
      showToast('Não foi possível conectar o Google Agenda. Tente de novo.', 'error');
    }
  }

  const feature = {
    async init() {
      if (initialized) return false;
      initialized = true;
      presentation?.init?.();
      byId('googleCalendarButton')?.addEventListener('click', () => this.open());
      byId('googleCalendarClose')?.addEventListener('click', () => this.close());
      byId('googleCalendarCancel')?.addEventListener('click', () => this.close());
      byId('googleCalendarBackdrop')?.addEventListener('click', event => {
        if (event.target === byId('googleCalendarBackdrop')) this.close();
      });
      byId('googleCalendarPrimary')?.addEventListener('click', () => this.primaryAction());
      byId('googleCalendarDisconnect')?.addEventListener('click', () => this.disconnect());
      byId('googleCalendarPrivacy')?.addEventListener('change', event => this.saveSettings({ privacy: event.target.value }));
      byId('googleCalendarTaskScope')?.addEventListener('change', event => this.saveSettings({ taskScope: event.target.value }));
      await this.refreshStatus();
      await handleReturn();
      startPolling();
      return true;
    },

    async refreshStatus() {
      try {
        return adopt(await request('status'));
      } catch {
        return status;
      }
    },

    open() {
      setMessage('');
      renderSheet();
      byId('googleCalendarBackdrop')?.classList.remove('hidden');
      if (documentRef?.body) documentRef.body.style.overflow = 'hidden';
      presentation?.open?.('googleCalendar');
    },

    close() {
      const backdrop = byId('googleCalendarBackdrop');
      if (!backdrop || backdrop.classList.contains('hidden')) return false;
      backdrop.classList.add('hidden');
      if (byId('modalBackdrop')?.classList.contains('hidden') && documentRef?.body) documentRef.body.style.overflow = '';
      presentation?.close?.('googleCalendar');
      return true;
    },

    async primaryAction() {
      if (busy) return;
      if (!status?.connected || status.status === 'reconnect_needed') return this.connect();
      return this.syncNow();
    },

    async connect() {
      setBusy(true, 'Abrindo o Google…');
      setMessage('');
      try {
        const { authorizationUrl } = await request('connect', {});
        windowRef.location.assign(authorizationUrl);
      } catch (error) {
        setMessage(error.message, 'error');
        setBusy(false);
        renderSheet();
      }
    },

    async syncNow() {
      setBusy(true, 'Sincronizando…');
      setMessage('');
      try {
        const next = adopt(await request('sync', {}));
        if (!next.lastError) setMessage(countsMessage(next.lastCounts) || 'Tudo em dia. Nada mudou desde a última sincronização.', 'success');
        onStateChanged();
      } catch (error) {
        setMessage(error.message, 'error');
      } finally {
        setBusy(false);
        renderSheet();
      }
    },

    async saveSettings(changes) {
      setBusy(true);
      setMessage('');
      try {
        adopt(await request('settings', changes));
        setMessage('Opção salva. A sua agenda muda na próxima sincronização.', 'success');
      } catch (error) {
        setMessage(error.message, 'error');
        renderSheet();
      } finally {
        setBusy(false);
        renderSheet();
      }
    },

    async disconnect() {
      if (!confirmFn('Desconectar o Google Agenda? O ATRIUM tira da sua agenda os eventos que colocou lá, e os compromissos pessoais saem do ATRIUM. Os eventos pessoais continuam na sua conta Google.')) return false;
      setBusy(true);
      setMessage('');
      try {
        const result = await request('disconnect', {});
        adopt(result);
        onStateChanged();
        this.close();
        showToast(result.keptCopies
          ? `Google Agenda desconectada. ${result.keptCopies} eventos não puderam ser apagados; apague-os na sua agenda.`
          : 'Google Agenda desconectada.', result.keptCopies ? 'warning' : 'success');
        return true;
      } catch (error) {
        setMessage(error.message, 'error');
        return false;
      } finally {
        setBusy(false);
        renderSheet();
      }
    }
  };

  return feature;
}
