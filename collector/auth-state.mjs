export const JUDICIAL_AUTH_STATES = Object.freeze({
  LOGIN_PAGE: 'LOGIN_PAGE',
  HUMAN_2FA_REQUIRED: 'HUMAN_2FA_REQUIRED',
  AUTHENTICATED_SESSION: 'AUTHENTICATED_SESSION',
  SESSION_EXPIRED: 'SESSION_EXPIRED',
  UNKNOWN_STATE: 'UNKNOWN_STATE'
});

export function classifyJudicialAuthState({
  url = '',
  body = '',
  hasPasswordField = false,
  hasOneTimeCodeField = false,
  strategy = ''
} = {}) {
  const normalizedUrl = String(url).toLowerCase();
  const normalizedBody = String(body).replace(/\s+/g, ' ').toLowerCase();
  const authenticatedCopy = strategy === 'eproc'
    ? /painel do advogado|rela[cç][aã]o de processos|n[uú]mero (?:do )?processo|sair do sistema|logout/.test(normalizedBody)
    : /painel do advogado|minhas tarefas|meus processos|expedientes|sair do sistema|logout/.test(normalizedBody);

  if (authenticatedCopy) return JUDICIAL_AUTH_STATES.AUTHENTICATED_SESSION;
  if (/sess[aã]o (?:expirada|encerrada)|acesso expirado|autentica[cç][aã]o expirada|fa[cç]a login novamente/.test(normalizedBody)) {
    return JUDICIAL_AUTH_STATES.SESSION_EXPIRED;
  }

  const secondFactorCopy = /c[oó]digo (?:de )?(?:verifica[cç][aã]o|autentica[cç][aã]o|seguran[cç]a)|duplo fator|dois fatores|segundo fator|token de acesso|confirme sua identidade/.test(normalizedBody);
  if (hasOneTimeCodeField || secondFactorCopy) return JUDICIAL_AUTH_STATES.HUMAN_2FA_REQUIRED;

  const loginCopy = /entrar na conta|fa[cç]a seu login|leia o qr code|captcha|acesso com certificado digital/.test(normalizedBody);
  if (hasPasswordField || /login|signin|sign-in|autenticacao|authentication/.test(normalizedUrl) || loginCopy) {
    return JUDICIAL_AUTH_STATES.LOGIN_PAGE;
  }
  return JUDICIAL_AUTH_STATES.UNKNOWN_STATE;
}

export function authStateRequiresHumanAction(state, { accountScoped = true } = {}) {
  if (state === JUDICIAL_AUTH_STATES.AUTHENTICATED_SESSION) return false;
  if (state === JUDICIAL_AUTH_STATES.UNKNOWN_STATE) return Boolean(accountScoped);
  return true;
}
