import assert from 'node:assert/strict';
import { decodeHtmlEntities, stripHtmlToText } from '../js/core/html-text.js';
import { publicationIdFromLocation } from '../js/core/routes.js';

console.log('\n===============================================================');
console.log('  ATRIUM - TEXTO DE PUBLICAÇÃO: ENTIDADES E DEEP LINK         ');
console.log('===============================================================\n');

const example = 'RECURSO DE MEDIDA CAUTELAR N&ordm; 5009754-74.2026.8.21.9000/RS TIPO DE A&Ccedil;&Atilde;O: CNH';
assert.equal(
  decodeHtmlEntities(example),
  'RECURSO DE MEDIDA CAUTELAR Nº 5009754-74.2026.8.21.9000/RS TIPO DE AÇÃO: CNH',
  'Entidades HTML 4 do PJe/Domicílio devem ser decodificadas.'
);
assert.equal(decodeHtmlEntities('&amp;ordm;'), 'º', 'Entidade duplamente codificada deve ser decodificada.');
assert.equal(decodeHtmlEntities('C&oacute;digo &Ecirc;xito &Uacute;nico'), 'Código Êxito Único');

const html = '<html><head><style>body{color:red}</style></head><body><p>Primeiro&nbsp;parágrafo</p><p>Segundo &Ccedil;&Atilde;O</p></body></html>';
const text = stripHtmlToText(html);
assert.equal(text.includes('<'), false, 'HTML não pode sobrar no texto.');
assert.equal(text.includes('Style'), false, 'Cabeçalho e estilo não entram no texto.');
assert.match(text, /Primeiro parágrafo/);
assert.match(text, /Segundo ÇÃO/);

assert.equal(stripHtmlToText('Prazo < 5 dias'), 'Prazo < 5 dias', 'Comparação matemática não é tag HTML.');

assert.equal(publicationIdFromLocation('?publication=domicilio%3A6774', ''), 'domicilio:6774');
assert.equal(publicationIdFromLocation('', '#inbox?publication=abc123'), 'abc123');
assert.equal(publicationIdFromLocation('?outra=1', '#inbox'), '');

console.log('V Entidades decodificadas, HTML reduzido a texto e deep link da publicação reconhecido.');
console.log('\n>>> TEXTO DE PUBLICAÇÃO: PASS <<<\n');
