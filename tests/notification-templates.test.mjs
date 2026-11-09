import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import {
  renderPublicationDigest,
  renderSinglePublication,
  renderDeadlineCritical,
  renderHearingNew,
  renderSyncFailed,
  renderA1CertExpiring,
  renderTestEmail,
  renderPasswordReset
} from '../lib/notifications/templates/email-templates.mjs';
import { serverSourceText } from './server-source.mjs';

function assertNoEmojis(text, context) {
  const emojiRegex = /[\u{1F300}-\u{1F6FF}\u{1F900}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
  assert.equal(emojiRegex.test(text), false, `Emoji detected in ${context}`);
}

const clock = '2026-10-08T11:05:00Z';
const bulletin = { day: '2026-10-08', slot: 8, periodLabel: 'Manhã', includeFullContext: true, noticeChanges: null };
const pubs = [
  { process: 'Processo Teste A', court: 'TRF4', county: 'Vara Teste', publishedAt: '2026-10-08', disponibilizadoEm: '2026-10-07', text: 'Intimação sintética para conferência.' },
  { process: 'Processo Teste B', court: 'TJRS', restricted: true, text: 'Texto secreto confidencial...', sourceText: 'TEOR SOB SEGREDO DE JUSTIÇA', fullText: 'ÍNTEGRA SOB SEGREDO DE JUSTIÇA', client: 'Cliente Sob Segredo' }
];
const pubDigest = renderPublicationDigest({ publications: pubs, bulletin, syncCompletedAt: clock });
assert.equal(pubDigest.subject, 'ATRIUM | Resumo da manhã — 08/10 — 2 publicações');
assert.match(pubDigest.html, /Publicações judiciais.*\(2\)/);
assert.match(pubDigest.html, /TRF4/);
assert.match(pubDigest.html, /Publicação com acesso restrito/);
for (const content of [pubDigest.html, pubDigest.text]) {
  assert.doesNotMatch(content, /Texto secreto confidencial|TEOR SOB SEGREDO|ÍNTEGRA SOB SEGREDO|Cliente Sob Segredo/);
  assert.match(content, /Acompanhamento não substitui fontes oficiais. Não constitui ciência judicial/);
  assertNoEmojis(content, 'Publication Digest');
}
assert.match(pubDigest.html, /Resumo preparado às 08:05 \(Brasília\)/);
assert.doesNotMatch(pubDigest.html, /Sincronização concluída|Soberano|Gestão Jurídica &amp;/);
assert.equal((pubDigest.html.match(/class="btn-cta"/g) || []).length, 1);
assert.match(pubDigest.html, /alt="ATRIUM"/);
assert.doesNotMatch(pubDigest.html, /<svg|display:\s*(flex|grid)|@import|fonts\.google/);
assert.match(pubDigest.html, /width="600"/);
assert.match(pubDigest.html, /Em resumo: 2 publicações/);

const fullTextDigest = renderPublicationDigest({ publications: [{
  id: 'pub-teste-integral',
  process: 'Processo Teste Íntegra',
  text: 'Resumo sintético da publicação.',
  fullText: 'TEOR COMPLETO SINTÉTICO. '.repeat(20),
  publishedAt: '2026-10-08'
}], syncCompletedAt: clock });
assert.match(fullTextDigest.html, /<details style=/);
assert.match(fullTextDigest.html, /Ver mais — íntegra da publicação/);
assert.match(fullTextDigest.html, /TEOR COMPLETO SINTÉTICO/);
assert.match(fullTextDigest.text, /Ver mais — íntegra da publicação:/);
assert.match(fullTextDigest.text, /TEOR COMPLETO SINTÉTICO/);
assert.match(fullTextDigest.html, /\/trabalho\/publicacoes\?publication=pub-teste-integral/);
assert.match(fullTextDigest.html, /Ver mais no ATRIUM/);
const entityDigest = renderPublicationDigest({ publications: [{
  id: 'pub-entidades',
  process: 'Processo Entidades',
  text: '<html><body><p>RECURSO N&ordm; 1 TIPO DE A&Ccedil;&Atilde;O</p></body></html>',
  fullText: `<html><body><p>${'TEOR &Oacute;RG&Atilde;O &Ccedil;&Atilde;O. '.repeat(8)}</p></body></html>`,
  fullTextSource: 'domicilio'
}], syncCompletedAt: clock });
assert.match(entityDigest.html, /RECURSO Nº 1 TIPO DE AÇÃO/);
assert.match(entityDigest.html, /TEOR ÓRGÃO ÇÃO/);
assert.doesNotMatch(entityDigest.html + entityDigest.text, /&ordm;|&Ccedil;|&Atilde;/);
const deniedFullText = renderPublicationDigest({ publications: [{ process: 'Processo Sem Acesso', text: 'Resumo sintético.', fullText: 'TEOR NEGADO SINTÉTICO '.repeat(20), allowFullText: false }], syncCompletedAt: clock });
assert.doesNotMatch(deniedFullText.html + deniedFullText.text, /TEOR NEGADO SINTÉTICO/);
assert.doesNotMatch(deniedFullText.html, /<details/);
const sealedFullText = renderPublicationDigest({ publications: [{ process: 'Processo Sigiloso', text: 'Resumo sintético.', fullText: 'TEOR SIGILOSO SINTÉTICO '.repeat(20), secrecy: true }], syncCompletedAt: clock });
assert.doesNotMatch(sealedFullText.html + sealedFullText.text, /TEOR SIGILOSO SINTÉTICO/);
assert.match(sealedFullText.html, /Publicação com acesso restrito/);
const hugeFullText = renderPublicationDigest({ publications: [{ process: 'Processo Extenso', text: 'Resumo sintético.', fullText: 'X'.repeat(50001) }], syncCompletedAt: clock });
assert.doesNotMatch(hugeFullText.html, /<details/);
assert.match(hugeFullText.html, /A íntegra é extensa/);

const privateDigest = renderPublicationDigest({ publications: [{ process: 'Processo Privado', scope: 'private', privateOwnerUserId: 'u-teste', fullText: 'TEOR PRIVADO SINTÉTICO' }], syncCompletedAt: clock });
assert.doesNotMatch(privateDigest.html + privateDigest.text, /TEOR PRIVADO SINTÉTICO/);
assert.match(privateDigest.html, /Publicação com acesso restrito/);
const noProcessDigest = renderPublicationDigest({ publications: [{ text: 'Resumo sem processo.', fullText: 'TEOR SEM PROCESSO. '.repeat(20) }], syncCompletedAt: clock });
assert.doesNotMatch(noProcessDigest.html + noProcessDigest.text, /TEOR SEM PROCESSO/);


for (const [slot, period, time] of [[8, 'manhã', '08:05'], [14, 'tarde', '14:05'], [20, 'noite', '20:05']]) {
  const result = renderPublicationDigest({ bulletin: { ...bulletin, slot }, syncCompletedAt: `2026-10-08T${String(slot + 3).padStart(2, '0')}:05:00Z` });
  assert.equal(result.subject, `ATRIUM | Resumo da ${period} — 08/10`);
  assert.match(result.text, new RegExp(`Resumo preparado às ${time}`));
  assert.match(result.text, /Nenhuma novidade ou alteração informada/);
  assert.doesNotMatch(result.html, /\(0\)|Sua agenda e seus prazos|Sincronização concluída/);
}
assert.equal(renderPublicationDigest({ syncCompletedAt: clock }).subject, 'ATRIUM | Resumo do dia — 08/10');
assert.equal(renderPublicationDigest({ syncCompletedAt: '2026-10-09T01:00:00Z' }).subject, 'ATRIUM | Resumo do dia — 08/10');

const movementDigest = renderPublicationDigest({ movements: [
  { process: 'Processo Teste A', client: 'Cliente Teste', date: '2026-10-08', source: 'DataJud', description: 'Decurso de prazo' },
  { process: 'Processo Teste B', date: '2026-10-08', source: 'PJe', description: 'Juntada de petição' }
], syncCompletedAt: clock });
assert.match(movementDigest.html, /Movimentações processuais.*\(2\)/);
assert.match(movementDigest.html, /Decurso de prazo/);
assert.match(movementDigest.html, /Cliente Teste/);
assertNoEmojis(movementDigest.html, 'Movement Digest');
const combinedDigest = renderPublicationDigest({ publications: pubs, movements: [{ process: 'Processo Teste A', source: 'TJRS', description: 'Petição protocolada' }], syncCompletedAt: clock });
assert.match(combinedDigest.html, /Publicações judiciais.*\(2\)/);
assert.match(combinedDigest.html, /Movimentações processuais.*\(1\)/);
assert.match(combinedDigest.html, /Petição protocolada/);
assert.match(combinedDigest.subject, /2 publicações/);
assert.match(combinedDigest.subject, /1 movimentação/);

const context = {
  agendaToday: [{ title: 'Audiência de instrução', time: '14:00', type: 'Audiência', process: 'Processo Teste A', client: 'Cliente Teste' }],
  agendaTomorrow: [{ title: 'Audiência de conciliação', time: '09:30', type: 'Audiência' }],
  deadlines: [{ title: 'Contrarrazões de apelação', date: '2026-10-09', fatal: true, process: 'Processo Teste B' }]
};
const contextDigest = renderPublicationDigest({ digestContext: context, bulletin, syncCompletedAt: clock });
assert.match(contextDigest.html, /compromissos de hoje/);
assert.match(contextDigest.html, /compromissos de amanhã/);
assert.match(contextDigest.html, /Prazos a vencer/);
assert.match(contextDigest.html, /Contrarrazões/);
assert.match(contextDigest.html, /PRAZO FATAL registrado/);
assert.match(contextDigest.text, /AMANHÃ/);
assert.match(contextDigest.html.match(/<h2[^>]*>[\s\S]*?<\/h2>/g)[0], /Prazos a vencer/);
assertNoEmojis(contextDigest.html, 'Context Digest');
const changedContext = { agendaToday: [{ title: 'Compromisso atualizado', time: '15:00' }], agendaTomorrow: [], deadlines: [] };
const delta = renderPublicationDigest({ bulletin: { ...bulletin, slot: 14, includeFullContext: false, noticeChanges: { changed: changedContext, removed: { deadlines: context.deadlines } } }, digestContext: context, syncCompletedAt: clock });
assert.match(delta.html, /Compromisso atualizado/);
assert.match(delta.html, /Prazos retirados deste resumo/);
assert.match(delta.html, /Não consta mais neste recorte/);
assert.doesNotMatch(delta.html, /Audiência de instrução|Audiência de conciliação|PRAZO FATAL registrado/);
assert.match(delta.text, /alterações desde o resumo anterior/);

const canonicalPub = { process: 'Processo Teste Oficial', source: 'eproc-tjrs-eproc-1g', court: 'TJRS', client: 'Cliente Teste Oficial', opposingParty: 'Parte Contrária Teste', sourceText: 'TEOR SINTÉTICO INTEGRAL DA PUBLICAÇÃO <b>não é html</b>', description: 'Descrição sintética do registro eproc.', sourceReportedDeadlineAt: '2026-10-10', sourceReportedDeadlineSource: 'domicilio' };
const canonicalDigest = renderPublicationDigest({ publications: [canonicalPub], syncCompletedAt: clock });
for (const content of [canonicalDigest.html, canonicalDigest.text]) {
  assert.match(content, /TEOR SINTÉTICO INTEGRAL DA PUBLICAÇÃO/);
  assert.doesNotMatch(content, /Sem conteúdo adicional/);
  assert.match(content, /Cliente Teste Oficial/);
  assert.match(content, /Parte Contrária Teste/);
  assert.match(content, /eproc · TJRS · 1º grau/);
  assert.match(content, /Referência da fonte \(Domicílio Eletrônico\): 10\/10\/2026/);
  assert.doesNotMatch(content, /Prazo fatal|Prazo registrado/);
}
assert.match(canonicalDigest.html, /&lt;b&gt;não é html&lt;\/b&gt;/);
assert.doesNotMatch(canonicalDigest.html, /<b>não é html<\/b>/);
assertNoEmojis(canonicalDigest.html, 'Canonical Publication');
assert.match(renderSinglePublication({ publication: canonicalPub }).text, /Cliente Teste Oficial/);

const deadline = renderDeadlineCritical({ task: { title: 'Contestação cível', process: 'Processo Teste', fatalDeadline: '2026-10-10' }, hoursRemaining: 48 });
assert.match(deadline.subject, /Prazo crítico/);
assert.match(deadline.html, /Contestação cível/);
assert.match(deadline.html, /~48 horas restantes/);
assert.match(deadline.text, /PRAZO FATAL registrado: 10\/10\/2026/);
assertNoEmojis(deadline.html, 'Deadline');
const hearing = renderHearingNew({ hearing: { title: 'Audiência de Conciliação', process: 'Processo Teste', courtUnit: 'CEJUSC Teste', date: '2026-10-10', time: '14:30' } });
assert.match(hearing.subject, /Nova audiência designada/);
assert.match(hearing.html, /Audiência de Conciliação/);
assert.match(hearing.html, /14:30/);
assertNoEmojis(hearing.html, 'Hearing');
const syncFailed = renderSyncFailed({ failures: [{ portal: 'tjrs-eproc-1g', category: 'SECRET_PROVIDER_ERROR token=synthetic' }] });
assert.match(syncFailed.subject, /Sincronização requer atenção/);
assert.match(syncFailed.html, /eproc · TJRS · 1º grau/);
assert.doesNotMatch(syncFailed.html + syncFailed.text, /SECRET_PROVIDER_ERROR|token=|concluída/);
assertNoEmojis(syncFailed.html, 'Sync Failed');
const a1 = renderA1CertExpiring({ holder: 'Titular Teste', documentMasked: '***.***.***-**', notAfter: '2026-10-14', milestoneDays: 30 });
assert.match(a1.subject, /Certificado Digital A1 vence em 30 dia\(s\)/);
assert.match(a1.html, /Titular Teste/);
assert.match(a1.html, /\*\*\*\.\*\*\*\.\*\*\*-\*\*/);
assertNoEmojis(a1.html, 'A1');
const testMail = renderTestEmail({ recipient: 'teste@example.test' });
assert.match(testMail.subject, /Teste do sistema de notificações/);
assert.match(testMail.html, /teste@example.test/);
assert.doesNotMatch(testMail.html, /Conectividade.*confirmada|ciência judicial/);
assertNoEmojis(testMail.html, 'Test Email');

const mixed = renderPublicationDigest({ publications: [canonicalPub], movements: [{ process: 'Processo Teste', source: 'DataJud', description: 'Juntada sintética' }], hearings: [{ title: 'Audiência Teste', date: '2026-10-09', time: '10:00' }], events: [
  { event_type: 'PUBLICATION_NEW', payload: canonicalPub },
  { event_type: 'DEADLINE_CRITICAL', payload: { title: 'Prazo manual', deadline: '2026-10-09' } },
  { event_type: 'SYNC_FAILED', payload: { failures: [{ portal: 'tjrs-eproc-1g', category: 'SECRET_PROVIDER_ERROR' }] } },
  { event_type: 'A1_CERT_EXPIRING', payload: { holder: 'SECRET_HOLDER', notAfter: '2026-10-14' } }
], bulletin, syncCompletedAt: clock });
assert.match(mixed.html, /Prazo manual|Certificados A1/);
assert.match(mixed.html, /Integrações que requerem atenção/);
assert.match(mixed.html, /Novas audiências/);
assert.match(mixed.html, /14\/10\/2026/);
assert.equal((mixed.html.match(/TEOR SINTÉTICO INTEGRAL/g) || []).length, 1);
assert.doesNotMatch(mixed.html + mixed.text, /SECRET_PROVIDER_ERROR|SECRET_HOLDER/);
assert.ok(mixed.html.indexOf('Alertas de prazo') < mixed.html.indexOf('Publicações judiciais'));

const attack = '<img src=x onerror="attack()">\r\nInjected: test';
for (const field of ['process', 'court', 'county', 'publishedAt', 'disponibilizadoEm', 'actionClass', 'term', 'client', 'opposingParty', 'lawyers', 'sourceText', 'fullText', 'sourceReportedDeadlineAt']) {
  const result = renderPublicationDigest({ publications: [{ [field]: attack }], syncCompletedAt: clock });
  assert.doesNotMatch(result.html, /<img src=x/);
  assert.match(result.html, /&lt;img/);
  assert.doesNotMatch(result.subject, /[\r\n]/);
}
for (const url of ['javascript:attack()', 'data:text/html,test', 'https://user:password@example.test', 'https://example.test/\r\nheader']) {
  const result = renderPublicationDigest({ publications: [{ link: url }], movements: [{ link: url }], baseUrl: url, syncCompletedAt: clock });
  assert.doesNotMatch(result.html, /href="(?:javascript:|data:|https:\/\/user:)/);
  assert.match(result.html, /href="https:\/\/atrium\.adv\.br"/);
}
assert.doesNotMatch(renderDeadlineCritical({ task: { title: 'Teste\rInjected\nHeader' }, hoursRemaining: attack }).subject, /[\r\n]/);
assert.doesNotMatch(renderDeadlineCritical({ hoursRemaining: attack }).html, /<img src=x/);
assert.doesNotMatch(renderA1CertExpiring({ milestoneDays: attack }).subject, /[\r\n]/);
const safeBase = renderPublicationDigest({ baseUrl: 'https://office.example.test/app?token=synthetic#secret', syncCompletedAt: clock });
assert.match(safeBase.html, /src="https:\/\/atrium\.adv\.br\/assets\/icons\/atrium-logo-email\.png"/);
assert.match(safeBase.html, /href="https:\/\/office\.example\.test\/#publications"|href="https:\/\/office\.example\.test"/);
assert.doesNotMatch(safeBase.html + safeBase.text, /token=|#secret/);

const resetUrl = 'https://office.example.test/?resetToken=synthetic-only&flow=reset';
const reset = renderPasswordReset({ displayName: attack, resetUrl, baseUrl: 'https://office.example.test', expiresMinutes: 30 });
assert.match(reset.html, /resetToken=synthetic-only&amp;flow=reset/);
assert.match(reset.text, /resetToken=synthetic-only&flow=reset/);
assert.match(reset.html, /uma única vez|30 minutos|proteção em duas etapas/);
assert.doesNotMatch(reset.html, /ciência judicial|<img src=x/);
assert.equal((reset.html.match(/class="btn-cta"/g) || []).length, 1);
for (const url of ['javascript:attack()', 'https://other.example.test/?resetToken=synthetic']) {
  const invalid = renderPasswordReset({ resetUrl: url, baseUrl: 'https://office.example.test' });
  assert.doesNotMatch(invalid.html, /class="btn-cta"|href="javascript:|resetToken=/);
  assert.match(invalid.html, /Link indisponível/);
}
const canonicalResetUrl = 'https://office.example.test/login#reset=synthetic_single_use_token';
const canonicalReset = renderPasswordReset({ displayName: 'Advogada Teste', resetUrl: canonicalResetUrl });
assert.ok(canonicalReset.text.includes(canonicalResetUrl));
assert.ok(canonicalReset.html.includes(`href="${canonicalResetUrl}"`));
assert.match(canonicalReset.html, /sua senha atual continua válida|invalida os anteriores/);
const capped = renderPublicationDigest({ publications: Array.from({ length: 12 }, (_, index) => ({ process: `Processo Teste ${index}`, text: 'Texto sintético '.repeat(100) })), syncCompletedAt: clock });
assert.match(capped.html, /Publicações judiciais.*\(12\)/);
assert.match(capped.html, /Exibindo 8 de 12/);
assert.doesNotMatch(capped.html, /Processo Teste 8/);
assert.ok(capped.html.length < 30000);
const png = await readFile(new URL('../assets/icons/atrium-logo-email.png', import.meta.url));
assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
assert.equal(png.readUInt32BE(16), 960);
assert.equal(png.readUInt32BE(20), 240);
assert.ok((await stat(new URL('../assets/icons/atrium-logo-email.png', import.meta.url))).size < 50000);
const server = serverSourceText;
assert.match(server, /publicDirectories = .*'assets\/icons\/'/);
assert.match(server, /'\.png': 'image\/png'/);
for (const [source, label] of [['jfrs-eproc-1g', 'eproc · JFRS · 1º grau'], ['pje-tjmt-2g', 'PJe · TJMT · 2º grau'], ['pje-trf5', 'PJe · TRF5'], ['pje-cnj-pjecor', 'PJe · CNJ · Corregedoria']]) {
  const result = renderPublicationDigest({ publications: [{ source }], syncCompletedAt: clock });
  assert.ok(result.html.includes(label));
  assert.ok(!result.text.includes(source));
}
const unknownFailure = renderSyncFailed({ failures: [{ portal: 'token=synthetic-secret', name: 'private-key=synthetic-secret', category: attack }] });
assert.doesNotMatch(unknownFailure.html + unknownFailure.text, /synthetic-secret|private-key=|token=|attack/);
assert.match(unknownFailure.html, /Fonte judicial/);
const internalLinks = renderPublicationDigest({ publications: [{ link: 'https://source.example.test/?token=synthetic-secret' }], movements: [{ link: 'https://source.example.test/?secret=synthetic-secret' }], syncCompletedAt: clock });
assert.doesNotMatch(internalLinks.html + internalLinks.text, /synthetic-secret|source\.example/);
assert.match(internalLinks.html, /href="https:\/\/atrium\.adv\.br\/trabalho\/publicacoes"/);
assert.match(internalLinks.html, /href="https:\/\/atrium\.adv\.br\/#processes"/);
assert.match(internalLinks.html, />Ver no ATRIUM<\/a>/);
const dateBoundary = renderPublicationDigest({ publications: [{ publishedAt: '2026-10-09T01:00:00Z' }], syncCompletedAt: clock });
assert.match(dateBoundary.text, /Publicação: 08\/10\/2026/);
assert.ok(mixed.html.indexOf('Novas audiências') < mixed.html.indexOf('Integrações que requerem atenção'));
const noContextReplay = renderPublicationDigest({ bulletin: { ...bulletin, includeFullContext: false, noticeChanges: null }, digestContext: { deadlines: [], agendaToday: [], agendaTomorrow: [] }, publications: [{ text: 'Novidade Teste' }], syncCompletedAt: clock });
assert.doesNotMatch(noContextReplay.html, /Contrarrazões|Audiência de instrução/);
console.log('PASS notification templates: identity, slots, context delta, privacy, escaping, URLs, transactions and PNG.');
