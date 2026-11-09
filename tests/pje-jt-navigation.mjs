import assert from 'node:assert/strict';
import { loadJtRoute, PJE_JT_ROUTES } from '../lib/judicial/pje/collectors/pje-jt.mjs';

console.log('\n================================================');
console.log('  ATRIUM - NAVEGACAO DO COLETOR PJe-JT (TRACE)  ');
console.log('================================================\n');

const PORTAL = { id: 'pje-trt4-1g', url: 'https://pje.trt4.jus.br' };
const HOME = 'https://pje.trt4.jus.br/pjekz/painel/usuario-externo?ocultarAvisos=true';
const EXP = 'https://pje.trt4.jus.br/pjekz/painel/usuario-externo/pendentes-manifestacao';

// Pagina falsa: roteiro de goto/clique/contadores, sem navegador e sem rede.
function fakePage({ startUrl, countersQueue = [], cardCount = 0, clickUrl = null, clickThrows = false, gotoFails = false, gotoError = '' }) {
  const calls = [];
  const state = { url: startUrl, counters: [...countersQueue] };
  return {
    calls,
    url: () => state.url,
    goto: async url => {
      calls.push(['goto', url]);
      if (gotoFails) return;
      if (gotoError) throw new Error(gotoError);
      state.url = String(url);
    },
    waitForLoadState: async () => {},
    waitForTimeout: async () => {},
    locator: () => ({
      first: () => ({
        count: async () => cardCount,
        click: async () => {
          calls.push(['click']);
          if (clickThrows) throw new Error('interceptado');
          if (clickUrl) state.url = clickUrl;
        }
      })
    }),
    evaluate: async () => state.counters.length ? state.counters.shift() : {}
  };
}

console.log('[T1] Sem card: vai de goto direto e o rastro registra...');
{
  const page = fakePage({ startUrl: 'https://pje.trt4.jus.br/primeirograu/Painel/painel_usuario/list.seam', countersQueue: [{}, {}], cardCount: 0 });
  const nav = await loadJtRoute(page, PORTAL, 'expedientes');
  assert.equal(nav.routeUrl, EXP);
  const steps = nav.navigation.map(item => item.step);
  assert.ok(steps.includes('apos-goto-direto'), 'trace precisa marcar o fallback, passos: ' + steps.join(','));
  assert.ok(!steps.includes('apos-clique'), 'sem clique nao pode haver passo de clique');
  console.log('  OK rota final=' + nav.routeUrl);
}

console.log('[T2] Com card: clica e nao usa o goto direto...');
{
  const page = fakePage({ startUrl: HOME, countersQueue: [{ expedientes: 2 }], cardCount: 1, clickUrl: EXP });
  const nav = await loadJtRoute(page, PORTAL, 'expedientes');
  assert.equal(nav.routeUrl, EXP);
  const steps = nav.navigation.map(item => item.step);
  assert.ok(steps.includes('apos-clique'));
  assert.ok(!steps.includes('apos-goto-direto'));
  assert.ok(!page.calls.some(([kind]) => kind === 'goto'), 'caminho do clique nao pode navegar por goto');
  console.log('  OK rota final=' + nav.routeUrl);
}

console.log('[T3] Clique engolido: cai no goto direto em vez de fingir navegacao...');
{
  const page = fakePage({ startUrl: HOME, countersQueue: [{ expedientes: 2 }], cardCount: 1, clickUrl: null });
  const nav = await loadJtRoute(page, PORTAL, 'expedientes');
  assert.equal(nav.routeUrl, EXP, 'clique engolido precisa terminar no destino via fallback');
  const steps = nav.navigation.map(item => item.step);
  assert.ok(steps.includes('clique-engolido'), 'trace precisa marcar o clique engolido, passos: ' + steps.join(','));
  assert.ok(steps.includes('apos-goto-direto'), 'trace precisa marcar o fallback');
  assert.ok(!steps.includes('apos-clique'), 'sem navegacao nao pode haver passo de clique bem-sucedido');
  console.log('  OK sintoma de producao vira fallback, com rastro.');
}

console.log('[T4] Clique que joga excecao: tambem cai no goto direto...');
{
  const page = fakePage({ startUrl: HOME, countersQueue: [{ expedientes: 3 }], cardCount: 1, clickThrows: true });
  const nav = await loadJtRoute(page, PORTAL, 'expedientes');
  assert.equal(nav.routeUrl, EXP);
  const steps = nav.navigation.map(item => item.step);
  assert.ok(steps.includes('apos-goto-direto'));
  assert.ok(!steps.includes('apos-clique'));
  console.log('  OK excecao de clique nao conta como sucesso.');
}

console.log('[T5] Goto direto que falha: o motivo fica no rastro, nao some...');
{
  const page = fakePage({ startUrl: HOME, countersQueue: [{}, {}], cardCount: 0, gotoError: 'net::ERR_ABORTED' });
  const nav = await loadJtRoute(page, PORTAL, 'expedientes');
  assert.equal(nav.routeUrl, HOME, 'goto falho mantem a home');
  const erro = nav.navigation.find(item => item.step.startsWith('goto-erro'));
  assert.ok(erro, 'trace precisa ter o passo goto-erro, passos: ' + nav.navigation.map(item => item.step).join(','));
  assert.ok(erro.step.includes('ERR_ABORTED'), 'o motivo precisa estar no passo: ' + erro.step);
  console.log('  OK falha de navegacao registrada com motivo.');
}

console.log('[T6] Rotas canonicas inalteradas...');
assert.equal(PJE_JT_ROUTES.acervo, '/pjekz/painel/usuario-externo/acervo-geral');
assert.equal(PJE_JT_ROUTES.expedientes, '/pjekz/painel/usuario-externo/pendentes-manifestacao');

console.log('\n>>> NAVEGACAO PJe-JT: PASS <<<\n');
