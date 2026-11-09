import assert from 'node:assert/strict';
import test from 'node:test';
import { findProcessForRecord, publicationLawyerMatches, recordInvolvesMember, userInvolvedInProcess } from '../js/core/office-involvement.js';
import { filterPublications } from '../js/features/publications.js';

const me = { id: 'usr-me', username: 'eu.teste', displayName: 'Advogada Teste', email: 'eu@example.test', oab: '123456', oabUf: 'RS' };
const teams = [{ id: 'team-1', memberIds: ['usr-me'] }];
const processes = [
  { id: 'proc-1', number: '5000001-00.2026.8.21.0001', responsibleUserIds: ['usr-me'] },
  { id: 'proc-2', number: '5000002-00.2026.8.21.0001', assignedTeamIds: ['team-1'] },
  { id: 'proc-3', number: '5000003-00.2026.8.21.0001', responsibleUserIds: ['usr-outro'] },
  { id: 'proc-4', number: '5000004-00.2026.8.21.0001', accessGrants: [{ userId: 'usr-me' }] },
  { id: 'proc-legado', number: '5000005-00.2026.8.21.0001', accessGrants: [{ userId: 'usr-me', expiresAt: '2099-12-31' }] },
  { id: 'proc-expirado', number: '5000006-00.2026.8.21.0001', accessGrants: [{ userId: 'usr-me', expiresAt: '2000-01-01' }] }
];

test('envolvimento no processo por responsável, equipe, concessão e nome', () => {
  assert.equal(userInvolvedInProcess(processes[0], me, teams), true);
  assert.equal(userInvolvedInProcess(processes[1], me, teams), true);
  assert.equal(userInvolvedInProcess(processes[2], me, teams), false);
  assert.equal(userInvolvedInProcess(processes[3], me, teams), true);
  assert.equal(userInvolvedInProcess(processes[4], me, teams), true, 'data legada futura vale até o fim do dia');
  assert.equal(userInvolvedInProcess(processes[5], me, teams), false, 'data legada passada expira');
  assert.equal(userInvolvedInProcess({ responsible: 'Advogada Teste' }, me, []), true);
  assert.equal(userInvolvedInProcess({ responsible: 'Outra Pessoa' }, me, []), false);
});

test('resolve o processo por id ou número CNJ', () => {
  assert.equal(findProcessForRecord({ processId: 'proc-2' }, processes)?.id, 'proc-2');
  assert.equal(findProcessForRecord({ process: '5000003-00.2026.8.21.0001' }, processes)?.id, 'proc-3');
  assert.equal(findProcessForRecord({ process: '0000000-00.2026.8.21.0000' }, processes), null);
});

test('publicação com OAB do membro conta como envolvimento', () => {
  assert.equal(publicationLawyerMatches({ publicationLawyers: [{ oab: '123456', uf: 'RS' }] }, me), true);
  assert.equal(publicationLawyerMatches({ publicationLawyers: [{ oab: '999999', uf: 'RS' }] }, me), false);
  assert.equal(recordInvolvesMember({ process: '5000001-00.2026.8.21.0001' }, processes, me, teams), true);
  assert.equal(recordInvolvesMember({ process: '5000003-00.2026.8.21.0001' }, processes, me, teams), false);
});

test('filtro de publicações "só processos em que atuo"', () => {
  const items = [
    { id: 'pub-processo', process: '5000001-00.2026.8.21.0001', publishedAt: '2026-10-01', treatmentStatus: 'untreated' },
    { id: 'pub-equipe', process: '5000002-00.2026.8.21.0001', publishedAt: '2026-10-01', treatmentStatus: 'untreated' },
    { id: 'pub-alheia', process: '5000003-00.2026.8.21.0001', publishedAt: '2026-10-01', treatmentStatus: 'untreated' },
    { id: 'pub-oab', process: '5000009-00.2026.8.21.0001', publicationLawyers: [{ oab: '123456', uf: 'RS' }], publishedAt: '2026-10-01', treatmentStatus: 'untreated' }
  ];
  const filtered = filterPublications(items, { filter: 'all', mineOnly: true, me, processes, teams }).map(item => item.id);
  assert.deepEqual(filtered.sort(), ['pub-equipe', 'pub-oab', 'pub-processo']);
  const all = filterPublications(items, { filter: 'all' }).map(item => item.id);
  assert.equal(all.length, 4);
});
