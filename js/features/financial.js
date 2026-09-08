import { Store } from '../core/store.js';
import { installModalComboboxes } from '../components/modal.js';

export function createFinancialFeature({
  store = Store,
  documentRef = globalThis.document,
  normalizeText,
  escapeHtml,
  formatCurrency,
  showToast,
  renderDashboardFinancialWidgets,
  renderV2Workspace,
  onOpenProcess
} = {}) {
  let editingEntry = null;
  let visibleRecords = [];
  let initialized = false;
  let financialFilter = 'all';
  let submittingEntry = false;
  let lastFocusedElement = null;
  let previousBodyOverflow = '';
  const byId = id => documentRef?.getElementById(id);
  const isV2 = () => documentRef?.documentElement?.dataset?.ui === 'v2';

  const feature = {
    get filter() { return financialFilter; },

    init() {
      if (initialized) return false;
      initialized = true;
      byId('financialFilters')?.addEventListener('click', event => {
        const button = event.target.closest('button[data-fin-filter]');
        if (!button) return;
        financialFilter = button.dataset.finFilter;
        byId('financialFilters').querySelectorAll('button').forEach(item => item.classList.toggle('active', item === button));
        this.render();
      });
      byId('financialSearch')?.addEventListener('input', event => this.render(event.target.value));
      byId('financialV2Workspace')?.addEventListener('click', event => {
        const button = event.target.closest('[data-financial-process-id]');
        if (!button) {
          const row = event.target.closest('[data-financial-edit]');
          if (row) this.editRecord(visibleRecords[Number(row.dataset.financialEdit)]);
          return;
        }
        const process = (store.state.processes || []).find(item => String(item.id) === button.dataset.financialProcessId);
        if (process) onOpenProcess?.(process);
      });
      byId('financialV2Workspace')?.addEventListener('keydown', event => {
        if (event.target.matches('[data-financial-edit]') && ['Enter', ' '].includes(event.key)) { event.preventDefault(); this.editRecord(visibleRecords[Number(event.target.dataset.financialEdit)]); }
      });
      byId('newFinancialEntryButton')?.addEventListener('click', () => this.openEntryModal());
      byId('financialEntryClose')?.addEventListener('click', () => this.closeEntryModal());
      byId('financialEntryDelete')?.addEventListener('click', () => this.confirmExpenseDeletion());
      byId('financialEntryCancel')?.addEventListener('click', () => this.closeEntryModal());
      byId('financialEntryBackdrop')?.addEventListener('click', event => {
        if (event.target === byId('financialEntryBackdrop')) this.closeEntryModal();
      });
      if (byId('financialEntryBackdrop')) byId('financialEntryBackdrop').onkeydown = event => this.handleEntryKeydown(event);
      byId('financialEntryForm')?.addEventListener('submit', event => this.handleEntrySubmit(event));
      byId('finGrossInput')?.addEventListener('input', () => this.updateModalSummary());
      byId('finFeePctInput')?.addEventListener('input', () => this.updateModalSummary());
      byId('finTypeSelect')?.addEventListener('change', () => this.updateModalSummary());
      return true;
    },

    render(query = '') {
      const listEl = byId('financialTableBody');
      if (!listEl) return;
      const filter = financialFilter || 'all';
      const needle = normalizeText(query);
      const processes = store.state.processes || [];

      const FINANCIAL_STATUS_MAP = {
        requisitado: { label: 'Requisitado / Expedido', chipClass: 'muted', isFinal: false },
        aguardando_deposito: { label: 'Aguardando Depósito', chipClass: 'warning', isFinal: false },
        disponivel_saque: { label: 'Disponível para Saque', chipClass: 'info', isFinal: false },
        repassado: { label: 'Repassado & Quitado', chipClass: 'connected', isFinal: true },
        pago: { label: 'Repassado & Quitado', chipClass: 'connected', isFinal: true },
        quitado: { label: 'Repassado & Quitado', chipClass: 'connected', isFinal: true }
      };

      let totalHonorariosAFaturar = 0;
      let rpvCount = 0;
      let pendingExpenses = 0;
      let totalReceipts = 0;

      const rows = [];
      const presentationRecords = [];
      processes.forEach(proc => {
        const isPaid = proc.feeStatus === 'pago' || proc.feeStatus === 'quitado' || proc.feeStatus === 'repassado' || proc.requisitionStatus === 'repassado' || proc.requisitionStatus === 'pago';
        const feeInstallments = Array.isArray(proc.feeInstallments) ? proc.feeInstallments : [];
        const receipts = Array.isArray(proc.receipts) ? proc.receipts : [];
        const pendingInstallmentTotal = feeInstallments
          .filter(installment => !isSettledFinancialStatus(installment.status))
          .reduce((total, installment) => total + finiteAmount(installment.amount), 0);
        const hasInstallmentSchedule = feeInstallments.length > 0;
        if (hasInstallmentSchedule) totalHonorariosAFaturar += pendingInstallmentTotal;
        totalReceipts += receipts
          .filter(receipt => receipt.status !== 'estornado')
          .reduce((total, receipt) => total + finiteAmount(receipt.amount), 0);
        const hasRequisitionAmount = proc.requisitionAmount !== '' && proc.requisitionAmount !== null && proc.requisitionAmount !== undefined;
        const hasRpvAmount = proc.rpvAmount !== '' && proc.rpvAmount !== null && proc.rpvAmount !== undefined;

        const processExpenses = Array.isArray(proc.expenses) ? proc.expenses : [];
        pendingExpenses += processExpenses
          .filter(expense => (expense.status || 'pendente') === 'pendente')
          .reduce((total, expense) => total + Number(expense.amount || 0), 0);
        if (filter === 'all' || filter === 'despesas') {
          processExpenses.forEach(expense => {
            const amount = Number(expense.amount || 0);
            const status = expense.status || 'pendente';
            if (!needle || normalizeText(`${proc.number} ${proc.client} ${expense.description} ${status}`).includes(needle)) {
              presentationRecords.push({
                id: expense.id || `${proc.id}-expense`,
                processId: proc.id,
                kind: 'despesa',
                processNumber: proc.number || 'Processo sem número',
                client: proc.client || 'Cliente',
                typeLabel: expense.description || 'Despesa processual',
                gross: amount,
                feeAmount: null,
                netClient: null,
                statusLabel: status === 'reembolsado' ? 'Reembolsada' : status === 'pago' ? 'Paga' : 'Pendente',
                statusTone: status === 'pendente' ? 'warning' : 'connected'
              });
            }
          });
        }

        if (filter === 'all' || filter === 'honorarios') {
          feeInstallments.forEach((installment, index) => {
            const amount = finiteAmount(installment.amount);
            const settled = isSettledFinancialStatus(installment.status);
            const overdue = !settled && isPastDate(installment.dueDate);
            if (!needle || normalizeText(`${proc.number} ${proc.client} ${installment.description} ${installment.status} ${installment.dueDate}`).includes(needle)) {
              presentationRecords.push({
                id: installment.id || `${proc.id}-installment-${index}`,
                processId: proc.id,
                kind: 'parcela',
                processNumber: proc.number || 'Processo sem número',
                client: proc.client || 'Cliente',
                typeLabel: installment.description || 'Parcela de honorários',
                gross: amount,
                feeAmount: amount,
                netClient: null,
                date: installment.dueDate || installment.createdAt || '',
                statusLabel: settled ? 'Paga' : overdue ? 'Vencida' : 'Pendente',
                statusTone: settled ? 'connected' : overdue ? 'disconnected' : 'warning'
              });
            }
          });
        }

        if (filter === 'all' || filter === 'recebimentos') {
          receipts.forEach((receipt, index) => {
            const amount = finiteAmount(receipt.amount);
            if (!needle || normalizeText(`${proc.number} ${proc.client} ${receipt.description} ${receipt.status} ${receipt.date}`).includes(needle)) {
              presentationRecords.push({
                id: receipt.id || `${proc.id}-receipt-${index}`,
                processId: proc.id,
                kind: 'recebimento',
                processNumber: proc.number || 'Processo sem número',
                client: proc.client || 'Cliente',
                typeLabel: receipt.description || 'Recebimento de honorários',
                gross: amount,
                feeAmount: amount,
                netClient: null,
                date: receipt.date || receipt.createdAt || '',
                statusLabel: receipt.status === 'estornado' ? 'Estornado' : 'Recebido',
                statusTone: receipt.status === 'estornado' ? 'disconnected' : 'connected'
              });
            }
          });
        }

        // Cálculo canônico do RPV / Precatório (BUG-003)
        if (proc.requisitionStatus || hasRequisitionAmount || hasRpvAmount) {
          rpvCount++;
          const gross = Number(proc.requisitionAmount ?? proc.rpvAmount ?? proc.economicValue ?? 0);
          const feePct = Number(proc.feePercentage ?? 30);
          const hasFeeAmount = proc.feeAmount !== '' && proc.feeAmount !== null && proc.feeAmount !== undefined;
          const feeAmount = hasFeeAmount ? Number(proc.feeAmount) : (gross * feePct / 100);
          const netClient = Math.max(0, gross - feeAmount);
          const statusInfo = FINANCIAL_STATUS_MAP[proc.requisitionStatus] || { label: proc.requisitionStatus || 'Requisitado', chipClass: 'warning', isFinal: false };

          if (!hasInstallmentSchedule && !isPaid && !statusInfo.isFinal) {
            totalHonorariosAFaturar += feeAmount;
          }

          if (filter === 'all' || filter === 'rpv') {
            if (!needle || normalizeText(`${proc.number} ${proc.client} ${statusInfo.label}`).includes(needle)) {
              presentationRecords.push({
                id: proc.id || proc.number,
                processId: proc.id,
                kind: 'rpv',
                processNumber: proc.number || 'Processo sem número',
                client: proc.client || 'Cliente',
                typeLabel: `RPV / Alvará (${feePct}%)`,
                gross,
                feeAmount,
                netClient,
                feeType: proc.feeType,
                statusLabel: statusInfo.label,
                statusTone: statusInfo.chipClass
              });
              rows.push(`
                <tr>
                  <td><strong>${escapeHtml(proc.number || 'Processo sem número')}</strong></td>
                  <td>${escapeHtml(proc.client || 'Cliente')}</td>
                  <td><span class="status-chip connected">RPV / Alvará (${feePct}%)</span></td>
                  <td>${formatCurrency(gross)}</td>
                  <td><strong style="color:var(--gold);">${formatCurrency(feeAmount)}</strong></td>
                  <td><strong style="color:var(--success);">${formatCurrency(netClient)}</strong></td>
                  <td><span class="status-chip ${statusInfo.chipClass}">${escapeHtml(statusInfo.label)}</span></td>
                </tr>
              `);
            }
          }
        } else if (filter === 'all' || filter === 'honorarios') {
          const hasFeeAmount = proc.feeAmount !== '' && proc.feeAmount !== null && proc.feeAmount !== undefined;
          const hasFeeMonthly = proc.feeMonthly !== '' && proc.feeMonthly !== null && proc.feeMonthly !== undefined;
          if (hasFeeAmount || hasFeeMonthly) {
            const feeVal = proc.feeType === 'misto'
              ? finiteAmount(proc.feeAmount) + finiteAmount(proc.feeMonthly)
              : Number(hasFeeAmount ? proc.feeAmount : proc.feeMonthly);
            if (!hasInstallmentSchedule && !isPaid) totalHonorariosAFaturar += feeVal;
            if (!needle || normalizeText(`${proc.number} ${proc.client} ${proc.feeType}`).includes(needle)) {
              presentationRecords.push({
                id: proc.id || proc.number,
                processId: proc.id,
                kind: 'honorarios',
                processNumber: proc.number || 'Contrato',
                client: proc.client || 'Cliente',
                typeLabel: proc.feeType || 'Honorários Contratuais',
                feeType: proc.feeType,
                gross: feeVal,
                feeAmount: feeVal,
                netClient: null,
                statusLabel: isPaid ? 'Quitado' : 'A Faturar',
                statusTone: isPaid ? 'connected' : 'warning'
              });
              rows.push(`
                <tr>
                  <td><strong>${escapeHtml(proc.number || 'Contrato')}</strong></td>
                  <td>${escapeHtml(proc.client || 'Cliente')}</td>
                  <td><span class="status-chip muted">${escapeHtml(proc.feeType || 'Honorários Contratuais')}</span></td>
                  <td>${formatCurrency(feeVal)}</td>
                  <td><strong style="color:var(--gold);">${formatCurrency(feeVal)}</strong></td>
                  <td>—</td>
                  <td><span class="status-chip ${isPaid ? 'connected' : 'warning'}">${isPaid ? 'Quitado' : 'A Faturar'}</span></td>
                </tr>
              `);
            }
          }
        }
      });

      const directOwners = [
        { name: 'Escritório', expenses: store.state.officeExpenses || [], office: true },
        ...(store.state.contacts || [])
      ];
      for (const owner of directOwners) {
        for (const expense of (Array.isArray(owner.expenses) ? owner.expenses : [])) {
          const amount = finiteAmount(expense.amount);
          if ((expense.status || 'pendente') === 'pendente') pendingExpenses += amount;
          if ((filter === 'all' || filter === 'despesas') && (!needle || normalizeText(owner.name + ' ' + expense.description).includes(needle))) {
            presentationRecords.push({ id: expense.id, processId: '', contactId: owner.office ? '' : owner.id,
              kind: 'despesa', processNumber: owner.office ? 'Escritório' : 'Contato', client: owner.office ? 'Despesa operacional — sem vínculo' : owner.name,
              typeLabel: expense.description, gross: amount, feeAmount: null, netClient: null, date: expense.date,
              statusLabel: expense.status === 'pago' ? 'Paga' : expense.status === 'reembolsado' ? 'Reembolsada' : 'Pendente',
              statusTone: expense.status === 'pendente' ? 'warning' : 'connected' });
          }
        }
        for (const [key, kind, filterName] of [['receipts', 'recebimento', 'recebimentos'], ['feeInstallments', 'parcela', 'honorarios']]) {
          for (const entry of (Array.isArray(owner[key]) ? owner[key] : [])) {
            const amount = finiteAmount(entry.amount);
            if (kind === 'recebimento' && entry.status !== 'estornado') totalReceipts += amount;
            if (kind === 'parcela' && !isSettledFinancialStatus(entry.status)) totalHonorariosAFaturar += amount;
            if ((filter === 'all' || filter === filterName) && (!needle || normalizeText(owner.name + ' ' + entry.description).includes(needle))) {
              presentationRecords.push({ id: entry.id, processId: '', contactId: owner.id, kind,
                processNumber: 'Contato', client: owner.name, typeLabel: entry.description,
                gross: amount, feeAmount: amount, netClient: null, date: entry.date || entry.dueDate,
                statusLabel: kind === 'recebimento' ? (entry.status === 'estornado' ? 'Estornado' : 'Recebido') : (isSettledFinancialStatus(entry.status) ? 'Paga' : 'Pendente'),
                statusTone: isSettledFinancialStatus(entry.status) || entry.status === 'recebido' ? 'connected' : 'warning' });
            }
          }
        }
      }

      const honEl = byId('finMetricHonorarios');
      const rpvEl = byId('finMetricRpvCount');
      const expenseEl = byId('finMetricExpenses');
      const receiptsEl = byId('finMetricReceipts');
      if (honEl) honEl.textContent = formatCurrency(totalHonorariosAFaturar);
      if (rpvEl) rpvEl.textContent = `${rpvCount} requisições`;
      if (expenseEl) expenseEl.textContent = formatCurrency(pendingExpenses);
      if (receiptsEl) receiptsEl.textContent = formatCurrency(totalReceipts);
      byId('financialFilters')?.querySelectorAll('button[data-fin-filter]').forEach(button => {
        button.setAttribute?.('aria-pressed', String(button.dataset.finFilter === filter));
      });

      if (isV2() && byId('financialV2Workspace') && renderV2Workspace) {
        listEl.innerHTML = '';
        byId('financialV2Workspace').innerHTML = renderV2Workspace({
          records: (visibleRecords = presentationRecords).map((record, editKey) => ({ ...record, editKey })),
          query,
          filter,
          escapeHtml,
          formatCurrency
        });
      } else {
        if (byId('financialV2Workspace')) byId('financialV2Workspace').innerHTML = '';
        listEl.innerHTML = rows.length ? rows.join('') : '<tr><td colspan="7" class="empty-table" style="text-align:center;padding:24px;color:var(--muted);">Nenhum lançamento financeiro ou requisição RPV localizada.</td></tr>';
      }
    },

    editRecord(record) {
      if (!record) return;
      const ownerId = record.processId || (record.contactId ? 'contact:' + record.contactId : 'office');
      const owner = record.processId ? store.state.processes.find(p => p.id === record.processId)
        : record.contactId ? store.state.contacts.find(c => c.id === record.contactId) : { expenses: store.state.officeExpenses || [] };
      if (!owner) return;
      const collection = { despesa: 'expenses', parcela: 'feeInstallments', recebimento: 'receipts' }[record.kind];
      const entry = collection ? owner[collection]?.find(e => e.id === record.id) : null;
      const type = collection ? record.kind : record.kind === 'rpv' ? 'rpv' : owner.feeType;
      if ((collection && !entry) || !['despesa','parcela','recebimento','rpv','fixo','mensal','exito'].includes(type)) { onOpenProcess?.(owner); return; }
      this.openEntryModal();
      editingEntry = { ownerId, type, collection, id: entry?.id };
      byId('finModalTitle').textContent = 'Editar lançamento financeiro';
      byId('finProcessSelect').value = ownerId;
      const option = [...documentRef.querySelectorAll('#finLinkResults [data-combobox-option]')].find(o => o.dataset.identity === ownerId);
      byId('finLinkSearch').value = option?.dataset.value || record.client;
      byId('finLinkSearch').disabled = type !== 'despesa';
      byId('finTypeSelect').value = type;
      byId('finTypeSelect').disabled = type !== 'despesa';
      if (type === 'despesa') {
        for (const option of byId('finTypeSelect').options) option.disabled = !['despesa', 'recebimento', 'parcela'].includes(option.value);
        byId('financialEntryDelete')?.classList.remove('hidden');
      }
      byId('finGrossInput').value = entry?.amount ?? (type === 'exito' ? (owner.feePercentage ? owner.feeAmount * 100 / owner.feePercentage : 0) : record.gross);
      byId('finFeePctInput').value = owner.feePercentage ?? '';
      byId('finDescriptionInput').value = entry?.description || '';
      byId('finDateInput').value = entry?.date || entry?.dueDate || '';
      this.updateModalSummary();
      byId('finStatusSelect').value = entry?.status || (type === 'rpv' ? owner.requisitionStatus : owner.feeStatus) || byId('finStatusSelect').value;
      byId('finGrossInput').focus();
    },

    entryOwner(ownerId) {
      return ownerId === 'office' ? { expenses: store.state.officeExpenses || [] }
        : ownerId.startsWith('contact:') ? store.state.contacts.find(c => c.id === ownerId.slice(8))
        : store.state.processes.find(p => p.id === ownerId);
    },

    confirmExpenseDeletion() {
      if (submittingEntry || editingEntry?.type !== 'despesa' || byId('financialDeleteConfirm')) return;
      const original = this.entryOwner(editingEntry.ownerId)?.expenses?.find(e => e.id === editingEntry.id);
      if (!original) { showToast?.('Despesa não encontrada. Reabra a lista.', 'error'); return; }
      const dialog = documentRef.createElement('dialog');
      dialog.id = 'financialDeleteConfirm';
      dialog.className = 'unsaved-changes-dialog';
      dialog.setAttribute('aria-labelledby', 'financialDeleteTitle');
      dialog.innerHTML = '<h2 id="financialDeleteTitle">Excluir despesa?</h2><p></p><footer><button class="button ghost" type="button" data-delete-cancel autofocus>Cancelar</button><button class="button danger" type="button" data-delete-confirm>Excluir despesa</button></footer>';
      dialog.querySelector('p').textContent = `Excluir “${original.description}” (${formatCurrency(original.amount)})? Essa ação remove o lançamento financeiro.`;
      dialog.addEventListener('keydown', event => event.stopPropagation());
      dialog.addEventListener('close', () => { dialog.remove(); byId('financialEntryDelete')?.focus(); }, { once: true });
      dialog.querySelector('[data-delete-cancel]').onclick = () => dialog.close();
      dialog.querySelector('[data-delete-confirm]').onclick = async () => { dialog.close(); await this.deleteExpense(); };
      documentRef.body.append(dialog);
      dialog.showModal();
    },

    async deleteExpense() {
      if (submittingEntry || editingEntry?.type !== 'despesa') return;
      submittingEntry = true;
      const previous = JSON.parse(JSON.stringify(store.state));
      const button = byId('financialEntryDelete');
      if (button) button.disabled = true;
      try {
        const owner = this.entryOwner(editingEntry.ownerId);
        const index = owner?.expenses?.findIndex(e => e.id === editingEntry.id) ?? -1;
        if (index < 0) throw new Error('Despesa não encontrada');
        const [removed] = owner.expenses.splice(index, 1);
        owner.updatedAt = owner.financialUpdatedAt = new Date().toISOString();
        store.audit('Despesa excluída', `${removed.description}: ${formatCurrency(removed.amount)}`);
        store.save();
        if (!await store.flush()) throw new Error('Gravação não confirmada');
        this.closeEntryModal();
        this.render();
        renderDashboardFinancialWidgets?.();
        showToast?.('Despesa excluída.', 'success');
      } catch {
        store.state = previous;
        showToast?.('Não foi possível confirmar a exclusão. A despesa foi mantida; tente novamente.', 'error');
      } finally {
        submittingEntry = false;
        if (button) button.disabled = false;
      }
    },

    openEntryModal() {
      editingEntry = null;
      byId('financialEntryDelete')?.classList.add('hidden');
      for (const option of byId('finTypeSelect')?.options || []) option.disabled = false;
      if (byId('finModalTitle')) byId('finModalTitle').textContent = 'Novo Lançamento Financeiro';
      if (byId('finTypeSelect')) byId('finTypeSelect').disabled = false;
      const backdrop = byId('financialEntryBackdrop');
      if (!backdrop) return;
      const select = byId('finProcessSelect');
      const processes = store.state.processes || [];
      if (select) {
        select.innerHTML = '<option value="">Selecione o processo ou cliente...</option>' +
          processes.map(process => `<option value="${escapeHtml(process.id)}">${escapeHtml(process.number || 'S/N')} — ${escapeHtml(process.client || 'Cliente')}</option>`).join('');
      }
      if (isV2() && select) {
        const choices = [
          { id: 'office', label: 'Escritório — sem vínculo', detail: 'Despesa operacional' },
          ...processes.map(p => ({ id: p.id, label: [p.number || 'Processo sem número', p.client].filter(Boolean).join(' — '), detail: 'Processo' })),
          ...(store.state.contacts || []).map(c => ({ id: 'contact:' + c.id, label: c.name || 'Contato sem nome', detail: 'Contato / cliente' }))
        ];
        const field = select.closest('label');
        field.setAttribute('data-modal-combobox-field', '');
        field.innerHTML = '<span>Pesquisar vínculo</span><div class="modal-combobox">' +
          '<input id="finLinkSearch" type="search" autocomplete="off" placeholder="Processo, cliente ou escritório…" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="finLinkResults" data-modal-combobox>' +
          '<input id="finProcessSelect" type="hidden" name="processId" data-combobox-identity>' +
          '<div id="finLinkResults" class="modal-combobox-listbox hidden" role="listbox">' +
          choices.map((c, i) => '<button type="button" role="option" id="finLinkOption-' + i + '" aria-selected="false" data-combobox-option data-value="' + escapeHtml(c.label) + '" data-identity="' + escapeHtml(c.id) + '"><strong>' + escapeHtml(c.label) + '</strong><small>' + escapeHtml(c.detail) + '</small></button>').join('') +
          '</div></div><small>Sem vínculo: selecione Escritório e o tipo Despesa.</small>';
        installModalComboboxes(field.parentElement);
      }
      const form = byId('financialEntryForm');
      if (form) form.reset();
      if (byId('finDateInput')) byId('finDateInput').value = new Date().toISOString().slice(0, 10);
      this.updateModalSummary();
      if (isV2()) {
        lastFocusedElement = documentRef.activeElement;
        previousBodyOverflow = documentRef.body.style.overflow;
        byId('appShell')?.setAttribute('inert', '');
      }
      backdrop.classList.remove('hidden');
      documentRef.body.style.overflow = 'hidden';
      if (isV2()) queueMicrotask(() => (byId('finLinkSearch') || byId('finProcessSelect'))?.focus());
    },

    closeEntryModal() {
      const backdrop = byId('financialEntryBackdrop');
      const wasOpen = backdrop && !backdrop.classList.contains('hidden');
      if (backdrop) backdrop.classList.add('hidden');
      if (isV2()) byId('appShell')?.removeAttribute('inert');
      if (byId('modalBackdrop')?.classList.contains('hidden')) {
        documentRef.body.style.overflow = isV2() ? previousBodyOverflow : '';
      }
      if (isV2() && wasOpen && lastFocusedElement?.isConnected) lastFocusedElement.focus?.();
    },

    handleEntryKeydown(event) {
      if (!isV2() || byId('financialEntryBackdrop')?.classList.contains('hidden')) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        this.closeEntryModal();
        return;
      }
      if (event.key !== 'Tab') return;
      const modal = byId('financialEntryBackdrop')?.querySelector('.financial-entry-modal');
      const focusable = [...(modal?.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])') || [])]
        .filter(element => element.getClientRects().length > 0);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable.at(-1);
      if (event.shiftKey && documentRef.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && documentRef.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    },

    updateModalSummary() {
      const entryType = byId('finTypeSelect')?.value || 'rpv';
      const isExpense = entryType === 'despesa';
      const isInstallment = entryType === 'parcela';
      const isReceipt = entryType === 'recebimento';
      const isDetailEntry = isExpense || isInstallment || isReceipt;
      documentRef.querySelectorAll?.('.financial-detail-only').forEach(element => {
        element.style.display = isDetailEntry ? 'flex' : 'none';
      });
      const statusSelect = byId('finStatusSelect');
      if (statusSelect) {
        const mode = isExpense ? 'expense' : isInstallment ? 'installment' : isReceipt ? 'receipt' : entryType === 'rpv' ? 'requisition' : 'fee';
        if (statusSelect.dataset.mode !== mode) {
          statusSelect.dataset.mode = mode;
          statusSelect.innerHTML = financialStatusOptions(mode);
        }
      }
      const descriptionLabel = byId('finDescriptionLabel');
      const descriptionInput = byId('finDescriptionInput');
      const dateLabel = byId('finDateLabel');
      if (descriptionLabel) descriptionLabel.textContent = isExpense ? 'Descrição da despesa' : isInstallment ? 'Identificação da parcela' : 'Identificação do recebimento';
      if (descriptionInput) descriptionInput.placeholder = isExpense ? 'Ex: preparo recursal' : isInstallment ? 'Ex: parcela 2 de 6' : 'Ex: pagamento via PIX';
      byId('finDescriptionInput')?.setAttribute('list', isExpense ? 'financialExpenseSuggestions' : '');
      if (dateLabel) dateLabel.textContent = isInstallment ? 'Vencimento' : isReceipt ? 'Data do recebimento' : 'Data da despesa';
      const gross = parseFloat(byId('finGrossInput')?.value) || 0;
      const feePct = parseFloat(byId('finFeePctInput')?.value) || 0;
      const fee = isDetailEntry ? 0 : (gross * feePct) / 100;
      const net = isDetailEntry ? 0 : Math.max(0, gross - fee);
      const sumGross = byId('finSumGross');
      const sumFee = byId('finSumFee');
      const sumNet = byId('finSumNet');
      if (sumGross) sumGross.textContent = formatCurrency(gross);
      if (sumFee) sumFee.textContent = isDetailEntry ? (isExpense ? 'Não se aplica' : formatCurrency(gross)) : formatCurrency(fee);
      if (sumNet) sumNet.textContent = isDetailEntry ? 'Não se aplica' : formatCurrency(net);
    },

    async handleEntrySubmit(event) {
      event.preventDefault();
      if (submittingEntry) return;
      submittingEntry = true;
      const form = event.currentTarget;
      const submitButton = form.querySelector?.('button[type="submit"]');
      if (submitButton) submitButton.disabled = true;
      const stateBeforeSubmit = JSON.parse(JSON.stringify(store.state));
      try {
      const data = new FormData(form);
      const processId = data.get('processId');
      const entryType = editingEntry?.type === 'despesa' ? data.get('entryType') : editingEntry?.type || data.get('entryType');
      const status = data.get('status');
      const grossAmount = Number(data.get('grossAmount'));
      const rawFeePercentage = String(data.get('feePercentage') ?? '').trim();
      const feePercentage = rawFeePercentage === '' ? null : Number(rawFeePercentage);
      const description = String(data.get('description') || '').trim();
      const entryDate = String(data.get('entryDate') || '').trim();

      if (!Number.isFinite(grossAmount) || grossAmount < 0) {
        showToast?.('Informe um valor financeiro válido e não negativo.', 'error');
        return;
      }
      if (feePercentage !== null && (!Number.isFinite(feePercentage) || feePercentage < 0 || feePercentage > 100)) {
        showToast?.('O percentual de honorários deve estar entre 0 e 100.', 'error');
        return;
      }

      const officeEntry = processId === 'office';
      const contactId = String(processId || '').startsWith('contact:') ? String(processId).slice(8) : '';
      const contact = contactId ? (store.state.contacts || []).find(item => String(item.id) === contactId) : null;
      const process = officeEntry ? { expenses: store.state.officeExpenses || [] }
        : contact || store.state.processes.find(item => item.id === processId);
      if (officeEntry && entryType !== 'despesa') {
        showToast?.('Para o escritório sem vínculo, selecione Despesa.', 'error'); return;
      }
      if (contact && !['despesa', 'recebimento', 'parcela'].includes(entryType)) {
        showToast?.('Vínculo direto com contato aceita despesas, parcelas e recebimentos. Requisições e contratos exigem processo.', 'error'); return;
      }
      if (!process) {
        showToast?.('Selecione um processo válido para vincular o lançamento.', 'error');
        return;
      }
      if (!allowedFinancialStatuses(entryType).includes(status)) {
        showToast?.('Selecione uma situação compatível com o tipo de lançamento.', 'error');
        return;
      }

      if (editingEntry && editingEntry.type !== 'despesa' && (editingEntry.ownerId !== processId || editingEntry.type !== entryType)) return;
      if (editingEntry?.type === 'despesa' && !['despesa', 'recebimento', 'parcela'].includes(entryType)) return;
      const writeDetail = (collection, entry) => {
        if (!editingEntry) { process[collection].push(entry); return; }
        const source = this.entryOwner(editingEntry.ownerId);
        const originals = source?.[editingEntry.collection];
        const index = originals?.findIndex(item => item.id === editingEntry.id) ?? -1;
        if (index < 0) throw new Error('Lançamento não encontrado. Reabra a lista.');
        const original = originals[index];
        const updated = { ...original, ...entry, id: original.id, createdAt: original.createdAt, updatedAt: new Date().toISOString() };
        if (editingEntry.ownerId === processId && editingEntry.collection === collection) process[collection][index] = updated;
        else {
          originals.splice(index, 1);
          process[collection].push(updated);
          source.updatedAt = source.financialUpdatedAt = updated.updatedAt;
        }
      };
      if (entryType === 'rpv') {
        process.requisitionAmount = grossAmount;
        process.requisitionStatus = status;
      } else if (entryType === 'exito') {
        if (feePercentage === null) {
          showToast?.('Informe o percentual explícito dos honorários de êxito.', 'error');
          return;
        }
        process.feeType = 'exito';
        process.feePercentage = feePercentage;
        process.feeAmount = grossAmount * feePercentage / 100;
        process.feeStatus = status;
      } else if (entryType === 'fixo') {
        process.feeType = 'fixo';
        process.feeAmount = grossAmount;
        process.feeStatus = status;
      } else if (entryType === 'mensal') {
        process.feeType = 'mensal';
        process.feeMonthly = grossAmount;
        process.feeStatus = status;
      } else if (entryType === 'despesa') {
        if (!description) {
          showToast?.('Descreva a despesa para facilitar a prestação de contas.', 'error');
          return;
        }
        process.expenses = Array.isArray(process.expenses) ? process.expenses : [];
        writeDetail('expenses', {
          id: `expense-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          description,
          amount: grossAmount,
          status,
          date: entryDate || new Date().toISOString().slice(0, 10),
          createdAt: new Date().toISOString()
        });
      } else if (entryType === 'parcela') {
        if (!entryDate) {
          showToast?.('Informe o vencimento da parcela de honorários.', 'error');
          return;
        }
        process.feeInstallments = Array.isArray(process.feeInstallments) ? process.feeInstallments : [];
        writeDetail('feeInstallments', {
          id: `installment-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          description: description || `Parcela ${process.feeInstallments.length + 1}`,
          amount: grossAmount,
          status,
          dueDate: entryDate,
          paidAt: isSettledFinancialStatus(status) ? entryDate : '',
          createdAt: new Date().toISOString()
        });
      } else if (entryType === 'recebimento') {
        process.receipts = Array.isArray(process.receipts) ? process.receipts : [];
        writeDetail('receipts', {
          id: `receipt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          description: description || 'Recebimento de honorários',
          amount: grossAmount,
          status: status || 'recebido',
          date: entryDate || new Date().toISOString().slice(0, 10),
          createdAt: new Date().toISOString()
        });
      } else {
        showToast?.('Tipo de lançamento financeiro não reconhecido.', 'error');
        return;
      }
      process.updatedAt = new Date().toISOString();
      process.financialUpdatedAt = process.updatedAt;

      if (officeEntry) store.state.officeExpenses = process.expenses;
      else store.upsert(contact ? 'contacts' : 'processes', process);
      store.audit(editingEntry ? 'Lançamento financeiro atualizado' : 'Lançamento financeiro registrado', `${officeEntry ? 'Escritório' : contact ? 'Contato' : process.number || process.client}: ${formatCurrency(grossAmount)} (${status})`);
      store.save();

      if (!await store.flush()) {
        store.state = stateBeforeSubmit;
        showToast?.('Gravação não confirmada. O lançamento continua aberto para nova tentativa.', 'error');
        return;
      }
      this.closeEntryModal();
      this.render();
      renderDashboardFinancialWidgets?.();
      showToast?.('Lançamento financeiro salvo com sucesso!', 'success');
      } catch (error) {
        store.state = stateBeforeSubmit;
        showToast?.('Não foi possível salvar o lançamento. Reabra a lista e tente novamente.', 'error');
      } finally {
        submittingEntry = false;
        if (submitButton?.isConnected) submitButton.disabled = false;
      }
    }
  };

  return feature;
}

function financialStatusOptions(mode) {
  if (mode === 'expense') return '<option value="pendente">Pendente de pagamento</option><option value="pago">Paga pelo escritório</option><option value="reembolsado">Reembolsada pelo cliente</option>';
  if (mode === 'installment') return '<option value="pendente">Pendente</option><option value="pago">Paga</option>';
  if (mode === 'receipt') return '<option value="recebido">Recebido</option><option value="estornado">Estornado</option>';
  if (mode === 'fee') return '<option value="pendente">Pendente / a receber</option><option value="em_dia">Em dia / regular</option><option value="aguardando_exito">Aguardando êxito processual</option><option value="quitado">Quitado</option>';
  return '<option value="requisitado">Requisitado / Expedido</option><option value="aguardando_deposito">Aguardando Depósito Judicial</option><option value="disponivel_saque">Disponível para Saque / Levantamento</option><option value="repassado">Repassado ao Cliente &amp; Quitado</option>';
}

function allowedFinancialStatuses(entryType) {
  if (entryType === 'despesa') return ['pendente', 'pago', 'reembolsado'];
  if (entryType === 'parcela') return ['pendente', 'pago'];
  if (entryType === 'recebimento') return ['recebido', 'estornado'];
  if (entryType === 'rpv') return ['requisitado', 'aguardando_deposito', 'disponivel_saque', 'repassado'];
  if (['exito', 'fixo', 'mensal'].includes(entryType)) return ['pendente', 'em_dia', 'aguardando_exito', 'quitado'];
  return [];
}

function isSettledFinancialStatus(status) {
  return ['pago', 'paga', 'quitado', 'repassado', 'recebido', 'reembolsado'].includes(String(status || '').toLowerCase());
}

function finiteAmount(value) {
  const amount = Number(value);
  return Number.isFinite(amount) && amount >= 0 ? amount : 0;
}

function isPastDate(value) {
  if (!value) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dueDate = new Date(`${value}T00:00:00`);
  return Number.isFinite(dueDate.getTime()) && dueDate < today;
}
