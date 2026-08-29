const defaultEscapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
}[character]));

export function createImporterFeature({
  store,
  documentRef = globalThis.document,
  windowRef = globalThis.window,
  secureFetch = (...args) => windowRef?.KellerAuth?.secureFetch(...args),
  escapeHtml = defaultEscapeHtml,
  showToast = () => {},
  upsertProcess = () => {},
  upsertContact = () => {},
  upsertTask = () => {},
  onRenderAll = () => {},
  onSwitchView = () => {}
} = {}) {
  let initialized = false;
  let importedSpreadsheetData = null;
  const byId = id => documentRef?.getElementById(id);

  const feature = {
    get data() { return importedSpreadsheetData; },
    set data(value) { importedSpreadsheetData = value || null; },

    init() {
      if (initialized) return false;
      initialized = true;
      const dropzone = byId('importerDropzone');
      const fileInput = byId('importerFileInput');
      if (!dropzone || !fileInput) return true;
      byId('btnSelectSpreadsheet')?.addEventListener('click', event => {
        event.stopPropagation();
        fileInput.click();
      });
      dropzone.addEventListener('click', () => fileInput.click());
      dropzone.addEventListener('dragover', event => {
        event.preventDefault();
        dropzone.classList.add('drag-over');
      });
      dropzone.addEventListener('dragleave', () => dropzone.classList.remove('drag-over'));
      dropzone.addEventListener('drop', event => {
        event.preventDefault();
        dropzone.classList.remove('drag-over');
        if (event.dataTransfer.files?.[0]) this.handleUpload(event.dataTransfer.files[0]);
      });
      fileInput.addEventListener('change', event => {
        if (event.target.files?.[0]) this.handleUpload(event.target.files[0]);
      });
      byId('importerCancelButton')?.addEventListener('click', () => this.cancel());
      byId('importerCommitButton')?.addEventListener('click', () => this.commit());
      return true;
    },

    async handleUpload(file) {
      if (!file) return null;
      showToast('Analisando estrutura da planilha…');
      try {
        let payload;
        if (file.name.toLowerCase().endsWith('.csv')) {
          payload = { filename: file.name, content: await file.text() };
        } else {
          const bytes = new Uint8Array(await file.arrayBuffer());
          let binary = '';
          for (const byte of bytes) binary += String.fromCharCode(byte);
          const encodeBase64 = windowRef?.btoa?.bind(windowRef) || globalThis.btoa;
          payload = { filename: file.name, base64: encodeBase64(binary) };
        }
        const response = await secureFetch('/api/import/spreadsheet', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (!response.ok) {
          const error = await response.json().catch(() => ({}));
          throw new Error(error.message || 'Não foi possível ler a planilha.');
        }
        const result = await response.json();
        importedSpreadsheetData = result;
        this.renderPreview(result);
        showToast(`Planilha lida: ${result.totalRows} linha(s) encontrada(s).`, 'success');
        return result;
      } catch (error) {
        showToast(error.message || 'Falha ao processar arquivo.', 'error');
        return null;
      }
    },

    renderPreview(data) {
      const card = byId('importerPreviewCard');
      if (!card) return false;
      card.classList.remove('hidden');
      if (byId('importerFileLabel')) byId('importerFileLabel').textContent = `Arquivo: ${data.filename || 'Planilha'}`;
      if (byId('importerSummaryTitle')) byId('importerSummaryTitle').textContent = `${data.totalRows} linha(s) identificada(s)`;
      const badges = [];
      if (data.processes?.length) badges.push(`<span class="status-chip connected">⚖️ ${data.processes.length} Processo(s)</span>`);
      if (data.contacts?.length) badges.push(`<span class="status-chip planned">👥 ${data.contacts.length} Contato(s)</span>`);
      if (data.tasks?.length) badges.push(`<span class="status-chip warning">📅 ${data.tasks.length} Tarefa(s) / Prazo(s)</span>`);
      if (byId('importerBadges')) byId('importerBadges').innerHTML = badges.join('');
      const previewRows = data.preview || [];
      if (!previewRows.length) return true;
      const headers = Object.keys(previewRows[0]);
      if (byId('importerPreviewHead')) byId('importerPreviewHead').innerHTML = `<tr>${headers.map(header => `<th>${escapeHtml(header)}</th>`).join('')}</tr>`;
      if (byId('importerPreviewBody')) {
        byId('importerPreviewBody').innerHTML = previewRows.map(row => `<tr>${headers.map(header => `<td>${escapeHtml(String(row[header] || '—'))}</td>`).join('')}</tr>`).join('');
      }
      card.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
      return true;
    },

    cancel() {
      importedSpreadsheetData = null;
      byId('importerPreviewCard')?.classList.add('hidden');
      if (byId('importerFileInput')) byId('importerFileInput').value = '';
      showToast('Importação descartada.');
      return true;
    },

    async commit() {
      const data = importedSpreadsheetData;
      if (!data) return false;
      let processCount = 0;
      let contactCount = 0;
      let taskCount = 0;
      for (const process of data.processes || []) {
        upsertProcess(process);
        processCount++;
      }
      for (const contact of data.contacts || []) {
        upsertContact(contact);
        contactCount++;
      }
      for (const task of data.tasks || []) {
        upsertTask(task);
        taskCount++;
      }
      store.audit('Importação de planilha concluída', `${processCount} processos, ${contactCount} contatos e ${taskCount} tarefas consolidados.`);
      store.save();
      if (!await store.flush()) return false;
      onRenderAll();
      this.cancel();
      showToast(`Importação concluída: ${processCount} processos, ${contactCount} contatos e ${taskCount} tarefas importados!`, 'success');
      if (processCount > 0) onSwitchView('processes');
      else if (contactCount > 0) onSwitchView('contacts');
      return true;
    }
  };

  return feature;
}
