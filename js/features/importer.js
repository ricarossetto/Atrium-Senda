const plural = (count, singular, pluralForm) => `${count} ${Number(count) === 1 ? singular : pluralForm}`;
const iconSvg = name => `<svg class="atrium-icon" aria-hidden="true" focusable="false"><use href="assets/icons/atrium-ui-icons.svg?v=3.0.2#atrium-icon-${name}"></use></svg>`;

const defaultEscapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
}[character]));

const MAX_PREVIEW_ROWS = 200;

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
  onSwitchView = () => {},
  presentation = null
} = {}) {
  let initialized = false;
  let importedSpreadsheetData = null;
  let importedBatch = null;
  const byId = id => documentRef?.getElementById(id);

  const collectionSize = key => (Array.isArray(store?.state?.[key]) ? store.state[key].length : 0);

  const feature = {
    get data() { return importedSpreadsheetData; },
    set data(value) {
      importedSpreadsheetData = value || null;
      importedBatch = Array.isArray(value?.files)
        ? value.files.filter(entry => Array.isArray(entry?.processes) || Array.isArray(entry?.contacts) || Array.isArray(entry?.tasks))
        : null;
    },

    init() {
      if (initialized) return false;
      initialized = true;
      presentation?.init?.();
      const dropzone = byId('importerDropzone');
      const fileInput = byId('importerFileInput');
      if (!dropzone || !fileInput) return true;
      byId('btnSelectSpreadsheet')?.addEventListener('click', event => {
        event.stopPropagation();
        fileInput.click();
      });
      const deliverFiles = files => {
        if (!files.length) return;
        this.handleUpload(files.length === 1 ? files[0] : files);
      };
      dropzone.addEventListener('click', () => fileInput.click());
      dropzone.addEventListener('dragover', event => {
        event.preventDefault();
        dropzone.classList.add('drag-over');
      });
      dropzone.addEventListener('dragleave', () => dropzone.classList.remove('drag-over'));
      dropzone.addEventListener('drop', event => {
        event.preventDefault();
        dropzone.classList.remove('drag-over');
        deliverFiles([...(event.dataTransfer?.files || [])]);
      });
      fileInput.addEventListener('change', event => {
        deliverFiles([...(event.target.files || [])]);
      });
      byId('importerCancelButton')?.addEventListener('click', () => this.cancel());
      byId('importerCommitButton')?.addEventListener('click', () => this.commit());
      return true;
    },

    async handleUpload(files) {
      const list = (Array.isArray(files) ? files : [files]).filter(Boolean);
      if (!list.length) return null;
      showToast(list.length > 1 ? `Analisando ${list.length} planilhas…` : 'Analisando estrutura da planilha…');
      const results = [];
      for (const file of list) {
        results.push(await this.parseFile(file));
      }
      const parsed = results.filter(result => result.ok);
      if (!parsed.length) {
        showToast(results[0]?.error || 'Falha ao processar arquivo.', 'error');
        return null;
      }
      const consolidated = results.length === 1 && parsed.length === 1 ? results[0] : this.consolidate(results);
      importedSpreadsheetData = consolidated;
      importedBatch = results.length === 1 && parsed.length === 1 ? null : results;
      this.renderPreview(consolidated);
      const failures = results.length - parsed.length;
      showToast(
        failures
          ? `Planilhas lidas: ${plural(consolidated.totalRows, 'linha', 'linhas')} em ${plural(parsed.length, 'arquivo', 'arquivos')}; ${plural(failures, 'arquivo', 'arquivos')} com falha.`
          : `Planilhas lidas: ${plural(consolidated.totalRows, 'linha', 'linhas')} em ${plural(parsed.length, 'arquivo', 'arquivos')}.`,
        failures ? 'warning' : 'success'
      );
      return consolidated;
    },

    async parseFile(file) {
      try {
        let payload;
        if (String(file.name || '').toLowerCase().endsWith('.csv')) {
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
        return {
          ok: true,
          filename: result.filename || file.name,
          totalRows: Number(result.totalRows) || 0,
          processes: Array.isArray(result.processes) ? result.processes : [],
          contacts: Array.isArray(result.contacts) ? result.contacts : [],
          tasks: Array.isArray(result.tasks) ? result.tasks : [],
          preview: Array.isArray(result.preview) ? result.preview : []
        };
      } catch (error) {
        return {
          ok: false,
          filename: String(file.name || 'Arquivo'),
          error: error.message || 'Falha ao processar arquivo.',
          totalRows: 0,
          processes: [],
          contacts: [],
          tasks: [],
          preview: []
        };
      }
    },

    consolidate(results) {
      const preview = [];
      for (const result of results) {
        for (const row of result.preview) {
          if (preview.length >= MAX_PREVIEW_ROWS) break;
          preview.push({ Arquivo: result.filename, ...row });
        }
      }
      return {
        filename: `${results.length} arquivos`,
        totalRows: results.reduce((sum, result) => sum + result.totalRows, 0),
        processes: results.flatMap(result => result.processes),
        contacts: results.flatMap(result => result.contacts),
        tasks: results.flatMap(result => result.tasks),
        preview,
        files: results.map(result => ({
          ok: result.ok,
          filename: result.filename,
          error: result.error || '',
          totalRows: result.totalRows,
          processes: result.processes.length,
          contacts: result.contacts.length,
          tasks: result.tasks.length
        }))
      };
    },

    renderPreview(data) {
      const card = byId('importerPreviewCard');
      if (!card) return false;
      card.classList.remove('hidden');
      const files = Array.isArray(data.files) ? data.files : null;
      if (byId('importerFileLabel')) byId('importerFileLabel').textContent = files ? `${files.length} arquivos analisados` : `Arquivo: ${data.filename || 'Planilha'}`;
      if (byId('importerSummaryTitle')) byId('importerSummaryTitle').textContent = `${plural(data.totalRows, 'linha identificada', 'linhas identificadas')}${files ? ` em ${files.length} arquivos` : ''}`;
      const badges = [];
      if (data.processes?.length) badges.push(`<span class="status-chip connected">${iconSvg('processes')} ${plural(data.processes.length, 'processo', 'processos')}</span>`);
      if (data.contacts?.length) badges.push(`<span class="status-chip planned">${iconSvg('contacts')} ${plural(data.contacts.length, 'contato', 'contatos')}</span>`);
      if (data.tasks?.length) badges.push(`<span class="status-chip warning">${iconSvg('tasks')} ${plural(data.tasks.length, 'tarefa ou prazo', 'tarefas ou prazos')}</span>`);
      if (byId('importerBadges')) byId('importerBadges').innerHTML = badges.join('');
      const fileList = byId('importerFileList');
      if (fileList) {
        if (files) {
          fileList.innerHTML = files.map(entry => `<div class="importer-file-item${entry.ok ? '' : ' is-error'}"><strong>${escapeHtml(entry.filename || 'Arquivo')}</strong><small>${entry.ok ? `${plural(entry.processes, 'processo', 'processos')} · ${plural(entry.contacts, 'contato', 'contatos')} · ${plural(entry.tasks, 'tarefa', 'tarefas')}` : `Falha: ${escapeHtml(entry.error || 'arquivo não processado')}`}</small></div>`).join('');
          fileList.classList.remove('hidden');
        } else {
          fileList.innerHTML = '';
          fileList.classList.add('hidden');
        }
      }
      const previewRows = data.preview || [];
      if (!previewRows.length) {
        presentation?.onPreview?.(data);
        return true;
      }
      const headers = Object.keys(previewRows[0]);
      if (byId('importerPreviewHead')) byId('importerPreviewHead').innerHTML = `<tr>${headers.map(header => `<th>${escapeHtml(header)}</th>`).join('')}</tr>`;
      if (byId('importerPreviewBody')) {
        byId('importerPreviewBody').innerHTML = previewRows.map(row => `<tr>${headers.map(header => `<td>${escapeHtml(String(row[header] || '—'))}</td>`).join('')}</tr>`).join('');
      }
      presentation?.onPreview?.(data);
      card.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
      return true;
    },

    renderOutcomes(outcomes) {
      const fileList = byId('importerFileList');
      if (!fileList) return false;
      fileList.innerHTML = outcomes.map(outcome => {
        if (!outcome.ok) {
          return `<div class="importer-file-item is-error"><strong>${escapeHtml(outcome.filename || 'Arquivo')}</strong><small>Falha: ${escapeHtml(outcome.error || 'arquivo não processado')}</small></div>`;
        }
        const details = [
          `${plural(outcome.processes, 'processo', 'processos')}`,
          `${plural(outcome.contacts, 'contato', 'contatos')}`,
          `${plural(outcome.tasks, 'tarefa', 'tarefas')}`,
          outcome.merged ? `${plural(outcome.merged, 'conciliado', 'conciliados')}` : '',
          outcome.ignored ? `${plural(outcome.ignored, 'ignorado', 'ignorados')}` : ''
        ].filter(Boolean).join(' · ');
        return `<div class="importer-file-item"><strong>${escapeHtml(outcome.filename || 'Arquivo')}</strong><small>${escapeHtml(details)}</small></div>`;
      }).join('');
      fileList.classList.remove('hidden');
      return true;
    },

    cancel() {
      importedSpreadsheetData = null;
      importedBatch = null;
      byId('importerPreviewCard')?.classList.add('hidden');
      const fileList = byId('importerFileList');
      if (fileList) {
        fileList.innerHTML = '';
        fileList.classList.add('hidden');
      }
      if (byId('importerFileInput')) byId('importerFileInput').value = '';
      presentation?.onCancel?.();
      showToast('Importação descartada.');
      return true;
    },

    applyFile(file) {
      const before = { processes: collectionSize('processes'), contacts: collectionSize('contacts'), tasks: collectionSize('tasks') };
      let importedProcesses = 0;
      let importedContacts = 0;
      let importedTasks = 0;
      for (const process of file.processes || []) { if (upsertProcess(process)) importedProcesses++; }
      for (const contact of file.contacts || []) { if (upsertContact(contact)) importedContacts++; }
      for (const task of file.tasks || []) { if (upsertTask(task)) importedTasks++; }
      const created = Math.max(0, collectionSize('processes') - before.processes)
        + Math.max(0, collectionSize('contacts') - before.contacts)
        + Math.max(0, collectionSize('tasks') - before.tasks);
      const imported = importedProcesses + importedContacts + importedTasks;
      const requested = (file.processes || []).length + (file.contacts || []).length + (file.tasks || []).length;
      return {
        filename: file.filename,
        ok: file.ok !== false,
        error: file.error || '',
        processes: importedProcesses,
        contacts: importedContacts,
        tasks: importedTasks,
        created,
        merged: Math.max(0, imported - created),
        ignored: Math.max(0, requested - imported)
      };
    },

    async commit() {
      const data = importedSpreadsheetData;
      if (!data) return false;
      const batch = Array.isArray(importedBatch) && importedBatch.length ? importedBatch : null;
      let processCount = 0;
      let contactCount = 0;
      let taskCount = 0;
      const outcomes = [];
      if (batch) {
        for (const file of batch) {
          if (file.ok === false) {
            outcomes.push({ filename: file.filename, ok: false, error: file.error, processes: 0, contacts: 0, tasks: 0, created: 0, merged: 0, ignored: 0 });
            continue;
          }
          const outcome = this.applyFile(file);
          outcomes.push(outcome);
          processCount += outcome.processes;
          contactCount += outcome.contacts;
          taskCount += outcome.tasks;
        }
      } else {
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
      }
      const failed = outcomes.filter(outcome => !outcome.ok).length;
      const created = outcomes.reduce((sum, outcome) => sum + outcome.created, 0);
      const merged = outcomes.reduce((sum, outcome) => sum + outcome.merged, 0);
      const ignored = outcomes.reduce((sum, outcome) => sum + outcome.ignored, 0);
      const detail = batch
        ? `${plural(processCount, 'processo', 'processos')}, ${plural(contactCount, 'contato', 'contatos')} e ${plural(taskCount, 'tarefa', 'tarefas')} importados de ${batch.length} arquivos`
          + `${failed ? `; ${plural(failed, 'arquivo', 'arquivos')} com falha` : ''}`
          + `${created || merged || ignored ? ` (${plural(created, 'novo', 'novos')}, ${plural(merged, 'conciliado', 'conciliados')}, ${plural(ignored, 'ignorado', 'ignorados')})` : ''}.`
        : `${plural(processCount, 'processo', 'processos')}, ${plural(contactCount, 'contato', 'contatos')} e ${plural(taskCount, 'tarefa', 'tarefas')} importados.`;
      store.audit('Importação de planilha concluída', detail);
      store.save();
      if (!await store.flush()) {
        if (batch) this.renderOutcomes(outcomes);
        return false;
      }
      if (batch && failed) {
        this.renderOutcomes(outcomes);
        showToast(`Importação concluída com pendências: ${plural(processCount, 'processo', 'processos')}, ${plural(contactCount, 'contato', 'contatos')} e ${plural(taskCount, 'tarefa', 'tarefas')}; ${plural(failed, 'arquivo', 'arquivos')} com falha.`, 'warning');
      } else {
        this.cancel();
        showToast(`Importação concluída: ${plural(processCount, 'processo', 'processos')}, ${plural(contactCount, 'contato', 'contatos')} e ${plural(taskCount, 'tarefa', 'tarefas')} importados!`, 'success');
      }
      onRenderAll();
      if (!failed && processCount > 0) onSwitchView('processes');
      else if (!failed && contactCount > 0) onSwitchView('contacts');
      return true;
    }
  };

  return feature;
}
