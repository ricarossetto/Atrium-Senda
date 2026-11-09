import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { SecurityManager } from '../lib/security.mjs';
import { JudicialCredentialManager } from '../lib/judicial/credential-manager.mjs';
import { getCredentialScopeForPortal } from '../lib/judicial/eproc/portal-registry.mjs';

console.log('\n===============================================================');
console.log('  ATRIUM — COFRE PJe: ESCOPO pdpj ISOLADO POR WORKSPACE       ');
console.log('===============================================================\n');

const SYNTHETIC_TOTP = 'JBSWY3DPEHPK3PXP';
const identityId = 'office-primary';
const workspaceA = 'ws-alfa';
const workspaceB = 'ws-beta';
const baseDir = await mkdtemp(path.join(tmpdir(), 'atrium-pje-vault-'));
const vaultADir = path.join(baseDir, 'workspaces', workspaceA);
const vaultBDir = path.join(baseDir, 'workspaces', workspaceB);

const security = new SecurityManager({
  dataDirectory: baseDir,
  sessionSecret: randomBytes(48).toString('base64url'),
  encryptionKey: randomBytes(32).toString('base64')
});

try {
  console.log('[T1] Escopo unificado pdpj para portais PJe...');
  assert.equal(getCredentialScopeForPortal('pje-tjmt-1g'), 'pdpj');
  assert.equal(getCredentialScopeForPortal('pje-trt4-1g'), 'pdpj');
  assert.equal(getCredentialScopeForPortal('pje-tse'), 'pdpj');
  assert.equal(getCredentialScopeForPortal('pje-custom'), 'pdpj');
  console.log('  ✓ Um único segredo PDPJ serve todos os portais PJe do workspace.');

  console.log('[T2] Segredo PDPJ gravado no workspace A...');
  const managerA = new JudicialCredentialManager({
    dataDirectory: vaultADir,
    securityManager: security,
    allowLegacyRootFallback: false,
    allowEnvironmentFallback: false
  });
  await managerA.savePortalTotp('pdpj', {
    secret: SYNTHETIC_TOTP,
    label: 'PDPJ',
    identityId,
    workspaceId: workspaceA
  });
  assert.equal(await managerA.getPortalTotpSecret('pdpj', identityId, workspaceA), SYNTHETIC_TOTP);
  assert.equal(
    await managerA.getPortalTotpSecret('pje-tjmt-1g', identityId, workspaceA),
    SYNTHETIC_TOTP,
    'Qualquer portal PJe do workspace deve resolver o segredo pelo escopo pdpj.'
  );
  assert.equal(await managerA.getPortalTotpSecret('pje-trt4-1g', identityId, workspaceA), SYNTHETIC_TOTP);
  console.log('  ✓ TJMT/TRT4/demais portais leem o mesmo segredo do cofre A.');

  console.log('[T3] Workspace B não herda o segredo PDPJ...');
  const managerB = new JudicialCredentialManager({
    dataDirectory: vaultBDir,
    securityManager: security,
    allowLegacyRootFallback: false,
    allowEnvironmentFallback: false
  });
  assert.equal(await managerB.getPortalTotpSecret('pje-tjmt-1g', identityId, workspaceB), null);
  assert.equal(await managerB.getPortalTotpSecret('pdpj', identityId, workspaceB), null);
  console.log('  ✓ Sem cofre próprio, o workspace B falha fechado.');

  console.log('[T4] Workspace B com segredo próprio não afeta o A...');
  await managerB.savePortalTotp('pdpj', {
    secret: 'GEZDGNBVGY3TQOJQ',
    label: 'PDPJ B',
    identityId,
    workspaceId: workspaceB
  });
  assert.equal(await managerA.getPortalTotpSecret('pje-tjmt-1g', identityId, workspaceA), SYNTHETIC_TOTP);
  assert.equal(await managerB.getPortalTotpSecret('pje-tjmt-1g', identityId, workspaceB), 'GEZDGNBVGY3TQOJQ');
  console.log('  ✓ Segredos PDPJ independentes por workspace.');

  console.log('[T5] Remoção no A não toca o B...');
  await managerA.removePortalTotp('pdpj', { identityId, workspaceId: workspaceA });
  assert.equal(await managerA.getPortalTotpSecret('pje-tjmt-1g', identityId, workspaceA), null);
  assert.equal(await managerB.getPortalTotpSecret('pje-tjmt-1g', identityId, workspaceB), 'GEZDGNBVGY3TQOJQ');
  console.log('  ✓ Remoção isolada por workspace.');

  console.log('\n>>> COFRE PJe F0: PASS <<<\n');
} finally {
  await rm(baseDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
