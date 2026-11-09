/**
 * ATRIUM Sovereign Judicial Connectivity — TJBA Profile
 *
 * Covers TJBA 1G. Migration/pilot status: Pilot / In implementation.
 * Coexists with PJe and PROJUDI systems.
 */

export const tjbaProfile = Object.freeze({
  family: 'eproc',
  court: 'TJBA',
  region: 'Bahia',
  subPortals: ['tjba-eproc-1g'],
  defaultController: 'controlador.php',
  defaultLoginPath: 'controlador.php?acao=login',
  publicSearchAction: 'processo_consulta_publica',
  panelAction: 'painel_adv_listar',
  deadlinesAction: 'citacao_intimacao_prazo_aberto_listar',
  pendingIntimationsAction: 'citacao_intimacao_pendente_listar',
  processReportAction: 'relatorio_processo_procurador_listar',
  selectProcessAction: 'processo_selecionar',
  authStrategies: ['password_or_certificate'],
  isPartial: true,
  coexistence: 'PJe/PROJUDI',
  rateLimitMs: 2000,
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
