import assert from 'node:assert/strict';
import { openEprocProcessDetails, submitEprocSearchForm } from '../collector/adapters/eproc.mjs';
import { assertReadOnlyEprocTarget } from '../lib/judicial/managed-connectivity.mjs';

const eprocController = 'https://eproc1g.tjrs.jus.br/eproc/controlador.php';
const reportUrl = `${eprocController}?acao=relatorio_processo_procurador_listar&hash=synthetic_hash`;
const syntheticCnj = '0000000-00.0000.0.00.0000';

function createReportPage({ detailsAfterGoto }) {
  let currentUrl = reportUrl;
  let gotoUrl = '';
  let searchControlTouched = false;

  const page = {
    url: () => currentUrl,
    frames: () => [page],
    locator: selector => {
      if (/sbmBuscar|has-text\("Buscar"\)/.test(selector)) {
        searchControlTouched = true;
        throw new Error('O handler dinâmico de Buscar não pode ser consultado nem executado.');
      }
      return {
        evaluateAll: async () => selector === 'table' ? true : []
      };
    },
    goto: async url => {
      gotoUrl = url;
      currentUrl = url;
      return { ok: true };
    },
    waitForTimeout: async () => {},
    textContent: async selector => selector === 'body' && detailsAfterGoto
      ? 'Detalhes do Processo Partes e Representantes Eventos do Processo'
      : 'Processo não localizado'
  };

  return {
    page,
    observed: () => ({ gotoUrl, searchControlTouched })
  };
}

assert.equal(
  assertReadOnlyEprocTarget({
    operation: 'fetchPublications',
    url: `${eprocController}?acao=citacao_intimacao_pendente_listar_urgente`,
    action: 'citacao_intimacao_pendente_listar_urgente'
  }),
  true,
  'A listagem urgente de intimações é uma leitura conhecida do painel'
);

const successful = createReportPage({ detailsAfterGoto: true });
assert.equal(await openEprocProcessDetails(successful.page, syntheticCnj), true);
const successfulObservation = successful.observed();
const selectedUrl = new URL(successfulObservation.gotoUrl);
assert.equal(selectedUrl.origin, 'https://eproc1g.tjrs.jus.br');
assert.equal(selectedUrl.pathname, '/eproc/controlador.php');
assert.equal(selectedUrl.searchParams.get('acao'), 'processo_selecionar');
assert.equal(selectedUrl.searchParams.get('num_processo'), '00000000000000000000');
assert.equal(selectedUrl.searchParams.get('hash'), 'synthetic_hash');
assert.equal(successfulObservation.searchControlTouched, false, 'O JavaScript inline do botão Buscar não deve ser tocado');

const unsuccessful = createReportPage({ detailsAfterGoto: false });
await assert.rejects(
  () => openEprocProcessDetails(unsuccessful.page, syntheticCnj),
  /Não foi possível localizar ou abrir os detalhes do processo/i,
  'Uma URL permitida sem conteúdo real de detalhes não pode virar sucesso falso'
);
assert.equal(unsuccessful.observed().searchControlTouched, false);

// Test controlled form submission
let formSubmitted = false;
const mockFormBtn = {
  evaluate: async fn => fn({
    form: {
      action: `${eprocController}?acao=relatorio_processo_procurador_listar`,
      submit: () => { formSubmitted = true; }
    }
  })
};
const mockPage = {
  url: () => reportUrl,
  waitForLoadState: async () => {},
  waitForTimeout: async () => {}
};
await submitEprocSearchForm(mockPage, mockFormBtn);
assert.equal(formSubmitted, true, 'O formulário de busca deve ser submetido de forma controlada');

assert.throws(
  () => assertReadOnlyEprocTarget({
    operation: 'discoverCases',
    url: `${eprocController}?acao=peticao_protocolar`,
    action: 'search'
  }),
  /bloqueada por default-deny/i
);

assert.throws(
  () => assertReadOnlyEprocTarget({
    operation: 'discoverCases',
    url: eprocController,
    action: 'protocolarPeticao()'
  }),
  /handler dinâmico desconhecido/i
);

assert.throws(
  () => assertReadOnlyEprocTarget({
    operation: 'discoverCases',
    url: `${eprocController}?acao=acao_desconhecida`,
    action: 'search'
  }),
  /bloqueada por default-deny/i
);

assert.equal(
  assertReadOnlyEprocTarget({
    operation: 'revealAccessKey',
    url: eprocController,
    action: "buscarChaveProcesso('500123456')",
    controlId: 'imgChaveProcesso'
  }),
  true,
  'O botão de revelar chave de processo é uma leitura permitida'
);

console.log('EPROC POST-AUTH READ-ONLY CONTROLS: PASS');
