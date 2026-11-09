import assert from 'node:assert/strict';
import { openPjeBrowserSession, openSidecarPjeSession, listPjeRuntimeHosts, isPjeSidecarChannelAvailable } from '../lib/judicial/pje/runtime/index.mjs';
import { buildPjeClientCertificateEntries } from '../lib/judicial/pje/runtime/browser-host.mjs';
import { getPjePortalById } from '../lib/judicial/pje/portal-registry.mjs';

console.log('\n===============================================================');
console.log('  ATRIUM — RUNTIME PJe (SERVER PRIMÁRIO, SIDECAR HONESTO)      ');
console.log('===============================================================\n');

const portal = getPjePortalById('pje-tjmt-1g');

console.log('[T1] Contrato de certificados por origem...');
const entries = buildPjeClientCertificateEntries(portal, { pfxPath: '/tmp/modern.pfx', passphrase: 'temporaria' });
const origins = entries.map(entry => entry.origin);
assert.ok(origins.includes('https://pje.tjmt.jus.br'));
assert.ok(origins.includes('https://sso.cloud.pje.jus.br'));
assert.ok(entries.every(entry => entry.pfxPath === '/tmp/modern.pfx' && entry.passphrase === 'temporaria'));
assert.deepEqual(buildPjeClientCertificateEntries(portal, null), []);
console.log('  ✓ A1 entra para portal e SSO PDPJ; sem certificado, lista vazia.');

console.log('[T2] Host server abre sessão persistente com o mesmo contrato...');
const launches = [];
let closed = 0;
const fakePage = { marker: 'page' };
const fakeContext = {
  pages: () => [fakePage],
  newPage: async () => fakePage,
  close: async () => { closed += 1; }
};
const session = await openPjeBrowserSession({
  portal,
  requested: 'server',
  profileDir: 'C:/dados/perfis/pje-tjmt-1g',
  certificate: { pfxPath: '/tmp/modern.pfx', passphrase: 'temporaria' },
  deps: {
    launchPersistentContext: async (directory, options) => {
      launches.push({ directory, options });
      return fakeContext;
    }
  }
});
assert.equal(session.runtime, 'server');
assert.equal(session.portalId, 'pje-tjmt-1g');
assert.equal(session.page, fakePage);
assert.equal(launches.length, 1);
assert.equal(launches[0].directory, 'C:/dados/perfis/pje-tjmt-1g');
assert.equal(launches[0].options.headless, true);
assert.equal(launches[0].options.acceptDownloads, false, 'Coletor read-only não deve aceitar downloads de arquivos.');
assert.ok(Array.isArray(launches[0].options.clientCertificates) && launches[0].options.clientCertificates.length >= 2);
await session.close();
assert.equal(closed, 1);
console.log('  ✓ Sessão devolve page e fecha o contexto; A1 chega ao browser.');

console.log('[T3] Modo auto preserva o erro do servidor se o sidecar não tem canal...');
const fallbackEvents = [];
await assert.rejects(
  openPjeBrowserSession({
    portal,
    requested: 'auto',
    profileDir: 'C:/dados/perfis/x',
    onRuntimeFallback: event => fallbackEvents.push(event.from),
    deps: {
      launchPersistentContext: async () => {
        const error = new Error('runtime indisponível no host');
        error.errorCode = 'PJE-RUNTIME-UNAVAILABLE';
        throw error;
      }
    }
  }),
  error => error?.errorCode === 'PJE-RUNTIME-UNAVAILABLE' && /runtime indisponível no host/.test(error.message)
);
assert.deepEqual(fallbackEvents, ['server']);
console.log('  ✓ Falha do servidor não é substituída por fallback indisponível.');

console.log('[T4] Sidecar ainda não possui canal: falha tipada e honesta...');
assert.equal(isPjeSidecarChannelAvailable(), false);
await assert.rejects(
  openSidecarPjeSession({ portal }),
  error => error?.errorCode === 'PJE-RUNTIME-UNAVAILABLE' && /local_sidecar/.test(error.message)
);
assert.deepEqual(listPjeRuntimeHosts(), ['server', 'local_sidecar']);
console.log('  ✓ Nenhum mock finge sidecar; contrato pronto para a fase de delegação.');

console.log('\n>>> RUNTIME PJe F0: PASS <<<\n');
