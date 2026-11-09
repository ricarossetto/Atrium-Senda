const SPECIES_LABELS = Object.freeze({
  debito: 'Débito',
  amortizacao: 'Amortização',
  custas: 'Custas',
  despesa: 'Despesa',
  desconto: 'Desconto'
});

const ENCARGOS_BASES = Object.freeze([
  { value: 'debitos-atualizados', label: 'Débitos atualizados' },
  { value: 'debitos-com-juros', label: 'Débitos com juros' },
  { value: 'total-atualizado', label: 'Total atualizado (com custas)' }
]);

const DESLIGAMENTOS = Object.freeze([
  { value: 'sem_justa_causa', label: 'Dispensa sem justa causa' },
  { value: 'pedido_demissao', label: 'Pedido de demissão' },
  { value: 'acordo_484a', label: 'Acordo (art. 484-A)' },
  { value: 'justa_causa', label: 'Justa causa' },
  { value: 'termino_contrato', label: 'Término de contrato' }
]);

const AVISOS = Object.freeze([
  { value: '', label: 'Padrão do tipo' },
  { value: 'indenizado', label: 'Indenizado' },
  { value: 'trabalhado', label: 'Trabalhado' },
  { value: 'descontado', label: 'Descontado (30 dias)' },
  { value: 'nao_aplicavel', label: 'Não aplicável' }
]);

const ABAS = Object.freeze([
  { value: 'civel', label: 'Cível' },
  { value: 'trabalhista', label: 'Trabalhista' },
  { value: 'previdenciario', label: 'Previdenciário' }
]);

function icon(name) {
  return `<svg class="atrium-icon" aria-hidden="true" focusable="false"><use href="assets/icons/atrium-ui-icons.svg?v=3.0.2#atrium-icon-${name}"></use></svg>`;
}

function speciesBadge(especie, escapeHtml) {
  const negative = especie === 'amortizacao' || especie === 'desconto';
  return `<span class="calc-species${negative ? ' is-negative' : ''}">${escapeHtml(SPECIES_LABELS[especie] || especie)}</span>`;
}

function displayMoney(value, formatCurrency) {
  const numeric = Number(String(value ?? '').replace(',', '.'));
  if (!Number.isFinite(numeric)) return String(value ?? '');
  return formatCurrency(numeric);
}

function renderTabs(aba, escapeHtml) {
  return `<div class="calc-tabs" role="tablist" aria-label="Tipo de cálculo">
    ${ABAS.map(item => `<button type="button" role="tab" aria-selected="${aba === item.value}" class="calc-tab${aba === item.value ? ' is-active' : ''}" data-calc-action="tab" data-tab="${item.value}">${escapeHtml(item.label)}</button>`).join('')}
  </div>`;
}

function renderItemRow(item, index, escapeHtml) {
  const especieOptions = Object.entries(SPECIES_LABELS).map(([value, label]) =>
    `<option value="${value}"${item.especie === value ? ' selected' : ''}>${escapeHtml(label)}</option>`).join('');
  return `<tr data-item-row="${index}">
    <td><select data-item-field="especie" data-item-index="${index}" aria-label="Espécie do item ${index + 1}">${especieOptions}</select></td>
    <td><input data-item-field="descricao" data-item-index="${index}" maxlength="120" value="${escapeHtml(item.descricao || '')}" placeholder="Descrição" aria-label="Descrição do item ${index + 1}"></td>
    <td><input data-item-field="data" data-item-index="${index}" type="date" value="${escapeHtml(item.data || '')}" aria-label="Data-base do item ${index + 1}"></td>
    <td class="calc-money"><input data-item-field="valor" data-item-index="${index}" inputmode="decimal" value="${escapeHtml(item.valor || '')}" placeholder="0,00" aria-label="Valor do item ${index + 1}"></td>
    <td><input data-item-field="jurosDe" data-item-index="${index}" type="date" value="${escapeHtml(item.jurosDe || '')}" aria-label="Juros a partir do item ${index + 1}"></td>
    <td><button type="button" class="calc-icon-button" data-calc-action="remove-item" data-item-index="${index}" aria-label="Remover item ${index + 1}" title="Remover item">${icon('delete')}</button></td>
  </tr>`;
}

function renderCivelForm(form, catalog, escapeHtml) {
  const series = Array.isArray(catalog?.series) ? catalog.series : [];
  const serieOptions = (selected) => series.map(serie =>
    `<option value="${escapeHtml(serie.key)}"${selected === serie.key ? ' selected' : ''}>${escapeHtml(serie.rotulo)}</option>`).join('');
  const jurosOptions = [
    { value: 'sem', label: 'Sem juros' },
    { value: 'taxa-legal', label: 'Taxa legal (Res. CMN 5.171/2024)' },
    { value: 'percentual-fixo', label: 'Percentual mensal fixo' },
    { value: 'serie-mensal', label: 'Série mensal (ex.: SELIC)' }
  ].map(option => `<option value="${option.value}"${form.juros === option.value ? ' selected' : ''}>${escapeHtml(option.label)}</option>`).join('');
  const baseOptions = (selected) => ENCARGOS_BASES.map(base =>
    `<option value="${base.value}"${selected === base.value ? ' selected' : ''}>${escapeHtml(base.label)}</option>`).join('');
  const itensRows = form.itens.map((item, index) => renderItemRow(item, index, escapeHtml)).join('');

  return `<form id="calcForm" class="calc-panel" novalidate>
    <h3>Parâmetros</h3>
    <div class="calc-row">
      <label class="calc-field"><span>Atualizar até</span>
        <input id="calcAteInput" data-calc-field="atualizacaoAte" type="date" value="${escapeHtml(form.atualizacaoAte || '')}" required>
      </label>
      <label class="calc-field"><span>Correção monetária</span>
        <select data-calc-field="correcao"><option value="sem"${form.correcao === 'sem' ? ' selected' : ''}>Sem correção</option>${serieOptions(form.correcao)}</select>
      </label>
    </div>
    <div class="calc-row">
      <label class="calc-field"><span>Juros</span>
        <select data-calc-field="juros">${jurosOptions}</select>
      </label>
      <label class="calc-field"><span>Percentual mensal (%)</span>
        <input data-calc-field="jurosPercentual" inputmode="decimal" value="${escapeHtml(form.jurosPercentual || '')}" placeholder="Ex.: 1,00">
      </label>
      <label class="calc-field"><span>Índice dos juros por série</span>
        <select data-calc-field="jurosSerie">${serieOptions(form.jurosSerie)}</select>
      </label>
    </div>
    <div class="calc-row">
      <label class="calc-field"><span>Multa art. 523 (%)</span>
        <input data-calc-field="multaPercentual" inputmode="decimal" value="${escapeHtml(form.multaPercentual || '')}" placeholder="Ex.: 10">
      </label>
      <label class="calc-field"><span>Base da multa</span>
        <select data-calc-field="multaBase">${baseOptions(form.multaBase)}</select>
      </label>
      <label class="calc-field"><span>Honorários (%)</span>
        <input data-calc-field="honorariosPercentual" inputmode="decimal" value="${escapeHtml(form.honorariosPercentual || '')}" placeholder="Ex.: 10">
      </label>
      <label class="calc-field"><span>Base dos honorários</span>
        <select data-calc-field="honorariosBase">${baseOptions(form.honorariosBase)}</select>
      </label>
    </div>
    <h3>Itens</h3>
    <div class="calc-items">
      <table>
        <caption class="sr-only">Itens do cálculo</caption>
        <thead><tr>
          <th scope="col">Espécie</th>
          <th scope="col">Descrição</th>
          <th scope="col">Data-base</th>
          <th scope="col" class="calc-money">Valor</th>
          <th scope="col">Juros a partir</th>
          <th scope="col"><span class="sr-only">Ações</span></th>
        </tr></thead>
        <tbody>${itensRows}</tbody>
      </table>
    </div>
    <div class="calc-actions">
      <button type="button" class="button ghost" data-calc-action="add-item">${icon('add')}<span>Adicionar item</span></button>
      <button type="submit" class="button" data-calc-action="calcular"${form.loading ? ' disabled' : ''}>${icon('check')}<span>${form.loading ? 'Calculando...' : 'Calcular'}</span></button>
    </div>
    ${form.error ? `<p class="calc-feedback" role="alert">${escapeHtml(form.error)}</p>` : ''}
    <p class="calc-hint">Ferramenta de apoio: confira os critérios, a base de cada encargo e as fontes dos índices antes de usar no processo. O cálculo não abre prazo nem produz ciência.</p>
  </form>`;
}

function renderCompetenciaRow(competencia, index, escapeHtml) {
  return `<tr data-competencia-row="${index}">
    <td><input data-competencia-field="competencia" data-competencia-index="${index}" type="month" value="${escapeHtml(competencia.competencia || '')}" aria-label="Competência ${index + 1}"></td>
    <td class="calc-money"><input data-competencia-field="salario" data-competencia-index="${index}" inputmode="decimal" value="${escapeHtml(competencia.salario || '')}" placeholder="0,00" aria-label="Salário da competência ${index + 1}"></td>
    <td><button type="button" class="calc-icon-button" data-calc-action="remove-competencia" data-competencia-index="${index}" aria-label="Remover competência ${index + 1}" title="Remover competência">${icon('delete')}</button></td>
  </tr>`;
}

function renderOficialPeriodos(estado, escapeHtml) {
  const linhas = estado.periodos.map((periodo, index) => `
    <tr data-oficial-periodo-row="${index}">
      <td><input type="date" data-oficial-periodo-field="dataInicial" data-periodo-index="${index}" value="${escapeHtml(periodo.dataInicial || '')}" aria-label="Início do período ${index + 1}"></td>
      <td><input type="date" data-oficial-periodo-field="dataFinal" data-periodo-index="${index}" value="${escapeHtml(periodo.dataFinal || '')}" aria-label="Fim do período ${index + 1}"></td>
      <td><button type="button" class="calc-icon-button" data-calc-action="oficial-remove-periodo" data-periodo-index="${index}" aria-label="Remover período ${index + 1}" title="Remover período">${icon('delete')}</button></td>
    </tr>`).join('');
  return `<div class="calc-items">
    <table>
      <caption class="sr-only">Períodos de contribuição (oficial)</caption>
      <thead><tr><th scope="col">Início</th><th scope="col">Fim</th><th scope="col"><span class="sr-only">Ações</span></th></tr></thead>
      <tbody>${linhas}</tbody>
    </table>
    <div class="calc-actions"><button type="button" class="button ghost" data-calc-action="oficial-add-periodo">${icon('add')}<span>Adicionar período</span></button></div>
  </div>`;
}

function renderResultadoOficial(resultado, escapeHtml) {
  const demonstrativo = typeof resultado?.demonstrativo === 'string' ? resultado.demonstrativo
    : (typeof resultado?.result?.demonstrativo === 'string' ? resultado.result.demonstrativo : '');
  return `<div class="calc-resultado-oficial">
    <h3>Resultado oficial</h3>
    <pre class="calc-resultado-json">${escapeHtml(JSON.stringify(resultado ?? {}, null, 2))}</pre>
    ${demonstrativo ? `<div class="calc-actions"><button type="button" class="button ghost" data-calc-action="oficial-demonstrativo">${icon('download')}<span>Baixar demonstrativo (PDF oficial)</span></button></div>` : ''}
  </div>`;
}

function renderCalculadoraOficial(estado, escapeHtml) {
  const modoTc = estado.modo !== 'atrasados';
  const corpo = modoTc ? `
    <div class="calc-row">
      <label class="calc-field"><span>Data de apuração</span><input type="date" data-oficial-field="dataApuracao" value="${escapeHtml(estado.dataApuracao || '')}"></label>
      <label class="calc-field"><span>Nascimento</span><input type="date" data-oficial-field="nascimento" value="${escapeHtml(estado.nascimento || '')}"></label>
      <label class="calc-field"><span>Sexo</span>
        <select data-oficial-field="sexo">
          <option value="FEMININO"${estado.sexo === 'FEMININO' ? ' selected' : ''}>Feminino</option>
          <option value="MASCULINO"${estado.sexo === 'MASCULINO' ? ' selected' : ''}>Masculino</option>
        </select>
      </label>
    </div>
    ${renderOficialPeriodos(estado, escapeHtml)}
    <div class="calc-actions">
      <button type="button" class="button" data-calc-action="oficial-calcular" data-tipo="tempo"${estado.loading ? ' disabled' : ''}>${icon('check')}<span>${estado.loading ? 'Calculando...' : 'Calcular tempo oficial'}</span></button>
      <button type="button" class="button ghost" data-calc-action="oficial-calcular" data-tipo="rmi"${estado.loading ? ' disabled' : ''}>${icon('check')}<span>Calcular RMI oficial</span></button>
    </div>
    <p class="calc-hint">Cálculo oficial do Poder Judiciário (PDPJ): o resultado oficial prevalece sobre a estimativa rápida desta aba. Nada é enviado ao processo; o demonstrativo PDF é apenas leitura.</p>
  ` : `
    <details class="calc-detalhe-avancado" open>
      <summary>Dados do processo</summary>
      <div class="calc-row">
        <label class="calc-field"><span>Número do processo</span><input data-oficial-field="numero" value="${escapeHtml(estado.numero || '')}" placeholder="0000000-00.0000.0.00.0000"></label>
        <label class="calc-field"><span>Valor da causa</span><input inputmode="decimal" data-oficial-field="valorCausa" value="${escapeHtml(estado.valorCausa || '')}" placeholder="Opcional"></label>
      </div>
      <div class="calc-row">
        <label class="calc-field"><span>Citação</span><input type="date" data-oficial-field="citacao" value="${escapeHtml(estado.citacao || '')}"></label>
        <label class="calc-field"><span>Protocolo</span><input type="date" data-oficial-field="protocolo" value="${escapeHtml(estado.protocolo || '')}"></label>
        <label class="calc-field"><span>Trânsito em julgado</span><input type="date" data-oficial-field="transito" value="${escapeHtml(estado.transito || '')}"></label>
      </div>
    </details>
    <details class="calc-detalhe-avancado" open>
      <summary>Parâmetros (atualização, diferenças, alçada e acordo)</summary>
      <div class="calc-row">
        <label class="calc-field"><span>Data de atualização</span><input type="date" data-oficial-field="dataAtualizacao" value="${escapeHtml(estado.dataAtualizacao || '')}"></label>
        <label class="calc-field"><span>Início das diferenças</span><input type="date" data-oficial-field="inicioDiferencas" value="${escapeHtml(estado.inicioDiferencas || '')}"></label>
        <label class="calc-field"><span>Término das diferenças</span><input type="date" data-oficial-field="terminoDiferencas" value="${escapeHtml(estado.terminoDiferencas || '')}"></label>
      </div>
      <div class="calc-row">
        <label class="calc-field"><span>Percentual de acordo</span><input inputmode="decimal" data-oficial-field="percentualAcordo" value="${escapeHtml(estado.percentualAcordo || '')}" placeholder="Opcional (%)"></label>
        <label class="calc-field"><span>Critério de dedução da alçada</span>
          <select data-oficial-field="criterioDeducaoAlcada">
            <option value="">Sem dedução</option>
            <option value="VENCIDAS_MAIS_12_VINCENDAS"${estado.criterioDeducaoAlcada === 'VENCIDAS_MAIS_12_VINCENDAS' ? ' selected' : ''}>Vencidas + 12 vincendas</option>
            <option value="APENAS_VENCIDAS"${estado.criterioDeducaoAlcada === 'APENAS_VENCIDAS' ? ' selected' : ''}>Apenas vencidas</option>
            <option value="VENCIDAS_MAIS_VINCENDAS_APURADAS_ATE_12"${estado.criterioDeducaoAlcada === 'VENCIDAS_MAIS_VINCENDAS_APURADAS_ATE_12' ? ' selected' : ''}>Vencidas + vincendas apuradas até 12</option>
          </select>
        </label>
      </div>
      <div class="calc-row">
        <label class="calc-field calc-check"><span>Aplicar prescrição</span><input type="checkbox" data-oficial-field="aplicarPrescricao"${estado.aplicarPrescricao ? ' checked' : ''}></label>
        <label class="calc-field calc-check"><span>Deduzir excedente da alçada</span><input type="checkbox" data-oficial-field="deduzirExcedenteAlcada"${estado.deduzirExcedenteAlcada ? ' checked' : ''}></label>
      </div>
    </details>
    <details class="calc-detalhe-avancado">
      <summary>Consectários CJF 963/2025 (correção, juros e Selic EC 113)</summary>
      <div class="calc-row">
        <label class="calc-field"><span>Encadeamento da correção</span>
          <select data-oficial-field="encadeamentoCorrecao">
            <option value="RES_134_PREVIDENCIARIO"${estado.encadeamentoCorrecao !== 'MANUAL_EM_VIGOR_CONDENATORIAS_FAZENDA' && estado.encadeamentoCorrecao !== 'MANUAL_EM_VIGOR_PREVIDENCIARIO' && estado.encadeamentoCorrecao !== 'CONFIGURADO_MANUALMENTE' ? ' selected' : ''}>Res. 134 previdenciário</option>
            <option value="MANUAL_EM_VIGOR_PREVIDENCIARIO"${estado.encadeamentoCorrecao === 'MANUAL_EM_VIGOR_PREVIDENCIARIO' ? ' selected' : ''}>Manual em vigor previdenciário</option>
            <option value="MANUAL_EM_VIGOR_CONDENATORIAS_FAZENDA"${estado.encadeamentoCorrecao === 'MANUAL_EM_VIGOR_CONDENATORIAS_FAZENDA' ? ' selected' : ''}>Manual em vigor condenatórias Fazenda</option>
            <option value="CONFIGURADO_MANUALMENTE"${estado.encadeamentoCorrecao === 'CONFIGURADO_MANUALMENTE' ? ' selected' : ''}>Configurado manualmente</option>
          </select>
        </label>
        <label class="calc-field"><span>Encadeamento dos juros</span>
          <select data-oficial-field="encadeamentoJuros">
            <option value="SEM_JUROS"${estado.encadeamentoJuros === 'SEM_JUROS' || !estado.encadeamentoJuros ? ' selected' : ''}>Sem juros</option>
            <option value="MANUAL_EM_VIGOR_PREVIDENCIARIO"${estado.encadeamentoJuros === 'MANUAL_EM_VIGOR_PREVIDENCIARIO' ? ' selected' : ''}>Manual em vigor previdenciário</option>
            <option value="MANUAL_EM_VIGOR_CONDENATORIAS_FAZENDA"${estado.encadeamentoJuros === 'MANUAL_EM_VIGOR_CONDENATORIAS_FAZENDA' ? ' selected' : ''}>Manual em vigor condenatórias Fazenda</option>
            <option value="FIXO_UM"${estado.encadeamentoJuros === 'FIXO_UM' ? ' selected' : ''}>Fixo 1%</option>
            <option value="FIXO_MEIO"${estado.encadeamentoJuros === 'FIXO_MEIO' ? ' selected' : ''}>Fixo 0,5%</option>
            <option value="MEIO_E_MANUAL_EM_VIGOR_PREVIDENCIARIO"${estado.encadeamentoJuros === 'MEIO_E_MANUAL_EM_VIGOR_PREVIDENCIARIO' ? ' selected' : ''}>0,5% e manual em vigor previdenciário</option>
            <option value="CONFIGURADO_MANUALMENTE"${estado.encadeamentoJuros === 'CONFIGURADO_MANUALMENTE' ? ' selected' : ''}>Configurado manualmente</option>
          </select>
        </label>
        <label class="calc-field"><span>Início da Selic EC 113</span>
          <select data-oficial-field="opcaoInicioSelicEc113">
            <option value="NAO_APLICAR"${estado.opcaoInicioSelicEc113 === 'NAO_APLICAR' || !estado.opcaoInicioSelicEc113 ? ' selected' : ''}>Não aplicar</option>
            <option value="DEZEMBRO_2021"${estado.opcaoInicioSelicEc113 === 'DEZEMBRO_2021' ? ' selected' : ''}>Dezembro/2021</option>
            <option value="CITACAO"${estado.opcaoInicioSelicEc113 === 'CITACAO' ? ' selected' : ''}>Citação</option>
          </select>
        </label>
        <label class="calc-field"><span>Término da Selic EC 113</span>
          <select data-oficial-field="opcaoTerminoSelicEc113">
            <option value="NAO_APLICAR"${estado.opcaoTerminoSelicEc113 === 'NAO_APLICAR' || !estado.opcaoTerminoSelicEc113 ? ' selected' : ''}>Não aplicar</option>
            <option value="SETEMBRO_2025"${estado.opcaoTerminoSelicEc113 === 'SETEMBRO_2025' ? ' selected' : ''}>Setembro/2025</option>
            <option value="OUTUBRO_2025"${estado.opcaoTerminoSelicEc113 === 'OUTUBRO_2025' ? ' selected' : ''}>Outubro/2025</option>
            <option value="DATA_ATUALIZACAO"${estado.opcaoTerminoSelicEc113 === 'DATA_ATUALIZACAO' ? ' selected' : ''}>Data de atualização</option>
          </select>
        </label>
      </div>
    </details>
    <details class="calc-detalhe-avancado">
      <summary>Honorários (art. 85 §3º) e multa</summary>
      <div class="calc-row">
        <label class="calc-field"><span>Base de incidência dos honorários</span>
          <select data-oficial-field="honorariosBaseIncidencia">
            <option value="NAO_APURAR"${estado.honorariosBaseIncidencia === 'NAO_APURAR' || !estado.honorariosBaseIncidencia ? ' selected' : ''}>Não apurar</option>
            <option value="VALOR_DA_CONDENACAO"${estado.honorariosBaseIncidencia === 'VALOR_DA_CONDENACAO' ? ' selected' : ''}>Valor da condenação</option>
            <option value="VALOR_DA_CAUSA"${estado.honorariosBaseIncidencia === 'VALOR_DA_CAUSA' ? ' selected' : ''}>Valor da causa</option>
            <option value="VALOR_ARBITRADO"${estado.honorariosBaseIncidencia === 'VALOR_ARBITRADO' ? ' selected' : ''}>Valor arbitrado</option>
          </select>
        </label>
        <label class="calc-field"><span>Honorários (%)</span><input inputmode="decimal" data-oficial-field="honorariosPercentual" value="${escapeHtml(estado.honorariosPercentual || '')}" placeholder="Ex.: 10"></label>
        <label class="calc-field"><span>Base de incidência da multa</span>
          <select data-oficial-field="multaBaseIncidencia">
            <option value="NAO_APURAR"${estado.multaBaseIncidencia === 'NAO_APURAR' || !estado.multaBaseIncidencia ? ' selected' : ''}>Não apurar</option>
            <option value="VALOR_DA_CONDENACAO"${estado.multaBaseIncidencia === 'VALOR_DA_CONDENACAO' ? ' selected' : ''}>Valor da condenação</option>
            <option value="VALOR_DA_CAUSA"${estado.multaBaseIncidencia === 'VALOR_DA_CAUSA' ? ' selected' : ''}>Valor da causa</option>
            <option value="VALOR_ARBITRADO"${estado.multaBaseIncidencia === 'VALOR_ARBITRADO' ? ' selected' : ''}>Valor arbitrado</option>
          </select>
        </label>
        <label class="calc-field"><span>Multa (%)</span><input inputmode="decimal" data-oficial-field="multaPercentual" value="${escapeHtml(estado.multaPercentual || '')}" placeholder="Opcional"></label>
      </div>
      <div class="calc-row">
        <label class="calc-field calc-check"><span>Aplicar faixas do art. 85 §3º</span><input type="checkbox" data-oficial-field="aplicarFaixasArt85Cpc"${estado.aplicarFaixasArt85Cpc ? ' checked' : ''}></label>
        <label class="calc-field calc-check"><span>Descontar benefício dos honorários</span><input type="checkbox" data-oficial-field="descontarBeneficio"${estado.descontarBeneficio ? ' checked' : ''}></label>
      </div>
    </details>
    <details class="calc-detalhe-avancado">
      <summary>Benefícios, HISCRE e lançamentos (JSON avançado, opcional)</summary>
      <label class="calc-field"><span>Objetos do cálculo (beneficiosDevidos, beneficiosPagos, periodosBeneficioVantajoso, descontos/HISCRE, acrescimos, outroDebitos)</span>
        <textarea data-oficial-field="jsonAvancado" rows="6" placeholder='{"beneficiosDevidos": [], "descontos": [], "acrescimos": []}' spellcheck="false">${escapeHtml(estado.jsonAvancado || '')}</textarea>
      </label>
      <p class="calc-hint">Campos no formato oficial do PDPJ (DadosBeneficioApi com dadosRmi/dadosReajuste; DescontosApi com HISCRE de renda/abono; AcrescimoApi; DebitosEmGeralApi; PeriodoBeneficioVantajosoApi). Cole o JSON completo das chaves que quiser usar.</p>
    </details>
    <div class="calc-actions">
      <button type="button" class="button" data-calc-action="oficial-calcular" data-tipo="atrasados"${estado.loading ? ' disabled' : ''}>${icon('check')}<span>${estado.loading ? 'Calculando...' : 'Calcular atrasados oficial'}</span></button>
    </div>
    <p class="calc-hint">Cálculo oficial de atrasados do Poder Judiciário (consectários CJF 963/2025, Selic EC 113, alçada, honorários art. 85 §3º e multa). Resultado oficial prevalece sobre a estimativa; nada é enviado ao processo.</p>
  `;
  return `<section class="calc-oficial" aria-labelledby="calcOficialHeading">
    <header class="calc-oficial-header">
      <div>
        <h3 id="calcOficialHeading">Cálculo oficial (PDPJ)</h3>
        <span>Ferramenta oficial do Poder Judiciário para conferência — TC/RMI e Atrasados.</span>
      </div>
      <div class="calc-oficial-modos" role="group" aria-label="Ferramentas oficiais">
        <button type="button" data-calc-action="oficial-modo" data-modo="tc" aria-pressed="${modoTc}">TC/RMI</button>
        <button type="button" data-calc-action="oficial-modo" data-modo="atrasados" aria-pressed="${!modoTc}">Atrasados</button>
      </div>
    </header>
    ${corpo}
    ${estado.error ? `<p class="calc-feedback" role="alert">${escapeHtml(estado.error)}</p>` : ''}
    ${estado.resultado ? renderResultadoOficial(estado.resultado, escapeHtml) : ''}
  </section>`;
}

function renderPrevidenciarioForm(form, escapeHtml) {
  const sexoOptions = [
    { value: 'feminino', label: 'Feminino' },
    { value: 'masculino', label: 'Masculino' }
  ].map(option => `<option value="${option.value}"${form.sexo === option.value ? ' selected' : ''}>${escapeHtml(option.label)}</option>`).join('');
  const linhas = form.competencias.map((competencia, index) => renderCompetenciaRow(competencia, index, escapeHtml)).join('');
  return `<form id="calcForm" class="calc-panel" novalidate>
    <h3>Parâmetros</h3>
    <div class="calc-row">
      <label class="calc-field"><span>Sexo</span>
        <select data-prev-field="sexo">${sexoOptions}</select>
      </label>
      <label class="calc-field"><span>Data de nascimento (regras de transição)</span>
        <input data-prev-field="dataNascimento" type="date" value="${escapeHtml(form.dataNascimento || '')}">
      </label>
      <label class="calc-field"><span>Teto</span>
        <input data-prev-field="teto" inputmode="decimal" value="${escapeHtml(form.teto || '')}" placeholder="Opcional">
      </label>
      <label class="calc-field"><span>Piso</span>
        <input data-prev-field="piso" inputmode="decimal" value="${escapeHtml(form.piso || '')}" placeholder="Opcional">
      </label>
    </div>
    <fieldset class="calc-options">
      <legend class="sr-only">Opções de apuração</legend>
      <label class="calc-option">
        <input data-prev-field="divisorMinimo" type="checkbox"${form.divisorMinimo ? ' checked' : ''}>
        <span>Divisor mínimo (108)</span>
      </label>
      <label class="calc-option">
        <input data-prev-field="corrigirSalarios" type="checkbox"${form.corrigirSalarios !== false ? ' checked' : ''}>
        <span>Corrigir pelo INPC (teto da época)</span>
      </label>
      <label class="calc-option">
        <input data-prev-field="descarte" type="checkbox"${form.descarte !== false ? ' checked' : ''}>
        <span>Descartar 20% menores</span>
      </label>
    </fieldset>
    <h3>Salários de contribuição</h3>
    <details class="calc-import">
      <summary>Importar do CNIS (PDF, planilha ou texto)</summary>
      <label class="calc-field"><span>Texto do extrato</span>
        <textarea data-prev-field="textoCnis" rows="5" placeholder="Cole as linhas com mês/ano e remuneração">${escapeHtml(form.textoCnis || '')}</textarea>
      </label>
      <div class="calc-actions">
        <button type="button" class="button ghost" data-calc-action="importar-cnis"${form.importando ? ' disabled' : ''}>${icon('upload')}<span>${form.importando ? 'Extraindo...' : 'Extrair do texto'}</span></button>
        <button type="button" class="button ghost" data-calc-action="importar-cnis-arquivo"${form.importando ? ' disabled' : ''}>${icon('upload')}<span>Anexar PDF ou planilha</span></button>
        <input type="file" data-prev-file accept=".pdf,.csv,.txt,.xlsx,.xls" hidden>
        ${form.precisaOcr ? `<button type="button" class="button ghost" data-calc-action="importar-cnis-ocr"${form.importando ? ' disabled' : ''}>${icon('upload')}<span>Rodar OCR local</span></button>` : ''}
      </div>
      <p class="calc-hint">Extração assistida: confira cada competência e remuneração no extrato original. Indicadores de pendência continuam exigindo análise humana.${form.importFonte === 'fabrica' ? ' Extração oficial da Fábrica de Cálculos (TRF3).' : ''}</p>
      ${Array.isArray(form.importAvisos) && form.importAvisos.length > 0
        ? `<ul class="calc-memoria-lista">${form.importAvisos.map(aviso => `<li>${escapeHtml(aviso)}</li>`).join('')}</ul>`
        : ''}
    </details>
    <div class="calc-items">
      <table>
        <caption class="sr-only">Competências e salários de contribuição</caption>
        <thead><tr>
          <th scope="col">Competência</th>
          <th scope="col" class="calc-money">Salário (corrigido)</th>
          <th scope="col"><span class="sr-only">Ações</span></th>
        </tr></thead>
        <tbody>${linhas}</tbody>
      </table>
    </div>
    <div class="calc-actions">
      <button type="button" class="button ghost" data-calc-action="add-competencia">${icon('add')}<span>Adicionar competência</span></button>
      <button type="submit" class="button" data-calc-action="calcular"${form.loading ? ' disabled' : ''}>${icon('check')}<span>${form.loading ? 'Calculando...' : 'Calcular RMI'}</span></button>
    </div>
    ${form.error ? `<p class="calc-feedback" role="alert">${escapeHtml(form.error)}</p>` : ''}
    <p class="calc-hint">Salários nominais são corrigidos pelo INPC com teto da época aplicado antes (fonte: Portarias MPS/MF e SGS 188). Regras de transição, direito adquirido, tempo especial e PcD ainda não são calculados; confira o CNIS antes de usar o resultado.</p>
  </form>`;
}

function renderDescontoRow(desconto, index, escapeHtml) {
  return `<tr data-desconto-row="${index}">
    <td><input data-desconto-field="descricao" data-desconto-index="${index}" maxlength="120" value="${escapeHtml(desconto.descricao || '')}" placeholder="Ex.: INSS informado" aria-label="Descrição do desconto ${index + 1}"></td>
    <td class="calc-money"><input data-desconto-field="valor" data-desconto-index="${index}" inputmode="decimal" value="${escapeHtml(desconto.valor || '')}" placeholder="0,00" aria-label="Valor do desconto ${index + 1}"></td>
    <td><button type="button" class="calc-icon-button" data-calc-action="remove-desconto" data-desconto-index="${index}" aria-label="Remover desconto ${index + 1}" title="Remover desconto">${icon('delete')}</button></td>
  </tr>`;
}

function renderTrabalhistaForm(form, escapeHtml) {
  const desligamentoOptions = DESLIGAMENTOS.map(item =>
    `<option value="${item.value}"${form.tipoDesligamento === item.value ? ' selected' : ''}>${escapeHtml(item.label)}</option>`).join('');
  const avisoOptions = AVISOS.map(item =>
    `<option value="${item.value}"${form.aviso === item.value ? ' selected' : ''}>${escapeHtml(item.label)}</option>`).join('');
  const feriasOptions = [0, 1, 2, 3, 4, 5].map(quantity =>
    `<option value="${quantity}"${String(form.feriasVencidas) === String(quantity) ? ' selected' : ''}>${quantity}</option>`).join('');
  const descontosRows = form.descontos.map((desconto, index) => renderDescontoRow(desconto, index, escapeHtml)).join('');

  return `<form id="calcForm" class="calc-panel" novalidate>
    <h3>Contrato</h3>
    <div class="calc-row">
      <label class="calc-field"><span>Salário</span>
        <input data-trab-field="salario" inputmode="decimal" value="${escapeHtml(form.salario || '')}" placeholder="0,00">
      </label>
      <label class="calc-field"><span>Admissão</span>
        <input data-trab-field="admissao" type="date" value="${escapeHtml(form.admissao || '')}">
      </label>
      <label class="calc-field"><span>Desligamento</span>
        <input data-trab-field="desligamento" type="date" value="${escapeHtml(form.desligamento || '')}">
      </label>
    </div>
    <div class="calc-row">
      <label class="calc-field"><span>Tipo de desligamento</span>
        <select data-trab-field="tipoDesligamento">${desligamentoOptions}</select>
      </label>
      <label class="calc-field"><span>Aviso prévio</span>
        <select data-trab-field="aviso">${avisoOptions}</select>
      </label>
      <label class="calc-field"><span>Dias trabalhados no mês</span>
        <input data-trab-field="diasTrabalhados" inputmode="numeric" value="${escapeHtml(form.diasTrabalhados || '30')}">
      </label>
      <label class="calc-field"><span>Férias vencidas (períodos)</span>
        <select data-trab-field="feriasVencidas">${feriasOptions}</select>
      </label>
      <label class="calc-field"><span>Saldo do FGTS</span>
        <input data-trab-field="saldoFgts" inputmode="decimal" value="${escapeHtml(form.saldoFgts || '')}" placeholder="Informado pelo cliente">
      </label>
    </div>
    <div class="calc-row">
      <label class="calc-field calc-check"><span>Calcular INSS/IRRF (vigência 2026)</span>
        <input data-trab-field="tributacaoAtiva" type="checkbox"${form.tributacaoAtiva ? ' checked' : ''}>
      </label>
      <label class="calc-field"><span>Dependentes (IRRF)</span>
        <input data-trab-field="dependentes" inputmode="numeric" value="${escapeHtml(form.dependentes || '0')}">
      </label>
      <label class="calc-field"><span>Pensão alimentícia</span>
        <input data-trab-field="pensao" inputmode="decimal" value="${escapeHtml(form.pensao || '')}" placeholder="Opcional">
      </label>
      <label class="calc-field"><span>Outras deduções do IRRF</span>
        <input data-trab-field="outrasDeducoes" inputmode="decimal" value="${escapeHtml(form.outrasDeducoes || '')}" placeholder="Opcional">
      </label>
    </div>
    <h3>Descontos informados</h3>
    <div class="calc-items">
      <table>
        <caption class="sr-only">Descontos da rescisão</caption>
        <thead><tr>
          <th scope="col">Descrição</th>
          <th scope="col" class="calc-money">Valor</th>
          <th scope="col"><span class="sr-only">Ações</span></th>
        </tr></thead>
        <tbody>${descontosRows}</tbody>
      </table>
    </div>
    <div class="calc-actions">
      <button type="button" class="button ghost" data-calc-action="add-desconto">${icon('add')}<span>Adicionar desconto</span></button>
      <button type="submit" class="button" data-calc-action="calcular"${form.loading ? ' disabled' : ''}>${icon('check')}<span>${form.loading ? 'Calculando...' : 'Calcular rescisão'}</span></button>
    </div>
    ${form.error ? `<p class="calc-feedback" role="alert">${escapeHtml(form.error)}</p>` : ''}
    <p class="calc-hint">INSS e IRRF não são calculados: informe os descontos com base nas tabelas vigentes. O saldo do FGTS é informado, não estimado. Ferramenta de apoio com conferência humana obrigatória.</p>
  </form>`;
}

function renderBreakdown(result, escapeHtml, formatCurrency) {
  const rows = result.itens.map(item => `<tr>
    <td>${speciesBadge(item.especie, escapeHtml)}</td>
    <td>${escapeHtml(item.descricao || item.id)}</td>
    <td>${escapeHtml(item.data)}</td>
    <td class="calc-money">${escapeHtml(displayMoney(item.valorOriginal, formatCurrency))}</td>
    <td class="calc-money">${escapeHtml(item.fatorCorrecao)}</td>
    <td class="calc-money">${escapeHtml(displayMoney(item.valorCorrigido, formatCurrency))}</td>
    <td class="calc-money">${escapeHtml(displayMoney(item.juros, formatCurrency))}</td>
    <td class="calc-money">${escapeHtml(displayMoney(item.total, formatCurrency))}</td>
  </tr>`).join('');
  return `<div class="calc-result-table">
    <table>
      <caption class="sr-only">Itens calculados</caption>
      <thead><tr>
        <th scope="col">Espécie</th>
        <th scope="col">Descrição</th>
        <th scope="col">Data-base</th>
        <th scope="col" class="calc-money">Original</th>
        <th scope="col" class="calc-money">Fator</th>
        <th scope="col" class="calc-money">Corrigido</th>
        <th scope="col" class="calc-money">Juros</th>
        <th scope="col" class="calc-money">Total</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
}

function memorialDetails(entry, escapeHtml, formatCurrency) {
  if (entry.tipo === 'correcao') {
    const segments = entry.segmentos.map(segment =>
      `<div><dt>${escapeHtml(segment.serie)}</dt><dd>${escapeHtml(segment.de)} a ${escapeHtml(segment.ate)} · fator ${escapeHtml(segment.fator)}</dd></div>`).join('');
    return `<details><summary>Correção — ${escapeHtml(entry.itemId)} · fator ${escapeHtml(entry.fator)}</summary>
      <dl><div><dt>Valor</dt><dd>${escapeHtml(displayMoney(entry.valorAntes, formatCurrency))} → ${escapeHtml(displayMoney(entry.valorDepois, formatCurrency))}</dd></div>${segments}</dl></details>`;
  }
  if (entry.tipo === 'juros') {
    const months = (entry.meses || []).map(month =>
      `<div><dt>${escapeHtml(month.periodo)}</dt><dd>${month.dias}/${month.diasNoMes} dias · taxa ${escapeHtml(month.taxa)}% · aplicado ${escapeHtml(month.taxaAplicada)}%</dd></div>`).join('');
    const compactada = entry.memoriaMensalRemovida ? '<div><dt>Memória mensal</dt><dd>Resumida no salvamento; totais preservados.</dd></div>' : '';
    return `<details><summary>Juros — ${escapeHtml(entry.itemId)} · ${escapeHtml(entry.taxaTotal)}% sobre ${escapeHtml(displayMoney(entry.base, formatCurrency))} = ${escapeHtml(displayMoney(entry.valor, formatCurrency))}</summary>
      <dl><div><dt>Critério</dt><dd>${escapeHtml(entry.criterio)} — ${escapeHtml(entry.de)} a ${escapeHtml(entry.ate)}</dd></div>${compactada}${months}</dl></details>`;
  }
  if (entry.tipo === 'multa' || entry.tipo === 'honorarios') {
    return `<details><summary>${entry.tipo === 'multa' ? 'Multa' : 'Honorários'} — ${escapeHtml(entry.percentual)}% sobre ${escapeHtml(entry.base)} = ${escapeHtml(displayMoney(entry.valor, formatCurrency))}</summary>
      <dl><div><dt>Base</dt><dd>${escapeHtml(entry.base)}</dd></div><div><dt>Valor</dt><dd>${escapeHtml(displayMoney(entry.valor, formatCurrency))}</dd></div></dl></details>`;
  }
  if (entry.tipo === 'abatimento') {
    return `<details><summary>Abatimento — ${escapeHtml(displayMoney(entry.valor, formatCurrency))}</summary>
      <dl><div><dt>Itens</dt><dd>${escapeHtml(entry.itens.join(', '))}</dd></div></dl></details>`;
  }
  return '';
}

function renderConferenciaIndices(conferencia, conferindo, escapeHtml) {
  const botao = `<button type="button" class="button ghost" data-calc-action="conferir-indices"${conferindo ? ' disabled aria-busy="true"' : ''}>${icon('check')}<span>${conferindo ? 'Conferindo...' : 'Conferir índices oficiais'}</span></button>`;
  const cabecalho = `<div class="calc-conference-head">
      <div>
        <h3>Conferência oficial</h3>
        <p class="calc-hint">Compara o fator de correção desta memória com a tabela oficial da Fábrica de Cálculos. Leitura apenas; não altera o cálculo.</p>
      </div>
      ${botao}
    </div>`;
  if (!conferencia) {
    return `<section class="calc-conference" aria-label="Conferência oficial de índices">${cabecalho}</section>`;
  }
  const resumo = conferencia.resumo || {};
  const chips = [
    ['Conferem', resumo.conferem || 0, 'is-ok'],
    ['Divergentes', resumo.divergentes || 0, resumo.divergentes ? 'is-warn' : 'is-neutral'],
    ['Sem dado oficial', resumo.semDado || 0, 'is-neutral'],
    ['Sem fonte oficial', resumo.semFonte || 0, 'is-neutral']
  ].map(([label, valor, classe]) => `<span class="calc-conference-chip ${classe}" aria-label="${escapeHtml(label)}: ${escapeHtml(valor)}"><strong>${escapeHtml(valor)}</strong>${escapeHtml(label)}</span>`).join('');
  const statusRotulo = {
    confere: 'Confere',
    divergente: 'Divergência',
    'sem-dado': 'Sem dado oficial',
    'sem-fonte': 'Sem fonte oficial',
    ignorado: 'Não conferido'
  };
  const formatarFator = valor => {
    const numero = Number(valor);
    return Number.isFinite(numero) ? numero.toFixed(8).replace('.', ',') : '—';
  };
  const formatarDiferenca = valor => {
    const numero = Number(valor);
    if (!Number.isFinite(numero)) return '—';
    const absoluto = Math.abs(numero);
    const casas = absoluto >= 1 ? 2 : absoluto >= 0.01 ? 3 : 4;
    const sinal = numero > 0 ? '+' : '';
    return `${sinal}${numero.toFixed(casas).replace('.', ',')}%`;
  };
  const itens = (Array.isArray(conferencia.fontes) ? conferencia.fontes : []).map(fonte => {
    const status = statusRotulo[fonte.status] || fonte.status;
    const classe = fonte.status === 'confere' ? 'is-ok' : fonte.status === 'divergente' ? 'is-warn' : 'is-neutral';
    const valores = fonte.status === 'confere' || fonte.status === 'divergente'
      ? `<span>ATRIUM <strong>${escapeHtml(formatarFator(fonte.fatorAtrium))}</strong></span>
         <span>Oficial <strong>${escapeHtml(formatarFator(fonte.fatorOficial))}</strong></span>
         <span>Diferença <strong>${escapeHtml(formatarDiferenca(fonte.diferencaPercentual))}</strong></span>`
      : '';
    return `<li class="calc-conference-item">
      <div class="calc-conference-id">
        <strong>${escapeHtml(fonte.serie)}</strong>
        <span>${escapeHtml(fonte.de)} a ${escapeHtml(fonte.ate)}</span>
      </div>
      ${valores ? `<div class="calc-conference-values">${valores}</div>` : ''}
      <span class="calc-conference-status ${classe}">${escapeHtml(status)}</span>
      ${fonte.motivo ? `<small>${escapeHtml(fonte.motivo)}</small>` : ''}
    </li>`;
  }).join('');
  const competencias = conferencia.competencias
    ? `${escapeHtml(conferencia.competencias.de)} a ${escapeHtml(conferencia.competencias.ate)}`
    : 'sem janela';
  return `<section class="calc-conference" aria-label="Conferência oficial de índices" aria-live="polite">
    ${cabecalho}
    <div class="calc-conference-summary">${chips}</div>
    <ul class="calc-conference-list">${lista}</ul>
    <p class="calc-hint">Tolerância de ${escapeHtml(String(conferencia.toleranciaPercentual ?? '0,10').replace('.', ','))}% para arredondamento das tabelas. Janela conferida: ${competencias}. Última competência na tabela: ${escapeHtml(conferencia.ultimaCompetenciaOficial || 'não informada')}. A conferência não substitui a revisão humana.</p>
  </section>`;
}

function renderCivelResult(result, escapeHtml, formatCurrency, conferencia = null, conferindo = false) {
  const tiles = [
    ['Débitos atualizados', result.resumo.debitosAtualizados],
    ['Juros', result.resumo.juros],
    ['Multa', result.resumo.multa],
    ['Honorários', result.resumo.honorarios],
    ['Abatimentos', result.resumo.abatimentos]
  ].map(([label, value]) => `<div class="calc-tile"><span>${label}</span><strong>${escapeHtml(displayMoney(value, formatCurrency))}</strong></div>`).join('');
  const sources = result.fontes.map(source =>
    `<span>${escapeHtml(source.serie)} · ${escapeHtml(source.de)} a ${escapeHtml(source.ate)}</span>`).join('');
  return `<h3>Resumo</h3>
    <div class="calc-summary" aria-live="polite">${tiles}
      <div class="calc-tile is-total"><span>Total</span><strong>${escapeHtml(displayMoney(result.resumo.total, formatCurrency))}</strong></div>
    </div>
    <h3>Itens</h3>
    ${renderBreakdown(result, escapeHtml, formatCurrency)}
    <h3>Memória de cálculo</h3>
    <div class="calc-memorial">${result.memoria.map(entry => memorialDetails(entry, escapeHtml, formatCurrency)).join('')}</div>
    <h3>Fontes</h3>
    <div class="calc-sources">${sources}</div>
    ${renderConferenciaIndices(conferencia, conferindo, escapeHtml)}`;
}

function renderTrabalhistaResult(result, escapeHtml, formatCurrency) {
  const tiles = [
    ['Proventos', result.resumo.proventos],
    ['Descontos', result.resumo.descontos],
    ['Saldo de salário', result.resumo.saldo],
    ['13º proporcional', result.resumo.decimo],
    ['Férias proporcionais', result.resumo.feriasProporcionais],
    ['Férias vencidas', result.resumo.feriasVencidas],
    ['Aviso prévio', result.resumo.aviso],
    ['Multa do FGTS', result.resumo.multaFgts]
  ].map(([label, value]) => `<div class="calc-tile"><span>${label}</span><strong>${escapeHtml(displayMoney(value, formatCurrency))}</strong></div>`).join('');
  const verbas = result.verbas.map(verba => `<tr>
    <td>${verba.natureza === 'desconto' ? '<span class="calc-species is-negative">Desconto</span>' : '<span class="calc-species">Provento</span>'}</td>
    <td>${escapeHtml(verba.descricao)}</td>
    <td>${escapeHtml(verba.fundamento)}</td>
    <td class="calc-money">${escapeHtml(displayMoney(verba.valor, formatCurrency))}</td>
  </tr>`).join('');
  const parametros = result.parametros;
  return `<h3>Resumo</h3>
    <div class="calc-summary" aria-live="polite">${tiles}
      <div class="calc-tile is-total"><span>Líquido a pagar</span><strong>${escapeHtml(displayMoney(result.resumo.liquido, formatCurrency))}</strong></div>
    </div>
    <h3>Verbas</h3>
    <div class="calc-result-table">
      <table>
        <caption class="sr-only">Verbas rescisórias</caption>
        <thead><tr>
          <th scope="col">Natureza</th>
          <th scope="col">Verba</th>
          <th scope="col">Fundamento</th>
          <th scope="col" class="calc-money">Valor</th>
        </tr></thead>
        <tbody>${verbas}</tbody>
      </table>
    </div>
    <h3>Parâmetros da rescisão</h3>
    <div class="calc-memorial">
      <details open><summary>${escapeHtml(result.tipoDesligamento)} · aviso ${escapeHtml(parametros.aviso)}</summary>
        <dl>
          <div><dt>Anos completos</dt><dd>${escapeHtml(String(parametros.anosCompletos))}</dd></div>
          <div><dt>Aviso (dias-base)</dt><dd>${escapeHtml(String(parametros.avisoDiasBase))}</dd></div>
          <div><dt>Projeção</dt><dd>${escapeHtml(parametros.projecaoAte || 'sem projeção')}</dd></div>
          <div><dt>Avos 13º / férias</dt><dd>${escapeHtml(`${parametros.avos.decimo}/12 · ${parametros.avos.ferias}/12`)}</dd></div>
          <div><dt>Multa FGTS</dt><dd>${escapeHtml(`${parametros.multaPercentual}%`)}</dd></div>
        </dl>
      </details>
    </div>
    <h3>Avisos</h3>
    <div class="calc-sources">${result.avisos.map(aviso => `<span>${escapeHtml(aviso)}</span>`).join('')}</div>`;
}

function renderTransicoes(transicoes, escapeHtml) {
  const faltas = registro => {
    if (!registro) return '—';
    if (registro.aplicavel === false) return 'Regra não aplicável';
    const partes = [];
    if (registro.tempoMeses) partes.push(`${registro.tempoMeses} mes(es) de tempo`);
    if (registro.idadeMeses) partes.push(`${registro.idadeMeses} mes(es) de idade`);
    if (registro.pontos) partes.push(`${registro.pontos} ponto(s)`);
    if (registro.carenciaMeses) partes.push(`${registro.carenciaMeses} mes(es) de carência`);
    return partes.length > 0 ? partes.join(' · ') : '—';
  };
  const rows = transicoes.regras.map(regra => `<tr>
    <td>${escapeHtml(regra.nome)}<small> ${escapeHtml(regra.fundamento)}</small>${regra.observacao ? `<small> ${escapeHtml(regra.observacao)}</small>` : ''}</td>
    <td><span class="calc-species${regra.elegivel ? '' : ' is-negative'}">${regra.elegivel ? 'Elegível' : 'Não elegível'}</span></td>
    <td>${escapeHtml(faltas(regra.faltas))}</td>
    <td>${escapeHtml(regra.rmi)}</td>
  </tr>`).join('');
  return `<h3>Regras de transição (EC 103/2019)</h3>
    <div class="calc-result-table">
      <table>
        <caption class="sr-only">Comparador de regras de transição</caption>
        <thead><tr>
          <th scope="col">Regra</th>
          <th scope="col">Status</th>
          <th scope="col">Faltas</th>
          <th scope="col">RMI</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <div class="calc-sources">${transicoes.observacoes.map(observacao => `<span>${escapeHtml(observacao)}</span>`).join('')}</div>`;
}

function renderCorrecaoTable(correcao, escapeHtml, formatCurrency) {
  const linhas = correcao.parcelas.map((parcela, index) => {
    const descartada = correcao.parcelasDescartadas.includes(parcela.competencia);
    return `<tr class="${descartada ? 'is-descartada' : ''}" data-correcao-row="${index}">
      <td>${index + 1}</td>
      <td>${escapeHtml(parcela.competencia)}</td>
      <td class="calc-money">${escapeHtml(displayMoney(parcela.salario, formatCurrency))}</td>
      <td class="calc-money">${escapeHtml(displayMoney(parcela.teto, formatCurrency))}</td>
      <td class="calc-money">${escapeHtml(displayMoney(parcela.considerado, formatCurrency))}</td>
      <td class="calc-money">${escapeHtml(parcela.indice)}</td>
      <td class="calc-money">${escapeHtml(displayMoney(parcela.corrigido, formatCurrency))}</td>
      <td>${descartada ? 'Descartada' : 'Considerada'}</td>
    </tr>`;
  }).join('');
  return `<h3>Correção por competência</h3>
    <div class="calc-result-table" data-calc-correcao>
      <table>
        <caption class="sr-only">Salários corrigidos com teto da época e INPC até ${escapeHtml(correcao.referencia)}</caption>
        <thead><tr>
          <th scope="col">Nº</th>
          <th scope="col">Competência</th>
          <th scope="col" class="calc-money">Salário</th>
          <th scope="col" class="calc-money">Teto da época</th>
          <th scope="col" class="calc-money">Considerado</th>
          <th scope="col" class="calc-money">Índice</th>
          <th scope="col" class="calc-money">Corrigido</th>
          <th scope="col">Situação</th>
        </tr></thead>
        <tbody>${linhas}</tbody>
      </table>
    </div>
    <p class="calc-hint">Referência ${escapeHtml(correcao.referencia)} · PBC de ${correcao.pbc} · ${correcao.consideradas} consideradas · ${correcao.descartadas} descartadas · soma considerada ${escapeHtml(displayMoney(correcao.somaConsiderada, formatCurrency))} · média ${escapeHtml(displayMoney(correcao.media, formatCurrency))}</p>`;
}

function renderPrevidenciarioResult(result, escapeHtml, formatCurrency) {
  const tiles = [
    ['Competências', String(result.resumo.competencias)],
    ['Carência (meses)', String(result.resumo.carenciaMeses)],
    ['Soma dos salários', result.resumo.somaSalarios],
    ['Divisor', String(result.parametros.divisor)],
    ['Média (SB)', result.resumo.salarioBeneficio],
    ['Coeficiente', `${result.resumo.coeficiente}%`]
  ].map(([label, value]) => `<div class="calc-tile"><span>${escapeHtml(label)}</span><strong>${escapeHtml(/^\d+(\.\d+)?$/.test(value) && (label.includes('salários') || label === 'Média (SB)') ? displayMoney(value, formatCurrency) : value)}</strong></div>`).join('');
  const limite = result.resumo.limiteAplicado
    ? `<div><dt>Limite aplicado</dt><dd>${escapeHtml(result.resumo.limiteAplicado)}${result.resumo.teto ? ` · teto ${escapeHtml(displayMoney(result.resumo.teto, formatCurrency))}` : ''}${result.resumo.piso ? ` · piso ${escapeHtml(displayMoney(result.resumo.piso, formatCurrency))}` : ''}</dd></div>`
    : '';
  const memoria = result.memoria.map(entry => `<li>${escapeHtml(entry.descricao)} — ${escapeHtml(entry.tipo === 'coeficiente' ? entry.valor : displayMoney(entry.valor, formatCurrency))}</li>`).join('');
  return `<h3>Resumo</h3>
    <div class="calc-summary" aria-live="polite">${tiles}
      <div class="calc-tile is-total"><span>RMI</span><strong>${escapeHtml(displayMoney(result.resumo.rmi, formatCurrency))}</strong></div>
    </div>
    ${result.correcao ? renderCorrecaoTable(result.correcao, escapeHtml, formatCurrency) : ''}
    <h3>Memória de cálculo</h3>
    <div class="calc-memorial">
      <details open><summary>Salário de benefício e coeficiente</summary>
        <dl>
          <div><dt>Primeira competência</dt><dd>${escapeHtml(result.primeiraCompetencia)}</dd></div>
          <div><dt>Última competência</dt><dd>${escapeHtml(result.ultimaCompetencia)}</dd></div>
          <div><dt>Tempo</dt><dd>${escapeHtml(`${result.parametros.anos} anos e ${result.parametros.mesesRestantes} meses`)}</dd></div>
          <div><dt>RMI antes dos limites</dt><dd>${escapeHtml(displayMoney(result.resumo.rmiBruta, formatCurrency))}</dd></div>
          ${limite}
          <ul class="calc-memoria-lista">${memoria}</ul>
        </dl>
      </details>
    </div>
    <h3>Avisos</h3>
    <div class="calc-sources">${result.avisos.map(aviso => `<span>${escapeHtml(aviso)}</span>`).join('')}</div>
    ${result.transicoes ? renderTransicoes(result.transicoes, escapeHtml) : ''}`;
}

const TEMPO_TIPOS = [
  ['empregado', 'Empregado'],
  ['empregado_domestico', 'Empregado doméstico'],
  ['contribuinte_individual', 'Contribuinte individual'],
  ['avulso', 'Trabalhador avulso'],
  ['facultativo', 'Facultativo'],
  ['rural', 'Rural'],
  ['especial', 'Especial'],
  ['servidor', 'Servidor']
];

function renderVinculoRow(vinculo, index, escapeHtml) {
  const tipos = TEMPO_TIPOS.map(([value, label]) => `<option value="${value}"${vinculo.tipo === value ? ' selected' : ''}>${escapeHtml(label)}</option>`).join('');
  return `<tr data-vinculo-row="${index}">
    <td><input data-tempo-vinculo-field="inicio" data-vinculo-index="${index}" type="date" value="${escapeHtml(vinculo.inicio || '')}" aria-label="Início do vínculo ${index + 1}"></td>
    <td><input data-tempo-vinculo-field="fim" data-vinculo-index="${index}" type="date" value="${escapeHtml(vinculo.fim || '')}" aria-label="Fim do vínculo ${index + 1}"></td>
    <td><select data-tempo-vinculo-field="tipo" data-vinculo-index="${index}" aria-label="Tipo do vínculo ${index + 1}">${tipos}</select></td>
    <td class="calc-money"><input data-tempo-vinculo-field="fator" data-vinculo-index="${index}" inputmode="decimal" value="${escapeHtml(vinculo.fator || '')}" placeholder="1" aria-label="Fator do vínculo ${index + 1}"></td>
    <td><button type="button" class="calc-icon-button" data-calc-action="remove-vinculo" data-vinculo-index="${index}" aria-label="Remover vínculo ${index + 1}" title="Remover vínculo">${icon('delete')}</button></td>
  </tr>`;
}

function renderTempoResultado(resultado, escapeHtml, formatCurrency) {
  const blocos = [];
  if (resultado.tempo) {
    const tempo = resultado.tempo;
    const vinculos = tempo.vinculos.map(vinculo => `<tr class="${vinculo.sobreposto ? 'is-descartada' : ''}" data-vinculo-resultado="${vinculo.indice}">
      <td>${vinculo.indice}</td>
      <td>${escapeHtml(vinculo.inicio)} a ${escapeHtml(vinculo.fim)}</td>
      <td>${escapeHtml(vinculo.tipo)}</td>
      <td>${escapeHtml(String(vinculo.fator))}</td>
      <td class="calc-money">${vinculo.dias}</td>
      <td class="calc-money">${vinculo.diasEfetivos}</td>
      <td>${vinculo.sobreposto ? 'Sobreposto' : vinculo.concomitante ? 'Concomitante (parcial)' : 'Integral'}</td>
    </tr>`).join('');
    blocos.push(`<h4>Tempo de contribuição</h4>
      <div class="calc-summary">
        <div class="calc-tile"><span>Total</span><strong>${tempo.total.anos}a ${tempo.total.meses}m ${tempo.total.dias}d</strong></div>
        <div class="calc-tile"><span>Dias efetivos</span><strong>${tempo.totalDiasEfetivos}</strong></div>
        <div class="calc-tile"><span>Carência (meses)</span><strong>${tempo.carenciaMeses}</strong></div>
        <div class="calc-tile"><span>Até EC 20 (dias)</span><strong>${tempo.marcos.ateEc20}</strong></div>
        <div class="calc-tile"><span>Até EC 103 (dias)</span><strong>${tempo.marcos.ateEc103}</strong></div>
        <div class="calc-tile"><span>Após EC 103 (dias)</span><strong>${tempo.marcos.aposEc103}</strong></div>
      </div>
      <div class="calc-result-table">
        <table>
          <caption class="sr-only">Vínculos processados</caption>
          <thead><tr>
            <th scope="col">#</th>
            <th scope="col">Período</th>
            <th scope="col">Tipo</th>
            <th scope="col">Fator</th>
            <th scope="col" class="calc-money">Dias</th>
            <th scope="col" class="calc-money">Efetivos</th>
            <th scope="col">Situação</th>
          </tr></thead>
          <tbody>${vinculos}</tbody>
        </table>
      </div>
      <ul class="calc-memoria-lista">${tempo.avisos.map(aviso => `<li>${escapeHtml(aviso)}</li>`).join('')}</ul>`);
  }
  if (resultado.qualidade) {
    const qualidade = resultado.qualidade;
    blocos.push(`<h4>Qualidade de segurado</h4>
      <div class="calc-summary">
        <div class="calc-tile"><span>Fim do período</span><strong>${escapeHtml(qualidade.fimPeriodo)}</strong></div>
        <div class="calc-tile"><span>Meses de período</span><strong>${qualidade.mesesPeriodo}</strong></div>
        <div class="calc-tile"><span>Situação</span><strong>${qualidade.mantemQualidade === null ? '—' : qualidade.mantemQualidade ? 'Mantém' : 'Perdida'}</strong></div>
      </div>
      <ul class="calc-memoria-lista">${qualidade.avisos.map(aviso => `<li>${escapeHtml(aviso)}</li>`).join('')}</ul>`);
  }
  return blocos.join('');
}

/**
 * Análises avançadas — os três motores portados do original na 6.43.0.
 *
 * Regras desta região:
 *  - o valor exibido é o que o SERVIDOR apurou (`data.native_result`), nunca
 *    recalculado no navegador;
 *  - `status: unsupported` não desenha valor nenhum — mostra o motivo;
 *  - `rmi: null` com regra elegível é apresentado como "não calculada", com o
 *    motivo, jamais como zero;
 *  - os avisos do envelope sempre aparecem, porque carregam os limites do modelo.
 */
/**
 * Rótulo humano do modelo de qualidade aplicado.
 *
 * O envelope devolve o código (`geral_e_facultativa`); mostrar o código cru na tela
 * não é linguagem do produto. O código continua no atributo `data-av-modelo-aplicado`
 * para o teste e para a conferência, e aqui vira frase.
 */
function rotuloModeloQualidade(modelo) {
  if (modelo === 'facultativa') return 'variante facultativa';
  if (modelo === 'geral') return 'regra geral (art. 15)';
  if (modelo === 'geral_e_facultativa') return 'regra geral e variante facultativa';
  return 'não declarado pela origem';
}

function renderAnalisesAvancadas(avancadas, escapeHtml, formatCurrency) {
  const estado = avancadas || {};
  const projecao = estado.projecao || {};
  const pensao = estado.pensao || {};
  const qualidade = estado.qualidade || {};

  const blocoAvisos = (avisos) => (Array.isArray(avisos) && avisos.length > 0
    ? `<ul class="calc-memoria-lista">${avisos.map(a => `<li>${escapeHtml(String(a))}</li>`).join('')}</ul>`
    : '');
  const blocoStatus = (envelope) => {
    const rotulo = envelope.status === 'experimental' ? 'Simulação' : envelope.status === 'unsupported' ? 'Não suportado' : escapeHtml(String(envelope.status || '—'));
    return `<p class="calc-hint" data-av-status="${escapeHtml(String(envelope.status || ''))}"><strong>${rotulo}</strong> · validação jurídica: não · direito verificado: não</p>`;
  };

  /* --- Projeção --- */
  const rProjecao = projecao.resultado || null;
  const nProjecao = rProjecao?.data?.native_result || null;
  let saidaProjecao = '';
  if (rProjecao && !nProjecao) {
    saidaProjecao = `${blocoStatus(rProjecao)}
      <p class="calc-feedback" role="status" data-av-projecao-sem-regra>Nenhuma regra elegível foi atingida no limite de simulação. Nenhum valor é apresentado.</p>
      ${blocoAvisos(rProjecao.warnings)}`;
  } else if (nProjecao) {
    const tiles = [];
    if (nProjecao.der) tiles.push(`<div class="calc-tile"><span>DER projetada</span><strong>${escapeHtml(String(nProjecao.der))}</strong></div>`);
    tiles.push(`<div class="calc-tile"><span>Meses simulados</span><strong>${escapeHtml(String(nProjecao.mesesSimulados))}</strong></div>`);
    if (nProjecao.idadeDerAnos !== null && nProjecao.idadeDerAnos !== undefined) {
      tiles.push(`<div class="calc-tile"><span>Idade na DER</span><strong>${escapeHtml(String(nProjecao.idadeDerAnos))} anos</strong></div>`);
    }
    if (nProjecao.tempoDerAnos !== null && nProjecao.tempoDerAnos !== undefined) {
      tiles.push(`<div class="calc-tile"><span>Tempo na DER</span><strong>${escapeHtml(String(nProjecao.tempoDerAnos))} anos</strong></div>`);
    }
    if (nProjecao.salarioBeneficio) {
      tiles.push(`<div class="calc-tile"><span>Salário de benefício</span><strong>${escapeHtml(displayMoney(nProjecao.salarioBeneficio, formatCurrency))}</strong></div>`);
    }
    tiles.push(nProjecao.rmi
      ? `<div class="calc-tile"><span>RMI projetada</span><strong>${escapeHtml(displayMoney(nProjecao.rmi, formatCurrency))}</strong></div>`
      : `<div class="calc-tile" data-av-rmi-nao-calculada><span>RMI projetada</span><strong>não calculada</strong></div>`);
    saidaProjecao = `${blocoStatus(rProjecao)}
      <div class="calc-summary">${tiles.join('')}</div>
      ${nProjecao.regraNome ? `<p class="calc-hint">Regra: ${escapeHtml(nProjecao.regraNome)}${nProjecao.criterioRmi ? ` · critério da RMI: ${escapeHtml(String(nProjecao.criterioRmi))}` : ''}</p>` : ''}
      ${blocoAvisos(rProjecao.warnings)}`;
  }

  /* --- Pensão --- */
  const rPensao = pensao.resultado || null;
  const nPensao = rPensao?.data?.native_result || null;
  let saidaPensao = '';
  if (rPensao && !nPensao) {
    saidaPensao = `${blocoStatus(rPensao)}<p class="calc-feedback" role="status">A acumulação não produziu resultado para esta entrada.</p>${blocoAvisos(rPensao.warnings)}`;
  } else if (nPensao) {
    const linhas = nPensao.incomes.map(item => `<li>Renda ${item.originalIndex + 1}: ${escapeHtml(displayMoney(item.originalAmount, formatCurrency))} → ${escapeHtml(displayMoney(item.receivedAmount, formatCurrency))}${item.integral ? ' (integral)' : item.receivedPercentage ? ` (${escapeHtml(item.receivedPercentage)}%)` : ''}</li>`).join('');
    saidaPensao = `${blocoStatus(rPensao)}
      <div class="calc-summary">
        <div class="calc-tile"><span>Renda integral</span><strong>${escapeHtml(displayMoney(nPensao.integralIncome, formatCurrency))}</strong></div>
        <div class="calc-tile"><span>Total reduzido</span><strong>${escapeHtml(displayMoney(nPensao.reducedTotal, formatCurrency))}</strong></div>
        <div class="calc-tile"><span>Total combinado</span><strong>${escapeHtml(displayMoney(nPensao.combinedTotal, formatCurrency))}</strong></div>
        <div class="calc-tile"><span>Arredondamento</span><strong>${escapeHtml(String(nPensao.rounding))}</strong></div>
      </div>
      <ul class="calc-memoria-lista">${linhas}</ul>
      ${blocoAvisos(rPensao.warnings)}`;
  }

  /* --- Qualidade de segurado --- */
  const rQualidade = qualidade.resultado || null;
  const nQualidade = rQualidade?.data?.native_result || null;
  let saidaQualidade = '';
  if (rQualidade && !nQualidade) {
    saidaQualidade = `${blocoStatus(rQualidade)}
      <p class="calc-feedback" role="status" data-av-qualidade-sem-modelo>Nenhum modelo de qualidade de segurado se aplica a esta entrada.</p>
      ${blocoAvisos(rQualidade.warnings)}`;
  } else if (nQualidade) {
    const partes = [];
    if (nQualidade.facultativa) {
      const f = nQualidade.facultativa;
      partes.push(`<h5>Variante facultativa (experimental)</h5>
        <div class="calc-summary">
          <div class="calc-tile"><span>Meses de graça</span><strong>${escapeHtml(String(f.graceMonths))}</strong></div>
          <div class="calc-tile"><span>Último mês de graça</span><strong>${escapeHtml(String(f.lastGraceMonth))}</strong></div>
          <div class="calc-tile"><span>Prazo</span><strong>${escapeHtml(String(f.latestPaymentDate))}</strong></div>
          <div class="calc-tile"><span>Perda da qualidade</span><strong>${escapeHtml(String(f.qualityLossDate))}</strong></div>
        </div>
        ${blocoAvisos(f.explanation)}`);
    }
    if (nQualidade.geral) {
      const g = nQualidade.geral;
      partes.push(`<h5>Regra geral (art. 15 da Lei 8.213/1991)</h5>
        <div class="calc-summary">
          <div class="calc-tile"><span>Meses de período</span><strong>${escapeHtml(String(g.mesesPeriodo))}</strong></div>
          <div class="calc-tile"><span>Prorrogação</span><strong>${g.prorrogacao ? 'aplicada' : 'não'}</strong></div>
          <div class="calc-tile"><span>Fim do período</span><strong>${escapeHtml(String(g.fimPeriodo))}</strong></div>
          <div class="calc-tile"><span>Mantém qualidade</span><strong>${g.mantemQualidade === null ? 'não avaliado' : g.mantemQualidade ? 'sim' : 'não'}</strong></div>
        </div>
        ${blocoAvisos(g.avisos)}`);
    }
    saidaQualidade = `${blocoStatus(rQualidade)}<p class="calc-hint" data-av-modelo-aplicado="${escapeHtml(String(rQualidade.modelo_aplicado || ''))}">Modelo aplicado: ${escapeHtml(rotuloModeloQualidade(rQualidade.modelo_aplicado))}</p>${partes.join('')}${blocoAvisos(rQualidade.warnings)}`;
  }

  const sexoOptions = [['feminino', 'Feminino'], ['masculino', 'Masculino']]
    .map(([v, l]) => `<option value="${v}"${projecao.sexo === v ? ' selected' : ''}>${escapeHtml(l)}</option>`).join('');
  const categoriaOptions = [['facultative', 'Facultativo'], ['employee', 'Empregado'], ['individual_contributor', 'Contribuinte individual'], ['other', 'Outro']]
    .map(([v, l]) => `<option value="${v}"${qualidade.insuredCategory === v ? ' selected' : ''}>${escapeHtml(l)}</option>`).join('');
  const arredondamentoOptions = [['half-up', 'Meio para cima'], ['half-even', 'Meio par']]
    .map(([v, l]) => `<option value="${v}"${pensao.rounding === v ? ' selected' : ''}>${escapeHtml(l)}</option>`).join('');

  return `<section class="calc-avancadas" aria-labelledby="calcAvancadasHeading">
    <h4 id="calcAvancadasHeading">Análises avançadas (projeção, pensão e qualidade)</h4>
    <p class="calc-hint">Três cálculos separados do principal. Nenhum confirma direito: todos são simulações com as premissas informadas.</p>

    <div class="calc-av-card" data-av-card="projecao">
      <h5>Projeção de aposentadoria</h5>
      <p class="calc-hint">Assume contribuições contínuas com salário fixo entre a primeira e a última competência informadas. Períodos sem contribuição, tempo especial, rural e concomitância não são simulados.</p>
      <div class="calc-row">
        <label class="calc-field"><span>Sexo</span><select data-av-field="projecao.sexo">${sexoOptions}</select></label>
        <label class="calc-field"><span>Nascimento</span><input type="date" data-av-field="projecao.dataNascimento" value="${escapeHtml(projecao.dataNascimento || '')}"></label>
        <label class="calc-field"><span>Data de referência</span><input type="date" data-av-field="projecao.dataReferencia" value="${escapeHtml(projecao.dataReferencia || '')}"></label>
      </div>
      <div class="calc-row">
        <label class="calc-field"><span>Primeira competência</span><input data-av-field="projecao.primeiraCompetencia" placeholder="AAAA-MM" value="${escapeHtml(projecao.primeiraCompetencia || '')}"></label>
        <label class="calc-field"><span>Última competência (opcional)</span><input data-av-field="projecao.ultimaCompetencia" placeholder="padrão: mês da data de referência" value="${escapeHtml(projecao.ultimaCompetencia || '')}"></label>
        <label class="calc-field"><span>Salário de contribuição</span><input data-av-field="projecao.salarioContribuicao" inputmode="decimal" value="${escapeHtml(projecao.salarioContribuicao || '')}"></label>
      </div>
      <div class="calc-row">
        <label class="calc-field"><span>Meses anteriores a 1994-07 (opcional)</span><input data-av-field="projecao.mesesContribuicaoAnteriores" inputmode="numeric" placeholder="contam para tempo, não para o PBC" value="${escapeHtml(projecao.mesesContribuicaoAnteriores || '')}"></label>
        <label class="calc-field"><span>Expectativa de sobrevida (opcional)</span><input data-av-field="projecao.expectativaSobrevida" inputmode="decimal" placeholder="tábua IBGE, para o pedágio de 50%" value="${escapeHtml(projecao.expectativaSobrevida || '')}"></label>
        <label class="calc-field"><span>Regra alvo (opcional)</span>
          <select data-av-field="projecao.regraAlvo">
            <option value=""${!projecao.regraAlvo ? ' selected' : ''}>Primeira elegível</option>
            <option value="pontos"${projecao.regraAlvo === 'pontos' ? ' selected' : ''}>Pontos</option>
            <option value="idade-progressiva"${projecao.regraAlvo === 'idade-progressiva' ? ' selected' : ''}>Idade progressiva</option>
            <option value="pedagio-50"${projecao.regraAlvo === 'pedagio-50' ? ' selected' : ''}>Pedágio de 50%</option>
            <option value="pedagio-100"${projecao.regraAlvo === 'pedagio-100' ? ' selected' : ''}>Pedágio de 100%</option>
            <option value="idade-permanente"${projecao.regraAlvo === 'idade-permanente' ? ' selected' : ''}>Idade permanente</option>
          </select>
        </label>
      </div>
      <div class="calc-actions">
        <button type="button" class="button ghost" data-calc-action="projetar-aposentadoria"${projecao.loading ? ' disabled' : ''}>${icon('calculations')}<span>${projecao.loading ? 'Projetando...' : 'Projetar aposentadoria'}</span></button>
      </div>
      ${projecao.error ? `<p class="calc-feedback" role="alert">${escapeHtml(projecao.error)}</p>` : ''}
      ${saidaProjecao}
    </div>

    <div class="calc-av-card" data-av-card="pensao">
      <h5>Acumulação de pensões</h5>
      <p class="calc-hint">Maior renda integral; as demais por faixas de 100%, 60%, 40% e 20% sobre a base informada, com excedente a 10%. A base é informada por você e <strong>não</strong> é índice oficial.</p>
      <div class="calc-row">
        <label class="calc-field"><span>Data de referência</span><input type="date" data-av-field="pensao.referenceDate" value="${escapeHtml(pensao.referenceDate || '')}"></label>
        <label class="calc-field"><span>Base das faixas</span><input data-av-field="pensao.referenceBase" inputmode="decimal" value="${escapeHtml(pensao.referenceBase || '')}"></label>
        <label class="calc-field"><span>Arredondamento</span><select data-av-field="pensao.rounding">${arredondamentoOptions}</select></label>
      </div>
      <label class="calc-field"><span>Rendas (uma por linha, ou separadas por ponto e vírgula)</span>
        <textarea rows="3" data-av-field="pensao.rendas" placeholder="3000.00&#10;2500.00">${escapeHtml(pensao.rendas || '')}</textarea>
      </label>
      <div class="calc-actions">
        <button type="button" class="button ghost" data-calc-action="acumular-pensoes"${pensao.loading ? ' disabled' : ''}>${icon('calculations')}<span>${pensao.loading ? 'Acumulando...' : 'Acumular pensões'}</span></button>
      </div>
      ${pensao.error ? `<p class="calc-feedback" role="alert">${escapeHtml(pensao.error)}</p>` : ''}
      ${saidaPensao}
    </div>

    <div class="calc-av-card" data-av-card="qualidade">
      <h5>Qualidade de segurado</h5>
      <p class="calc-hint">A regra geral usa o art. 15 da Lei 8.213/1991. A variante facultativa é experimental na origem e só se aplica a quem parou de contribuir, sem benefício em curso e na categoria facultativa.</p>
      <div class="calc-row">
        <label class="calc-field"><span>Categoria</span><select data-av-field="qualidade.insuredCategory">${categoriaOptions}</select></label>
        <label class="calc-field"><span>Última contribuição</span><input type="date" data-av-field="qualidade.ultimaContribuicao" value="${escapeHtml(qualidade.ultimaContribuicao || '')}"></label>
        <label class="calc-field"><span>Contribuições mensais</span><input data-av-field="qualidade.contribuicoesMeses" inputmode="numeric" value="${escapeHtml(qualidade.contribuicoesMeses || '')}"></label>
        <label class="calc-field"><span>Data de referência</span><input type="date" data-av-field="qualidade.dataReferencia" value="${escapeHtml(qualidade.dataReferencia || '')}"></label>
      </div>
      <div class="calc-row">
        <label class="calc-check-wrap"><input type="checkbox" data-av-field="qualidade.parouDeContribuir"${qualidade.parouDeContribuir ? ' checked' : ''}><span>Parou de contribuir</span></label>
        <label class="calc-check-wrap"><input type="checkbox" data-av-field="qualidade.recebeBeneficio"${qualidade.recebeBeneficio ? ' checked' : ''}><span>Recebe benefício atualmente</span></label>
        <label class="calc-check-wrap"><input type="checkbox" data-av-field="qualidade.desempregoComprovado"${qualidade.desempregoComprovado ? ' checked' : ''}><span>Desemprego comprovado</span></label>
      </div>
      <div class="calc-actions">
        <button type="button" class="button ghost" data-calc-action="avaliar-qualidade"${qualidade.loading ? ' disabled' : ''}>${icon('check')}<span>${qualidade.loading ? 'Avaliando...' : 'Avaliar qualidade'}</span></button>
      </div>
      ${qualidade.error ? `<p class="calc-feedback" role="alert">${escapeHtml(qualidade.error)}</p>` : ''}
      ${saidaQualidade}
    </div>
  </section>`;
}

function renderComplementar(complementar, escapeHtml, formatCurrency) {
  const estado = complementar || {};
  const grauOptions = [['grave', 'Grave'], ['moderada', 'Moderada'], ['leve', 'Leve']]
    .map(([value, label]) => `<option value="${value}"${estado.grau === value ? ' selected' : ''}>${escapeHtml(label)}</option>`).join('');
  const resultado = estado.resultado || {};
  const blocos = [];
  if (resultado.pcd) {
    const pcd = resultado.pcd;
    const requisitos = pcd.requisitos.map(item => `<li>${escapeHtml(item.requisito)}: ${item.cumprido ? 'cumprido' : `faltam ${item.faltamMeses ?? item.minimoMeses - item.atualMeses} meses`} (${item.atualMeses} de ${item.minimoMeses} meses)</li>`).join('');
    blocos.push(`<h5>Aposentadoria da PcD (LC 142/2013)</h5>
      <div class="calc-summary">
        <div class="calc-tile"><span>Situação</span><strong>${pcd.elegivel ? 'Elegível' : 'Não elegível'}</strong></div>
        <div class="calc-tile"><span>Tempo mínimo</span><strong>${pcd.tempoMinimoMeses} meses</strong></div>
        <div class="calc-tile"><span>Carência mínima</span><strong>${pcd.carenciaMinimaMeses} meses</strong></div>
        <div class="calc-tile"><span>RMI (100%)</span><strong>${pcd.rmi ? escapeHtml(displayMoney(pcd.rmi, formatCurrency)) : '—'}</strong></div>
      </div>
      <ul class="calc-memoria-lista">${requisitos}</ul>
      <ul class="calc-memoria-lista">${pcd.avisos.map(aviso => `<li>${escapeHtml(aviso)}</li>`).join('')}</ul>`);
  }
  if (resultado.fator) {
    const fator = resultado.fator;
    blocos.push(`<h5>Fator previdenciário</h5>
      <div class="calc-summary">
        <div class="calc-tile"><span>Fator</span><strong>${escapeHtml(fator.fator)}</strong></div>
        <div class="calc-tile"><span>Tempo (anos)</span><strong>${escapeHtml(fator.tempoContribuicaoAnos)}</strong></div>
        <div class="calc-tile"><span>Expectativa (anos)</span><strong>${escapeHtml(String(fator.expectativaSobrevidaAnos))}</strong></div>
      </div>
      <ul class="calc-memoria-lista">${fator.avisos.map(aviso => `<li>${escapeHtml(aviso)}</li>`).join('')}</ul>`);
  }
  if (resultado.retorno) {
    const retorno = resultado.retorno;
    blocos.push(`<h5>Retorno do benefício (ROI)</h5>
      <div class="calc-summary">
        <div class="calc-tile"><span>Bruto com 13º</span><strong>${escapeHtml(displayMoney(retorno.brutoComDecimo, formatCurrency))}</strong></div>
        <div class="calc-tile"><span>IRRF mensal</span><strong>${escapeHtml(displayMoney(retorno.irrfMensal, formatCurrency))}</strong></div>
        <div class="calc-tile"><span>Líquido projetado</span><strong>${escapeHtml(displayMoney(retorno.liquido, formatCurrency))}</strong></div>
        <div class="calc-tile"><span>Retorno sobre contribuições</span><strong>${retorno.retorno ? `${escapeHtml(retorno.retorno)}×` : '—'}</strong></div>
      </div>
      <ul class="calc-memoria-lista">${retorno.avisos.map(aviso => `<li>${escapeHtml(aviso)}</li>`).join('')}</ul>`);
  }
  return `<h4>Análise complementar (PcD, fator e retorno)</h4>
    <div class="calc-row">
      <label class="calc-field"><span>Grau de deficiência</span>
        <select data-comp-field="grau">${grauOptions}</select>
      </label>
      <label class="calc-field"><span>Expectativa de sobrevida (anos)</span>
        <input data-comp-field="expectativa" inputmode="decimal" value="${escapeHtml(estado.expectativa || '')}" placeholder="Tábua IBGE">
      </label>
      <label class="calc-field"><span>Contribuições totais (opcional)</span>
        <input data-comp-field="contribuicoesTotais" inputmode="decimal" value="${escapeHtml(estado.contribuicoesTotais || '')}" placeholder="Para o retorno">
      </label>
    </div>
    <div class="calc-actions">
      <button type="button" class="button ghost" data-calc-action="calcular-complementar"${estado.loading ? ' disabled' : ''}>${icon('check')}<span>${estado.loading ? 'Analisando...' : 'Analisar PcD, fator e retorno'}</span></button>
    </div>
    ${estado.error ? `<p class="calc-feedback" role="alert">${escapeHtml(estado.error)}</p>` : ''}
    ${blocos.join('')}
    <p class="calc-hint">PcD, fator e retorno usam o tempo e a RMI já calculados nesta tela; expectativa de sobrevida e enquadramento são informados por você.</p>`;
}

function renderTempoPanel(tempo, escapeHtml) {
  const estado = tempo || {};
  const vinculos = Array.isArray(estado.vinculos) && estado.vinculos.length > 0
    ? estado.vinculos
    : [{ id: 'vinculo-1', inicio: '', fim: '', tipo: 'empregado', fator: '' }];
  const linhas = vinculos.map((vinculo, index) => renderVinculoRow(vinculo, index, escapeHtml)).join('');
  return `<section class="calc-tempo" aria-labelledby="calcTempoHeading">
    <header class="calc-tempo-header">
      <h3 id="calcTempoHeading">Tempo de contribuição e qualidade de segurado</h3>
      <span>Opcional: preencha para incluir tempo, carência, marcos e período de graça no resultado.</span>
    </header>
    <div class="calc-row">
      <label class="calc-field"><span>Data de referência</span>
        <input data-tempo-field="dataReferencia" type="date" value="${escapeHtml(estado.dataReferencia || '')}">
      </label>
      <label class="calc-field"><span>Última contribuição</span>
        <input data-tempo-field="ultimaContribuicao" type="date" value="${escapeHtml(estado.ultimaContribuicao || '')}">
      </label>
      <label class="calc-field"><span>Contribuições mensais</span>
        <input data-tempo-field="contribuicoesMeses" inputmode="numeric" value="${escapeHtml(estado.contribuicoesMeses || '')}" placeholder="Ex.: 130">
      </label>
      <label class="calc-field calc-check"><span>Desemprego comprovado</span>
        <input data-tempo-field="desemprego" type="checkbox"${estado.desemprego ? ' checked' : ''}>
      </label>
    </div>
    <div class="calc-items">
      <table>
        <caption class="sr-only">Vínculos informados</caption>
        <thead><tr>
          <th scope="col">Início</th>
          <th scope="col">Fim</th>
          <th scope="col">Tipo</th>
          <th scope="col" class="calc-money">Fator</th>
          <th scope="col"><span class="sr-only">Ações</span></th>
        </tr></thead>
        <tbody>${linhas}</tbody>
      </table>
    </div>
    <div class="calc-actions">
      <button type="button" class="button ghost" data-calc-action="add-vinculo">${icon('add')}<span>Adicionar vínculo</span></button>
      ${/* O painel de tempo é um fluxo próprio desde a reorganização da aba: ele não
            pode depender do submit do formulário de RMI, que vive em outra superfície. */''}
      <button type="button" class="button" data-calc-action="calcular-tempo"${estado.loading ? ' disabled' : ''}>${icon('check')}<span>${estado.loading ? 'Calculando...' : 'Calcular tempo e qualidade'}</span></button>
    </div>
    ${estado.error ? `<p class="calc-feedback" role="alert">${escapeHtml(estado.error)}</p>` : ''}
    <p class="calc-hint">Tempo declaratório com conferência humana obrigatória. Concomitância desconta a sobreposição; use fator apenas com enquadramento confirmado (especial, PcD ou rural).</p>
  </section>`;
}

function renderSaveButton(form) {
  const canSave = form.podeSalvar === true && form.salvando !== true;
  const label = form.salvando ? 'Salvando...' : form.resultadoSalvoId ? 'Atualizar cálculo' : 'Salvar cálculo';
  return `<button type="button" class="button ghost" data-calc-action="salvar"${canSave ? '' : ' disabled'}>${icon('download')}<span>${label}</span></button>`;
}

function renderCalculationsSavedList(state, escapeHtml, formatCurrency) {
  const salvos = Array.isArray(state.salvos) ? state.salvos : [];
  const pendingDelete = state.pendingDelete || null;
  if (salvos.length === 0) {
    return `<section class="calc-saved" aria-labelledby="calcSavedHeading">
      <header><h3 id="calcSavedHeading">Cálculos salvos</h3><span>0</span></header>
      <p class="calc-empty-inline">Nenhum cálculo salvo ainda. Calcule e use "Salvar cálculo" para guardar a entrada e a memória no estado do escritório.</p>
    </section>`;
  }
  const rows = salvos.map(record => {
    const confirmando = pendingDelete === record.id;
    const valor = record.valor === null || record.valor === undefined ? '—' : displayMoney(record.valor, formatCurrency);
    const quando = typeof record.createdAt === 'string' ? record.createdAt.slice(0, 16).replace('T', ' ') : '—';
    const acoes = confirmando
      ? `<button type="button" class="button ghost is-danger" data-calc-action="confirmar-exclusao" data-calc-id="${escapeHtml(record.id)}">Confirmar exclusão</button>
         <button type="button" class="button ghost" data-calc-action="cancelar-exclusao">Cancelar</button>`
      : `<button type="button" class="button ghost" data-calc-action="abrir" data-calc-id="${escapeHtml(record.id)}">Abrir</button>
         <button type="button" class="button ghost" data-calc-action="excluir" data-calc-id="${escapeHtml(record.id)}">Excluir</button>`;
    return `<tr data-calc-saved="${escapeHtml(record.id)}">
      <td><span class="calc-species">${escapeHtml(record.tipo)}</span></td>
      <td>${escapeHtml(record.titulo)}${record.memoriaCompactada ? ' <small>(memória mensal resumida)</small>' : ''}</td>
      <td>${escapeHtml(quando)}</td>
      <td class="calc-money">${escapeHtml(valor)}</td>
      <td class="calc-saved-actions">${acoes}</td>
    </tr>`;
  }).join('');
  return `<section class="calc-saved" aria-labelledby="calcSavedHeading">
    <header><h3 id="calcSavedHeading">Cálculos salvos</h3><span>${salvos.length}</span></header>
    <div class="calc-result-table">
      <table>
        <caption class="sr-only">Cálculos salvos no escritório</caption>
        <thead><tr>
          <th scope="col">Tipo</th>
          <th scope="col">Título</th>
          <th scope="col">Salvo em</th>
          <th scope="col" class="calc-money">Valor</th>
          <th scope="col">Ações</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  </section>`;
}

/* ==========================================================================
 * LC 142/2013 — assistente previdenciário de grau constante (superfície aditiva)
 *
 * Consome o envelope descrito em
 * `docs/development/PREVIDENCIARIO_LC142_CONTRACT.md` §8. Regras de fidelidade
 * que a marcação abaixo não pode violar:
 *   1. `resumo.rmi === null` NUNCA vira valor zerado nem a média: a RMI é
 *      declarada "não apurada", com o motivo, e nada é apresentado no lugar.
 *   2. a média dos salários de benefício nunca é rotulada como RMI;
 *   3. a origem de cada parcela sempre traz rótulo textual — cor sozinha não
 *      informa procedência;
 *   4. `pcd.actual_entitlement_verified === false` é explicitado como
 *      "não verificado", nunca omitido.
 * Estas funções são puras: não buscam dados, não persistem e não decidem
 * sucesso. A autoridade de execução é da feature/backend.
 * ========================================================================== */

const LC142_ETAPAS = Object.freeze([
  { value: 'hipoteses', label: 'Hipóteses' },
  { value: 'assistente', label: 'Assistente' },
  { value: 'cnis', label: 'CNIS' },
  { value: 'vinculos', label: 'Vínculos' },
  { value: 'contribuicoes', label: 'Contribuições' },
  { value: 'premissas', label: 'Premissas' },
  { value: 'revisao', label: 'Revisão' },
  { value: 'resultado', label: 'Resultado' },
  { value: 'relatorios', label: 'Relatórios' }
]);

const LC142_GRAUS = Object.freeze([
  { value: 'grave', label: 'Grave' },
  { value: 'moderada', label: 'Moderada' },
  { value: 'leve', label: 'Leve' }
]);

const LC142_SEXOS = Object.freeze([
  { value: 'feminino', label: 'Feminino' },
  { value: 'masculino', label: 'Masculino' }
]);

/* Rótulos textuais de origem da parcela. A UI nunca depende só da cor: cada
 * procedência carrega nome legível e explicação curta. */
const LC142_ORIGENS = Object.freeze({
  imported: { label: 'Importado do CNIS', help: 'Salário lido do extrato oficial.' },
  declared_missing_minimum: { label: 'Declarado: piso da competência', help: 'Competência sem salário preenchida pelo piso, por hipótese declarada.' },
  declared_projection: { label: 'Declarado: teto congelado', help: 'Competência futura projetada pelo teto do mês de correção, por hipótese declarada.' },
  reviewed_overlay: { label: 'Revisado manualmente', help: 'Valor ajustado por revisão humana com motivo registrado.' }
});

const LC142_STATUS_HIPOTESE = Object.freeze({
  rascunho: { label: 'Rascunho', tone: 'is-draft' },
  bloqueado: { label: 'Bloqueado', tone: 'is-blocked' },
  simulacao: { label: 'Simulação', tone: 'is-simulation' }
});

const LC142_PERGUNTAS = Object.freeze([
  {
    id: 'grau',
    titulo: 'Grau da deficiência',
    pergunta: 'Qual o grau da deficiência reconhecida?',
    ajuda: 'A LC 142 neste perfil exige grau constante em todo o período. Graus mistos, atividade especial e CTC não são suportados.',
    tipo: 'opcoes',
    opcoes: LC142_GRAUS
  },
  {
    id: 'sexo',
    titulo: 'Sexo',
    pergunta: 'Qual o sexo considerado para o tempo exigido?',
    ajuda: 'O tempo exigido varia por sexo e grau: grave 25/20, moderada 29/24, leve 33/28 anos.',
    tipo: 'opcoes',
    opcoes: LC142_SEXOS
  },
  {
    id: 'nascimento',
    titulo: 'Nascimento',
    pergunta: 'Qual a data de nascimento?',
    ajuda: 'Serve para afastar período anterior ao nascimento e conferir idade. Não altera a DIB.',
    tipo: 'data'
  },
  {
    id: 'dib',
    titulo: 'DIB',
    pergunta: 'Qual a DIB (data de início do benefício)?',
    ajuda: 'A DIB é independente da data-base da correção. O tempo de contribuição é contado até a DIB.',
    tipo: 'data'
  },
  {
    id: 'dataBase',
    titulo: 'Data-base',
    pergunta: 'Qual a data-base da correção monetária?',
    ajuda: 'A correção usa o snapshot de índices até esta competência. Mudar a data-base não muda a DIB.',
    tipo: 'data'
  }
]);

// Sete famílias declaradas pelo servidor em POST .../lc142/relatorio.
const LC142_RELATORIOS = Object.freeze([
  { value: 'detailed', label: 'Completo (detailed)' },
  { value: 'summary', label: 'Resumo (summary)' },
  { value: 'periods', label: 'Períodos (periods)' },
  { value: 'salaries', label: 'Salários (salaries)' },
  { value: 'memory', label: 'Memória (memory)' },
  { value: 'transitions', label: 'Transições (transitions)' },
  { value: 'indicators', label: 'Indicadores (indicators)' }
]);

function lc142EtapaIndice(etapa) {
  const indice = LC142_ETAPAS.findIndex(item => item.value === etapa);
  return indice < 0 ? 0 : indice;
}

function lc142Texto(value, escapeHtml, fallback = '—') {
  if (value === null || value === undefined) return escapeHtml(fallback);
  const texto = String(value).trim();
  return escapeHtml(texto === '' ? fallback : texto);
}

/* Dinheiro do envelope chega como string decimal ("2550.00"). A formatação é
 * feita por manipulação de STRING, não por `Number`: assim o valor exibido não
 * depende do formatador injetado (produção usa `toLocaleString` em portal.js;
 * harnesses podem passar um default degenerado) e nenhuma aritmética de ponto
 * flutuante toca um valor monetário. Valor ausente é declarado com travessão —
 * jamais convertido em zero. */
function lc142Moeda(value, escapeHtml, formatCurrency) {
  if (value === null || value === undefined) return escapeHtml('—');
  const texto = String(value).trim();
  if (texto === '') return escapeHtml('—');
  const negativo = texto.startsWith('-');
  const limpo = negativo ? texto.slice(1) : texto;
  // Só formato decimal padrão ("1000", "1000.5", "1000.00") é formatado como
  // moeda; qualquer outra coisa é exibida como veio, sem inventar valor.
  if (!/^\d+(?:\.\d+)?$/.test(limpo)) return escapeHtml(texto);
  const [inteiro, fracao = ''] = limpo.split('.');
  const centavos = `${fracao}00`.slice(0, 2);
  const milhares = inteiro.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return escapeHtml(`${negativo ? '-' : ''}R$ ${milhares},${centavos}`);
}

function lc142Origem(parcela, escapeHtml) {
  const chave = String(parcela?.origem || '').trim();
  const meta = LC142_ORIGENS[chave];
  const rotulo = meta ? meta.label : (chave === '' ? 'Origem não declarada' : chave);
  const ajuda = meta ? meta.help : 'Procedência informada pelo motor sem tradução conhecida.';
  return `<span class="lc142-origem" data-origem="${escapeHtml(chave || 'desconhecida')}">
      <span class="lc142-origem-label">${escapeHtml(rotulo)}</span>
      <span class="lc142-origem-help">${escapeHtml(ajuda)}</span>
    </span>`;
}

function lc142Dias(tempo, escapeHtml) {
  if (!tempo) return escapeHtml('—');
  const anos = Number(tempo.years ?? 0);
  const meses = Number(tempo.months ?? 0);
  const dias = Number(tempo.days ?? 0);
  const rotulo = `${anos}a ${meses}m ${dias}d`;
  return `<span class="lc142-tempo" title="${escapeHtml(`${tempo.days_30_360 ?? '—'} dias 30/360`)}">${escapeHtml(rotulo)}</span>`;
}

function renderLc142Progresso(etapa, escapeHtml) {
  const atual = lc142EtapaIndice(etapa);
  const itens = LC142_ETAPAS.map((item, index) => {
    const classe = index < atual ? 'is-done' : index === atual ? 'is-current' : 'is-pending';
    const atualAttr = index === atual ? ' aria-current="step"' : '';
    const marca = index < atual ? 'Concluída' : index === atual ? 'Etapa atual' : 'Pendente';
    return `<li class="lc142-step ${classe}"${atualAttr}>
      <span class="lc142-step-index" aria-hidden="true">${index + 1}</span>
      <span class="lc142-step-label">${escapeHtml(item.label)}</span>
      <span class="sr-only"> — ${marca}</span>
    </li>`;
  }).join('');
  return `<nav class="lc142-nav" aria-label="Assistente LC 142">
    <ol class="lc142-progress">${itens}</ol>
    <p class="lc142-progress-line" role="status">Etapa ${atual + 1} de ${LC142_ETAPAS.length}: ${escapeHtml(LC142_ETAPAS[atual].label)}</p>
  </nav>`;
}

/* --- Etapa 1: hipóteses -------------------------------------------------- */

function renderLc142Hipoteses(state, escapeHtml) {
  const hipoteses = Array.isArray(state.hipoteses) ? state.hipoteses : [];
  const novoBotao = `<button type="button" class="button gold lc142-btn" data-lc142-action="nova-hipotese">${icon('add')}<span>Novo cálculo</span></button>`;
  if (hipoteses.length === 0) {
    return `<section class="lc142-block" aria-labelledby="lc142HipotesesHeading">
      <header class="lc142-block-header">
        <div>
          <p class="lc142-kicker">Aposentadoria da PcD</p>
          <h3 id="lc142HipotesesHeading">Hipóteses de cálculo</h3>
        </div>
        ${novoBotao}
      </header>
      <p class="lc142-lede">Nenhuma hipótese registrada ainda. Cada hipótese guarda o cenário declarado (grau, DIB, data-base) e o estado real em que parou: rascunho, bloqueado ou simulação.</p>
      <div class="lc142-empty">
        <p><strong>Comece por uma hipótese.</strong> O assistente faz uma pergunta por tela e permite voltar, salvar e retomar. Use o botão <em>Novo cálculo</em> no alto desta seção.</p>
      </div>
    </section>`;
  }
  const cartoes = hipoteses.map(hipotese => {
    const status = LC142_STATUS_HIPOTESE[hipotese?.status] || LC142_STATUS_HIPOTESE.rascunho;
    const quando = typeof hipotese?.atualizadoEm === 'string' ? hipotese.atualizadoEm.slice(0, 16).replace('T', ' ') : '—';
    const pendencias = Number(hipotese?.pendencias || 0);
    return `<article class="lc142-hipotese" data-hipotese-id="${escapeHtml(hipotese?.id || '')}">
      <header class="lc142-hipotese-header">
        <h4>${lc142Texto(hipotese?.titulo, escapeHtml, 'Hipótese sem título')}</h4>
        <span class="lc142-badge ${status.tone}">${escapeHtml(status.label)}</span>
      </header>
      <dl class="lc142-hipotese-meta">
        <div><dt>Grau</dt><dd>${lc142Texto(hipotese?.grau, escapeHtml)}</dd></div>
        <div><dt>DIB</dt><dd>${lc142Texto(hipotese?.dib, escapeHtml)}</dd></div>
        <div><dt>Data-base</dt><dd>${lc142Texto(hipotese?.dataBase, escapeHtml)}</dd></div>
        <div><dt>Atualizada em</dt><dd>${escapeHtml(quando)}</dd></div>
      </dl>
      <p class="lc142-hipotese-resumo">${lc142Texto(hipotese?.resumo, escapeHtml, 'Sem resultado calculado.')}</p>
      ${pendencias > 0
        ? `<p class="lc142-hipotese-pendencia">${escapeHtml(`${pendencias} pendência(s) impedem o cálculo.`)}</p>`
        : '<p class="lc142-hipotese-ok">Sem pendências registradas.</p>'}
      <div class="lc142-actions">
        <button type="button" class="button ghost lc142-btn" data-lc142-action="abrir-hipotese" data-id="${escapeHtml(hipotese?.id || '')}">${icon('chevron-right')}<span>Abrir</span></button>
      </div>
    </article>`;
  }).join('');
  return `<section class="lc142-block" aria-labelledby="lc142HipotesesHeading">
    <header class="lc142-block-header">
      <div>
        <p class="lc142-kicker">Aposentadoria da PcD</p>
        <h3 id="lc142HipotesesHeading">Hipóteses de cálculo</h3>
      </div>
      ${novoBotao}
    </header>
    <p class="lc142-lede">${escapeHtml(`${hipoteses.length} hipótese(s) nesta sessão.`)} O estado do cartão é o estado real do cenário: nada aqui simula conclusão.</p>
    <div class="lc142-hipoteses">${cartoes}</div>
  </section>`;
}

/* --- Etapa 2: assistente curto (uma pergunta por tela) -------------------- */

function renderLc142Assistente(state, escapeHtml) {
  const modoEditor = state.modoEditor === true;
  const indice = Math.min(Math.max(Number(state.passoAssistente || 0), 0), LC142_PERGUNTAS.length - 1);
  const pergunta = LC142_PERGUNTAS[indice];
  const respostas = state.respostas && typeof state.respostas === 'object' ? state.respostas : {};
  const ajudaId = `lc142Ajuda-${pergunta.id}`;
  let controle = '';
  if (pergunta.tipo === 'opcoes') {
    const opcoes = pergunta.opcoes.map(opcao => {
      const marcado = respostas[pergunta.id] === opcao.value;
      return `<button type="button" class="lc142-opcao${marcado ? ' is-escolhida' : ''}" data-lc142-action="assistente-opcao" data-pergunta="${pergunta.id}" data-valor="${opcao.value}" aria-pressed="${marcado}">${escapeHtml(opcao.label)}</button>`;
    }).join('');
    const naoSei = respostas[pergunta.id] === 'nao_sei';
    controle = `<div class="lc142-opcoes" role="group" aria-labelledby="lc142PerguntaAtual" aria-describedby="${ajudaId}">
      ${opcoes}
      <button type="button" class="lc142-opcao lc142-opcao-naosei${naoSei ? ' is-escolhida' : ''}" data-lc142-action="assistente-opcao" data-pergunta="${pergunta.id}" data-valor="nao_sei" aria-pressed="${naoSei}">Não sei</button>
    </div>`;
  } else {
    const valor = respostas[pergunta.id] && respostas[pergunta.id] !== 'nao_sei' ? respostas[pergunta.id] : '';
    const naoSei = respostas[pergunta.id] === 'nao_sei';
    controle = `<div class="lc142-campo">
      <label for="lc142CampoPergunta">${escapeHtml(pergunta.pergunta)}</label>
      <input id="lc142CampoPergunta" type="date" data-lc142-field="resposta" data-pergunta="${pergunta.id}" value="${escapeHtml(valor)}" aria-describedby="${ajudaId}">
      <button type="button" class="lc142-opcao lc142-opcao-naosei${naoSei ? ' is-escolhida' : ''}" data-lc142-action="assistente-opcao" data-pergunta="${pergunta.id}" data-valor="nao_sei" aria-pressed="${naoSei}">Não sei</button>
    </div>`;
  }
  const editorBloco = modoEditor ? `<div class="lc142-editor" data-lc142-editor>
      <h4>Editar todas as respostas</h4>
      <div class="lc142-editor-grid">
        <div class="lc142-campo"><label for="lc142EditGrau">Grau</label>
          <select id="lc142EditGrau" data-lc142-field="grau">
            ${LC142_GRAUS.map(grau => `<option value="${grau.value}"${state.grau === grau.value ? ' selected' : ''}>${escapeHtml(grau.label)}</option>`).join('')}
            <option value="nao_sei"${state.grau === 'nao_sei' ? ' selected' : ''}>Não sei</option>
          </select>
        </div>
        <div class="lc142-campo"><label for="lc142EditSexo">Sexo</label>
          <select id="lc142EditSexo" data-lc142-field="sexo">
            ${LC142_SEXOS.map(sexo => `<option value="${sexo.value}"${state.sexo === sexo.value ? ' selected' : ''}>${escapeHtml(sexo.label)}</option>`).join('')}
            <option value="nao_sei"${state.sexo === 'nao_sei' ? ' selected' : ''}>Não sei</option>
          </select>
        </div>
        <div class="lc142-campo"><label for="lc142EditNascimento">Nascimento</label>
          <input id="lc142EditNascimento" type="date" data-lc142-field="nascimento" value="${escapeHtml(state.nascimento || '')}">
        </div>
        <div class="lc142-campo"><label for="lc142EditDib">DIB</label>
          <input id="lc142EditDib" type="date" data-lc142-field="dib" value="${escapeHtml(state.dib || '')}">
        </div>
        <div class="lc142-campo"><label for="lc142EditDataBase">Data-base</label>
          <input id="lc142EditDataBase" type="date" data-lc142-field="dataBase" value="${escapeHtml(state.dataBase || '')}">
        </div>
      </div>
      <p class="lc142-hint">Campo vazio no editor não vira "não": fica como pendência na revisão.</p>
    </div>` : '';
  return `<section class="lc142-block" aria-labelledby="lc142AssistenteHeading">
    <header class="lc142-block-header">
      <div>
        <p class="lc142-kicker">Assistente · pergunta ${indice + 1} de ${LC142_PERGUNTAS.length}</p>
        <h3 id="lc142AssistenteHeading">${escapeHtml(pergunta.titulo)}</h3>
      </div>
      <span class="lc142-badge is-draft">Rascunho</span>
    </header>
    <div class="lc142-pergunta">
      <h4 id="lc142PerguntaAtual">${escapeHtml(pergunta.pergunta)}</h4>
      <p class="lc142-ajuda" id="${ajudaId}">${escapeHtml(pergunta.ajuda)}</p>
      ${controle}
      <p class="lc142-hint">Responder <strong>Não sei</strong> registra a ausência de informação como pendência. Não conta como resposta negativa e não preenche o campo.</p>
    </div>
    ${editorBloco}
    <div class="lc142-actions lc142-actions-sticky">
      <button type="button" class="button ghost lc142-btn" data-lc142-action="assistente-voltar">${icon('chevron-left')}<span>Voltar</span></button>
      <button type="button" class="button ghost lc142-btn" data-lc142-action="assistente-editor">${icon('edit')}<span>${modoEditor ? 'Ocultar editor' : 'Prefiro o editor'}</span></button>
      <button type="button" class="button ghost lc142-btn" data-lc142-action="salvar-rascunho">${icon('documents')}<span>Salvar e sair</span></button>
      <button type="button" class="button gold lc142-btn" data-lc142-action="assistente-continuar">${icon('chevron-right')}<span>Continuar</span></button>
    </div>
    ${state.erro ? `<p class="lc142-alerta is-danger" role="alert">${escapeHtml(state.erro)}</p>` : ''}
  </section>`;
}

/* --- Etapa 3: CNIS ------------------------------------------------------- */

function renderLc142Cnis(state, escapeHtml) {
  const cnis = state.cnis && typeof state.cnis === 'object' ? state.cnis : {};
  const status = String(cnis.status || 'idle');
  const emAndamento = status === 'enviando' || status === 'processando';
  const progresso = Number.isFinite(Number(cnis.progresso)) && cnis.progresso !== null && cnis.progresso !== '' ? Number(cnis.progresso) : null;
  const barra = emAndamento
    ? (progresso === null
      ? `<div class="lc142-progress-track is-indeterminate" role="progressbar" aria-label="Leitura do CNIS em andamento" aria-valuetext="Processando, sem total informado"><span class="lc142-progress-fill"></span></div>
         <p class="lc142-hint" role="status">Processando o arquivo. O servidor não informou o total de páginas, então a barra não mostra porcentagem.</p>`
      : `<div class="lc142-progress-track" role="progressbar" aria-label="Leitura do CNIS" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${progresso}"><span class="lc142-progress-fill" style="width:${Math.min(Math.max(progresso, 0), 100)}%"></span></div>
         <p class="lc142-hint" role="status">${escapeHtml(`${progresso}% concluído`)}</p>`)
    : '';
  const pendencias = Array.isArray(cnis.pendencias) ? cnis.pendencias : [];
  const resumo = cnis.resumo && typeof cnis.resumo === 'object' ? cnis.resumo : null;
  return `<section class="lc142-block" aria-labelledby="lc142CnisHeading">
    <header class="lc142-block-header">
      <div>
        <p class="lc142-kicker">Documento</p>
        <h3 id="lc142CnisHeading">CNIS</h3>
      </div>
      <span class="lc142-badge ${status === 'pronto' ? 'is-done' : status === 'erro' ? 'is-blocked' : status === 'cancelado' ? 'is-draft' : 'is-draft'}">${escapeHtml(
        status === 'enviando' ? 'Enviando'
          : status === 'processando' ? 'Processando'
            : status === 'pronto' ? 'Lido'
              : status === 'erro' ? 'Falhou'
                : status === 'cancelado' ? 'Cancelado'
                  : 'Nenhum arquivo'
      )}</span>
    </header>
    <p class="lc142-lede">Envie o extrato (PDF, planilha ou texto). A leitura é assistida e não substitui a conferência humana: pendências aparecem abaixo e precisam de decisão.</p>
    <div class="lc142-upload">
      <label class="lc142-upload-label" for="lc142CnisArquivo">Arquivo do CNIS</label>
      <input id="lc142CnisArquivo" type="file" accept=".pdf,.csv,.txt,.xlsx,.xls" data-lc142-file="cnis" aria-describedby="lc142CnisAjuda"${emAndamento ? ' disabled' : ''}>
      <p class="lc142-ajuda" id="lc142CnisAjuda">O arquivo é lido no servidor do ATRIUM. O resultado aparece aqui quando a leitura terminar.</p>
      ${cnis.arquivo ? `<p class="lc142-arquivo" data-lc142-arquivo>${escapeHtml(String(cnis.arquivo))}</p>` : ''}
      <div class="lc142-actions">
        <button type="button" class="button gold lc142-btn" data-lc142-action="cnis-enviar"${emAndamento || !cnis.arquivo ? ' disabled' : ''}>${icon('upload')}<span>${emAndamento ? 'Lendo...' : 'Ler CNIS'}</span></button>
        <button type="button" class="button ghost lc142-btn" data-lc142-action="cnis-cancelar"${emAndamento ? '' : ' disabled'}>${icon('close')}<span>Cancelar leitura</span></button>
      </div>
      ${barra}
    </div>
    ${status === 'erro' && cnis.erro ? `<div class="lc142-alerta is-danger" role="alert"><strong>Falha na leitura</strong><p>${escapeHtml(cnis.erro)}</p></div>` : ''}
    ${status === 'cancelado' ? `<div class="lc142-alerta is-warning" role="status"><strong>Leitura cancelada</strong><p>Nenhum dado foi lido. Envie o arquivo de novo.</p></div>` : ''}
    ${resumo ? `<div class="lc142-resumo-origem">
      <h4>Resumo da origem</h4>
      <dl class="lc142-dl">
        <div><dt>Fonte</dt><dd>${lc142Texto(cnis.fonte, escapeHtml, 'não declarada')}</dd></div>
        <div><dt>Arquivo</dt><dd>${lc142Texto(cnis.arquivo, escapeHtml, 'não informado')}</dd></div>
        <div><dt>Competências reconhecidas</dt><dd>${lc142Texto(resumo.competencias, escapeHtml, '—')}</dd></div>
        <div><dt>Vínculos</dt><dd>${lc142Texto(resumo.vinculos, escapeHtml, '—')}</dd></div>
        <div><dt>Ignoradas</dt><dd>${lc142Texto(resumo.ignoradas, escapeHtml, '—')}</dd></div>
      </dl>
    </div>` : ''}
    <div class="lc142-pendencias" data-lc142-pendencias>
      <h4>Pendências de origem</h4>
      ${pendencias.length === 0
        ? '<p class="lc142-hint">Nenhuma pendência registrada na leitura.</p>'
        : `<ul class="lc142-lista">${pendencias.map(item => `<li>${escapeHtml(String(item))}</li>`).join('')}</ul>`}
    </div>
    <div class="lc142-actions">
      <button type="button" class="button ghost lc142-btn" data-lc142-action="etapa" data-etapa="vinculos">${icon('chevron-right')}<span>Continuar para vínculos</span></button>
    </div>
  </section>`;
}

/* --- Etapa 4: vínculos --------------------------------------------------- */

function renderLc142Vinculos(state, escapeHtml) {
  const vinculos = Array.isArray(state.vinculos) ? state.vinculos : [];
  const cartoes = vinculos.length === 0
    ? `<div class="lc142-empty"><p><strong>Nenhum vínculo.</strong> Sem vínculo não há tempo de contribuição. Volte ao CNIS ou cadastre um vínculo manualmente.</p></div>`
    : vinculos.map(vinculo => {
      const pendente = Boolean(vinculo?.pendencia);
      return `<article class="lc142-vinculo${pendente ? ' is-pendente' : ''}" data-vinculo-id="${escapeHtml(vinculo?.id || '')}">
        <header class="lc142-vinculo-header">
          <h4>${lc142Texto(vinculo?.empresa, escapeHtml, 'Empregador não informado')}</h4>
          <span class="lc142-badge ${pendente ? 'is-blocked' : 'is-done'}">${escapeHtml(pendente ? 'Pendência' : 'Conferido')}</span>
        </header>
        <dl class="lc142-dl lc142-dl-compact">
          <div><dt>Intervalo</dt><dd>${lc142Texto(vinculo?.inicio, escapeHtml)} a ${lc142Texto(vinculo?.fim, escapeHtml)}</dd></div>
          <div><dt>Regime</dt><dd>${lc142Texto(vinculo?.regime, escapeHtml)}</dd></div>
          <div><dt>Fonte</dt><dd>${lc142Texto(vinculo?.fonte, escapeHtml)}</dd></div>
        </dl>
        ${pendente ? `<p class="lc142-pendencia-texto"><strong>Pendência:</strong> ${escapeHtml(String(vinculo.pendencia))}</p>` : ''}
        <div class="lc142-actions">
          <button type="button" class="button ghost lc142-btn" data-lc142-action="vinculo-abrir" data-id="${escapeHtml(vinculo?.id || '')}" aria-haspopup="dialog">${icon('edit')}<span>Ajustar vínculo</span></button>
        </div>
      </article>`;
    }).join('');
  return `<section class="lc142-block" aria-labelledby="lc142VinculosHeading">
    <header class="lc142-block-header">
      <div>
        <p class="lc142-kicker">Tempo</p>
        <h3 id="lc142VinculosHeading">Vínculos</h3>
      </div>
      <span class="lc142-badge is-draft">${escapeHtml(`${vinculos.length} vínculo(s)`)}</span>
    </header>
    <p class="lc142-lede">Cada vínculo traz intervalo, regime e fonte. Todo ajuste exige um motivo e fica registrado como revisado.</p>
    <div class="lc142-vinculos">${cartoes}</div>
    <div class="lc142-actions">
      <button type="button" class="button ghost lc142-btn" data-lc142-action="etapa" data-etapa="contribuicoes">${icon('chevron-right')}<span>Continuar para contribuições</span></button>
    </div>
    ${state.erro ? `<p class="lc142-alerta is-danger" role="alert">${escapeHtml(state.erro)}</p>` : ''}
  </section>`;
}

function renderLc142VinculoDrawer(state, escapeHtml) {
  const vinculo = state?.vinculoDrawer?.vinculo;
  if (!vinculo) return '';
  const motivo = String(state.vinculoDrawer?.motivo || '');
  const origem = String(state.vinculoDrawer?.origem || '');
  const erro = String(state.vinculoDrawer?.erro || '');
  const origens = [
    { value: 'imported', label: 'Importado do CNIS' },
    { value: 'reviewed_overlay', label: 'Revisado manualmente' },
    { value: 'declared_missing_minimum', label: 'Declarado: piso da competência' }
  ];
  return `<dialog class="lc142-drawer" data-lc142-drawer role="dialog" aria-modal="true" aria-labelledby="lc142DrawerTitulo" aria-describedby="lc142DrawerAjuda" tabindex="-1">
      <header class="lc142-drawer-header">
        <div>
          <p class="lc142-kicker">Ajuste com motivo</p>
          <h3 id="lc142DrawerTitulo">Ajustar vínculo</h3>
        </div>
        <button type="button" class="lc142-icon-btn" data-lc142-action="vinculo-fechar" aria-label="Fechar ajuste de vínculo">${icon('close')}</button>
      </header>
      <div class="lc142-drawer-body">
        <dl class="lc142-dl lc142-dl-compact">
          <div><dt>Empregador</dt><dd>${lc142Texto(vinculo.empresa, escapeHtml)}</dd></div>
          <div><dt>Intervalo atual</dt><dd>${lc142Texto(vinculo.inicio, escapeHtml)} a ${lc142Texto(vinculo.fim, escapeHtml)}</dd></div>
        </dl>
        <div class="lc142-campo">
          <label for="lc142DrawerInicio">Início</label>
          <input id="lc142DrawerInicio" type="date" data-lc142-drawer-field="inicio" value="${escapeHtml(vinculo.inicio || '')}" aria-describedby="lc142DrawerAjuda">
        </div>
        <div class="lc142-campo">
          <label for="lc142DrawerFim">Fim</label>
          <input id="lc142DrawerFim" type="date" data-lc142-drawer-field="fim" value="${escapeHtml(vinculo.fim || '')}">
        </div>
        <div class="lc142-campo">
          <label for="lc142DrawerOrigem">Origem informada</label>
          <select id="lc142DrawerOrigem" data-lc142-drawer-field="origem" aria-describedby="lc142DrawerAjuda">
            <option value="">Selecione a origem</option>
            ${origens.map(item => `<option value="${item.value}"${origem === item.value ? ' selected' : ''}>${escapeHtml(item.label)}</option>`).join('')}
          </select>
        </div>
        <div class="lc142-campo">
          <label for="lc142DrawerMotivo">Motivo do ajuste</label>
          <textarea id="lc142DrawerMotivo" rows="4" data-lc142-drawer-field="motivo" aria-describedby="lc142DrawerAjuda" aria-invalid="${erro ? 'true' : 'false'}">${escapeHtml(motivo)}</textarea>
          <p class="lc142-ajuda" id="lc142DrawerAjuda">O motivo é obrigatório e fica acessível no histórico do vínculo. Ajuste sem motivo não é aceito.</p>
        </div>
        ${erro ? `<p class="lc142-alerta is-danger" role="alert" id="lc142DrawerErro">${escapeHtml(erro)}</p>` : ''}
      </div>
      <footer class="lc142-drawer-footer">
        <button type="button" class="button ghost lc142-btn" data-lc142-action="vinculo-fechar">Cancelar</button>
        <button type="button" class="button gold lc142-btn" data-lc142-action="vinculo-salvar" data-id="${escapeHtml(vinculo.id || '')}">${icon('check')}<span>Salvar ajuste</span></button>
      </footer>
    </dialog>`;
}

/* --- Etapa 5: contribuições ---------------------------------------------- */

function renderLc142ParcelaDrilldown(parcela, indice, escapeHtml, formatCurrency) {
  const historico = Array.isArray(parcela?.historico) ? parcela.historico : [];
  return `<dl class="lc142-dl lc142-drilldown" data-lc142-drilldown="${indice}">
    <div><dt>Salário nominal</dt><dd>${lc142Moeda(parcela?.salario, escapeHtml, formatCurrency)}</dd></div>
    <div><dt>Teto da competência</dt><dd>${lc142Moeda(parcela?.teto, escapeHtml, formatCurrency)}</dd></div>
    <div><dt>Considerado</dt><dd>${lc142Moeda(parcela?.considerado, escapeHtml, formatCurrency)}</dd></div>
    <div><dt>Índice</dt><dd>${lc142Texto(parcela?.indice, escapeHtml)}</dd></div>
    <div><dt>Corrigido</dt><dd>${lc142Moeda(parcela?.corrigido, escapeHtml, formatCurrency)}</dd></div>
    <div><dt>Dias (30/360)</dt><dd>${lc142Texto(parcela?.dias, escapeHtml)}</dd></div>
    <div><dt>Uso</dt><dd>${parcela?.descartada === true ? 'Descartada no cálculo' : 'Considerada no cálculo'}</dd></div>
    <div><dt>Origem</dt><dd>${lc142Origem(parcela, escapeHtml)}</dd></div>
    <div><dt>Fonte</dt><dd class="lc142-fonte">${lc142Texto(parcela?.fonte, escapeHtml, 'não declarada')}</dd></div>
    <div><dt>Histórico</dt><dd>${historico.length === 0
      ? 'Sem revisões registradas.'
      : `<ul class="lc142-lista">${historico.map(item => `<li>${escapeHtml(String(item?.descricao || item))}${item?.em ? ` — ${escapeHtml(String(item.em))}` : ''}</li>`).join('')}</ul>`}</dd></div>
  </dl>`;
}

function renderLc142Parcelas(state, escapeHtml, formatCurrency) {
  const parcelas = Array.isArray(state.parcelas) ? state.parcelas : [];
  const selecionadas = new Set(Array.isArray(state.selecionadas) ? state.selecionadas.map(Number) : []);
  const resumo = state.resumoParcelas && typeof state.resumoParcelas === 'object' ? state.resumoParcelas : {};
  if (parcelas.length === 0) {
    return `<div class="lc142-empty"><p><strong>Nenhuma competência.</strong> Importe o CNIS ou cadastre competências para montar o PBC.</p></div>`;
  }
  const tiles = `<div class="lc142-tiles" aria-live="polite">
    <div class="lc142-tile"><span>Competências</span><strong>${lc142Texto(resumo.competencias ?? parcelas.length, escapeHtml)}</strong></div>
    <div class="lc142-tile"><span>Consideradas</span><strong>${lc142Texto(resumo.consideradas, escapeHtml)}</strong></div>
    <div class="lc142-tile"><span>Descartadas</span><strong>${lc142Texto(resumo.descartadas, escapeHtml)}</strong></div>
    <div class="lc142-tile"><span>Soma considerada</span><strong>${lc142Moeda(resumo.soma, escapeHtml, formatCurrency)}</strong></div>
  </div>`;
  const itens = parcelas.map((parcela, indice) => {
    const selecionada = selecionadas.has(indice);
    const descartada = parcela?.descartada === true;
    const rotulo = `${parcela?.competencia || 'competência'} — ${lc142Moeda(parcela?.corrigido, escapeHtml, formatCurrency)}`;
    return `<article class="lc142-parcela${descartada ? ' is-descartada' : ''}${selecionada ? ' is-selecionada' : ''}" data-parcela-index="${indice}">
      <div class="lc142-parcela-linha">
        <label class="lc142-check-wrap">
          <input type="checkbox" data-lc142-action="contribuicao-toggle" data-index="${indice}"${selecionada ? ' checked' : ''} aria-label="${escapeHtml(`Selecionar ${rotulo}`)}">
          <span class="sr-only">Selecionar esta competência</span>
        </label>
        <div class="lc142-parcela-resumo">
          <span class="lc142-parcela-comp">${lc142Texto(parcela?.competencia, escapeHtml)}</span>
          <span class="lc142-parcela-valor">${lc142Moeda(parcela?.corrigido, escapeHtml, formatCurrency)}</span>
          <span class="lc142-parcela-uso">${descartada ? 'Descartada' : 'Considerada'}</span>
        </div>
      </div>
      ${lc142Origem(parcela, escapeHtml)}
      <details class="lc142-detalhe">
        <summary>Ver valores nominais, teto, índice, origem e histórico</summary>
        ${renderLc142ParcelaDrilldown(parcela, indice, escapeHtml, formatCurrency)}
      </details>
    </article>`;
  }).join('');
  return `<section class="lc142-block" aria-labelledby="lc142ParcelasHeading">
    <header class="lc142-block-header">
      <div>
        <p class="lc142-kicker">PBC</p>
        <h3 id="lc142ParcelasHeading">Contribuições</h3>
      </div>
      <span class="lc142-badge is-draft">${escapeHtml(`${parcelas.length} competência(s)`)}</span>
    </header>
    ${tiles}
    <div class="lc142-lote" role="group" aria-label="Seleção em lote">
      <button type="button" class="button ghost lc142-btn" data-lc142-action="contribuicoes-selecionar-todas">${icon('list')}<span>Selecionar todas as visíveis</span></button>
      <button type="button" class="button ghost lc142-btn" data-lc142-action="contribuicoes-limpar">${icon('close')}<span>Limpar seleção</span></button>
      <button type="button" class="button ghost lc142-btn" data-lc142-action="contribuicoes-em-lote" data-modo="conferir"${selecionadas.size === 0 ? ' disabled' : ''}>${icon('check')}<span>${escapeHtml(`Conferir ${selecionadas.size} selecionada(s)`)}</span></button>
    </div>
    <p class="lc142-hint">No celular, o resumo mostra competência e valor corrigido; ao abrir a linha, aparecem valor nominal, teto, fator, corrigido, uso, origem e histórico. Na tela larga a mesma informação aparece em tabela com rolagem própria.</p>
    <div class="lc142-parcelas">${itens}</div>
    <div class="lc142-tabela-wrap" role="region" aria-label="Tabela de contribuições com rolagem própria" tabindex="0">
      <table class="lc142-tabela">
        <caption>Contribuições do PBC, com valores completos</caption>
        <thead><tr>
          <th scope="col">Competência</th>
          <th scope="col" class="lc142-money-col">Nominal</th>
          <th scope="col" class="lc142-money-col">Teto</th>
          <th scope="col" class="lc142-money-col">Considerado</th>
          <th scope="col" class="lc142-money-col">Índice</th>
          <th scope="col" class="lc142-money-col">Corrigido</th>
          <th scope="col">Uso</th>
          <th scope="col">Origem</th>
        </tr></thead>
        <tbody>${parcelas.map(parcela => `<tr class="${parcela?.descartada === true ? 'is-descartada' : ''}">
          <td>${lc142Texto(parcela?.competencia, escapeHtml)}</td>
          <td class="lc142-money-col">${lc142Moeda(parcela?.salario, escapeHtml, formatCurrency)}</td>
          <td class="lc142-money-col">${lc142Moeda(parcela?.teto, escapeHtml, formatCurrency)}</td>
          <td class="lc142-money-col">${lc142Moeda(parcela?.considerado, escapeHtml, formatCurrency)}</td>
          <td class="lc142-money-col">${lc142Texto(parcela?.indice, escapeHtml)}</td>
          <td class="lc142-money-col">${lc142Moeda(parcela?.corrigido, escapeHtml, formatCurrency)}</td>
          <td>${parcela?.descartada === true ? 'Descartada' : 'Considerada'}</td>
          <td>${lc142Origem(parcela, escapeHtml)}</td>
        </tr>`).join('')}</tbody>
      </table>
    </div>
    <div class="lc142-actions">
      <button type="button" class="button ghost lc142-btn" data-lc142-action="etapa" data-etapa="premissas">${icon('chevron-right')}<span>Continuar para premissas</span></button>
    </div>
    ${state.erro ? `<p class="lc142-alerta is-danger" role="alert">${escapeHtml(state.erro)}</p>` : ''}
  </section>`;
}

function renderLc142Capacidades(state, escapeHtml) {
  const capacidades = state.capacidades && typeof state.capacidades === 'object' ? state.capacidades : { status: 'idle' };
  const status = String(capacidades.status || 'idle');
  if (status === 'carregando') {
    return `<div class="lc142-capacidades" data-lc142-capacidades="carregando">
      <h4>O que este cálculo não cobre</h4>
      <p class="lc142-hint" role="status">Consultando o que este cálculo cobre…</p>
    </div>`;
  }
  if (status === 'erro') {
    return `<div class="lc142-capacidades" data-lc142-capacidades="erro">
      <h4>O que este cálculo não cobre</h4>
      <div class="lc142-alerta is-warning" role="status">
        <strong>Cobertura do cálculo não consultada</strong>
        <p>${lc142Texto(capacidades.erro, escapeHtml, 'A consulta de capacidades falhou.')} Isso não impede calcular, mas você não está vendo a lista declarada de limites do motor.</p>
      </div>
      <div class="lc142-actions">
        <button type="button" class="button ghost lc142-btn" data-lc142-action="carregar-capacidades">${icon('refresh')}<span>Tentar novamente</span></button>
      </div>
    </div>`;
  }
  const lista = Array.isArray(capacidades.naoSuportado) ? capacidades.naoSuportado : [];
  return `<div class="lc142-capacidades" data-lc142-capacidades="${escapeHtml(status)}">
    <h4>O que este cálculo não cobre</h4>
    <p class="lc142-hint">Veja aqui o que este cálculo não faz. Um item sem suporte é limite da ferramenta, não erro no seu caso.</p>
    ${lista.length === 0
      ? `<p class="lc142-hint">${escapeHtml(status === 'pronto' ? 'O motor não declarou limites adicionais.' : 'Limites ainda não consultados.')}</p>`
      : `<ul class="lc142-lista">${lista.map(item => `<li>${escapeHtml(String(item))}</li>`).join('')}</ul>`}
    ${capacidades.versao ? `<p class="lc142-hint">Versão do perfil: <code>${lc142Texto(capacidades.versao, escapeHtml)}</code></p>` : ''}
    ${status !== 'pronto' ? `<div class="lc142-actions"><button type="button" class="button ghost lc142-btn" data-lc142-action="carregar-capacidades">${icon('refresh')}<span>Consultar limites</span></button></div>` : ''}
  </div>`;
}

/* --- Etapa 6: premissas e índices ---------------------------------------- */

function renderLc142Premissas(state, escapeHtml) {
  /* O snapshot é o que o SERVIDOR atestou. O formato padrão vem da rota
   * `/snapshot` (`source_url`, `through`, `response_sha256`, `retrieved_at`),
   * não de campos montados no navegador. Aceitamos também os apelidos antigos
   * para não quebrar estado já salvo em rascunho. */
  const bruto = state.snapshot && typeof state.snapshot === 'object' ? state.snapshot : null;
  const cru = bruto && bruto.cru && typeof bruto.cru === 'object' ? bruto.cru : bruto;
  const temSnapshot = Boolean(cru && (cru.through || cru.corte));
  const snapshot = temSnapshot
    ? {
        fonte: cru.source_url ?? cru.fonte,
        corte: cru.through ?? cru.corte,
        sha256: cru.response_sha256 ?? cru.sha256,
        coletadoEm: cru.retrieved_at ?? cru.coletadoEm,
        competencias: Array.isArray(cru.rates) ? cru.rates.length : null
      }
    : null;
  const buscando = state.snapshotBuscando === true;
  const indices = Array.isArray(state.indices) ? state.indices : [];
  const confirmadas = state.premissasConfirmadas === true;
  return `<section class="lc142-block" aria-labelledby="lc142PremissasHeading">
    <header class="lc142-block-header">
      <div>
        <p class="lc142-kicker">Parâmetros</p>
        <h3 id="lc142PremissasHeading">Premissas, DIB e índices</h3>
      </div>
      <span class="lc142-badge ${confirmadas ? 'is-done' : 'is-draft'}">${escapeHtml(confirmadas ? 'Premissas confirmadas' : 'Não confirmadas')}</span>
    </header>
    <p class="lc142-lede">DIB e data-base são datas distintas: a DIB fecha o tempo e a carência; a data-base define até onde a correção é aplicada. Nenhuma das duas é derivada da outra.</p>
    <div class="lc142-datas">
      <div class="lc142-datas-card">
        <h4>DIB</h4>
        <p class="lc142-datas-valor" data-lc142-dib>${lc142Texto(state.dib, escapeHtml, 'não informada')}</p>
        <p class="lc142-hint">Data de início do benefício, informada pelo usuário.</p>
      </div>
      <div class="lc142-datas-card">
        <h4>Data-base da correção</h4>
        <p class="lc142-datas-valor" data-lc142-database>${lc142Texto(state.dataBase, escapeHtml, 'não informada')}</p>
        <p class="lc142-hint">Data de corte dos índices. Não altera a DIB.</p>
      </div>
    </div>
    ${snapshot ? `<div class="lc142-snapshot">
      <h4>Índices usados</h4>
      <dl class="lc142-dl">
        <div><dt>Fonte</dt><dd>${lc142Texto(snapshot.fonte, escapeHtml, 'não declarada')}</dd></div>
        <div><dt>Corte</dt><dd>${lc142Texto(snapshot.corte, escapeHtml, 'não declarado')}</dd></div>
        <div><dt>Hash</dt><dd class="lc142-hash">${lc142Texto(snapshot.sha256, escapeHtml, 'não calculado')}</dd></div>
        <div><dt>Coletado em</dt><dd>${lc142Texto(snapshot.coletadoEm, escapeHtml, 'não registrado')}</dd></div>
      </dl>
      <p class="lc142-hint">Os índices valem até a data de corte. Depois dela, nenhum índice é estimado.</p>
    </div>` : `<div class="lc142-alerta is-warning" role="status"><strong>Índices não consultados</strong><p>Sem índices e limites, o cálculo fica bloqueado. Consulte os índices oficiais antes de calcular. O servidor busca a fonte e registra a origem.</p></div>`}
    <div class="lc142-actions">
      <button type="button" class="button ${snapshot ? 'ghost' : 'gold'} lc142-btn" data-lc142-action="buscar-snapshot"${buscando ? ' disabled aria-busy="true"' : ''}>${icon('refresh')}<span>${buscando ? 'Consultando índices...' : snapshot ? 'Atualizar índices oficiais' : 'Consultar índices oficiais'}</span></button>
    </div>
    ${indices.length > 0 ? `<div class="lc142-indices">
      <h4>Índices aplicados</h4>
      <ul class="lc142-lista">${indices.map(item => `<li><span class="lc142-indice-serie">${lc142Texto(item?.serie, escapeHtml)}</span> <span class="lc142-indice-valor">${lc142Texto(item?.valor, escapeHtml)}</span> <span class="lc142-indice-fonte">${lc142Texto(item?.fonte, escapeHtml, 'fonte não declarada')}</span></li>`).join('')}</ul>
    </div>` : ''}
    <div class="lc142-confirmacao">
      <label class="lc142-check-wrap lc142-check-linha">
        <input type="checkbox" data-lc142-field="premissasConfirmadas"${confirmadas ? ' checked' : ''} aria-describedby="lc142PremissasAjuda">
        <span>Confirmo as premissas e a origem dos índices</span>
      </label>
      <p class="lc142-ajuda" id="lc142PremissasAjuda">Confirmar aqui não valida juridicamente o direito: registra que você conferiu as premissas usadas nesta simulação.</p>
    </div>
    ${renderLc142Capacidades(state, escapeHtml)}
    <div class="lc142-actions">
      <button type="button" class="button ghost lc142-btn" data-lc142-action="etapa" data-etapa="revisao">${icon('chevron-right')}<span>Continuar para revisão</span></button>
    </div>
  </section>`;
}

/* --- Etapa 7: revisão ---------------------------------------------------- */

function renderLc142Blockers(blockers, escapeHtml) {
  const lista = Array.isArray(blockers) ? blockers : [];
  if (lista.length === 0) return '';
  const itens = lista.map(blocker => `<li class="lc142-blocker" data-blocker-code="${escapeHtml(blocker?.code || '')}">
    <p class="lc142-blocker-codigo">${escapeHtml(String(blocker?.code || 'bloqueio'))}</p>
    <p class="lc142-blocker-mensagem">${lc142Texto(blocker?.message, escapeHtml, 'Bloqueio sem mensagem declarada.')}</p>
    <p class="lc142-blocker-campo">Campo: <code>${lc142Texto(blocker?.field, escapeHtml, 'não informado')}</code></p>
    <button type="button" class="button ghost lc142-btn" data-lc142-action="ir-para-campo" data-campo="${escapeHtml(blocker?.field || '')}">${icon('edit')}<span>Corrigir campo</span></button>
  </li>`).join('');
  return `<div class="lc142-bloqueio" role="alert">
    <h4>${escapeHtml(`${lista.length} bloqueio(s) impedem o cálculo`)}</h4>
    <p>Cada bloqueio aponta o campo que precisa de decisão. Nenhum valor financeiro é apresentado enquanto houver bloqueio.</p>
    <ul class="lc142-lista">${itens}</ul>
  </div>`;
}

function renderLc142Revisao(state, escapeHtml) {
  const grupos = Array.isArray(state.revisaoGrupos) ? state.revisaoGrupos : [];
  const blockers = Array.isArray(state.blockers) ? state.blockers : [];
  const confirmado = state.revisaoConfirmada === true;
  const calculando = state.calculando === true;
  const validando = state.validando === true;
  const validacao = state.validacao && typeof state.validacao === 'object' ? state.validacao : null;
  const capacidadesLista = state.capacidades && Array.isArray(state.capacidades.naoSuportado) ? state.capacidades.naoSuportado : [];
  const cartoes = grupos.length === 0
    ? '<p class="lc142-hint">Nenhum item classificado ainda.</p>'
    : grupos.map(grupo => `<div class="lc142-grupo">
      <header class="lc142-grupo-header">
        <h4>${lc142Texto(grupo?.titulo, escapeHtml)}</h4>
        <span class="lc142-badge ${grupo?.chave === 'assumido' ? 'is-draft' : grupo?.chave === 'alterado' ? 'is-simulation' : 'is-done'}">${lc142Texto(grupo?.quantidade ?? 0, escapeHtml)}</span>
      </header>
      <p class="lc142-hint">${lc142Texto(grupo?.descricao, escapeHtml)}</p>
      ${Array.isArray(grupo?.itens) && grupo.itens.length > 0
        ? `<ul class="lc142-lista">${grupo.itens.map(item => `<li>${lc142Texto(item, escapeHtml)}</li>`).join('')}</ul>`
        : '<p class="lc142-hint">Nenhum item neste grupo.</p>'}
    </div>`).join('');
  return `<section class="lc142-block" aria-labelledby="lc142RevisaoHeading">
    <header class="lc142-block-header">
      <div>
        <p class="lc142-kicker">Conferência</p>
        <h3 id="lc142RevisaoHeading">Revisão antes de calcular</h3>
      </div>
      <span class="lc142-badge ${blockers.length > 0 ? 'is-blocked' : confirmado ? 'is-done' : 'is-draft'}">${escapeHtml(blockers.length > 0 ? 'Bloqueado' : confirmado ? 'Confirmado' : 'Aguardando confirmação')}</span>
    </header>
    <p class="lc142-lede">O que veio do CNIS, o que foi alterado por revisão e o que é hipótese assumida ficam em grupos separados. Não misture as três coisas ao conferir.</p>
    <div class="lc142-grupos">${cartoes}</div>
    ${renderLc142Blockers(blockers, escapeHtml)}
    ${capacidadesLista.length > 0 ? `<div class="lc142-avisos" data-lc142-limites-revisao>
      <h4>O que este cálculo não cobre</h4>
      <ul class="lc142-lista">${capacidadesLista.map(item => `<li>${escapeHtml(String(item))}</li>`).join('')}</ul>
    </div>` : ''}
    <div class="lc142-confirmacao">
      <label class="lc142-check-wrap lc142-check-linha">
        <input type="checkbox" data-lc142-field="revisaoConfirmada"${confirmado ? ' checked' : ''} aria-describedby="lc142RevisaoAjuda"${calculando ? ' disabled' : ''}>
        <span>Confirmei os dados importados, as alterações e as hipóteses assumidas</span>
      </label>
      <p class="lc142-ajuda" id="lc142RevisaoAjuda">Sem esta confirmação o cálculo não é executado. A confirmação registra conferência humana; não valida o direito.</p>
    </div>
    ${/* O motor exige fundamentação não vazia para declarar o cenário: sem estes
        dois campos o cálculo retorna `blocked` com `lc142_review` e
        `lc142_disability_periods`, e o usuário não tinha como satisfazê-los
        pela interface. São declarações de conferência, não validação jurídica. */''}
    <div class="lc142-fundamentos">
      <h4>Fundamentação da conferência</h4>
      <div class="lc142-campo">
        <label for="lc142ReviewEvidence">Referência documental conferida</label>
        <textarea id="lc142ReviewEvidence" rows="2" data-lc142-field="reviewEvidence" aria-describedby="lc142ReviewEvidenceAjuda" placeholder="Ex.: CNIS de 18/10/2026, conferido com o extrato do segurado.">${escapeHtml(state.reviewEvidence || '')}</textarea>
        <p class="lc142-ajuda" id="lc142ReviewEvidenceAjuda">Obrigatório: descreva qual documento foi conferido. Fica registrado no cálculo.</p>
      </div>
      <div class="lc142-campo">
        <label for="lc142DisabilityEvidence">Comprovação do grau constante</label>
        <textarea id="lc142DisabilityEvidence" rows="2" data-lc142-field="disabilityEvidence" aria-describedby="lc142DisabilityEvidenceAjuda" placeholder="Ex.: laudo médico e perícia administrativa que atestam grau moderado em todo o período.">${escapeHtml(state.disabilityEvidence || '')}</textarea>
        <p class="lc142-ajuda" id="lc142DisabilityEvidenceAjuda">Obrigatório: o perfil exige grau constante em todos os períodos. Descreva a prova que sustenta isso.</p>
      </div>
    </div>
    ${validacao ? `<div class="lc142-alerta ${validacao.valido ? '' : 'is-warning'}" data-lc142-validacao role="${validacao.valido ? 'status' : 'alert'}">
      <strong>${validacao.valido ? 'Hipótese validada pelo servidor' : 'A validação do servidor apontou pendências'}</strong>
      <p>${escapeHtml(validacao.valido ? 'O cenário passou na validação de schema sem persistir nada.' : `${validacao.blockers.length} bloqueio(s) declarados. Corrija o campo indicado antes de calcular.`)}</p>
    </div>` : ''}
    <div class="lc142-actions lc142-actions-sticky">
      <button type="button" class="button ghost lc142-btn" data-lc142-action="validar-hipotese"${validando ? ' disabled' : ''} aria-busy="${validando ? 'true' : 'false'}">${icon('check')}<span>${validando ? 'Validando...' : 'Validar hipótese'}</span></button>
      ${/* Bloqueios que o usuário já resolveu digitando os fundamentos não devem
          continuar desabilitando o botão: os blockers do servidor descrevem o
          estado da ÚLTIMA validação, não o formulário atual. Mantemos apenas os
          bloqueios que ainda não têm campo correspondente preenchido. */''}
      <button type="button" class="button gold lc142-btn" data-lc142-action="calcular"${!confirmado || calculando ? ' disabled' : ''} aria-busy="${calculando ? 'true' : 'false'}">${icon('calculations')}<span>${calculando ? 'Calculando...' : 'Calcular simulação'}</span></button>
      <button type="button" class="button ghost lc142-btn" data-lc142-action="etapa" data-etapa="premissas">${icon('chevron-left')}<span>Voltar às premissas</span></button>
    </div>
    <div class="lc142-live" role="status">${calculando ? 'Cálculo em andamento. O resultado aparece quando a resposta do servidor chegar.' : validando ? 'Validando a hipótese no servidor. Nada foi persistido.' : ''}</div>
    ${state.erro ? `<p class="lc142-alerta is-danger" role="alert">${escapeHtml(state.erro)}</p>` : ''}
  </section>`;
}

/* --- Etapa 8: resultado -------------------------------------------------- */

function renderLc142Rmi(resumo, escapeHtml, formatCurrency) {
  const bruto = resumo?.rmi;
  if (bruto === null || bruto === undefined || String(bruto).trim() === '') {
    return `<div class="lc142-rmi is-absent" data-lc142-rmi-ausente>
      <span class="lc142-tile-label">RMI</span>
      <strong>Não apurada</strong>
      <p>Os requisitos de tempo exigido ou de carência não foram atingidos neste cenário, portanto nenhum valor de RMI é apresentado. Ausência de RMI não é valor zerado e não é a média.</p>
    </div>`;
  }
  return `<div class="lc142-rmi" data-lc142-rmi>
    <span class="lc142-tile-label">RMI</span>
    <strong>${lc142Moeda(bruto, escapeHtml, formatCurrency)}</strong>
    <p>Valor mensal inicial do cenário, limitado entre piso e teto da competência de correção.</p>
  </div>`;
}

function renderLc142Correcao(correcao, escapeHtml, formatCurrency) {
  if (!correcao || typeof correcao !== 'object') return '';
  const parcelas = Array.isArray(correcao.parcelas) ? correcao.parcelas : [];
  return `<section class="lc142-resultado-bloco" aria-labelledby="lc142CorrecaoHeading">
    <h4 id="lc142CorrecaoHeading">Correção por competência</h4>
    <div class="lc142-tiles">
      <div class="lc142-tile"><span>PBC</span><strong>${lc142Texto(correcao.pbc, escapeHtml)}</strong></div>
      <div class="lc142-tile"><span>Consideradas</span><strong>${lc142Texto(correcao.consideradas, escapeHtml)}</strong></div>
      <div class="lc142-tile"><span>Descartadas</span><strong>${lc142Texto(correcao.descartadas, escapeHtml)}</strong></div>
      <div class="lc142-tile is-media"><span>Média dos salários</span><strong>${lc142Moeda(correcao.media, escapeHtml, formatCurrency)}</strong></div>
    </div>
    <p class="lc142-hint" data-lc142-media-nota>A média acima é a média dos salários de benefício do PBC. Ela não é a RMI.</p>
    <div class="lc142-tabela-wrap" role="region" aria-label="Parcelas da correção com rolagem própria" tabindex="0">
      <table class="lc142-tabela">
        <caption>Parcelas do PBC com teto da época, índice e origem — valores integrais</caption>
        <thead><tr>
          <th scope="col">Nº</th>
          <th scope="col">Competência</th>
          <th scope="col" class="lc142-money-col">Salário</th>
          <th scope="col" class="lc142-money-col">Teto</th>
          <th scope="col" class="lc142-money-col">Considerado</th>
          <th scope="col" class="lc142-money-col">Índice</th>
          <th scope="col" class="lc142-money-col">Corrigido</th>
          <th scope="col">Dias</th>
          <th scope="col">Uso</th>
          <th scope="col">Origem</th>
          <th scope="col">Fonte</th>
        </tr></thead>
        <tbody>${parcelas.map((parcela, indice) => `<tr class="${parcela?.descartada === true ? 'is-descartada' : ''}">
          <td>${indice + 1}</td>
          <td>${lc142Texto(parcela?.competencia, escapeHtml)}</td>
          <td class="lc142-money-col">${lc142Moeda(parcela?.salario, escapeHtml, formatCurrency)}</td>
          <td class="lc142-money-col">${lc142Moeda(parcela?.teto, escapeHtml, formatCurrency)}</td>
          <td class="lc142-money-col">${lc142Moeda(parcela?.considerado, escapeHtml, formatCurrency)}</td>
          <td class="lc142-money-col">${lc142Texto(parcela?.indice, escapeHtml)}</td>
          <td class="lc142-money-col">${lc142Moeda(parcela?.corrigido, escapeHtml, formatCurrency)}</td>
          <td>${lc142Texto(parcela?.dias, escapeHtml)}</td>
          <td>${parcela?.descartada === true ? 'Descartada' : 'Considerada'}</td>
          <td>${lc142Origem(parcela, escapeHtml)}</td>
          <td class="lc142-fonte">${lc142Texto(parcela?.fonte, escapeHtml, 'não declarada')}</td>
        </tr>`).join('')}</tbody>
      </table>
    </div>
    <p class="lc142-hint">${escapeHtml(`Referência ${correcao.referencia ?? '—'} · descarte aplicado: ${correcao.descarte_aplicado === true ? 'sim' : 'não'} · soma considerada ${correcao.soma_considerada ?? '—'}`)}</p>
  </section>`;
}

function renderLc142Result(result, escapeHtml, formatCurrency) {
  const envelope = result && typeof result === 'object' ? result : {};
  const status = String(envelope.status || '');
  const native = envelope?.data?.native_result || null;
  const blockers = Array.isArray(envelope.blockers) ? envelope.blockers : [];
  const warnings = Array.isArray(envelope.warnings) ? envelope.warnings : [];
  if (status === 'blocked' || !native) {
    return `<section class="lc142-resultado" aria-labelledby="lc142ResultadoHeading" data-lc142-status="blocked">
      <header class="lc142-resultado-header">
        <div>
          <p class="lc142-kicker">Resultado</p>
          <h3 id="lc142ResultadoHeading">Cálculo bloqueado</h3>
        </div>
        <span class="lc142-badge is-blocked">Bloqueado</span>
      </header>
      <p class="lc142-lede">Não foi possível calcular este cenário. Nenhum valor aparece até você resolver os bloqueios.</p>
      ${renderLc142Blockers(blockers, escapeHtml)}
      ${warnings.length > 0 ? `<div class="lc142-avisos"><h4>Avisos</h4><ul class="lc142-lista">${warnings.map(item => `<li>${escapeHtml(String(item))}</li>`).join('')}</ul></div>` : ''}
      <div class="lc142-actions">
        <button type="button" class="button ghost lc142-btn" data-lc142-action="etapa" data-etapa="revisao">${icon('chevron-left')}<span>Voltar à revisão</span></button>
      </div>
    </section>`;
  }
  const resumo = native.resumo || {};
  const parametros = native.parametros || {};
  const correcao = native.correcao || {};
  const tempo = native.tempo || {};
  const pcd = native.pcd || {};
  const avisos = Array.isArray(native.avisos) ? native.avisos : [];
  const memoria = Array.isArray(native.memoria) ? native.memoria : [];
  const verificado = pcd.actual_entitlement_verified === true;
  const tiles = [
    ['Competências', lc142Texto(resumo.competencias, escapeHtml)],
    ['Carência (meses)', lc142Texto(resumo.carencia_meses, escapeHtml)],
    ['Soma dos salários', lc142Moeda(resumo.soma_salarios, escapeHtml, formatCurrency)],
    ['Salário de benefício', lc142Moeda(resumo.salario_beneficio, escapeHtml, formatCurrency)],
    ['Coeficiente', `${lc142Texto(resumo.coeficiente, escapeHtml)}%`],
    ['Piso', lc142Moeda(resumo.piso, escapeHtml, formatCurrency)],
    ['Teto', lc142Moeda(resumo.teto, escapeHtml, formatCurrency)]
  ].map(([rotulo, valor]) => `<div class="lc142-tile"><span>${escapeHtml(rotulo)}</span><strong>${valor}</strong></div>`).join('');
  return `<section class="lc142-resultado" aria-labelledby="lc142ResultadoHeading" data-lc142-status="${escapeHtml(status || 'experimental')}">
    <header class="lc142-resultado-header">
      <div>
        <p class="lc142-kicker">Resultado</p>
        <h3 id="lc142ResultadoHeading">Simulação LC 142</h3>
      </div>
      <span class="lc142-badge ${status === 'experimental' ? 'is-simulation' : 'is-blocked'}">${escapeHtml(status === 'experimental' ? 'Simulação' : status || 'Status não declarado')}</span>
    </header>
    <div class="lc142-nao-verificado" data-lc142-nao-verificado>
      <strong>Direito não verificado</strong>
      <p>${escapeHtml(verificado
        ? 'O motor declara verificação do direito — confira a fonte antes de usar.'
        : 'Este resultado é simulação declarada: o direito ao benefício não foi verificado. Não use como concessão, ciência ou validação jurídica.')}</p>
    </div>
    ${renderLc142Rmi(resumo, escapeHtml, formatCurrency)}
    <div class="lc142-tiles">${tiles}</div>
    <section class="lc142-resultado-bloco" aria-labelledby="lc142TempoHeading">
      <h4 id="lc142TempoHeading">Tempo, projeção e carência</h4>
      <dl class="lc142-dl">
        <div><dt>Tempo total</dt><dd>${lc142Dias(tempo.total, escapeHtml)}</dd></div>
        <div><dt>Tempo sem projeção</dt><dd>${lc142Dias(tempo.sem_projecao, escapeHtml)}</dd></div>
        <div><dt>Convenção de contagem</dt><dd><code>${lc142Texto(tempo.convention, escapeHtml, 'não declarada')}</code></dd></div>
        <div><dt>Tempo exigido</dt><dd>${lc142Texto(pcd.anos_exigidos, escapeHtml)} anos</dd></div>
        <div><dt>Tempo atingido no cenário</dt><dd>${pcd.tempo_atingido_no_cenario === true ? 'Sim' : 'Não'}</dd></div>
        <div><dt>Competências preenchidas por hipótese</dt><dd>${lc142Texto(pcd.filled_minimum_count, escapeHtml)}</dd></div>
        <div><dt>Competências projetadas</dt><dd>${lc142Texto(pcd.projection_count, escapeHtml)}</dd></div>
      </dl>
    </section>
    <section class="lc142-resultado-bloco" aria-labelledby="lc142PcdHeading">
      <h4 id="lc142PcdHeading">Enquadramento PcD</h4>
      <dl class="lc142-dl">
        <div><dt>Grau</dt><dd>${lc142Texto(pcd.grau, escapeHtml)}</dd></div>
        <div><dt>Premissas confirmadas</dt><dd>${pcd.assumptions_confirmed === true ? 'Sim' : 'Não'}</dd></div>
        <div><dt>Direito verificado</dt><dd data-lc142-verificado="${verificado ? 'true' : 'false'}">${verificado ? 'Sim' : 'Não verificado'}</dd></div>
        <div><dt>Código de verificação dos índices</dt><dd class="lc142-hash">${lc142Texto(pcd.snapshot_sha256, escapeHtml, 'não declarado')}</dd></div>
        <div><dt>Hash da fonte</dt><dd class="lc142-hash">${lc142Texto(pcd.source_sha256, escapeHtml, 'não declarado')}</dd></div>
      </dl>
    </section>
    ${renderLc142Correcao(correcao, escapeHtml, formatCurrency)}
    <section class="lc142-resultado-bloco" aria-labelledby="lc142MemoriaHeading">
      <h4 id="lc142MemoriaHeading">Memória de cálculo</h4>
      ${memoria.length === 0
        ? '<p class="lc142-hint">O cálculo não gerou memória para este cenário.</p>'
        : `<div class="lc142-memoria">${memoria.map(entrada => `<details class="lc142-detalhe">
            <summary>${lc142Texto(entrada?.descricao, escapeHtml, 'Memória')}</summary>
            <dl class="lc142-dl lc142-dl-compact">
              <div><dt>Tipo</dt><dd>${lc142Texto(entrada?.tipo, escapeHtml)}</dd></div>
              <div><dt>Valor</dt><dd>${lc142Texto(entrada?.valor, escapeHtml)}</dd></div>
            </dl>
          </details>`).join('')}</div>`}
    </section>
    <div class="lc142-avisos" data-lc142-avisos>
      <h4>Avisos do cálculo</h4>
      ${avisos.length === 0 ? '<p class="lc142-hint">Nenhum aviso.</p>' : `<ul class="lc142-lista">${avisos.map(item => `<li>${escapeHtml(String(item))}</li>`).join('')}</ul>`}
    </div>
    <div class="lc142-avisos" data-lc142-warnings>
      <h4>Avisos gerais</h4>
      ${warnings.length === 0 ? '<p class="lc142-hint">Nenhum aviso geral.</p>' : `<ul class="lc142-lista">${warnings.map(item => `<li>${escapeHtml(String(item))}</li>`).join('')}</ul>`}
    </div>
    <div class="lc142-actions lc142-actions-sticky">
      <button type="button" class="button ghost lc142-btn" data-lc142-action="etapa" data-etapa="relatorios">${icon('documents')}<span>Ir para relatórios</span></button>
      <button type="button" class="button ghost lc142-btn" data-lc142-action="etapa" data-etapa="revisao">${icon('chevron-left')}<span>Revisar dados</span></button>
    </div>
    <p class="lc142-hint">Lei complementar aplicada: LC 142/2013, grau constante. Coeficiente declarado ${lc142Texto(resumo.coeficiente ?? parametros.coeficiente, escapeHtml)}%.</p>
  </section>`;
}

/* --- Etapa 9: relatórios ------------------------------------------------- */

function renderLc142Relatorios(state, escapeHtml) {
  const relatorio = state.relatorio && typeof state.relatorio === 'object' ? state.relatorio : {};
  const tipo = String(relatorio.tipo || 'detailed');
  const identificacao = relatorio.identificacao === true;
  const preview = relatorio.preview && typeof relatorio.preview === 'object' ? relatorio.preview : null;
  const gerando = relatorio.gerando === true;
  const cenario = state.cenarioCalculado && typeof state.cenarioCalculado === 'object' ? state.cenarioCalculado : null;
  return `<section class="lc142-block" aria-labelledby="lc142RelatoriosHeading">
    <header class="lc142-block-header">
      <div>
        <p class="lc142-kicker">Saída</p>
        <h3 id="lc142RelatoriosHeading">Relatórios</h3>
      </div>
      <span class="lc142-badge is-draft">Rascunho de relatório</span>
    </header>
    <p class="lc142-lede">Escolha o tipo, confira a prévia e baixe o PDF. A identificação das partes vem desligada por padrão. O servidor recalcula o cenário original antes de emitir o PDF.</p>
    ${cenario ? `<div class="lc142-cenario-fixo" data-lc142-cenario-fixo>
      <h4>Cenário que será recalculado</h4>
      <dl class="lc142-dl lc142-dl-compact">
        <div><dt>Grau</dt><dd>${lc142Texto(cenario.resumo?.grau, escapeHtml)}</dd></div>
        <div><dt>DIB</dt><dd>${lc142Texto(cenario.resumo?.dib, escapeHtml, 'não informada')}</dd></div>
        <div><dt>Data-base</dt><dd>${lc142Texto(cenario.resumo?.dataBase, escapeHtml, 'não informada')}</dd></div>
        <div><dt>Competências</dt><dd>${lc142Texto(cenario.resumo?.competencias, escapeHtml)}</dd></div>
        <div><dt>Calculado em</dt><dd>${lc142Texto(String(cenario.calculadoEm || '').slice(0, 16).replace('T', ' '), escapeHtml)}</dd></div>
      </dl>
      <p class="lc142-hint">O relatório usa este cenário, não os campos que você editar depois de calcular. Alterar a hipótese exige recalcular.</p>
    </div>` : ''}
    <div class="lc142-campo">
      <label for="lc142RelatorioTipo">Tipo de relatório</label>
      <select id="lc142RelatorioTipo" data-lc142-field="relatorioTipo" aria-describedby="lc142RelatorioAjuda">
        ${LC142_RELATORIOS.map(item => `<option value="${item.value}"${tipo === item.value ? ' selected' : ''}>${escapeHtml(item.label)}</option>`).join('')}
      </select>
      <p class="lc142-ajuda" id="lc142RelatorioAjuda">Sete tipos de relatório, todos a partir do mesmo cenário recalculado.</p>
    </div>
    <div class="lc142-confirmacao">
      <label class="lc142-check-wrap lc142-check-linha">
        <input type="checkbox" data-lc142-field="relatorioIdentificacao"${identificacao ? ' checked' : ''} aria-describedby="lc142IdentificacaoAjuda">
        <span>Incluir identificação das partes</span>
      </label>
      <p class="lc142-ajuda" id="lc142IdentificacaoAjuda">Desligada por padrão: o relatório sai sem nome, documento ou dado pessoal até você marcar esta opção. A escolha é explícita e visível.</p>
    </div>
    <div class="lc142-actions">
      <button type="button" class="button ghost lc142-btn" data-lc142-action="relatorio-preview"${gerando ? ' disabled' : ''}>${icon('documents')}<span>${gerando ? 'Gerando prévia...' : 'Gerar prévia'}</span></button>
      <button type="button" class="button gold lc142-btn" data-lc142-action="relatorio-baixar"${gerando || !preview ? ' disabled' : ''} aria-busy="${gerando ? 'true' : 'false'}">${icon('download')}<span>Baixar PDF</span></button>
    </div>
    <div class="lc142-live" role="status">${gerando ? 'Gerando o relatório. O download só é liberado quando os bytes do PDF chegam.' : ''}</div>
    ${preview ? `<div class="lc142-preview" data-lc142-preview>
      <h4>Prévia</h4>
      <dl class="lc142-dl">
        <div><dt>Tipo</dt><dd>${lc142Texto(preview.tipo, escapeHtml)}</dd></div>
        <div><dt>Identificação</dt><dd>${preview.identificacao === true ? 'Incluída' : 'Desligada'}</dd></div>
        <div><dt>Páginas</dt><dd>${lc142Texto(preview.paginas, escapeHtml, 'informado pelo servidor no PDF')}</dd></div>
        <div><dt>Bytes</dt><dd>${lc142Texto(preview.bytes, escapeHtml, 'ainda não baixado')}</dd></div>
        <div><dt>Formato</dt><dd>${lc142Texto(preview.formato, escapeHtml)}</dd></div>
        <div><dt>Calculado em</dt><dd>${lc142Texto(preview.calculadoEm ? String(preview.calculadoEm).slice(0, 16).replace('T', ' ') : null, escapeHtml)}</dd></div>
      </dl>
      <pre class="lc142-preview-texto">${escapeHtml(String(preview.resumo || ''))}</pre>
    </div>` : `<p class="lc142-hint">Sem prévia gerada. O botão de download permanece desabilitado até existir um PDF real.</p>`}
    <div class="lc142-actions">
      <button type="button" class="button ghost lc142-btn" data-lc142-action="etapa" data-etapa="resultado">${icon('chevron-left')}<span>Voltar ao resultado</span></button>
    </div>
    ${state.erro ? `<p class="lc142-alerta is-danger" role="alert">${escapeHtml(state.erro)}</p>` : ''}
  </section>`;
}

/* --- Entrada na aba Previdenciário --------------------------------------- */

function renderLc142Entry(lc142, escapeHtml) {
  const hipoteses = Array.isArray(lc142?.hipoteses) ? lc142.hipoteses : [];
  return `<section class="lc142-entry" aria-labelledby="lc142EntryHeading">
    <div class="lc142-entry-copy">
      <p class="lc142-kicker">Assistente previdenciário</p>
      <h3 id="lc142EntryHeading">Aposentadoria da PcD — LC 142/2013</h3>
      <p>Passo a passo em 9 etapas: hipóteses, assistente, CNIS, vínculos, contribuições, premissas, revisão, resultado e relatórios. Simulação com os dados informados, para conferência humana.</p>
    </div>
    <div class="lc142-entry-actions">
      <button type="button" class="button gold lc142-btn" data-calc-action="lc142-abrir">${icon('calculations')}<span>Abrir assistente LC 142</span></button>
      <span class="lc142-entry-count">${escapeHtml(hipoteses.length === 0 ? 'Nenhuma hipótese nesta sessão' : `${hipoteses.length} hipótese(s) nesta sessão`)}</span>
    </div>
  </section>`;
}

/* --- Superfície completa ------------------------------------------------- */

export function renderLc142Workspace(state = {}) {
  const escapeHtml = state.escapeHtml || (value => String(value ?? '').replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c])));
  const formatCurrency = state.formatCurrency || (value => String(value));
  const etapa = LC142_ETAPAS.some(item => item.value === state.etapa) ? state.etapa : 'hipoteses';
  const etapaAtual = LC142_ETAPAS[lc142EtapaIndice(etapa)];
  let corpo = '';
  if (etapa === 'hipoteses') corpo = renderLc142Hipoteses(state, escapeHtml);
  else if (etapa === 'assistente') corpo = renderLc142Assistente(state, escapeHtml);
  else if (etapa === 'cnis') corpo = renderLc142Cnis(state, escapeHtml);
  else if (etapa === 'vinculos') corpo = renderLc142Vinculos(state, escapeHtml);
  else if (etapa === 'contribuicoes') corpo = renderLc142Parcelas(state, escapeHtml, formatCurrency);
  else if (etapa === 'premissas') corpo = renderLc142Premissas(state, escapeHtml);
  else if (etapa === 'revisao') corpo = renderLc142Revisao(state, escapeHtml);
  else if (etapa === 'resultado') corpo = renderLc142Result(state.resultado, escapeHtml, formatCurrency);
  else corpo = renderLc142Relatorios(state, escapeHtml);
  return `<div class="lc142-surface" data-lc142-etapa="${escapeHtml(etapa)}">
    <header class="lc142-header">
      <div class="lc142-header-copy">
        <p class="lc142-kicker">Aposentadoria da PcD · LC 142/2013</p>
        <h2 id="lc142Heading">Assistente previdenciário</h2>
        <span>Simulação de grau constante com os dados informados, para conferência humana. O cálculo não abre prazo nem produz ciência.</span>
      </div>
      <div class="lc142-header-actions">
        <button type="button" class="button ghost lc142-btn" data-calc-action="lc142-voltar">${icon('chevron-left')}<span>Voltar aos cálculos</span></button>
        <button type="button" class="button ghost lc142-btn" data-lc142-action="salvar-rascunho">${icon('documents')}<span>Salvar e sair</span></button>
      </div>
    </header>
    ${renderLc142Progresso(etapa, escapeHtml)}
    <div class="lc142-corpo">
      <p class="lc142-etapa-atual sr-only" role="status">${escapeHtml(`Etapa ativa: ${etapaAtual.label}`)}</p>
      ${corpo}
    </div>
    ${renderLc142VinculoDrawer(state, escapeHtml)}
  </div>`;
}

/**
 * Faixa de etapas do fluxo de RMI.
 *
 * Não é decoração: cada etapa reflete o que já está preenchido no estado
 * (identificação, salários, parâmetros) e se há resultado calculado. A etapa
 * "atual" é a primeira pendente — a mesma leitura que o produto original faz
 * com o editor numerado, sem esconder campos atrás de um wizard.
 */
function renderPrevidenciarioSteps(etapas, escapeHtml) {
  const itens = etapas.map(etapa => {
    const estado = etapa.feito ? 'feito' : etapa.atual ? 'atual' : 'pendente';
    return `<li class="calc-prev-step" data-estado="${estado}"${etapa.atual ? ' aria-current="step"' : ''}>
      <span>${etapa.feito ? icon('check') : etapa.n}</span>
      <span>${escapeHtml(etapa.rotulo)}</span>
    </li>`;
  }).join('');
  return `<ol class="calc-prev-steps" aria-label="Etapas do cálculo">${itens}</ol>`;
}

/**
 * Hub da aba Previdenciário.
 *
 * Por que existe: a aba empilhava seis superfícies na mesma rolagem (entrada LC 142,
 * RMI, cálculo oficial PDPJ, tempo/qualidade, três análises avançadas e a lista de
 * salvos) — 3.157 px sem hierarquia, e o usuário não sabia por onde começar. O hub
 * apresenta **um cartão por fluxo**, com o que é, o que entrega e a ação; cada fluxo
 * abre a sua própria superfície com caminho de volta. É a arquitetura do produto
 * original (lista → fluxo → etapas), aplicada à linguagem visual do ATRIUM.
 */
function renderPrevidenciarioHub(state, escapeHtml, formatCurrency) {
  const salvos = Array.isArray(state.salvos) ? state.salvos : [];
  const hipoteses = Number(state.lc142?.hipoteses?.length ?? 0);
  const fluxos = [
    {
      id: 'rmi',
      icone: 'calculations',
      eyebrow: 'Cálculo do RGPS',
      titulo: 'RMI e regras de transição',
      descricao: 'Média do PBC, coeficiente progressivo, teto e piso, com comparador da EC 103 e memória auditável.',
      meta: 'Salários, parâmetros e resultado',
      acao: 'Abrir cálculo'
    },
    {
      id: 'lc142',
      icone: 'certificate',
      eyebrow: 'Aposentadoria da PcD',
      titulo: 'LC 142/2013',
      descricao: 'Assistente em 9 etapas: hipótese, CNIS, vínculos, contribuições, premissas, revisão e relatórios.',
      meta: hipoteses === 0 ? 'Nenhuma hipótese nesta sessão' : `${hipoteses} hipótese(s) nesta sessão`,
      acao: 'Abrir assistente'
    },
    {
      id: 'tempo',
      icone: 'deadline',
      eyebrow: 'Contagem informada',
      titulo: 'Tempo e qualidade de segurado',
      descricao: 'Vínculos e concomitância, carência, período de graça (art. 15) e marcos das EC 20/103.',
      meta: 'Contagem com conferência humana',
      acao: 'Abrir tempo'
    },
    {
      id: 'avancadas',
      icone: 'monitoring',
      eyebrow: 'Motores do original',
      titulo: 'Projeção, pensão e qualidade',
      descricao: 'Três simulações independentes: projeção de DER, acúmulo de pensões e qualidade facultativa.',
      meta: 'Simulação com premissas declaradas',
      acao: 'Abrir análises'
    },
    {
      id: 'oficial',
      icone: 'court',
      eyebrow: 'Cálculo oficial',
      titulo: 'PDPJ e Fábrica de Cálculos',
      descricao: 'TC/RMI e atrasados pela ferramenta oficial do Poder Judiciário. O resultado oficial prevalece sobre a estimativa.',
      meta: 'Somente leitura, com demonstrativo',
      acao: 'Abrir cálculo oficial'
    }
  ];
  const cartoes = fluxos.map(fluxo => `
    <article class="calc-prev-card" data-prev-card="${fluxo.id}">
      <span class="calc-prev-icon">${icon(fluxo.icone)}</span>
      <p class="calc-prev-eyebrow">${escapeHtml(fluxo.eyebrow)}</p>
      <h3>${escapeHtml(fluxo.titulo)}</h3>
      <p class="calc-prev-desc">${escapeHtml(fluxo.descricao)}</p>
      <p class="calc-prev-meta">${escapeHtml(fluxo.meta)}</p>
      <div class="calc-prev-actions">
        ${fluxo.id === 'lc142'
          ? `<button type="button" class="button gold" data-calc-action="lc142-abrir">${icon('chevron-right')}<span>${escapeHtml(fluxo.acao)}</span></button>`
          : `<button type="button" class="button ghost" data-calc-action="prev-abrir" data-prev-sub="${fluxo.id}">${icon('chevron-right')}<span>${escapeHtml(fluxo.acao)}</span></button>`}
      </div>
    </article>`).join('');
  /* A lista de salvos já traz o próprio cabeçalho e o próprio estado vazio; o hub
   * apenas a emoldura quando há itens, para não repetir "nenhum cálculo salvo". */
  const recentes = salvos.length > 0
    ? `<section class="calc-prev-recent" aria-label="Continue de onde parou">
        <header><h4>Continue de onde parou</h4></header>
        ${renderCalculationsSavedList(state, escapeHtml, formatCurrency)}
      </section>`
    : renderCalculationsSavedList(state, escapeHtml, formatCurrency);
  return `<div class="calc-prev-hub">
    <header class="calc-prev-hero">
      <div class="calc-prev-hero-copy">
        <p class="calc-prev-kicker">Escolha por onde começar</p>
        <h3>Uma etapa de cada vez</h3>
        <p>Cada ferramenta abaixo resolve um problema específico. Todas fazem simulação para conferência humana. Nenhuma abre prazo, dá ciência ou pratica ato processual.</p>
      </div>
      <div class="calc-prev-hero-actions">
        <button type="button" class="button gold" data-calc-action="prev-abrir" data-prev-sub="rmi">${icon('calculations')}<span>Novo cálculo do RGPS</span></button>
      </div>
    </header>
    <div class="calc-prev-grid">${cartoes}</div>
    ${recentes}
  </div>`;
}

/** Cabeçalho de um fluxo com caminho explícito de volta para o hub. */
function renderPrevidenciarioFlowHeader(titulo, descricao, escapeHtml) {
  return `<header class="calc-prev-fluxo">
    <button type="button" class="calc-prev-back" data-calc-action="prev-voltar">${icon('chevron-left')}<span>Voltar aos cálculos</span></button>
    <div class="calc-prev-fluxo-copy">
      <p class="calc-prev-eyebrow">Previdenciário</p>
      <h3>${escapeHtml(titulo)}</h3>
      <p>${escapeHtml(descricao)}</p>
    </div>
  </header>`;
}

export function renderCalculationsWorkspace(state = {}) {
  // Superfície LC 142 (aditiva): quando o assistente está aberto, ele ocupa o
  // workspace da aba Previdenciário. As abas Cível/Trabalhista/Previdenciário
  // continuam renderizando exatamente como antes quando `lc142.aberto` é falso.
  const lc142State = state.lc142 && typeof state.lc142 === 'object' ? state.lc142 : null;
  if (lc142State?.aberto === true) {
    const escapeHtmlLc142 = state.escapeHtml || (value => String(value ?? '').replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c])));
    return renderLc142Workspace({ ...lc142State, escapeHtml: escapeHtmlLc142, formatCurrency: state.formatCurrency });
  }
  const escapeHtml = state.escapeHtml || (value => String(value ?? '').replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c])));
  const formatCurrency = state.formatCurrency || (value => String(value));
  const aba = ['trabalhista', 'previdenciario'].includes(state.aba) ? state.aba : 'civel';
  const baseForm = {
    atualizacaoAte: '',
    correcao: 'IPCA',
    juros: 'sem',
    jurosPercentual: '',
    jurosSerie: 'SELIC',
    multaPercentual: '',
    multaBase: 'debitos-atualizados',
    honorariosPercentual: '',
    honorariosBase: 'debitos-atualizados',
    itens: [{ id: 'item-1', especie: 'debito', descricao: '', data: '', valor: '', jurosDe: '' }],
    error: '',
    loading: false,
    ...(aba === 'civel' ? state.form : null)
  };
  const trabalhistaForm = {
    salario: '',
    admissao: '',
    desligamento: '',
    tipoDesligamento: 'sem_justa_causa',
    aviso: '',
    diasTrabalhados: '30',
    feriasVencidas: '0',
    saldoFgts: '',
    descontos: [{ descricao: '', valor: '' }],
    error: '',
    loading: false,
    ...(aba === 'trabalhista' ? state.form : null)
  };
  const previdenciarioForm = {
    sexo: 'feminino',
    teto: '',
    piso: '',
    divisorMinimo: false,
    competencias: [{ competencia: '', salario: '' }],
    error: '',
    loading: false,
    ...(aba === 'previdenciario' ? state.form : null)
  };
  const estadoOficial = {
    modo: 'tc',
    dataApuracao: '',
    nascimento: '',
    sexo: 'FEMININO',
    periodos: [{ dataInicial: '', dataFinal: '' }],
    numero: '',
    protocolo: '',
    citacao: '',
    resultado: null,
    loading: false,
    error: '',
    ...(aba === 'previdenciario' ? state.oficial : null)
  };
  const result = state.result && state.resultAba === aba ? state.result : null;
  const tempoResultado = aba === 'previdenciario' ? state.tempo?.resultado || null : null;
  const temResultado = Boolean(result || tempoResultado);
  const etapa = state.etapa === 'resultado' && temResultado ? 'resultado' : 'formulario';
  const badge = result
    ? `Total ${result.resumo.total ?? result.resumo.liquido ?? result.resumo.rmi}`
    : state.catalog
      ? `${state.catalog.series.length} séries · ${state.catalog.tabelas.resumo.total} tabelas`
      : 'Carregando catálogo...';
  /* A aba Previdenciário tem cabeçalho próprio: ela não é "mais uma aba de cálculo",
   * é uma área com fluxos. O texto do topo muda para dizer onde o usuário está. */
  const prevSub = ['rmi', 'tempo', 'avancadas', 'oficial'].includes(state.prevSub) ? state.prevSub : 'hub';
  const header = aba === 'previdenciario'
    ? `<header class="calc-header calc-header-prev">
      <div>
        <p>Cálculos · Previdenciário</p>
        <h2 id="calculationsHeading">Cálculo previdenciário</h2>
        <span>Do tempo de contribuição à memória de cálculo. Simulação com os dados informados, para conferência humana.</span>
      </div>
      <span class="calc-badge">${escapeHtml(badge)}</span>
    </header>`
    : `<header class="calc-header">
      <div>
        <p>Cálculos judiciais</p>
        <h2 id="calculationsHeading">Cálculos do escritório</h2>
        <span>Atualização monetária, verbas rescisórias e RMI do RGPS com memória auditável. Ferramenta de apoio com conferência humana obrigatória.</span>
      </div>
      <span class="calc-badge">${escapeHtml(badge)}</span>
    </header>`;
  if (etapa === 'resultado') {
    const form = state.form || {};
    const resultMarkup = result
      ? (aba === 'trabalhista'
          ? renderTrabalhistaResult(result, escapeHtml, formatCurrency)
          : aba === 'previdenciario'
            ? renderPrevidenciarioResult(result, escapeHtml, formatCurrency)
            : renderCivelResult(result, escapeHtml, formatCurrency, state.conferenciaIndices, state.conferindoIndices))
      : '';
    const tempoMarkup = tempoResultado ? renderTempoResultado(tempoResultado, escapeHtml, formatCurrency) : '';
    const complementarMarkup = aba === 'previdenciario' ? renderComplementar(state.complementar, escapeHtml, formatCurrency) : '';
    return `<section class="calc-surface" aria-labelledby="calculationsHeading">
    ${header}
    <section class="calc-result" aria-label="Resultado do cálculo">
      <header class="calc-result-header">
        <div>
          <p>Resultado</p>
          <h3>${escapeHtml(aba === 'civel' ? 'Cálculo cível' : aba === 'trabalhista' ? 'Cálculo trabalhista' : 'Cálculo previdenciário')}</h3>
        </div>
        <div class="calc-actions">
          <button type="button" class="button ghost" data-calc-action="voltar-form">${icon('chevron-left')}<span>Editar dados</span></button>
          <button type="button" class="button ghost" data-calc-action="imprimir">${icon('documents')}<span>Imprimir relatório</span></button>
          ${renderSaveButton(form)}
        </div>
      </header>
      ${resultMarkup}
      ${tempoMarkup}
      ${complementarMarkup}
    </section>
    ${renderCalculationsSavedList(state, escapeHtml, formatCurrency)}
  </section>`;
  }
  /* ---------------------------------------------------------------- *
   * Aba Previdenciário: hub + um fluxo por vez.
   *
   * Cada fluxo mantém exatamente o markup e os seletores que já existiam
   * (`#calcForm`, `[data-prev-field]`, `.calc-tempo`, `.calc-avancadas`,
   * `.calc-oficial`), então nenhuma regra de cálculo mudou — só a navegação.
   * ---------------------------------------------------------------- */
  if (aba === 'previdenciario') {
    /* Etapas reais do fluxo de RMI — derivadas do estado, não de um passo fixo. */
    const competenciaPreenchida = item => Boolean(item && String(item.competencia || '').trim() && String(item.salario || '').trim());
    const salariosPreenchidos = (previdenciarioForm.competencias || []).filter(competenciaPreenchida).length;
    const etapasRmi = [
      { n: 1, rotulo: 'Identificação', feito: Boolean(previdenciarioForm.sexo && previdenciarioForm.dataNascimento) },
      { n: 2, rotulo: 'Salários', feito: salariosPreenchidos > 0 },
      { n: 3, rotulo: 'Parâmetros', feito: Boolean(String(previdenciarioForm.teto || '').trim() || String(previdenciarioForm.piso || '').trim() || previdenciarioForm.divisorMinimo) },
      { n: 4, rotulo: 'Resultado', feito: Boolean(result && state.resultAba === 'previdenciario') }
    ];
    const primeiraPendente = etapasRmi.find(etapa => !etapa.feito) || null;
    const etapasComAtual = etapasRmi.map(etapa => ({ ...etapa, atual: primeiraPendente ? etapa.n === primeiraPendente.n : false }));
    const corpoFluxo = {
      rmi: () => `${renderPrevidenciarioFlowHeader('RMI do RGPS', 'Média do PBC, coeficiente progressivo e comparador da EC 103. Os salários nominais são corrigidos pelo INPC até a data de apuração.', escapeHtml)}${renderPrevidenciarioSteps(etapasComAtual, escapeHtml)}${renderPrevidenciarioForm(previdenciarioForm, escapeHtml)}`,
      tempo: () => `${renderPrevidenciarioFlowHeader('Tempo e qualidade de segurado', 'Contagem informada de vínculos, carência e período de graça. Concomitância desconta a subposição; fatores avançados exigem enquadramento conferido.', escapeHtml)}${renderTempoPanel(state.tempo, escapeHtml)}`,
      avancadas: () => `${renderPrevidenciarioFlowHeader('Projeção, pensão e qualidade', 'Três cálculos separados do principal. Nenhum confirma direito: todos são simulações com as premissas informadas.', escapeHtml)}${renderAnalisesAvancadas(state.avancadas, escapeHtml, formatCurrency)}`,
      oficial: () => `${renderPrevidenciarioFlowHeader('Cálculo oficial (PDPJ)', 'Ferramenta oficial do Poder Judiciário para conferência de TC/RMI e atrasados. O resultado oficial prevalece sobre a estimativa da aba.', escapeHtml)}${renderCalculadoraOficial(estadoOficial, escapeHtml)}`
    };
    const conteudo = prevSub === 'hub'
      ? renderPrevidenciarioHub(state, escapeHtml, formatCurrency)
      : corpoFluxo[prevSub]();
    const voltarResultado = result
      ? `<div class="calc-actions"><button type="button" class="button ghost" data-calc-action="ver-resultado">${icon('documents')}<span>Ver último resultado</span></button></div>`
      : '';
    return `<section class="calc-surface calc-surface-prev" aria-labelledby="calculationsHeading">
    ${header}
    ${renderTabs(aba, escapeHtml)}
    ${voltarResultado}
    ${conteudo}
  </section>`;
  }
  const formMarkup = aba === 'trabalhista'
    ? renderTrabalhistaForm(trabalhistaForm, escapeHtml)
    : renderCivelForm(baseForm, state.catalog, escapeHtml);
  return `<section class="calc-surface" aria-labelledby="calculationsHeading">
    ${header}
    ${renderTabs(aba, escapeHtml)}
    ${temResultado ? `<div class="calc-actions"><button type="button" class="button ghost" data-calc-action="ver-resultado">${icon('documents')}<span>Ver último resultado</span></button></div>` : ''}
    ${formMarkup}
    ${renderCalculationsSavedList(state, escapeHtml, formatCurrency)}
  </section>`;
}

export function renderCalculationsV2Workspace(state = {}) {
  return renderCalculationsWorkspace(state);
}
