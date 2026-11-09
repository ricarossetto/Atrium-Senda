import assert from 'node:assert/strict';
import { hashContent } from '../scripts/asset-version-manifest.mjs';

console.log('--- Iniciando Testes: hash de asset independente do fim de linha ---');

const lf = Buffer.from('const título = "ação";\nexport default título;\n', 'utf8');
const crlf = Buffer.from('const título = "ação";\r\nexport default título;\r\n', 'utf8');
const mixed = Buffer.from('const título = "ação";\r\nexport default título;\n', 'utf8');
const changed = Buffer.from('const título = "ações";\nexport default título;\n', 'utf8');

assert.equal(hashContent(crlf), hashContent(lf), 'CRLF e LF do mesmo conteúdo têm o mesmo hash');
assert.equal(hashContent(mixed), hashContent(lf), 'fim de linha misto tem o mesmo hash');
assert.notEqual(hashContent(changed), hashContent(lf), 'mudança real de conteúdo muda o hash');

console.log('[PASS] Hash de asset ignora só o fim de linha.');
