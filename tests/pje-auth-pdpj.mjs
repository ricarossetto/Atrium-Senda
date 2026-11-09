import assert from 'node:assert/strict';
import {
  authenticatePjeSession,
  detectPjeAuthState,
  probePjeOfficeHelper,
  PjeAuthError,
  PJE_CERTIFICATE_SELECTORS,
  PJE_TOTP_SELECTORS,
  PJE_MANUAL_LOGIN_SELECTORS,
  PJE_PDPJ_CREDENTIAL_SELECTORS
} from '../lib/judicial/pje/auth/pdpj-auth.mjs';
import { generateTotp } from '../lib/security.mjs';
import { getPjePortalById } from '../lib/judicial/pje/portal-registry.mjs';

console.log('\n===============================================================');
console.log('  ATRIUM — AUTENTICAÇÃO PJe (A1 + PDPJ TOTP, STATE MACHINE)   ');
console.log('===============================================================\n');

const portal = getPjePortalById('pje-tjmt-1g');
const SYNTHETIC_TOTP = 'JBSWY3DPEHPK3PXP';
const SUBMIT_SELECTORS = ['#kc-login', 'input[type="submit"]', 'button[type="submit"]'];

function buildFakePage(states, { cyclic = false } = {}) {
  let index = 0;
  const actions = [];
  const elementFor = (state, control) => ({
    isVisible: async () => true,
    getAttribute: async name => control.attrs?.[name] || null,
    innerText: async () => control.attrs?.text || control.kind,
    click: async () => {
      actions.push({ kind: control.kind, action: 'click' });
      advance();
    },
    fill: async value => {
      actions.push({ kind: control.kind, action: 'fill', value });
    },
    press: async key => {
      actions.push({ kind: control.kind, action: 'press', key });
      advance();
    }
  });
  const state = () => states[index];
  const advance = () => {
    if (cyclic) index = (index + 1) % states.length;
    else index = Math.min(index + 1, states.length - 1);
  };
  const locator = selector => {
    const control = state().controls.find(item => item.selectors.includes(selector));
    if (!control) {
      return { count: async () => 0, first: () => { throw new Error(`Sem controle para ${selector}`); } };
    }
    return { count: async () => 1, first: () => elementFor(state(), control) };
  };
  return {
    url: () => state().url,
    locator,
    waitForLoadState: async () => {},
    waitForTimeout: async () => {},
    actions,
    advance
  };
}

const certState = {
  url: 'https://pje.tjmt.jus.br/pje/Painel/painel_usuario/login.seam',
  controls: [{ kind: 'certificate', selectors: PJE_CERTIFICATE_SELECTORS }]
};
const secondCertState = {
  url: 'https://sso.cloud.pje.jus.br/auth/realms/pje/protocol/openid-connect/auth',
  controls: [{ kind: 'certificate', selectors: PJE_CERTIFICATE_SELECTORS }]
};
const totpState = {
  url: 'https://sso.cloud.pje.jus.br/auth/realms/pje/login-actions/authenticate',
  controls: [
    { kind: 'totp', selectors: PJE_TOTP_SELECTORS },
    { kind: 'submit', selectors: SUBMIT_SELECTORS }
  ]
};
const panelState = {
  url: 'https://pje.tjmt.jus.br/pje/Painel/painel_usuario/advogado.seam',
  controls: []
};

try {
  console.log('[T0] Rota do painel com formulário de login visível não é painel...');
  const panelUrlWithLogin = {
    url: panelState.url,
    controls: [{ kind: 'credentials', selectors: PJE_PDPJ_CREDENTIAL_SELECTORS.user }]
  };
  const loginAtPanelRoute = await detectPjeAuthState(buildFakePage([panelUrlWithLogin]), portal);
  assert.notEqual(loginAtPanelRoute.kind, 'panel', 'Controle de login visível impede classificar a página como painel autenticado.');
  assert.ok(['unknown', 'manual', 'credentials', 'totp', 'certificate', 'login_entry'].includes(loginAtPanelRoute.kind));
  const realPanel = await detectPjeAuthState(buildFakePage([panelState]), portal);
  assert.equal(realPanel.kind, 'panel', 'Painel sem controles de login continua sendo reconhecido.');
  console.log('  ✓ Evidência negativa de login aplicada ao detector de painel.');

  console.log('[T1] Fluxo completo: certificado, PDPJ, certificado de novo e TOTP...');
  const page = buildFakePage([certState, secondCertState, totpState, panelState]);
  const events = [];
  const result = await authenticatePjeSession({
    page,
    portal,
    credentials: { totpSecret: SYNTHETIC_TOTP },
    budget: { settleMs: 0, timeoutMs: 5_000 },
    onEvent: event => events.push(event)
  });
  assert.equal(result.ok, true);
  assert.equal(result.totals.certificateClicks, 2, 'O certificado deve ser reapresentado no segundo painel.');
  assert.equal(result.totals.totpSubmissions, 1);
  assert.equal(events.at(-1).kind, 'panel');
  const fill = page.actions.find(action => action.action === 'fill');
  assert.ok(fill && /^\d{6}$/.test(fill.value), 'Código TOTP de seis dígitos deve ser submetido.');
  assert.ok(fill.value === generateTotp(SYNTHETIC_TOTP) || /^\d{6}$/.test(fill.value));
  assert.ok(!JSON.stringify(events).includes(SYNTHETIC_TOTP), 'Segredo TOTP não pode aparecer na telemetria.');
  console.log('  ✓ Duas apresentações de certificado, um TOTP e painel detectado.');

  console.log('[T2] TOTP ausente no cofre falha com exigência humana...');
  const pageMissing = buildFakePage([certState, totpState, panelState]);
  await assert.rejects(
    authenticatePjeSession({
      page: pageMissing,
      portal,
      credentials: {},
      budget: { settleMs: 0, timeoutMs: 5_000 }
    }),
    error => error instanceof PjeAuthError && error.errorCode === 'AUTH-TOTP-REQUIRED' && error.humanRequired === true
  );
  console.log('  ✓ Sem segredo PDPJ, o fluxo para com AUTH-TOTP-REQUIRED.');

  console.log('[T3] Login manual/gov.br não é automatizado...');
  const manualState = {
    url: 'https://pje.tjmt.jus.br/pje/login.seam',
    controls: [{ kind: 'manual', selectors: ['button:has-text("gov.br")', 'a:has-text("gov.br")'] }]
  };
  await assert.rejects(
    authenticatePjeSession({
      page: buildFakePage([manualState]),
      portal,
      credentials: { totpSecret: SYNTHETIC_TOTP },
      budget: { settleMs: 0, timeoutMs: 5_000 }
    }),
    error => error?.errorCode === 'AUTH-MANUAL-REQUIRED' && error.humanRequired === true
  );
  console.log('  ✓ Portal que exigir gov.br fica pendente de humano, sem simulação.');

  console.log('[T3b] Conta PDPJ (CPF + senha + TOTP) autentica sem A1...');
  const credentialState = {
    url: 'https://sso.cloud.pje.jus.br/auth/realms/pje/protocol/openid-connect/auth',
    controls: [
      { kind: 'credential-user', selectors: PJE_PDPJ_CREDENTIAL_SELECTORS.user },
      { kind: 'credential-password', selectors: PJE_PDPJ_CREDENTIAL_SELECTORS.password },
      { kind: 'credential-submit', selectors: PJE_PDPJ_CREDENTIAL_SELECTORS.submit }
    ]
  };
  const accountPage = buildFakePage([credentialState, totpState, panelState]);
  const accountEvents = [];
  const accountResult = await authenticatePjeSession({
    page: accountPage,
    portal,
    credentials: { username: '00000000000', password: 'senha-sintetica', totpSecret: SYNTHETIC_TOTP },
    budget: { settleMs: 0, timeoutMs: 5_000 },
    onEvent: event => accountEvents.push(event)
  });
  assert.equal(accountResult.ok, true);
  assert.equal(accountResult.totals.credentialSubmissions, 1);
  assert.equal(accountResult.totals.totpSubmissions, 1);
  const accountFills = accountPage.actions.filter(action => action.action === 'fill');
  assert.ok(accountFills.some(fill => fill.kind === 'credential-user' && fill.value === '00000000000'));
  assert.ok(accountFills.some(fill => fill.kind === 'credential-password' && fill.value === 'senha-sintetica'));
  assert.ok(!JSON.stringify(accountEvents).includes('senha-sintetica'), 'Senha nunca pode aparecer na telemetria.');
  assert.ok(!JSON.stringify(accountEvents).includes('00000000000'), 'CPF nunca pode aparecer na telemetria.');
  console.log('  ✓ CPF/senha do cofre autenticam no PDPJ e seguem para o TOTP sem vazar.');

  console.log('[T3c] Conta PDPJ ausente no cofre falha com AUTH-CREDENTIALS-REQUIRED...');
  await assert.rejects(
    authenticatePjeSession({
      page: buildFakePage([credentialState, panelState]),
      portal,
      credentials: { totpSecret: SYNTHETIC_TOTP },
      budget: { settleMs: 0, timeoutMs: 5_000 }
    }),
    error => error instanceof PjeAuthError && error.errorCode === 'AUTH-CREDENTIALS-REQUIRED' && error.humanRequired === true
  );
  console.log('  ✓ Sem conta vinculada, o fluxo para em exigência humana, sem chute de credencial.');

  console.log('[T4] Estado parado sem progresso detecta loop...');
  const unknownState = {
    url: 'https://pje.tjmt.jus.br/pje/login.seam',
    controls: []
  };
  await assert.rejects(
    authenticatePjeSession({
      page: buildFakePage([unknownState]),
      portal,
      credentials: { totpSecret: SYNTHETIC_TOTP },
      budget: { settleMs: 0, timeoutMs: 5_000 }
    }),
    error => error?.errorCode === 'AUTH-LOOP'
  );
  console.log('  ✓ Loop sem progresso de URL/DOM é interrompido com AUTH-LOOP.');

  console.log('[T5] Orçamento de transições limita fluxos que nunca terminam...');
  await assert.rejects(
    authenticatePjeSession({
      page: buildFakePage([certState, secondCertState], { cyclic: true }),
      portal,
      credentials: { totpSecret: SYNTHETIC_TOTP },
      budget: { settleMs: 0, timeoutMs: 5_000, maxTransitions: 2 }
    }),
    error => error?.errorCode === 'AUTH-TIMEOUT'
  );
  console.log('  ✓ Sem limite rígido de ciclos: orçamento de tempo/transições governa o fluxo.');

  console.log('[T6] Código TOTP injetado em teste permanece fora de eventos...');
  const pageInjected = buildFakePage([certState, totpState, panelState]);
  const injectedEvents = [];
  await authenticatePjeSession({
    page: pageInjected,
    portal,
    credentials: { totpSecret: SYNTHETIC_TOTP },
    budget: { settleMs: 0, timeoutMs: 5_000 },
    deps: { generateTotpFn: () => '123456' },
    onEvent: event => injectedEvents.push(event)
  });
  const injectedFill = pageInjected.actions.find(action => action.action === 'fill');
  assert.equal(injectedFill.value, '123456');
  assert.ok(!JSON.stringify(injectedEvents).includes('123456'), 'Código TOTP não pode aparecer na telemetria.');
  console.log('  ✓ Telemetria carrega apenas estado/origem, nunca segredo ou código.');

  console.log('[T7] Portal com certificado via PJeOffice local exige o assinador...');
  const helperCertState = {
    url: 'https://sso.cloud.pje.jus.br/auth/realms/pje/protocol/openid-connect/auth',
    controls: [{ kind: 'certificate', selectors: PJE_CERTIFICATE_SELECTORS, attrs: { id: 'kc-pje-office', name: 'login-pje-office', class: 'botao-certificado' } }]
  };
  await assert.rejects(
    authenticatePjeSession({
      page: buildFakePage([helperCertState]),
      portal,
      credentials: { totpSecret: SYNTHETIC_TOTP },
      budget: { settleMs: 0, timeoutMs: 5_000 },
      deps: { probePjeOfficeHelperFn: async () => false }
    }),
    error => error?.errorCode === 'AUTH-HELPER-REQUIRED' && error.humanRequired === true
  );
  console.log('  ✓ Sem PJeOffice no runtime, falha com AUTH-HELPER-REQUIRED sem simular login.');

  console.log('[T8] Com PJeOffice disponível, o clique dele segue o fluxo até o painel...');
  const helperPage = buildFakePage([helperCertState, totpState, panelState]);
  const helperEvents = [];
  const helperResult = await authenticatePjeSession({
    page: helperPage,
    portal,
    credentials: { totpSecret: SYNTHETIC_TOTP },
    budget: { settleMs: 0, timeoutMs: 5_000 },
    deps: { probePjeOfficeHelperFn: async () => true, generateTotpFn: () => '654321' },
    onEvent: event => helperEvents.push(event)
  });
  assert.equal(helperResult.ok, true);
  assert.equal(helperResult.totals.certificateClicks, 1);
  assert.ok(helperEvents.some(event => event.kind === 'certificate_helper' && event.available === true));
  assert.ok(!JSON.stringify(helperEvents).includes('654321'));
  console.log('  ✓ Helper detectado, clicado uma vez e TOTP PDPJ completou o login.');

  console.log('[T9] Protocolo PJeOffice com challengePhrase assina e submete o formulário...');
  const gifSuccess = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
  const protocolPage = buildFakePage([
    {
      url: 'https://sso.cloud.pje.jus.br/auth/realms/pje/protocol/openid-connect/auth',
      controls: [{
        kind: 'certificate',
        selectors: PJE_CERTIFICATE_SELECTORS,
        attrs: {
          id: 'kc-pje-office',
          name: 'login-pje-office',
          class: 'botao-certificado',
          onclick: "autenticar('TOKEN-123', '0.5566');"
        }
      }]
    },
    totpState,
    panelState
  ]);
  const submittedTokens = [];
  const protocolResult = await authenticatePjeSession({
    page: protocolPage,
    portal,
    credentials: { totpSecret: SYNTHETIC_TOTP },
    budget: { settleMs: 0, timeoutMs: 5_000 },
    deps: {
      probePjeOfficeHelperFn: async () => true,
      randomUUIDFn: () => 'TEST-UUID',
      readSessionCookieFn: async () => 'AWSALB=synthetic',
      submitHelperTokenFn: async (target, helperToken) => {
        submittedTokens.push(helperToken);
        target.advance();
      },
      fetchImpl: async () => ({ status: 200, arrayBuffer: async () => gifSuccess }),
      generateTotpFn: () => '246810'
    }
  });
  assert.equal(protocolResult.ok, true);
  assert.equal(protocolResult.totals.helperTasks, 1);
  assert.deepEqual(submittedTokens, ['TEST-UUID']);
  assert.equal(protocolResult.totals.certificateClicks, 0, 'Com protocolo não deve haver clique cego no botão.');
  console.log('  ✓ Payload oficial montado, assinado e formulário submetido com o token.');

  console.log('[T10] Portal com "Seu certificado digital" (outro tema SSO) usa o mesmo protocolo...');
  const altThemePage = buildFakePage([
    {
      url: 'https://sso.cloud.pje.jus.br/auth/realms/pje/protocol/openid-connect/auth',
      controls: [{
        kind: 'certificate',
        selectors: [...PJE_CERTIFICATE_SELECTORS, 'a[onclick*="autenticar"]', '[onclick*="PJeOffice"]'],
        attrs: { onclick: "autenticar('TOKEN-ALT', '0.9988');", text: 'Seu certificado digital' }
      }]
    },
    totpState,
    {
      url: 'https://pje.trt4.jus.br/primeirograu/Painel/painel_usuario/list.seam',
      controls: []
    }
  ]);
  const altResult = await authenticatePjeSession({
    page: altThemePage,
    portal: getPjePortalById('pje-trt4-1g'),
    credentials: { totpSecret: SYNTHETIC_TOTP },
    budget: { settleMs: 0, timeoutMs: 5_000 },
    deps: {
      probePjeOfficeHelperFn: async () => true,
      randomUUIDFn: () => 'ALT-UUID',
      readSessionCookieFn: async () => '',
      submitHelperTokenFn: async (target, helperToken) => {
        submittedTokens.push(helperToken);
        target.advance();
      },
      fetchImpl: async () => ({ status: 200, arrayBuffer: async () => gifSuccess }),
      generateTotpFn: () => '222222'
    }
  });
  assert.equal(altResult.ok, true);
  assert.equal(altResult.totals.helperTasks, 1);
  assert.equal(altResult.totals.certificateClicks, 0);
  assert.deepEqual(submittedTokens, ['TEST-UUID', 'ALT-UUID']);
  console.log('  ✓ Controle sem id/classe, só com onclick autenticar(), entra no protocolo PJeOffice.');

  console.log('[T11] Rejeição do PJeOffice (imagem 2x1) falha sem tentar submeter...');
  const pngError = Buffer.alloc(30);
  pngError[0] = 0x89;
  pngError[1] = 0x50;
  pngError.writeUInt32BE(2, 16);
  pngError.writeUInt32BE(1, 20);
  await assert.rejects(
    authenticatePjeSession({
      page: buildFakePage([{
        url: 'https://sso.cloud.pje.jus.br/auth/realms/pje/protocol/openid-connect/auth',
        controls: [{
          kind: 'certificate',
          selectors: PJE_CERTIFICATE_SELECTORS,
          attrs: { id: 'kc-pje-office', name: 'login-pje-office', class: 'botao-certificado', onclick: "autenticar('TOKEN-123', '0.5566');" }
        }]
      }]),
      portal,
      credentials: { totpSecret: SYNTHETIC_TOTP },
      budget: { settleMs: 0, timeoutMs: 5_000 },
      deps: {
        probePjeOfficeHelperFn: async () => true,
        fetchImpl: async () => ({ status: 200, arrayBuffer: async () => pngError })
      }
    }),
    error => error?.errorCode === 'AUTH-HELPER-REJECTED' && error.humanRequired === true
  );
  console.log('  ✓ Assinatura rejeitada pelo assinador vira AUTH-HELPER-REJECTED, sem login simulado.');

  console.log('[T12] Portal trabalhista entra pelo "Entrar com PDPJ"...');
  const trt4Portal = getPjePortalById('pje-trt4-1g');
  const trt4PanelState = {
    url: 'https://pje.trt4.jus.br/primeirograu/Painel/painel_usuario/list.seam',
    controls: []
  };
  const trt4Page = buildFakePage([
    {
      url: 'https://pje.trt4.jus.br/primeirograu/login.seam',
      controls: [{ kind: 'entry', selectors: ['#btnSsoPdpj'], attrs: { text: 'Entrar com PDPJ' } }]
    },
    totpState,
    trt4PanelState
  ]);
  const trt4Result = await authenticatePjeSession({
    page: trt4Page,
    portal: trt4Portal,
    credentials: { totpSecret: SYNTHETIC_TOTP },
    budget: { settleMs: 0, timeoutMs: 5_000 },
    deps: { generateTotpFn: () => '135790' }
  });
  assert.equal(trt4Result.ok, true);
  assert.ok(trt4Result.steps.some(step => step.kind === 'login_entry'));
  assert.equal(trt4Page.actions[0].kind, 'entry');
  console.log('  ✓ Login page do TRT4 aciona o SSO PDPJ antes do certificado/TOTP.');

  console.log('[T13] Probe do PJeOffice tolera primeira tentativa falha e segunda OK...');
  let flakyCalls = 0;
  const flakyHelperFetch = async () => {
    flakyCalls += 1;
    if (flakyCalls === 1) throw new Error('ECONNRESET transitório sob carga');
    return { status: 200 };
  };
  const flakyAvailable = await probePjeOfficeHelper({
    fetchImpl: flakyHelperFetch,
    timeoutMs: 50,
    retryDelayMs: 5
  });
  assert.equal(flakyAvailable, true, 'Helper legítimo sob carga não pode virar falso AUTH-HELPER-REQUIRED.');
  assert.equal(flakyCalls, 2, 'Primeira falha deve ser seguida de exatamente um retry.');
  console.log('  ✓ Retry com backoff recupera helper que respondeu após a primeira falha.');

  console.log('[T14] Probe do PJeOffice retorna false após 2 tentativas consistentes...');
  let failingCalls = 0;
  const failingHelperFetch = async () => {
    failingCalls += 1;
    throw new Error('helper indisponível');
  };
  const failingAvailable = await probePjeOfficeHelper({
    fetchImpl: failingHelperFetch,
    timeoutMs: 50,
    retryDelayMs: 5
  });
  assert.equal(failingAvailable, false);
  assert.equal(failingCalls, 2, 'Probe deve esgotar as 2 tentativas antes de retornar false.');
  console.log('  ✓ Sem helper real, o probe retorna false apenas após o retry completo.');

  console.log('\n>>> AUTENTICAÇÃO PJe F0: PASS <<<\n');
} finally {
  // Nenhum recurso persistente criado neste teste.
}
