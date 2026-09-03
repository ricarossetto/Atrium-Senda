import assert from 'node:assert/strict';
import { authStateRequiresHumanAction, classifyJudicialAuthState, findAuthenticatedJudicialPage, JUDICIAL_AUTH_STATES } from '../collector/auth-state.mjs';

console.log('\nATRIUM — ESTADOS DE AUTENTICAÇÃO JUDICIAL');

const classify = value => classifyJudicialAuthState({ strategy: 'eproc', ...value });

assert.equal(classify({ url: 'https://eproc.test/login', body: 'Acesso ao sistema', hasPasswordField: true }), JUDICIAL_AUTH_STATES.LOGIN_PAGE);
assert.equal(classify({ url: 'https://eproc.test/controlador.php', body: 'Informe o código de verificação', hasOneTimeCodeField: true }), JUDICIAL_AUTH_STATES.HUMAN_2FA_REQUIRED);
assert.equal(classify({ url: 'https://eproc.test/controlador.php', body: 'Painel do Advogado · Relação de Processos · Sair do sistema' }), JUDICIAL_AUTH_STATES.AUTHENTICATED_SESSION);
assert.equal(classify({ url: 'https://eproc.test/controlador.php', body: 'Sessão expirada. Faça login novamente.' }), JUDICIAL_AUTH_STATES.SESSION_EXPIRED);
assert.equal(classify({ url: 'https://eproc.test/controlador.php', body: 'Carregando ambiente seguro…' }), JUDICIAL_AUTH_STATES.UNKNOWN_STATE);

assert.equal(authStateRequiresHumanAction(JUDICIAL_AUTH_STATES.AUTHENTICATED_SESSION), false);
assert.equal(authStateRequiresHumanAction(JUDICIAL_AUTH_STATES.HUMAN_2FA_REQUIRED), true);
assert.equal(authStateRequiresHumanAction(JUDICIAL_AUTH_STATES.UNKNOWN_STATE, { accountScoped: true }), true);
assert.equal(authStateRequiresHumanAction(JUDICIAL_AUTH_STATES.UNKNOWN_STATE, { accountScoped: false }), false);

const blankPage = { id: 'about-blank', isClosed: () => false };
const reportPage = { id: 'eproc-report', isClosed: () => false };
const authenticatedPage = await findAuthenticatedJudicialPage([blankPage, reportPage], async page => page.id === 'eproc-report'
  ? JUDICIAL_AUTH_STATES.AUTHENTICATED_SESSION
  : JUDICIAL_AUTH_STATES.UNKNOWN_STATE);
assert.equal(authenticatedPage, reportPage, 'A aba autenticada deve ser selecionada mesmo quando não é a aba original.');

console.log('✓ Login, 2FA, sessão positiva, expiração, estado desconhecido e troca de aba são tratados de modo conservador.');
