import assert from 'node:assert/strict';
import { formatPublicationLawyers, officeLawyerMatch, publicationLawyersList } from '../js/core/publication-lawyers.js';

console.log('\n=== ADVOGADOS DA PUBLICAÇÃO (FONTE OFICIAL) ===\n');

// Normalização defensiva: estrutura da fonte, dedupe por OAB/nome e teto.
const listed = publicationLawyersList({
  publicationLawyers: [
    { name: 'Advogada Teste', oab: '123456', uf: 'RS' },
    { name: 'Advogada Teste', oab: '123456', uf: 'RS' },
    { name: 'Advogado Sem Uf', oab: '654321', uf: '' },
    { name: 'Homônimo Sem OAB', oab: '', uf: '' },
    { name: '   ' },
    null,
    { name: 'Advogado Longo', oab: '9'.repeat(30), uf: 'rs' }
  ]
});
assert.deepEqual(listed, [
  { name: 'Advogada Teste', oab: '123456', uf: 'RS' },
  { name: 'Advogado Sem Uf', oab: '654321', uf: '' },
  { name: 'Homônimo Sem OAB', oab: '', uf: '' },
  { name: 'Advogado Longo', oab: '999999999999', uf: 'RS' }
]);
assert.deepEqual(publicationLawyersList({}), []);
assert.deepEqual(publicationLawyersList(null), []);
assert.deepEqual(publicationLawyersList({ publicationLawyers: 'texto legado' }), []);
console.log('✓ Lista estruturada normalizada, deduplicada e limitada.');

// Formatação para exibição/e-mail.
assert.equal(
  formatPublicationLawyers(listed.slice(0, 2)),
  'Advogada Teste (OAB/RS 123456) · Advogado Sem Uf (OAB/UF 654321)'
);
assert.equal(formatPublicationLawyers([{ name: 'Homônimo Sem OAB' }]), 'Homônimo Sem OAB');
assert.equal(formatPublicationLawyers([]), '');
console.log('✓ Formatação legível para a leitura e o e-mail.');

// Vínculo com o escritório: somente por inscrição OAB.
const users = [
  { id: 'u1', displayName: 'Advogada Teste', oab: '123456', oabUf: 'RS' },
  { id: 'u2', displayName: 'Outro Advogado', oab: '000000', oabUf: 'SP' }
];
assert.deepEqual(officeLawyerMatch(listed, users), { id: 'u1', displayName: 'Advogada Teste', oab: '123456', uf: 'RS' });
assert.equal(officeLawyerMatch([{ name: 'Advogada Teste' }], users), null, 'Nome sem OAB não é identidade suficiente.');
assert.equal(officeLawyerMatch([{ name: 'Advogada Teste', oab: '123456', uf: 'SP' }], users), null, 'UF divergente não vincula.');
assert.equal(officeLawyerMatch(listed, []), null);
assert.deepEqual(
  officeLawyerMatch([{ name: 'Advogado Sem Uf', oab: '000000' }], users),
  { id: 'u2', displayName: 'Outro Advogado', oab: '000000', uf: 'SP' },
  'Sem UF na publicação, a OAB basta.'
);
console.log('✓ Vínculo derivado por OAB, sem inferência por nome.');

console.log('\n>>> ADVOGADOS DA PUBLICAÇÃO: PASS <<<\n');
