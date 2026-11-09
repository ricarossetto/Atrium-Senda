export function createCalculationsFeature({
  documentRef = globalThis.document,
  secureFetch = (...args) => globalThis.KellerAuth?.secureFetch?.(...args),
  escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c])),
  formatCurrency = value => String(value ?? ''),
  renderWorkspace,
  showToast,
  store = null,
  getCurrentUserName = () => null,
  getIsoDate = () => new Date().toISOString().slice(0, 10)
} = {}) {
  if (typeof renderWorkspace !== 'function') throw new TypeError('Presenter dos cálculos é obrigatório.');
  const byId = id => documentRef?.getElementById(id);
  let initialized = false;
  let catalog = null;
  let catalogAttempted = false;
  let loading = false;
  let error = '';
  let result = null;
  let resultAba = null;
  let resultadoSalvoId = null;
  let conferenciaIndices = null;
  let conferindoIndices = false;
  let salvando = false;
  let importando = false;
  let pendingDelete = null;
  let aba = 'civel';
  /* Sub-navegação da aba Previdenciário. A tela inicial é um hub com um fluxo por
   * cartão; cada fluxo abre a sua própria superfície. Antes tudo ficava empilhado na
   * mesma rolagem (seis superfícies, ~3.000px) e o usuário não sabia onde começar. */
  let prevSub = 'hub';
  let nextItemId = 2;
  let nextDescontoId = 1;
  let nextCompetenciaId = 2;
  const form = {
    atualizacaoAte: getIsoDate(),
    correcao: 'IPCA',
    juros: 'sem',
    jurosPercentual: '',
    jurosSerie: 'SELIC',
    multaPercentual: '',
    multaBase: 'debitos-atualizados',
    honorariosPercentual: '',
    honorariosBase: 'debitos-atualizados',
    itens: [{ id: 'item-1', especie: 'debito', descricao: 'Débito principal', data: getIsoDate(), valor: '', jurosDe: '' }]
  };
  const trabalhista = {
    salario: '',
    admissao: '',
    desligamento: '',
    tipoDesligamento: 'sem_justa_causa',
    aviso: '',
    diasTrabalhados: '30',
    feriasVencidas: '0',
    saldoFgts: '',
    tributacaoAtiva: true,
    dependentes: '0',
    pensao: '',
    outrasDeducoes: '',
    descontos: [{ id: 'desconto-1', descricao: '', valor: '' }]
  };
  const previdenciario = {
    sexo: 'feminino',
    dataNascimento: '',
    teto: '',
    piso: '',
    divisorMinimo: false,
    corrigirSalarios: true,
    descarte: true,
    textoCnis: '',
    importAvisos: [],
    importFonte: '',
    precisaOcr: false,
    competencias: [{ id: 'competencia-1', competencia: '', salario: '' }]
  };
  const tempo = {
    vinculos: [{ id: 'vinculo-1', inicio: '', fim: '', tipo: 'empregado', fator: '' }],
    dataReferencia: '',
    ultimaContribuicao: '',
    contribuicoesMeses: '',
    desemprego: false,
    resultado: null,
    loading: false,
    error: ''
  };
  // Cálculo oficial (PDPJ) — ferramenta dentro da aba Previdenciário: usa as rotas
  // oficiais da Fábrica de Cálculos; o resultado oficial prevalece sobre a estimativa.
  const oficial = {
    modo: 'tc',
    dataApuracao: '',
    nascimento: '',
    sexo: 'FEMININO',
    periodos: [{ dataInicial: '', dataFinal: '' }],
    numero: '',
    protocolo: '',
    citacao: '',
    transito: '',
    valorCausa: '',
    dataAtualizacao: '',
    inicioDiferencas: '',
    terminoDiferencas: '',
    percentualAcordo: '',
    criterioDeducaoAlcada: '',
    aplicarPrescricao: false,
    deduzirExcedenteAlcada: false,
    encadeamentoCorrecao: '',
    encadeamentoJuros: '',
    opcaoInicioSelicEc113: '',
    opcaoTerminoSelicEc113: '',
    honorariosBaseIncidencia: '',
    honorariosPercentual: '',
    multaBaseIncidencia: '',
    multaPercentual: '',
    aplicarFaixasArt85Cpc: false,
    descontarBeneficio: false,
    jsonAvancado: '',
    resultado: null,
    demonstrativo: null,
    loading: false,
    error: ''
  };
  const complementar = {
    grau: 'grave',
    expectativa: '',
    contribuicoesTotais: '',
    resultado: null,
    loading: false,
    error: ''
  };
  /**
   * Análises avançadas — os três motores portados do original na 6.43.0.
   * Cada card é independente e guarda o envelope devolvido pelo servidor, sem
   * recalcular nada aqui: o número exibido é o que o servidor apurou.
   */
  const avancadas = {
    projecao: {
      sexo: 'feminino',
      dataNascimento: '',
      dataReferencia: '',
      primeiraCompetencia: '',
      ultimaCompetencia: '',
      salarioContribuicao: '',
      mesesContribuicaoAnteriores: '',
      expectativaSobrevida: '',
      regraAlvo: '',
      resultado: null,
      loading: false,
      error: ''
    },
    pensao: {
      referenceDate: '',
      referenceBase: '',
      rendas: '',
      rounding: 'half-up',
      resultado: null,
      loading: false,
      error: ''
    },
    qualidade: {
      insuredCategory: 'facultative',
      parouDeContribuir: false,
      recebeBeneficio: false,
      ultimaContribuicao: '',
      contribuicoesMeses: '',
      dataReferencia: '',
      desempregoComprovado: false,
      resultado: null,
      loading: false,
      error: ''
    }
  };
  let etapa = 'formulario';
  let nextVinculoId = 2;

  function normalizeNumber(value) {
    const raw = String(value ?? '').trim().replace(/\s|R\$/g, '');
    if (!raw) return '';
    if (raw.includes('.') && raw.includes(',')) return raw.replaceAll('.', '').replace(',', '.');
    if (raw.includes(',')) return raw.replace(',', '.');
    return raw;
  }

  function currentForm() {
    if (aba === 'trabalhista') return trabalhista;
    if (aba === 'previdenciario') return previdenciario;
    return form;
  }

  /**
   * Chaves de estado que o presenter lê.
   *
   * Fonte única de propósito: antes `render()` montava esse objeto campo a campo e
   * o getter `state` montava outro. `avancadas` ficou de fora do `render()` e o
   * defeito era silencioso — os três motores respondiam HTTP 200 e a tela continuava
   * mostrando só o formulário. Uma lista só evita que o próximo campo se perca.
   */
  function estadoDoPresenter() {
    return {
      aba,
      prevSub,
      catalog,
      result,
      resultAba,
      error,
      loading,
      salvando,
      importando,
      pendingDelete,
      resultadoSalvoId,
      conferenciaIndices,
      conferindoIndices,
      oficial,
      tempo,
      complementar,
      etapa,
      avancadas,
      /* O presenter já sabia ler `formatCurrency`/`escapeHtml` do estado, mas o
       * `render()` não os repassava: a view inteira caía no fallback `String(value)`
       * e exibia "2700" no lugar de "R$ 2.700,00". */
      escapeHtml,
      formatCurrency,
      lc142: lc142Exposta()
    };
  }

  function render() {
    const workspace = byId('calculationsWorkspace');
    if (!workspace) return;
    const current = currentForm();
    current.podeSalvar = Boolean(result && resultAba === aba);
    current.salvando = salvando;
    current.importando = importando;
    current.resultadoSalvoId = resultAba === aba ? resultadoSalvoId : null;
    workspace.innerHTML = renderWorkspace({
      ...estadoDoPresenter(),
      salvos: savedSummaries(),
      form: { ...current, error, loading }
    });
    if (!catalog && !catalogAttempted) loadCatalog();
    // Overlay/foco do drawer LC 142: o innerHTML é reconstruído a cada render,
    // então o fundo inerte e o foco contido são reaplicados aqui.
    if (lc142.aberto) {
      lc142AplicarOverlay();
      lc142AtualizarReservaToast();
    }
  }

  function savedSummaries() {
    const records = Array.isArray(store?.state?.calculations) ? store.state.calculations : [];
    return records.map(record => {
      const resumo = record?.resultado?.resumo || {};
      return {
        id: record?.id,
        tipo: record?.tipo,
        titulo: record?.titulo || 'Cálculo',
        createdAt: record?.createdAt || null,
        valor: resumo.total ?? resumo.liquido ?? resumo.rmi ?? null,
        memoriaCompactada: record?.resultado?.memoriaCompactada === true
      };
    });
  }

  async function loadCatalog() {
    catalogAttempted = true;
    try {
      const response = await secureFetch('/api/calc/catalog', { headers: { Accept: 'application/json' } });
      if (!response?.ok) throw new Error('Não foi possível carregar o catálogo de cálculos.');
      catalog = await response.json();
      error = '';
    } catch (err) {
      error = err?.message || 'Falha ao carregar o catálogo de cálculos.';
    }
    render();
  }

  function bindWorkspace() {
    const workspace = byId('calculationsWorkspace');
    if (!workspace || workspace.dataset.calcBound === 'true') return;
    workspace.dataset.calcBound = 'true';
    const syncField = event => {
      const field = event.target?.dataset?.calcField;
      if (field && Object.hasOwn(form, field)) form[field] = event.target.value;
      const trabField = event.target?.dataset?.trabField;
      if (trabField && Object.hasOwn(trabalhista, trabField)) {
        trabalhista[trabField] = event.target.type === 'checkbox' ? event.target.checked : event.target.value;
      }
      const prevField = event.target?.dataset?.prevField;
      if (prevField && Object.hasOwn(previdenciario, prevField)) {
        previdenciario[prevField] = event.target.type === 'checkbox' ? event.target.checked : event.target.value;
      }
      const itemField = event.target?.dataset?.itemField;
      if (itemField) {
        const index = Number(event.target.dataset.itemIndex);
        if (form.itens[index]) form.itens[index][itemField] = event.target.value;
      }
      const descontoField = event.target?.dataset?.descontoField;
      if (descontoField) {
        const index = Number(event.target.dataset.descontoIndex);
        if (trabalhista.descontos[index]) trabalhista.descontos[index][descontoField] = event.target.value;
      }
      const competenciaField = event.target?.dataset?.competenciaField;
      if (competenciaField) {
        const index = Number(event.target.dataset.competenciaIndex);
        if (previdenciario.competencias[index]) previdenciario.competencias[index][competenciaField] = event.target.value;
      }
      const tempoField = event.target?.dataset?.tempoField;
      if (tempoField && Object.hasOwn(tempo, tempoField)) {
        tempo[tempoField] = event.target.type === 'checkbox' ? event.target.checked : event.target.value;
      }
      const vinculoField = event.target?.dataset?.tempoVinculoField;
      if (vinculoField) {
        const index = Number(event.target.dataset.vinculoIndex);
        if (tempo.vinculos[index]) tempo.vinculos[index][vinculoField] = event.target.value;
      }
      const oficialField = event.target?.dataset?.oficialField;
      if (oficialField && Object.hasOwn(oficial, oficialField)) {
        oficial[oficialField] = event.target.type === 'checkbox' ? event.target.checked : event.target.value;
      }
      const oficialPeriodoField = event.target?.dataset?.oficialPeriodoField;
      if (oficialPeriodoField) {
        const index = Number(event.target.dataset.periodoIndex);
        if (oficial.periodos[index]) oficial.periodos[index][oficialPeriodoField] = event.target.value;
      }
      /* Campos das análises avançadas usam `data-av-field="card.campo"`. Texto não
       * re-renderiza a cada tecla (recriaria o input no meio da digitação); o
       * valor já está no estado e a próxima renderização o exibe. */
      const avField = event.target?.dataset?.avField;
      if (avField && avField.includes('.')) {
        const [card, campo] = avField.split('.');
        if (avancadas[card] && Object.hasOwn(avancadas[card], campo)) {
          avancadas[card][campo] = event.target.type === 'checkbox' ? event.target.checked : event.target.value;
          if (event.target.type === 'checkbox' || event.target.tagName === 'SELECT') render();
          return;
        }
      }
      const compField = event.target?.dataset?.compField;
      if (compField && Object.hasOwn(complementar, compField)) {
        complementar[compField] = event.target.type === 'checkbox' ? event.target.checked : event.target.value;
      }
      // Superfície LC 142: os campos usam data-lc142-field / data-lc142-drawer-field.
      if (event.target?.dataset?.lc142Field) lc142SyncField(event);
      if (event.target?.dataset?.lc142DrawerField) lc142SyncDrawerField(event);
    };
    workspace.addEventListener('input', syncField);
    workspace.addEventListener('change', syncField);
    workspace.addEventListener('change', event => {
      const cnisInput = event.target?.matches?.('[data-lc142-file]') ? event.target : null;
      if (!cnisInput || !cnisInput.files?.length) return;
      const file = cnisInput.files[0];
      void (async () => {
        try {
          const arquivo = await lerArquivoImportacao(file);
          lc142.cnis = {
            ...lc142.cnis,
            status: 'idle',
            arquivo: arquivo.filename,
            arquivoBase64: arquivo.base64 || null,
            texto: arquivo.texto || '',
            erro: '',
            pendencias: []
          };
          render();
        } catch (err) {
          lc142.cnis = { ...lc142.cnis, status: 'erro', erro: err?.message || 'Não foi possível ler o arquivo selecionado.' };
          render();
        }
      })();
    });
    workspace.addEventListener('change', event => {
      const input = event.target?.matches?.('[data-prev-file]') ? event.target : null;
      if (!input || !input.files?.length) return;
      const file = input.files[0];
      input.value = '';
      void (async () => {
        try {
          const arquivo = await lerArquivoImportacao(file);
          await importarCnis({ arquivo });
        } catch (err) {
          error = err?.message || 'Não foi possível ler o arquivo selecionado.';
          render();
        }
      })();
    });
    workspace.addEventListener('submit', event => {
      if (event.target?.id !== 'calcForm') return;
      event.preventDefault();
      calculate();
    });
    // <dialog> fechado por Escape ou por close() nativo: recompõe o estado.
    workspace.addEventListener('close', lc142SincronizarFechamentoDrawer, true);
    workspace.addEventListener('click', event => {
      // Ações da superfície LC 142 usam data-lc142-action (namespace próprio).
      const lc142Button = event.target.closest?.('[data-lc142-action]');
      if (lc142Button && lc142Acao(lc142Button.dataset.lc142Action, lc142Button)) return;
      const button = event.target.closest('[data-calc-action]');
      if (!button) return;
      const action = button.dataset.calcAction;
      // Ações de navegação entre as superfícies: a aba continua sendo do módulo.
      if (action === 'lc142-abrir') {
        aba = 'previdenciario';
        lc142Abrir();
        return;
      }
      if (action === 'lc142-voltar') {
        lc142Fechar();
        return;
      }
      // O toggle de seleção de contribuição é um input[type=checkbox] com
      // data-lc142-action: o clique chega aqui antes do change.
      if (action === 'tab') {
        const target = ['trabalhista', 'previdenciario'].includes(button.dataset.tab) ? button.dataset.tab : 'civel';
        if (target !== aba) {
          aba = target;
          prevSub = 'hub';
          error = '';
          pendingDelete = null;
          render();
        }
        return;
      }
      /* Hub da aba Previdenciário: abrir um fluxo e voltar para o hub. */
      if (action === 'prev-abrir') {
        prevSub = ['rmi', 'tempo', 'avancadas', 'oficial'].includes(button.dataset.prevSub)
          ? button.dataset.prevSub
          : 'hub';
        etapa = 'formulario';
        error = '';
        render();
        return;
      }
      if (action === 'prev-voltar') {
        prevSub = 'hub';
        error = '';
        render();
        return;
      }
      if (action === 'calcular-tempo') {
        /* O fluxo de tempo tem ação própria desde que deixou de dividir a tela com o
         * formulário de RMI: `calculate()` já decide o que calcular pelo que existe. */
        calculate();
        return;
      }
      if (action === 'oficial-modo') {
        oficial.modo = button.dataset.modo === 'atrasados' ? 'atrasados' : 'tc';
        oficial.error = '';
        render();
        return;
      }
      if (action === 'oficial-add-periodo') {
        oficial.periodos.push({ dataInicial: '', dataFinal: '' });
        render();
        return;
      }
      if (action === 'oficial-remove-periodo') {
        const index = Number(button.dataset.periodoIndex);
        if (oficial.periodos.length > 1) oficial.periodos.splice(index, 1);
        render();
        return;
      }
      if (action === 'oficial-calcular') {
        calcularOficial(button.dataset.tipo);
        return;
      }
      if (action === 'oficial-demonstrativo') {
        baixarDemonstrativoOficial();
        return;
      }
      if (action === 'conferir-indices') {
        conferirIndicesOficiais();
        return;
      }
      if (action === 'importar-cnis') {
        importarCnis();
        return;
      }
      if (action === 'importar-cnis-arquivo') {
        documentRef.querySelector?.('[data-prev-file]')?.click();
        return;
      }
      if (action === 'importar-cnis-ocr') {
        importarCnis({ ocr: true });
        return;
      }
      if (action === 'salvar') {
        salvar();
        return;
      }
      if (action === 'abrir') {
        abrir(button.dataset.calcId);
        return;
      }
      if (action === 'excluir') {
        pedirExclusao(button.dataset.calcId);
        return;
      }
      if (action === 'cancelar-exclusao') {
        cancelarExclusao();
        return;
      }
      if (action === 'confirmar-exclusao') {
        confirmarExclusao();
        return;
      }
      if (action === 'add-item') {
        form.itens.push({ id: `item-${nextItemId++}`, especie: 'debito', descricao: '', data: getIsoDate(), valor: '', jurosDe: '' });
        result = resultAba === 'civel' ? null : result;
        error = '';
        render();
        return;
      }
      if (action === 'remove-item') {
        const index = Number(button.dataset.itemIndex);
        if (form.itens.length <= 1) {
          showToast?.('O cálculo exige ao menos um item.', 'error');
          return;
        }
        form.itens.splice(index, 1);
        if (resultAba === 'civel') result = null;
        error = '';
        render();
        return;
      }
      if (action === 'add-desconto') {
        trabalhista.descontos.push({ id: `desconto-${nextDescontoId++}`, descricao: '', valor: '' });
        if (resultAba === 'trabalhista') result = null;
        error = '';
        render();
        return;
      }
      if (action === 'remove-desconto') {
        const index = Number(button.dataset.descontoIndex);
        if (trabalhista.descontos.length <= 1) {
          trabalhista.descontos = [{ id: `desconto-${nextDescontoId++}`, descricao: '', valor: '' }];
        } else {
          trabalhista.descontos.splice(index, 1);
        }
        if (resultAba === 'trabalhista') result = null;
        error = '';
        render();
        return;
      }
      if (action === 'add-competencia') {
        previdenciario.competencias.push({ id: `competencia-${nextCompetenciaId++}`, competencia: '', salario: '' });
        if (resultAba === 'previdenciario') result = null;
        error = '';
        render();
        return;
      }
      if (action === 'remove-competencia') {
        const index = Number(button.dataset.competenciaIndex);
        if (previdenciario.competencias.length <= 1) {
          previdenciario.competencias = [{ id: `competencia-${nextCompetenciaId++}`, competencia: '', salario: '' }];
        } else {
          previdenciario.competencias.splice(index, 1);
        }
        if (resultAba === 'previdenciario') result = null;
        error = '';
        render();
        return;
      }
      if (action === 'add-vinculo') {
        tempo.vinculos.push({ id: `vinculo-${nextVinculoId++}`, inicio: '', fim: '', tipo: 'empregado', fator: '' });
        tempo.error = '';
        render();
        return;
      }
      if (action === 'remove-vinculo') {
        const index = Number(button.dataset.vinculoIndex);
        if (tempo.vinculos.length <= 1) {
          tempo.vinculos = [{ id: `vinculo-${nextVinculoId++}`, inicio: '', fim: '', tipo: 'empregado', fator: '' }];
        } else {
          tempo.vinculos.splice(index, 1);
        }
        tempo.error = '';
        render();
        return;
      }
      if (action === 'voltar-form') {
        etapa = 'formulario';
        error = '';
        render();
        return;
      }
      if (action === 'ver-resultado') {
        etapa = 'resultado';
        render();
        return;
      }
      if (action === 'projetar-aposentadoria') {
        void projetarAposentadoria();
        return;
      }
      if (action === 'acumular-pensoes') {
        void acumularPensoes();
        return;
      }
      if (action === 'avaliar-qualidade') {
        void avaliarQualidade();
        return;
      }
      if (action === 'calcular-complementar') {
        calcularComplementar();
        return;
      }
      if (action === 'imprimir') {
        if (typeof window !== 'undefined' && typeof window.print === 'function') window.print();
        return;
      }
      if (action === 'reload-catalog') {
        catalogAttempted = false;
        loadCatalog();
      }
    });
  }

  function buildCivelInput() {
    const itens = form.itens.map((item, index) => ({
      id: item.id || `item-${index + 1}`,
      especie: item.especie,
      descricao: item.descricao || null,
      data: item.data,
      valor: normalizeNumber(item.valor),
      ...(item.jurosDe ? { jurosDe: item.jurosDe } : {})
    }));
    const input = { atualizacaoAte: form.atualizacaoAte, itens };
    if (form.correcao && form.correcao !== 'sem') input.correcao = { serie: form.correcao };
    const juros = form.juros === 'percentual-fixo'
      ? { tipo: 'percentual-fixo', percentual: normalizeNumber(form.jurosPercentual) }
      : form.juros === 'serie-mensal'
        ? { tipo: 'serie-mensal', serie: form.jurosSerie }
        : { tipo: form.juros };
    input.juros = juros;
    const multa = normalizeNumber(form.multaPercentual);
    if (multa && Number(multa) > 0) input.multa = { percentual: multa, base: form.multaBase };
    const honorarios = normalizeNumber(form.honorariosPercentual);
    if (honorarios && Number(honorarios) > 0) input.honorarios = { percentual: honorarios, base: form.honorariosBase };
    return input;
  }

  function validateCivel(input) {
    if (!input.atualizacaoAte) return 'Informe a data de atualização.';
    for (const [index, item] of input.itens.entries()) {
      if (!item.data) return `Informe a data-base do item ${index + 1}.`;
      if (!item.valor && item.valor !== '0') return `Informe o valor do item ${index + 1}.`;
    }
    if (input.juros.tipo === 'percentual-fixo' && !input.juros.percentual) return 'Informe o percentual mensal dos juros.';
    return null;
  }

  function buildTrabalhistaInput() {
    const descontos = trabalhista.descontos
      .map(desconto => ({ descricao: String(desconto.descricao || '').trim(), valor: normalizeNumber(desconto.valor) }))
      .filter(desconto => desconto.descricao || desconto.valor);
    const input = {
      salario: normalizeNumber(trabalhista.salario),
      admissao: trabalhista.admissao,
      desligamento: trabalhista.desligamento,
      tipoDesligamento: trabalhista.tipoDesligamento,
      diasTrabalhados: Number(trabalhista.diasTrabalhados || 30),
      feriasVencidas: Number(trabalhista.feriasVencidas || 0),
      descontos
    };
    if (trabalhista.aviso) input.aviso = trabalhista.aviso;
    const saldoFgts = normalizeNumber(trabalhista.saldoFgts);
    if (saldoFgts) input.saldoFgts = saldoFgts;
    if (trabalhista.tributacaoAtiva !== false) {
      const tributacao = { ano: 2026, dependentes: Number(trabalhista.dependentes || 0) };
      const pensao = normalizeNumber(trabalhista.pensao);
      if (pensao) tributacao.pensao = pensao;
      const outras = normalizeNumber(trabalhista.outrasDeducoes);
      if (outras) tributacao.outrasDeducoes = outras;
      input.tributacao = tributacao;
    }
    return input;
  }

  function validateTrabalhista(input) {
    if (!input.salario || Number(input.salario) <= 0) return 'Informe um salário maior que zero.';
    if (!input.admissao) return 'Informe a data de admissão.';
    if (!input.desligamento) return 'Informe a data de desligamento.';
    if (!Number.isInteger(input.diasTrabalhados) || input.diasTrabalhados < 0 || input.diasTrabalhados > 30) {
      return 'Dias trabalhados devem ficar entre 0 e 30.';
    }
    if (input.tributacao && (!Number.isInteger(input.tributacao.dependentes) || input.tributacao.dependentes < 0 || input.tributacao.dependentes > 20)) {
      return 'Dependentes do IRRF devem ficar entre 0 e 20.';
    }
    for (const [index, desconto] of input.descontos.entries()) {
      if (!desconto.descricao || !desconto.valor) return `Desconto ${index + 1} exige descrição e valor.`;
    }
    const exigeSaldo = ['sem_justa_causa', 'acordo_484a'].includes(input.tipoDesligamento);
    if (exigeSaldo && !input.saldoFgts) return 'Informe o saldo do FGTS para calcular a multa.';
    return null;
  }

  function buildPrevidenciarioInput() {
    const competencias = previdenciario.competencias
      .map(item => ({ competencia: String(item.competencia || '').trim(), salario: normalizeNumber(item.salario) }))
      .filter(item => item.competencia || item.salario);
    const input = { sexo: previdenciario.sexo, competencias };
    if (previdenciario.divisorMinimo) input.divisorMinimo = true;
    if (previdenciario.corrigirSalarios) {
      input.corrigirSalarios = true;
      input.descarte = previdenciario.descarte !== false;
    }
    if (previdenciario.dataNascimento) input.dataNascimento = previdenciario.dataNascimento;
    const teto = normalizeNumber(previdenciario.teto);
    if (teto) input.teto = teto;
    const piso = normalizeNumber(previdenciario.piso);
    if (piso) input.piso = piso;
    return input;
  }

  function validatePrevidenciario(input) {
    if (input.competencias.length === 0) return 'Informe ao menos uma competência com salário.';
    for (const [index, item] of input.competencias.entries()) {
      if (!item.competencia || !item.salario) return `Competência ${index + 1} exige mês e salário.`;
      if (item.competencia < '1994-07') return `Competência ${item.competencia} é anterior a 07/1994 e não entra no PBC.`;
    }
    return null;
  }

  function compactarResultado(resultado) {
    const original = JSON.stringify(resultado);
    if (original.length <= 120_000) return { resultado, compactada: false };
    const clone = JSON.parse(original);
    let compactada = false;
    if (Array.isArray(clone.memoria)) {
      clone.memoria = clone.memoria.map(entry => {
        if (!entry || typeof entry !== 'object' || !Array.isArray(entry.meses)) return entry;
        compactada = true;
        const { meses, ...rest } = entry;
        return { ...rest, memoriaMensalRemovida: true };
      });
    }
    if (compactada) clone.memoriaCompactada = true;
    if (JSON.stringify(clone).length > 140_000) {
      throw new Error('O cálculo é muito extenso para salvar; reduza itens ou o período.');
    }
    return { resultado: clone, compactada };
  }

  function tituloSugerido(input) {
    if (aba === 'trabalhista') return `Rescisão · ${input.tipoDesligamento} · ${input.desligamento || ''}`.trim();
    if (aba === 'previdenciario') {
      const primeira = input.competencias[0]?.competencia || '';
      const ultima = input.competencias[input.competencias.length - 1]?.competencia || '';
      return `RMI · ${primeira} a ${ultima}`.trim();
    }
    const primeiro = input.itens.find(item => item.descricao)?.descricao || 'Cálculo cível';
    return `${primeiro} · até ${input.atualizacaoAte || ''}`.trim();
  }

  async function salvar() {
    if (!store) {
      error = 'Persistência indisponível nesta sessão.';
      render();
      return { ok: false, error };
    }
    if (!result || resultAba !== aba) return { ok: false, error: 'Calcule antes de salvar.' };
    salvando = true;
    error = '';
    render();
    try {
      const input = aba === 'trabalhista'
        ? buildTrabalhistaInput()
        : aba === 'previdenciario'
          ? buildPrevidenciarioInput()
          : buildCivelInput();
      const { resultado } = compactarResultado(result);
      const record = {
        id: resultAba === aba && resultadoSalvoId ? resultadoSalvoId : `calc-${aba}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
        tipo: aba,
        titulo: tituloSugerido(input),
        entrada: JSON.parse(JSON.stringify(input)),
        resultado,
        createdAt: new Date().toISOString(),
        createdBy: getCurrentUserName?.() || null,
        schemaVersion: 1
      };
      store.upsert('calculations', record);
      const flushed = await store.flush();
      if (!flushed) throw new Error('Não foi possível salvar no servidor. O cálculo permanece apenas nesta sessão; tente novamente.');
      resultadoSalvoId = record.id;
      pendingDelete = null;
      store.audit?.('Cálculo salvo', `${aba} · ${record.titulo}`);
      showToast?.('Cálculo salvo no estado do escritório.', 'success');
    } catch (err) {
      error = err?.message || 'Falha ao salvar o cálculo.';
    }
    salvando = false;
    render();
    return { ok: !error, error };
  }

  function abrir(id) {
    const records = Array.isArray(store?.state?.calculations) ? store.state.calculations : [];
    const record = records.find(item => item?.id === id);
    if (!record) {
      showToast?.('Cálculo salvo não encontrado.', 'error');
      return { ok: false };
    }
    aba = ['trabalhista', 'previdenciario'].includes(record.tipo) ? record.tipo : 'civel';
    const entrada = record.entrada || {};
    if (aba === 'civel') {
      form.atualizacaoAte = entrada.atualizacaoAte || form.atualizacaoAte;
      form.correcao = entrada.correcao?.serie ? entrada.correcao.serie : 'sem';
      form.juros = entrada.juros?.tipo || 'sem';
      form.jurosPercentual = entrada.juros?.percentual || '';
      form.jurosSerie = entrada.juros?.serie || 'SELIC';
      form.multaPercentual = entrada.multa?.percentual || '';
      form.multaBase = entrada.multa?.base || 'debitos-atualizados';
      form.honorariosPercentual = entrada.honorarios?.percentual || '';
      form.honorariosBase = entrada.honorarios?.base || 'debitos-atualizados';
      const itens = Array.isArray(entrada.itens) ? entrada.itens : [];
      form.itens = itens.length > 0
        ? itens.map((item, index) => ({
            id: item.id || `item-${index + 1}`,
            especie: item.especie || 'debito',
            descricao: item.descricao || '',
            data: item.data || '',
            valor: item.valor || '',
            jurosDe: item.jurosDe || ''
          }))
        : [{ id: 'item-1', especie: 'debito', descricao: '', data: getIsoDate(), valor: '', jurosDe: '' }];
    }
    if (aba === 'trabalhista') {
      trabalhista.salario = entrada.salario || '';
      trabalhista.admissao = entrada.admissao || '';
      trabalhista.desligamento = entrada.desligamento || '';
      trabalhista.tipoDesligamento = entrada.tipoDesligamento || 'sem_justa_causa';
      trabalhista.aviso = entrada.aviso || '';
      trabalhista.diasTrabalhados = entrada.diasTrabalhados === undefined ? '30' : String(entrada.diasTrabalhados);
      trabalhista.feriasVencidas = entrada.feriasVencidas === undefined ? '0' : String(entrada.feriasVencidas);
      trabalhista.saldoFgts = entrada.saldoFgts || '';
      const descontos = Array.isArray(entrada.descontos) ? entrada.descontos : [];
      trabalhista.descontos = descontos.length > 0
        ? descontos.map((desconto, index) => ({ id: `desconto-${index + 1}`, descricao: desconto.descricao || '', valor: desconto.valor || '' }))
        : [{ id: 'desconto-1', descricao: '', valor: '' }];
    }
    if (aba === 'previdenciario') {
      previdenciario.sexo = entrada.sexo || 'feminino';
      previdenciario.dataNascimento = entrada.dataNascimento || '';
      previdenciario.teto = entrada.teto || '';
      previdenciario.piso = entrada.piso || '';
      previdenciario.divisorMinimo = entrada.divisorMinimo === true;
      previdenciario.corrigirSalarios = entrada.corrigirSalarios !== false;
      previdenciario.descarte = entrada.descarte !== false;
      const competencias = Array.isArray(entrada.competencias) ? entrada.competencias : [];
      previdenciario.competencias = competencias.length > 0
        ? competencias.map((item, index) => ({ id: `competencia-${index + 1}`, competencia: item.competencia || '', salario: item.salario || '' }))
        : [{ id: 'competencia-1', competencia: '', salario: '' }];
    }
    result = record.resultado;
    resultAba = record.tipo;
    resultadoSalvoId = record.id;
    conferenciaIndices = null;
    pendingDelete = null;
    error = '';
    etapa = record.resultado ? 'resultado' : 'formulario';
    showToast?.('Cálculo salvo aberto para conferência.', 'success');
    render();
    return { ok: true };
  }

  function pedirExclusao(id) {
    pendingDelete = id;
    render();
    return { ok: true };
  }

  function cancelarExclusao() {
    pendingDelete = null;
    render();
    return { ok: true };
  }

  async function confirmarExclusao() {
    if (!store || !pendingDelete) return { ok: false };
    const id = pendingDelete;
    const before = Array.isArray(store.state.calculations) ? store.state.calculations.length : 0;
    store.state.calculations = (store.state.calculations || []).filter(item => item?.id !== id);
    const flushed = await store.flush();
    if (!flushed) {
      error = 'Falha ao excluir o cálculo no servidor; a lista será restaurada ao recarregar.';
      pendingDelete = null;
      render();
      return { ok: false, error };
    }
    store.audit?.('Cálculo excluído', id);
    if (resultadoSalvoId === id) resultadoSalvoId = null;
    pendingDelete = null;
    error = '';
    showToast?.(before > 0 ? 'Cálculo excluído.' : 'Nada a excluir.', 'success');
    render();
    return { ok: true };
  }

  function montarPayloadOficial(tipo) {
    const periodos = oficial.periodos
      .filter(periodo => periodo.dataInicial && periodo.dataFinal)
      .map(periodo => ({ dataInicial: periodo.dataInicial, dataFinal: periodo.dataFinal }));
    if (tipo === 'atrasados') {
      // Objetos avançados (benefícios/HISCRE/lancamentos) entram por JSON conforme o
      // schema oficial (DadosBeneficioApi/DescontosApi/AcrescimoApi/DebitosEmGeralApi).
      let avancado = {};
      if (String(oficial.jsonAvancado || '').trim()) {
        avancado = JSON.parse(oficial.jsonAvancado);
      }
      const numero = value => (String(value ?? '').trim() === '' ? undefined : Number(value));
      const texto = value => (String(value ?? '').trim() === '' ? undefined : String(value).trim());
      const data = value => texto(value);
      const encadeamentoCorrecao = texto(oficial.encadeamentoCorrecao) || 'RES_134_PREVIDENCIARIO';
      const encadeamentoJuros = texto(oficial.encadeamentoJuros) || 'SEM_JUROS';
      const opcaoInicioSelicEc113 = texto(oficial.opcaoInicioSelicEc113) || 'NAO_APLICAR';
      const opcaoTerminoSelicEc113 = texto(oficial.opcaoTerminoSelicEc113) || 'NAO_APLICAR';
      const consectarios = { encadeamentoCorrecao, encadeamentoJuros, opcaoInicioSelicEc113, opcaoTerminoSelicEc113 };
      return {
        dadosProcesso: {
          numero: texto(oficial.numero),
          protocolo: data(oficial.protocolo),
          citacao: data(oficial.citacao),
          transito: data(oficial.transito),
          valorCausa: numero(oficial.valorCausa)
        },
        opcoesCalculo: {
          dataAtualizacao: data(oficial.dataAtualizacao),
          inicioDiferencas: data(oficial.inicioDiferencas),
          terminoDiferencas: data(oficial.terminoDiferencas),
          aplicarPrescricao: oficial.aplicarPrescricao === true,
          criterioDeducaoAlcada: texto(oficial.criterioDeducaoAlcada) || undefined,
          deduzirExcedenteAlcada: oficial.deduzirExcedenteAlcada === true,
          percentualAcordo: numero(oficial.percentualAcordo),
          // Consectários CJF 963/2025: o encadeamento selecionado vale para o
          // principal; o acessório segue a mesma política (evolução: editor próprio).
          ...(texto(oficial.dataAtualizacao) ? {
            consectariosPrincipal: { ...consectarios, encadeamentoCorrecaoConfigurado: [], encadeamentoJurosConfigurado: [] },
            ...(oficial.consectariosAcessoriosJson ? JSON.parse(oficial.consectariosAcessoriosJson) : {
              consectariosAcessorios: { ...consectarios, encadeamentoCorrecaoConfigurado: [], encadeamentoJurosConfigurado: [] }
            })
          } : {})
        },
        beneficiosDevidos: Array.isArray(avancado.beneficiosDevidos) ? avancado.beneficiosDevidos : [],
        beneficiosPagos: Array.isArray(avancado.beneficiosPagos) ? avancado.beneficiosPagos : [],
        periodosBeneficioVantajoso: Array.isArray(avancado.periodosBeneficioVantajoso) ? avancado.periodosBeneficioVantajoso : [],
        descontos: Array.isArray(avancado.descontos) ? avancado.descontos : [],
        acrescimos: Array.isArray(avancado.acrescimos) ? avancado.acrescimos : [],
        outroDebitos: Array.isArray(avancado.outroDebitos) ? avancado.outroDebitos : [],
        honorarios: {
          baseIncidencia: texto(oficial.honorariosBaseIncidencia) || 'NAO_APURAR',
          percentual: numero(oficial.honorariosPercentual),
          aplicarFaixasArt85Cpc: oficial.aplicarFaixasArt85Cpc === true,
          descontarBeneficio: oficial.descontarBeneficio === true
        },
        multa: {
          baseIncidencia: texto(oficial.multaBaseIncidencia) || 'NAO_APURAR',
          percentual: numero(oficial.multaPercentual)
        }
      };
    }
    return {
      dataApuracao: oficial.dataApuracao,
      dadosSegurado: { nascimento: oficial.nascimento, sexo: oficial.sexo },
      opcoesContagem: {},
      periodosContribuicao: periodos
    };
  }

  async function calcularOficial(tipo) {
    const alvo = ['tempo', 'rmi', 'atrasados'].includes(tipo) ? tipo : 'tempo';
    oficial.loading = true;
    oficial.error = '';
    render();
    try {
      const response = await secureFetch(`/api/calc/fabrica/calculo/${alvo}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(montarPayloadOficial(alvo))
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.ok === false) {
        const mensagens = Array.isArray(data?.envelope?.messages) ? data.envelope.messages.filter(Boolean) : [];
        throw new Error(data.message || mensagens.join(' · ') || 'O cálculo oficial não foi concluído.');
      }
      oficial.resultado = data.envelope || data;
      showToast?.(data.message || 'Cálculo oficial concluído.', 'success');
    } catch (err) {
      oficial.resultado = null;
      oficial.error = err?.message || 'Falha no cálculo oficial.';
    }
    oficial.loading = false;
    render();
  }

  async function baixarDemonstrativoOficial() {
    try {
      const tipo = oficial.modo === 'atrasados' ? 'atrasados' : 'rmi';
      const response = await secureFetch(`/api/calc/fabrica/calculo/${tipo}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ ...montarPayloadOficial(tipo), demonstrativo: true })
      });
      const data = await response.json().catch(() => ({}));
      const envelope = data?.envelope || data || {};
      const base64 = typeof envelope.demonstrativo === 'string' ? envelope.demonstrativo
        : (typeof envelope.result?.demonstrativo === 'string' ? envelope.result.demonstrativo : '');
      if (!base64) throw new Error(data.message || 'O demonstrativo oficial não foi devolvido pela API.');
      const binario = Uint8Array.from(atob(base64.replace(/^data:.*?;base64,/, '')), caractere => caractere.charCodeAt(0));
      const blob = new Blob([binario], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const link = documentRef.createElement('a');
      link.href = url;
      link.download = `demonstrativo-oficial-${tipo}-${Date.now()}.pdf`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
      showToast?.('Demonstrativo oficial baixado (PDF do Poder Judiciário).', 'success');
    } catch (err) {
      oficial.error = err?.message || 'Falha ao gerar o demonstrativo oficial.';
      render();
    }
  }

  async function importarCnis({ arquivo = null, ocr = false } = {}) {
    const texto = String(previdenciario.textoCnis || '').trim();
    if (!arquivo && !texto) {
      error = 'Anexe o PDF/planilha do CNIS ou cole o texto para extrair.';
      render();
      return { ok: false, error };
    }
    importando = true;
    error = '';
    render();
    try {
      const body = arquivo ? { filename: arquivo.filename, ...(arquivo.base64 ? { base64: arquivo.base64 } : { texto: arquivo.texto }) } : { texto };
      if (ocr) body.ocr = true;
      const response = await secureFetch('/api/calc/cnis/importar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(body)
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.message || 'Falha ao interpretar o CNIS.');
      previdenciario.importFonte = payload.fonte === 'fabrica' ? 'fabrica' : 'local';
      if (payload.modo === 'ocr-necessario') {
        previdenciario.precisaOcr = true;
        previdenciario.importAvisos = Array.isArray(payload.avisos) ? payload.avisos : [];
        showToast?.('PDF sem camada de texto utilizável: rode o OCR local para extrair.', 'warning');
      } else {
        previdenciario.precisaOcr = false;
        const competencias = Array.isArray(payload.competencias) ? payload.competencias : [];
        previdenciario.competencias = competencias.map((item, index) => ({
          id: `competencia-${index + 1}`,
          competencia: item.competencia,
          salario: item.salario
        }));
        const extraidos = Array.isArray(payload.vinculos) ? payload.vinculos : [];
        const merged = mergeVinculosImportados(tempo.vinculos, extraidos);
        if (merged.added > 0) tempo.vinculos = merged.vinculos;
        const avisos = Array.isArray(payload.avisos) ? [...payload.avisos] : [];
        if (payload.dadosSegurado?.nome) avisos.unshift(`Segurado identificado no documento: ${payload.dadosSegurado.nome}.`);
        if (merged.added > 0) avisos.push(`${merged.added} vínculo(s) adicionados à aba Tempo de contribuição; confira antes de calcular.`);
        previdenciario.importAvisos = avisos;
        if (resultAba === 'previdenciario') result = null;
        const fonte = payload.fonte === 'fabrica' ? ' pela Fábrica de Cálculos' : '';
        showToast?.(`${competencias.length} competência(s) extraída(s)${fonte}; confira antes de calcular.`, 'success');
      }
    } catch (err) {
      error = err?.message || 'Falha ao interpretar o CNIS.';
    }
    importando = false;
    render();
    return { ok: !error, error };
  }

  // Une os vínculos extraídos do CNIS aos já preenchidos, sem duplicar e sem
  // apagar linhas manuais (mesma regra do módulo puro do servidor).
  function mergeVinculosImportados(existentes, extraidos) {
    const out = (Array.isArray(existentes) ? existentes : [])
      .filter(item => String(item?.inicio || '').trim() || String(item?.fim || '').trim());
    const seen = new Set(out.map(item => `${item.inicio || ''}|${item.fim || ''}|${item.tipo || ''}`));
    let added = 0;
    for (const vinculo of Array.isArray(extraidos) ? extraidos : []) {
      const key = `${vinculo?.inicio || ''}|${vinculo?.fim || ''}|${vinculo?.tipo || ''}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        id: `vinculo-${out.length + 1}`,
        inicio: vinculo?.inicio || '',
        fim: vinculo?.fim || '',
        tipo: vinculo?.tipo || 'empregado',
        fator: '',
        origem: vinculo?.origem || 'CNIS'
      });
      added += 1;
    }
    return { vinculos: out, added };
  }

  function lerArquivoImportacao(file) {
    return new Promise((resolve, reject) => {
      const nome = String(file?.name || '').toLowerCase();
      const reader = new (globalThis.FileReader)();
      reader.onerror = () => reject(new Error('Não foi possível ler o arquivo selecionado.'));
      reader.onload = () => {
        const resultado = String(reader.result || '');
        if (nome.endsWith('.csv') || nome.endsWith('.txt')) {
          resolve({ filename: file.name, texto: resultado });
          return;
        }
        const base64 = resultado.includes(',') ? resultado.slice(resultado.indexOf(',') + 1) : resultado;
        resolve({ filename: file.name, base64 });
      };
      if (nome.endsWith('.csv') || nome.endsWith('.txt')) reader.readAsText(file);
      else reader.readAsDataURL(file);
    });
  }

  function buildTempoInput() {
    const vinculos = tempo.vinculos
      .map(item => ({
        inicio: String(item.inicio || '').trim(),
        ...(item.fim ? { fim: String(item.fim).trim() } : {}),
        tipo: item.tipo || 'empregado',
        ...(String(item.fator || '').trim() ? { fator: normalizeNumber(item.fator) } : {})
      }))
      .filter(item => item.inicio || item.fim);
    const input = { vinculos };
    if (tempo.dataReferencia) input.dataReferencia = tempo.dataReferencia;
    if (tempo.ultimaContribuicao) input.ultimaContribuicao = tempo.ultimaContribuicao;
    if (String(tempo.contribuicoesMeses || '').trim()) input.contribuicoesMeses = Number(tempo.contribuicoesMeses);
    if (tempo.desemprego) input.desempregoComprovado = true;
    return input;
  }

  function validateTempo(input) {
    if (input.vinculos.length === 0 && !input.ultimaContribuicao) {
      return 'Informe ao menos um vínculo ou a última contribuição para calcular.';
    }
    for (const [index, vinculo] of input.vinculos.entries()) {
      if (!vinculo.inicio) return `Vínculo ${index + 1} exige a data de início.`;
    }
    if (input.ultimaContribuicao && input.contribuicoesMeses === undefined) {
      return 'Informe quantas contribuições mensais para o período de graça.';
    }
    if (input.contribuicoesMeses !== undefined && (!Number.isInteger(input.contribuicoesMeses) || input.contribuicoesMeses < 0)) {
      return 'Contribuições mensais devem ser um número inteiro não negativo.';
    }
    return '';
  }

  async function conferirIndicesOficiais() {
    if (aba !== 'civel' || resultAba !== 'civel' || !result || conferindoIndices) return;
    const input = buildCivelInput();
    const validationError = validateCivel(input);
    if (validationError) {
      showToast?.(validationError, 'error');
      return;
    }
    conferindoIndices = true;
    render();
    try {
      const response = await secureFetch('/api/calc/civel/conferencia-oficial', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(input)
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.message || 'Falha ao conferir os índices oficiais.');
      conferenciaIndices = payload.conferencia || null;
    } catch (err) {
      conferenciaIndices = null;
      showToast?.(err?.message || 'Falha ao conferir os índices oficiais.', 'error');
    }
    conferindoIndices = false;
    render();
  }

  async function calculate() {
    const abaAtual = aba;
    conferenciaIndices = null;
    if (abaAtual === 'previdenciario') {
      const rmiInput = buildPrevidenciarioInput();
      const tempoInput = buildTempoInput();
      const temRmi = rmiInput.competencias.length > 0;
      const temTempo = tempoInput.vinculos.length > 0 || Boolean(tempoInput.ultimaContribuicao);
      if (!temRmi && !temTempo) {
        error = 'Informe as competências com salários ou os vínculos para calcular.';
        render();
        return { ok: false, error };
      }
      if (temRmi) {
        const rmiError = validatePrevidenciario(rmiInput);
        if (rmiError) {
          error = rmiError;
          render();
          return { ok: false, error };
        }
      }
      if (temTempo) {
        const tempoError = validateTempo(tempoInput);
        if (tempoError) {
          tempo.error = tempoError;
          error = tempoError;
          render();
          return { ok: false, error };
        }
      }
      loading = true;
      error = '';
      tempo.error = '';
      render();
      try {
        const [rmiResposta, tempoResposta] = await Promise.all([
          temRmi
            ? secureFetch('/api/calc/previdenciario/preview', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
                body: JSON.stringify(rmiInput)
              })
            : Promise.resolve(null),
          temTempo
            ? secureFetch('/api/calc/tempo/preview', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
                body: JSON.stringify(tempoInput)
              })
            : Promise.resolve(null)
        ]);
        if (rmiResposta) {
          const payload = await rmiResposta.json().catch(() => ({}));
          if (!rmiResposta.ok) throw new Error(payload?.message || 'Falha ao calcular a RMI.');
          result = payload.calculo;
          resultAba = abaAtual;
          resultadoSalvoId = null;
        } else {
          result = null;
          resultAba = null;
        }
        if (tempoResposta) {
          const payload = await tempoResposta.json().catch(() => ({}));
          if (!tempoResposta.ok) throw new Error(payload?.message || 'Falha ao calcular tempo de contribuição.');
          tempo.resultado = { tempo: payload.tempo || null, qualidade: payload.qualidade || null };
        } else {
          tempo.resultado = null;
        }
        complementar.resultado = null;
        etapa = 'resultado';
        showToast?.('Cálculo atualizado. Confira a memória antes de usar.', 'success');
      } catch (err) {
        error = err?.message || 'Falha ao calcular.';
        if (resultAba === abaAtual) result = null;
      }
      loading = false;
      render();
      return { ok: !error, error };
    }
    const input = abaAtual === 'trabalhista' ? buildTrabalhistaInput() : buildCivelInput();
    const validationError = abaAtual === 'trabalhista' ? validateTrabalhista(input) : validateCivel(input);
    if (validationError) {
      error = validationError;
      if (resultAba === abaAtual) result = null;
      render();
      return { ok: false, error };
    }
    loading = true;
    error = '';
    render();
    try {
      const path = abaAtual === 'trabalhista' ? '/api/calc/trabalhista/preview' : '/api/calc/civel/preview';
      const response = await secureFetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(input)
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.message || 'Falha ao calcular.');
      result = payload.calculo;
      resultAba = abaAtual;
      resultadoSalvoId = null;
      etapa = 'resultado';
      showToast?.('Cálculo atualizado. Confira a memória antes de usar.', 'success');
    } catch (err) {
      error = err?.message || 'Falha ao calcular.';
      if (resultAba === abaAtual) result = null;
    }
    loading = false;
    render();
    return { ok: !error, error };
  }

  function idadeEmAnos() {
    if (!previdenciario.dataNascimento) return null;
    const referencia = tempo.dataReferencia || new Date().toISOString().slice(0, 10);
    const nascimento = new Date(`${previdenciario.dataNascimento}T00:00:00Z`);
    const hoje = new Date(`${referencia}T00:00:00Z`);
    if (Number.isNaN(nascimento.getTime()) || Number.isNaN(hoje.getTime())) return null;
    let idade = hoje.getUTCFullYear() - nascimento.getUTCFullYear();
    const mesDia = hoje.getUTCMonth() - nascimento.getUTCMonth() || hoje.getUTCDate() - nascimento.getUTCDate();
    if (mesDia < 0) idade -= 1;
    return idade >= 0 ? idade : null;
  }

  function buildComplementarInput() {
    const input = {};
    const tempoResultado = tempo.resultado?.tempo || null;
    const rmiResultado = result && resultAba === 'previdenciario' ? result.resumo?.rmi : null;
    const idade = idadeEmAnos();
    if (tempoResultado) {
      const tempoMeses = tempoResultado.total.anos * 12 + tempoResultado.total.meses;
      input.pcd = {
        sexo: previdenciario.sexo,
        grau: complementar.grau,
        tempoMeses,
        carenciaMeses: tempoResultado.carenciaMeses,
        ...(idade !== null ? { idadeAnos: idade } : {}),
        ...(rmiResultado ? { media: String(rmiResultado).replace(/\./g, '').replace(',', '.') } : {}),
        ...(previdenciario.teto ? { teto: normalizeNumber(previdenciario.teto) } : {}),
        ...(previdenciario.piso ? { piso: normalizeNumber(previdenciario.piso) } : {})
      };
    }
    const expectativa = Number(normalizeNumber(complementar.expectativa));
    if (Number.isFinite(expectativa) && expectativa > 0) {
      if (tempoResultado && idade !== null) {
        input.fator = {
          sexo: previdenciario.sexo,
          idadeAnos: idade,
          tempoContribuicaoMeses: tempoResultado.total.anos * 12 + tempoResultado.total.meses,
          expectativaSobrevidaAnos: expectativa
        };
      }
      if (rmiResultado) {
        input.retorno = {
          rmi: String(rmiResultado).replace(/\./g, '').replace(',', '.'),
          mesesRecebimento: Math.round(expectativa * 12),
          ...(idade !== null ? { idadeAnos: idade } : {}),
          ...(String(complementar.contribuicoesTotais || '').trim()
            ? { contribuicoesTotais: normalizeNumber(complementar.contribuicoesTotais) }
            : {})
        };
      }
    }
    return input;
  }

  function validateComplementar(input) {
    if (!input.pcd && !input.fator && !input.retorno) {
      return 'Calcule o tempo de contribuição e a RMI e informe a expectativa de sobrevida para a análise complementar.';
    }
    if (input.pcd && (!Number.isInteger(input.pcd.tempoMeses) || input.pcd.tempoMeses <= 0)) {
      return 'O tempo de contribuição calculado é necessário para a análise PcD.';
    }
    if (input.fator && (!Number.isFinite(Number(input.fator.expectativaSobrevidaAnos)) || Number(input.fator.expectativaSobrevidaAnos) <= 0)) {
      return 'Informe a expectativa de sobrevida em anos (tábua IBGE).';
    }
    return '';
  }

  async function calcularComplementar() {
    const input = buildComplementarInput();
    const validationError = validateComplementar(input);
    if (validationError) {
      complementar.error = validationError;
      render();
      return { ok: false, error: validationError };
    }
    complementar.loading = true;
    complementar.error = '';
    render();
    try {
      const response = await secureFetch('/api/calc/previdenciario/complementar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(input)
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.message || 'Falha na análise complementar.');
      complementar.resultado = {
        pcd: payload.pcd || null,
        fator: payload.fator || null,
        retorno: payload.retorno || null
      };
      showToast?.('Análise complementar atualizada. Confira a tábua e o enquadramento antes de usar.', 'success');
    } catch (err) {
      complementar.error = err?.message || 'Falha na análise complementar.';
      complementar.resultado = null;
    }
    complementar.loading = false;
    render();
    return { ok: !complementar.error, error: complementar.error };
  }

  /* ------------------------------------------------------------------------
   * Análises avançadas — projeção, acumulação de pensões e qualidade de segurado
   *
   * O frontend monta a entrada e envia; quem calcula é o servidor, com os
   * motores portados do original (`lib/calc/projecao.mjs`, `pensao.mjs`,
   * `qualidade-segurado.mjs`). O envelope devolvido é guardado inteiro, e o
   * presenter mostra `status`, `data.native_result` e os avisos — nunca um
   * número recalculado no navegador.
   * ---------------------------------------------------------------------- */

  /** Lista de competências contínuas entre dois meses, com salário fixo. */
  function competenciasContinuas(de, ate, salario) {
    if (!/^\d{4}-\d{2}$/.test(String(de)) || !/^\d{4}-\d{2}$/.test(String(ate))) return [];
    if (de > ate) return [];
    const lista = [];
    let [ano, mes] = de.split('-').map(Number);
    const [anoFim, mesFim] = ate.split('-').map(Number);
    // Teto defensivo: 1200 competências (100 anos) — o servidor também limita.
    for (let i = 0; i < 1200; i += 1) {
      lista.push({ competencia: `${ano}-${String(mes).padStart(2, '0')}`, salario });
      if (ano === anoFim && mes === mesFim) break;
      mes += 1;
      if (mes > 12) { mes = 1; ano += 1; }
    }
    return lista;
  }

  function validarProjecao() {
    const p = avancadas.projecao;
    if (!p.dataNascimento) return 'Informe a data de nascimento para a projeção.';
    if (!p.dataReferencia) return 'Informe a data de referência (ponto de partida da projeção).';
    if (!p.primeiraCompetencia) return 'Informe a primeira competência de contribuição.';
    const salario = normalizeNumber(p.salarioContribuicao);
    if (!salario || Number(salario) <= 0) return 'Informe o salário de contribuição usado na simulação.';
    const fim = p.ultimaCompetencia || p.dataReferencia.slice(0, 7);
    if (p.primeiraCompetencia > fim) return 'A primeira competência não pode ser posterior à última.';
    return '';
  }

  function buildProjecaoInput() {
    const p = avancadas.projecao;
    const salario = normalizeNumber(p.salarioContribuicao);
    const fim = p.ultimaCompetencia || p.dataReferencia.slice(0, 7);
    const input = {
      sexo: p.sexo,
      dataNascimento: p.dataNascimento,
      dataReferencia: p.dataReferencia,
      competencias: competenciasContinuas(p.primeiraCompetencia, fim, salario),
      corrigirSalarios: false
    };
    const expectativa = Number(normalizeNumber(p.expectativaSobrevida));
    if (Number.isFinite(expectativa) && expectativa > 0) input.expectativaSobrevida = expectativa;
    const anteriores = Number(String(p.mesesContribuicaoAnteriores || '').trim());
    if (Number.isInteger(anteriores) && anteriores > 0) input.mesesContribuicaoAnteriores = anteriores;
    if (p.regraAlvo) input.regraAlvo = p.regraAlvo;
    return input;
  }

  async function projetarAposentadoria() {
    const erro = validarProjecao();
    if (erro) {
      avancadas.projecao.error = erro;
      render();
      return { ok: false, error: erro };
    }
    avancadas.projecao.loading = true;
    avancadas.projecao.error = '';
    render();
    try {
      const resposta = await secureFetch('/api/calc/previdenciario/projecao', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(buildProjecaoInput())
      });
      const payload = await resposta.json().catch(() => ({}));
      if (!resposta.ok || payload?.ok === false) {
        throw new Error(payload?.error || payload?.message || `Não foi possível calcular a projeção. Confira os dados e tente de novo.`);
      }
      avancadas.projecao.resultado = payload;
      showToast?.(
        payload.status === 'experimental'
          ? 'Projeção calculada. É estimativa, não certidão de tempo.'
          : 'A projeção não encontrou regra elegível no limite simulado.',
        payload.status === 'experimental' ? 'success' : 'warning'
      );
    } catch (err) {
      avancadas.projecao.error = err?.message || 'Falha ao projetar.';
      avancadas.projecao.resultado = null;
    }
    avancadas.projecao.loading = false;
    render();
    return { ok: !avancadas.projecao.error, error: avancadas.projecao.error };
  }

  function validarPensao() {
    const p = avancadas.pensao;
    if (!p.referenceDate) return 'Informe a data de referência da acumulação.';
    const base = normalizeNumber(p.referenceBase);
    if (!base || Number(base) <= 0) return 'Informe a base de referência das faixas (maior que zero).';
    const rendas = String(p.rendas || '')
      .split(/[\n;,]+/)
      .map(item => normalizeNumber(item))
      .filter(item => item !== '');
    if (rendas.length === 0) return 'Informe ao menos uma renda para acumular.';
    if (rendas.some(item => Number(item) < 0)) return 'Nenhuma renda pode ser negativa.';
    return '';
  }

  function buildPensaoInput() {
    const p = avancadas.pensao;
    return {
      referenceDate: p.referenceDate,
      referenceBase: normalizeNumber(p.referenceBase),
      incomes: String(p.rendas || '')
        .split(/[\n;,]+/)
        .map(item => normalizeNumber(item))
        .filter(item => item !== ''),
      rounding: p.rounding || 'half-up'
    };
  }

  async function acumularPensoes() {
    const erro = validarPensao();
    if (erro) {
      avancadas.pensao.error = erro;
      render();
      return { ok: false, error: erro };
    }
    avancadas.pensao.loading = true;
    avancadas.pensao.error = '';
    render();
    try {
      const resposta = await secureFetch('/api/calc/previdenciario/pensao', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(buildPensaoInput())
      });
      const payload = await resposta.json().catch(() => ({}));
      if (!resposta.ok || payload?.ok === false) {
        throw new Error(payload?.error || payload?.message || `Não foi possível calcular a acumulação. Confira os dados e tente de novo.`);
      }
      avancadas.pensao.resultado = payload;
      showToast?.('Acumulação calculada. A base informada não é índice oficial.', 'success');
    } catch (err) {
      avancadas.pensao.error = err?.message || 'Falha ao acumular.';
      avancadas.pensao.resultado = null;
    }
    avancadas.pensao.loading = false;
    render();
    return { ok: !avancadas.pensao.error, error: avancadas.pensao.error };
  }

  function buildQualidadeInput() {
    const q = avancadas.qualidade;
    const input = {
      insuredCategory: q.insuredCategory,
      stoppedContributing: q.parouDeContribuir === true,
      currentlyReceivingBenefit: q.recebeBeneficio === true
    };
    if (q.ultimaContribuicao) input.lastContributionDate = q.ultimaContribuicao;
    const meses = Number(String(q.contribuicoesMeses || '').trim());
    if (Number.isInteger(meses) && meses >= 0) input.contribuicoesMeses = meses;
    if (q.dataReferencia) input.dataReferencia = q.dataReferencia;
    if (q.desempregoComprovado === true) input.desempregoComprovado = true;
    return input;
  }

  async function avaliarQualidade() {
    const q = avancadas.qualidade;
    if (!q.ultimaContribuicao && !String(q.contribuicoesMeses || '').trim()) {
      q.error = 'Informe a última contribuição, o número de contribuições mensais, ou ambos.';
      render();
      return { ok: false, error: q.error };
    }
    q.loading = true;
    q.error = '';
    render();
    try {
      const resposta = await secureFetch('/api/calc/previdenciario/qualidade-segurado', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(buildQualidadeInput())
      });
      const payload = await resposta.json().catch(() => ({}));
      if (!resposta.ok || payload?.ok === false) {
        throw new Error(payload?.error || payload?.message || `Não foi possível fazer a avaliação. Confira os dados e tente de novo.`);
      }
      q.resultado = payload;
      showToast?.(
        payload.status === 'experimental'
          ? 'Qualidade de segurado avaliada conforme o modelo declarado.'
          : 'Nenhum modelo de qualidade se aplica a esta entrada.',
        payload.status === 'experimental' ? 'success' : 'warning'
      );
    } catch (err) {
      q.error = err?.message || 'Falha ao avaliar a qualidade de segurado.';
      q.resultado = null;
    }
    q.loading = false;
    render();
    return { ok: !q.error, error: q.error };
  }

  /* ========================================================================
   * LC 142/2013 — assistente previdenciário (estado aditivo)
   *
   * A feature é dona do estado e das requisições; o presenter só desenha.
   * Contratos assumidos (definidos pelo Lead desta missão):
   *   POST /api/calc/previdenciario/lc142/preview
   *     corpo    { calculation, politica }
   *     sucesso  { ok: true, resultado: <envelope do contrato §8> }
   *     domínio  HTTP 400 com { error }
   *   POST /api/calc/previdenciario/lc142/relatorio
   *     corpo    { familia, resultado, identificacao }
   *     sucesso  application/pdf (bytes reais)
   * Falha de rede, HTTP != 2xx, `ok: false` e resposta sem envelope são erros
   * reais: nunca viram sucesso presumido nem resultado vazio.
   * ====================================================================== */
  const LC142_ETAPAS_ORDEM = Object.freeze(['hipoteses', 'assistente', 'cnis', 'vinculos', 'contribuicoes', 'premissas', 'revisao', 'resultado', 'relatorios']);
  const lc142 = {
    aberto: false,
    etapa: 'hipoteses',
    hipoteses: [],
    erro: '',
    // Assistente
    modoEditor: false,
    passoAssistente: 0,
    grau: 'moderada',
    sexo: 'feminino',
    nascimento: '',
    dib: '',
    dataBase: '',
    respostas: {},
    hipoteseId: null,
    // CNIS
    cnis: { status: 'idle', arquivo: null, arquivoBase64: null, erro: '', progresso: null, fonte: '', resumo: null, pendencias: [] },
    cnisCancelado: false,
    // Vínculos
    vinculos: [],
    vinculoDrawer: null,
    vinculoGatilho: null,
    // Contribuições
    competencias: [],
    parcelas: [],
    selecionadas: [],
    resumoParcelas: {},
    // Premissas
    /* `snapshot` guarda o que o SERVIDOR atestou (URL oficial, SHA-256 do corpo
     * recebido, instante). O navegador nunca monta nem altera esse objeto; só
     * repassa. `snapshotBuscando` evita duplo clique durante a consulta. */
    snapshot: null,
    snapshotBuscando: false,
    indices: [],
    limitesMensais: [],
    premissasConfirmadas: false,
    // Revisão
    revisaoGrupos: [],
    revisaoConfirmada: false,
    /* O motor exige fundamentação não vazia: sem `review_evidence` ele devolve
     * `lc142_review` e sem `disability_evidence` devolve `lc142_disability_periods`.
     * Antes esses valores eram lidos daqui mas NUNCA preenchidos pela UI, então
     * o cálculo sempre voltava bloqueado. */
    reviewEvidence: '',
    disabilityEvidence: '',
    blockers: [],
    calculando: false,
    // Resultado/relatórios
    resultado: null,
    // Cenário exato que gerou o envelope: enviado ao endpoint de relatório, que
    // recalcula no servidor e não aceita `resultado` do browser.
    cenarioCalculado: null,
    capacidades: { status: 'idle', naoSuportado: [], versao: null, erro: '' },
    validando: false,
    validacao: null,
    relatorio: { tipo: 'detailed', identificacao: false, preview: null, gerando: false, erro: '' }
  };
  let lc142NextVinculoId = 1;

  function lc142Exposta() {
    return {
      ...lc142,
      // `parcelas` prioriza a correção devolvida pelo motor; antes disso mostra o
      // que foi importado do CNIS, com origem declarada — nunca inventa valores.
      parcelas: lc142.parcelas.length > 0 ? lc142.parcelas : lc142.competencias.map((item, index) => ({
        competencia: item.competencia,
        salario: item.salario,
        origem: item.origem || 'imported',
        fonte: item.fonte || 'importação do CNIS',
        descartada: false,
        indice: null,
        corrigido: null,
        teto: null,
        considerado: null,
        dias: null,
        _indice: index
      }))
    };
  }

  function lc142IrPara(etapa) {
    const alvo = LC142_ETAPAS_ORDEM.includes(etapa) ? etapa : 'hipoteses';
    lc142.etapa = alvo;
    lc142.erro = '';
    if (alvo !== 'vinculos') {
      lc142.vinculoDrawer = null;
      lc142.vinculoGatilho = null;
    }
    render();
    // Foco no início do novo passo: teclado e leitor de tela acompanham a troca.
    if (typeof documentRef?.getElementById === 'function') {
      const heading = documentRef.getElementById('lc142Heading');
      if (heading) {
        heading.setAttribute('tabindex', '-1');
        heading.focus?.({ preventScroll: true });
        try { heading.scrollIntoView?.({ block: 'start', behavior: 'instant' }); } catch { /* navegador sem scrollIntoView opcional */ }
      }
    }
  }

  function lc142NovaHipotese() {
    lc142NextVinculoId = 1;
    Object.assign(lc142, {
      aberto: true,
      etapa: 'assistente',
      passoAssistente: 0,
      modoEditor: false,
      grau: 'moderada',
      sexo: 'feminino',
      nascimento: '',
      dib: '',
      dataBase: '',
      respostas: {},
      hipoteseId: `lc142-${Date.now().toString(36)}`,
      cnis: { status: 'idle', arquivo: null, arquivoBase64: null, erro: '', progresso: null, fonte: '', resumo: null, pendencias: [] },
      cnisCancelado: false,
      vinculos: [],
      vinculoDrawer: null,
      vinculoGatilho: null,
      competencias: [],
      parcelas: [],
      selecionadas: [],
      resumoParcelas: {},
      snapshot: null,
      snapshotBuscando: false,
      indices: [],
      limitesMensais: [],
      premissasConfirmadas: false,
      revisaoGrupos: [],
      revisaoConfirmada: false,
      reviewEvidence: '',
      disabilityEvidence: '',
      blockers: [],
      calculando: false,
      resultado: null,
      cenarioCalculado: null,
      validando: false,
      validacao: null,
      relatorio: { tipo: 'detailed', identificacao: false, preview: null, gerando: false, erro: '' },
      erro: ''
    });
    render();
  }

  function lc142Fechar() {
    lc142.aberto = false;
    lc142.vinculoDrawer = null;
    render();
  }

  /* Abre a superfície LC 142 a partir da aba Previdenciário. Idempotente: só
   * consulta as capacidades declaradas do motor na primeira abertura. */
  function lc142Abrir() {
    lc142.aberto = true;
    lc142.etapa = 'hipoteses';
    render();
    lc142ObservarToast();
    if (lc142.capacidades.status === 'idle') void lc142CarregarCapacidades();
  }

  // "Não sei" é uma resposta declarada — não vira "não" nem preenche valor.
  function lc142Responder(pergunta, valor) {
    if (!pergunta) return;
    lc142.respostas = { ...lc142.respostas, [pergunta]: valor };
    const mapa = { grau: 'grau', sexo: 'sexo', nascimento: 'nascimento', dib: 'dib', dataBase: 'dataBase' };
    const campo = mapa[pergunta];
    if (campo) lc142[campo] = valor;
    lc142.erro = '';
    render();
  }

  function lc142ProximoPasso() {
    const perguntas = ['grau', 'sexo', 'nascimento', 'dib', 'dataBase'];
    if (lc142.passoAssistente < perguntas.length - 1) {
      lc142.passoAssistente += 1;
      render();
      return;
    }
    // Fim do assistente: pendências declaradas ("Não sei") viram bloqueio de revisão.
    const naoSei = perguntas.filter(pergunta => lc142.respostas[pergunta] === 'nao_sei');
    lc142.blockers = naoSei.map(pergunta => ({
      code: 'lc142_assistente_nao_informado',
      field: `assistente.${pergunta}`,
      message: `A pergunta "${pergunta}" ficou sem resposta declarada. Informe o dado ou registre a hipótese na revisão.`
    }));
    lc142IrPara('cnis');
  }

  function lc142VoltarPasso() {
    if (lc142.passoAssistente > 0) {
      lc142.passoAssistente -= 1;
      render();
      return;
    }
    lc142IrPara('hipoteses');
  }

  // --- CNIS ---------------------------------------------------------------
  let lc142ImportacaoToken = 0;

  async function lc142LerCnis() {
    if (!lc142.cnis.arquivo) {
      lc142.erro = 'Selecione o arquivo do CNIS antes de ler.';
      render();
      return { ok: false, error: lc142.erro };
    }
    const token = ++lc142ImportacaoToken;
    lc142.cnis = { ...lc142.cnis, status: 'processando', erro: '', progresso: null, pendencias: [] };
    lc142.erro = '';
    render();
    try {
      const body = lc142.cnis.arquivoBase64
        ? { filename: lc142.cnis.arquivo, base64: lc142.cnis.arquivoBase64 }
        : { filename: lc142.cnis.arquivo, texto: lc142.cnis.texto || '' };
      const response = await secureFetch('/api/calc/cnis/importar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(body)
      });
      const payload = await response.json().catch(() => ({}));
      // Cancelamento explícito: descarta a resposta e mantém o estado cancelado.
      if (token !== lc142ImportacaoToken) return { ok: false, cancelled: true };
      if (!response.ok || payload?.ok === false) {
        throw new Error(payload?.message || 'A leitura do CNIS não foi concluída pelo servidor.');
      }
      const competencias = (Array.isArray(payload.competencias) ? payload.competencias : []).map(item => ({
        competencia: item.competencia,
        salario: item.salario,
        origem: item.origem || 'imported',
        fonte: payload.fonte === 'fabrica' ? 'Fábrica de Cálculos (TRF3)' : 'extração local'
      }));
      const vinculosNovos = (Array.isArray(payload.vinculos) ? payload.vinculos : []).map(item => ({
        id: `vinculo-${lc142NextVinculoId++}`,
        empresa: item.empresa || item.empregador || 'Empregador não informado',
        inicio: item.inicio || '',
        fim: item.fim || '',
        regime: item.tipo || item.regime || 'Empregado',
        fonte: item.origem || 'CNIS',
        pendencia: item.fim ? '' : 'Vínculo aberto: declare a evidência de continuidade.',
        revisoes: []
      }));
      lc142.competencias = competencias;
      lc142.vinculos = vinculosNovos;
      lc142.parcelas = [];
      lc142.resumoParcelas = {
        competencias: competencias.length,
        consideradas: null,
        descartadas: null,
        soma: null
      };
      lc142.cnis = {
        ...lc142.cnis,
        status: 'pronto',
        progresso: 100,
        erro: '',
        fonte: payload.fonte === 'fabrica' ? 'Fábrica de Cálculos (TRF3)' : 'extração local',
        resumo: payload.resumo || { competencias: competencias.length, vinculos: vinculosNovos.length },
        pendencias: Array.isArray(payload.avisos) ? payload.avisos : []
      };
      showToast?.(`${competencias.length} competência(s) lidas do CNIS; confira as pendências.`, 'success');
    } catch (err) {
      if (token !== lc142ImportacaoToken) return { ok: false, cancelled: true };
      lc142.cnis = { ...lc142.cnis, status: 'erro', erro: err?.message || 'Falha ao ler o CNIS.', progresso: null };
    }
    render();
    return { ok: lc142.cnis.status === 'pronto', error: lc142.cnis.erro };
  }

  function lc142CancelarLeituraCnis() {
    lc142ImportacaoToken += 1;
    lc142.cnis = { ...lc142.cnis, status: 'cancelado', erro: '', progresso: null };
    lc142.cnisCancelado = true;
    render();
    return { ok: true };
  }

  // --- Vínculos ------------------------------------------------------------
  function lc142AbrirVinculo(id) {
    const vinculo = lc142.vinculos.find(item => item.id === id);
    if (!vinculo) return { ok: false };
    lc142.vinculoGatilho = id;
    lc142.vinculoDrawer = { vinculo: { ...vinculo }, motivo: '', origem: vinculo.fonte === 'CNIS' ? 'imported' : 'reviewed_overlay', erro: '' };
    render();
    return { ok: true };
  }

  function lc142FecharVinculo() {
    const gatilho = lc142.vinculoGatilho;
    lc142.vinculoDrawer = null;
    render();
    if (gatilho) {
      const botao = documentRef?.querySelector?.(`[data-lc142-action="vinculo-abrir"][data-id="${gatilho}"]`);
      botao?.focus?.();
    }
    lc142.vinculoGatilho = null;
    return { ok: true };
  }

  function lc142SalvarVinculo(id) {
    const drawer = lc142.vinculoDrawer;
    if (!drawer) return { ok: false };
    const motivo = String(drawer.motivo || '').trim();
    if (!motivo) {
      drawer.erro = 'O motivo do ajuste é obrigatório: sem ele a alteração não é registrada.';
      render();
      const campo = documentRef?.getElementById?.('lc142DrawerMotivo');
      campo?.focus?.();
      return { ok: false, error: drawer.erro };
    }
    const indice = lc142.vinculos.findIndex(item => item.id === id);
    if (indice < 0) return { ok: false };
    const vinculo = lc142.vinculos[indice];
    const revisoes = Array.isArray(vinculo.revisoes) ? vinculo.revisoes.slice() : [];
    revisoes.unshift({ descricao: `Ajuste: ${motivo}`, em: getIsoDate() });
    lc142.vinculos[indice] = {
      ...vinculo,
      inicio: drawer.vinculo.inicio || vinculo.inicio,
      fim: drawer.vinculo.fim ?? vinculo.fim,
      fonte: drawer.origem === 'imported' ? vinculo.fonte : 'revisão humana',
      pendencia: (drawer.vinculo.fim ?? vinculo.fim) ? '' : 'Vínculo aberto: declare a evidência de continuidade.',
      revisoes
    };
    // Ajuste humano reabre a confirmação de revisão e invalida o resultado anterior.
    lc142.revisaoConfirmada = false;
    lc142.resultado = null;
    lc142.parcelas = [];
    lc142.erro = '';
    const gatilho = lc142.vinculoGatilho;
    lc142.vinculoDrawer = null;
    render();
    if (gatilho) documentRef?.querySelector?.(`[data-lc142-action="vinculo-abrir"][data-id="${gatilho}"]`)?.focus?.();
    lc142.vinculoGatilho = null;
    return { ok: true };
  }

  // --- Contribuições -------------------------------------------------------
  function lc142ToggleContribuicao(indice) {
    const numero = Number(indice);
    if (!Number.isInteger(numero) || numero < 0) return { ok: false };
    const atual = new Set(lc142.selecionadas);
    if (atual.has(numero)) atual.delete(numero); else atual.add(numero);
    lc142.selecionadas = [...atual].sort((a, b) => a - b);
    render();
    return { ok: true };
  }

  function lc142SelecionarTodas() {
    lc142.selecionadas = lc142Exposta().parcelas.map((_, indice) => indice);
    render();
    return { ok: true };
  }

  function lc142LimparSelecao() {
    lc142.selecionadas = [];
    render();
    return { ok: true };
  }

  function lc142ConferirLote() {
    if (lc142.selecionadas.length === 0) {
      lc142.erro = 'Selecione ao menos uma competência para conferir em lote.';
      render();
      return { ok: false, error: lc142.erro };
    }
    const total = lc142.selecionadas.length;
    lc142.erro = '';
    showToast?.(`${total} competência(s) marcadas para conferência. Nenhum valor foi alterado.`, 'success');
    render();
    return { ok: true, total };
  }

  // --- Premissas -----------------------------------------------------------
  function lc142DefinirPremissas(valor) {
    lc142.premissasConfirmadas = valor === true;
    lc142.revisaoConfirmada = false;
    // A confirmação de premissas marca o cenário como declarado no envelope.
    if (lc142.snapshot) {
      lc142.revisaoGrupos = lc142MontarRevisao();
    }
    render();
    return { ok: true };
  }

  function lc142MontarRevisao() {
    const importados = lc142.competencias.filter(item => (item.origem || 'imported') === 'imported').length;
    const alterados = lc142.vinculos.filter(item => Array.isArray(item.revisoes) && item.revisoes.length > 0).length;
    const assumidos = lc142Exposta().parcelas.filter(item => String(item.origem || '').startsWith('declared_')).length;
    return [
      {
        chave: 'importado',
        titulo: 'Importado',
        descricao: 'Dados lidos do CNIS sem alteração humana.',
        quantidade: importados,
        itens: lc142.competencias.filter(item => (item.origem || 'imported') === 'imported').slice(0, 8).map(item => `${item.competencia} · ${item.salario}`)
      },
      {
        chave: 'alterado',
        titulo: 'Alterado por revisão',
        descricao: 'Dados ajustados por pessoa, com motivo registrado no histórico do vínculo.',
        quantidade: alterados,
        itens: lc142.vinculos.filter(item => Array.isArray(item.revisoes) && item.revisoes.length > 0).map(item => `${item.empresa}: ${item.revisoes[0].descricao}`)
      },
      {
        chave: 'assumido',
        titulo: 'Assumido por hipótese',
        descricao: 'Competências preenchidas por piso ou projetadas pelo teto congelado. Não são salários extraídos.',
        quantidade: assumidos,
        itens: lc142Exposta().parcelas.filter(item => String(item.origem || '').startsWith('declared_')).map(item => `${item.competencia} · ${item.salario} (${item.origem})`)
      }
    ];
  }

  // --- Payload e cálculo ---------------------------------------------------
  function lc142NormalizarSalarioCentavos(valor) {
    const texto = String(valor ?? '').trim().replace(/\s|R\$/g, '');
    if (!texto) return null;
    const normalizado = texto.includes('.') && texto.includes(',')
      ? texto.replaceAll('.', '').replace(',', '.')
      : texto.includes(',') ? texto.replace(',', '.') : texto;
    const partes = normalizado.split('.');
    const inteiro = (partes[0] || '0').replace(/\D/g, '') || '0';
    const decimal = ((partes[1] || '') + '00').slice(0, 2).replace(/\D/g, '') || '00';
    // Sem aritmética de ponto flutuante: centavos são montados como string.
    return Number(`${inteiro}${decimal}`);
  }

  function buildLc142Calculation() {
    const links = lc142.vinculos.map((vinculo, indice) => ({
      affiliation: vinculo.regime || 'Empregado',
      end_date: vinculo.fim ? vinculo.fim : null,
      excluded_from_validated_domain: false,
      indicators: [],
      inferred_last_salary_end: null,
      prpps: false,
      raw_employer: vinculo.empresa || '',
      reported_last_salary_month: null,
      source: { byte_offset: null, index: indice + 1, line: null, page: null },
      start_date: vinculo.inicio || '',
      validation_status: vinculo.pendencia ? 'unvalidated' : 'reviewed'
    }));
    const salaryEntries = lc142.competencias.map((item, indice) => ({
      amount_centavos: lc142NormalizarSalarioCentavos(item.salario),
      amount_kind: 'remuneration',
      competence: item.competencia,
      excluded_from_validated_domain: false,
      indicators: [],
      link_sequence: null,
      source: { byte_offset: null, index: indice + 1, line: null, page: null },
      validation_status: item.origem === 'imported' ? 'unvalidated' : 'reviewed'
    }));
    const grau = lc142.grau === 'nao_sei' ? '' : lc142.grau;
    /* `salary_months` é o AGREGADO por competência que o motor consome (o
     * `salary_entries` é a lista de lançamentos com rastreabilidade). Enviar
     * `salary_months: {}` fazia o motor concluir "Sem salários no PBC suportado"
     * e responder 400 — a UI nunca calculava. Aqui somamos os centavos por
     * competência em BigInt, sem `Number`, e guardamos os índices de origem. */
    const salaryMonths = (() => {
      const agregado = new Map();
      salaryEntries.forEach((entrada, indice) => {
        const competencia = entrada.competence;
        if (!competencia) return;
        const centavos = BigInt(String(entrada.amount_centavos?.value ?? entrada.amount_centavos ?? 0));
        const atual = agregado.get(competencia) || {
          amount_sum_centavos: 0n,
          contains_unresolved_prpps: false,
          count: 0,
          entry_indices: []
        };
        atual.amount_sum_centavos = atual.amount_sum_centavos + centavos;
        atual.count += 1;
        atual.entry_indices.push(indice + 1);
        agregado.set(competencia, atual);
      });
      const objeto = {};
      for (const [competencia, valor] of agregado) {
        objeto[competencia] = {
          // O motor espera inteiro de centavos; serialize como número seguro.
          amount_sum_centavos: Number(valor.amount_sum_centavos),
          contains_unresolved_prpps: valor.contains_unresolved_prpps,
          count: valor.count,
          entry_indices: valor.entry_indices
        };
      }
      return objeto;
    })();
    return {
      archived: false,
      assistant: null,
      client_id: null,
      cnis: {
        benefits: [],
        findings: [],
        identity: { birth_date: lc142.nascimento || null, cpf: null, full_name: null, mother_name: null, nit: null },
        links,
        metadata: { extractor: 'atrium-lc142-ui', legal_validation_performed: false, page_count: null, parsed_pages: null, source_sha256: null },
        salary_entries: salaryEntries,
        salary_months: salaryMonths,
        warnings: []
      },
      contribution_review: null,
      dib: lc142.dib ? `${lc142.dib}T00:00:00Z`.slice(0, 10) : '',
      disability: grau === 'grave' ? 'Grave' : grau === 'leve' ? 'Leve' : grau === 'moderada' ? 'Moderada' : '',
      id: 0,
      identity: { birth_date: lc142.nascimento || null, cpf: null, full_name: null, mother_name: null, nit: null },
      kind: 'RGPS',
      manual_links: [],
      manual_salaries: [],
      name: 'Hipótese LC 142',
      notes: '',
      options: { correction_index: '', fees_fixed: '', fees_percent: '', include_thirteenth: false, interest_kind: '', interest_rate: '', prescription_date: '', reference_base: '', rule_policy: '', version: 'rgps-core-observational-v1' },
      result: null,
      scenario: '',
      sex: lc142.sexo === 'masculino' ? 'Masculino' : lc142.sexo === 'feminino' ? 'Feminino' : '',
      status: ''
    };
  }

  function buildLc142Politica() {
    const snapshot = lc142.snapshot || {};
    /* `correction_month` é COMPETÊNCIA (AAAA-MM), não data. `dataBase` é uma
     * data ISO completa vinda de `<input type="date">`; mandá-la crua fazia o
     * motor comparar `2026-10-19` com o corte do snapshot e recusar o cálculo. */
    const competenciaBase = (() => {
      const bruto = String(lc142.dataBase || '').trim();
      const iso = /^(\d{4})-(\d{2})/.exec(bruto);
      return iso ? `${iso[1]}-${iso[2]}` : '';
    })();
    return {
      lc142: {
        apply_inss_overrides: true,
        assumptions_confirmed: lc142.premissasConfirmadas === true,
        calculation_date: lc142.dataBase || getIsoDate(),
        correction_month: competenciaBase,
        disability_all_periods: true,
        disability_evidence: lc142.disabilityEvidence || '',
        fill_missing_minimum: lc142.fillMissingMinimum === true,
        historical_negative_policy: 'preserve',
        missing_salary_evidence: lc142.missingSalaryEvidence || '',
        ongoing_evidence: lc142.ongoingEvidence || '',
        project_at_known_ceiling: lc142.projectAtKnownCeiling === true,
        project_open_links: lc142.projectOpenLinks === true,
        projection_evidence: lc142.projectionEvidence || '',
        review_evidence: lc142.reviewEvidence || '',
        rgps_confirmed: true,
        snapshot: snapshot.cru || null,
        version: 'lc142-constant-grade-v1'
      },
      version: 'rgps-core-observational-v1'
    };
  }

  /**
   * Busca os índices oficiais e guarda o snapshot devolvido pelo servidor.
   *
   * O frontend NÃO monta o snapshot: ele carrega proveniência (URL oficial,
   * SHA-256 do corpo recebido, instante de coleta) e é a base de índices, piso
   * e teto. Forjar isso no navegador seria falsificar a proveniência. Aqui só
   * pedimos ao servidor e guardamos o que ele atestou.
   */
  async function lc142BuscarSnapshot() {
    const competencia = (() => {
      const bruto = String(lc142.dataBase || '').trim();
      const iso = /^(\d{4})-(\d{2})/.exec(bruto);
      return iso ? `${iso[1]}-${iso[2]}` : '';
    })();
    if (!competencia) {
      lc142.erro = 'Informe a data-base antes de consultar os índices oficiais.';
      render();
      return { ok: false, error: lc142.erro };
    }
    if (lc142.snapshotBuscando === true) return { ok: false, error: '' };
    lc142.snapshotBuscando = true;
    lc142.erro = '';
    render();
    try {
      // Limites de piso/teto: vêm do que o operador declarou na hipótese; sem
      // eles o servidor recusa o snapshot em vez de inventar constante.
      const limites = Array.isArray(lc142.limitesMensais) ? lc142.limitesMensais : [];
      const response = await secureFetch('/api/calc/previdenciario/lc142/snapshot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ through: competencia, limites })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.ok || !payload?.snapshot) {
        throw new Error(payload?.error || payload?.message || `O servidor não devolveu o snapshot (HTTP ${response.status}).`);
      }
      lc142.snapshot = { cru: payload.snapshot, buscadoEm: payload.snapshot.retrieved_at };
      lc142.snapshotBuscando = false;
      lc142.erro = '';
      showToast?.('Índices oficiais obtidos e atestados pelo servidor.', 'success');
      render();
      return { ok: true };
    } catch (err) {
      lc142.snapshotBuscando = false;
      lc142.snapshot = null;
      // A mensagem do servidor já diz o que fazer; não mascarar com texto genérico.
      lc142.erro = err?.message || 'Não foi possível consultar os índices oficiais.';
      render();
      return { ok: false, error: lc142.erro };
    }
  }

  async function lc142Calcular() {
    /* Ordem das guardas: primeiro a confirmação de revisão (o contrato do
     * cenário exige revisão humana explícita), depois a completude dos dados.
     * Assim a mensagem ao usuário é sempre a do próximo passo real. */
    if (lc142.revisaoConfirmada !== true) {
      lc142.erro = 'Confirme os dados importados, as alterações e as hipóteses assumidas antes de calcular.';
      render();
      return { ok: false, error: lc142.erro };
    }
    /* Pré-condições declaradas ANTES de chamar o servidor, com mensagem que diz
     * o que fazer. Antes, um DIB vazio chegava ao motor, virava
     * "Data ISO inválida." (HTTP 400) e o usuário não sabia qual campo corrigir. */
    const faltando = [];
    if (!String(lc142.dib || '').trim()) faltando.push('DIB (data de início do benefício)');
    if (!String(lc142.dataBase || '').trim()) faltando.push('data-base da correção');
    if (!lc142.snapshot?.cru) faltando.push('snapshot dos índices oficiais');
    if (!String(lc142.reviewEvidence || '').trim()) faltando.push('referência documental conferida');
    if (!String(lc142.disabilityEvidence || '').trim()) faltando.push('comprovação do grau constante');
    if (faltando.length > 0) {
      lc142.erro = `Antes de calcular, informe: ${faltando.join('; ')}.`;
      render();
      return { ok: false, error: lc142.erro };
    }
    if (lc142.blockers.length > 0) {
      lc142.erro = 'Existem bloqueios declarados; corrija o campo indicado antes de calcular.';
      render();
      return { ok: false, error: lc142.erro };
    }
    lc142.calculando = true;
    lc142.erro = '';
    render();
    try {
      const response = await secureFetch('/api/calc/previdenciario/lc142/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ calculation: buildLc142Calculation(), politica: buildLc142Politica() })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok === false) {
        // Erro de domínio (400) ou falha do servidor: estado de erro honesto,
        // sem envelope e sem resultado parcial apresentado como válido.
        throw new Error(payload?.error || payload?.message || `O servidor recusou o cálculo (HTTP ${response.status}).`);
      }
      const envelope = payload.resultado || payload.envelope || null;
      if (!envelope || typeof envelope !== 'object' || !('status' in envelope)) {
        throw new Error('A resposta do cálculo não trouxe o envelope esperado. Nada foi apresentado como resultado.');
      }
      lc142.resultado = envelope;
      // Guarda o cenário EXATO que produziu este envelope. O endpoint de
      // relatório recalcula no servidor e não aceita `resultado` do browser:
      // editar a UI depois de calcular não pode alterar o que foi calculado.
      lc142.cenarioCalculado = {
        calculation: buildLc142Calculation(),
        politica: buildLc142Politica(),
        calculadoEm: new Date().toISOString(),
        resumo: {
          grau: lc142.grau,
          dib: lc142.dib,
          dataBase: lc142.dataBase,
          sexo: lc142.sexo,
          competencias: lc142.competencias.length,
          vinculos: lc142.vinculos.length
        }
      };
      lc142.relatorio = { ...lc142.relatorio, preview: null, erro: '' };
      lc142.blockers = Array.isArray(envelope.blockers) ? envelope.blockers : [];
      const native = envelope?.data?.native_result || null;
      if (native) {
        const correcao = native.correcao || {};
        if (Array.isArray(correcao.parcelas)) {
          lc142.parcelas = correcao.parcelas.map((parcela, indice) => ({ ...parcela, _indice: indice }));
          lc142.resumoParcelas = {
            competencias: correcao.pbc ?? correcao.parcelas.length,
            consideradas: correcao.consideradas ?? null,
            descartadas: correcao.descartadas ?? null,
            soma: correcao.soma_considerada ?? null
          };
        }
        const pcd = native.pcd || {};
        lc142.blockers = lc142.blockers.length > 0 ? lc142.blockers : (pcd.tempo_atingido_no_cenario === false
          ? [{ code: 'lc142_requisitos', field: 'tempo', message: 'Tempo exigido ou carência não atingidos: a RMI não é apurada neste cenário.' }]
          : []);
      } else {
        // status blocked: o envelope não carrega dado financeiro (§8).
        lc142.parcelas = [];
      }
      lc142.etapa = 'resultado';
    } catch (err) {
      lc142.resultado = null;
      lc142.erro = err?.message || 'Falha ao calcular a simulação.';
    }
    lc142.calculando = false;
    render();
    return { ok: !lc142.erro, error: lc142.erro };
  }

  // --- Relatórios ----------------------------------------------------------
  function lc142MontarPreviewRelatorio() {
    const envelope = lc142.resultado;
    const native = envelope?.data?.native_result || null;
    const resumo = native?.resumo || {};
    const rmi = resumo.rmi === null || resumo.rmi === undefined ? 'não apurada' : String(resumo.rmi);
    const cenario = lc142.cenarioCalculado?.resumo || {};
    const linhas = [
      `Família: ${lc142.relatorio.tipo}`,
      `Identificação: ${lc142.relatorio.identificacao === true ? 'incluída' : 'desligada'}`,
      `Status: ${envelope?.status || 'sem resultado'}`,
      `RMI: ${rmi}`,
      `Média dos salários: ${resumo.salario_beneficio ?? '—'}`,
      `Competências: ${resumo.competencias ?? '—'}`,
      `Carência (meses): ${resumo.carencia_meses ?? '—'}`,
      `Cenário: grau ${cenario.grau ?? '—'} · DIB ${cenario.dib || '—'} · data-base ${cenario.dataBase || '—'}`,
      `Direito verificado: não`,
      `Avisos: ${(Array.isArray(native?.avisos) ? native.avisos.length : 0)}`
    ];
    return {
      resumo: linhas.join('\n'),
      paginas: null,
      bytes: null,
      formato: 'PDF (A4)',
      identificacao: lc142.relatorio.identificacao === true,
      tipo: lc142.relatorio.tipo,
      // Preview é só conferência do conteúdo; o PDF real vem do servidor.
      calculadoEm: lc142.cenarioCalculado?.calculadoEm || null
    };
  }

  function lc142PreviewRelatorio() {
    if (!lc142.resultado || !lc142.cenarioCalculado) {
      lc142.relatorio.erro = 'Calcule a simulação antes de gerar o relatório.';
      lc142.erro = lc142.relatorio.erro;
      render();
      return { ok: false, error: lc142.erro };
    }
    lc142.relatorio = { ...lc142.relatorio, preview: lc142MontarPreviewRelatorio(), erro: '' };
    lc142.erro = '';
    render();
    return { ok: true };
  }

  async function lc142BaixarRelatorio() {
    if (!lc142.resultado || !lc142.cenarioCalculado) {
      lc142.erro = 'Calcule a simulação antes de baixar o relatório.';
      render();
      return { ok: false, error: lc142.erro };
    }
    lc142.relatorio = { ...lc142.relatorio, gerando: true, erro: '' };
    lc142.erro = '';
    render();
    try {
      // O servidor RECALCULA a partir do cenário. Enviamos o calculation e a
      // politica exatos que geraram o resultado — nunca o envelope do browser.
      const response = await secureFetch('/api/calc/previdenciario/lc142/relatorio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/pdf, application/json' },
        body: JSON.stringify({
          familia: lc142.relatorio.tipo,
          calculation: lc142.cenarioCalculado.calculation,
          politica: lc142.cenarioCalculado.politica,
          metadados: {
            geradoEm: getIsoDate(),
            geradoPor: getCurrentUserName?.() || null,
            cenarioCalculadoEm: lc142.cenarioCalculado.calculadoEm
          },
          identificacao: lc142.relatorio.identificacao === true
        })
      });
      if (!response.ok) {
        let mensagem = `O servidor não gerou o PDF (HTTP ${response.status}).`;
        try {
          const payload = await response.json();
          if (payload?.error || payload?.message) mensagem = payload.error || payload.message;
        } catch { /* resposta sem JSON: mantém a mensagem de status */ }
        throw new Error(mensagem);
      }
      const contentType = String(response.headers?.get?.('content-type') || '');
      let bytes = null;
      if (contentType.includes('application/json')) {
        // Harness/servidor pode devolver o PDF em base64 em vez de bytes crus.
        const payload = await response.json().catch(() => ({}));
        if (payload?.ok === false) throw new Error(payload?.error || payload?.message || 'O servidor não gerou o relatório.');
        const base64 = payload?.relatorio?.bytesBase64 || payload?.bytesBase64 || '';
        if (!base64) throw new Error('O servidor respondeu sem os bytes do PDF. Nenhum arquivo foi baixado.');
        const binario = Uint8Array.from(atob(String(base64).replace(/^data:.*?;base64,/, '')), caractere => caractere.charCodeAt(0));
        bytes = new Blob([binario], { type: 'application/pdf' });
      } else {
        bytes = await response.blob();
      }
      // Bytes reais: o download só acontece depois de o PDF chegar.
      if (!bytes || bytes.size === 0) throw new Error('O servidor respondeu sem bytes de PDF. Nenhum arquivo foi baixado.');
      if (bytes.type && !bytes.type.includes('pdf')) {
        throw new Error(`O servidor devolveu ${bytes.type} em vez de PDF. Nenhum arquivo foi baixado.`);
      }
      const url = URL.createObjectURL(bytes);
      const criador = documentRef?.createElement ? documentRef : globalThis.document;
      if (!criador?.createElement) throw new Error('O navegador não permitiu iniciar o download; o PDF foi gerado mas não pôde ser salvo.');
      const link = criador.createElement('a');
      link.href = url;
      link.download = `lc142-${lc142.relatorio.tipo}-${getIsoDate()}.pdf`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
      lc142.relatorio = {
        ...lc142.relatorio,
        gerando: false,
        preview: { ...(lc142.relatorio.preview || lc142MontarPreviewRelatorio()), bytes: bytes.size, formato: 'PDF (A4)' }
      };
      showToast?.('Relatório PDF baixado.', 'success');
    } catch (err) {
      lc142.relatorio = { ...lc142.relatorio, gerando: false, erro: '' };
      lc142.erro = err?.message || 'Falha ao gerar o relatório PDF.';
    }
    render();
    return { ok: !lc142.erro, error: lc142.erro };
  }

  // --- Capacidades declaradas do motor -------------------------------------
  /* Honestidade de capacidade: o que o perfil NÃO faz é mostrado na tela de
   * premissas e na revisão, não escondido em tooltip. Falha aqui não bloqueia
   * o fluxo — apenas deixa a lista explícita como "não consultada". */
  async function lc142CarregarCapacidades() {
    lc142.capacidades = { status: 'carregando', naoSuportado: [], versao: null, erro: '' };
    render();
    try {
      const response = await secureFetch('/api/calc/previdenciario/lc142/capacidades', {
        headers: { Accept: 'application/json' }
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok === false) {
        throw new Error(payload?.error || payload?.message || `Falha ao consultar capacidades (HTTP ${response.status}).`);
      }
      const capacidades = payload.capacidades || {};
      lc142.capacidades = {
        status: 'pronto',
        naoSuportado: Array.isArray(capacidades.nao_suportado) ? capacidades.nao_suportado : [],
        versao: capacidades.versao || capacidades.version || null,
        erro: ''
      };
    } catch (err) {
      lc142.capacidades = { status: 'erro', naoSuportado: [], versao: null, erro: err?.message || 'Falha ao consultar capacidades do motor.' };
    }
    render();
    return { ok: lc142.capacidades.status === 'pronto', error: lc142.capacidades.erro };
  }

  /* Validação barata da hipótese antes de calcular: aponta campo bloqueado sem
   * persistir nada. Usada na revisão para antecipar bloqueios do servidor. */
  async function lc142ValidarHipotese() {
    lc142.validando = true;
    lc142.erro = '';
    render();
    try {
      const response = await secureFetch('/api/calc/previdenciario/lc142/validar-hipotese', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ calculation: buildLc142Calculation(), politica: buildLc142Politica() })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok === false) {
        throw new Error(payload?.error || payload?.message || `A validação da hipótese falhou (HTTP ${response.status}).`);
      }
      lc142.validacao = {
        valido: payload.valido === true,
        status: payload.status || null,
        blockers: Array.isArray(payload.blockers) ? payload.blockers : [],
        warnings: Array.isArray(payload.warnings) ? payload.warnings : []
      };
      // Bloqueios declarados pelo servidor alimentam a revisão com campo + ação.
      if (lc142.validacao.blockers.length > 0) {
        lc142.blockers = lc142.validacao.blockers;
        lc142.revisaoGrupos = lc142MontarRevisao();
      }
    } catch (err) {
      lc142.validacao = { valido: false, status: 'erro', blockers: [], warnings: [], erro: err?.message || 'Falha ao validar a hipótese.' };
      lc142.erro = lc142.validacao.erro;
    }
    lc142.validando = false;
    render();
    return { ok: lc142.validacao?.valido === true, error: lc142.erro };
  }

  // --- Interações de campo/drawer -----------------------------------------
  function lc142SyncField(event) {
    const field = event.target?.dataset?.lc142Field;
    if (!field) return;
    const isCheck = event.target.type === 'checkbox';
    const valor = isCheck ? event.target.checked : event.target.value;
    if (field === 'premissasConfirmadas') {
      lc142DefinirPremissas(valor);
      return;
    }
    if (field === 'revisaoConfirmada') {
      lc142.revisaoConfirmada = valor === true;
      render();
      return;
    }
    if (field === 'relatorioTipo') {
      lc142.relatorio = { ...lc142.relatorio, tipo: valor, preview: null };
      lc142.erro = '';
      render();
      return;
    }
    if (field === 'relatorioIdentificacao') {
      lc142.relatorio = { ...lc142.relatorio, identificacao: valor === true, preview: null };
      render();
      return;
    }
    if (field === 'resposta') {
      const pergunta = event.target.dataset.pergunta;
      lc142Responder(pergunta, valor);
      return;
    }
    if (field === 'grau' || field === 'sexo' || field === 'nascimento' || field === 'dib' || field === 'dataBase') {
      lc142[field] = valor;
      lc142.respostas = { ...lc142.respostas, [field]: valor };
      render();
      return;
    }
    /* Textos de fundamentação: NÃO re-renderizar a cada tecla. Re-renderizar
     * recria o `<textarea>` no meio da digitação e o navegador perde a seleção
     * (além do erro "node to be removed is no longer a child"). O valor já está
     * no estado; a próxima renderização (troca de etapa, confirmação, cálculo)
     * o exibe. */
    if (field === 'reviewEvidence' || field === 'disabilityEvidence') {
      lc142[field] = valor;
      lc142.erro = '';
      return;
    }
    lc142[field] = valor;
    render();
  }

  function lc142SyncDrawerField(event) {
    const field = event.target?.dataset?.lc142DrawerField;
    if (!field || !lc142.vinculoDrawer) return;
    lc142.vinculoDrawer = {
      ...lc142.vinculoDrawer,
      vinculo: { ...lc142.vinculoDrawer.vinculo, [field]: event.target.value },
      ...(field === 'motivo' ? { motivo: event.target.value } : {}),
      ...(field === 'origem' ? { origem: event.target.value } : {}),
      erro: ''
    };
    // Sem re-render a cada tecla: preserva foco e cursor no campo do drawer.
  }

  /* Overlay: o drawer é um <dialog> nativo, então o top layer, o foco contido e
   * o Escape vêm do próprio elemento. Aqui só abrimos/fechamos o modal e
   * marcamos o resto da superfície como inerte. Roda depois de cada render,
   * porque o innerHTML é reconstruído. */
  function lc142AplicarOverlay() {
    const drawer = documentRef?.querySelector?.('.lc142-drawer');
    const aberto = Boolean(drawer && lc142.vinculoDrawer);
    const secoes = ['.lc142-header', '.lc142-nav', '.lc142-corpo']
      .map(seletor => documentRef?.querySelector?.(seletor))
      .filter(Boolean);
    for (const secao of secoes) {
      if (aberto) secao.setAttribute('inert', '');
      else secao.removeAttribute('inert');
    }
    if (!drawer) return;
    if (aberto) {
      if (!drawer.open && typeof drawer.showModal === 'function') {
        try { drawer.showModal(); } catch { /* dialog já aberto ou sem top layer */ }
      }
      const motivo = documentRef.getElementById('lc142DrawerMotivo');
      (motivo || drawer).focus?.({ preventScroll: true });
    } else if (drawer.open && typeof drawer.close === 'function') {
      drawer.close();
    }
  }

  /* Reserva de espaço para o toast global.
   *
   * `#toastRegion` é `position: fixed` (css/portal.css, componente global do
   * produto) e nasce exatamente na faixa em que a barra de ações do LC 142
   * gruda no rodapé. Em mobile o toast ainda sobe para `bottom: 76px` por
   * causa da navegação inferior. A mitigação é LOCAL: a superfície reserva a
   * altura real do toast em `padding-bottom` e a barra fixa é deslocada para
   * cima com `bottom`. Nada é alterado em `css/portal.css`.
   *
   * A variável `--lc142-toast-offset` é medida do DOM (não é número mágico):
   * `innerHeight - topo do region` = distância real da faixa em uso até a base
   * da viewport, incluindo o offset de safe area do produto. */
  function lc142AtualizarReservaToast() {
    const raiz = documentRef?.querySelector?.('.lc142-surface');
    if (!raiz) return;
    const region = documentRef?.getElementById?.('toastRegion');
    let deslocamento = 0;
    if (region) {
      const caixa = region.getBoundingClientRect?.();
      const alturaVisivel = caixa && caixa.height > 0 ? Math.round(caixa.height) : 0;
      if (alturaVisivel > 0) {
        // Distância entre o topo do toast e a base da viewport.
        deslocamento = Math.max(0, Math.round((globalThis.innerHeight || 0) - caixa.top));
      }
    }
    raiz.style.setProperty('--lc142-toast-offset', `${deslocamento}px`);
    raiz.dataset.lc142ToastOffset = String(deslocamento);
  }

  /* Observa o toast global (sem modificá-lo) para manter a reserva correta
   * quando ele aparece, cresce ou sai. Observadores são únicos por sessão. */
  let lc142ObservadoresToast = null;
  function lc142ObservarToast() {
    if (lc142ObservadoresToast) return;
    const region = documentRef?.getElementById?.('toastRegion');
    const agendar = () => {
      // rAF evita layout thrash quando o toast entra/sai em sequência.
      if (typeof globalThis.requestAnimationFrame === 'function') {
        globalThis.requestAnimationFrame(() => lc142AtualizarReservaToast());
      } else {
        lc142AtualizarReservaToast();
      }
    };
    const observadores = [];
    if (region && typeof globalThis.MutationObserver === 'function') {
      const mutacao = new globalThis.MutationObserver(agendar);
      mutacao.observe(region, { childList: true, subtree: true });
      observadores.push(mutacao);
    }
    if (region && typeof globalThis.ResizeObserver === 'function') {
      const redimensionamento = new globalThis.ResizeObserver(agendar);
      redimensionamento.observe(region);
      observadores.push(redimensionamento);
    }
    lc142ObservadoresToast = observadores;
    agendar();
  }

  /* O <dialog> nativo resolve foco contido e Escape sozinho; o estado da
   * feature precisa acompanhar o fechamento para não ficar dessincronizado. */
  function lc142SincronizarFechamentoDrawer(event) {
    const drawer = event.target;
    if (!drawer?.matches?.('.lc142-drawer')) return;
    if (drawer.open) return;
    if (!lc142.vinculoDrawer) return;
    const gatilho = lc142.vinculoGatilho;
    lc142.vinculoDrawer = null;
    render();
    if (gatilho) documentRef?.querySelector?.(`[data-lc142-action="vinculo-abrir"][data-id="${gatilho}"]`)?.focus?.();
    lc142.vinculoGatilho = null;
  }

  /* Dispatcher das ações da superfície LC 142. Separado do handler principal
   * para não ampliar o bloco das três abas existentes (guardrail AGENTS §7). */
  function lc142Acao(action, button) {
    switch (action) {
      case 'nova-hipotese':
        lc142NovaHipotese();
        return true;
      case 'abrir-hipotese':
        lc142.aberto = true;
        lc142.hipoteseId = button.dataset.id || null;
        lc142IrPara('assistente');
        return true;
      case 'assistente-opcao':
        lc142Responder(button.dataset.pergunta, button.dataset.valor);
        return true;
      case 'assistente-continuar':
        lc142ProximoPasso();
        return true;
      case 'assistente-voltar':
        lc142VoltarPasso();
        return true;
      case 'assistente-editor':
        lc142.modoEditor = !lc142.modoEditor;
        render();
        return true;
      case 'etapa':
        lc142IrPara(button.dataset.etapa);
        return true;
      case 'cnis-enviar':
        void lc142LerCnis();
        return true;
      case 'cnis-cancelar':
        lc142CancelarLeituraCnis();
        return true;
      case 'vinculo-abrir':
        lc142AbrirVinculo(button.dataset.id);
        return true;
      case 'vinculo-fechar':
        lc142FecharVinculo();
        return true;
      case 'vinculo-salvar':
        lc142SalvarVinculo(button.dataset.id);
        return true;
      case 'contribuicao-toggle':
        lc142ToggleContribuicao(button.dataset.index);
        return true;
      case 'contribuicoes-selecionar-todas':
        lc142SelecionarTodas();
        return true;
      case 'contribuicoes-limpar':
        lc142LimparSelecao();
        return true;
      case 'contribuicoes-em-lote':
        lc142ConferirLote();
        return true;
      case 'calcular':
        void lc142Calcular();
        return true;
      case 'buscar-snapshot':
        void lc142BuscarSnapshot();
        return true;
      case 'validar-hipotese':
        void lc142ValidarHipotese();
        return true;
      case 'relatorio-preview':
        lc142PreviewRelatorio();
        return true;
      case 'relatorio-baixar':
        void lc142BaixarRelatorio();
        return true;
      case 'carregar-capacidades':
        void lc142CarregarCapacidades();
        return true;
      case 'salvar-rascunho':
        lc142SalvarRascunho();
        return true;
      case 'ir-para-campo':
        lc142IrParaCampo(button.dataset.campo || '');
        return true;
      default:
        return false;
    }
  }

  /* Bloqueio aponta campo + ação: leva o operador até a etapa que contém o
   * campo, sem afirmar que corrigiu nada. */
  function lc142IrParaCampo(campo) {
    const alvo = String(campo || '');
    const etapaAlvo = alvo.startsWith('assistente') ? 'assistente'
      : alvo.startsWith('snapshot') ? 'premissas'
        : alvo.startsWith('competencias') || alvo.startsWith('salary') ? 'contribuicoes'
          : alvo.startsWith('links') || alvo.startsWith('vinculo') ? 'vinculos'
            : 'revisao';
    lc142IrPara(etapaAlvo);
  }

  /* Rascunho: grava só o que o operador declarou, no Store oficial. Sem
   * resultado e sem fingir conclusão — o registro é um rascunho de hipótese. */
  function lc142SalvarRascunho() {
    if (!store) {
      lc142.erro = 'Persistência indisponível nesta sessão.';
      render();
      return { ok: false, error: lc142.erro };
    }
    try {
      const record = {
        id: lc142.hipoteseId || `lc142-${Date.now().toString(36)}`,
        tipo: 'previdenciario',
        titulo: `LC 142 · ${lc142.grau} · DIB ${lc142.dib || 'não informada'}`,
        entrada: {
          grau: lc142.grau,
          sexo: lc142.sexo,
          nascimento: lc142.nascimento,
          dib: lc142.dib,
          dataBase: lc142.dataBase,
          competencias: lc142.competencias,
          vinculos: lc142.vinculos,
          premissasConfirmadas: lc142.premissasConfirmadas
        },
        resultado: lc142.resultado || null,
        etapaLc142: lc142.etapa,
        status: lc142.resultado ? 'simulacao' : 'rascunho',
        createdAt: new Date().toISOString(),
        createdBy: getCurrentUserName?.() || null,
        schemaVersion: 1
      };
      lc142.hipoteseId = record.id;
      store.upsert('calculations', record);
      lc142.hipoteses = [...lc142.hipoteses.filter(item => item.id !== record.id), {
        id: record.id,
        titulo: record.titulo,
        grau: lc142.grau,
        dib: lc142.dib || '—',
        dataBase: lc142.dataBase || '—',
        atualizadoEm: record.createdAt,
        status: record.status,
        pendencias: lc142.blockers.length,
        resumo: lc142.resultado ? 'Simulação calculada; confira os avisos antes de usar.' : 'Rascunho salvo sem cálculo.'
      }];
      lc142.erro = '';
      showToast?.('Rascunho da hipótese LC 142 salvo.', 'success');
    } catch (err) {
      lc142.erro = err?.message || 'Falha ao salvar o rascunho da hipótese.';
    }
    render();
    return { ok: !lc142.erro, error: lc142.erro };
  }

  return {
    get state() {
      return { ...estadoDoPresenter(), form, trabalhista, previdenciario };
    },
    get lc142State() {
      return lc142Exposta();
    },
    /* Uso EXCLUSIVO de teste: injeta um snapshot já atestado, porque o caminho
     * real depende da Fábrica de Cálculos (rede externa). Não é ação de UI e não
     * aparece em nenhum botão — nenhum código de produção a chama. */
    lc142DefinirSnapshotParaTeste(snapshot) {
      lc142.snapshot = snapshot ? { cru: snapshot, buscadoEm: snapshot.retrieved_at } : null;
      render();
      return lc142Exposta();
    },
    init() {
      if (initialized) return false;
      initialized = true;
      bindWorkspace();
      return true;
    },
    render,
    calculate,
    calcularComplementar,
    avancadas,
    projetarAposentadoria,
    acumularPensoes,
    avaliarQualidade,
    salvar,
    abrir,
    importarCnis,
    pedirExclusao,
    cancelarExclusao,
    confirmarExclusao,
    // Superfície LC 142
    lc142Abrir,
    lc142Fechar,
    lc142IrPara,
    lc142NovaHipotese,
    lc142Responder,
    lc142ProximoPasso,
    lc142VoltarPasso,
    lc142LerCnis,
    lc142CancelarLeituraCnis,
    lc142AbrirVinculo,
    lc142FecharVinculo,
    lc142SalvarVinculo,
    lc142ToggleContribuicao,
    lc142SelecionarTodas,
    lc142LimparSelecao,
    lc142ConferirLote,
    lc142Calcular,
    lc142ValidarHipotese,
    lc142CarregarCapacidades,
    lc142SalvarRascunho,
    lc142PreviewRelatorio,
    lc142BaixarRelatorio,
    lc142SyncField,
    switchTab(tab) {
      aba = ['trabalhista', 'previdenciario'].includes(tab) ? tab : 'civel';
      prevSub = 'hub';
      error = '';
      pendingDelete = null;
      etapa = 'formulario';
      render();
    },
    /* Navegação do hub previdenciário: um fluxo por vez, com retorno explícito. */
    abrirFluxoPrevidenciario(fluxo) {
      prevSub = ['rmi', 'tempo', 'avancadas', 'oficial'].includes(fluxo) ? fluxo : 'hub';
      error = '';
      etapa = 'formulario';
      render();
      return prevSub;
    },
    voltarAoHubPrevidenciario() {
      prevSub = 'hub';
      error = '';
      render();
      return prevSub;
    },
    reloadCatalog() {
      catalogAttempted = false;
      return loadCatalog();
    }
  };
}
