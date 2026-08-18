import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { collectDjen, djenInternals } from '../collector/adapters/djen.mjs';
import { collectDatajud, datajudInternals } from '../collector/adapters/datajud.mjs';
import { assertTrustedPortal, pjeInternals } from '../collector/adapters/pje.mjs';

const portalCatalog = JSON.parse(await readFile(new URL('../collector/portals.example.json', import.meta.url), 'utf8'));
const authenticatedPortals = portalCatalog.portals.filter(item => item.usesCertificate);
assert.equal(authenticatedPortals.length, 23, 'o catálogo deve reunir os 23 acessos judiciais autenticados previstos');
assert(authenticatedPortals.every(item => item.enabled === false), 'o catálogo autenticado deve iniciar zerado');
for (const id of ['eproc-tjrs-1g', 'eproc-tjrs-2g', 'pje-trt4-1g', 'pje-trt4-2g', 'pje-tjmt-1g', 'pje-tjmt-2g', 'eproc-tjsc-1g', 'eproc-tjsc-2g', 'eproc-tjsp-1g', 'eproc-tjsp-2g', 'esaj-tjsp', 'pje-trf1-1g', 'eproc-trf2', 'pje-trf3-1g', 'eproc-trf4-2g', 'pje-trf5', 'eproc-trf6-2g']) {
  assert(authenticatedPortals.some(item => item.id === id), `portal obrigatório ausente: ${id}`);
}

assert.equal(djenInternals.formatProcessNumber('12345678920268210001'), '1234567-89.2026.8.21.0001');
assert.equal(djenInternals.htmlToText('<style>.x{}</style><p class="fixed">Intime-se &amp; cumpra-se.</p><script>alert(1)</script>'), 'Intime-se & cumpra-se.');
assert.equal(djenInternals.safeOfficialLink('https://pje.tjrs.jus.br/documento'), 'https://pje.tjrs.jus.br/documento');
assert.equal(djenInternals.safeOfficialLink('https://jus.br.evil.example/documento'), '');

const target = { events: [], tasks: [], intimations: [], processes: [], sources: [] };
const calls = [];
await collectDjen({
  id: 'djen-cnj', name: 'DJEN / Comunica PJe', url: 'https://comunicaapi.pje.jus.br/api/v1/comunicacao',
  numeroOab: '135294', ufOab: 'RS', queryOabVariants: true, requestSpacingMs: 0
}, { monitoredTerm: { name: 'Ricardo De Luca Rossetto', registration: 'OAB/RS 135294' } }, target, {
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
    return new Response(JSON.stringify(variant === '135294' ? { count: 1, items: [item] } : { count: 0, items: [] }), {
      status: 200, headers: { 'Content-Type': 'application/json' }
    });
  }
});

assert.equal(calls.length, 1, 'deve consultar a OAB limpa sem sobrecarregar a API com sufixos redundantes');
assert.equal(target.intimations.length, 1, 'deve deduplicar a publicação do DJEN');
assert.equal(target.intimations[0].process, '1234567-89.2026.8.21.0001');
assert.equal(target.intimations[0].certificateUrl, 'https://comunicaapi.pje.jus.br/api/v1/comunicacao/abcdefghijk1234567890/certidao');

const portal = { url: 'https://pje.tjmt.jus.br', trustedAuthOrigins: ['https://sso.cloud.pje.jus.br'] };
assert.doesNotThrow(() => assertTrustedPortal('https://pje.tjmt.jus.br/pje/Painel/painel_usuario/advogado.seam', portal));
assert.doesNotThrow(() => assertTrustedPortal('https://sso.cloud.pje.jus.br/auth/realms/pje', portal));
assert.throws(() => assertTrustedPortal('https://pje.tjmt.jus.br.evil.example/login', portal), /fora das origens permitidas/);
assert.match('Tomar ciência', pjeInternals.DANGEROUS_ACTION_RE);
assert.match('Responder', pjeInternals.DANGEROUS_ACTION_RE);

assert.equal(datajudInternals.aliasForProcess('1234567-89.2026.8.21.0001'), 'tjrs');
assert.equal(datajudInternals.aliasForProcess('1234567-89.2026.4.04.0001'), 'trf4');
assert.equal(datajudInternals.aliasForProcess('1234567-89.2026.5.04.0001'), 'trt4');
assert.equal(datajudInternals.normalizeApiKey('Authorization: APIKey chave-publica=='), 'chave-publica==');

const datajudTarget = {
  events: [], tasks: [], intimations: [], sources: [],
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
        numeroProcesso: '12345678920268210001', tribunal: 'TJRS', grau: 'G1',
        classe: { nome: 'Procedimento de teste' }, assuntos: [{ nome: 'Assunto de teste' }],
        dataHoraUltimaAtualizacao: '2026-08-17T13:00:00.000Z',
        movimentos: [{ codigo: 123, nome: 'Movimento de teste', dataHora: '2026-08-17T12:00:00.000Z' }]
      } }] }
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }
});
assert.equal(datajudResult.refreshedKey, true, 'deve atualizar a chave rejeitada pela página oficial');
assert.equal(datajudResult.found, 1);
assert.equal(datajudTarget.processes[0].lastMovement, 'Movimento de teste');
assert.equal(datajudTarget.tasks[0].deadline, '', 'DataJud também não deve inferir prazo jurídico');
assert.equal(datajudCalls, 3, 'deve fazer consulta, atualização oficial e nova consulta');

console.log('Testes dos coletores DJEN/DataJud/PJe passaram: origens restritas, rotação de chave, HTML neutralizado e ciência não automatizada.');
