import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { collectDjen, djenInternals } from '../collector/adapters/djen.mjs';
import { collectDatajud, datajudInternals } from '../collector/adapters/datajud.mjs';
import { assertTrustedPortal, pjeInternals } from '../collector/adapters/pje.mjs';

const portalCatalog = JSON.parse(await readFile(new URL('../collector/portals.example.json', import.meta.url), 'utf8'));
const authenticatedPortals = portalCatalog.portals.filter(item => item.accountScoped && item.group !== 'Sistemas do escritório');
assert.equal(authenticatedPortals.length, 23, 'o catálogo deve reunir os 23 acessos judiciais autenticados previstos');
assert(authenticatedPortals.every(item => item.enabled === false), 'o catálogo autenticado deve iniciar zerado');
for (const id of ['eproc-tjrs-1g', 'eproc-tjrs-2g', 'pje-trt4-1g', 'pje-trt4-2g', 'pje-tjmt-1g', 'pje-tjmt-2g', 'eproc-tjsc-1g', 'eproc-tjsc-2g', 'eproc-tjsp-1g', 'eproc-tjsp-2g', 'esaj-tjsp', 'pje-trf1-1g', 'eproc-trf2', 'pje-trf3-1g', 'eproc-trf4-2g', 'pje-trf5', 'eproc-trf6-2g']) {
  assert(authenticatedPortals.some(item => item.id === id), `portal obrigatório ausente: ${id}`);
}

assert.equal(djenInternals.formatProcessNumber('12345678920268210001'), '1234567-89.2026.8.21.0001');
assert.equal(djenInternals.htmlToText('<style>.x{}</style><p class="fixed">Intime-se &amp; cumpra-se.</p><script>alert(1)</script>'), 'Intime-se & cumpra-se.');
assert.equal(djenInternals.safeOfficialLink('https://pje.tjrs.jus.br/documento'), 'https://pje.tjrs.jus.br/documento');
assert.equal(djenInternals.safeOfficialLink('https://jus.br.evil.example/documento'), '');

const target = { events: [], tasks: [], intimations: [], processes: [], contacts: [], sources: [] };
const calls = [];
await collectDjen({
  id: 'djen-cnj', name: 'DJEN / Comunica PJe', url: 'https://comunicaapi.pje.jus.br/api/v1/comunicacao',
  numeroOab: '111111', ufOab: 'RS', queryOabVariants: true, requestSpacingMs: 0
}, { monitoredTerm: { id: 'term-coletora-teste', name: 'Advogada Coletora Teste', registration: 'OAB/RS 111111' } }, target, {
  sleep: async () => {},
  fetchImpl: async url => {
    calls.push(String(url));
    const variant = new URL(url).searchParams.get('numeroOab');
    const item = {
      id: 42,
      hash: 'abcdefghijk1234567890',
      numero_processo: '12345678920268210001',
      numeroprocessocommascara: '1234567-89.2026.8.21.0001',
      siglaTribunal: 'TJRS',
      tipoComunicacao: 'Intimação',
      nomeOrgao: 'Vara de teste',
      data_disponibilizacao: '2026-08-17',
      texto: '<p>Manifestação de teste</p>',
      link: 'https://pje.tjrs.jus.br/documento',
      destinatarios: [{ nome: 'PARTE DE TESTE' }]
    };
    return new Response(JSON.stringify(variant === '111111' ? { count: 1, items: [item] } : { count: 0, items: [] }), {
      status: 200, headers: { 'Content-Type': 'application/json' }
    });
  }
});

assert.equal(calls.length, 1, 'deve consultar a OAB limpa sem sobrecarregar a API com sufixos redundantes');
assert.equal(target.intimations.length, 1, 'deve deduplicar a publicação do DJEN');
assert.equal(target.intimations[0].process, '1234567-89.2026.8.21.0001');
assert.equal(target.intimations[0].disponibilizadoEm, '2026-08-17', 'A disponibilização preserva a data da fonte (segunda-feira).');
assert.equal(target.intimations[0].publishedAt, '2026-08-18', 'A publicação é o primeiro dia útil seguinte à disponibilização.');
assert.equal(target.intimations[0].certificateUrl, 'https://comunicaapi.pje.jus.br/api/v1/comunicacao/abcdefghijk1234567890/certidao');
assert.equal(new URL(calls[0]).searchParams.get('itensPorPagina'), '100', 'O coletor DJEN deve usar o teto oficial de 100 itens por página.');
assert.equal(new URL(calls[0]).searchParams.get('pagina'), '1');

// Guarda de quota: orçamento de 2000 itens limita a paginação a 20 páginas de 100.
const budgetCalls = [];
const budgetTarget = { events: [], tasks: [], intimations: [], processes: [], contacts: [], sources: [] };
const budgetResult = await collectDjen({
  id: 'djen-cnj', name: 'DJEN / Comunica PJe', url: 'https://comunicaapi.pje.jus.br/api/v1/comunicacao',
  numeroOab: '111111', ufOab: 'RS', requestSpacingMs: 0
}, { monitoredTerm: { id: 'term-coletora-teste', name: 'Advogada Coletora Teste', registration: 'OAB/RS 111111' } }, budgetTarget, {
  sleep: async () => {},
  fetchImpl: async () => {
    budgetCalls.push(budgetCalls.length + 1);
    const items = Array.from({ length: 100 }, (_, index) => ({
      id: budgetCalls.length * 1000 + index,
      numero_processo: '12345678920268210001',
      data_disponibilizacao: '2026-08-17',
      texto: '<p>Publicação de teste</p>'
    }));
    return new Response(JSON.stringify({ count: 9999, items }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }
});
assert.equal(budgetCalls.length, 20, 'A paginação deve parar no orçamento de 2000 itens (20 páginas de 100).');
assert.equal(budgetResult.complete, false, 'Coleta limitada pelo orçamento deve ser declarada parcial.');
assert.equal(budgetResult.records, 2000, 'O orçamento limita os registros lidos por termo.');

const portal = { url: 'https://pje.tjmt.jus.br', trustedAuthOrigins: ['https://sso.cloud.pje.jus.br'] };
assert.doesNotThrow(() => assertTrustedPortal('https://pje.tjmt.jus.br/pje/Painel/painel_usuario/advogado.seam', portal));
assert.doesNotThrow(() => assertTrustedPortal('https://sso.cloud.pje.jus.br/auth/realms/pje', portal));
assert.throws(() => assertTrustedPortal('https://pje.tjmt.jus.br.evil.example/login', portal), /fora das origens permitidas/);
assert.match('Tomar ciência', pjeInternals.DANGEROUS_ACTION_RE);
assert.match('Responder', pjeInternals.DANGEROUS_ACTION_RE);

assert.equal(datajudInternals.aliasForProcess('1234567-89.2026.8.21.0001'), 'tjrs');
assert.equal(datajudInternals.aliasForProcess('1234567-89.2026.4.04.0001'), 'trf4');
assert.equal(datajudInternals.aliasForProcess('1234567-89.2026.5.04.0001'), 'trt4');
assert.equal(datajudInternals.aliasForProcess('5003333-67.2026.6.21.0001'), 'tre-rs', 'TRE deve usar a UF no alias (api_publica_tre-rs).');
assert.equal(datajudInternals.aliasForProcess('5004444-37.2026.9.21.0001'), 'tjmrs', 'Justiça Militar estadual usa tjm<uf>.');
assert.equal(datajudInternals.aliasForProcess('5002222-06.2026.5.04.0001'), 'trt4');
assert.equal(datajudInternals.aliasForProcess('5009999-00.2026.6.07.0001'), 'tre-df', 'DF usa api_publica_tre-df (endpoint vivo; a wiki lista tre-dft, que responde index_not_found).');
assert.equal(datajudInternals.aliasForProcess('5001111-00.2026.1.00.0000'), '', 'STF não tem índice público no DataJud (index_not_found verificado).');
assert.equal(datajudInternals.aliasForProcess('5001111-00.2026.2.00.0000'), '', 'CNJ não tem índice público no DataJud (index_not_found verificado).');
assert.equal(datajudInternals.aliasForProcess('1234567-89.2026.4.90.0001'), 'cjf', 'CJF/TNU tem endpoint api_publica_cjf (verificado ao vivo).');
assert.equal(datajudInternals.aliasForProcess('1234567-89.2026.7.01.0001'), '', 'Circunscrição militar não tem endpoint público no DataJud.');
assert.equal(datajudInternals.aliasForProcess('1234567-89.2026.3.03.0001'), '', 'J=3 é STJ; TR diferente de 00 não tem alias.');
assert.equal(datajudInternals.normalizeApiKey('Authorization: APIKey chave-publica=='), 'chave-publica==');
assert.equal(datajudInternals.mergeSources('DJEN / CNJ Oficial + DataJud / CNJ', 'DJEN / CNJ Oficial + DataJud / CNJ'), 'DJEN / CNJ Oficial + DataJud / CNJ');

const datajudTarget = {
  events: [], tasks: [], intimations: [], contacts: [], sources: [],
  processes: [{ number: '1234567-89.2026.8.21.0001', lastMovementAt: '2026-08-15T10:00:00.000Z', source: 'eproc' }]
};
let datajudCalls = 0;
const datajudResult = await collectDatajud({
  id: 'datajud-cnj', name: 'DataJud / CNJ', autoRefreshKey: true, requestSpacingMs: 0, movementLookbackDays: 3650
}, {}, datajudTarget, {
  apiKey: 'chave-antiga', sleep: async () => {},
  fetchImpl: async (url, options = {}) => {
    datajudCalls += 1;
    if (String(url).includes('datajud-wiki')) {
      return new Response('<code>Authorization: APIKey chave-nova-publica-1234567890==</code>', { status: 200 });
    }
    if (options.headers.Authorization === 'APIKey chave-antiga') return new Response('', { status: 401 });
    return new Response(JSON.stringify({
      _shards: { total: 1, successful: 1, failed: 0 },
      hits: { hits: [{ _source: {
        numeroProcesso: '12345678920268210001', tribunal: 'TJRS', grau: 'G1', nivelSigilo: 0,
        dataAjuizamento: '20240905130939',
        formato: { codigo: 1, nome: 'Eletrônico' },
        sistema: { codigo: 1, nome: 'PJe' },
        classe: { codigo: 7, nome: 'Procedimento de teste' },
        assuntos: [{ codigo: 195, nome: 'Assunto de teste' }],
        orgaoJulgador: { nome: 'Vara de teste', codigoMunicipioIBGE: 4309209 },
        dataHoraUltimaAtualizacao: '2026-08-17T13:00:00.000Z',
        movimentos: [{ codigo: 123, nome: 'Movimento de teste', dataHora: '2026-08-17T12:00:00.000Z', complementosTabelados: [{ codigo: 2, nome: 'tipo_de_distribuicao_redistribuicao', valor: 1 }] }]
      } }] }
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }
});
assert.equal(datajudResult.refreshedKey, true, 'deve atualizar a chave rejeitada pela página oficial');
assert.equal(datajudResult.found, 1);
assert.equal(datajudTarget.processes[0].lastMovement, 'Movimento de teste');
assert.equal(datajudTarget.processes[0].classCode, '7', 'Código TPU da classe deve ser preservado.');
assert.deepEqual(datajudTarget.processes[0].subjectCodes, ['195'], 'Códigos TPU dos assuntos devem ser preservados.');
assert.equal(datajudTarget.processes[0].filedAt, '2024-09-05', 'Data de ajuizamento normalizada.');
assert.equal(datajudTarget.processes[0].processFormat, 'Eletrônico');
assert.equal(datajudTarget.processes[0].courtSystem, 'PJe');
assert.equal(datajudTarget.processes[0].municipalityIbgeCode, '4309209');
assert.equal(datajudTarget.processes[0].movements[0].complements[0].name, 'tipo_de_distribuicao_redistribuicao');
assert.equal(datajudResult.restricted, 0);
assert.equal(datajudTarget.tasks[0].deadline, '', 'DataJud também não deve inferir prazo jurídico');
assert.equal(datajudCalls, 3, 'deve fazer consulta, atualização oficial e nova consulta');

// Guarda de sigilo: registro com nivelSigilo > 0 não entra no acervo nem cria tarefa.
const restrictedTarget = { events: [], tasks: [], intimations: [], contacts: [], sources: [], processes: [] };
const restrictedResult = await collectDatajud(
  { id: 'datajud-cnj', name: 'DataJud / CNJ', autoRefreshKey: false, requestSpacingMs: 0 },
  {}, restrictedTarget,
  {
    apiKey: 'chave-valida', sleep: async () => {}, processNumbers: ['1234567-89.2026.8.21.0001'],
    fetchImpl: async () => new Response(JSON.stringify({
      _shards: { total: 1, successful: 1, failed: 0 },
      hits: { hits: [{ _source: { numeroProcesso: '12345678920268210001', tribunal: 'TJRS', grau: 'G1', nivelSigilo: 2 } }] }
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }
);
assert.equal(restrictedResult.restricted, 1, 'Processo sigiloso deve ser contabilizado como restrito.');
assert.equal(restrictedResult.updated, 0, 'Processo sigiloso não pode atualizar o acervo.');
assert.equal(restrictedTarget.processes.length, 0, 'Processo sigiloso não entra no acervo.');
assert.equal(restrictedTarget.tasks.length, 0, 'Processo sigiloso não cria tarefa.');
assert.equal(restrictedTarget.intimations.length, 0, 'Processo sigiloso não cria intimação.');

// Motivo da falha (sem PII): o painel precisa explicar "N falha(s)" e permitir a ação certa.
const failureTarget = { events: [], tasks: [], intimations: [], contacts: [], sources: [], processes: [] };
const failureResult = await collectDatajud(
  { id: 'datajud-cnj', name: 'DataJud / CNJ', autoRefreshKey: false, requestSpacingMs: 0, maxAttempts: 1 },
  {}, failureTarget,
  {
    apiKey: 'chave-valida', sleep: async () => {},
    // Um tribunal sem índice público (alias vazio) + uma falha de rede.
    processNumbers: ['1234567-89.2026.1.00.0000', '1234567-89.2026.8.21.0001'],
    fetchImpl: async () => { throw new Error('fetch failed'); }
  }
);
assert.equal(failureResult.failed, 2, 'As duas consultas devem falhar.');
assert.equal(failureResult.failureReasons.alias, 1, 'Alias vazio conta como tribunal sem índice público.');
assert.equal(failureResult.failureReasons.network, 1, 'Erro de fetch conta como rede.');
assert.equal(failureResult.complete, false, 'Falha impede considerar o ciclo completo.');
assert.equal(datajudInternals.classifyDatajudFailure(new Error('DataJud rejeitou a chave pública (HTTP 401).')), 'forbidden');
assert.equal(datajudInternals.classifyDatajudFailure(new Error('DataJud respondeu HTTP 503.')), 'server');
assert.equal(datajudInternals.classifyDatajudFailure(new Error('fetch failed')), 'network');
assert.equal(datajudInternals.classifyDatajudFailure(new Error('algo inesperado')), 'other');

console.log('Testes dos coletores DJEN/DataJud/PJe passaram: origens restritas, rotação de chave, HTML neutralizado e ciência não automatizada.');
