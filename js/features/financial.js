import { Store } from '../core/store.js';

export function createFinancialFeature({
  store = Store,
  documentRef = globalThis.document,
  normalizeText,
  escapeHtml,
  formatCurrency,
  showToast,
  renderDashboardFinancialWidgets,
  renderV2Workspace
} = {}) {
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
      byId('newFinancialEntryButton')?.addEventListener('click', () => this.openEntryModal());
      byId('financialEntryClose')?.addEventListener('click', () => this.closeEntryModal());
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
          records: presentationRecords,
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

    openEntryModal() {
      const backdrop = byId('financialEntryBackdrop');
      if (!backdrop) return;
      const select = byId('finProcessSelect');
      const processes = store.state.processes || [];
      if (select) {
        select.innerHTML = '<option value="">Selecione o processo ou cliente...</option>' +
          processes.map(process => `<option value="${escapeHtml(process.id)}">${escapeHtml(process.number || 'S/N')} — ${escapeHtml(process.client || 'Cliente')}</option>`).join('');
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
      if (isV2()) queueMicrotask(() => byId('finProcessSelect')?.focus());
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
      const entryType = data.get('entryType');
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

      const process = store.state.processes.find(item => item.id === processId);
      if (!process) {
        showToast?.('Selecione um processo válido para vincular o lançamento.', 'error');
        return;
      }
      if (!allowedFinancialStatuses(entryType).includes(status)) {
        showToast?.('Selecione uma situação compatível com o tipo de lançamento.', 'error');
        return;
      }

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
        process.expenses.push({
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
        process.feeInstallments.push({
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
        process.receipts.push({
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

      store.upsert('processes', process);
      store.audit('Lançamento financeiro registrado', `${process.number || process.client}: ${formatCurrency(grossAmount)} (${status})`);
      store.save();

      if (!await store.flush()) {
        store.state = stateBeforeSubmit;
        return;
      }
      this.closeEntryModal();
      this.render();
      renderDashboardFinancialWidgets?.();
      showToast?.('Lançamento financeiro salvo com sucesso!', 'success');
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
