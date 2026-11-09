import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

// Roda a regra real do scanner em Python, sem baixar a revista.
const scannerDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'lib', 'inpi');
const PROGRAM = String.raw`
import json, sys
sys.path.insert(0, sys.argv[1])
import scanner
payload = json.load(sys.stdin)
monitors = scanner.load_monitors_from_raw(payload["monitors"])
hits = [scanner.match_monitors({"fields": fields}, monitors) for fields in payload["records"]]
print(json.dumps({"hits": hits, "kept": scanner.without_bare_number_hits(payload.get("old", []))}))
`;

function runScanner(payload) {
  for (const bin of ['python', 'python3']) {
    const result = spawnSync(bin, ['-c', PROGRAM, scannerDir], { input: JSON.stringify(payload), encoding: 'utf8' });
    if (result.status === 0) return JSON.parse(result.stdout);
    if (bin === 'python3') assert.fail(result.stderr || 'Python indisponível');
  }
  return null;
}

const lawyer = {
  id: 'adv-1',
  type: 'advogado',
  label: 'Maria de Souza Lima',
  oab: 'OAB/RS 135294',
  terms: ['Maria de Souza Lima', 'OAB/RS 135294', '135294', 'OAB RS 135294']
};
const record = (overrides = {}) => ({
  processo: '945491352',
  marca: 'MARCA TESTE',
  procurador: '',
  requerente: 'TITULAR QUALQUER',
  despacho: 'IPAS009 Publicação',
  texto: '945491352 MARCA TESTE TITULAR QUALQUER',
  ...overrides
});

test('número solto da OAB não captura processo alheio', () => {
  const { hits } = runScanner({
    monitors: [lawyer],
    records: [
      record({ processo: '829135294', texto: '829135294 MARCA TESTE' }),
      record({ texto: '945491352 94 MARCA' }),
      record({ texto: '135294 MARCA' })
    ]
  });
  assert.deepEqual(hits, [[], [], []]);
});

test('nome e OAB com seccional continuam capturando', () => {
  const { hits } = runScanner({
    monitors: [lawyer],
    records: [
      record({ procurador: 'Maria De Souza Lima', texto: '945491352 Maria De Souza Lima' }),
      record({ texto: '945491352 procuradora OAB/RS 135.294' }),
      record({ procurador: 'María de Souza-Lima', texto: '945491352 María de Souza-Lima' })
    ]
  });
  assert.equal(hits[0][0].matchedTerms[0], 'Maria de Souza Lima');
  assert.deepEqual(hits[0][0].fields, ['procurador']);
  assert.ok(hits[1][0].matchedTerms.includes('OAB/RS 135294'));
  assert.equal(hits[2].length, 1);
});

test('nome precisa bater em palavra inteira', () => {
  const { hits } = runScanner({
    monitors: [{ id: 'adv-2', type: 'advogado', label: 'Ana Silva', terms: ['Ana Silva'] }],
    records: [
      record({ procurador: 'Santana Silva', texto: '945491352 Santana Silva' }),
      record({ procurador: 'Ana Silva', texto: '945491352 Ana Silva' })
    ]
  });
  assert.equal(hits[0].length, 0);
  assert.equal(hits[1].length, 1);
});

test('termo personalizado de processo só vale para o número exato', () => {
  const { hits } = runScanner({
    monitors: [{ id: 'custom-1', type: 'processo', label: '945491352', terms: ['945491352'] }],
    records: [record(), record({ processo: '1945491352', texto: '1945491352 x 945491352' })]
  });
  assert.deepEqual(hits[0][0].fields, ['processo']);
  assert.equal(hits[1].length, 0);
});

test('ocorrência antiga achada só pelo número solto sai na próxima leitura', () => {
  const { kept } = runScanner({
    monitors: [],
    records: [],
    old: [
      { id: 'a', monitores: [{ type: 'advogado', matchedTerms: ['135294'] }] },
      { id: 'b', monitores: [{ type: 'advogado', matchedTerms: ['135294', 'Maria de Souza Lima'] }] },
      { id: 'c', monitores: [{ type: 'marca', matchedTerms: ['12345'] }] }
    ]
  });
  assert.deepEqual(kept.map(item => item.id), ['b', 'c']);
  assert.deepEqual(kept[0].monitores[0].matchedTerms, ['Maria de Souza Lima']);
});
