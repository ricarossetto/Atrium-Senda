import assert from 'node:assert/strict';
import { djenCertificateUrl, renderDecisionToolbar } from '../js/views/ui-v2/publications-presenter.js';

const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const official = 'https://comunicaapi.pje.jus.br/api/v1/comunicacao/abcdefghijk1234567890/certidao';

assert.equal(djenCertificateUrl({ certificateUrl: official }), official);
assert.equal(djenCertificateUrl({ certificateUrl: 'https://evil.example.test/api/v1/comunicacao/abcdefghijk1234567890/certidao' }), '');
assert.equal(djenCertificateUrl({ certificateUrl: 'http://comunicaapi.pje.jus.br/api/v1/comunicacao/abcdefghijk1234567890/certidao' }), '');
assert.equal(djenCertificateUrl({ certificateUrl: 'javascript:alert(1)' }), '');
assert.equal(djenCertificateUrl({}), '');

const onlyCertificate = renderDecisionToolbar({ item: { title: 'Intimação Teste', certificateUrl: official }, escapeHtml });
assert.match(onlyCertificate, /Certidão da publicação \(PDF\)/);
assert.match(onlyCertificate, /target="_blank" rel="noopener noreferrer"/);
assert.doesNotMatch(onlyCertificate, /Decisão completa/);

const both = renderDecisionToolbar({ item: { title: 'Intimação Teste', hasHtml: true, rawHtml: '<p>x</p>', certificateUrl: official }, escapeHtml });
assert.match(both, /Decisão completa \(HTML\)/);
assert.match(both, /Certidão da publicação/);

assert.equal(renderDecisionToolbar({ item: { title: 'Sem documentos' }, escapeHtml }), '');
assert.equal(renderDecisionToolbar({ item: { title: 'Link estranho', certificateUrl: 'https://evil.example.test/x' }, escapeHtml }), '');

console.log('publication_certificate_link: ok');
