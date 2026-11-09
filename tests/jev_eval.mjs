import assert from 'node:assert/strict';
import { readFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EVAL_AREAS, baselineAreaOf, scoreRow, summarizeEval, baselineTaskRoute, baselineResearchVerdict, baselineCompletion, percentile, decisionDistribution, calibrationBuckets, confusionMatrix, unsafeProceedFastRate, unsafeAcceptRate, falseCompleteRate, outcomeOf, summarizeDecisions } from '../lib/jev-beta/eval.mjs';
import { runLiveTriage, runLiveTaskRouting, runLiveResearch, runLiveCompletion } from '../lib/jev-beta/eval-live.mjs';
import { main as runShadow } from '../scripts/jev-shadow.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

console.log('\n===============================================================');
console.log('  ATRIUM — JEV EVAL: SCORING + FIXTURES (PURE, NO NETWORK)');
console.log('===============================================================\n');

console.log('[E1] Scoring e resumo...');
{
  const rows = [
    scoreRow({ id: 'a', expected: 'civil', baselineArea: 'civil', jevLabel: 'civil', jevConfidence: 0.9, jevAction: 'suggest', baselineMs: 1, jevMs: 2000, inputTokens: 300, outputTokens: 40 }),
    scoreRow({ id: 'b', expected: 'criminal', baselineArea: 'trabalhista', jevLabel: 'criminal', jevConfidence: 0.7, jevAction: 'suggest', baselineMs: 1, jevMs: 2100, inputTokens: 310, outputTokens: 42 }),
    scoreRow({ id: 'c', expected: 'outro', baselineArea: 'outro', jevLabel: null, jevAction: 'abstain', baselineMs: 0, jevMs: 1900 })
  ];
  assert.equal(rows[0].baselineHit, true);
  assert.equal(rows[1].baselineHit, false);
  assert.equal(rows[1].jevHit, true);
  assert.equal(rows[2].jevAbstained, true);
  const summary = summarizeEval(rows);
  assert.equal(summary.total, 3);
  assert.ok(Math.abs(summary.baselineAccuracy - 2 / 3) < 1e-9);
  assert.ok(Math.abs(summary.jevAccuracy - 2 / 3) < 1e-9);
  assert.ok(Math.abs(summary.jevAbstentionRate - 1 / 3) < 1e-9);
  assert.ok(Math.abs(summary.avgConfidenceWhenCorrect - 0.8) < 1e-9);
  assert.equal(summary.avgConfidenceWhenWrong, 0);
  assert.equal(summary.totalInputTokens, 610);
  assert.equal(baselineAreaOf({ area: null }), 'outro');
  assert.equal(baselineAreaOf({ area: 'civil' }), 'civil');
  assert.equal(summarizeEval([]).total, 0);
}

console.log('[E2] Fixtures sintéticas, rotuladas e sem PII...');
{
  const cases = JSON.parse(readFileSync(path.join(ROOT, 'tests', 'fixtures', 'jev-eval-cases.json'), 'utf8'));
  assert.ok(cases.length >= 15, 'volume mínimo para leitura honesta');
  const ids = cases.map(item => item.id);
  assert.equal(new Set(ids).size, ids.length, 'ids únicos');
  for (const item of cases) {
    assert.ok(EVAL_AREAS.includes(item.expectedArea), `área válida em ${item.id}`);
    assert.ok(typeof item.text === 'string' && item.text.length > 20, `texto real em ${item.id}`);
    assert.ok(!/\d{3}\.\d{3}\.\d{3}-\d{2}/.test(item.text), `sem CPF em ${item.id}`);
    assert.ok(!/@/.test(item.text), `sem e-mail em ${item.id}`);
    assert.ok(!/\d{7}-\d{2}\.\d{4}/.test(item.text), `sem CNJ em ${item.id}`);
  }
  const areas = new Set(cases.map(item => item.expectedArea));
  assert.ok(areas.size >= 5, 'cobertura de áreas');
}

console.log('[E3] Baselines documentados, percentis, distribuição e calibração...');
{
  assert.equal(baselineTaskRoute({ taskType: 'x', objective: 'Excluir tudo', stakes: 'low' }), 'block');
  assert.equal(baselineTaskRoute({ taskType: 'x', objective: 'Ver lote de 40 documentos', stakes: 'low' }), 'split_task');
  assert.equal(baselineTaskRoute({ taskType: 'x', objective: 'Coisa simples', stakes: 'high' }), 'deep_review');
  assert.equal(baselineTaskRoute({ taskType: 'x', objective: 'Coisa simples', stakes: 'low' }), 'proceed_fast');
  assert.equal(baselineResearchVerdict({ claim: 'A', evidence: [] }), 'reject');
  assert.equal(baselineCompletion({ knownGaps: ['x'], verification: 'ok' }), 'verify_more');
  assert.equal(baselineCompletion({ knownGaps: [], verification: 'tudo certo' }), 'complete');
  assert.equal(percentile([], 0.5), 0);
  assert.equal(percentile([3, 1, 2], 0.5), 2);
  assert.equal(percentile([1, 2, 3, 4], 0.95), 4);
  assert.deepEqual(decisionDistribution([{ predicted: 'a' }, { predicted: 'a' }, { predicted: 'b' }]), { a: 2, b: 1 });
  const buckets = calibrationBuckets([
    { confidence: 0.5, hit: true, unsafe: false },
    { confidence: 0.95, hit: true, unsafe: false },
    { confidence: 0.95, hit: false, unsafe: true }
  ]);
  assert.equal(buckets.length, 4);
  assert.deepEqual(buckets[0], { id: '<0.60', n: 1, accuracy: 1, unsafe: 0 });
  assert.deepEqual(buckets[3], { id: '>=0.90', n: 2, accuracy: 0.5, unsafe: 1 });
  const matrix = confusionMatrix([{ expected: 'a', predicted: 'b' }, { expected: 'a', predicted: 'zzz' }], { labels: ['a', 'b'] });
  assert.equal(matrix.unknown, 1);
  assert.deepEqual(unsafeProceedFastRate([]), { rate: null, eligible: 0, predicted: 0, unavailable: 0 });
  assert.deepEqual(unsafeAcceptRate([]), { rate: null, eligible: 0, predicted: 0, unavailable: 0 });
  assert.deepEqual(falseCompleteRate([]), { rate: null, eligible: 0, predicted: 0, unavailable: 0 });
}

console.log('[E4] Datasets shadow: volume, diversidade e higiene...');
{
  const plans = [
    { file: 'jev-shadow-task-routing.json', min: 50, labels: ['proceed_fast', 'deep_review', 'split_task', 'block'], labelKey: 'expectedRoute', riskKey: 'highRisk' },
    { file: 'jev-shadow-research-evidence.json', min: 50, labels: ['accept', 'verify_more', 'reject'], labelKey: 'expectedVerdict', riskKey: 'shouldReject' },
    { file: 'jev-shadow-completion-review.json', min: 50, labels: ['complete', 'verify_more', 'incomplete'], labelKey: 'expectedConclusion', riskKey: 'hasGaps' }
  ];
  for (const plan of plans) {
    const content = readFileSync(path.join(ROOT, 'tests', 'fixtures', plan.file), 'utf8');
    const cases = JSON.parse(content);
    assert.ok(cases.length >= plan.min, `${plan.file}: mínimo ${plan.min}`);
    const ids = cases.map(item => item.id);
    assert.equal(new Set(ids).size, ids.length, `${plan.file}: ids únicos`);
    const counts = {};
    let risky = 0;
    for (const item of cases) {
      assert.ok(plan.labels.includes(item[plan.labelKey]), `${plan.file}: rótulo válido em ${item.id}`);
      counts[item[plan.labelKey]] = (counts[item[plan.labelKey]] || 0) + 1;
      if (item[plan.riskKey] === true) risky += 1;
      const blob = JSON.stringify(item);
      assert.ok(!/\d{3}\.\d{3}\.\d{3}-\d{2}/.test(blob), `${item.id} sem CPF`);
      assert.ok(!/@/.test(blob), `${item.id} sem e-mail`);
      assert.ok(!/\d{7}-\d{2}\.\d{4}/.test(blob), `${item.id} sem CNJ`);
    }
    for (const label of plan.labels) {
      assert.ok((counts[label] || 0) >= 3, `${plan.file}: rótulo ${label} com ao menos 3 exemplos`);
    }
    assert.ok(risky >= Math.floor(cases.length * 0.15), `${plan.file}: ao menos 15% de casos de risco`);
  }
}

console.log('[E5] Resultados live simulados e falhas não contam como sucesso...');
{
  const triage = await runLiveTriage([{ id: 'triage', text: 'Intimação sintética: ação de indenização por danos morais contra Empresa Alfa por cobrança indevida.', expectedArea: 'civil' }]);
  assert.equal(triage[0].baselineHit, true);
  assert.equal(triage[0].expected, 'civil');
  assert.equal(outcomeOf(triage[0], { mode: 'triage' }).answered, false);
  const task = [{ id: 'task', expectedRoute: 'deep_review', taskType: 'auditar', objective: 'Analisar risco', stakes: 'high', highRisk: true }];
  const fallback = await runLiveTaskRouting(task, { transport: { kind: 'mock' }, routeTaskImpl: async () => ({ route: 'deep_review', fallbackUsed: true, action: 'abstain' }) });
  assert.equal(fallback[0].baselineHit, true);
  assert.equal(fallback[0].predicted, null);
  assert.equal(summarizeDecisions(fallback).jevAccuracy, 0);
  assert.equal(summarizeDecisions(fallback).jevCoverage, 0);
  assert.deepEqual(unsafeProceedFastRate(fallback), { rate: null, eligible: 1, predicted: 0, unavailable: 1 });
  const failure = await runLiveTaskRouting(task, { transport: { kind: 'mock' }, routeTaskImpl: async () => { throw Object.assign(new Error('sensitive synthetic input'), { code: 'UNAVAILABLE' }); } });
  assert.equal(failure[0].predicted, null);
  assert.equal(failure[0].liveError, 'UNAVAILABLE');
  const research = await runLiveResearch([{ id: 'research', claim: 'Fato sintético', evidence: [], expectedVerdict: 'reject', shouldReject: true }], { transport: { kind: 'mock' }, checkResearchImpl: async () => ({ verdict: 'reject', noCall: true, action: 'reject' }) });
  assert.equal(research[0].predicted, null);
  assert.deepEqual(unsafeAcceptRate(research), { rate: null, eligible: 1, predicted: 0, unavailable: 1 });
  const completion = await runLiveCompletion([{ id: 'completion', objective: 'Revisar', expectedConclusion: 'verify_more', knownGaps: ['lacuna'], hasGaps: true }], { transport: { kind: 'mock' }, reviewCompletionImpl: async () => ({ conclusion: 'verify_more', fallbackUsed: true, action: 'abstain' }) });
  assert.equal(completion[0].predicted, null);
  assert.deepEqual(falseCompleteRate(completion), { rate: null, eligible: 1, predicted: 0, unavailable: 1 });
  const success = await runLiveTaskRouting(task, { transport: { kind: 'mock' }, routeTaskImpl: async () => ({ route: 'deep_review', confidence: 0.9, action: 'suggest', decision: { suggestion: {} } }) });
  assert.equal(summarizeDecisions(success).jevAccuracy, 1);
  assert.equal(summarizeDecisions(success).jevCoverage, 1);
  const abstained = scoreRow({ expected: 'civil', baselineArea: 'civil', jevLabel: 'civil', jevAction: 'review' });
  assert.equal(abstained.jevHit, false);
  assert.equal(summarizeEval([abstained]).jevCoverage, 0);
}

console.log('[E6] Artefato histórico opcional e bloqueio CLI antes de qualquer chamada...');
{
  const artifact = path.join(tmpdir(), 'jev-shadow-1790627047952');
  if (existsSync(path.join(artifact, 'summary.json'))) {
    for (const [name, expected] of [['task-routing', 0.8], ['research-evidence', 0.5714285714285714], ['completion-review', 0.7571428571428571]]) {
      const records = readFileSync(path.join(artifact, `shadow-${name}.jsonl`), 'utf8').trim().split(/\r?\n/).map(line => JSON.parse(line));
      assert.equal(records.length, 70);
      const derived = summarizeDecisions(records.map(row => ({ expected: row.expected, predicted: row.jev, fallbackUsed: row.fallbackUsed })));
      const stored = JSON.parse(readFileSync(path.join(artifact, 'summary.json'), 'utf8')).datasets[name];
      assert.ok(Math.abs(derived.jevAccuracy - expected) < 1e-10);
      assert.equal(derived.jevAccuracy, stored.accuracy);
    }
  }
  const outDir = mkdtempSync(path.join(tmpdir(), 'jev-shadow-offline-'));
  try {
    const offline = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'jev-shadow.mjs'), '--offline', '--dataset=publication-triage', '--limit=2', `--out=${outDir}`], { encoding: 'utf8' });
    assert.equal(offline.status, 0, offline.stderr);
    const summary = JSON.parse(readFileSync(path.join(outDir, 'summary.json'), 'utf8')).datasets['publication-triage'];
    const records = readFileSync(path.join(outDir, 'shadow-publication-triage.jsonl'), 'utf8').trim().split(/\r?\n/).map(line => JSON.parse(line));
    assert.equal(summary.accuracy, records.filter(row => row.hit).length / records.length);
    assert.equal(summary.coverage, 0);
    assert.equal(summary.accuracy, 0);
    assert.match(offline.stdout, /jevAcc=0/);
    assert.equal(records[0].baseline, 'civil');
    assert.equal(records[0].agreement, 'jev-unavailable');
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
  const env = { ...process.env, BETA_JEV_ENABLED: 'true', BETA_JEV_LIVE: 'true', BETA_JEV_AUTOMATIONS: 'false' };
  const blocked = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'jev-shadow.mjs'), '--dataset=task-routing', '--limit=1'], { env, encoding: 'utf8' });
  assert.notEqual(blocked.status, 0);
  assert.match(blocked.stderr, /Lote não autorizado/);
  env.BETA_JEV_AUTOMATIONS = 'true';
  for (const args of [['--dataset=task-routing'], ['--dataset=task-routing', '--limit=21'], ['--dataset=all', '--limit=7']]) {
    const result = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'jev-shadow.mjs'), ...args], { env, encoding: 'utf8' });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /20 itens|--limit/);
  }
  const mockOut = mkdtempSync(path.join(tmpdir(), 'jev-shadow-mock-'));
  let calls = 0;
  let output = '';
  const write = process.stdout.write;
  try {
    const runner = async cases => {
      calls += cases.length;
      return cases.map((item, index) => ({ id: item.id, expected: item.expectedRoute, predicted: index < 16 ? item.expectedRoute : null, baseline: 'deep_review', baselineHit: false, confidence: 0.9 }));
    };
    for (const flag of ['BETA_JEV_ENABLED', 'BETA_JEV_LIVE', 'BETA_JEV_AUTOMATIONS']) {
      await assert.rejects(runShadow(['--dataset=task-routing', '--limit=20', `--out=${mockOut}`], { env: { ...env, [flag]: 'false' }, runners: { 'task-routing': runner } }), /não autorizado/);
    }
    assert.equal(calls, 0);
    process.stdout.write = chunk => { output += chunk; return true; };
    await runShadow(['--dataset=task-routing', '--limit=20', `--out=${mockOut}`], { env, runners: { 'task-routing': runner } });
    assert.equal(calls, 20);
    const summary = JSON.parse(readFileSync(path.join(mockOut, 'summary.json'), 'utf8')).datasets['task-routing'];
    const records = readFileSync(path.join(mockOut, 'shadow-task-routing.jsonl'), 'utf8').trim().split(/\r?\n/).map(line => JSON.parse(line));
    assert.equal(summary.accuracy, 0.8);
    assert.equal(summary.accuracy, records.filter(row => row.hit).length / records.length);
    assert.match(output, /jevAcc=0\.8\n/);
    await assert.rejects(runShadow(['--dataset=all', '--limit=7', `--out=${mockOut}`], { env, runners: { 'task-routing': runner } }), /excede 20/);
    assert.equal(calls, 20);
  } finally {
    process.stdout.write = write;
    rmSync(mockOut, { recursive: true, force: true });
  }
  const evalBlocked = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'jev-eval.mjs'), '--live', '--limit=21'], { env, encoding: 'utf8' });
  assert.notEqual(evalBlocked.status, 0);
  assert.match(evalBlocked.stderr, /--limit/);
}

console.log('\n[PASS] Eval puro e bloqueios de lote verificados sem rede.\n');
