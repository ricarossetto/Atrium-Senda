import assert from 'node:assert/strict';
import test from 'node:test';
import {
  formatLawyerNames,
  officeOabKeys,
  officeSideLawyers,
  publicationPartyGroups
} from '../js/core/publication-parties.js';

const EPROC_TEXT = [
  'AGRAVO DE INSTRUMENTO Nº 0000000-00.2026.8.21.0000/RS',
  'RELATOR : DESEMBARGADOR TESTE',
  'AGRAVANTE : CLIENTE TESTE',
  'ADVOGADO(A) : ADVOGADA TESTE UM (OAB RS000001)',
  'ADVOGADO(A) : ADVOGADO TESTE DOIS (OAB RS000002)',
  'AGRAVADO : PARTE CONTRARIA TESTE',
  'ADVOGADO(A) : ADVOGADO ALHEIO (OAB RS000009)',
  'ADVOGADO(A) : ADVOGADA ALHEIA (OAB RS000010)',
  'ATO ORDINATORIO',
  'Intimacao realizada no sistema eproc.'
].join('\n');

const STJ_TEXT = [
  'EDcl nos REsp 0000000/UF (2026/0000000-0)',
  'RELATOR : MINISTRO TESTE',
  'EMBARGANTE : CLIENTE TESTE',
  'EMBARGANTE : CLIENTE TESTE DOIS',
  'ADVOGADOS : ADVOGADA TESTE UM - RS000001',
  'ADVOGADO TESTE DOIS - RS000002',
  'EMBARGADO : PARTE CONTRARIA TESTE',
  'ADVOGADOS : ADVOGADO ALHEIO - UF000009',
  'ADVOGADA ALHEIA - UF000010'
].join(' ');

const PJE_TEXT = [
  'PODER JUDICIARIO JUSTICA FEDERAL',
  'PROCESSO: 0000000-00.2026.4.04.0000',
  'POLO ATIVO: CLIENTE TESTE',
  'REPRESENTANTES POLO ATIVO: ADVOGADA TESTE UM - RS000001',
  'POLO PASSIVO: PARTE CONTRARIA TESTE',
  'REPRESENTANTES POLO PASSIVO: ADVOGADO ALHEIO - UF000009, ADVOGADA ALHEIA - UF000010 e ADVOGADO ALHEIO TRES - UF000011',
  'DECISAO Vistos, etc.'
].join(' ');

const keys = officeOabKeys({
  terms: [{ oabNumber: '000001', oabUf: 'RS', active: true }],
  users: []
});

test('agrupa advogados por polo conforme a fonte oficial (eproc)', () => {
  const groups = publicationPartyGroups(EPROC_TEXT);
  assert.deepEqual(groups.map(group => group.label), ['AGRAVANTE', 'AGRAVADO']);
  assert.deepEqual(groups[0].lawyers.map(lawyer => lawyer.oab), ['1', '2']);
  assert.deepEqual(groups[1].lawyers.map(lawyer => lawyer.oab), ['9', '10']);
  assert.equal(groups[0].lawyers[0].name, 'ADVOGADA TESTE UM');
});

test('agrupa advogados por polo no formato ADVOGADOS com hifen (STJ)', () => {
  const groups = publicationPartyGroups(STJ_TEXT);
  assert.deepEqual(groups.map(group => group.label), ['EMBARGANTE', 'EMBARGADO']);
  assert.deepEqual(groups[0].lawyers.map(lawyer => lawyer.name), ['ADVOGADA TESTE UM', 'ADVOGADO TESTE DOIS']);
  assert.deepEqual(groups[1].lawyers.map(lawyer => lawyer.uf), ['UF', 'UF']);
});

test('agrupa advogados por polo no formato POLO ATIVO/PASSIVO (PJe)', () => {
  const groups = publicationPartyGroups(PJE_TEXT);
  assert.deepEqual(groups.map(group => group.label), ['POLO ATIVO', 'POLO PASSIVO']);
  assert.deepEqual(groups[0].lawyers.map(lawyer => lawyer.oab), ['1']);
  assert.deepEqual(groups[1].lawyers.map(lawyer => lawyer.name), ['ADVOGADO ALHEIO', 'ADVOGADA ALHEIA', 'ADVOGADO ALHEIO TRES']);
});

test('lado do escritorio e o polo que contem a inscricao monitorada', () => {
  const side = officeSideLawyers({ text: EPROC_TEXT }, { oabKeys: keys });
  assert.ok(side);
  assert.deepEqual(side.map(lawyer => lawyer.name), ['ADVOGADA TESTE UM', 'ADVOGADO TESTE DOIS']);
  assert.ok(!side.some(lawyer => lawyer.oab === '9'));
});

test('lado do escritorio funciona nos formatos STJ e PJe', () => {
  assert.deepEqual(
    (officeSideLawyers({ text: STJ_TEXT }, { oabKeys: keys }) || []).map(lawyer => lawyer.name),
    ['ADVOGADA TESTE UM', 'ADVOGADO TESTE DOIS']
  );
  assert.deepEqual(
    (officeSideLawyers({ text: PJE_TEXT }, { oabKeys: keys }) || []).map(lawyer => lawyer.name),
    ['ADVOGADA TESTE UM']
  );
});

test('sem inscricao do escritorio no texto devolve null (mantem comportamento anterior)', () => {
  const withoutOurs = EPROC_TEXT.replace('ADVOGADA TESTE UM (OAB RS000001)', 'ADVOGADA TESTE UM (OAB RS000050)');
  assert.equal(officeSideLawyers({ text: withoutOurs }, { oabKeys: keys }), null);
  assert.equal(officeSideLawyers({ text: EPROC_TEXT }, { oabKeys: [] }), null);
});

test('texto sem advogados citados nao inventa grupos', () => {
  const text = 'RECLAMANTE: SINDICATO TESTE RECLAMADO: EMPRESA TESTE INTIMACAO Fica V. Sa. intimado.';
  assert.deepEqual(publicationPartyGroups(text), []);
  assert.equal(officeSideLawyers({ text }, { oabKeys: keys }), null);
});

test('inscricoes do escritorio ignoram placeholder e preservam termo e membro', () => {
  const result = officeOabKeys({
    terms: [
      { oabNumber: '', oabUf: '', registration: 'OAB/UF 000000' },
      { oabNumber: '000123', oabUf: 'RS' },
      { oabNumber: '999999', oabUf: 'RS', active: false }
    ],
    users: [{ oab: '0456', oabUf: 'SC' }]
  });
  assert.deepEqual(result.sort(), ['RS:123', 'SC:456']);
});

test('nomes formatados para exibicao', () => {
  const side = officeSideLawyers({ text: EPROC_TEXT }, { oabKeys: keys });
  assert.equal(formatLawyerNames(side), 'ADVOGADA TESTE UM, ADVOGADO TESTE DOIS');
  assert.equal(formatLawyerNames(side, { max: 1 }), 'ADVOGADA TESTE UM');
  assert.equal(formatLawyerNames(null), '');
});
