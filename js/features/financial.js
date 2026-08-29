import { Store } from '../core/store.js';

export function createFinancialFeature({
  store = Store,
  documentRef = globalThis.document,
  normalizeText,
  escapeHtml,
  formatCurrency,
  showToast,
  renderDashboardFinancialWidgets
} = {}) {
  let initialized = false;
  let financialFilter = 'all';
  const byId = id => documentRef?.getElementById(id);

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

      const rows = [];
      processes.forEach(proc => {
        const isPaid = proc.feeStatus === 'pago' || proc.feeStatus === 'quitado' || proc.requisitionStatus === 'repassado' || proc.requisitionStatus === 'pago';

        // Cálculo canônico do RPV / Precatório (BUG-003)
        if (proc.requisitionStatus || proc.requisitionAmount || proc.rpvAmount) {
          rpvCount++;
          const gross = Number(proc.requisitionAmount ?? proc.rpvAmount ?? proc.economicValue ?? 0);
          const feePct = Number(proc.feePercentage ?? 30);
          const feeAmount = proc.feeAmount ? Number(proc.feeAmount) : (gross * feePct / 100);
          const netClient = Math.max(0, gross - feeAmount);
          const statusInfo = FINANCIAL_STATUS_MAP[proc.requisitionStatus] || { label: proc.requisitionStatus || 'Requisitado', chipClass: 'warning', isFinal: false };

          if (!isPaid && !statusInfo.isFinal) {
            totalHonorariosAFaturar += feeAmount;
          }

          if (filter === 'all' || filter === 'rpv') {
            if (!needle || normalizeText(`${proc.number} ${proc.client} ${statusInfo.label}`).includes(needle)) {
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
          if (proc.feeAmount || proc.feeMonthly) {
            const feeVal = Number(proc.feeAmount || proc.feeMonthly || 0);
            if (!isPaid) totalHonorariosAFaturar += feeVal;
            if (!needle || normalizeText(`${proc.number} ${proc.client} ${proc.feeType}`).includes(needle)) {
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
      if (honEl) honEl.textContent = formatCurrency(totalHonorariosAFaturar);
      if (rpvEl) rpvEl.textContent = `${rpvCount} requisições`;

      listEl.innerHTML = rows.length ? rows.join('') : '<tr><td colspan="7" class="empty-table" style="text-align:center;padding:24px;color:var(--muted);">Nenhum lançamento financeiro ou requisição RPV localizada.</td></tr>';
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
      this.updateModalSummary();
      backdrop.classList.remove('hidden');
      documentRef.body.style.overflow = 'hidden';
    },

    closeEntryModal() {
      const backdrop = byId('financialEntryBackdrop');
      if (backdrop) backdrop.classList.add('hidden');
      if (byId('modalBackdrop')?.classList.contains('hidden')) {
        documentRef.body.style.overflow = '';
      }
    },

    updateModalSummary() {
      const gross = parseFloat(byId('finGrossInput')?.value) || 0;
      const feePct = parseFloat(byId('finFeePctInput')?.value) || 0;
      const fee = (gross * feePct) / 100;
      const net = Math.max(0, gross - fee);
      const sumGross = byId('finSumGross');
      const sumFee = byId('finSumFee');
      const sumNet = byId('finSumNet');
      if (sumGross) sumGross.textContent = formatCurrency(gross);
      if (sumFee) sumFee.textContent = formatCurrency(fee);
      if (sumNet) sumNet.textContent = formatCurrency(net);
    },

    async handleEntrySubmit(event) {
      event.preventDefault();
      const form = event.currentTarget;
      const data = new FormData(form);
      const processId = data.get('processId');
      const entryType = data.get('entryType');
      const status = data.get('status');
      const grossAmount = parseFloat(data.get('grossAmount')) || 0;
      const feePercentage = parseFloat(data.get('feePercentage')) || 30;
      const feeAmount = (grossAmount * feePercentage) / 100;

      const process = store.state.processes.find(item => item.id === processId);
      if (!process) {
        showToast?.('Selecione um processo válido para vincular o lançamento.', 'error');
        return;
      }

      process.requisitionAmount = grossAmount;
      process.feePercentage = feePercentage;
      process.feeAmount = feeAmount;
      process.requisitionStatus = status;
      process.feeType = entryType === 'rpv' ? 'RPV / Precatório' : (entryType === 'exito' ? 'Quota Litis' : 'Honorários');
      process.updatedAt = new Date().toISOString();

      store.upsert('processes', process);
      store.audit('Lançamento financeiro registrado', `${process.number || process.client}: ${formatCurrency(grossAmount)} (${status})`);
      store.save();

      if (!await store.flush()) return;
      this.closeEntryModal();
      this.render();
      renderDashboardFinancialWidgets?.();
      showToast?.('Lançamento financeiro salvo com sucesso!', 'success');
    }
  };

  return feature;
}
