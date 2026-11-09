import assert from 'node:assert/strict';
import {
  CalculationRecordError,
  MAX_CALCULATIONS,
  sanitizeCalculations,
  summarizeCalculation,
  validateCalculationRecord,
  compactResultado
} from '../lib/calc/persistence.mjs';
import {
  CorruptedStateError,
  CURRENT_SCHEMA_VERSION,
  applySafeDefaults,
  migrate10To11,
  runStateMigrations,
  validateAppState
} from '../lib/state-migrations.mjs';
import { Store as NodeStore } from '../js/core/store.js';

function record(id = 'calc-1', extra = {}) {
  return {
    id,
    tipo: 'civel',
    titulo: 'Cálculo sintético',
    entrada: { atualizacaoAte: '2026-04-20', itens: [{ id: 'item-1', especie: 'debito', data: '2026-01-15', valor: '1000.00' }] },
    resultado: { atualizacaoAte: '2026-04-20', resumo: { total: '1023.41' }, itens: [], memoria: [], fontes: [] },
    createdAt: '2026-09-18T12:00:00.000Z',
    createdBy: 'Advogada Teste',
    ...extra
  };
}

function baseState(extra = {}) {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    dataVersion: CURRENT_SCHEMA_VERSION,
    terms: [], sources: [], intimations: [], tasks: [], processes: [],
    agenda: [], audit: [], contacts: [], documents: [], customPrompts: [], customLinks: [],
    settings: {}, configuration: {},
    ...extra
  };
}

assert.equal(validateCalculationRecord(record()), true);
assert.throws(() => validateCalculationRecord(null), CalculationRecordError);
assert.throws(() => validateCalculationRecord(record('', {})), CalculationRecordError);
assert.throws(() => validateCalculationRecord(record('calc-1', { tipo: 'outro' })), CalculationRecordError);
assert.throws(() => validateCalculationRecord(record('calc-1', { entrada: null })), CalculationRecordError);
assert.throws(() => validateCalculationRecord(record('calc-1', { resultado: [] })), CalculationRecordError);
assert.throws(() => validateCalculationRecord(record('calc-1', { titulo: 'x'.repeat(161) })), CalculationRecordError);
assert.throws(() => validateCalculationRecord(record('calc-1', { resultado: { texto: 'x'.repeat(160_000) } })), CalculationRecordError, 'Registro acima de 150k caracteres precisa ser rejeitado.');
assert.throws(() => validateCalculationRecord(record('calc-1', { createdAt: 123 })), CalculationRecordError);

const pequeno = compactResultado({ resumo: { total: '10.00' }, memoria: [{ tipo: 'multa', valor: '1.00' }] });
assert.deepEqual(pequeno, { resumo: { total: '10.00' }, memoria: [{ tipo: 'multa', valor: '1.00' }] });

const meses = Array.from({ length: 200 }, (_, index) => ({
  periodo: `20${String(10 + (index % 90)).padStart(2, '0')}-01`,
  dias: 30,
  diasNoMes: 30,
  taxa: '0.500000',
  taxaAplicada: '0.500000000000'
}));
const grande = {
  resumo: { total: '1.00' },
  memoria: Array.from({ length: 30 }, (_, index) => ({ tipo: 'juros', itemId: `item-${index}`, taxaTotal: '1.5', base: '1000.00', valor: '15.00', meses }))
};
assert.ok(JSON.stringify(grande).length > 120_000, 'Fixture precisa exceder o teto de resultado.');
const compactado = compactResultado(grande);
assert.equal(compactado.memoriaCompactada, true);
assert.equal(compactado.memoria.every(entry => entry.meses === undefined && entry.memoriaMensalRemovida === true), true);
assert.equal(compactado.memoria[0].valor, '15.00', 'Totais da memória não podem ser perdidos na compactação.');
assert.doesNotThrow(() => JSON.parse(JSON.stringify(compactado)));
assert.throws(() => compactResultado({ resumo: {}, memoria: [], texto: 'x'.repeat(130_000) }), CalculationRecordError, 'Sem memória mensal para resumir, o excesso precisa falhar.');

const poluido = JSON.parse('{"id":"calc-x","tipo":"civel","entrada":{"__proto__":{"hack":true},"ok":1},"resultado":{"resumo":{}}}');
const sanitizados = sanitizeCalculations([
  poluido,
  record('calc-a'),
  record('calc-b'),
  record('calc-a', { titulo: 'Versão mais nova' }),
  { id: '', tipo: 'civel' },
  'junk'
]);
assert.equal(sanitizados.length, 3);
assert.equal(sanitizados.find(item => item.id === 'calc-a').titulo, 'Versão mais nova', 'Última versão do id deve prevalecer.');
assert.equal(Object.hasOwn(sanitizados.find(item => item.id === 'calc-x').entrada, '__proto__'), false, 'Chaves perigosas devem ser removidas.');
assert.equal(sanitizados.every(item => item.schemaVersion === 1), true);

const limitados = sanitizeCalculations(Array.from({ length: 5 }, (_, index) => record(`calc-${index}`)), 3);
assert.deepEqual(limitados.map(item => item.id), ['calc-2', 'calc-3', 'calc-4'], 'Teto mantém os registros mais recentes da lista.');

const resumo = summarizeCalculation(record('calc-1', {
  entrada: {},
  resultado: { atualizacaoAte: '2026-04-20', resumo: { total: '1023.41' } }
}));
assert.deepEqual(resumo, {
  id: 'calc-1',
  tipo: 'civel',
  titulo: 'Cálculo sintético',
  createdAt: '2026-09-18T12:00:00.000Z',
  createdBy: 'Advogada Teste',
  valor: '1023.41',
  referencia: '2026-04-20',
  memoriaCompactada: false
});
assert.equal(summarizeCalculation(record('calc-2', { tipo: 'trabalhista', resultado: { resumo: { liquido: '-944.44' } } })).valor, '-944.44');
assert.equal(summarizeCalculation(record('calc-3', { tipo: 'previdenciario', resultado: { resumo: { rmi: '1518.00' }, ultimaCompetencia: '2024-12' } })).referencia, '2024-12');
assert.throws(() => summarizeCalculation(null), CalculationRecordError);

assert.equal(validateAppState(baseState({ calculations: [record()] })).valid, true);
assert.equal(validateAppState(baseState()).valid, true, 'Coleção ausente continua válida.');
assert.throws(() => validateAppState(baseState({ calculations: 'x' })), CorruptedStateError);
assert.throws(() => validateAppState(baseState({ calculations: [record('bad', { tipo: 'invalido' })] })), CorruptedStateError);
assert.throws(() => validateAppState(baseState({ calculations: Array.from({ length: MAX_CALCULATIONS + 1 }, (_, index) => record(`calc-${index}`)) })), CorruptedStateError);

const defaults = applySafeDefaults(baseState());
assert.deepEqual(defaults.calculations, [], 'Estado sem cálculos recebe coleção vazia sem tocar registros existentes.');
const defaultsComRegistro = applySafeDefaults(baseState({ calculations: [record()] }));
assert.equal(defaultsComRegistro.calculations.length, 1, 'Defaults não podem descartar cálculos salvos.');

const migration = runStateMigrations({ schemaVersion: 10, terms: [], sources: [], intimations: [], tasks: [], processes: [], agenda: [], audit: [], contacts: [], documents: [] });
assert.equal(migration.state.schemaVersion, CURRENT_SCHEMA_VERSION);
assert.equal(migration.migrated, true);
assert.deepEqual(migration.state.calculations, [], 'Migração de estado antigo cria coleção vazia.');
assert.equal(migrate10To11({ schemaVersion: 10 }).schemaVersion, 11);

const original = { state: NodeStore.state, save: NodeStore.save, saveTimer: NodeStore.saveTimer };
try {
  NodeStore.save = () => {};
  NodeStore.state = { calculations: [], audit: [] };
  NodeStore.upsert('calculations', record('calc-store'));
  assert.equal(NodeStore.state.calculations.length, 1);
  NodeStore.upsert('calculations', { ...record('calc-store'), titulo: 'Atualizado' });
  assert.equal(NodeStore.state.calculations.length, 1, 'Upsert por id não pode duplicar o registro.');
  assert.equal(NodeStore.state.calculations[0].titulo, 'Atualizado');
  assert.doesNotThrow(() => JSON.parse(JSON.stringify(NodeStore.state.calculations)));
} finally {
  clearTimeout(NodeStore.saveTimer);
  NodeStore.state = original.state;
  NodeStore.save = original.save;
  NodeStore.saveTimer = original.saveTimer;
}

console.log('Persistência dos cálculos aprovada: validação estrita, sanitização, compactação limitada, defaults e Store PASS.');
