import assert from 'node:assert/strict';
import { getPjePortalById } from '../lib/judicial/pje/portal-registry.mjs';
import { openServerPjeSession } from '../lib/judicial/pje/runtime/server-host.mjs';

console.log('\n==============================================');
console.log('  ATRIUM - HEADLESS POR PORTAL (TRT4 x TJMT)  ');
console.log('==============================================\n');

console.log('[T1] TRT4 exige headed; TJMT segue headless...');
const trt4g1 = getPjePortalById('pje-trt4-1g');
const trt4g2 = getPjePortalById('pje-trt4-2g');
const tjmtg1 = getPjePortalById('pje-tjmt-1g');
const tjmtg2 = getPjePortalById('pje-tjmt-2g');
assert.equal(trt4g1?.requiresHeaded, true);
assert.equal(trt4g2?.requiresHeaded, true);
assert.ok(!tjmtg1?.requiresHeaded, 'TJMT 1G nao pode exigir headed');
assert.ok(!tjmtg2?.requiresHeaded, 'TJMT 2G nao pode exigir headed');
console.log('  OK requiresHeaded so nos dois TRT4.');

console.log('[T2] Sessao headed recebe DISPLAY e mantem raster por software...');
let captured = null;
const stubPage = {};
const stubContext = { pages: () => [stubPage], newPage: async () => stubPage, close: async () => {} };
await openServerPjeSession({
  portal: trt4g1,
  profileDir: '/tmp/pje-pje-trt4-1g',
  headless: false,
  deps: {
    launchPersistentContext: async (dir, options) => {
      captured = { dir, options };
      return stubContext;
    }
  }
});
assert.match(captured.dir, /pje-trt4-1g/);
assert.ok(captured.options.headless === false);
assert.ok(typeof captured.options.env?.DISPLAY === 'string' && captured.options.env.DISPLAY.length > 0, 'DISPLAY ausente no launch headed');
assert.ok(!captured.options.args.includes('--disable-software-rasterizer'), 'headed nao pode desligar o raster por software');
console.log('  OK DISPLAY=' + captured.options.env.DISPLAY + ', XAUTHORITY ' + (captured.options.env.XAUTHORITY ? 'presente' : 'ausente (ok fora do host)'));

console.log('[T3] Sessao headless (TJMT) nao recebe env de display...');
captured = null;
await openServerPjeSession({
  portal: tjmtg1,
  profileDir: '/tmp/pje-pje-tjmt-1g',
  deps: {
    launchPersistentContext: async (dir, options) => {
      captured = { dir, options };
      return stubContext;
    }
  }
});
assert.ok(captured.options.headless !== false, 'default precisa continuar headless');
assert.ok(!captured.options.env, 'headless nao pode injetar env de display');
assert.ok(captured.options.args.includes('--disable-software-rasterizer'), 'headless mantem flags atuais');
console.log('  OK TJMT sem DISPLAY e com flags inalteradas.');

console.log('\n>>> HEADLESS POR PORTAL: PASS <<<\n');
