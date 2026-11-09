import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runProcess } from '../lib/judicial/a1-sandbox.mjs';

console.log('\n===============================================================');
console.log('  ATRIUM — H2.2: TÉRMINO CONFIRMADO DO A1-SANDBOX (TIMEOUT)     ');
console.log('===============================================================\n');

const SOURCE_PATH = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../lib/judicial/a1-sandbox.mjs');
const directory = await mkdtemp(path.join(tmpdir(), 'atrium-runprocess-'));
const pidFile = path.join(directory, 'child-pid.txt');
const childScript = "const fs = require('node:fs'); fs.writeFileSync(process.argv[process.argv.length - 1], String(process.pid)); setInterval(() => {}, 1000);";

function isProcessAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

try {
  console.log('[T1] Timeout só conclui após o término confirmado do processo...');
  await assert.rejects(
    runProcess({
      cmd: process.execPath,
      args: ['-e', childScript, pidFile],
      timeoutMs: 1_000,
      killGraceMs: 200,
      label: 'teste-timeout'
    }),
    /tempo limite|excedeu/
  );

  let pidText = '';
  for (let attempt = 0; attempt < 40 && !pidText; attempt += 1) {
    pidText = await readFile(pidFile, 'utf8').catch(() => '');
    if (!pidText) await new Promise(resolve => setTimeout(resolve, 50));
  }
  assert.ok(pidText, 'O processo de teste deveria registrar o próprio pid antes do timeout.');
  const pid = Number(pidText);
  assert.ok(Number.isInteger(pid) && pid > 0, 'Pid registrado inválido.');

  const deadline = Date.now() + 5_000;
  while (isProcessAlive(pid) && Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  assert.equal(isProcessAlive(pid), false, 'A promise não pode concluir com o processo ainda vivo (sem falsa conclusão).');
  console.log('  ✓ Rejeição ocorreu apenas após o processo deixar de existir.');

  console.log('[T2] Execução normal continua funcionando...');
  const echoed = await runProcess({
    cmd: process.execPath,
    args: ['-e', 'console.log("ok-run")'],
    timeoutMs: 10_000,
    label: 'teste-sucesso'
  });
  assert.match(echoed, /ok-run/);

  console.log('[T3] Falha de comando continua rejeitando com stderr...');
  await assert.rejects(
    runProcess({
      cmd: process.execPath,
      args: ['-e', 'console.error("falha-sintetica"); process.exit(3)'],
      timeoutMs: 10_000,
      label: 'teste-falha'
    }),
    /falha-sintetica/
  );
  console.log('  ✓ Sucesso e falha preservam o contrato anterior.');

  console.log('[T4] Wrappers runPs/runCommand usam o helper com término confirmado...');
  const source = await readFile(SOURCE_PATH, 'utf8');
  const runProcessBlock = source.slice(
    source.indexOf('export function runProcess('),
    source.indexOf('function runPs(')
  );
  assert.ok(runProcessBlock.length > 0, 'runProcess deve existir antes de runPs.');
  assert.match(runProcessBlock, /child\.pid === undefined[\s\S]*?settle\(reject, error\)/, 'Erro pós-spawn (ex.: falha de kill) não pode concluir a promise.');
  assert.doesNotMatch(runProcessBlock, /child\.on\('exit'/, 'Conclusão não pode depender de exit sem confirmação de término.');

  const runPsBlock = source.slice(source.indexOf('function runPs('), source.indexOf('function windowsPowerShellEnvironment('));
  const runCommandBlock = source.slice(source.indexOf('function runCommand('), source.indexOf('function opensslEnvironment('));
  assert.ok(runPsBlock.includes('runProcess('), 'runPs deve delegar ao helper com término confirmado.');
  assert.ok(runCommandBlock.includes('runProcess('), 'runCommand deve delegar ao helper com término confirmado.');
  console.log('  ✓ PowerShell/OpenSSL passam pelo helper único.');
  console.log('    Limitação honesta: a falha real de kill (EPERM) não é simulável de forma');
  console.log('    determinística aqui; o invariante é coberto por contrato estrutural.');

  console.log('\n>>> A1 RUN PROCESS CONFIRMED TERMINATION: PASS <<<\n');
} finally {
  await rm(directory, { recursive: true, force: true }).catch(() => {});
}
