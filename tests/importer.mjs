import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import ExcelJS from 'exceljs';
import { SecurityManager } from '../lib/security.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const temp = await mkdtemp(path.join(os.tmpdir(), 'jurisflow-import-test-'));
const sessionSecret = randomBytes(48).toString('base64url');
const encryptionKey = randomBytes(32).toString('base64');
const env = { ...process.env, JURISFLOW_DATA_DIR: temp, KELLER_DATA_DIR: temp, AUTH_SESSION_SECRET: sessionSecret, AUTH_ENCRYPTION_KEY: encryptionKey };

try {
  const contacts = path.join(temp, 'contatos.xlsx');
  const processes = path.join(temp, 'processos.xlsx');
  const activities = path.join(temp, 'atividades.xlsx');
  await workbook(contacts, ['Nome', 'CPF/CNPJ', 'E-mail', 'Celular'], [['Contato Teste', '00000000000', 'teste@example.invalid', '000000000']]);
  await workbook(processes, ['Nome do cliente', 'Número do processo', 'Tribunal', 'Último andamento'], [['Contato Teste', '0000000-00.2026.8.21.0000', 'TJRS', 'Movimento teste']]);
  await workbook(activities, ['Prioridade', 'Data', 'Hora', 'Compromisso', 'Destinatário', 'Processo (CNJ)', 'Pontuação'], [['Alta', '17/08/2026', '09:30', 'AGRAVO DE INSTRUMENTO', 'Advogado', '0000000-00.2026.8.21.0000', 90]]);

  await run(['scripts/import-spreadsheet.mjs', contacts, processes, activities]);
  await run(['scripts/import-spreadsheet.mjs', '--config-stdin'], JSON.stringify({ taskDefinitions: [{ name: 'AGRAVO DE INSTRUMENTO', points: 90 }], users: [{ name: 'Usuário Teste', role: 'Administrador' }] }) + '\n');

  const serialized = await readFile(path.join(temp, 'app-state.json'), 'utf8');
  assert.equal(serialized.includes('Contato Teste'), false, 'PII não pode aparecer em texto puro no arquivo de estado');
  const envelope = JSON.parse(serialized);
  const manager = new SecurityManager({ dataDirectory: temp, sessionSecret, encryptionKey, secureCookies: false });
  await manager.init();
  const state = JSON.parse(manager.decrypt(envelope.encrypted));
  assert.equal(state.contacts.length, 1);
  assert.equal(state.processes.length, 1);
  assert.equal(state.tasks.length, 1);
  assert.equal(state.agenda.length, 1);
  assert.equal(state.tasks[0].points, 90);
  assert.equal(state.tasks[0].fatalDeadline, '');
  assert.equal(state.configuration.taskDefinitions.length, 1);
  console.log('✓ Importador de Planilhas: XLSX, deduplicação, pontuação e criptografia validados.');
} finally {
  const resolved = path.resolve(temp);
  if (!resolved.startsWith(path.resolve(os.tmpdir()) + path.sep) || !path.basename(resolved).startsWith('jurisflow-import-test-')) throw new Error('Diretório temporário inesperado; limpeza cancelada.');
  await rm(resolved, { recursive: true, force: true });
}

async function workbook(file, headers, rows) {
  const book = new ExcelJS.Workbook(); const sheet = book.addWorksheet('Dados');
  sheet.addRow(headers); rows.forEach(row => sheet.addRow(row)); await book.xlsx.writeFile(file);
}

async function run(args, input = '') {
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { cwd: ROOT, env, stdio: ['pipe', 'pipe', 'pipe'] });
    let stderr = ''; child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', reject); child.on('exit', code => code === 0 ? resolve() : reject(new Error(stderr || `Importador encerrou com código ${code}`)));
    child.stdin.end(input);
  });
}
