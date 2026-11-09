import assert from 'node:assert/strict';
import test from 'node:test';
import {
  firstName,
  publicationInvolvedPeople,
  renderOfficeInvolved,
  taskInvolvedPeople,
  teamForPeople,
  teamForTask
} from '../js/core/office-involved.js';

const users = [
  { id: 'u1', username: 'ana', displayName: 'Dra. Ana Souza', oab: '12345', oabUf: 'RS', avatar: '' },
  { id: 'u2', username: 'bruno', displayName: 'Bruno Lima', oab: '67890', oabUf: 'RS' },
  { id: 'u3', username: 'carla', displayName: 'Carla Dias' }
];
const teams = [
  { id: 't1', name: 'Previdenciário', memberIds: ['u1', 'u2'] },
  { id: 't2', name: 'Cível', memberIds: ['u3'] }
];
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));

test('primeiro nome remove tratamento e preserva nome simples', () => {
  assert.equal(firstName('Dra. Ana Souza'), 'Ana');
  assert.equal(firstName('Ricardo de Luca Teste'), 'Ricardo');
  assert.equal(firstName(''), '');
});

test('tarefa resolve delegado e seguidores pelo diretório', () => {
  const people = taskInvolvedPeople({ assigneeUserId: 'u1', followerUserIds: ['u2', 'u2', 'ausente'] }, users);
  assert.deepEqual(people.map(person => person.id), ['u1', 'u2']);
  assert.deepEqual(taskInvolvedPeople({ responsible: 'Carla Dias' }, users).map(person => person.id), ['u3']);
  assert.deepEqual(taskInvolvedPeople({ responsible: 'Advogado Externo' }, users).map(person => person.displayName), ['Advogado Externo']);
  const processList = [{ id: 'p1', number: '5000000-00.2026.8.21.0001', responsibleUserIds: ['u3'], assignedTeamIds: ['t2'] }];
  assert.deepEqual(taskInvolvedPeople({ process: '5000000-00.2026.8.21.0001' }, users, processList).map(person => person.id), ['u3']);
  assert.equal(teamForTask({ process: '5000000-00.2026.8.21.0001' }, teams, processList)?.name, 'Cível');
  assert.deepEqual(taskInvolvedPeople({ process: '5000000-00.2026.8.21.0001' }, users, [{ number: '5000000-00.2026.8.21.0001', responsible: 'Carla Dias' }]).map(person => person.id), ['u3']);
  assert.deepEqual(taskInvolvedPeople({ intimationId: 'i-1' }, users, [], [{ id: 'i-1', publicationLawyers: [{ name: 'Dra. Ana Souza', oab: '12345', uf: 'RS' }] }]).map(person => person.id), ['u1']);
  assert.deepEqual(
    taskInvolvedPeople(
      { intimationId: 'eproc-1', process: '5000000-00.2026.8.21.0001' },
      users,
      [],
      [
        { id: 'eproc-1', process: '5000000-00.2026.8.21.0001' },
        { id: 'djen-1', process: '5000000-00.2026.8.21.0001', publishedAt: '2026-10-20', publicationLawyers: [{ name: 'Dra. Ana Souza', oab: '12345', uf: 'RS' }] }
      ]
    ).map(person => person.id),
    ['u1']
  );
  assert.deepEqual(taskInvolvedPeople({ responsible: 'Advogado' }, users), []);
});

test('publicação prioriza responsáveis do processo e cai para advogados por OAB', () => {
  const processes = [{ number: '5000000-00.2026.8.21.0001', responsibleUserIds: ['u2'] }];
  const byProcess = publicationInvolvedPeople({ process: '5000000-00.2026.8.21.0001', publicationLawyers: [{ name: 'Dra. Ana Souza', oab: '12345', uf: 'RS' }] }, { users, processes });
  assert.deepEqual(byProcess.map(person => person.id), ['u2']);
  const byLawyer = publicationInvolvedPeople({ process: '', publicationLawyers: [{ name: 'Dra. Ana Souza', oab: '12345', uf: 'RS' }] }, { users, processes, lawyers: [{ name: 'Dra. Ana Souza', oab: '12345', uf: 'RS' }] });
  assert.deepEqual(byLawyer.map(person => person.id), ['u1']);
  assert.deepEqual(publicationInvolvedPeople({ responsible: 'Ricardo Responsável' }, { users, processes }), [{ displayName: 'Ricardo Responsável' }]);
});

test('equipe é escolhida pela maior correspondência de membros', () => {
  assert.equal(teamForPeople(teams, [{ id: 'u1' }, { id: 'u2' }])?.name, 'Previdenciário');
  assert.equal(teamForPeople(teams, [{ id: 'u3' }])?.name, 'Cível');
  assert.equal(teamForPeople(teams, []), null);
});

test('bloco mostra avatar, primeiros nomes, separador e equipe com escape', () => {
  const html = renderOfficeInvolved({
    people: [{ ...users[0], displayName: 'Ana <Teste>', avatar: 'data:image/png;base64,AAA' }, users[1], users[2]],
    team: { name: 'Previdenciário & Saúde' },
    escapeHtml,
    iconSvg: name => `<svg data-icon="${name}"></svg>`
  });
  assert.match(html, /office-involved-avatars/);
  assert.match(html, /member-avatar-image/);
  assert.match(html, /Ana &lt;Teste&gt;/);
  assert.match(html, /Bruno/);
  assert.match(html, /\+1/);
  assert.match(html, /office-involved-divider/);
  assert.match(html, /Previdenciário &amp; Saúde/);
  assert.match(html, /data-icon="office"/);
  assert.ok(!html.includes('>Carla<'), 'terceiro nome fica no contador');
});

test('sem pessoas ou equipe não renderiza bolha vazia', () => {
  assert.equal(renderOfficeInvolved({ people: [], team: null, escapeHtml }), '');
});
