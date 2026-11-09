/**
 * Passo a passo de cada configuração. O tour e o guia do painel usam o mesmo texto, para não divergirem.
 */
export const HOW_TO = Object.freeze({
  mfa: [
    'Instale no celular um aplicativo autenticador, como o Google Authenticator.',
    'Clique na sua foto, no topo da tela, e em Ativar proteção em duas etapas.',
    'Leia o QR Code com o aplicativo e digite o código de 6 dígitos.',
    'Guarde os códigos de recuperação: eles servem se você perder o celular.'
  ],
  oab: [
    'Abra Fontes monitoradas.',
    'Clique em Editar principal.',
    'Informe o nome, o número da OAB e a UF, e salve.'
  ],
  certificate: [
    'Em Integrações, abra Conexões com tribunais, na aba Credenciais.',
    'Envie o arquivo .PFX ou .P12 e digite a senha dele.',
    'Clique em Validar e Proteger.',
    'Habilite só os portais que o escritório usa.'
  ],
  totp: [
    'No celular, abra o Google Authenticator e toque no menu.',
    'Toque em Transferir contas e depois em Exportar contas.',
    'Marque só o tribunal que vai vincular e toque em Avançar.',
    'Quando aparecer o QR Code, tire um print da tela e toque em Cancelar.',
    'No ATRIUM, em Integrações, abra Conexões com tribunais, na aba Credenciais. Na Etapa 3, escolha o tribunal, anexe o print e digite o código atual.',
    'Repita em cada tribunal: um print para cada um.'
  ],
  spreadsheet: [
    'Baixe um modelo: processos, contatos ou tarefas. Relatórios do eproc também servem.',
    'Preencha o modelo e selecione o arquivo XLS, XLSX ou CSV. Pode enviar vários juntos.',
    'Revise a prévia: nada é importado antes da sua confirmação.'
  ]
});

// Sequência animada do Google Authenticator. Nomes, documentos e códigos foram trocados nas imagens.
export const TOTP_SLIDES = Object.freeze([
  { image: 'totp-1-menu.jpg', caption: 'No Google Authenticator, toque no menu.' },
  { image: 'totp-2-transferir.jpg', caption: 'Toque em Transferir contas.' },
  { image: 'totp-3-exportar.jpg', caption: 'Toque em Exportar contas.' },
  { image: 'totp-4-selecionar.jpg', caption: 'Marque só o tribunal que vai vincular e toque em Avançar.' },
  { image: 'totp-5-print.jpg', caption: 'Tire um print desta tela e toque em Cancelar.' },
  { image: 'totp-6-atrium.jpg', caption: 'No ATRIUM, escolha o tribunal, anexe o print e digite o código atual. Repita em cada tribunal.' }
]);
