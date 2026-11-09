/**
 * ATRIUM Sovereign Judicial Connectivity — TJSP Profile
 *
 * Covers TJSP 1G & 2G. Migration/expansion status: Partial.
 * Coexists with legacy SAJ/ESAJ system.
 */

export const tjspProfile = Object.freeze({
  family: 'eproc',
  court: 'TJSP',
  region: 'São Paulo',
  subPortals: ['tjsp-eproc-1g', 'tjsp-eproc-2g'],
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
  coexistence: 'SAJ/ESAJ',
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
