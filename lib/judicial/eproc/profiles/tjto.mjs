/**
 * ATRIUM Sovereign Judicial Connectivity — TJTO Profile
 *
 * Covers TJTO 1G & 2G (uses dedicated subdirectories: eprocV2_prod_1grau and eprocV2_prod_2grau).
 */

export const tjtoProfile = Object.freeze({
  family: 'eproc',
  court: 'TJTO',
  region: 'Tocantins',
  subPortals: ['tjto-eproc-1g', 'tjto-eproc-2g'],
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
