export const CIVEL_TOOLS = Object.freeze([
  { id: 'judicial', label: 'Planilha Judicial (Lei 14.905/24)' },
  { id: 'correcao', label: 'Correção e Deflação Reversa' },
  { id: 'amortizacao', label: 'Tabelas PRICE e SAC' },
  { id: 'sfh', label: 'Financiamento SFH (SACRE)' },
  { id: 'tvm', label: 'Equivalência e TVM' },
  { id: 'reajuste', label: 'Reajuste de Aluguel' },
  { id: 'htm', label: 'Importador .HTM Legado' }
]);

export const COMPARE_SERIES_LIST = Object.freeze([
  'IPCA',
  'INPC',
  'IGP-M',
  'IGP-DI',
  'INCC-DI',
  'IPCA-E',
  'IPC-FIPE',
  'TR',
  'SELIC',
  'POUPANCA'
]);

export function renderCivelSubNav(civelSub = 'judicial', escapeHtml) {
  const active = CIVEL_TOOLS.some(t => t.id === civelSub) ? civelSub : 'judicial';
  return `<div class="calc-tabs calc-civel-subtabs" role="tablist" aria-label="Ferramentas de cálculo cível e financeiro">
    ${CIVEL_TOOLS.map(item => `<button type="button" role="tab" aria-selected="${active === item.id}" class="calc-tab${active === item.id ? ' is-active' : ''}" data-calc-action="civel-sub" data-civel-sub="${item.id}">${escapeHtml(item.label)}</button>`).join('')}
  </div>`;
}

function displayMoney(value, formatCurrency) {
  const numeric = Number(String(value ?? '').replace(',', '.'));
  if (!Number.isFinite(numeric)) return String(value ?? '');
  return formatCurrency(numeric);
}

export function renderCivelSuiteForm({ civelSub, suite = {}, catalog = null, icon, escapeHtml, formatCurrency }) {
  const series = Array.isArray(catalog?.series) && catalog.series.length > 0
    ? catalog.series
    : [
        { key: 'IPCA', rotulo: 'IPCA' },
        { key: 'INPC', rotulo: 'INPC' },
        { key: 'IGP-M', rotulo: 'IGP-M' },
        { key: 'IGP-DI', rotulo: 'IGP-DI' },
        { key: 'INCC-DI', rotulo: 'INCC-DI' },
        { key: 'IPCA-E', rotulo: 'IPCA-E' },
        { key: 'IPC-FIPE', rotulo: 'IPC-FIPE' },
        { key: 'TR', rotulo: 'TR' },
        { key: 'SELIC', rotulo: 'SELIC mensal' }
      ];
  const serieOptions = selected => series.map(serie =>
    `<option value="${escapeHtml(serie.key)}"${selected === serie.key ? ' selected' : ''}>${escapeHtml(serie.rotulo)}</option>`).join('');

  if (civelSub === 'correcao') {
    const st = suite.correcao || {};
    return `<form id="calcCivelSuiteForm" class="calc-panel" novalidate>
      <h3>Atualização Monetária e Desatualização Reversa</h3>
      <div class="calc-row">
        <label class="calc-field"><span>Valor nominal (R$)</span>
          <input data-csuite-field="correcao.valor" inputmode="decimal" value="${escapeHtml(st.valor || '10000,00')}" placeholder="10000,00">
        </label>
        <label class="calc-field"><span>Data inicial</span>
          <input data-csuite-field="correcao.dataInicial" type="date" value="${escapeHtml(st.dataInicial || '2024-01-01')}">
        </label>
        <label class="calc-field"><span>Data final (anterior à inicial = reversa)</span>
          <input data-csuite-field="correcao.dataFinal" type="date" value="${escapeHtml(st.dataFinal || '2025-01-01')}">
        </label>
        <label class="calc-field"><span>Índice</span>
          <select data-csuite-field="correcao.serie">${serieOptions(st.serie || 'IPCA')}</select>
        </label>
      </div>
      <div class="calc-row">
        <label class="calc-field"><span>Juros mensais (%)</span>
          <input data-csuite-field="correcao.jurosMensalPct" inputmode="decimal" value="${escapeHtml(st.jurosMensalPct || '0')}" placeholder="0,00">
        </label>
        <label class="calc-field"><span>Capitalização dos juros</span>
          <select data-csuite-field="correcao.capitalizacaoJuros">
            <option value="simples"${st.capitalizacaoJuros !== 'composto' ? ' selected' : ''}>Simples</option>
            <option value="composto"${st.capitalizacaoJuros === 'composto' ? ' selected' : ''}>Composta</option>
          </select>
        </label>
        <label class="calc-field"><span>Multa (%)</span>
          <input data-csuite-field="correcao.multaPct" inputmode="decimal" value="${escapeHtml(st.multaPct || '0')}">
        </label>
        <label class="calc-field"><span>Honorários (%)</span>
          <input data-csuite-field="correcao.honorariosPct" inputmode="decimal" value="${escapeHtml(st.honorariosPct || '0')}">
        </label>
      </div>
      <fieldset class="calc-options">
        <legend class="sr-only">Opções de correção</legend>
        <label class="calc-option">
          <input data-csuite-field="correcao.proRata" type="checkbox"${st.proRata !== false ? ' checked' : ''}>
          <span>Pró-rata por dias corridos no termo inicial e final</span>
        </label>
        <label class="calc-option">
          <input data-csuite-field="correcao.expurgarDeflacao" type="checkbox"${st.expurgarDeflacao ? ' checked' : ''}>
          <span>Expurgar variações negativas (piso zero mensal)</span>
        </label>
        <label class="calc-option">
          <input data-csuite-field="correcao.compararIndices" type="checkbox"${st.compararIndices ? ' checked' : ''}>
          <span>Comparar simultaneamente até 5 índices</span>
        </label>
      </fieldset>
      ${st.compararIndices ? `<div class="calc-compare-grid" role="group" aria-label="Selecionar até 5 índices para comparação">
        ${COMPARE_SERIES_LIST.map(code => {
          const selecionadas = Array.isArray(st.seriesComparadas) ? st.seriesComparadas : ['IPCA', 'INPC', 'IGP-M', 'TR'];
          const checked = selecionadas.includes(code);
          return `<label class="calc-compare-chip"><input type="checkbox" data-csuite-compare-serie="${escapeHtml(code)}"${checked ? ' checked' : ''}><span>${escapeHtml(code === 'POUPANCA' ? 'Poupança' : code)}</span></label>`;
        }).join('')}
      </div>` : ''}
      <div class="calc-actions">
        <button type="button" class="button ghost" data-calc-action="civel-inverter-datas"><span>Inverter datas (Direta / Reversa)</span></button>
        <button type="button" class="button" data-calc-action="civel-suite-calcular"${st.loading ? ' disabled' : ''}>${icon('check')}<span>${st.loading ? 'Calculando...' : 'Calcular correção'}</span></button>
      </div>
      ${st.error ? `<p class="calc-feedback" role="alert">${escapeHtml(st.error)}</p>` : ''}
      <p class="calc-hint">Para deflacionar um valor no tempo (atualização reversa), informe data final anterior à data inicial. O cálculo não abre prazo nem produz ciência.</p>
    </form>`;
  }

  if (civelSub === 'amortizacao') {
    const st = suite.amortizacao || {};
    return `<form id="calcCivelSuiteForm" class="calc-panel" novalidate>
      <h3>Tabelas PRICE e SAC — Amortização Analítica</h3>
      <div class="calc-row">
        <label class="calc-field"><span>Sistema</span>
          <select data-csuite-field="amortizacao.sistema">
            <option value="COMPARATIVO"${st.sistema !== 'PRICE' && st.sistema !== 'SAC' ? ' selected' : ''}>Comparativo PRICE e SAC</option>
            <option value="PRICE"${st.sistema === 'PRICE' ? ' selected' : ''}>Tabela PRICE (Francês)</option>
            <option value="SAC"${st.sistema === 'SAC' ? ' selected' : ''}>Tabela SAC (Constante)</option>
          </select>
        </label>
        <label class="calc-field"><span>Valor do bem / principal (R$)</span>
          <input data-csuite-field="amortizacao.valorBem" inputmode="decimal" value="${escapeHtml(st.valorBem || '100000,00')}">
        </label>
        <label class="calc-field"><span>Entrada (R$)</span>
          <input data-csuite-field="amortizacao.entrada" inputmode="decimal" value="${escapeHtml(st.entrada || '0,00')}">
        </label>
        <label class="calc-field"><span>Tarifas financiadas (R$)</span>
          <input data-csuite-field="amortizacao.tarifasFinanciadas" inputmode="decimal" value="${escapeHtml(st.tarifasFinanciadas || '0,00')}">
        </label>
      </div>
      <div class="calc-row">
        <label class="calc-field"><span>Taxa de juros (%)</span>
          <input data-csuite-field="amortizacao.taxaJuros" inputmode="decimal" value="${escapeHtml(st.taxaJuros || '1,00')}">
        </label>
        <label class="calc-field"><span>Periodicidade da taxa</span>
          <select data-csuite-field="amortizacao.periodicidadeTaxa">
            <option value="mensal"${st.periodicidadeTaxa !== 'anual' && st.periodicidadeTaxa !== 'semestral' ? ' selected' : ''}>Mensal</option>
            <option value="semestral"${st.periodicidadeTaxa === 'semestral' ? ' selected' : ''}>Semestral</option>
            <option value="anual"${st.periodicidadeTaxa === 'anual' ? ' selected' : ''}>Anual</option>
          </select>
        </label>
        <label class="calc-field"><span>Prazo (meses)</span>
          <input data-csuite-field="amortizacao.prazoMeses" inputmode="numeric" value="${escapeHtml(st.prazoMeses || '12')}">
        </label>
        <label class="calc-field"><span>Carência (meses)</span>
          <input data-csuite-field="amortizacao.carenciaMeses" inputmode="numeric" value="${escapeHtml(st.carenciaMeses || '0')}">
        </label>
        <label class="calc-field"><span>Modo de carência</span>
          <select data-csuite-field="amortizacao.modoCarencia">
            <option value="juros_pagos"${st.modoCarencia !== 'juros_capitalizados' ? ' selected' : ''}>Juros pagos na carência</option>
            <option value="juros_capitalizados"${st.modoCarencia === 'juros_capitalizados' ? ' selected' : ''}>Juros capitalizados no saldo</option>
          </select>
        </label>
      </div>
      <div class="calc-actions">
        <button type="button" class="button" data-calc-action="civel-suite-calcular"${st.loading ? ' disabled' : ''}>${icon('check')}<span>${st.loading ? 'Calculando...' : 'Gerar planilha PRICE / SAC'}</span></button>
      </div>
      ${st.error ? `<p class="calc-feedback" role="alert">${escapeHtml(st.error)}</p>` : ''}
      <p class="calc-hint">No sistema SAC, resíduos de centavos são absorvidos na última parcela para encerrar o saldo exatamente em R$ 0,00 dentro do prazo contratado. O cálculo não abre prazo nem produz ciência.</p>
    </form>`;
  }

  if (civelSub === 'sfh') {
    const st = suite.sfh || {};
    return `<form id="calcCivelSuiteForm" class="calc-panel" novalidate>
      <h3>Financiamento Imobiliário SFH — SACRE, SAC e PRICE com TR</h3>
      <div class="calc-row">
        <label class="calc-field"><span>Sistema principal</span>
          <select data-csuite-field="sfh.sistema">
            <option value="SACRE"${st.sistema !== 'SAC' && st.sistema !== 'PRICE' ? ' selected' : ''}>SACRE (Recálculo Anual)</option>
            <option value="SAC"${st.sistema === 'SAC' ? ' selected' : ''}>SAC com TR</option>
            <option value="PRICE"${st.sistema === 'PRICE' ? ' selected' : ''}>PRICE com TR</option>
          </select>
        </label>
        <label class="calc-field"><span>Valor do imóvel (R$)</span>
          <input data-csuite-field="sfh.valorImovel" inputmode="decimal" value="${escapeHtml(st.valorImovel || '120000,00')}">
        </label>
        <label class="calc-field"><span>Valor financiado (R$)</span>
          <input data-csuite-field="sfh.valorFinanciado" inputmode="decimal" value="${escapeHtml(st.valorFinanciado || '120000,00')}">
        </label>
        <label class="calc-field"><span>Juros nominais (% a.a.)</span>
          <input data-csuite-field="sfh.taxaJurosAnualNominalPct" inputmode="decimal" value="${escapeHtml(st.taxaJurosAnualNominalPct || '12,00')}">
        </label>
        <label class="calc-field"><span>TR mensal projetada (%)</span>
          <input data-csuite-field="sfh.trMensalPct" inputmode="decimal" value="${escapeHtml(st.trMensalPct || '0,50')}">
        </label>
      </div>
      <div class="calc-row">
        <label class="calc-field"><span>Prazo (anos)</span>
          <input data-csuite-field="sfh.prazoAnos" inputmode="numeric" value="${escapeHtml(st.prazoAnos || '10')}">
        </label>
        <label class="calc-field"><span>Ciclo de recálculo (meses)</span>
          <input data-csuite-field="sfh.cicloRecalculoMeses" inputmode="numeric" value="${escapeHtml(st.cicloRecalculoMeses || '12')}">
        </label>
        <label class="calc-field"><span>Seguro MIP (% a.m. s/ saldo)</span>
          <input data-csuite-field="sfh.mipPctMensal" inputmode="decimal" value="${escapeHtml(st.mipPctMensal || '0,00')}">
        </label>
        <label class="calc-field"><span>Seguro DFI (% a.m. s/ imóvel)</span>
          <input data-csuite-field="sfh.dfiPctMensal" inputmode="decimal" value="${escapeHtml(st.dfiPctMensal || '0,00')}">
        </label>
        <label class="calc-field"><span>Taxa de administração (R$/mês)</span>
          <input data-csuite-field="sfh.taxaAdministracaoMensal" inputmode="decimal" value="${escapeHtml(st.taxaAdministracaoMensal || '0,00')}">
        </label>
      </div>
      <fieldset class="calc-options">
        <legend class="sr-only">Critério de arredondamento SFH</legend>
        <label class="calc-option">
          <input data-csuite-field="sfh.usarArredondamentoBancario" type="checkbox"${st.usarArredondamentoBancario !== false ? ' checked' : ''}>
          <span>Arredondamento bancário padrão SFH/Caixa (half-down em 2 casas decimais)</span>
        </label>
      </fieldset>
      <div class="calc-actions">
        <button type="button" class="button" data-calc-action="civel-suite-calcular"${st.loading ? ' disabled' : ''}>${icon('check')}<span>${st.loading ? 'Calculando...' : 'Calcular financiamento SFH'}</span></button>
      </div>
      ${st.error ? `<p class="calc-feedback" role="alert">${escapeHtml(st.error)}</p>` : ''}
      <p class="calc-hint">Compara simultaneamente SACRE, SAC e PRICE sob atualização pela TR e encargos acessórios. O cálculo não abre prazo nem produz ciência.</p>
    </form>`;
  }

  if (civelSub === 'tvm') {
    const st = suite.tvm || {};
    return `<form id="calcCivelSuiteForm" class="calc-panel" novalidate>
      <h3>Equivalência de Taxas (7 Bases) e Solver TVM</h3>
      <div class="calc-row">
        <label class="calc-field"><span>Taxa base para equivalência (%)</span>
          <input data-csuite-field="tvm.ratePct" inputmode="decimal" value="${escapeHtml(st.ratePct || '1,00')}">
        </label>
        <label class="calc-field"><span>Período da taxa base</span>
          <select data-csuite-field="tvm.basis">
            <option value="dia_360"${st.basis === 'dia_360' ? ' selected' : ''}>Dia (ano comercial 360d)</option>
            <option value="dia_365"${st.basis === 'dia_365' ? ' selected' : ''}>Dia (ano civil 365d)</option>
            <option value="dia_252"${st.basis === 'dia_252' ? ' selected' : ''}>Dia útil (252 d.u./ano)</option>
            <option value="mes"${!st.basis || st.basis === 'mes' ? ' selected' : ''}>Mês (30 dias)</option>
            <option value="trimestre"${st.basis === 'trimestre' ? ' selected' : ''}>Trimestre (90 dias)</option>
            <option value="semestre"${st.basis === 'semestre' ? ' selected' : ''}>Semestre (180 dias)</option>
            <option value="ano"${st.basis === 'ano' ? ' selected' : ''}>Ano (12 meses / 360d)</option>
          </select>
        </label>
        <label class="calc-field"><span>Incógnita do Solver TVM</span>
          <select data-csuite-field="tvm.solveFor">
            <option value="pmt"${!st.solveFor || st.solveFor === 'pmt' ? ' selected' : ''}>Prestação periódica (PMT)</option>
            <option value="fv"${st.solveFor === 'fv' ? ' selected' : ''}>Valor futuro (FV)</option>
            <option value="pv"${st.solveFor === 'pv' ? ' selected' : ''}>Valor presente (PV)</option>
            <option value="rate"${st.solveFor === 'rate' ? ' selected' : ''}>Taxa periódica (%)</option>
            <option value="nper"${st.solveFor === 'nper' ? ' selected' : ''}>Prazo / Nº de períodos (n)</option>
          </select>
        </label>
        <label class="calc-field"><span>Regime / vencimento</span>
          <select data-csuite-field="tvm.timing">
            <option value="vencido"${st.timing !== 'antecipado' ? ' selected' : ''}>Postecipado (vencido)</option>
            <option value="antecipado"${st.timing === 'antecipado' ? ' selected' : ''}>Antecipado (entrada no ato)</option>
          </select>
        </label>
        <label class="calc-field"><span>Capitalização (Solver TVM)</span>
          <select data-csuite-field="tvm.capitalizacao">
            <option value="composto"${st.capitalizacao !== 'simples' ? ' selected' : ''}>Composta (exponencial)</option>
            <option value="simples"${st.capitalizacao === 'simples' ? ' selected' : ''}>Simples (linear)</option>
          </select>
        </label>
      </div>
      <div class="calc-row">
        <label class="calc-field"><span>Valor presente — PV (R$)</span>
          <input data-csuite-field="tvm.pv" inputmode="decimal" value="${escapeHtml(st.pv || '100000,00')}">
        </label>
        <label class="calc-field"><span>Valor futuro — FV (R$)</span>
          <input data-csuite-field="tvm.fv" inputmode="decimal" value="${escapeHtml(st.fv || '0,00')}">
        </label>
        <label class="calc-field"><span>Prestação — PMT (R$ · 0 p/ único)</span>
          <input data-csuite-field="tvm.pmt" inputmode="decimal" value="${escapeHtml(st.pmt || '8884,88')}">
        </label>
        <label class="calc-field"><span>Taxa periódica TVM (%)</span>
          <input data-csuite-field="tvm.tvmRatePct" inputmode="decimal" value="${escapeHtml(st.tvmRatePct || '1,00')}">
        </label>
        <label class="calc-field"><span>Nº de períodos (n)</span>
          <input data-csuite-field="tvm.nper" inputmode="decimal" value="${escapeHtml(st.nper || '12')}">
        </label>
      </div>
      <div class="calc-actions">
        <button type="button" class="button" data-calc-action="civel-suite-calcular"${st.loading ? ' disabled' : ''}>${icon('check')}<span>${st.loading ? 'Calculando...' : 'Calcular equivalência e TVM'}</span></button>
      </div>
      ${st.error ? `<p class="calc-feedback" role="alert">${escapeHtml(st.error)}</p>` : ''}
      <p class="calc-hint">Converte taxas equivalentes nas 7 bases temporais (composta e simples) e resolve a variável selecionada da série de pagamentos. O cálculo não abre prazo nem produz ciência.</p>
    </form>`;
  }

  if (civelSub === 'reajuste') {
    const st = suite.reajuste || {};
    return `<form id="calcCivelSuiteForm" class="calc-panel" novalidate>
      <h3>Planilha Demonstrativa de Reajuste de Aluguéis e Contratos</h3>
      <div class="calc-row">
        <label class="calc-field"><span>Aluguel / valor inicial (R$)</span>
          <input data-csuite-field="reajuste.valorInicial" inputmode="decimal" value="${escapeHtml(st.valorInicial || '3000,00')}">
        </label>
        <label class="calc-field"><span>Índice contratual</span>
          <select data-csuite-field="reajuste.serie">${serieOptions(st.serie || 'IGP-M')}</select>
        </label>
        <label class="calc-field"><span>Competência inicial</span>
          <input data-csuite-field="reajuste.competenciaInicio" type="month" value="${escapeHtml(st.competenciaInicio || '2024-09')}">
        </label>
        <label class="calc-field"><span>Até competência</span>
          <input data-csuite-field="reajuste.competenciaFim" type="month" value="${escapeHtml(st.competenciaFim || '2026-08')}">
        </label>
        <label class="calc-field"><span>Periodicidade (meses)</span>
          <input data-csuite-field="reajuste.periodicidadeMeses" inputmode="numeric" value="${escapeHtml(st.periodicidadeMeses || '12')}">
        </label>
      </div>
      <fieldset class="calc-options">
        <legend class="sr-only">Proteção contra deflação</legend>
        <label class="calc-option">
          <input data-csuite-field="reajuste.congelarDeflacao" type="checkbox"${st.congelarDeflacao !== false ? ' checked' : ''}>
          <span>Cláusula de piso contratual (manter valor nominal quando o ciclo acumular variação negativa)</span>
        </label>
      </fieldset>
      <div class="calc-actions">
        <button type="button" class="button" data-calc-action="civel-suite-calcular"${st.loading ? ' disabled' : ''}>${icon('check')}<span>${st.loading ? 'Calculando...' : 'Calcular ciclos de reajuste'}</span></button>
      </div>
      ${st.error ? `<p class="calc-feedback" role="alert">${escapeHtml(st.error)}</p>` : ''}
      <p class="calc-hint">Apura todos os ciclos fechados do contrato e gera minuta pronta de notificação locatícia. O cálculo não abre prazo nem produz ciência.</p>
    </form>`;
  }

  if (civelSub === 'htm') {
    const st = suite.htm || {};
    const diag = st.diagnostico || null;
    const rows = Array.isArray(diag?.extractedItems)
      ? diag.extractedItems.map(item => `<tr>
          <td>${escapeHtml(item.especie)}</td>
          <td>${escapeHtml(item.data)}</td>
          <td>${escapeHtml(item.descricao)}</td>
          <td class="calc-money">${escapeHtml(displayMoney(item.valor, formatCurrency))}</td>
        </tr>`).join('')
      : '';
    return `<section class="calc-panel" aria-label="Importador de planilhas HTML legadas">
      <h3>Auditor e Importador de Planilhas Salvas (.HTM / .HTML)</h3>
      <p class="calc-hint">Repara referências <code>http://</code> quebradas em planilhas salvas antes de 01/06/2023 (migração SSL/HTTPS) e extrai automaticamente as parcelas com data e valor para a Planilha Judicial.</p>
      <label class="calc-field"><span>Carregar arquivo .htm / .html do computador</span>
        <input type="file" accept=".htm,.html,text/html" data-csuite-htm-file>
      </label>
      <label class="calc-field"><span>Conteúdo HTML da planilha salva</span>
        <textarea data-csuite-field="htm.rawHtml" rows="6" placeholder="Cole aqui o código HTML do arquivo .htm salvo">${escapeHtml(st.rawHtml || '')}</textarea>
      </label>
      <div class="calc-actions">
        <button type="button" class="button ghost" data-calc-action="civel-htm-exemplo"><span>Carregar exemplo legado pré-2023</span></button>
        <button type="button" class="button" data-calc-action="civel-suite-calcular"${st.loading ? ' disabled' : ''}>${icon('check')}<span>${st.loading ? 'Analisando...' : 'Analisar planilha .HTM'}</span></button>
        ${diag?.repairedHtml ? `<button type="button" class="button ghost" data-calc-action="civel-htm-baixar">${icon('download')}<span>Baixar .htm reparado</span></button>` : ''}
        ${diag?.extractedItems?.length ? `<button type="button" class="button gold" data-calc-action="civel-htm-importar">${icon('add')}<span>Enviar ${diag.extractedItems.length} item(ns) para Planilha Judicial</span></button>` : ''}
      </div>
      ${st.error ? `<p class="calc-feedback" role="alert">${escapeHtml(st.error)}</p>` : ''}
      ${diag ? `<div class="calc-summary" aria-live="polite">
        <div class="calc-tile"><span>Título identificado</span><strong>${escapeHtml(diag.pageTitle || 'Planilha')}</strong></div>
        <div class="calc-tile"><span>Links HTTP legados</span><strong>${diag.detectedHttpLegacyUrls}</strong></div>
        <div class="calc-tile is-total"><span>Itens extraídos</span><strong>${diag.extractedItems.length}</strong></div>
      </div>
      ${Array.isArray(diag.avisos) && diag.avisos.length > 0 ? `<ul class="calc-memoria-lista">${diag.avisos.map(a => `<li>${escapeHtml(a)}</li>`).join('')}</ul>` : ''}
      ${rows ? `<div class="calc-result-table"><table><thead><tr><th scope="col">Espécie</th><th scope="col">Data</th><th scope="col">Descrição</th><th scope="col" class="calc-money">Valor</th></tr></thead><tbody>${rows}</tbody></table></div>` : ''}` : ''}
    </section>`;
  }

  return '';
}

export function renderCivelSuiteResult(result, escapeHtml, formatCurrency) {
  if (!result || typeof result !== 'object') return '';

  if (result.modalidade === 'correcao_monetaria') {
    const r = result.resumo || {};
    const passos = (result.passos || []).map(p => `<tr>
      <td>${escapeHtml(p.periodo)}</td>
      <td class="calc-money">${p.diasCobertos}/${p.diasNoMes}</td>
      <td class="calc-money">${escapeHtml(p.variacaoMensalPct)}%</td>
      <td class="calc-money">${escapeHtml(p.variacaoAplicadaPct)}%</td>
      <td class="calc-money">${escapeHtml(p.fatorAcumulado)}</td>
    </tr>`).join('');
    const compRows = Array.isArray(result.comparativo)
      ? `<h3>Comparativo entre Índices</h3>
        <div class="calc-result-table"><table><thead><tr><th scope="col">Série</th><th scope="col" class="calc-money">Fator</th><th scope="col" class="calc-money">Variação (%)</th><th scope="col" class="calc-money">Valor corrigido</th></tr></thead><tbody>
        ${result.comparativo.map(c => `<tr><td>${escapeHtml(c.serie)}</td><td class="calc-money">${escapeHtml(c.ok ? c.fator : '—')}</td><td class="calc-money">${escapeHtml(c.ok ? `${c.percentual}%` : c.erro)}</td><td class="calc-money">${escapeHtml(c.ok ? displayMoney(c.valorCorrigido, formatCurrency) : '—')}</td></tr>`).join('')}
        </tbody></table></div>`
      : '';
    return `<h3>Resumo (${result.direcao === 'reversa' ? 'Desatualização Reversa' : 'Atualização Monetária'} · ${escapeHtml(result.serie)})</h3>
      <div class="calc-summary" aria-live="polite">
        <div class="calc-tile"><span>Valor nominal</span><strong>${escapeHtml(displayMoney(r.valorOriginal, formatCurrency))}</strong></div>
        <div class="calc-tile"><span>Fator (${result.diasCorridos} dias)</span><strong>${escapeHtml(r.fatorCorrecao)} (${escapeHtml(r.percentualCorrecao)}%)</strong></div>
        <div class="calc-tile"><span>Valor corrigido</span><strong>${escapeHtml(displayMoney(r.valorCorrigido, formatCurrency))}</strong></div>
        <div class="calc-tile"><span>Juros / Multa / Hon.</span><strong>${escapeHtml(displayMoney(r.juros, formatCurrency))} · ${escapeHtml(displayMoney(r.multa, formatCurrency))} · ${escapeHtml(displayMoney(r.honorarios, formatCurrency))}</strong></div>
        <div class="calc-tile is-total"><span>Total</span><strong>${escapeHtml(displayMoney(r.total, formatCurrency))}</strong></div>
      </div>
      ${compRows}
      <h3>Evolução Mensal</h3>
      <div class="calc-result-table"><table><thead><tr><th scope="col">Competência</th><th scope="col" class="calc-money">Dias</th><th scope="col" class="calc-money">Índice mês</th><th scope="col" class="calc-money">Aplicado</th><th scope="col" class="calc-money">Fator acum.</th></tr></thead><tbody>${passos}</tbody></table></div>`;
  }

  if (result.modalidade === 'amortizacao_price_sac') {
    const r = result.resumo || {};
    const comp = result.comparativo;
    const rows = (result.cronograma || []).map(row => `<tr>
      <td>${row.parcela}</td>
      <td>${escapeHtml(row.fase === 'carencia' ? 'Carência' : 'Amortização')}</td>
      <td class="calc-money">${escapeHtml(displayMoney(row.saldoInicial, formatCurrency))}</td>
      <td class="calc-money">${escapeHtml(displayMoney(row.juros, formatCurrency))}</td>
      <td class="calc-money">${escapeHtml(displayMoney(row.amortizacao, formatCurrency))}</td>
      <td class="calc-money"><strong>${escapeHtml(displayMoney(row.prestacao, formatCurrency))}</strong></td>
      <td class="calc-money">${escapeHtml(displayMoney(row.saldoFinal, formatCurrency))}</td>
    </tr>`).join('');
    return `<h3>Resumo (${escapeHtml(result.sistemaAtivo)})</h3>
      <div class="calc-summary" aria-live="polite">
        <div class="calc-tile"><span>Capital financiado</span><strong>${escapeHtml(displayMoney(r.valorFinanciadoBase, formatCurrency))}</strong></div>
        <div class="calc-tile"><span>1ª / Última prestação</span><strong>${escapeHtml(displayMoney(r.primeiraPrestacao, formatCurrency))} · ${escapeHtml(displayMoney(r.ultimaPrestacao, formatCurrency))}</strong></div>
        <div class="calc-tile"><span>Taxa mensal / CET</span><strong>${escapeHtml(r.taxaMensalEfetivaPct)}% · CET ${escapeHtml(r.cetSimplificadoMensalPct)}%</strong></div>
        <div class="calc-tile"><span>Total de juros</span><strong>${escapeHtml(displayMoney(r.totalJuros, formatCurrency))}</strong></div>
        <div class="calc-tile"><span>Economia no SAC</span><strong>${escapeHtml(displayMoney(r.economiaJurosSac, formatCurrency))}</strong></div>
        <div class="calc-tile is-total"><span>Total pago</span><strong>${escapeHtml(displayMoney(r.total, formatCurrency))}</strong></div>
      </div>
      ${comp ? `<h3>Comparativo PRICE × SAC</h3>
      <div class="calc-result-table"><table><thead><tr><th scope="col">Sistema</th><th scope="col" class="calc-money">1ª Prestação</th><th scope="col" class="calc-money">Última</th><th scope="col" class="calc-money">Total Juros</th><th scope="col" class="calc-money">Total Pago</th></tr></thead><tbody>
        <tr><td>PRICE</td><td class="calc-money">${escapeHtml(displayMoney(comp.price.resumo.primeiraPrestacao, formatCurrency))}</td><td class="calc-money">${escapeHtml(displayMoney(comp.price.resumo.ultimaPrestacao, formatCurrency))}</td><td class="calc-money">${escapeHtml(displayMoney(comp.price.resumo.totalJuros, formatCurrency))}</td><td class="calc-money">${escapeHtml(displayMoney(comp.price.resumo.total, formatCurrency))}</td></tr>
        <tr><td>SAC</td><td class="calc-money">${escapeHtml(displayMoney(comp.sac.resumo.primeiraPrestacao, formatCurrency))}</td><td class="calc-money">${escapeHtml(displayMoney(comp.sac.resumo.ultimaPrestacao, formatCurrency))}</td><td class="calc-money">${escapeHtml(displayMoney(comp.sac.resumo.totalJuros, formatCurrency))}</td><td class="calc-money">${escapeHtml(displayMoney(comp.sac.resumo.total, formatCurrency))}</td></tr>
      </tbody></table></div>` : ''}
      <h3>Cronograma Analítico (${escapeHtml(result.sistemaAtivo)})</h3>
      <div class="calc-result-table"><table><thead><tr><th scope="col">#</th><th scope="col">Fase</th><th scope="col" class="calc-money">Saldo inicial</th><th scope="col" class="calc-money">Juros</th><th scope="col" class="calc-money">Amortização</th><th scope="col" class="calc-money">Prestação</th><th scope="col" class="calc-money">Saldo final</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  }

  if (result.modalidade === 'financiamento_sfh') {
    const r = result.resumo || {};
    const comp = result.comparativo;
    const rows = (result.cronograma || []).map(row => `<tr>
      <td>${row.mes} (${row.anoContrato}ºa)</td>
      <td class="calc-money"><strong>${escapeHtml(displayMoney(row.prestacaoTotal, formatCurrency))}</strong></td>
      <td class="calc-money">${escapeHtml(displayMoney(row.amortizacao, formatCurrency))}</td>
      <td class="calc-money">${escapeHtml(displayMoney(row.juros, formatCurrency))}</td>
      <td class="calc-money">${escapeHtml(displayMoney(row.correcaoTr, formatCurrency))}</td>
      <td class="calc-money">${escapeHtml(displayMoney(row.saldoDevedorFinal, formatCurrency))}</td>
    </tr>`).join('');
    return `<h3>Resumo Financiamento Imobiliário SFH (${escapeHtml(result.sistemaAtivo)})</h3>
      <div class="calc-summary" aria-live="polite">
        <div class="calc-tile"><span>Financiado (LTV ${escapeHtml(r.ltvPct)}%)</span><strong>${escapeHtml(displayMoney(r.valorFinanciado, formatCurrency))}</strong></div>
        <div class="calc-tile"><span>1ª / Maior prestação</span><strong>${escapeHtml(displayMoney(r.primeiraPrestacaoTotal, formatCurrency))} · ${escapeHtml(displayMoney(r.maiorPrestacaoTotal, formatCurrency))}</strong></div>
        <div class="calc-tile"><span>Última prestação</span><strong>${escapeHtml(displayMoney(r.ultimaPrestacaoTotal, formatCurrency))}</strong></div>
        <div class="calc-tile"><span>Total Juros / TR</span><strong>${escapeHtml(displayMoney(r.totalJuros, formatCurrency))} · TR ${escapeHtml(displayMoney(r.totalCorrecaoTr, formatCurrency))}</strong></div>
        <div class="calc-tile is-total"><span>Total pago (${result.prazoMeses}m)</span><strong>${escapeHtml(displayMoney(r.total, formatCurrency))}</strong></div>
      </div>
      ${comp ? `<h3>Comparativo Triplo SFH (SACRE × SAC × PRICE)</h3>
      <div class="calc-result-table"><table><thead><tr><th scope="col">Sistema</th><th scope="col" class="calc-money">1ª Prestação</th><th scope="col" class="calc-money">Maior</th><th scope="col" class="calc-money">Última</th><th scope="col" class="calc-money">Total Juros</th><th scope="col" class="calc-money">Total Geral</th></tr></thead><tbody>
        ${['sacre', 'sac', 'price'].map(k => {
          const sr = comp[k]?.resumo || {};
          return `<tr><td>${k.toUpperCase()}</td><td class="calc-money">${escapeHtml(displayMoney(sr.primeiraPrestacaoTotal, formatCurrency))}</td><td class="calc-money">${escapeHtml(displayMoney(sr.maiorPrestacaoTotal, formatCurrency))}</td><td class="calc-money">${escapeHtml(displayMoney(sr.ultimaPrestacaoTotal, formatCurrency))}</td><td class="calc-money">${escapeHtml(displayMoney(sr.totalJuros, formatCurrency))}</td><td class="calc-money">${escapeHtml(displayMoney(sr.total, formatCurrency))}</td></tr>`;
        }).join('')}
      </tbody></table></div>` : ''}
      <h3>Planilha Analítica SFH (${escapeHtml(result.sistemaAtivo)})</h3>
      <div class="calc-result-table"><table><thead><tr><th scope="col">Mês</th><th scope="col" class="calc-money">Prestação</th><th scope="col" class="calc-money">Amortização</th><th scope="col" class="calc-money">Juros</th><th scope="col" class="calc-money">Correção TR</th><th scope="col" class="calc-money">Saldo devedor</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  }

  if (result.modalidade === 'juros_tvm') {
    const eqComp = result.equivalencia?.composto?.equivalents || [];
    const eqSimp = result.equivalencia?.simples?.equivalents || [];
    const tvm = result.tvm;
    const eqRows = eqComp.map((row, idx) => `<tr>
      <td>${escapeHtml(row.label)}</td>
      <td class="calc-money">${escapeHtml(row.ratePct)}%</td>
      <td class="calc-money">${escapeHtml(eqSimp[idx]?.ratePct || '—')}%</td>
    </tr>`).join('');
    return `<h3>Equivalência de Taxas e Solver TVM (${tvm?.capitalizacao === 'simples' ? 'Simples' : 'Composta'})</h3>
      ${tvm ? `<div class="calc-summary" aria-live="polite">
        <div class="calc-tile"><span>Incógnita / Capitalização</span><strong>${escapeHtml(String(tvm.solvedField || '').toUpperCase())} · ${escapeHtml(tvm.capitalizacao === 'simples' ? 'Simples' : 'Composta')}</strong></div>
        <div class="calc-tile"><span>Valor presente (PV)</span><strong>${escapeHtml(displayMoney(tvm.pv, formatCurrency))}</strong></div>
        <div class="calc-tile"><span>Prestação (PMT)</span><strong>${escapeHtml(displayMoney(tvm.pmt, formatCurrency))}</strong></div>
        <div class="calc-tile"><span>Valor futuro (FV)</span><strong>${escapeHtml(displayMoney(tvm.fv, formatCurrency))}</strong></div>
        <div class="calc-tile"><span>Taxa / Prazo</span><strong>${escapeHtml(tvm.ratePct)}% · ${escapeHtml(tvm.nper)} períodos</strong></div>
        <div class="calc-tile is-total"><span>Juros estimados</span><strong>${escapeHtml(displayMoney(tvm.totalJurosEstimado, formatCurrency))}</strong></div>
      </div>` : ''}
      <h3>Tabela de Equivalência (7 Bases Temporais)</h3>
      <div class="calc-result-table"><table><thead><tr><th scope="col">Base temporal</th><th scope="col" class="calc-money">Capitalização Composta</th><th scope="col" class="calc-money">Capitalização Simples</th></tr></thead><tbody>${eqRows}</tbody></table></div>`;
  }

  if (result.modalidade === 'reajuste_aluguel') {
    const r = result.resumo || {};
    const rows = (result.ciclos || []).map(c => `<tr>
      <td>${c.ciclo}º</td>
      <td>${escapeHtml(c.deCompetencia)} a ${escapeHtml(c.ateCompetencia)}</td>
      <td class="calc-money">${escapeHtml(displayMoney(c.valorAnterior, formatCurrency))}</td>
      <td class="calc-money">${escapeHtml(c.percentualCiclo)}%${c.deflacaoCongelada ? ' (piso 0%)' : ''}</td>
      <td class="calc-money"><strong>${escapeHtml(displayMoney(c.valorReajustado, formatCurrency))}</strong></td>
    </tr>`).join('');
    return `<h3>Resumo do Reajuste Locatício (${escapeHtml(result.serie)})</h3>
      <div class="calc-summary" aria-live="polite">
        <div class="calc-tile"><span>Aluguel inicial</span><strong>${escapeHtml(displayMoney(r.valorInicial, formatCurrency))}</strong></div>
        <div class="calc-tile"><span>Variação acumulada</span><strong>${escapeHtml(r.percentualAcumuladoTotal)}% (fator ${escapeHtml(r.fatorAcumuladoTotal)})</strong></div>
        <div class="calc-tile is-total"><span>Aluguel atualizado</span><strong>${escapeHtml(displayMoney(r.valorAtual, formatCurrency))}</strong></div>
      </div>
      <h3>Evolução por Ciclo Contratual</h3>
      <div class="calc-result-table"><table><thead><tr><th scope="col">Ciclo</th><th scope="col">Período</th><th scope="col" class="calc-money">Valor anterior</th><th scope="col" class="calc-money">Variação</th><th scope="col" class="calc-money">Valor reajustado</th></tr></thead><tbody>${rows}</tbody></table></div>
      <h3>Minuta de Notificação</h3>
      <div class="calc-actions">
        <button type="button" class="button ghost" data-calc-action="civel-copiar-notificacao"><span>Copiar minuta de notificação</span></button>
      </div>
      <pre class="calc-resultado-json">${escapeHtml(result.notificacaoTexto || '')}</pre>`;
  }

  return '';
}

function moneyOut(value, formatCurrency) {
  const formatted = displayMoney(value, formatCurrency);
  return String(formatted ?? value ?? '');
}

function csvCell(value) {
  const s = String(value ?? '');
  return /[;"\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function decBr(value) {
  return String(value ?? '').replace('.', ',');
}

export function buildCivelSummaryText(result, formatCurrency = v => `R$ ${Number(v).toFixed(2).replace('.', ',')}`) {
  if (!result || typeof result !== 'object') return '';
  if (result.modalidade === 'correcao_monetaria') {
    const r = result.resumo || {};
    return [
      `MEMÓRIA DE ATUALIZAÇÃO MONETÁRIA (${result.direcao === 'reversa' ? 'DESATUALIZAÇÃO REVERSA' : 'DIRETA'} · ${result.serie})`,
      `Período: ${result.dataInicial} a ${result.dataFinal} (${result.diasCorridos} dias)`,
      `Valor nominal: ${moneyOut(r.valorOriginal, formatCurrency)}`,
      `Fator acumulado: ${r.fatorCorrecao} (${r.percentualCorrecao}%)`,
      `Valor corrigido: ${moneyOut(r.valorCorrigido, formatCurrency)}`,
      `Juros: ${moneyOut(r.juros, formatCurrency)} · Multa: ${moneyOut(r.multa, formatCurrency)} · Honorários: ${moneyOut(r.honorarios, formatCurrency)}`,
      `Total consolidado: ${moneyOut(r.total, formatCurrency)}`
    ].join('\n');
  }
  if (result.modalidade === 'amortizacao_price_sac') {
    const r = result.resumo || {};
    return [
      `MEMÓRIA DE AMORTIZAÇÃO (${result.sistemaAtivo})`,
      `Capital financiado: ${moneyOut(r.valorFinanciadoBase, formatCurrency)} · Prazo: ${result.prazoMeses || result.cronograma?.length || 0} meses`,
      `1ª prestação: ${moneyOut(r.primeiraPrestacao, formatCurrency)} · Última prestação: ${moneyOut(r.ultimaPrestacao, formatCurrency)}`,
      `Total de juros: ${moneyOut(r.totalJuros, formatCurrency)} · Economia SAC: ${moneyOut(r.economiaJurosSac, formatCurrency)}`,
      `Total pago: ${moneyOut(r.total, formatCurrency)}`
    ].join('\n');
  }
  if (result.modalidade === 'financiamento_sfh') {
    const r = result.resumo || {};
    return [
      `MEMÓRIA FINANCIAMENTO IMOBILIÁRIO SFH (${result.sistemaAtivo})`,
      `Valor financiado: ${moneyOut(r.valorFinanciado, formatCurrency)} (LTV ${r.ltvPct}%) · Prazo: ${result.prazoMeses} meses`,
      `1ª prestação: ${moneyOut(r.primeiraPrestacaoTotal, formatCurrency)} · Maior: ${moneyOut(r.maiorPrestacaoTotal, formatCurrency)} · Última: ${moneyOut(r.ultimaPrestacaoTotal, formatCurrency)}`,
      `Total juros: ${moneyOut(r.totalJuros, formatCurrency)} · Total TR: ${moneyOut(r.totalCorrecaoTr, formatCurrency)}`,
      `Total pago: ${moneyOut(r.total, formatCurrency)}`
    ].join('\n');
  }
  if (result.modalidade === 'juros_tvm') {
    const t = result.tvm || {};
    const linhas = ['EQUIVALÊNCIA DE TAXAS E SOLVER TVM'];
    if (result.tvm) {
      linhas.push(`Capitalização: ${t.capitalizacao === 'simples' ? 'Simples' : 'Composta'} · Incógnita: ${String(t.solvedField || '').toUpperCase()}`);
      linhas.push(`PV: ${moneyOut(t.pv, formatCurrency)} · PMT: ${moneyOut(t.pmt, formatCurrency)} · FV: ${moneyOut(t.fv, formatCurrency)} · Taxa: ${t.ratePct}% · Períodos: ${t.nper}`);
    }
    return linhas.join('\n');
  }
  if (result.modalidade === 'reajuste_aluguel') {
    return String(result.notificacaoTexto || '');
  }
  const r = result.resumo || {};
  const lines = [
    `DEMONSTRATIVO DE CÁLCULO CÍVEL (ATUALIZADO ATÉ ${result.atualizacaoAte || ''})`,
    `Débitos atualizados: ${moneyOut(r.debitosAtualizados, formatCurrency)}`,
    `Juros moratórios: ${moneyOut(r.juros, formatCurrency)}`,
    ...(r.jurosCompensatorios ? [`Juros compensatórios: ${moneyOut(r.jurosCompensatorios, formatCurrency)}`] : []),
    ...(Number(r.custasDespesas || 0) > 0 ? [`Custas/Despesas: ${moneyOut(r.custasDespesas, formatCurrency)}`] : []),
    ...(Number(r.multa || 0) > 0 ? [`Multa: ${moneyOut(r.multa, formatCurrency)}`] : []),
    ...(r.multaContratual ? [`Multa contratual: ${moneyOut(r.multaContratual, formatCurrency)}`] : []),
    ...(r.multaArt523 ? [`Multa art. 523 §1º CPC: ${moneyOut(r.multaArt523, formatCurrency)}`] : []),
    ...(r.honorariosArt523 ? [`Honorários art. 523 §1º CPC: ${moneyOut(r.honorariosArt523, formatCurrency)}`] : []),
    ...(Number(r.honorarios || 0) > 0 ? [`Honorários: ${moneyOut(r.honorarios, formatCurrency)}`] : []),
    ...(r.custasFinais ? [`Custas finais: ${moneyOut(r.custasFinais, formatCurrency)}`] : []),
    ...(Number(r.abatimentos || 0) > 0 ? [`Abatimentos: -${moneyOut(r.abatimentos, formatCurrency)}`] : []),
    `Total consolidado: ${moneyOut(r.total, formatCurrency)}`
  ];
  if (Array.isArray(result.itens) && result.itens.length > 0) {
    lines.push('', 'Itens:');
    result.itens.forEach((it, idx) => {
      lines.push(`${idx + 1}. [${it.especie}] ${it.descricao || it.id} (${it.data}): Original ${moneyOut(it.valorOriginal, formatCurrency)} -> Corrigido ${moneyOut(it.valorCorrigido, formatCurrency)} + Juros ${moneyOut(it.juros, formatCurrency)}${it.jurosCompensatorios ? ` + Comp. ${moneyOut(it.jurosCompensatorios, formatCurrency)}` : ''} = ${moneyOut(it.total, formatCurrency)}`);
    });
  }
  return lines.join('\n');
}

export function buildCivelCsv(result) {
  if (!result || typeof result !== 'object') return '';
  const rows = [];
  if (result.modalidade === 'correcao_monetaria') {
    rows.push(['Competencia', 'DiasCobertos', 'DiasNoMes', 'VariacaoMensalPct', 'VariacaoAplicadaPct', 'FatorAcumulado']);
    for (const p of result.passos || []) {
      rows.push([p.periodo, p.diasCobertos, p.diasNoMes, decBr(p.variacaoMensalPct), decBr(p.variacaoAplicadaPct), decBr(p.fatorAcumulado)]);
    }
  } else if (result.modalidade === 'amortizacao_price_sac') {
    rows.push(['Parcela', 'Fase', 'SaldoInicial', 'Juros', 'Amortizacao', 'Prestacao', 'SaldoFinal']);
    for (const row of result.cronograma || []) {
      rows.push([row.parcela, row.fase, decBr(row.saldoInicial), decBr(row.juros), decBr(row.amortizacao), decBr(row.prestacao), decBr(row.saldoFinal)]);
    }
  } else if (result.modalidade === 'financiamento_sfh') {
    rows.push(['Mes', 'AnoContrato', 'PrestacaoTotal', 'Amortizacao', 'Juros', 'CorrecaoTR', 'SeguroMIP', 'SeguroDFI', 'TCA', 'SaldoDevedorFinal']);
    for (const row of result.cronograma || []) {
      rows.push([row.mes, row.anoContrato, decBr(row.prestacaoTotal), decBr(row.amortizacao), decBr(row.juros), decBr(row.correcaoTr), decBr(row.seguroMip), decBr(row.seguroDfi), decBr(row.taxaAdministracao), decBr(row.saldoDevedorFinal)]);
    }
  } else if (result.modalidade === 'juros_tvm') {
    rows.push(['BaseTemporal', 'Rotulo', 'TaxaCompostaPct', 'TaxaSimplesPct']);
    const comp = result.equivalencia?.composto?.equivalents || [];
    const simp = result.equivalencia?.simples?.equivalents || [];
    comp.forEach((row, idx) => {
      rows.push([row.basis, row.label, decBr(row.ratePct), decBr(simp[idx]?.ratePct || '')]);
    });
  } else if (result.modalidade === 'reajuste_aluguel') {
    rows.push(['Ciclo', 'Inicio', 'Fim', 'ValorAnterior', 'FatorCiclo', 'PercentualCicloPct', 'DeflacaoCongelada', 'ValorReajustado']);
    for (const c of result.ciclos || []) {
      rows.push([c.ciclo, c.deCompetencia, c.ateCompetencia, decBr(c.valorAnterior), decBr(c.fatorCiclo), decBr(c.percentualCiclo), c.deflacaoCongelada ? 'Sim' : 'Nao', decBr(c.valorReajustado)]);
    }
  } else {
    rows.push(['Especie', 'Descricao', 'DataBase', 'JurosDe', 'Original', 'FatorCorrecao', 'Corrigido', 'Juros', 'JurosCompensatorios', 'Total']);
    for (const it of result.itens || []) {
      rows.push([it.especie, it.descricao || it.id, it.data, it.jurosDe || it.data, decBr(it.valorOriginal), decBr(it.fatorCorrecao), decBr(it.valorCorrigido), decBr(it.juros), decBr(it.jurosCompensatorios || '0.00'), decBr(it.total)]);
    }
  }
  return rows.map(r => r.map(csvCell).join(';')).join('\r\n');
}
