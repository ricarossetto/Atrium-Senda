import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { SecurityManager } from '../lib/security.mjs';

const ROOT = path.resolve('.');
const DATA_DIR = path.join(ROOT, 'data');
const APP_STATE_FILE = path.join(DATA_DIR, 'app-state.json');
const DOWNLOADS_EPROC = 'C:\\Users\\Ricardo PC\\Downloads\\eproc';

async function loadEnv() {
  if (!existsSync('.env')) return;
  const envContent = await readFile('.env', 'utf8');
  for (const line of envContent.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const idx = t.indexOf('=');
    if (idx > 0) {
      const k = t.slice(0, idx).trim();
      let v = t.slice(idx + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      process.env[k] = v;
    }
  }
}

await loadEnv();

// Script em python para extrair dados estruturados dos PDFs do Eproc
const pyExtractor = `
import os, pymupdf, re, json

folder = r'${DOWNLOADS_EPROC}'

# 1. Prazos em aberto
deadlines = []
p_prazos = os.path.join(folder, 'eproc - - Processos com prazo em aberto - 2026-09-08T19-58-17.pdf')
if os.path.exists(p_prazos):
    doc = pymupdf.open(p_prazos)
    for page_num in range(len(doc)):
        text = doc[page_num].get_text()
        matches = list(re.finditer(r'(\\d{7}-\\d{2}\\.\\d{4}\\.\\d\\.\\d{2}\\.\\d{4})', text))
        for i, m in enumerate(matches):
            cnj = m.group(1)
            start_idx = m.start()
            end_idx = matches[i+1].start() if i+1 < len(matches) else len(text)
            chunk = text[start_idx:end_idx]
            
            dates = re.findall(r'(\\d{2}/\\d{2}/\\d{4}(?:\\s*\\d{2}:\\d{2}:\\d{2})?)', chunk)
            autor_match = re.search(r'Autor\\s+([^\\n]+)', chunk)
            reu_match = re.search(r'R[eé]u\\s+([^\\n]+)', chunk)
            juizo_match = re.search(r'Ju[ií]zo:\\s*([^\\n]+)', chunk)
            classe_match = re.search(r'(PROCEDIMENTO[A-Z\\s]+|EXECU[A-Z\\s]+|A[CÇ][AÃ]O[A-Z\\s]+)', chunk)
            days_match = re.search(r'(\\d+)\\s+dias', chunk)
            
            # Limpeza das datas
            clean_dates = [d.replace('\\n', ' ').strip() for d in dates]
            
            deadlines.append({
                'cnj': cnj,
                'juizo': juizo_match.group(1).strip() if juizo_match else '',
                'autor': autor_match.group(1).strip() if autor_match else '',
                'reu': reu_match.group(1).strip() if reu_match else '',
                'classe': classe_match.group(1).strip() if classe_match else '',
                'dias': days_match.group(1).strip() if days_match else '',
                'dates': clean_dates,
                'startDate': clean_dates[1][:10] if len(clean_dates) > 1 else '',
                'endDate': clean_dates[-1][:10] if clean_dates else ''
            })

# 2. Intimacoes pendentes
pending = []
p_pending = os.path.join(folder, 'eproc - - Processos pendentes de citação intimação - 2026-09-08T19-58-35.pdf')
if os.path.exists(p_pending):
    doc = pymupdf.open(p_pending)
    for page_num in range(len(doc)):
        text = doc[page_num].get_text()
        matches = list(re.finditer(r'(\\d{7}-\\d{2}\\.\\d{4}\\.\\d\\.\\d{2}\\.\\d{4})', text))
        for i, m in enumerate(matches):
            cnj = m.group(1)
            start_idx = m.start()
            end_idx = matches[i+1].start() if i+1 < len(matches) else len(text)
            chunk = text[start_idx:end_idx]
            
            autor_match = re.search(r'(?:Autor|Requerente|Exequente)\\s+([^\\n]+)', chunk)
            reu_match = re.search(r'(?:R[eé]u|Requerido|Executado)\\s+([^\\n]+)', chunk)
            juizo_match = re.search(r'Ju[ií]zo:\\s*([^\\n]+)', chunk)
            classe_match = re.search(r'(PROCEDIMENTO[A-Z\\s]+|EXECU[A-Z\\s]+|Reconhecimento[A-Z\\s]+)', chunk)
            days_match = re.search(r'(\\d+)\\s+dias', chunk)
            dates = re.findall(r'(\\d{2}/\\d{2}/\\d{4})', chunk)
            
            pending.append({
                'cnj': cnj,
                'juizo': juizo_match.group(1).strip() if juizo_match else '',
                'autor': autor_match.group(1).strip() if autor_match else '',
                'reu': reu_match.group(1).strip() if reu_match else '',
                'classe': classe_match.group(1).strip() if classe_match else '',
                'dias': days_match.group(1).strip() if days_match else '',
                'sentDate': dates[0] if dates else ''
            })

# 3. Audiencia
hearings = [
    {
        'title': 'Audiência Futura de Conciliação - TJRS eproc',
        'date': '2026-09-10',
        'time': '17:11',
        'type': 'Audiência',
        'court': 'eproc 1G TJRS'
    }
]

# 4. Processos do relatorio (amostra de dados consolidados)
processes = []
p_rel = os.path.join(folder, 'eproc - - Relatório de Processos - 2026-09-08T19-59-40.pdf')
if os.path.exists(p_rel):
    doc = pymupdf.open(p_rel)
    text = '\\n'.join(p.get_text() for p in doc)
    cnj_matches = list(re.finditer(r'(\\d{7}-\\d{2}\\.\\d{4}\\.\\d\\.\\d{2}\\.\\d{4})', text))
    seen = set()
    for m in cnj_matches:
        c = m.group(1)
        if c not in seen:
            seen.add(c)
            processes.append({'number': c, 'origin': 'eproc-tjrs'})

print(json.dumps({'deadlines': deadlines, 'pending': pending, 'hearings': hearings, 'processesCount': len(processes)}, ensure_ascii=False))
`;

console.log('[1/4] Extraindo dados dos relatórios e painéis do eproc em:', DOWNLOADS_EPROC);
const extractedJson = execFileSync('python', ['-c', pyExtractor], { encoding: 'utf8' }).trim();
const extracted = JSON.parse(extractedJson);

console.log(`-> Prazos em aberto identificados: ${extracted.deadlines.length}`);
console.log(`-> Intimações pendentes identificadas: ${extracted.pending.length}`);
console.log(`-> Audiências identificadas: ${extracted.hearings.length}`);
console.log(`-> Processos únicos identificados: ${extracted.processesCount}`);

console.log('\n[2/4] Carregando e decifrando base de dados canônica do ATRIUM...');
const sec = new SecurityManager({
  dataDirectory: DATA_DIR,
  sessionSecret: process.env.AUTH_SESSION_SECRET,
  encryptionKey: process.env.AUTH_ENCRYPTION_KEY
});
await sec.init();
const raw = JSON.parse(await readFile(APP_STATE_FILE, 'utf8'));
const state = JSON.parse(sec.decrypt(raw.encrypted));

state.tasks = Array.isArray(state.tasks) ? state.tasks : [];
state.intimations = Array.isArray(state.intimations) ? state.intimations : [];
state.events = Array.isArray(state.events) ? state.events : [];
state.processes = Array.isArray(state.processes) ? state.processes : [];

const nowIso = new Date().toISOString();

console.log('\n[3/4] Ingerindo prazos em aberto como Tarefas/Prazos com contagem regressiva...');
let newTasks = 0;
for (const d of extracted.deadlines) {
  const taskId = `task-eproc-${d.cnj.replace(/\D/g, '')}-${d.endDate.replace(/\D/g, '') || 'prazo'}`;
  const existing = state.tasks.find(t => t.id === taskId || (t.process === d.cnj && t.deadline === d.endDate));
  
  // Converte data dd/mm/yyyy para yyyy-mm-dd
  let isoDeadline = '';
  if (d.endDate) {
    const parts = d.endDate.split('/');
    if (parts.length === 3) isoDeadline = `${parts[2]}-${parts[1]}-${parts[0]}`;
  }

  const existingProc = (state.processes || []).find(p => (p.number || '').replace(/\D/g, '') === d.cnj.replace(/\D/g, ''));
  const clientName = d.autor || existingProc?.client || '';
  const title = `Cumprir Prazo Processual (${d.dias ? `${d.dias} dias` : 'Fatal'}): ${d.cnj}`;
  const desc = `Juízo: ${d.juizo || 'Vara Cível'}\nClasse: ${d.classe || 'Procedimento Judicial'}\nPartes: ${d.autor || 'Autor'} X ${d.reu || 'Réu'}\nInício do Prazo: ${d.startDate || '—'}\nFinal do Prazo: ${d.endDate || '—'}`;

  if (!existing) {
    state.tasks.push({
      id: taskId,
      title,
      description: desc,
      process: d.cnj,
      client: clientName,
      deadline: isoDeadline || nowIso.slice(0, 10),
      status: 'pending',
      priority: isoDeadline === nowIso.slice(0, 10) ? 'high' : 'medium',
      responsible: 'Dr. Ricardo De Luca Rossetto',
      category: 'Prazo Judicial',
      source: 'eproc TJRS',
      metadata: {
        origin: 'eproc TJRS - Painel do Advogado',
        tags: ['eproc', 'prazo-judicial', 'tjrs']
      },
      createdAt: nowIso,
      updatedAt: nowIso
    });
    newTasks++;
  }

  // Registra também na coleção de intimações do eproc se não existir
  const intimationId = `int-eproc-${d.cnj.replace(/\D/g, '')}-${d.startDate.replace(/\D/g, '')}`;
  const existingInt = state.intimations.find(i => i.id === intimationId || (i.processNumber === d.cnj && i.date === d.startDate));
  if (!existingInt) {
    state.intimations.push({
      id: intimationId,
      processNumber: d.cnj,
      process: d.cnj,
      client: clientName,
      title: `Intimação com Prazo em Aberto (${d.dias || '15'} dias)`,
      court: d.juizo || 'TJRS · eproc 1º grau',
      source: 'eproc TJRS',
      date: d.startDate || nowIso.slice(0, 10),
      publishedAt: d.startDate || nowIso.slice(0, 10),
      deadlineAt: isoDeadline,
      status: 'nova',
      unread: true,
      text: desc,
      term: 'OAB/RS 135294',
      createdAt: nowIso
    });
  }
}
console.log(`-> ${newTasks} novo(s) prazo(s) registrado(s) em Tarefas/Prazos.`);

console.log('\n[3.1/4] Ingerindo intimações pendentes do eproc...');
let newIntimations = 0;
for (const p of extracted.pending) {
  const intId = `int-pendente-${p.cnj.replace(/\D/g, '')}-${(p.sentDate || '').replace(/\D/g, '')}`;
  const existing = state.intimations.find(i => i.id === intId || (i.processNumber === p.cnj && i.status === 'pendente_confirmacao'));
  if (!existing) {
    const existingProc = (state.processes || []).find(proc => (proc.number || '').replace(/\D/g, '') === p.cnj.replace(/\D/g, ''));
    state.intimations.push({
      id: intId,
      processNumber: p.cnj,
      process: p.cnj,
      client: p.autor || existingProc?.client || '',
      title: `Intimação Eletrônica Pendente de Ciência (${p.dias || '15'} dias)`,
      court: p.juizo || 'TJRS · eproc 1º grau',
      source: 'eproc TJRS',
      date: p.sentDate || nowIso.slice(0, 10),
      publishedAt: p.sentDate || nowIso.slice(0, 10),
      status: 'pendente_confirmacao',
      unread: true,
      text: `Juízo: ${p.juizo}\nClasse: ${p.classe}\nPartes: ${p.autor} X ${p.reu}\nExpedida/certificada a intimação eletrônica. Aguardando abertura de prazo no eproc.`,
      term: 'OAB/RS 135294',
      createdAt: nowIso
    });
    newIntimations++;
  }
}
console.log(`-> ${newIntimations} nova(s) intimação(ões) pendente(s) registrada(s).`);

console.log('\n[3.2/4] Ingerindo audiências do painel eproc na Agenda...');
let newEvents = 0;
for (const h of extracted.hearings) {
  const eventId = `event-eproc-audiencia-${h.date.replace(/\D/g, '')}-${h.time.replace(/\D/g, '')}`;
  const existing = state.events.find(e => e.id === eventId || (e.date === h.date && e.time === h.time));
  if (!existing) {
    state.events.push({
      id: eventId,
      title: h.title,
      date: h.date,
      time: h.time,
      type: 'audiencia',
      court: h.court,
      location: 'Sala Virtual / Balcão Virtual eproc TJRS',
      description: 'Audiência Futura de Conciliação agendada no eproc TJRS 1º Grau.',
      responsible: 'Dr. Ricardo De Luca Rossetto',
      status: 'confirmed',
      createdAt: nowIso,
      updatedAt: nowIso
    });
    newEvents++;
  }
}
console.log(`-> ${newEvents} novo(s) evento(s) de audiência registrado(s) na Agenda.`);

console.log('\n[4/4] Cifrando e salvando base de dados atualizada...');
raw.encrypted = sec.encrypt(JSON.stringify(state));
raw.updatedAt = nowIso;
await writeFile(APP_STATE_FILE, JSON.stringify(raw, null, 2), 'utf8');

console.log('\n' + '='.repeat(80));
console.log(' SINCRONIZAÇÃO DO PAINEL EPROC CONCLUÍDA COM SUCESSO!');
console.log('='.repeat(80));
console.log(`Total de Tarefas/Prazos na base: ${state.tasks.length}`);
console.log(`Total de Intimações na base:     ${state.intimations.length}`);
console.log(`Total de Eventos de Agenda:      ${state.events.length}`);
console.log(`Total de Processos na base:      ${state.processes.length}`);
console.log(`Total de Documentos de Autos:    ${state.documents.length}`);
console.log('='.repeat(80));
