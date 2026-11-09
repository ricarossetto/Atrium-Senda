import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { renderCalculationsWorkspace } from '../js/views/ui-v2/calculations-presenter.js';
import { createCalculationsFeature } from '../js/features/calculations.js';
import { buildCivelCalculation } from '../lib/calc/civel.mjs';
import { buildTrabalhistaCalculation } from '../lib/calc/trabalhista.mjs';
import { buildPrevidenciarioCalculation } from '../lib/calc/previdenciario.mjs';
import { calcularPeriodoGraca, calcularTempoContribuicao } from '../lib/calc/tempo-contribuicao.mjs';
import { avaliarAposentadoriaPcd } from '../lib/calc/pcd.mjs';
import { calcularRetorno, fatorPrevidenciario } from '../lib/calc/retorno.mjs';

const read = name => readFile(new URL(`../${name}`, import.meta.url), 'utf8');
const [indexSource, routesSource, shellSource, portalSource, cssSource, helpersSource, presenterSource, featureSource] = await Promise.all([
  read('index.html'),
  read('js/core/routes.js'),
  read('js/views/ui-v2/shell.js'),
  read('js/portal.js'),
  read('css/views/ui-v2/calculations.css'),
  read('tests/ui_v2_helpers.mjs'),
  read('js/views/ui-v2/calculations-presenter.js'),
  read('js/features/calculations.js')
]);

assert.match(routesSource, /calculations:\s*'\/calculos'/, 'Rota /calculos ausente em routes.js.');
assert.match(shellSource, /calculations:\s*'management'/, 'Grupo de navegação dos cálculos ausente no shell.');
assert.match(indexSource, /id="view-calculations"/, 'View oficial ausente no index.html.');
assert.match(indexSource, /data-view="calculations"/, 'Item de navegação dos cálculos ausente.');
assert.match(indexSource, /id="calculationsWorkspace"/, 'Workspace dos cálculos ausente.');
assert.match(indexSource, /calculations\.css\?v=/, 'Folha de estilos dos cálculos não referenciada.');
assert.match(portalSource, /renderCalculationsV2Workspace/, 'Portal não importa o presenter dos cálculos.');
assert.match(portalSource, /createCalculationsFeature/, 'Portal não registra a feature dos cálculos.');
assert.match(portalSource, /if \(view === 'calculations'\) this\.renderCalculations\(\);/, 'Troca de view não renderiza os cálculos.');
assert.match(helpersSource, /'calculations'/, 'Views oficiais da UI V2 não incluem cálculos.');

assert.match(cssSource, /\.calc-result-header/, 'CSS sem cabeçalho da tela de resultado.');
assert.match(cssSource, /@media \(max-width: 1186px\)/, 'CSS sem quebra intermediária.');
assert.match(cssSource, /@media \(max-width: 760px\)/, 'CSS sem quebra mobile.');
assert.match(cssSource, /min-height: 44px/, 'Alvos mobile de 44px ausentes.');
assert.doesNotMatch(cssSource, /#(?:[0-9a-f]{3}){1,2}\b/i, 'CSS novo não deve usar cores hexadecimais fora dos tokens.');
assert.doesNotMatch(cssSource, /!important/, 'CSS novo não deve recorrer a !important.');
assert.doesNotMatch(presenterSource, /\bfetch\s*\(|\bsecureFetch\b|\blocalStorage\b/, 'Presenter não pode assumir autoridade funcional.');
assert.match(presenterSource, /Cálculo oficial \(PDPJ\)/, 'A ferramenta oficial deve viver dentro da aba Previdenciário.');
assert.match(presenterSource, /data-calc-action="oficial-calcular"/);
assert.match(presenterSource, /data-calc-action="oficial-modo"/);
assert.match(presenterSource, /renderCalculadoraOficial/);
assert.match(featureSource, /\/api\/calc\/fabrica\/calculo\//, 'A ferramenta oficial usa as rotas oficiais da Fábrica.');
assert.match(featureSource, /montarPayloadOficial/);
assert.match(featureSource, /dadosSegurado.*nascimento/s, 'Payload oficial usa os campos validados pela API (dadosSegurado).');
assert.match(featureSource, /baseIncidencia/, 'Atrasados usam os enums oficiais de base de incidência (honorários e multa).');
assert.match(featureSource, /consectariosPrincipal/, 'Consectários CJF 963/2025 entram no payload oficial.');
assert.match(presenterSource, /Consectários CJF 963\/2025/);
assert.match(presenterSource, /Honorários \(art\. 85 §3º\)/);

const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
assert.doesNotMatch(presenterSource, EMOJI, 'Presenter não pode conter emojis.');
assert.doesNotMatch(featureSource, EMOJI, 'Feature não pode conter emojis.');
assert.doesNotMatch(cssSource, EMOJI, 'CSS não pode conter emojis.');
assert.doesNotMatch(featureSource, /inferir prazo|abrir prazo automaticamente/i, 'Feature não pode inferir prazo.');
assert.match(presenterSource, /não abre prazo nem produz ciência/, 'Presenter deve declarar limite de ato processual.');

const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
const formatCurrency = value => `R$ ${Number(value).toFixed(2).replace('.', ',')}`;
const catalog = {
  series: [{ key: 'IPCA', rotulo: 'IPCA' }, { key: 'SELIC', rotulo: 'SELIC mensal' }],
  tabelas: { resumo: { total: 25 } }
};

const workspaceHtml = renderCalculationsWorkspace({
  catalog,
  form: { itens: [{ id: 'item-1', especie: 'debito', descricao: '<script>alert(1)</script>', data: '2026-01-15', valor: '1000,00', jurosDe: '' }] },
  escapeHtml,
  formatCurrency
});
assert.match(workspaceHtml, /Cálculos do escritório/);
assert.match(workspaceHtml, /role="tablist"/);
assert.match(workspaceHtml, /data-tab="civel"/);
assert.match(workspaceHtml, /data-tab="trabalhista"/);
assert.match(workspaceHtml, /Taxa legal \(Res\. CMN 5\.171\/2024\)/);
assert.match(workspaceHtml, /Multa art\. 523/);
assert.match(workspaceHtml, /25 tabelas/);
assert.match(workspaceHtml, /&lt;script&gt;/, 'Conteúdo do usuário precisa ser escapado.');
assert.doesNotMatch(workspaceHtml, /<script>/, 'Conteúdo do usuário não pode virar HTML.');

const trabalhistaHtml = renderCalculationsWorkspace({ aba: 'trabalhista', catalog, escapeHtml, formatCurrency });
assert.match(trabalhistaHtml, /Tipo de desligamento/);
assert.match(trabalhistaHtml, /Acordo \(art\. 484-A\)/);
assert.match(trabalhistaHtml, /Saldo do FGTS/);
assert.match(trabalhistaHtml, /INSS e IRRF não são calculados/);
assert.match(trabalhistaHtml, /data-trab-field="tributacaoAtiva"/);
assert.match(trabalhistaHtml, /Calcular INSS\/IRRF \(vigência 2026\)/);

/* A aba Previdenciário abre no hub (um cartão por fluxo); o formulário do RMI vive na
 * superfície do fluxo `rmi`. As asserções de campos passam a olhar essa superfície,
 * mantendo todas as garantias anteriores sobre o formulário existente. */
const previdenciarioHubHtml = renderCalculationsWorkspace({ aba: 'previdenciario', catalog, escapeHtml, formatCurrency });
const previdenciarioHtml = renderCalculationsWorkspace({ aba: 'previdenciario', prevSub: 'rmi', catalog, escapeHtml, formatCurrency });
assert.match(previdenciarioHubHtml, /data-tab="previdenciario"/);
assert.match(previdenciarioHubHtml, /data-prev-sub="rmi"/, 'Hub deve oferecer o fluxo de RMI.');
assert.match(previdenciarioHubHtml, /data-prev-sub="oficial"/, 'Hub deve oferecer o cálculo oficial.');
assert.match(previdenciarioHubHtml, /data-calc-action="lc142-abrir"/, 'Hub deve oferecer o assistente LC 142.');
assert.doesNotMatch(previdenciarioHubHtml, /id="calcForm"/, 'Hub não empilha o formulário do RMI.');
assert.match(previdenciarioHtml, /data-tab="previdenciario"/);
assert.match(previdenciarioHtml, /data-calc-action="prev-voltar"/, 'Fluxo precisa voltar ao hub.');
assert.match(previdenciarioHtml, /Divisor mínimo \(108\)/);
assert.match(previdenciarioHtml, /Salários de contribuição/);
assert.match(previdenciarioHtml, /Importar do CNIS \(PDF, planilha ou texto\)/);
assert.match(previdenciarioHtml, /data-prev-field="textoCnis"/);
assert.match(previdenciarioHtml, /data-calc-action="importar-cnis"/);
assert.match(previdenciarioHtml, /data-calc-action="importar-cnis-arquivo"/);
assert.match(previdenciarioHtml, /data-prev-file/);
assert.match(previdenciarioHtml, /Extração assistida/);
assert.match(previdenciarioHtml, /Data de nascimento \(regras de transição\)/);
assert.match(previdenciarioHtml, /data-prev-field="dataNascimento"/);
assert.doesNotMatch(previdenciarioHtml, /data-calc-action="salvar"/, 'Formulário não deve ter painel de resultado com salvar.');
assert.doesNotMatch(previdenciarioHtml, /Imprimir relatório/, 'Formulário não deve exibir ações de resultado.');
assert.doesNotMatch(previdenciarioHtml, /class="calc-result"/, 'Formulário ocupa a tela inteira, sem painel lateral de resultado.');

const previdenciarioComTransicoes = buildPrevidenciarioCalculation({
  sexo: 'feminino',
  dataNascimento: '1966-03-01',
  dataReferencia: '2026-09-18',
  piso: '1518.00',
  competencias: [
    { competencia: '2019-01', salario: '2000.00' },
    { competencia: '2019-02', salario: '2000.00' }
  ]
});
const transicoesHtml = renderCalculationsWorkspace({ aba: 'previdenciario', catalog, result: previdenciarioComTransicoes, resultAba: 'previdenciario', etapa: 'resultado', form: { podeSalvar: true }, escapeHtml, formatCurrency });
assert.match(transicoesHtml, /Regras de transição \(EC 103\/2019\)/);
assert.match(transicoesHtml, /Elegível|Não elegível/);
assert.match(transicoesHtml, /pedágio|Pontos|Idade progressiva|idade progressiva/i);
assert.match(transicoesHtml, /data-calc-action="voltar-form"/, 'Tela de resultado precisa voltar ao formulário.');
assert.match(transicoesHtml, /data-calc-action="imprimir"/);
assert.match(transicoesHtml, /Imprimir relatório/);
assert.match(transicoesHtml, /data-calc-action="salvar"/, 'Tela de resultado oferece salvar cálculo.');
assert.doesNotMatch(transicoesHtml, /id="calcForm"/, 'Tela de resultado não repete o formulário.');

assert.match(previdenciarioHtml, /data-prev-field="corrigirSalarios"/);
assert.match(previdenciarioHtml, /Corrigir pelo INPC \(teto da época\)/);
assert.match(previdenciarioHtml, /data-prev-field="descarte"/);
assert.match(previdenciarioHtml, /Descartar 20% menores/);

const previdenciarioCorrigido = buildPrevidenciarioCalculation({
  sexo: 'feminino',
  corrigirSalarios: true,
  referenciaCorrecao: '2025-02',
  competencias: [
    { competencia: '2004-01', salario: '3000.00' },
    { competencia: '2004-02', salario: '2000.00' },
    { competencia: '2004-03', salario: '2000.00' }
  ]
});
const correcaoHtml = renderCalculationsWorkspace({ aba: 'previdenciario', catalog, result: previdenciarioCorrigido, resultAba: 'previdenciario', etapa: 'resultado', escapeHtml, formatCurrency });
assert.match(correcaoHtml, /data-calc-correcao/, 'Tabela de correção ausente no resultado.');
assert.match(correcaoHtml, /Correção por competência/);
assert.match(correcaoHtml, /Teto da época/);
assert.match(correcaoHtml, /data-correcao-row="2"/);
assert.match(correcaoHtml, /is-descartada/);
assert.match(correcaoHtml, /R\$ 7655,80/, 'Salário corrigido formatado em moeda.');
assert.match(correcaoHtml, /2 consideradas/);
assert.match(correcaoHtml, /1 descartadas/);

/* O painel de tempo/qualidade é um fluxo próprio do hub, não um bloco empilhado. */
const tempoPainelHtml = renderCalculationsWorkspace({ aba: 'previdenciario', prevSub: 'tempo', catalog, escapeHtml, formatCurrency });
assert.match(tempoPainelHtml, /Tempo de contribuição e qualidade de segurado/);
assert.match(tempoPainelHtml, /data-tempo-vinculo-field="inicio"/);
assert.match(tempoPainelHtml, /data-tempo-field="ultimaContribuicao"/);
assert.match(tempoPainelHtml, /data-tempo-field="contribuicoesMeses"/);
assert.match(tempoPainelHtml, /data-tempo-field="desemprego"/);
assert.doesNotMatch(previdenciarioHtml, /data-tempo-field="ultimaContribuicao"/, 'Fluxo de RMI não empilha o painel de tempo.');
assert.match(tempoPainelHtml, /Adicionar vínculo/);

const tempoFixture = calcularTempoContribuicao({
  dataReferencia: '2026-01-31',
  vinculos: [
    { inicio: '2015-01-01', fim: '2024-12-31', empresa: 'Empresa Teste' },
    { inicio: '2024-06-01', fim: '2025-03-31', tipo: 'contribuinte_individual' }
  ]
});
const qualidadeFixture = calcularPeriodoGraca({
  ultimaContribuicao: '2025-06-15',
  contribuicoesMeses: 130,
  dataReferencia: '2026-01-31'
});
const tempoHtml = renderCalculationsWorkspace({
  aba: 'previdenciario',
  prevSub: 'tempo',
  catalog,
  etapa: 'resultado',
  tempo: {
    vinculos: [{ id: 'vinculo-1', inicio: '2015-01-01', fim: '2024-12-31', tipo: 'empregado', fator: '' }],
    dataReferencia: '2026-01-31',
    ultimaContribuicao: '2025-06-15',
    contribuicoesMeses: '130',
    desemprego: false,
    resultado: { tempo: tempoFixture, qualidade: qualidadeFixture }
  },
  escapeHtml,
  formatCurrency
});
assert.match(tempoHtml, /data-vinculo-resultado="1"/, 'Vínculos processados ausentes.');
assert.match(tempoHtml, /Concomitante \(parcial\)/);
assert.match(tempoHtml, /Carência \(meses\)/);
assert.match(tempoHtml, /Até EC 103 \(dias\)/);
assert.match(tempoHtml, /Qualidade de segurado/);
assert.match(tempoHtml, /2027-06-30/, 'Fim do período de graça de 24 meses.');
assert.match(tempoHtml, /Mantém/);
assert.doesNotMatch(tempoHtml, /id="calcForm"/, 'Resultado de tempo exibido na tela de resultado.');

const complementarHtml = renderCalculationsWorkspace({
  aba: 'previdenciario',
  catalog,
  result: previdenciarioComTransicoes,
  resultAba: 'previdenciario',
  etapa: 'resultado',
  complementar: {
    grau: 'grave',
    expectativa: '25',
    contribuicoesTotais: '250000',
    resultado: {
      pcd: avaliarAposentadoriaPcd({ sexo: 'feminino', grau: 'grave', tempoMeses: 260, carenciaMeses: 210, media: '6554.10' }),
      fator: fatorPrevidenciario({ sexo: 'masculino', idadeAnos: 55, tempoContribuicaoMeses: 420, expectativaSobrevidaAnos: 25 }),
      retorno: calcularRetorno({ rmi: '6554.10', mesesRecebimento: 300, idadeAnos: 57, contribuicoesTotais: '250000' })
    }
  },
  escapeHtml,
  formatCurrency
});
assert.match(complementarHtml, /Análise complementar \(PcD, fator e retorno\)/);
assert.match(complementarHtml, /data-comp-field="grau"/);
assert.match(complementarHtml, /data-comp-field="expectativa"/);
assert.match(complementarHtml, /data-calc-action="calcular-complementar"/);
assert.match(complementarHtml, /Aposentadoria da PcD \(LC 142\/2013\)/);
assert.match(complementarHtml, /Elegível/);
assert.match(complementarHtml, /Fator previdenciário/);
assert.match(complementarHtml, /0\.7198/);
assert.match(complementarHtml, /Retorno do benefício \(ROI\)/);
assert.match(complementarHtml, /Bruto com 13º/);

const semSalvos = renderCalculationsWorkspace({ catalog, escapeHtml, formatCurrency });
assert.match(semSalvos, /Cálculos salvos/);
assert.match(semSalvos, /Nenhum cálculo salvo ainda/);
assert.doesNotMatch(semSalvos, /data-calc-action="salvar"/, 'Formulário não oferece salvar sem resultado calculado.');

const comSalvos = renderCalculationsWorkspace({
  catalog,
  salvos: [
    { id: 'calc-1', tipo: 'civel', titulo: 'Dano material · até 2026-04-20', createdAt: '2026-09-18T12:30:00.000Z', valor: '1023.41', memoriaCompactada: false },
    { id: 'calc-2', tipo: 'previdenciario', titulo: 'RMI · 2024-01 a 2024-12', createdAt: '2026-09-18T13:00:00.000Z', valor: '1518.00', memoriaCompactada: true }
  ],
  pendingDelete: 'calc-2',
  escapeHtml,
  formatCurrency
});
assert.match(comSalvos, /data-calc-saved="calc-1"/);
assert.match(comSalvos, /data-calc-saved="calc-2"/);
assert.match(comSalvos, /data-calc-action="abrir" data-calc-id="calc-1"/);
assert.match(comSalvos, /Confirmar exclusão/);
assert.match(comSalvos, /data-calc-action="cancelar-exclusao"/);
assert.match(comSalvos, /memória mensal resumida/);

const calculoSintetico = buildCivelCalculation({
  atualizacaoAte: '2026-04-20',
  juros: { tipo: 'sem' },
  itens: [{ id: 'item-1', especie: 'debito', descricao: 'Débito principal', data: '2026-01-15', valor: '1000.00' }]
}, {});
const prontoParaSalvar = renderCalculationsWorkspace({
  catalog,
  result: calculoSintetico,
  resultAba: 'civel',
  etapa: 'resultado',
  form: { podeSalvar: true, salvando: false, itens: [{ id: 'item-1', especie: 'debito', data: '2026-01-15', valor: '1000.00', jurosDe: '' }] },
  escapeHtml,
  formatCurrency
});
assert.match(prontoParaSalvar, /Salvar cálculo/);
assert.doesNotMatch(prontoParaSalvar, /data-calc-action="salvar" disabled/, 'Com resultado, salvar precisa ficar disponível.');

const calculo = buildCivelCalculation({
  atualizacaoAte: '2026-04-20',
  juros: { tipo: 'sem' },
  itens: [{ id: 'item-1', especie: 'debito', descricao: 'Débito principal', data: '2026-01-15', valor: '1000.00' }]
}, {});
const resultHtml = renderCalculationsWorkspace({ catalog, result: calculo, resultAba: 'civel', etapa: 'resultado', form: { itens: [{ id: 'item-1', especie: 'debito', data: '2026-01-15', valor: '1000.00', jurosDe: '' }] }, escapeHtml, formatCurrency });
assert.match(resultHtml, /Memória de cálculo/);
assert.match(resultHtml, /Fontes/);
assert.match(resultHtml, /R\$ 1000,00/, 'Resultado deve formatar valores em moeda.');
assert.match(resultHtml, /calc-tile is-total/);

const requests = [];
let workspace = { dataset: {}, innerHTML: '', addEventListener() {} };
const documentRef = { getElementById: id => (id === 'calculationsWorkspace' ? workspace : null) };
const feature = createCalculationsFeature({
  documentRef,
  secureFetch: async (path, options = {}) => {
    requests.push({ path, options });
    if (path === '/api/calc/catalog') return { ok: true, json: async () => catalog };
    return { ok: true, json: async () => ({ ok: true, calculo }) };
  },
  escapeHtml,
  formatCurrency,
  renderWorkspace: renderCalculationsWorkspace,
  getIsoDate: () => '2026-09-18'
});
assert.equal(feature.init(), true);
assert.equal(feature.init(), false, 'Init não pode duplicar listeners.');
await feature.reloadCatalog();
assert.equal(feature.state.catalog.series.length, 2);
feature.state.form.itens[0].valor = '1.234,56';
feature.state.form.itens[0].data = '2026-01-15';
feature.state.form.multaPercentual = '0';
const calculation = await feature.calculate();
assert.equal(calculation.ok, true);
const previewRequest = requests.find(request => request.path === '/api/calc/civel/preview');
assert.ok(previewRequest, 'Preview precisa ser solicitado.');
const sent = JSON.parse(previewRequest.options.body);
assert.equal(sent.itens[0].valor, '1234.56', 'Valor em formato brasileiro deve ser normalizado.');
assert.equal(sent.multa, undefined, 'Percentual zero não pode virar encargo.');
assert.equal(sent.juros.tipo, 'sem');
assert.match(workspace.innerHTML, /Resumo/);

const invalid = await (async () => {
  feature.state.form.itens[0].valor = '';
  return feature.calculate();
})();
assert.equal(invalid.ok, false);
assert.match(invalid.error, /valor do item/i);
assert.match(workspace.innerHTML, /role="alert"/);

const trabalhistaResult = buildTrabalhistaCalculation({
  salario: '3000.00',
  admissao: '2024-03-10',
  desligamento: '2026-04-15',
  tipoDesligamento: 'sem_justa_causa',
  diasTrabalhados: 15,
  aviso: 'indenizado',
  feriasVencidas: 1,
  saldoFgts: '10000.00'
});
const trabalhistaRequests = [];
const documentRefTrab = { getElementById: id => (id === 'calculationsWorkspace' ? workspace : null) };
const featureTrab = createCalculationsFeature({
  documentRef: documentRefTrab,
  secureFetch: async (path, options = {}) => {
    trabalhistaRequests.push({ path, options });
    if (path === '/api/calc/catalog') return { ok: true, json: async () => catalog };
    return { ok: true, json: async () => ({ ok: true, calculo: trabalhistaResult }) };
  },
  escapeHtml,
  formatCurrency,
  renderWorkspace: renderCalculationsWorkspace,
  getIsoDate: () => '2026-09-18'
});
featureTrab.init();
await featureTrab.reloadCatalog();
featureTrab.switchTab('trabalhista');
Object.assign(featureTrab.state.trabalhista, {
  salario: '3.000,00',
  admissao: '2024-03-10',
  desligamento: '2026-04-15',
  tipoDesligamento: 'sem_justa_causa',
  aviso: 'indenizado',
  diasTrabalhados: '15',
  feriasVencidas: '1',
  saldoFgts: '10.000,00'
});
const trabalhistaCalculation = await featureTrab.calculate();
assert.equal(trabalhistaCalculation.ok, true);
const trabalhistaRequest = trabalhistaRequests.find(request => request.path === '/api/calc/trabalhista/preview');
assert.ok(trabalhistaRequest, 'Preview trabalhista precisa ser solicitado.');
const sentTrabalhista = JSON.parse(trabalhistaRequest.options.body);
assert.equal(sentTrabalhista.salario, '3000.00', 'Salário em formato brasileiro deve ser normalizado.');
assert.equal(sentTrabalhista.saldoFgts, '10000.00');
assert.equal(sentTrabalhista.diasTrabalhados, 15);
assert.equal(sentTrabalhista.aviso, 'indenizado');
assert.equal(sentTrabalhista.tributacao.ano, 2026, 'Tributação ativa por padrão envia a vigência 2026.');
assert.equal(sentTrabalhista.tributacao.dependentes, 0);
assert.equal(sentTrabalhista.descontos.length, 0, 'Linhas vazias de desconto não podem ser enviadas.');
assert.match(workspace.innerHTML, /Líquido a pagar/);
assert.match(workspace.innerHTML, /Verbas/);
assert.match(workspace.innerHTML, /Súmula 371|CLT, art\. 487/);

featureTrab.state.trabalhista.tributacaoAtiva = false;
await featureTrab.calculate();
const semTributacao = JSON.parse(trabalhistaRequests.filter(request => request.path === '/api/calc/trabalhista/preview').pop().options.body);
assert.equal(semTributacao.tributacao, undefined, 'Desligar o checkbox remove a tributação do payload.');

const previdenciarioResult = buildPrevidenciarioCalculation({
  sexo: 'feminino',
  competencias: [
    { competencia: '2024-01', salario: '2000.00' },
    { competencia: '2024-02', salario: '2000.00' },
    { competencia: '2024-03', salario: '2000.00' }
  ],
  piso: '1518.00'
});
const previdenciarioRequests = [];
const featurePrev = createCalculationsFeature({
  documentRef: documentRefTrab,
  secureFetch: async (path, options = {}) => {
    previdenciarioRequests.push({ path, options });
    if (path === '/api/calc/catalog') return { ok: true, json: async () => catalog };
    if (path === '/api/calc/cnis/importar') {
      const body = JSON.parse(options.body || '{}');
      if (body.ocr === true) {
        return { ok: true, json: async () => ({
          ok: true,
          modo: 'ocr',
          fonte: 'local',
          competencias: [{ competencia: '2024-01', salario: '1234.56' }],
          vinculos: [],
          resumo: { competencias: 1 },
          avisos: ['Texto reconhecido por OCR local; confira a leitura.']
        }) };
      }
      if (String(body.filename || '').includes('semtexto')) {
        return { ok: true, json: async () => ({
          ok: true,
          modo: 'ocr-necessario',
          precisaOcr: true,
          fonte: 'local',
          avisos: ['Este PDF não tem camada de texto utilizável. Rode o OCR para extrair as competências ou use o texto colado.']
        }) };
      }
      return { ok: true, json: async () => ({
        ok: true,
        modo: 'oficial',
        fonte: 'fabrica',
        dadosSegurado: { nome: 'Segurado Sintético' },
        vinculos: [{ inicio: '2020-01-01', fim: '2020-12-31', tipo: 'empregado', origem: 'CNIS oficial' }],
        competencias: [
          { competencia: '2024-01', salario: '1234.56' },
          { competencia: '2024-02', salario: '2000.00' },
          { competencia: '2024-03', salario: '1500.00' }
        ],
        resumo: { reconhecidas: 3, ignoradas: 2, duplicadas: 0 },
        avisos: ['Extração assistida: confira cada competência e remuneração no extrato original antes de calcular.']
      }) };
    }
    return { ok: true, json: async () => ({ ok: true, calculo: previdenciarioResult }) };
  },
  escapeHtml,
  formatCurrency,
  renderWorkspace: renderCalculationsWorkspace,
  getIsoDate: () => '2026-09-18'
});
featurePrev.init();
await featurePrev.reloadCatalog();
featurePrev.switchTab('previdenciario');
assert.equal(featurePrev.state.aba, 'previdenciario');
assert.equal(featurePrev.state.prevSub, 'hub', 'Aba Previdenciário abre no hub de fluxos.');
/* Abre o fluxo de RMI pelo mesmo caminho do usuário (ação do cartão do hub). */
featurePrev.abrirFluxoPrevidenciario('rmi');
assert.equal(featurePrev.state.prevSub, 'rmi');
Object.assign(featurePrev.state.previdenciario, { sexo: 'feminino', piso: '1.518,00', dataNascimento: '1966-03-01' });
featurePrev.state.previdenciario.competencias = [
  { id: 'competencia-1', competencia: '2024-01', salario: '2.000,00' },
  { id: 'competencia-2', competencia: '2024-02', salario: '2000' },
  { id: 'competencia-3', competencia: '2024-03', salario: '2000' }
];
const previdenciarioCalculation = await featurePrev.calculate();
assert.equal(previdenciarioCalculation.ok, true);
const previdenciarioRequest = previdenciarioRequests.find(request => request.path === '/api/calc/previdenciario/preview');
assert.ok(previdenciarioRequest, 'Preview previdenciário precisa ser solicitado.');
const sentPrevidenciario = JSON.parse(previdenciarioRequest.options.body);
assert.equal(sentPrevidenciario.competencias.length, 3);
assert.equal(sentPrevidenciario.competencias[0].salario, '2000.00', 'Salário em formato brasileiro deve ser normalizado.');
assert.equal(sentPrevidenciario.piso, '1518.00');
assert.equal(sentPrevidenciario.dataNascimento, '1966-03-01', 'Data de nascimento alimenta o comparador de transições.');
assert.equal(sentPrevidenciario.divisorMinimo, undefined, 'Divisor mínimo desligado não deve ser enviado.');
assert.match(workspace.innerHTML, /RMI/);
assert.match(workspace.innerHTML, /Salário de benefício e coeficiente/);

featurePrev.state.previdenciario.textoCnis = 'Empresa Exemplo — 01/2024 1.234,56\nEmpresa Exemplo — 02/2024 2.000,00\nEmpresa Exemplo — 03/2024 1.500,00';
const importacao = await featurePrev.importarCnis();
assert.equal(importacao.ok, true);
assert.equal(featurePrev.state.previdenciario.competencias.length, 3);
assert.equal(featurePrev.state.previdenciario.competencias[0].competencia, '2024-01');
assert.equal(featurePrev.state.previdenciario.competencias[0].salario, '1234.56');
assert.equal(featurePrev.state.previdenciario.importFonte, 'fabrica', 'Extração oficial deve ser declarada na UI.');
assert.equal(featurePrev.state.previdenciario.importAvisos.length, 3);
assert.match(featurePrev.state.previdenciario.importAvisos[0], /Segurado identificado/);
assert.ok(featurePrev.state.previdenciario.importAvisos.some(aviso => /vínculo\(s\) adicionados/.test(aviso)));
assert.equal(featurePrev.state.tempo.vinculos.length, 1, 'Linha vazia é substituída pelo vínculo extraído.');
assert.equal(featurePrev.state.tempo.vinculos[0].inicio, '2020-01-01');
const cnisRequest = previdenciarioRequests.find(request => request.path === '/api/calc/cnis/importar');
assert.ok(cnisRequest, 'Extração de CNIS precisa chamar a rota unificada.');
assert.match(JSON.parse(cnisRequest.options.body).texto, /1\.234,56/);
assert.match(workspace.innerHTML, /Extração assistida/);
assert.match(workspace.innerHTML, /Fábrica de Cálculos \(TRF3\)/);
assert.match(workspace.innerHTML, /data-competencia-row="2"/);

const importacaoArquivo = await featurePrev.importarCnis({ arquivo: { filename: 'cnis-sintetico.pdf', base64: Buffer.from('%PDF-1.4 sintetico').toString('base64') } });
assert.equal(importacaoArquivo.ok, true);
assert.equal(JSON.parse(previdenciarioRequests.find(request => request.path === '/api/calc/cnis/importar' && JSON.parse(request.options.body).base64).options.body).filename, 'cnis-sintetico.pdf');

const importacaoOcrNecessario = await featurePrev.importarCnis({ arquivo: { filename: 'extrato-semtexto.pdf', base64: 'eA==' } });
assert.equal(importacaoOcrNecessario.ok, true);
assert.equal(featurePrev.state.previdenciario.precisaOcr, true);
assert.match(featurePrev.state.previdenciario.importAvisos[0], /camada de texto/);
assert.match(workspace.innerHTML, /data-calc-action="importar-cnis-ocr"/);

const importacaoOcr = await featurePrev.importarCnis({ ocr: true });
assert.equal(importacaoOcr.ok, true);
assert.equal(featurePrev.state.previdenciario.precisaOcr, false);
assert.equal(featurePrev.state.previdenciario.importFonte, 'local');
assert.equal(featurePrev.state.previdenciario.competencias.length, 1);

const importacaoVazia = await (async () => {
  featurePrev.state.previdenciario.textoCnis = '';
  return featurePrev.importarCnis();
})();
assert.equal(importacaoVazia.ok, false);
assert.match(importacaoVazia.error, /Anexe o PDF\/planilha do CNIS ou cole o texto/);

const audits = [];
let flushCalls = 0;
let flushResult = true;
const fakeStore = {
  state: { calculations: [] },
  upsert(collection, record) {
    const list = this.state[collection];
    const index = list.findIndex(item => item.id === record.id);
    if (index >= 0) list[index] = { ...list[index], ...record };
    else list.unshift(record);
    return record;
  },
  async flush() { flushCalls += 1; return flushResult; },
  audit(action, detail) { audits.push({ action, detail }); }
};
const persistRequests = [];
const featureStore = createCalculationsFeature({
  documentRef: documentRefTrab,
  secureFetch: async (path, options = {}) => {
    persistRequests.push({ path, options });
    if (path === '/api/calc/catalog') return { ok: true, json: async () => catalog };
    return { ok: true, json: async () => ({ ok: true, calculo }) };
  },
  escapeHtml,
  formatCurrency,
  renderWorkspace: renderCalculationsWorkspace,
  store: fakeStore,
  getCurrentUserName: () => 'Advogada Teste',
  showToast: () => {},
  getIsoDate: () => '2026-09-18'
});
featureStore.init();
await featureStore.reloadCatalog();
featureStore.state.form.itens[0].valor = '1000';
featureStore.state.form.itens[0].data = '2026-01-15';
assert.equal((await featureStore.calculate()).ok, true);
const saved = await featureStore.salvar();
assert.equal(saved.ok, true);
assert.equal(fakeStore.state.calculations.length, 1);
const [record] = fakeStore.state.calculations;
assert.equal(record.tipo, 'civel');
assert.equal(record.createdBy, 'Advogada Teste');
assert.equal(record.entrada.itens[0].valor, '1000');
assert.equal(record.resultado.resumo.total, calculo.resumo.total);
assert.equal(record.schemaVersion, 1);
assert.equal(flushCalls, 1);
assert.deepEqual(audits[0], { action: 'Cálculo salvo', detail: `civel · ${record.titulo}` });
assert.match(workspace.innerHTML, /data-calc-saved=/);
assert.equal((await featureStore.salvar()).ok, true);
assert.equal(fakeStore.state.calculations.length, 1, 'Salvar novamente deve atualizar o mesmo registro.');

featureStore.state.form.itens[0].valor = '';
assert.equal(featureStore.abrir(record.id).ok, true);
assert.equal(featureStore.state.result.resumo.total, calculo.resumo.total);
assert.equal(featureStore.state.form.itens[0].valor, '1000');
assert.equal(featureStore.state.resultadoSalvoId, record.id);

featureStore.pedirExclusao(record.id);
assert.equal(featureStore.state.pendingDelete, record.id);
assert.match(workspace.innerHTML, /Confirmar exclusão/);
await featureStore.confirmarExclusao();
assert.equal(fakeStore.state.calculations.length, 0);
assert.equal(featureStore.state.pendingDelete, null);
assert.equal(audits.some(entry => entry.action === 'Cálculo excluído'), true);

flushResult = false;
featureStore.state.form.itens[0].valor = '1000';
featureStore.state.form.itens[0].data = '2026-01-15';
await featureStore.calculate();
const failed = await featureStore.salvar();
assert.equal(failed.ok, false);
assert.match(failed.error, /Não foi possível salvar/);
assert.equal(featureStore.state.salvando, false);
assert.equal(audits.filter(entry => entry.action === 'Cálculo salvo').length, 2, 'Falha de flush não pode auditar sucesso.');

console.log('UI de cálculos aprovada: rota, navegação, abas, presenter, salvar/abrir/excluir com Store e falhas visíveis PASS.');
