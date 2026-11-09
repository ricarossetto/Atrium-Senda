/**
 * ATRIUM Sovereign Judicial Connectivity — TRF4 Family Profile
 *
 * Covers TRF4 (2G), JFRS (1G), JFSC (1G), and JFPR (1G).
 */

export const trf4Profile = Object.freeze({
  family: 'eproc',
  court: 'TRF4',
  region: '4ª Região',
  subPortals: ['trf4-eproc-2g', 'jfrs-eproc-1g', 'jfsc-eproc-1g', 'jfpr-eproc-1g'],
  defaultController: 'controlador.php',
  defaultLoginPath: 'externo_controlador.php?acao=SSO/login',
  publicSearchAction: 'processo_consulta_publica',
  panelAction: 'painel_adv_listar',
  deadlinesAction: 'citacao_intimacao_prazo_aberto_listar',
  pendingIntimationsAction: 'citacao_intimacao_pendente_listar',
  processReportAction: 'relatorio_processo_procurador_listar',
  selectProcessAction: 'processo_selecionar',
  authStrategies: ['client_cert_mtls_totp', 'password_totp', 'sso_cookie'],
  rateLimitMs: 1500,
  ssoCertOrigin: 'https://eproc-sso-certificado.trf4.jus.br',
  selectors: {
    loginForm: '#frm-login, #form-login, #kc-form-login',
    usernameInput: '#txtUsuario, input[name="txtUsuario"], #username',
    passwordInput: '#pwdSenha, input[name="pwdSenha"], #password',
    certButton: '#kc-login-certificate, button[name="loginCertificate"], #btnCertificado, a:has-text("Certificado Digital")',
    otpInput: '#otp, input[name="otp"]',
    panelLink: 'a[href*="acao=painel_adv_listar"]',
    pager: 'select#selInfraPaginacaoSuperior',
    processTable: 'table.infraTable'
  }
});
