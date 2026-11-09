/**
 * ATRIUM Sovereign Judicial Connectivity — TJRJ Profile
 *
 * Covers TJRJ 1G & 2G. Migration/pilot status: Pilot / In implementation.
 * Coexists with legacy DCP system.
 */

export const tjrjProfile = Object.freeze({
  family: 'eproc',
  court: 'TJRJ',
  region: 'Rio de Janeiro',
  subPortals: ['tjrj-eproc-1g'],
  defaultController: 'controlador.php',
  defaultLoginPath: 'externo_controlador.php?acao=SSO/login',
  publicSearchAction: 'processo_consulta_publica',
  panelAction: 'painel_adv_listar',
  deadlinesAction: 'citacao_intimacao_prazo_aberto_listar',
  pendingIntimationsAction: 'citacao_intimacao_pendente_listar',
  processReportAction: 'relatorio_processo_procurador_listar',
  selectProcessAction: 'processo_selecionar',
  authStrategies: ['password_or_certificate', 'sso_cookie'],
  isPartial: true,
  coexistence: 'DCP/Legacy',
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
