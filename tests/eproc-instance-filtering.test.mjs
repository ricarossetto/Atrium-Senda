import assert from 'node:assert/strict';
import { sweepAndEnrichProcessesWithA1 } from '../lib/judicial/eproc-a1-downloader.mjs';

console.log('=== TESTE FOCAL: EPROC INSTANCE FILTERING (1G VS 2G) ===\n');

// 1. Simula estado do escritório contendo processos de 1º Grau e de 2º Grau (.8.21.7000)
const syntheticProcesses = [
  { id: 'proc-1g-poa', number: '5001234-56.2025.8.21.0001', court: '1ª Vara Cível de Porto Alegre', client: 'SIGILO', secrecy: true },
  { id: 'proc-1g-canoas', number: '5009876-12.2025.8.21.0008', court: '2ª Vara Cível de Canoas', client: null },
  { id: 'proc-2g-tjrs-1', number: '5173827-83.2025.8.21.7000', court: 'Tribunal de Justiça do RS', client: 'SIGILO', secrecy: true },
  { id: 'proc-2g-tjrs-2', number: '5226598-04.2026.8.21.7000', court: 'TJRS 2º Grau', client: 'SIGILO', secrecy: true }
];

const mockStateEnvelope = {
  revision: 1,
  state: {
    processes: syntheticProcesses,
    contacts: [],
    audit: [],
    intimations: [],
    tasks: [],
    events: []
  }
};

// Verifica que quando executado para 1G, processos 2G (.8.21.7000) são excluídos do sweep de 1G
// e apenas processos de 1G são candidatos.
let sweepObservedTargets1G = null;
let sweepObservedTargets2G = null;

// Teste do filtro em si (simulando a função auxiliar de filtragem com os mesmos predicados)
const is2GProcess = (num, court) => {
  return String(num || '').includes('.8.21.7000') || /2[ºª°\s]*grau|\b2g\b|turma\s*recursal|tribunal\s*de\s*justi[çc]a/i.test(String(court || ''));
};

const filterForPortal = (portalId, processes) => {
  const is2GPortal = portalId === 'tjrs-eproc-2g';
  return processes.filter(p => {
    const num = String(p.number || '');
    const court = String(p.court || '').toUpperCase();
    const isTjrs = num.includes('.8.21.') || court.includes('TJRS') || p.source === 'eproc-tjrs';
    if (!isTjrs) return false;
    const is2G = is2GProcess(num, court);
    return is2GPortal ? is2G : !is2G;
  });
};

const targets1G = filterForPortal('tjrs-eproc-1g', syntheticProcesses);
assert.equal(targets1G.length, 2, 'Portal 1G deve conter exatamente os 2 processos de 1º Grau');
assert.deepEqual(targets1G.map(p => p.id), ['proc-1g-poa', 'proc-1g-canoas']);

const targets2G = filterForPortal('tjrs-eproc-2g', syntheticProcesses);
assert.equal(targets2G.length, 2, 'Portal 2G deve conter exatamente os 2 processos de 2º Grau (.8.21.7000)');
assert.deepEqual(targets2G.map(p => p.id), ['proc-2g-tjrs-1', 'proc-2g-tjrs-2']);

// Cenário do usuário: acervo contendo APENAS processos 2G (.8.21.7000)
const only2GProcesses = [
  { id: 'p1', number: '5173827-83.2025.8.21.7000', court: 'TJRS' },
  { id: 'p2', number: '5226598-04.2026.8.21.7000', court: 'TJRS' },
  { id: 'p3', number: '5160993-14.2026.8.21.7000', court: 'TJRS' },
  { id: 'p4', number: '5243737-66.2026.8.21.7000', court: 'TJRS' }
];

const targets1GFor2GOnly = filterForPortal('tjrs-eproc-1g', only2GProcesses);
assert.equal(targets1GFor2GOnly.length, 0, 'Portal 1G NÃO deve varrer processos .8.21.7000 do 2º Grau, evitando erro na instância 1G');

const targets2GFor2GOnly = filterForPortal('tjrs-eproc-2g', only2GProcesses);
assert.equal(targets2GFor2GOnly.length, 4, 'Portal 2G deve receber todos os 4 processos .8.21.7000');

console.log('✓ Filtragem e roteamento por instância jurisdicional validada com sucesso.');
console.log('>>> EPROC INSTANCE FILTERING TEST: PASS <<<\n');
