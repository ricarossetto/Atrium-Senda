/**
 * Paradas do tour de primeiro acesso. Sem acesso à tela: recebe a situação e devolve o roteiro.
 * Os exemplos só aparecem no cartão do tour e nunca entram nos dados do escritório.
 */
import { HOW_TO } from './setup-how-to.js?v=3.0.2';

const EXAMPLES = Object.freeze({
  intimations: { title: 'Intimação em processo do TJRS', detail: 'Recebida hoje. Aguarda a sua conferência.' },
  tasks: { title: 'Elaborar contestação', detail: 'Etapa: em andamento. Responsável: você.' },
  agenda: { title: 'Audiência de instrução', detail: 'Quinta-feira, às 14h.' },
  processes: { title: 'Ação de cobrança', detail: 'Cliente, publicações e tarefas no mesmo lugar.' }
});

export function buildTourSteps({ canManage = false, hasOab = false, mfaEnabled = false, hasCertificate, counts = {} } = {}) {
  const example = key => (Number(counts[key]) > 0 ? null : EXAMPLES[key]);
  const steps = [
    {
      id: 'dashboard',
      view: 'dashboard',
      target: '#v2DashboardOpening',
      title: 'Boas-vindas ao ATRIUM',
      body: canManage
        ? 'Primeiro, um panorama das telas. Depois, como deixar o sistema coletando sozinho. Esta é a Área de trabalho: o resumo do que pede atenção no escritório.'
        : 'Vamos ver as telas que você vai usar. Esta é a Área de trabalho: o resumo do que pede atenção no escritório.'
    },
    {
      id: 'monitoring',
      view: 'monitoring',
      target: '#view-monitoring .source-table',
      title: 'Como o monitoramento funciona',
      body: 'O ATRIUM consulta as fontes sozinho, às 7h, 12h e 19h, mesmo com o sistema fechado.',
      listKind: 'facts',
      list: [
        'DJEN e DataJud são públicos: basta a OAB e o número do processo.',
        'eproc e PJe exigem login no tribunal: certificado A1 e segundo fator.'
      ],
      note: 'O ATRIUM só consulta. Não dá ciência, não assina e não protocola. A coleta não é ato judicial e não substitui a conferência dos prazos.'
    },
    {
      id: 'inbox',
      view: 'inbox',
      target: '.inbox-layout',
      title: 'Publicações: o que chega dos tribunais',
      body: 'O que a coleta encontra aparece aqui. Você lê, confere e decide o que vira tarefa.',
      example: example('intimations')
    },
    {
      id: 'kanban',
      view: 'kanban',
      target: '#taskListPanel',
      title: 'Tarefas: o trabalho por etapa',
      body: 'Cada tarefa tem responsável, prazo e etapa. Você acompanha em lista ou em quadro.',
      example: example('tasks')
    },
    {
      id: 'agenda',
      view: 'agenda',
      target: '.agenda-grid',
      title: 'Agenda: os compromissos do escritório',
      body: 'Audiências, reuniões e outras datas ficam aqui, à vista de quem precisa delas.',
      example: example('agenda')
    },
    {
      id: 'processes',
      view: 'processes',
      target: '#view-processes .table-card',
      title: 'Processos: a carteira do escritório',
      body: 'Cada processo reúne cliente, publicações e tarefas. Você cadastra um a um ou importa de uma vez.',
      example: example('processes')
    },
    {
      id: 'sync',
      view: 'processes',
      target: '#syncButton',
      title: 'Sincronizar: atualizar os dados',
      body: canManage
        ? 'Além dos horários automáticos, este botão busca agora, quando você não quer esperar.'
        : 'A coleta roda sozinha ao longo do dia. Este botão traz para a sua tela o que já foi coletado.'
    }
  ];
  if (canManage) {
    steps.push({
      id: 'spreadsheet',
      view: 'importer',
      target: '#importerDropzone',
      title: 'Traga sua carteira por planilha',
      body: 'Em vez de cadastrar um a um, importe os processos de uma vez.',
      list: HOW_TO.spreadsheet,
      doNowLabel: 'Importar agora',
      doNow: 'importer'
    });
  }
  if (!mfaEnabled) {
    steps.push({
      id: 'mfa',
      view: 'dashboard',
      target: '#profileButton, #v2MobileMore',
      title: 'Proteja sua conta com duas etapas',
      body: 'Além da senha, o login pede um código do celular. O sistema guarda dados de clientes: vale fazer.',
      list: HOW_TO.mfa,
      doNowLabel: 'Ativar agora',
      doNow: 'mfa'
    });
  }
  if (canManage) {
    if (hasCertificate === undefined) {
      steps.push({
        id: 'a1',
        view: 'integrations',
        target: '.judicial-integration-card',
        title: 'Você tem certificado digital A1?',
        body: 'É o arquivo .PFX ou .P12 usado para entrar nos tribunais. Com ele, o ATRIUM também consulta eproc e PJe. Sem ele, DJEN e DataJud continuam funcionando.',
        choices: [{ value: true, label: 'Tenho' }, { value: false, label: 'Não tenho' }]
      });
    }
    if (hasCertificate === true) {
      steps.push({
        id: 'certificate',
        view: 'integrations',
        target: '.judicial-integration-card',
        title: 'Envie o certificado',
        body: 'O arquivo e a senha ficam cifrados no cofre do escritório.',
        list: HOW_TO.certificate,
        doNowLabel: 'Enviar agora',
        doNow: 'judicial'
      }, {
        id: 'totp',
        view: 'integrations',
        target: '.judicial-integration-card',
        title: 'O QR Code de cada tribunal',
        body: 'É a parte mais trabalhosa, e só precisa ser feita uma vez por tribunal. É ela que deixa a coleta rodar sem você digitar códigos. Você vai precisar do Google Authenticator já com o tribunal cadastrado.',
        guide: 'totp',
        note: 'Esse QR Code dá acesso à sua conta: trate o print como uma senha e apague depois de anexar. Não mande por WhatsApp nem por e-mail.',
        doNowLabel: 'Vincular agora',
        doNow: 'totp'
      });
    }
    if (!hasOab) {
      steps.push({
        id: 'oab',
        view: 'monitoring',
        target: '#primaryTermCard',
        title: 'Último passo: informe sua OAB',
        body: 'É por ela que o ATRIUM encontra suas publicações no DJEN. Depois disso, as próximas coletas já procuram por você.',
        action: 'oab',
        actionLabel: 'Informar minha OAB',
        skipLabel: 'Fazer depois'
      });
    }
  }
  return steps;
}

/**
 * Abre sozinho só uma vez por pessoa. Conta nova abre mesmo em navegador já usado.
 * Quem já tinha a apresentação antiga marcada neste navegador não é interrompido.
 */
export function shouldStartTour({ pending = false, doneForUser = false, seenBefore = false } = {}) {
  if (doneForUser) return false;
  if (pending) return true;
  return !seenBefore;
}
