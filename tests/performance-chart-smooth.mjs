import assert from 'node:assert/strict';
import { smoothPath } from '../js/views/ui-v2/performance-chart.js';

let assertions = 0;
const ok = (condition, message) => { assert.ok(condition, message); assertions += 1; };
const eq = (actual, expected, message) => { assert.equal(actual, expected, message); assertions += 1; };

console.log('--- Iniciando Testes: curva do gráfico de performance ---');

eq(smoothPath([]), '', 'lista vazia não gera caminho');
eq(smoothPath([{ x: 10, y: 20 }]), 'M 10 20', 'um ponto gera só o M');

const points = [
  { x: 0, y: 100 },
  { x: 10, y: 100 },
  { x: 20, y: 50 },
  { x: 30, y: 50 },
  { x: 40, y: 0 }
];
const path = smoothPath(points);
ok(path.startsWith('M 0 100'), 'começa no primeiro ponto');
ok(path.includes(' C '), 'usa curvas cúbicas');
eq((path.match(/ C /g) || []).length, points.length - 1, 'uma curva por trecho');
ok(!/NaN|Infinity|undefined/.test(path), 'sem valores inválidos');
ok(path.endsWith('40 0'), 'termina no último ponto');

// A curva monótona não deve ultrapassar os extremos de cada trecho (série cumulativa).
const numbers = path.match(/-?\d+(?:\.\d+)?/g).map(Number);
for (let index = 1; index + 1 < points.length; index += 1) {
  const min = Math.min(points[index].y, points[index + 1].y);
  const max = Math.max(points[index].y, points[index + 1].y);
  const segment = numbers.slice(index * 6, index * 6 + 6);
  const ys = [segment[1], segment[3], segment[5]];
  ok(ys.every(value => value >= min - 0.01 && value <= max + 0.01), `trecho ${index} sem overshoot`);
}

// Patamar reto permanece reto.
const flat = smoothPath([{ x: 0, y: 40 }, { x: 10, y: 40 }]);
ok(/ C 1\.67 40, 8\.33 40, 10 40$/.test(flat), 'patamar horizontal sem ondulação');

console.log(`✓ ${assertions} verificações aprovadas.`);
console.log('PASS: curva do gráfico validada.');
