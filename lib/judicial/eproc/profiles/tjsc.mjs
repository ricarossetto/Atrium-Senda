/**
 * ATRIUM Sovereign Judicial Connectivity — TJSC Profile
 *
 * Covers TJSC 1G & 2G.
 */

export const tjscProfile = Object.freeze({
  family: 'eproc',
  court: 'TJSC',
  region: 'Santa Catarina',
  subPortals: ['tjsc-eproc-1g', 'tjsc-eproc-2g'],
  defaultController: 'controlador.php',
  defaultLoginPath: 'controlador.php?acao=login',
  publicSearchAction: 'processo_consulta_publica',
  panelAction: 'painel_adv_listar',
  deadlinesAction: 'citacao_intimacao_prazo_aberto_listar',
  pendingIntimationsAction: 'citacao_intimacao_pendente_listar',
  processReportAction: 'relatorio_processo_procurador_listar',
  selectProcessAction: 'processo_selecionar',
  authStrategies: ['password_or_certificate'],
  rateLimitMs: 1500,
  selectors: {
    loginForm: '#frm-login, #form-login',
    usernameInput: '#txtUsuario, input[name="txtUsuario"]',
    passwordInput: '#pwdSenha, input[name="pwdSenha"]',
    certButton: '#btnCertificado, a:has-text("Certificado Digital")',
    panelLink: 'a[href*="acao=painel_adv_listar"]',
    pager: 'select#selInfraPaginacaoSuperior',
    processTable: 'table.infraTable'
  }
});
