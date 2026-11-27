/** O PJe headed usa o cookie do Xvfb ativo, não um diretório xvfb-run antigo. */
import assert from 'node:assert/strict';
import { resolveHeadedDisplayEnv } from '../lib/judicial/pje/runtime/server-host.mjs';

function fakeFs({ procs = {}, files = {} }) {
  return {
    readdirSync(dir) {
      if (dir === '/proc') return [...Object.keys(procs), 'self', 'cpuinfo'];
      if (dir === '/tmp') return Object.keys(files).map(path => path.split('/')[2]).filter(name => name.startsWith('xvfb-run.'));
      return [];
    },
    readFileSync(path) {
      const pid = path.split('/')[2];
      if (!procs[pid]) throw new Error('ENOENT');
      return procs[pid].join('\0');
    },
    existsSync: path => Object.hasOwn(files, path),
    statSync: path => ({ mtimeMs: files[path] })
  };
}

const files = { '/tmp/xvfb-run.Antigo/Xauthority': 1000, '/tmp/xvfb-run.Novo/Xauthority': 2000 };

// Xvfb ativo aponta para o diretório novo, mesmo listado depois do antigo.
let result = resolveHeadedDisplayEnv({ env: {}, fs: fakeFs({ procs: { 689088: ['Xvfb', ':99', '-screen', '0', '1440x900x24', '-auth', '/tmp/xvfb-run.Novo/Xauthority'] }, files }) });
assert.deepEqual(result, { display: ':99', xauthority: '/tmp/xvfb-run.Novo/Xauthority' });

// Xvfb de outro display não serve; cai para o arquivo mais recente.
result = resolveHeadedDisplayEnv({ env: {}, fs: fakeFs({ procs: { 10: ['/usr/bin/Xvfb', ':42', '-auth', '/tmp/xvfb-run.Antigo/Xauthority'] }, files }) });
assert.equal(result.xauthority, '/tmp/xvfb-run.Novo/Xauthority');

// Variável de ambiente explícita continua valendo.
result = resolveHeadedDisplayEnv({ env: { XVFB_AUTHORITY: '/srv/xauth', PJE_DISPLAY: ':7' }, fs: fakeFs({ files }) });
assert.deepEqual(result, { display: ':7', xauthority: '/srv/xauth' });

// Sem nada disponível, segue sem cookie e o launch falha fechado.
result = resolveHeadedDisplayEnv({ env: {}, fs: fakeFs({}) });
assert.deepEqual(result, { display: ':99', xauthority: '' });

console.log('ok - resolveHeadedDisplayEnv');
