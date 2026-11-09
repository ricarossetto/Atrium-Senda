import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  normalizeCalibrationStore,
  recordHumanCorrection,
  suggestionOverrideFor,
  applyOverridesToPublicSuggestion,
  applyOverridesToTriageEntry,
  calibrationBlockFor,
  calibrationStats,
  sanitizeCalibrationExcerpt,
  sanitizeCustomArea,
  registerCustomArea,
  findCustomArea,
  CALIBRATION_EXAMPLES_PER_QUESTION,
  CALIBRATION_MAX_EXAMPLES,
  CALIBRATION_MAX_CUSTOM_AREAS,
  CALIBRATION_CUSTOM_AREA_CHARS
} from '../lib/jev-beta/calibration.mjs';
import { serverSourceText } from './server-source.mjs';

console.log('--- Iniciando Testes Unitários: Calibração do JEV (aprendizado com correções humanas) ---');

const EXCERPT = 'Intimação — oferecida denúncia contra o denunciado pelos crimes do art. 33 da Lei 11.343/2006; audiência de custódia designada.';

// A) Correção humana vence o modelo e vira exemplo -----------------------------------------
{
  let store = normalizeCalibrationStore(null);
  const result = recordHumanCorrection(store, {
    schemaId: 'publication_triage',
    questionKey: 'area',
    label: 'criminal',
    modelLabel: 'outro',
    excerpt: EXCERPT,
    targetKey: 'intimation:eproc:123',
    actor: 'Dra. Teste',
    now: '2026-09-29T10:00:00.000Z'
  });
  assert.equal(result.changed, true);
  assert.ok(result.example, 'exemplo de calibração criado');
  store = result.store;

  const override = suggestionOverrideFor(store, 'publication_triage', 'intimation:eproc:123');
  assert.equal(override.questions.area, 'criminal');
  assert.equal(override.actor, 'Dra. Teste');

  const publicSuggestion = {
    schema: 'publication_triage',
    action: 'suggest',
    confidence: 0.4,
    suggestion: { area: { label: 'outro', confidence: 0.4 }, priority: { label: 'normal', confidence: 0.6 } }
  };
  const applied = applyOverridesToPublicSuggestion(publicSuggestion, override);
  assert.equal(applied.suggestion.area.label, 'criminal', 'rótulo humano vence');
  assert.equal(applied.suggestion.area.origin, 'humano');
  assert.equal(applied.suggestion.priority.label, 'normal', 'outras perguntas ficam como estavam');
  assert.equal(applied.origin, 'humano');
  assert.match(applied.reason, /corrigido por pessoa/i);

  const entry = applyOverridesToTriageEntry({ area: 'outro', areaConfidence: 0.4, priority: 'normal', priorityConfidence: 0.6 }, override);
  assert.equal(entry.area, 'criminal');
  assert.equal(entry.areaConfidence, 1);
  assert.equal(entry.areaOrigin, 'humano');
  assert.equal(entry.humanBy, 'Dra. Teste');
  assert.equal(entry.priority, 'normal');
  console.log('  OK: correção humana vence o modelo no painel e fica registrada com autoria.');
}

// B) Exemplo entra no bloco enviado ao modelo ---------------------------------------------
{
  let store = normalizeCalibrationStore(null);
  for (let index = 0; index < 3; index += 1) {
    store = recordHumanCorrection(store, {
      schemaId: 'publication_triage',
      questionKey: 'area',
      label: 'criminal',
      modelLabel: 'outro',
      excerpt: `${EXCERPT} (caso ${index})`,
      targetKey: `intimation:${index}`,
      actor: 'Dra. Teste',
      now: `2026-09-29T1${index}:00:00.000Z`
    }).store;
  }
  const block = calibrationBlockFor(store, 'publication_triage');
  assert.match(block, /CALIBRAÇÃO DO ESCRITÓRIO/);
  assert.match(block, /=> criminal/);
  assert.match(block, /modelo havia sugerido "outro"/);
  assert.equal(calibrationBlockFor(store, 'task_triage'), '', 'bloco é por esquema');
  console.log('  OK: correções viram exemplos no texto classificado, isoladas por esquema.');
}

// C) Sem PII e com poda --------------------------------------------------------------------
{
  assert.equal(sanitizeCalibrationExcerpt('CPF 123.456.789-00 do autor'), '', 'CPF bloqueia o trecho');
  assert.equal(sanitizeCalibrationExcerpt('contato advogado@escritorio.com.br'), '', 'e-mail bloqueia o trecho');
  assert.equal(sanitizeCalibrationExcerpt('OAB 12345/RS'), '', 'OAB bloqueia o trecho');
  assert.equal(sanitizeCalibrationExcerpt('Intimação de sentença de procedência.'), 'Intimação de sentença de procedência.');

  let store = normalizeCalibrationStore(null);
  const discard = recordHumanCorrection(store, {
    schemaId: 'publication_triage',
    questionKey: 'area',
    label: 'civil',
    excerpt: 'CPF 123.456.789-00',
    targetKey: 'x',
    actor: 'Teste'
  });
  assert.equal(discard.example, null, 'trecho sensível não é guardado');
  assert.equal(discard.reason, 'trecho-descartado');
  assert.equal(discard.store.examples.length, 0);
  assert.equal(suggestionOverrideFor(discard.store, 'publication_triage', 'x').questions.area, 'civil', 'override continua válido sem o exemplo');

  for (let index = 0; index < CALIBRATION_MAX_EXAMPLES + 25; index += 1) {
    store = recordHumanCorrection(store, {
      schemaId: 'publication_triage',
      questionKey: 'area',
      label: 'civil',
      excerpt: `Sentença ${index} publicada.`,
      targetKey: `t-${index}`,
      actor: 'Teste'
    }).store;
  }
  assert.equal(store.examples.length, CALIBRATION_MAX_EXAMPLES, 'store é podado no teto');
  const perQuestion = calibrationBlockFor(store, 'publication_triage').split('\n').filter(line => line.startsWith('- [area]'));
  assert.equal(perQuestion.length, CALIBRATION_EXAMPLES_PER_QUESTION, 'bloco limita exemplos por pergunta');
  const stats = calibrationStats(store);
  assert.equal(stats.examples, CALIBRATION_MAX_EXAMPLES);
  assert.equal(stats.overrides, CALIBRATION_MAX_EXAMPLES + 25);
  console.log('  OK: nada de PII entra no aprendizado; store e bloco respeitam os tetos.');
}

// D) Store é derivado e tolerante a lixo ---------------------------------------------------
{
  const store = normalizeCalibrationStore({
    examples: [{ schemaId: 'x!', questionKey: 'area', label: 'civil', excerpt: 'ok' }, { schemaId: 'publication_triage', questionKey: 'area', label: '', excerpt: 'ok' }],
    overrides: {
      'bad schema': { a: { questions: { area: 'civil' } } },
      publication_triage: {
        b: { questions: { 'bad key!': 'civil' } },
        c: { questions: { area: 'criminal' }, at: '2026-09-29T10:00:00.000Z', actor: 'Teste' }
      }
    }
  });
  assert.equal(store.examples.length, 0);
  assert.deepEqual(Object.keys(store.overrides), ['publication_triage'], 'schema inválido é descartado');
  assert.equal(store.overrides.publication_triage.b, undefined, 'alvo sem pergunta válida é descartado');
  assert.equal(store.overrides.publication_triage.c.questions.area, 'criminal', 'alvo válido permanece');
  console.log('  OK: store derivado descarta entradas inválidas sem quebrar.');
}

// E) Contrato da rota e do cliente ---------------------------------------------------------
{
  const routes = readFileSync(new URL('../lib/http/ai-classifier-routes.mjs', import.meta.url), 'utf8');
  const routeIndex = routes.indexOf("url.pathname === '/api/ai-classifier/correct'");
  assert.ok(routeIndex > 0, 'rota de correção existe');
  const block = routes.slice(routeIndex, routeIndex + 6_000);
  assert.match(block, /assertAuthenticated\(req, true\)/, 'exige sessão e CSRF');
  assert.match(block, /question\.labels\.includes\(label\)/, 'valida o rótulo contra o esquema');
  assert.match(block, /redactedExcerptOf\(record\)/, 'trecho vem do acervo redigido, nunca do cliente');
  assert.match(routes, /calibrationBlockFor\(calibration, schemaId\)/, 'calibração entra no texto classificado');

  const server = serverSourceText;
  assert.match(server, /calibrationStore: \{ read: readCalibrationStore, write: saveCalibrationStore \}/, 'store derivado ligado no servidor');
  assert.match(server, /ai-calibration\.json/, 'arquivo derivado dedicado');

  const feature = readFileSync(new URL('../js/features/publications.js', import.meta.url), 'utf8');
  assert.match(feature, /correctAiClassifierLabel\(/, 'cliente envia a correção');
  assert.match(feature, /'\/api\/ai-classifier\/correct'/, 'rota correta no cliente');
  const presenter = readFileSync(new URL('../js/views/ui-v2/publications-presenter.js', import.meta.url), 'utf8');
  assert.match(presenter, /Corrigir área/, 'painel oferece a correção de área');
  assert.match(presenter, /conferida por você/, 'painel marca o rótulo conferido por pessoa');
  console.log('  OK: correção exige sessão, valida rótulo, usa trecho redigido e marca o humano na interface.');
}

// F) Áreas nomeadas pelo escritório ("Outra área" com nome) --------------------------------
{
  let store = normalizeCalibrationStore(null);
  const first = registerCustomArea(store, '  Direito   do consumidor ');
  assert.equal(first.area, 'Direito do consumidor', 'espaços normalizados e rótulo preservado');
  assert.equal(first.added, true);
  store = first.store;

  const again = registerCustomArea(store, 'direito do CONSUMIDOR');
  assert.equal(again.added, false, 'a mesma área não duplica');
  assert.equal(again.area, 'Direito do consumidor', 'o rótulo oficial é o primeiro registrado');
  store = again.store;

  const another = registerCustomArea(store, 'Cível empresarial');
  assert.equal(another.added, true, 'área nova entra');
  assert.equal(another.store.customAreas.length, 2);

  assert.equal(sanitizeCustomArea('ab'), '', 'nome curto demais é recusado');
  assert.equal(sanitizeCustomArea('   '), '', 'nome vazio é recusado');
  assert.equal(sanitizeCustomArea('Área\ncom\tcontrole'), 'Área com controle', 'caracteres de controle viram espaço');
  assert.equal(sanitizeCustomArea('x'.repeat(80)).length, CALIBRATION_CUSTOM_AREA_CHARS, 'nome respeita o teto de caracteres');

  const overcap = { customAreas: Array.from({ length: 40 }, (_, index) => `Área nomeada ${index}`) };
  assert.equal(normalizeCalibrationStore(overcap).customAreas.length, CALIBRATION_MAX_CUSTOM_AREAS, 'lista de áreas respeita o teto');

  const deduped = normalizeCalibrationStore({ customAreas: ['Direito do consumidor', 'direito DO consumidor', 'Cível empresarial'] });
  assert.deepEqual(deduped.customAreas, ['Direito do consumidor', 'Cível empresarial'], 'normalização deduplica sem caixa/acento');

  assert.equal(findCustomArea(store, 'DIREITO DO CONSUMIDOR'), 'Direito do consumidor', 'busca sem caixa encontra o rótulo oficial');
  assert.equal(findCustomArea(store, 'área inexistente'), '', 'área não registrada não é encontrada');

  const corrected = recordHumanCorrection(store, {
    schemaId: 'publication_triage',
    questionKey: 'area',
    label: 'Direito do consumidor',
    targetKey: 'intimation:eproc:999',
    actor: 'Dra. Teste',
    now: '2026-09-30T12:00:00.000Z'
  });
  assert.deepEqual(corrected.store.customAreas, store.customAreas, 'a correção preserva as áreas registradas (FIFO de exemplos não as apaga)');

  const routes = readFileSync(new URL('../lib/http/ai-classifier-routes.mjs', import.meta.url), 'utf8');
  assert.match(routes, /registerCustomArea\(stored, customArea\)/, 'rota registra a área nomeada');
  assert.match(routes, /customAreas: customAreasOf\(correction\.store\)/, 'resposta devolve as áreas para o painel');
  assert.match(routes, /customAreas: calibration \? calibration\.customAreas : \[\]/, 'status alimenta os botões de área');
  assert.match(routes, /body\.custom === true/, 'área fora do vocabulário só entra por escolha explícita');
  const feature = readFileSync(new URL('../js/features/publications.js', import.meta.url), 'utf8');
  assert.match(feature, /customArea: true/, 'cliente declara a área nomeada');
  assert.match(feature, /aiClassifierCustomAreas = data\.customAreas\.map\(String\)/, 'cliente guarda as áreas devolvidas pelo servidor');
  const presenter = readFileSync(new URL('../js/views/ui-v2/publications-presenter.js', import.meta.url), 'utf8');
  assert.match(presenter, /aiClassifierCustomAreaInput/, 'painel oferece o campo para nomear a área');
  assert.match(presenter, /customAreas\.map\(area => optionButton\('area', area, area\)\)/, 'áreas nomeadas viram botões ao lado das fixas');
  console.log('  OK: área nomeada registrada, deduplicada e reutilizável como botão no painel.');
}

console.log('\n[PASS] Calibração do JEV validada.');
