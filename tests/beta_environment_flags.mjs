import assert from 'node:assert/strict';
import {
  featureFlag,
  isBetaEnvironment,
  publicBetaStatus,
  resolveEnvironment
} from '../lib/beta/feature-flags.mjs';
import { startTestServer } from './helpers.mjs';

console.log('\n===============================================================');
console.log('  ATRIUM — AMBIENTE SERVER-SIDE E FLAGS EXPERIMENTAIS BETA     ');
console.log('===============================================================\n');

// 1. Resolução de ambiente sem depender do hostname.
assert.equal(resolveEnvironment({}), 'production');
assert.equal(resolveEnvironment({ NODE_ENV: 'development' }), 'development');
assert.equal(resolveEnvironment({ ATRIUM_ENV: 'beta', NODE_ENV: 'development' }), 'beta');
assert.equal(resolveEnvironment({ ATRIUM_ENV: 'BETA' }), 'beta');
assert.equal(isBetaEnvironment({ ATRIUM_ENV: 'beta' }), true);
assert.equal(isBetaEnvironment({ ATRIUM_ENV: 'staging' }), false);
assert.equal(isBetaEnvironment({}), false);

// 2. Defaults: fora do beta, todas as flags efetivas são falsas.
const defaults = publicBetaStatus({});
assert.equal(defaults.betaMode, false);
assert.equal(defaults.environment, 'production');
assert.equal(Object.values(defaults.featureFlags).every(value => value === false), true);
assert.equal(featureFlag('BETA_JUDICIAL_INTELLIGENCE', {}), false);

// 3. No beta, apenas as flags declaradas e ligadas explicitamente ficam ativas.
const betaAll = publicBetaStatus({
  ATRIUM_ENV: 'beta',
  ATRIUM_BETA_MODE: 'true',
  BETA_JUDICIAL_INTELLIGENCE: 'true',
  BETA_LEGAL_MCP: '1',
  BETA_DISABLE_AUTOMATIONS: 'true'
});
assert.equal(betaAll.betaMode, true);
assert.equal(betaAll.featureFlags.ATRIUM_BETA_MODE, true);
assert.equal(betaAll.featureFlags.BETA_JUDICIAL_INTELLIGENCE, true);
assert.equal(betaAll.featureFlags.BETA_LEGAL_MCP, true);
assert.equal(betaAll.featureFlags.BETA_DISABLE_AUTOMATIONS, true);
assert.equal(betaAll.featureFlags.BETA_ROM_RECIPES, false);
assert.equal(betaAll.featureFlags.BETA_LEGAL_RAG, false);
assert.deepEqual(betaAll.enabledFeatureFlags, ['ATRIUM_BETA_MODE', 'BETA_JUDICIAL_INTELLIGENCE', 'BETA_LEGAL_MCP', 'BETA_DISABLE_AUTOMATIONS']);

// 4. Produção nunca liga flag experimental, mesmo com variável presente.
const productionOverride = publicBetaStatus({
  ATRIUM_ENV: 'production',
  ATRIUM_BETA_MODE: 'true',
  BETA_JUDICIAL_INTELLIGENCE: 'true',
  BETA_LEX_SKILLS: 'true'
});
assert.equal(productionOverride.betaMode, false);
assert.equal(productionOverride.featureFlags.ATRIUM_BETA_MODE, false);
assert.equal(productionOverride.featureFlags.BETA_JUDICIAL_INTELLIGENCE, false);
assert.equal(productionOverride.featureFlags.BETA_LEX_SKILLS, false);

// 4b. Kill-switch compartilhado: no beta, ausência da env resolve para true (fail-safe).
const betaKillSwitchDefault = publicBetaStatus({ ATRIUM_ENV: 'beta' });
assert.equal(betaKillSwitchDefault.featureFlags.BETA_DISABLE_AUTOMATIONS, true);
assert.equal(betaKillSwitchDefault.featureFlags.BETA_JUDICIAL_INTELLIGENCE, false);
const betaKillSwitchOptOut = publicBetaStatus({ ATRIUM_ENV: 'beta', BETA_DISABLE_AUTOMATIONS: 'false' });
assert.equal(betaKillSwitchOptOut.featureFlags.BETA_DISABLE_AUTOMATIONS, false);

// 5. Flags desconhecidas não são inventariadas nem ecoadas.
const unknown = publicBetaStatus({ ATRIUM_ENV: 'beta', BETA_UNKNOWN_EXPERIMENT: 'true' });
assert.equal('BETA_UNKNOWN_EXPERIMENT' in unknown.featureFlags, false);

// 6. Health real em ambiente beta expõe identificação, build e flags efetivas.
const betaServer = await startTestServer({
  env: {
    ATRIUM_ENV: 'beta',
    ATRIUM_BETA_MODE: 'true',
    BETA_JUDICIAL_INTELLIGENCE: 'true',
    BETA_LEX_SKILLS: 'true',
    BETA_ROM_RECIPES: 'false'
  }
});
try {
  const health = await (await fetch(`${betaServer.baseUrl}/api/health`)).json();
  assert.equal(health.ok, true);
  assert.equal(health.environment, 'beta');
  assert.equal(health.betaMode, true);
  assert.equal(health.featureFlags.BETA_JUDICIAL_INTELLIGENCE, true);
  assert.equal(health.featureFlags.BETA_LEX_SKILLS, true);
  assert.equal(health.featureFlags.BETA_ROM_RECIPES, false);
  assert.ok(Array.isArray(health.enabledFeatureFlags), 'enabledFeatureFlags deve ser lista.');
  assert.ok(health.enabledFeatureFlags.includes('BETA_JUDICIAL_INTELLIGENCE'));
  const serialized = JSON.stringify(health);
  for (const secretName of ['AUTH_SESSION_SECRET', 'AUTH_ENCRYPTION_KEY', 'COLLECTOR_INGEST_TOKEN', 'SETUP_BOOTSTRAP_TOKEN']) {
    assert.equal(serialized.includes(secretName), false, `health não deve mencionar ${secretName}.`);
  }
} finally {
  await betaServer.stop();
}

// 7. Health em produção com variáveis beta presentes permanece desligado.
const productionServer = await startTestServer({
  env: {
    ATRIUM_ENV: 'production',
    ATRIUM_BETA_MODE: 'true',
    BETA_JUDICIAL_INTELLIGENCE: 'true'
  }
});
try {
  const health = await (await fetch(`${productionServer.baseUrl}/api/health`)).json();
  assert.equal(health.environment, 'production');
  assert.equal(health.betaMode, false);
  assert.equal(health.featureFlags.BETA_JUDICIAL_INTELLIGENCE, false);
  assert.equal(health.featureFlags.ATRIUM_BETA_MODE, false);
  assert.deepEqual(health.enabledFeatureFlags, []);
} finally {
  await productionServer.stop();
}

console.log('PASS ambiente server-side: beta identificado, flags declaradas e produção sempre desligada.');
