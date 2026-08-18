import { createHash, randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import readline from 'node:readline';
import ExcelJS from 'exceljs';
import { SecurityManager } from '../lib/security.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
await loadEnv(path.join(ROOT, '.env'));
const DATA_DIR = path.resolve(process.env.JURISFLOW_DATA_DIR || process.env.KELLER_DATA_DIR || path.join(ROOT, 'data'));
const STATE_FILE = path.join(DATA_DIR, 'app-state.json');
const security = new SecurityManager({
  dataDirectory: DATA_DIR,
  sessionSecret: process.env.AUTH_SESSION_SECRET,
  encryptionKey: process.env.AUTH_ENCRYPTION_KEY,
  secureCookies: false
});
await security.init();

const emptyState = () => ({
  version: 1,
  terms: [{ id: 'term-principal', name: 'Dr(a). Advogado(a) Titular', registration: 'OAB/UF 000000', active: true, primary: true }],
  sources: [], intimations: [], tasks: [], processes: [], agenda: [], contacts: [], audit: [],
  configuration: {}, settings: { demoMode: false, calendarConfigured: false, collectorConfigured: false, dismissedBanner: false }
});

const mode = process.argv[2];
const state = await readState();
ensureShape(state);

if (mode === '--status') {
  console.log(JSON.stringify({
    contacts: state.contacts.length,
    processes: state.processes.length,
    tasks: state.tasks.length,
    agenda: state.agenda.length,
    configuration: Object.fromEntries(Object.entries(state.configuration).map(([key, entry]) => [key, Array.isArray(entry) ? entry.length : 0]))
  }));
} else if (mode === '--config-stdin') {
  const line = await readOneLine();
  const configuration = JSON.parse(line);
  if (!configuration || typeof configuration !== 'object' || Array.isArray(configuration)) throw new Error('Configuração inválida.');
  const count = Object.values(configuration).reduce((sum, entry) => sum + (Array.isArray(entry) ? entry.length : 0), 0);
  if (count > 5_000) throw new Error('Configuração excede o limite seguro.');
  state.configuration = configuration;
  for (const term of configuration.monitoredTerms || []) {
    const registration = asText(term.registration);
    upsert(state.terms, { id: makeId('term', registration || term.name), active: true, ...term }, 'registration');
  }
  for (const product of configuration.sourceProducts || []) {
    upsert(state.sources, {
      id: makeId('source', product.name), name: product.name, short: asText(product.name).slice(0, 3).toUpperCase(), method: product.channel || 'DJEN',
      status: product.status, lastCheck: null, detail: product.status === 'ok' ? 'Painel monitorado' : 'Reconexão necessária na origem'
    });
  }
  state.audit.unshift(audit('Configurações importadas', `${count} itens de configuração consolidados.`, 'Importador local'));
  await saveState(state);
  console.log(JSON.stringify({ ok: true, configurationItems: count }));
} else {
  const files = process.argv.slice(2).map(entry => path.resolve(entry));
  if (files.length === 0 || files.some(file => !existsSync(file))) throw new Error('Informe os arquivos XLSX para importação.');
  state.contacts = state.contacts.filter(item => item.source !== 'Planilha');
  state.processes = state.processes.filter(item => item.source !== 'Planilha');
  state.tasks = state.tasks.filter(item => item.source !== 'Planilha');
  state.agenda = state.agenda.filter(item => item.source !== 'Planilha');
  const counters = { contacts: 0, processes: 0, tasks: 0, agenda: 0 };
  for (const file of files) {
    const rows = await readWorkbook(file);
    const headers = new Set(Object.keys(rows[0] || {}));
    if (headers.has('CPF/CNPJ') && headers.has('Nome')) importContacts(rows, state, counters);
    else if ((headers.has('Número do processo') || headers.has('Processo')) && (headers.has('Nome do cliente') || headers.has('Cliente'))) importProcesses(rows, state, counters);
    else if (headers.has('Compromisso') || headers.has('Tarefa')) importActivities(rows, state, counters);
    else throw new Error(`Planilha não reconhecida: ${path.basename(file)}`);
  }
  state.settings.demoMode = false;
  state.audit.unshift(audit('Planilhas importadas', `${counters.contacts} contatos, ${counters.processes} processos e ${counters.tasks} atividades consolidados.`, 'Importador XLSX'));
  await saveState(state);
  console.log(JSON.stringify({ ok: true, ...counters }));
}

function importContacts(rows, s, counters) {
  for (const row of rows) {
    const name = asText(row.Nome || row.nome);
    if (!name) continue;
    upsert(s.contacts, {
      id: makeId('contact', name), name,
      document: asText(row['CPF/CNPJ'] || row.Documento || row.documento),
      mobile: asText(row.Celular || row.celular || row.Telefone || row.telefone),
      email: asText(row['E-mail'] || row.Email || row.email),
      city: asText(row.Cidade || row.cidade),
      state: asText(row.Estado || row.UF || row.uf),
      origin: 'Planilha', registeredAt: new Date().toISOString().slice(0, 10)
    }, 'name');
    counters.contacts++;
  }
}

function importProcesses(rows, s, counters) {
  for (const row of rows) {
    const number = asText(row['Número do processo'] || row.Processo || row.numero || row.cnj);
    const client = asText(row['Nome do cliente'] || row.Cliente || row.nome);
    if (!number && !client) continue;
    upsert(s.processes, {
      id: makeId('proc', number || client), number, client: client || 'Cliente não informado',
      court: asText(row.Tribunal || row['Órgão'] || row.comarca || 'TJ'),
      stage: asText(row.Fase || row.Etapa || 'Em andamento'),
      lastMovement: asText(row['Último andamento'] || row.ultimo_andamento || 'Importado via planilha'),
      lastMovementAt: new Date().toISOString().slice(0, 10), registeredAt: new Date().toISOString().slice(0, 10),
      monitoring: 'active', source: 'Planilha'
    }, 'number');
    counters.processes++;
  }
}

function importActivities(rows, s, counters) {
  for (const row of rows) {
    const title = asText(row.Compromisso || row.Tarefa || row.title || row.titulo);
    if (!title) continue;
    const processNum = asText(row['Processo (CNJ)'] || row.Processo || row.processo);
    const date = asText(row.Data || row.data || new Date().toISOString().slice(0, 10));
    const time = asText(row.Hora || row.hora || '09:00');
    const responsible = asText(row.Destinatário || row.Responsável || 'Advogado');
    const points = Number(row['Pontuação'] || row.Pontos || 0) || 0;
    upsert(s.tasks, {
      id: makeId('task', `${title}:${date}`), title, client: asText(row.Cliente || ''), process: processNum,
      deadline: date, fatalDeadline: '', responsible, points, status: 'triagem', source: 'Planilha',
      createdAt: new Date().toISOString()
    });
    upsert(s.agenda, {
      id: makeId('agenda', `${title}:${date}`), title, date, time, process: processNum,
      source: 'Planilha', client: asText(row.Cliente || '')
    });
    counters.tasks++;
    counters.agenda++;
  }
}

function asText(value) { return typeof value === 'string' ? value.trim() : value != null ? String(value).trim() : ''; }
function makeId(prefix, seed) { return `${prefix}-${createHash('sha256').update(String(seed || randomBytes(8).toString('hex'))).digest('hex').slice(0, 12)}`; }
function upsert(list, item, key = 'id') {
  const index = list.findIndex(r => r[key] && r[key] === item[key]);
  if (index >= 0) list[index] = { ...list[index], ...item };
  else list.unshift(item);
}
function audit(action, detail, actor = 'Sistema') { return { id: randomBytes(8).toString('hex'), at: new Date().toISOString(), action, detail, actor }; }
function ensureShape(value) {
  for (const key of ['terms', 'sources', 'intimations', 'tasks', 'processes', 'agenda', 'contacts', 'audit']) if (!Array.isArray(value[key])) value[key] = [];
  value.configuration ||= {};
  value.settings = { ...emptyState().settings, ...(value.settings || {}) };
  if (!value.terms.length) value.terms.unshift(emptyState().terms[0]);
}
async function readState() {
  try {
    const envelope = JSON.parse(await readFile(STATE_FILE, 'utf8'));
    return JSON.parse(security.decrypt(envelope.encrypted));
  } catch (error) {
    if (existsSync(STATE_FILE)) throw new Error('O estado criptografado não pôde ser lido.', { cause: error });
    return emptyState();
  }
}
async function saveState(value) {
  await mkdir(DATA_DIR, { recursive: true });
  const envelope = { version: 1, algorithm: 'aes-256-gcm', revision: randomBytes(18).toString('base64url'), encrypted: security.encrypt(JSON.stringify(value)), updatedAt: new Date().toISOString() };
  await writeFile(STATE_FILE, JSON.stringify(envelope, null, 2), { encoding: 'utf8', mode: 0o600 });
}
async function readOneLine() {
  const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity, terminal: false });
  for await (const line of rl) { rl.close(); return line; }
  throw new Error('Nenhuma configuração recebida.');
}
async function readWorkbook(file) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(file);
  const sheet = workbook.worksheets[0];
  const headers = sheet.getRow(1).values.slice(1).map(asText);
  const rows = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const item = {};
    headers.forEach((header, index) => { item[header] = cellValue(row.getCell(index + 1).value); });
    if (Object.values(item).some(entry => entry !== '')) rows.push(item);
  });
  return rows;
}
function cellValue(input) {
  if (input == null) return '';
  if (input instanceof Date) return input.toISOString();
  if (typeof input === 'object') {
    if ('result' in input) return cellValue(input.result);
    if ('text' in input) return asText(input.text);
    if (Array.isArray(input.richText)) return input.richText.map(part => part.text || '').join('');
  }
  return typeof input === 'number' ? input : asText(input);
}
async function loadEnv(file) {
  if (!existsSync(file)) return;
  const source = await readFile(file, 'utf8');
  for (const raw of source.split(/\r?\n/)) {
    const line = raw.trim(); if (!line || line.startsWith('#')) continue;
    const split = line.indexOf('='); if (split < 1) continue;
    const key = line.slice(0, split).trim(); let entry = line.slice(split + 1).trim();
    if ((entry.startsWith('"') && entry.endsWith('"')) || (entry.startsWith("'") && entry.endsWith("'"))) entry = entry.slice(1, -1);
    if (!(key in process.env)) process.env[key] = entry;
  }
}
