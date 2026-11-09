/**
 * ATRIUM Sovereign Judicial Connectivity — TRF2 Family Profile
 *
 * Covers TRF2 (2G), JFRJ (1G), and JFES (1G).
 */

export const trf2Profile = Object.freeze({
  family: 'eproc',
  court: 'TRF2',
  region: '2ª Região',
  subPortals: ['trf2-eproc-2g', 'jfrj-eproc-1g', 'jfes-eproc-1g'],
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
