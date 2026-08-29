export function createSystemAdminFeature({
  store,
  documentRef = globalThis.document,
  windowRef = globalThis.window,
  secureFetch,
  fetchFn = (...args) => globalThis.fetch(...args),
  escapeHtml = value => String(value ?? ''),
  showToast = () => {},
  openModal = () => {},
  closeModal = () => {},
  setTheme = () => {},
  switchView = () => {}
} = {}) {
  const byId = id => documentRef.getElementById(id);

  const feature = {
    async renderDiagnostic() {
      const container = byId('configurationList');
      if (!container) return;
      container.innerHTML = '<div class="empty-detail"><span class="auth-spinner" style="margin:0 auto 16px;"></span><h3>Consultando diagnóstico…</h3><p>Verificando a integridade dos subsistemas.</p></div>';
      try {
        const response = await fetchFn('/api/system/diagnostic', { credentials: 'same-origin' });
        const data = await response.json();
        if (!data.ok || !data.diagnostic) throw new Error(data.message || 'Falha ao obter diagnóstico.');
        const diagnostic = data.diagnostic;
        container.innerHTML = feature.diagnosticHtml(diagnostic);
        feature.bindDiagnosticActions();
      } catch (error) {
        container.innerHTML = `<div class="empty-detail"><span style="color:var(--danger)">⚠️</span><h3>Erro ao gerar diagnóstico</h3><p>${escapeHtml(error.message)}</p></div>`;
      }
    },

    diagnosticHtml(diagnostic) {
      const d = diagnostic;
      return `
          <div class="diagnostic-panel" style="padding: 16px; display: flex; flex-direction: column; gap: 20px;">
            <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; padding-bottom: 14px; border-bottom: 1px solid var(--line);">
              <div>
                <h4 style="margin: 0; font-size: 1.1rem; color: var(--ivory);">${escapeHtml(d.app.name)} v${escapeHtml(d.app.version)}</h4>
                <p style="margin: 4px 0 0; font-size: 12px; color: var(--muted);">Uptime: ${Math.floor(d.app.uptimeSeconds / 60)} min · Node ${escapeHtml(d.app.nodeVersion)} · ${escapeHtml(d.app.platform)} (${escapeHtml(d.app.arch)})</p>
              </div>
              <div style="display: flex; gap: 8px;">
                <button type="button" class="button ghost" id="btnExportDiagnosticJson">📥 Exportar Relatório Anonimizado (.json)</button>
                <button type="button" class="button gold" id="btnOpenFeedbackModal">💬 Enviar Feedback Beta</button>
              </div>
            </div>

            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 16px;">
              <div class="card" style="padding: 16px; border: 1px solid var(--line); border-radius: 10px; background: var(--panel-soft);">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                  <strong style="font-size: 13px; color: var(--ivory);">Banco de Dados & Estado</strong>
                  <span class="status-chip connected" style="font-size: 10px;">Ativo</span>
                </div>
                <p style="font-size: 12px; color: var(--muted); margin: 0 0 8px;">${escapeHtml(d.storage.type)}</p>
                <ul style="margin: 0; padding-left: 18px; font-size: 11.5px; color: var(--muted); line-height: 1.6;">
                  <li>Contatos: <strong>${d.storage.records.contacts}</strong></li>
                  <li>Processos: <strong>${d.storage.records.processes}</strong></li>
                  <li>Tarefas: <strong>${d.storage.records.tasks}</strong></li>
                  <li>Intimações: <strong>${d.storage.records.intimations}</strong></li>
                  <li>Tamanho do arquivo: <strong>${(d.storage.sizeBytes / 1024).toFixed(1)} KB</strong></li>
                </ul>
              </div>

              <div class="card" style="padding: 16px; border: 1px solid var(--line); border-radius: 10px; background: var(--panel-soft);">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                  <strong style="font-size: 13px; color: var(--ivory);">Criptografia & Sessão</strong>
                  <span class="status-chip connected" style="font-size: 10px;">Protegido</span>
                </div>
                <p style="font-size: 12px; color: var(--muted); margin: 0 0 8px;">${escapeHtml(d.security.encryption)}</p>
                <ul style="margin: 0; padding-left: 18px; font-size: 11.5px; color: var(--muted); line-height: 1.6;">
                  <li>Segundo Fator: <strong>${escapeHtml(d.security.twoFactor)}</strong></li>
                  <li>Sessão HttpOnly / Zero Trust: <strong>Ativa</strong></li>
                  <li>Usuários Registrados: <strong>${d.security.totalUsers}</strong></li>
                  <li>Modo: <strong>${d.app.cloudMode ? 'Nuvem / Cloud' : 'Local Seguro'}</strong></li>
                </ul>
              </div>

              <div class="card" style="padding: 16px; border: 1px solid var(--line); border-radius: 10px; background: var(--panel-soft);">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                  <strong style="font-size: 13px; color: var(--ivory);">Tribunais & Coleta</strong>
                  <span class="status-chip ${d.integrations.djen.status === 'conectado' ? 'connected' : 'warning'}" style="font-size: 10px;">${d.integrations.djen.status}</span>
                </div>
                <p style="font-size: 12px; color: var(--muted); margin: 0 0 8px;">${escapeHtml(d.integrations.djen.description)}</p>
                <ul style="margin: 0; padding-left: 18px; font-size: 11.5px; color: var(--muted); line-height: 1.6;">
                  <li>DataJud CNJ: <strong>${d.integrations.datajud.status === 'configurado' ? 'Chave Ativa' : 'Consulta Pública'}</strong></li>
                  <li>IA Gemini: <strong>${d.integrations.gemini.status === 'configurado' ? 'Online' : 'Modelos Locais'}</strong></li>
                  <li>Última Coleta: <strong>${d.integrations.collector.lastRun ? new Date(d.integrations.collector.lastRun).toLocaleString('pt-BR') : 'Nenhuma'}</strong></li>
                </ul>
              </div>
            </div>

            <div style="border-top: 1px solid var(--line); padding-top: 20px; margin-top: 8px;">
              <h4 style="margin: 0 0 12px; font-size: 1rem; color: var(--ivory);">🧹 Higiene de Dados</h4>
              <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 12px; margin-bottom: 16px;">
                <div class="card" style="padding: 12px; border: 1px solid var(--line); border-radius: 8px; background: var(--panel-soft);">
                  <p style="margin: 0 0 4px; font-size: 12px; color: var(--muted);">App Version</p>
                  <p style="margin: 0; font-size: 14px; color: var(--ivory); font-weight: 600;">${escapeHtml(store.serverMeta?.appVersion || d.app.version || '—')}</p>
                </div>
                <div class="card" style="padding: 12px; border: 1px solid var(--line); border-radius: 8px; background: var(--panel-soft);">
                  <p style="margin: 0 0 4px; font-size: 12px; color: var(--muted);">Build ID</p>
                  <p style="margin: 0; font-size: 14px; color: var(--ivory); font-family: monospace;">${escapeHtml(store.serverMeta?.buildId || '—')}</p>
                </div>
                <div class="card" style="padding: 12px; border: 1px solid var(--line); border-radius: 8px; background: var(--panel-soft);">
                  <p style="margin: 0 0 4px; font-size: 12px; color: var(--muted);">Schema Version</p>
                  <p style="margin: 0; font-size: 14px; color: var(--ivory); font-weight: 600;">v${escapeHtml(String(store.serverMeta?.schemaVersion || '?'))}</p>
                </div>
                <div class="card" style="padding: 12px; border: 1px solid var(--line); border-radius: 8px; background: var(--panel-soft);">
                  <p style="margin: 0 0 4px; font-size: 12px; color: var(--muted);">Estado</p>
                  <p style="margin: 0; font-size: 14px; color: ${store.stateStatus === 'READY' ? 'var(--emerald)' : 'var(--danger)'}; font-weight: 600;">${escapeHtml(store.stateStatus || 'READY')}</p>
                </div>
              </div>
              <div style="display: flex; flex-wrap: wrap; gap: 10px;">
                <button type="button" class="button ghost" id="btnClearUiCache" title="Remove apenas caches transitórios do navegador. Seus processos, tarefas e dados jurídicos permanecem intactos.">🧹 Limpar cache da interface</button>
                <button type="button" class="button ghost" id="btnResetVisualPrefs" title="Reseta tema e layout para o padrão. Nenhum dado jurídico é afetado.">🎨 Resetar preferências visuais</button>
                <button type="button" class="button ghost" id="btnRebuildRuntime" title="Reconstrói dados derivados e runtime no servidor sem afetar processos ou tarefas.">🔄 Recriar dados derivados</button>
                <button type="button" class="button ghost" id="btnManagePortalSessions" title="Gerencie sessões de login dos portais judiciais. A1, TOTP e processos são preservados.">🏛️ Gerenciar sessões do tribunal</button>
              </div>
            </div>
          </div>`;
    },

    bindDiagnosticActions() {
      byId('btnExportDiagnosticJson')?.addEventListener('click', () => feature.exportDiagnostic());
      byId('btnOpenFeedbackModal')?.addEventListener('click', () => feature.openFeedbackModal());
      byId('btnClearUiCache')?.addEventListener('click', () => feature.clearUiCache());
      byId('btnResetVisualPrefs')?.addEventListener('click', () => feature.resetVisualPreferences());
      byId('btnRebuildRuntime')?.addEventListener('click', () => feature.rebuildRuntime());
      byId('btnManagePortalSessions')?.addEventListener('click', () => feature.managePortalSessions());
    },

    exportDiagnostic() {
      windowRef.location.href = '/api/system/diagnostic/export';
    },

    clearUiCache() {
      const keys = [];
      for (let index = 0; index < windowRef.localStorage.length; index++) {
        const key = windowRef.localStorage.key(index);
        if (key?.startsWith('atrium:cache:')) keys.push(key);
      }
      keys.forEach(key => windowRef.localStorage.removeItem(key));
      showToast('Cache da interface limpo com sucesso. Dados jurídicos preservados.', 'success');
    },

    resetVisualPreferences() {
      ['atrium_theme', 'jurisflow_theme', 'atrium_sidebar_collapsed', 'atrium_tour_seen', 'jurisflow_tour_seen'].forEach(key => windowRef.localStorage.removeItem(key));
      setTheme('dark');
      showToast('Preferências visuais resetadas para o padrão. Dados jurídicos preservados.', 'success');
    },

    async rebuildRuntime() {
      try {
        const response = await secureFetch('/api/system/rebuild-runtime', { method: 'POST' });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.message || 'Falha ao reconstruir dados derivados.');
        showToast(data.message || 'Runtime reconstruído com sucesso.', 'success');
        return true;
      } catch {
        showToast('Falha ao reconstruir dados derivados.', 'error');
        return false;
      }
    },

    managePortalSessions() {
      switchView('integrations');
      showToast('Abra um portal judicial e use "Limpar sessão local" para resetar a conexão desse tribunal.', 'info');
    },

    renderBackups() {
      const container = byId('configurationList');
      if (!container) return;
      container.innerHTML = `
        <div style="padding: 16px; display: flex; flex-direction: column; gap: 20px;">
          <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; padding-bottom: 14px; border-bottom: 1px solid var(--line);">
            <div>
              <h4 style="margin: 0; font-size: 1.1rem; color: var(--ivory);">Cópia de Segurança & Restauração (Zero Trust)</h4>
              <p style="margin: 4px 0 0; font-size: 12px; color: var(--muted);">Gere snapshots cifrados dos dados processuais, tarefas e contatos ou restaure de um arquivo.</p>
            </div>
            <div style="display: flex; gap: 8px;">
              <button type="button" class="button gold" id="btnCreateBackupNow">🔒 Gerar Backup Criptografado (.atrium-backup)</button>
              <label class="button ghost" style="cursor: pointer; margin: 0; display: inline-flex; align-items: center;">
                📥 Restaurar do Arquivo
                <input type="file" id="inputRestoreBackup" accept=".atrium-backup,.json" style="display: none;">
              </label>
            </div>
          </div>

          <div class="card" style="padding: 16px; border: 1px solid var(--line); border-radius: 10px; background: var(--panel-soft);">
            <h5 style="margin: 0 0 8px; font-size: 13px; color: var(--ivory);">Regras de Proteção de Dados:</h5>
            <ul style="margin: 0; padding-left: 18px; font-size: 12px; color: var(--muted); line-height: 1.6;">
              <li>Cada backup possui <strong>checksum SHA-256</strong> e é protegido com <strong>criptografia AES-256-GCM</strong>.</li>
              <li>Antes de qualquer restauração, o sistema cria automaticamente um snapshot de emergência pré-restauração.</li>
              <li>A restauração preserva a integridade de todas as chaves e usuários cadastrados.</li>
            </ul>
          </div>
        </div>`;
      byId('btnCreateBackupNow')?.addEventListener('click', () => feature.createBackup());
      byId('inputRestoreBackup')?.addEventListener('change', event => feature.restoreBackup(event.target.files?.[0], event.target));
    },

    async createBackup() {
      try {
        showToast('Gerando cópia de segurança cifrada…', 'info');
        const response = await secureFetch('/api/system/backup/create', { method: 'POST', headers: { Accept: 'application/json' } });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data.ok || !data.backupData) throw new Error(data.message || 'Falha ao criar backup.');
        const BlobConstructor = windowRef.Blob || globalThis.Blob;
        const blob = new BlobConstructor([JSON.stringify(data.backupData, null, 2)], { type: 'application/json' });
        const url = windowRef.URL.createObjectURL(blob);
        const anchor = documentRef.createElement('a');
        anchor.href = url;
        anchor.download = data.fileName || `atrium-backup-${new Date().toISOString().slice(0, 10)}.atrium-backup`;
        anchor.click();
        windowRef.URL.revokeObjectURL(url);
        showToast('Backup criptografado gerado e baixado com sucesso!', 'success');
        return { blob, fileName: anchor.download };
      } catch (error) {
        showToast(`Erro no backup: ${error.message}`, 'error');
        return null;
      }
    },

    async restoreBackup(file, input) {
      if (!file) return false;
      if (!windowRef.confirm(`Confirma a restauração do backup "${file.name}"? O sistema criará uma cópia de segurança antes de aplicar os dados.`)) {
        if (input) input.value = '';
        return false;
      }
      try {
        const backupData = JSON.parse(await file.text());
        showToast('Validando integridade e restaurando dados…', 'info');
        const response = await secureFetch('/api/system/backup/restore', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ backupData })
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data.ok) throw new Error(data.message || 'Falha ao restaurar dados.');
        showToast('Backup restaurado com sucesso! Atualizando o sistema…', 'success');
        windowRef.setTimeout(() => windowRef.location.reload(), 1200);
        return true;
      } catch (error) {
        showToast(`Erro na restauração: ${error.message}`, 'error');
        return false;
      }
    },

    openFeedbackModal() {
      openModal('feedback', 'Enviar Feedback do Beta', 'Canal de Comunicação Direto', [
        { name: 'type', label: 'Tipo de Feedback', type: 'select', options: [
          { value: 'sugestao', label: '💡 Sugestão de Melhoria' },
          { value: 'bug', label: '🐛 Relato de Problema / Bug' },
          { value: 'dificuldade', label: '❓ Dificuldade de Uso' },
          { value: 'performance', label: '⚡ Desempenho / Lentidão' }
        ], required: true },
        { name: 'component', label: 'Módulo / Tela Afetada', type: 'select', options: [
          { value: 'Geral', label: 'Geral / Outros' },
          { value: 'Área de Trabalho', label: 'Área de Trabalho' },
          { value: 'Kanban', label: 'Kanban & Tarefas' },
          { value: 'Intimações', label: 'Caixa de Intimações' },
          { value: 'Processos', label: 'Processos' },
          { value: 'Financeiro', label: 'Financeiro & RPVs' },
          { value: 'Documentos', label: 'Minutas & Modelos' },
          { value: 'Configurações', label: 'Configurações' }
        ], required: true },
        { name: 'message', label: 'Descrição Detalhada', type: 'textarea', full: true, required: true, placeholder: 'Descreva detalhadamente o que ocorreu ou sua sugestão (dados pessoais e processos não são enviados).' }
      ], {});
    },

    async submitFeedback(data = {}) {
      try {
        const payload = { type: data.type, component: data.component, message: data.message };
        const response = await secureFetch('/api/system/feedback', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(payload)
        });
        const responsePayload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(responsePayload.message || 'Falha ao enviar feedback.');
        showToast('Feedback do Beta enviado com sucesso. Muito obrigado!', 'success');
        closeModal();
        return true;
      } catch (error) {
        showToast(error.message || 'Falha ao enviar feedback.', 'error');
        return false;
      }
    }
  };

  return feature;
}
