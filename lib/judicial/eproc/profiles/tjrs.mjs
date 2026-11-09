/**
 * ATRIUM Sovereign Judicial Connectivity — TJRS Profile
 *
 * Covers TJRS 1G & 2G. Features Keycloak mTLS and RFC 6238 TOTP 2FA.
 */

export const tjrsProfile = Object.freeze({
  family: 'eproc',
  court: 'TJRS',
  region: 'Rio Grande do Sul',
  subPortals: ['tjrs-eproc-1g', 'tjrs-eproc-2g'],
  defaultController: 'controlador.php',
  defaultLoginPath: 'externo_controlador.php?acao=SSO/login',
  publicSearchAction: 'processo_consulta_publica',
  panelAction: 'painel_adv_listar',
  deadlinesAction: 'citacao_intimacao_prazo_aberto_listar',
  pendingIntimationsAction: 'citacao_intimacao_pendente_listar',
  processReportAction: 'relatorio_processo_procurador_listar',
  selectProcessAction: 'processo_selecionar',
  authStrategies: ['keycloak_mtls_totp'],
  mtlsOrigin: 'https://keycloak-httpd-mtls.tjrs.jus.br',
  rateLimitMs: 1500,
  selectors: {
    certLoginBtn: '#kc-login-certificate, button[name="loginCertificate"]',
    totpInput: '#otp, input[name="otp"], input[name="totp"], input[name="code"]',
    totpSubmitBtn: '#kc-login, input[type="submit"], button[type="submit"]',
    panelLink: 'a[href*="acao=painel_adv_listar"]',
    pager: 'select#selInfraPaginacaoSuperior',
    processTable: 'table.infraTable'
  }
});
