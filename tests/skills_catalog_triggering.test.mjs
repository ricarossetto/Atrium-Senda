// ATRIUM - Gatilho das descriptions do catalogo de skills (contrato de triggering)
//
// Heuristica deterministica de regressao sobre o catalogo publicado
// (js/skills-data.js): cada description carrega gatilho de acionamento e frases
// de usuario sinteticas resolvem para a skill esperada por sobreposicao de
// termos. Limites declarados: isto NAO e avaliacao com modelo - cobre drift de
// texto, nao qualidade de acionamento em producao. Avaliacao com modelo e
// intencao futura, fora de escopo deste contrato.

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

console.log('\n===============================================================');
console.log('  ATRIUM - GATILHO DAS DESCRIPTIONS DO CATALOGO DE SKILLS      ');
console.log('===============================================================\n');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const catalogSource = await readFile(path.join(ROOT, 'js', 'skills-data.js'), 'utf8');
const moduleShim = { exports: {} };
new Function('module', 'exports', 'self', catalogSource)(moduleShim, moduleShim.exports, undefined);
const skills = moduleShim.exports;
assert.ok(Array.isArray(skills) && skills.length === 19, 'Catalogo deve ter 19 skills.');

const STOPWORDS = new Set([
  'a', 'o', 'as', 'os', 'um', 'uma', 'de', 'da', 'do', 'das', 'dos', 'em', 'no', 'na', 'nos', 'nas',
  'para', 'com', 'por', 'se', 'que', 'ao', 'aos', 'e', 'ou', 'mais', 'como', 'sobre', 'ate', 'ja',
  'meu', 'minha', 'the'
]);

function contentWords(text) {
  const normalized = String(text).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const words = new Set();
  for (const raw of normalized.split(/[^a-z]+/)) {
    if (raw.length < 3 || STOPWORDS.has(raw)) continue;
    const word = raw.length > 3 && raw.endsWith('s') ? raw.slice(0, -1) : raw;
    if (word.length >= 3 && !STOPWORDS.has(word)) words.add(word);
  }
  return words;
}

const wordSets = new Map(skills.map(skill => [skill.id, contentWords(`${skill.title} ${skill.description}`)]));

function overlapScore(phraseWords, skillWords) {
  if (phraseWords.size === 0) return 0;
  let hits = 0;
  for (const word of phraseWords) if (skillWords.has(word)) hits += 1;
  return hits / phraseWords.size;
}

console.log('[T1] Gatilho explicito de acionamento (skills ATRIUM)...');
const atriumSkills = skills.filter(skill => skill.source === 'atrium');
for (const skill of atriumSkills) {
  assert.match(skill.description, /\b(use|usar)\b/i,
    `${skill.id}: description sem gatilho explicito (Use quando/em/para/ao...).`);
}
console.log(`  ${atriumSkills.length}/${atriumSkills.length} skills ATRIUM com gatilho explicito (vendor Lex preservado verbatim, MIT).`);

console.log('[T2] Faixa de tamanho e unicidade de titulo/description...');
const seenTitles = new Set();
const seenDescriptions = new Set();
for (const skill of skills) {
  assert.ok(skill.description.length >= 60 && skill.description.length <= 480,
    `${skill.id}: description fora da faixa 60-480 caracteres.`);
  assert.ok(!seenTitles.has(skill.title), `${skill.id}: titulo duplicado no catalogo.`);
  assert.ok(!seenDescriptions.has(skill.description), `${skill.id}: description duplicada no catalogo.`);
  seenTitles.add(skill.title);
  seenDescriptions.add(skill.description);
}
console.log(`  ${skills.length}/${skills.length} descriptions em faixa e titulos/descriptions unicos.`);

console.log('[T3] Colisao de gatilho (sobreposicao de termos entre descriptions)...');
for (let i = 0; i < skills.length; i += 1) {
  for (let j = i + 1; j < skills.length; j += 1) {
    const left = wordSets.get(skills[i].id);
    const right = wordSets.get(skills[j].id);
    let intersection = 0;
    for (const word of left) if (right.has(word)) intersection += 1;
    const union = left.size + right.size - intersection;
    const jaccard = union === 0 ? 0 : intersection / union;
    assert.ok(jaccard <= 0.5,
      `${skills[i].id} x ${skills[j].id}: descriptions sobrepostas demais (jaccard ${jaccard.toFixed(2)}).`);
  }
}
console.log('  Nenhum par acima de 0.5 de sobreposicao de termos.');

console.log('[T4] Fixtures de frases de usuario resolvem para a skill esperada...');
const FIXTURES = [
  ['Quero orientacao sobre cumprimento de sentenca contra a Fazenda Publica com RPV e precatorio.', 'fazenda-publica-cumprimento'],
  ['Quero elaborar uma peca juridica com base nos documentos do processo.', 'legal-agent'],
  ['Estruturar uma peticao com base nos documentos e no processo.', 'legal-agent'],
  ['Quero uma revisao adversarial da minuta antes da entrega final.', 'legal-audit'],
  ['Redigir a peticao inicial a partir do plano aprovado.', 'legal-draft-br'],
  ['Redigir a peticao a partir do plano com estilo tecnico e objetivo.', 'legal-draft-br'],
  ['Extracao de fatos, paginas e cronologia dos autos judiciais em PDFs e scans.', 'legal-ingest'],
  ['Definir estrategia e estrutura da peca vinculando capitulos a fatos, fontes e pedidos antes da redacao.', 'legal-planner'],
  ['Preciso de pesquisa de jurisprudencia e legislacao para claims especificos da peca.', 'legal-research-br'],
  ['Houve alegacao de inercia e prescricao durante a execucao.', 'prescricao-intercorrente'],
  ['Avaliar beneficio por incapacidade com pericia e prova medica.', 'previdenciario-incapacidade'],
  ['Consultar indices de correcao monetaria e juros para calculo judicial.', 'calculadora-processual'],
  ['Analise de contrato com clausulas abusivas e riscos contratuais.', 'contrato-analyzer-br'],
  ['Monitoramento de publicacoes em diario oficial com prazos e intimacoes.', 'dje-monitor'],
  ['Validar precedentes e sumulas do STJ aplicaveis ao caso.', 'jurisprudencia-miner'],
  ['Analisar e resumir os autos mapeando pontos controvertidos da contestacao.', 'peticao-analyzer'],
  ['Redigir sentenca e decisao com fundamentacao e dispositivo no modelo FIRAC.', 'sentenca-judicial-br'],
  ['Avaliar a solidez argumentativa da tese contra a jurisprudencia do STF.', 'tese-juridica-validator'],
  ['Localizar o processo e as publicacoes no DJEN pelo numero CNJ e obter certidoes.', 'consulta-judicial-mcp'],
  ['Revisar e concluir o trabalho seguindo o Definition of Done e a aprovacao humana.', 'padroes-de-qualidade'],
  ['Analisar publicacoes pendentes do escritorio com analise operacional.', 'jev-data-analyzer'],
  ['Priorizar tarefas pela urgencia operacional.', 'jev-data-analyzer'],
  ['Analisar produtividade da equipe e distribuicao da carga.', 'jev-data-analyzer'],
  ['Conferir riscos processuais registrados.', 'jev-data-analyzer'],
  ['Preparar um plano de acao do escritorio.', 'jev-data-analyzer']
];
const covered = new Set(FIXTURES.map(([, id]) => id));
for (const skill of skills) {
  assert.ok(covered.has(skill.id), `${skill.id}: sem fixture de frase de usuario no contrato de gatilho.`);
}
for (const [phrase, expectedId] of FIXTURES) {
  const phraseWords = contentWords(phrase);
  let bestId = null;
  let bestScore = -1;
  let tie = false;
  for (const skill of skills) {
    const score = overlapScore(phraseWords, wordSets.get(skill.id));
    if (score > bestScore) { bestId = skill.id; bestScore = score; tie = false; }
    else if (score === bestScore) { tie = true; }
  }
  assert.ok(!tie, `Frase ambigua (empate) no catalogo: "${phrase}"`);
  assert.equal(bestId, expectedId,
    `Frase "${phrase}" resolvou para ${bestId} (esperado ${expectedId}).`);
}
console.log(`  ${FIXTURES.length}/${FIXTURES.length} fixtures corretas (argmax estrito).`);

console.log('\n>>> GATILHO DAS DESCRIPTIONS: PASS <<<\n');