import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const moduleSpec = await readFile(new URL('../specs/calculations.md', import.meta.url), 'utf8');
const civilSpec = await readFile(new URL('../specs/calculations-civel.md', import.meta.url), 'utf8');
const laborSpec = await readFile(new URL('../specs/calculations-trabalhista.md', import.meta.url), 'utf8');
const socialSpec = await readFile(new URL('../specs/calculations-previdenciario.md', import.meta.url), 'utf8');
const specsIndex = await readFile(new URL('../specs/README.md', import.meta.url), 'utf8');

for (const [name, body] of [['calculations', moduleSpec], ['calculations-civel', civilSpec], ['calculations-trabalhista', laborSpec], ['calculations-previdenciario', socialSpec]]) {
  assert.match(body, /Status: \*\*CURRENT[^\n]*FUTURE/, `${name}: status CURRENT com itens FUTURE ausente.`);
  assert.match(body, /`tests\//, `${name}: testes relevantes não apontados.`);
}

const MODULE_SECTIONS = [
  'Propósito',
  'Autoridade',
  'Invariantes',
  'Operações permitidas',
  'Operações proibidas',
  'Modelo de estado',
  'Fronteira de segurança',
  'Semântica de falha',
  'Semântica de persistência',
  'Testes relevantes',
  'Não-objetivos'
];
for (const section of MODULE_SECTIONS) {
  assert.ok(moduleSpec.includes(`## ${section}`), `calculations.md: seção ${section} ausente.`);
}

assert.match(moduleSpec, /BigInt/, 'calculations.md: representação decimal BigInt não declarada.');
assert.match(moduleSpec, /NBR 5891/, 'calculations.md: arredondamento NBR 5891 não declarado.');
assert.match(moduleSpec, /half-up/, 'calculations.md: modo half-up não declarado.');
assert.match(moduleSpec, /juros simples/i, 'calculations.md: regime de juros simples da taxa legal não declarado.');
assert.match(moduleSpec, /max\(FatorSelic \/ FatorIPCA/, 'calculations.md: fórmula da taxa legal ausente.');
assert.match(moduleSpec, /SGS/, 'calculations.md: fonte oficial SGS não declarada.');
assert.match(moduleSpec, /hash/i, 'calculations.md: snapshot com hash não declarado.');
assert.match(moduleSpec, /nunca interpola/i, 'calculations.md: lacuna de série não pode ser interpolada.');
assert.match(moduleSpec, /não infere prazo|não abre prazo/i, 'calculations.md: proibição de inferir prazo ausente.');
assert.match(moduleSpec, /FUTURE/, 'calculations.md: itens futuros devem permanecer marcados.');
assert.match(moduleSpec, /specs\/calculations-civel\.md/, 'calculations.md: vínculo com a spec cível ausente.');

const CIVIL_SECTIONS = [
  'Objetivo',
  'Regimes e marcos',
  'Taxa legal',
  'Multa e honorários',
  'Itens e bases',
  'Operações proibidas',
  'Testes relevantes'
];
for (const section of CIVIL_SECTIONS) {
  assert.ok(civilSpec.includes(`## ${section}`), `calculations-civel.md: seção ${section} ausente.`);
}

assert.match(civilSpec, /EC 113/, 'calculations-civel.md: EC 113/2021 ausente.');
assert.match(civilSpec, /09\/12\/2021|9\.12\.2021|09\.12\.2021/, 'calculations-civel.md: marco da EC 113 ausente.');
assert.match(civilSpec, /14\.905/, 'calculations-civel.md: Lei 14.905/2024 ausente.');
assert.match(civilSpec, /5\.171/, 'calculations-civel.md: Resolução CMN 5.171/2024 ausente.');
assert.match(civilSpec, /29541/, 'calculations-civel.md: série do fator Selic da taxa legal ausente.');
assert.match(civilSpec, /29542/, 'calculations-civel.md: série do fator IPCA da taxa legal ausente.');
assert.match(civilSpec, /29543/, 'calculations-civel.md: série da taxa legal ausente.');
assert.match(civilSpec, /523/, 'calculations-civel.md: multa do art. 523 do CPC ausente.');
assert.match(civilSpec, /NBR 5891/, 'calculations-civel.md: arredondamento NBR 5891 ausente.');
assert.match(civilSpec, /não infere|n[aã]o infere/i, 'calculations-civel.md: critério não pode ser inferido automaticamente.');

assert.match(specsIndex, /\(calculations\.md\)/, 'specs/README.md: índice não aponta calculations.md.');
assert.match(specsIndex, /\(calculations-civel\.md\)/, 'specs/README.md: índice não aponta calculations-civel.md.');

const LABOR_SECTIONS = [
  'Objetivo',
  'Regras cobertas',
  'Limites do MVP',
  'Autoridade',
  'Operações proibidas',
  'Testes relevantes'
];
for (const section of LABOR_SECTIONS) {
  assert.ok(laborSpec.includes(`## ${section}`), `calculations-trabalhista.md: seção ${section} ausente.`);
}
assert.match(laborSpec, /12\.506\/2011/, 'calculations-trabalhista.md: aviso proporcional ausente.');
assert.match(laborSpec, /484-A/, 'calculations-trabalhista.md: acordo do art. 484-A ausente.');
assert.match(laborSpec, /Súmula 371/, 'calculations-trabalhista.md: projeção do aviso ausente.');
assert.match(laborSpec, /Súmula 261/, 'calculations-trabalhista.md: férias proporcionais ausentes.');
assert.match(laborSpec, /Súmula 171/, 'calculations-trabalhista.md: restrição da justa causa ausente.');
assert.match(laborSpec, /tributação automática cobre apenas a vigência fiscal de 2026/i, 'calculations-trabalhista.md: limite da tributação automática não declarado.');
assert.match(laborSpec, /15\.270\/2025/, 'calculations-trabalhista.md: redutor da Lei 15.270/2025 ausente.');
assert.match(laborSpec, /CALCULOS_OPEN_SOURCE_BASE\.md/, 'calculations-trabalhista.md: base open source auditada não referenciada.');
assert.match(laborSpec, /PJe-Calc/, 'calculations-trabalhista.md: referência funcional ausente.');
assert.match(specsIndex, /\(calculations-trabalhista\.md\)/, 'specs/README.md: índice não aponta calculations-trabalhista.md.');

const SOCIAL_SECTIONS = [
  'Objetivo',
  'Regras cobertas',
  'Autoridade',
  'Operações proibidas',
  'Testes relevantes'
];
for (const section of SOCIAL_SECTIONS) {
  assert.ok(socialSpec.includes(`## ${section}`), `calculations-previdenciario.md: seção ${section} ausente.`);
}
assert.match(socialSpec, /EC 103\/2019/, 'calculations-previdenciario.md: EC 103/2019 ausente.');
assert.match(socialSpec, /13\.846\/2019/, 'calculations-previdenciario.md: redação do art. 29 ausente.');
assert.match(socialSpec, /14\.331\/2022/, 'calculations-previdenciario.md: divisor mínimo ausente.');
assert.match(socialSpec, /108/, 'calculations-previdenciario.md: divisor 108 ausente.');
assert.match(socialSpec, /descarte de contribui/, 'calculations-previdenciario.md: limite do descarte não declarado.');
assert.match(socialSpec, /CNIS/, 'calculations-previdenciario.md: papel do CNIS não declarado.');
assert.match(specsIndex, /\(calculations-previdenciario\.md\)/, 'specs/README.md: índice não aponta calculations-previdenciario.md.');

console.log('Contrato das specs de cálculos aprovado: módulo, regimes cíveis, taxa legal e índice oficial PASS.');
