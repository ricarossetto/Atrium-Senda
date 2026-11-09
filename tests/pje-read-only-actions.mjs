import assert from 'node:assert/strict';
import {
  assertTrustedPjeTarget,
  classifyPjeRequest,
  assertSafePjeControl,
  installPjeReadOnlyGuard,
  findPjeMutationTokens
} from '../lib/judicial/pje/safety.mjs';
import { getPjePortalById } from '../lib/judicial/pje/portal-registry.mjs';

console.log('\n===============================================================');
console.log('  ATRIUM — GUARDA READ-ONLY PJe (AÇÃO CLASSIFICADA, SEM BLOQUEIO');
console.log('  GENÉRICO DE POST READ-ONLY)');
console.log('===============================================================\n');

const portal = getPjePortalById('pje-tjmt-1g');
const base = 'https://pje.tjmt.jus.br/pje/Painel/painel_usuario/advogado.seam';

console.log('[T1] Origens confiáveis...');
assert.equal(assertTrustedPjeTarget({ url: base, portal }), true);
assert.equal(assertTrustedPjeTarget({ url: 'https://sso.cloud.pje.jus.br/auth/realms/pje/protocol/openid-connect/auth', portal }), true);
assert.throws(() => assertTrustedPjeTarget({ url: 'https://pje.tjmt.jus.br.evil.example/login', portal }), /default-deny/);
assert.throws(() => assertTrustedPjeTarget({ url: 'http://pje.tjmt.jus.br/', portal }), /default-deny/);
assert.throws(() => assertTrustedPjeTarget({ url: 'https://example.test/pje', portal }), /default-deny/);
console.log('  ✓ Somente https em domínio jus.br e nas origens do portal.');

console.log('[T2] GET de consulta permitido; GET mutante bloqueado...');
const readGet = classifyPjeRequest({ method: 'GET', url: `${base}?acao=painel_adv_listar`, portal });
assert.equal(readGet.allowed, true);
const filterGet = classifyPjeRequest({ method: 'GET', url: `${base}?acao=expediente_listar&page=2`, portal });
assert.equal(filterGet.allowed, true);
const mutationGet = classifyPjeRequest({ method: 'GET', url: `${base}?acao=expediente_excluir&id=3`, portal });
assert.equal(mutationGet.allowed, false);
assert.equal(mutationGet.reason, 'blocked_mutation');
assert.ok(mutationGet.matched.includes('excluir'));
console.log('  ✓ Leitura passa; exclusão continua bloqueada mesmo em GET.');

console.log('[T3] POSTs JSF/Seam read-only permitidos...');
const jsfFilter = classifyPjeRequest({
  method: 'POST',
  url: base,
  body: 'javax.faces.partial.ajax=true&javax.faces.source=form%3AexpedienteTable&form%3AexpedienteTable%3Apage=2',
  portal
});
assert.equal(jsfFilter.allowed, true);
assert.equal(jsfFilter.reason, 'jsf_read_only');
const seamSearch = classifyPjeRequest({
  method: 'POST',
  url: `${base}?acao=expediente_pesquisar`,
  body: 'form%3AbtnPesquisar=Pesquisar&form%3Anumero=123',
  portal
});
assert.equal(seamSearch.allowed, true);
assert.ok(['jsf_read_only', 'read_only_action', 'authentication'].includes(seamSearch.reason));
const ajaxPanel = classifyPjeRequest({
  method: 'POST',
  url: `${base}?AJAX_SOURCE=form%3AacervoTable&pagina=3`,
  body: 'AJAX_SOURCE=form%3AacervoTable&pagina=3&ordered=true',
  portal
});
assert.equal(ajaxPanel.allowed, true);
console.log('  ✓ Filtros, paginação e buscas JSF/Seam seguem funcionando.');

console.log('[T4] POSTs e ações mutantes bloqueados por destino/payload...');
for (const payload of ['acao=tomarCiencia&id=1', 'javax.faces.source=form%3AbtnResponder', 'acao=peticionar', 'acao=documento_assinar', 'acao=juntada_confirmar', 'acao=processo_arquivar', 'acao=usuario_salvar', 'acao=manifestacao_ciencia', 'acao=manifestar', 'acao=recurso_interpor', 'acao=contestar']) {
  const verdict = classifyPjeRequest({ method: 'POST', url: base, body: payload, portal });
  assert.equal(verdict.allowed, false, `Payload mutante deveria ser bloqueado: ${payload}`);
  assert.equal(verdict.reason, 'blocked_mutation', `Motivo inesperado para ${payload}: ${verdict.reason}`);
}
const encodedMutation = classifyPjeRequest({ method: 'POST', url: base, body: 'acao=manifesta%C3%A7%C3%A3o_ciencia', portal });
assert.equal(encodedMutation.allowed, false, 'Payload mutante percent-encoded deveria ser bloqueado.');
assert.equal(encodedMutation.reason, 'blocked_mutation');
const unknownPost = classifyPjeRequest({ method: 'POST', url: `${base}?acao=algo_novo`, body: 'campo=valor', portal });
assert.equal(unknownPost.allowed, false);
assert.equal(unknownPost.reason, 'blocked_unknown_mutation_risk', 'POST desconhecido deve cair em default-deny.');
const putRequest = classifyPjeRequest({ method: 'PUT', url: base, portal });
assert.equal(putRequest.allowed, false);
assert.equal(putRequest.reason, 'blocked_method');
const foreignPost = classifyPjeRequest({ method: 'POST', url: 'https://evil.example/login', body: '', portal });
assert.equal(foreignPost.allowed, false);
assert.equal(foreignPost.reason, 'blocked_untrusted_origin');
const passiveScript = classifyPjeRequest({
  method: 'GET',
  url: 'https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.min.js',
  resourceType: 'script',
  portal
});
assert.equal(passiveScript.allowed, true);
assert.equal(passiveScript.reason, 'passive_subresource');
const foreignDocument = classifyPjeRequest({ method: 'GET', url: 'https://evil.example/pagina', resourceType: 'document', portal });
assert.equal(foreignDocument.allowed, false);
console.log('  ✓ Ciência, resposta, petição, assinatura, juntada, arquivamento e salvamento bloqueados.');

console.log('[T5] POST de autenticação é permitido; rótulos de controle mutantes não...');
const authPost = classifyPjeRequest({
  method: 'POST',
  url: 'https://sso.cloud.pje.jus.br/auth/realms/pje/login-actions/authenticate?session_code=x',
  body: 'username=advogado&password=segredo&credentialId=',
  portal
});
assert.equal(authPost.allowed, true);
assert.equal(authPost.reason, 'authentication');
assert.throws(() => assertSafePjeControl({ text: 'Tomar ciência', portal }), /somente leitura/);
assert.throws(() => assertSafePjeControl({ text: '', action: 'acao=responder', portal }), /somente leitura/);
assert.equal(assertSafePjeControl({ text: 'Expedientes', href: base, portal }), true);
console.log('  ✓ Autenticação permitida; controle mutante barrado antes do clique.');

console.log('[T5b] Helper local do PJeOffice é permitido; outras portas não...');
const helperRequest = classifyPjeRequest({
  method: 'GET',
  url: 'http://127.0.0.1:8800/pjeOffice/requisicao/?r=abc&u=1',
  portal
});
assert.equal(helperRequest.allowed, true);
assert.equal(helperRequest.reason, 'local_helper');
const helperWebSocket = classifyPjeRequest({ method: 'GET', url: 'ws://127.0.0.1:8800/pjeOffice/ws', portal });
assert.equal(helperWebSocket.allowed, true);
const otherLocalService = classifyPjeRequest({ method: 'GET', url: 'http://127.0.0.1:9100/outro-servico', portal });
assert.equal(otherLocalService.allowed, false);
assert.equal(otherLocalService.reason, 'blocked_untrusted_origin');
console.log('  ✓ Assinador local passa; qualquer outro destino local segue bloqueado.');

console.log('[T6] Guard de requests com URL sanitizada e sem vazamento de query...');
const captured = [];
let routeHandler = null;
const fakePage = {
  route: async (pattern, handler) => { routeHandler = handler; assert.equal(pattern, '**/*'); },
  unroute: async () => {}
};
const guard = await installPjeReadOnlyGuard(fakePage, portal, { onBlocked: record => captured.push(record) });
assert.ok(routeHandler, 'Handler de rota deve ser instalado.');

const continued = [];
const aborted = [];
const makeRoute = ({ method, url, postData }) => ({
  request: () => ({ method: () => method, url: () => url, postData: () => postData }),
  continue: async () => { continued.push(url); },
  abort: async reason => { aborted.push(reason); }
});

await routeHandler(makeRoute({ method: 'GET', url: `${base}?acao=acervo_listar`, postData: null }));
await routeHandler(makeRoute({ method: 'POST', url: base, postData: 'javax.faces.partial.ajax=true&javax.faces.source=form%3Alist' }));
assert.equal(continued.length, 2, 'Leituras devem continuar.');
assert.equal(aborted.length, 0);
await routeHandler(makeRoute({
  method: 'POST',
  url: `${base}?token=super-secreto`,
  postData: 'acao=tomarCiencia&csrf=abc123'
}));
assert.equal(aborted.length, 1, 'Ação de ciência deve ser abortada.');
assert.equal(aborted[0], 'blockedbyclient');
assert.equal(captured.length, 1);
assert.equal(captured[0].reason, 'blocked_mutation');
assert.equal(captured[0].url, 'https://pje.tjmt.jus.br/pje/Painel/painel_usuario/advogado.seam');
assert.ok(!captured[0].url.includes('?'), 'Telemetria do guard não pode registrar query string.');
assert.ok(!JSON.stringify(captured[0]).includes('super-secreto'), 'Token de query não pode vazar na telemetria.');
assert.ok(!JSON.stringify(captured[0]).includes('abc123'), 'CSRF do payload não pode vazar na telemetria.');
await guard.uninstall();
console.log('  ✓ Abortado com motivo e telemetria sanitizada (sem query/payload).');

console.log('[T7] Falsos positivos de token não derrubam navegação legítima...');
assert.deepEqual(findPjeMutationTokens('consciencia tranquila'), []);
assert.deepEqual(findPjeMutationTokens('Consequência processual'), []);
assert.ok(findPjeMutationTokens('btnTomarCiencia').includes('ciencia'));
assert.ok(findPjeMutationTokens('ciênciaBtn').includes('ciencia'));
console.log('  ✓ CamelCase e acentos detectados; palavras compostas inocentes liberadas.');

console.log('[T8] Rota confirmada do proprio portal: token no path nao indica ato...');
const trt4 = getPjePortalById('pje-trt4-1g');
const expUrl = 'https://pje.trt4.jus.br/pjekz/painel/usuario-externo/pendentes-manifestacao';
const expGet = classifyPjeRequest({ method: 'GET', url: expUrl, portal: trt4 });
assert.equal(expGet.allowed, true, 'GET na rota confirmada de Expedientes precisa passar.');
assert.equal(expGet.reason, 'read_only');
const expQuery = classifyPjeRequest({ method: 'GET', url: `${expUrl}?acao=manifestar`, portal: trt4 });
assert.equal(expQuery.allowed, false, 'Query mutante na rota confirmada continua bloqueada.');
assert.equal(expQuery.reason, 'blocked_mutation');
const expPost = classifyPjeRequest({ method: 'POST', url: expUrl, body: 'acao=manifestar', portal: trt4 });
assert.equal(expPost.allowed, false, 'POST mutante na rota confirmada continua bloqueado.');
assert.equal(expPost.reason, 'blocked_mutation');
const almostUrl = classifyPjeRequest({ method: 'GET', url: 'https://pje.trt4.jus.br/pjekz/painel/alguma-manifestacao-qualquer', portal: trt4 });
assert.equal(almostUrl.allowed, false, 'Allowlist e por pathname exato, nao por substring.');
assert.equal(almostUrl.reason, 'blocked_mutation');
const acervoGet = classifyPjeRequest({ method: 'GET', url: 'https://pje.trt4.jus.br/pjekz/painel/usuario-externo/acervo-geral', portal: trt4 });
assert.equal(acervoGet.allowed, true);
console.log('  ✓ Path confirmado libera; query, corpo e path parecido continuam bloqueados.');

console.log('\n>>> GUARDA READ-ONLY PJe F0: PASS <<<\n');
