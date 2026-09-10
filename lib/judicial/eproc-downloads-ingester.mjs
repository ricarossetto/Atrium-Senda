import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';

export function parseBrDateToIso(str) {
  if (!str) return null;
  const s = String(str).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const match = s.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (match) {
    const [, day, month, year] = match;
    return `${year}-${month}-${day}`;
  }
  return null;
}

/**
 * Ingesta dados do painel do eproc a partir de PDFs exportados pelo advogado
 * (Prazos em aberto, Intimações pendentes, Relatório do acervo e Audiências)
 */
export function ingestEprocDownloadsIfPresent(target, options = {}) {
  const defaultFolder = process.platform === 'win32'
    ? path.join(process.env.USERPROFILE || 'C:\\', 'Downloads', 'eproc')
    : path.join(process.env.HOME || '/tmp', 'Downloads', 'eproc');
  const folder = options.folder || process.env.EPROC_DOWNLOADS_DIR || defaultFolder;
  if (!existsSync(folder)) {
    return { ok: true, skipped: true, reason: 'FOLDER_NOT_FOUND', imported: { tasks: 0, intimations: 0, events: 0 } };
  }

  let files;
  try {
    files = readdirSync(folder);
  } catch (err) {
    return { ok: false, error: err.message, imported: { tasks: 0, intimations: 0, events: 0 } };
  }

  const prazoPdf = files.find(f => /prazo\s+em\s+aberto/i.test(f) && f.endsWith('.pdf'));
  const pendentePdf = files.find(f => /pendente/i.test(f) && f.endsWith('.pdf'));
  const relatorioPdf = files.find(f => /relat[oó]rio\s+de\s+processos/i.test(f) && f.endsWith('.pdf'));

  if (!prazoPdf && !pendentePdf && !relatorioPdf) {
    return { ok: true, skipped: true, reason: 'NO_EPROC_PDFS', imported: { tasks: 0, intimations: 0, events: 0 } };
  }

  const pyScript = `
import os, pymupdf, re, json, sys

folder = sys.argv[1]
prazo_name = sys.argv[2] if len(sys.argv) > 2 and sys.argv[2] != 'none' else ''
pendente_name = sys.argv[3] if len(sys.argv) > 3 and sys.argv[3] != 'none' else ''
relatorio_name = sys.argv[4] if len(sys.argv) > 4 and sys.argv[4] != 'none' else ''

deadlines = []
if prazo_name:
    p = os.path.join(folder, prazo_name)
    if os.path.exists(p):
        doc = pymupdf.open(p)
        for page in doc:
            text = page.get_text()
            matches = list(re.finditer(r'(\\d{7}-\\d{2}\\.\\d{4}\\.\\d\\.\\d{2}\\.\\d{4})', text))
            for i, m in enumerate(matches):
                cnj = m.group(1)
                start_idx = m.start()
                end_idx = matches[i+1].start() if i+1 < len(matches) else len(text)
                chunk = text[start_idx:end_idx]
                dates = [d.replace('\\n', ' ').strip() for d in re.findall(r'(\\d{2}/\\d{2}/\\d{4}(?:\\s*\\d{2}:\\d{2}:\\d{2})?)', chunk)]
                autor = re.search(r'Autor\\s+([^\\n]+)', chunk)
                reu = re.search(r'R[eé]u\\s+([^\\n]+)', chunk)
                juizo = re.search(r'Ju[ií]zo:\\s*([^\\n]+)', chunk)
                classe = re.search(r'(PROCEDIMENTO[A-Z\\s]+|EXECU[A-Z\\s]+|A[CÇ][AÃ]O[A-Z\\s]+)', chunk)
                days = re.search(r'(\\d+)\\s+dias', chunk)
                deadlines.append({
                    'cnj': cnj,
                    'juizo': juizo.group(1).strip() if juizo else '',
                    'autor': autor.group(1).strip() if autor else '',
                    'reu': reu.group(1).strip() if reu else '',
                    'classe': classe.group(1).strip() if classe else '',
                    'dias': days.group(1).strip() if days else '',
                    'startDate': dates[1][:10] if len(dates) > 1 else (dates[0][:10] if dates else ''),
                    'endDate': dates[-1][:10] if dates else ''
                })

pending = []
if pendente_name:
    p = os.path.join(folder, pendente_name)
    if os.path.exists(p):
        doc = pymupdf.open(p)
        for page in doc:
            text = page.get_text()
            matches = list(re.finditer(r'(\\d{7}-\\d{2}\\.\\d{4}\\.\\d\\.\\d{2}\\.\\d{4})', text))
            for i, m in enumerate(matches):
                cnj = m.group(1)
                start_idx = m.start()
                end_idx = matches[i+1].start() if i+1 < len(matches) else len(text)
                chunk = text[start_idx:end_idx]
                autor = re.search(r'(?:Autor|Requerente|Exequente)\\s+([^\\n]+)', chunk)
                reu = re.search(r'(?:R[eé]u|Requerido|Executado)\\s+([^\\n]+)', chunk)
                juizo = re.search(r'Ju[ií]zo:\\s*([^\\n]+)', chunk)
                classe = re.search(r'(PROCEDIMENTO[A-Z\\s]+|EXECU[A-Z\\s]+|Reconhecimento[A-Z\\s]+)', chunk)
                days = re.search(r'(\\d+)\\s+dias', chunk)
                dates = re.findall(r'(\\d{2}/\\d{2}/\\d{4})', chunk)
                pending.append({
                    'cnj': cnj,
                    'juizo': juizo.group(1).strip() if juizo else '',
                    'autor': autor.group(1).strip() if autor else '',
                    'reu': reu.group(1).strip() if reu else '',
                    'classe': classe.group(1).strip() if classe else '',
                    'dias': days.group(1).strip() if days else '',
                    'sentDate': dates[0] if dates else ''
                })

processes = []
if relatorio_name:
    p = os.path.join(folder, relatorio_name)
    if os.path.exists(p):
        doc = pymupdf.open(p)
        seen = set()
        for page in doc:
            for m in re.finditer(r'(\\d{7}-\\d{2}\\.\\d{4}\\.\\d\\.\\d{2}\\.\\d{4})', page.get_text()):
                c = m.group(1)
                if c not in seen:
                    seen.add(c)
                    processes.append(c)

print(json.dumps({'deadlines': deadlines, 'pending': pending, 'processes': processes}, ensure_ascii=False))
`;

  let extracted;
  try {
    const rawOut = execFileSync('python', [
      '-c',
      pyScript,
      folder,
      prazoPdf || 'none',
      pendentePdf || 'none',
      relatorioPdf || 'none'
    ], { encoding: 'utf8', timeout: 30_000 });
    extracted = JSON.parse(rawOut.trim());
  } catch (pyErr) {
    console.warn('[eproc downloads ingester] Aviso ao ler PDFs:', pyErr.message);
    return { ok: false, error: pyErr.message, imported: { tasks: 0, intimations: 0, events: 0 } };
  }

  target.tasks = Array.isArray(target.tasks) ? target.tasks : [];
  target.intimations = Array.isArray(target.intimations) ? target.intimations : [];
  target.events = Array.isArray(target.events) ? target.events : [];
  target.processes = Array.isArray(target.processes) ? target.processes : [];

  const nowIso = new Date().toISOString();
  let importedTasks = 0;
  let importedIntimations = 0;
  let importedProcesses = 0;

  // 1. Processar Prazos em Aberto -> Tarefas e Intimações
  for (const d of extracted.deadlines || []) {
    const cnj = d.cnj;
    const cnjNorm = cnj.replace(/\D/g, '');
    const isoDeadline = parseBrDateToIso(d.endDate) || nowIso.slice(0, 10);
    const isoStart = parseBrDateToIso(d.startDate) || nowIso.slice(0, 10);
    const clientName = d.autor || 'Cliente do Escritório';
    const taskId = `task:eproc-panel:${cnjNorm}-${isoDeadline.replace(/\D/g, '')}`;

    const existingTask = target.tasks.find(t =>
      t.id === taskId ||
      ((t.process === cnj || (t.processNumber || '').replace(/\D/g, '') === cnjNorm) && (t.deadline === isoDeadline || t.fatalDeadline === isoDeadline))
    );

    if (!existingTask) {
      const isUrgent = isoDeadline <= nowIso.slice(0, 10);
      target.tasks.unshift({
        id: taskId,
        title: `Cumprir Prazo Processual (${d.dias ? `${d.dias} dias` : 'Fatal'}): ${cnj}`,
        description: `Juízo: ${d.juizo || 'Vara Cível'}\nClasse: ${d.classe || 'Procedimento Judicial'}\nPartes: ${d.autor || 'Autor'} X ${d.reu || 'Réu'}\nInício do Prazo: ${d.startDate || '—'}\nFinal do Prazo: ${d.endDate || '—'}`,
        process: cnj,
        processNumber: cnj,
        client: clientName,
        deadline: isoDeadline,
        fatalDeadline: isoDeadline,
        status: 'triagem', // Entrada & triagem do Kanban
        priority: isUrgent ? 'urgente' : 'high',
        responsible: options.responsible || 'Dr. Ricardo De Luca Rossetto',
        category: 'Prazo Judicial',
        source: 'eproc TJRS',
        metadata: {
          origin: 'eproc TJRS - Painel do Advogado',
          tags: ['eproc', 'prazo-judicial', 'tjrs']
        },
        createdAt: nowIso,
        updatedAt: nowIso
      });
      importedTasks++;
    }

    const intimationId = `intimation:eproc-panel:${cnjNorm}-${isoStart.replace(/\D/g, '')}`;
    const existingInt = target.intimations.find(i =>
      i.id === intimationId ||
      ((i.processNumber || i.process || '').replace(/\D/g, '') === cnjNorm && (i.date === isoStart || i.publishedAt === isoStart))
    );

    if (!existingInt) {
      target.intimations.unshift({
        id: intimationId,
        externalId: intimationId,
        processNumber: cnj,
        process: cnj,
        client: clientName,
        title: `Intimação com Prazo em Aberto (${d.dias || '15'} dias)`,
        court: d.juizo || 'TJRS · eproc 1º grau',
        source: 'eproc TJRS',
        date: isoStart,
        publishedAt: isoStart,
        deadline: isoDeadline,
        deadlineAt: isoDeadline,
        status: 'aberta',
        unread: true,
        text: `Juízo: ${d.juizo || 'Vara Cível'}\nClasse: ${d.classe || 'Procedimento Judicial'}\nPartes: ${d.autor || 'Autor'} X ${d.reu || 'Réu'}`,
        createdAt: nowIso
      });
      importedIntimations++;
    }

    // Auto-cadastra processo se ausente
    const procExists = target.processes.some(p => (p.number || '').replace(/\D/g, '') === cnjNorm);
    if (!procExists) {
      target.processes.unshift({
        id: `proc:eproc:${cnjNorm}`,
        number: cnj,
        title: `${clientName} — ${d.classe || 'Processo Judicial'} (TJRS)`,
        client: clientName,
        court: d.juizo || 'TJRS · eproc 1º grau',
        actionClass: d.classe || 'Procedimento Comum',
        status: 'ATIVO',
        source: 'eproc-tjrs',
        tags: ['eproc', 'tjrs', 'painel-advogado'],
        createdAt: nowIso,
        updatedAt: nowIso
      });
      importedProcesses++;
    }
  }

  // 2. Processar Intimações Pendentes de Ciência
  for (const p of extracted.pending || []) {
    const cnj = p.cnj;
    const cnjNorm = cnj.replace(/\D/g, '');
    const isoSent = parseBrDateToIso(p.sentDate) || nowIso.slice(0, 10);
    const intId = `intimation:eproc-pendente:${cnjNorm}-${isoSent.replace(/\D/g, '')}`;

    const existingInt = target.intimations.find(i =>
      i.id === intId ||
      ((i.processNumber || i.process || '').replace(/\D/g, '') === cnjNorm && i.status === 'pendente_confirmacao')
    );

    if (!existingInt) {
      target.intimations.unshift({
        id: intId,
        externalId: intId,
        processNumber: cnj,
        process: cnj,
        client: p.autor || 'Cliente do Escritório',
        title: `Intimação Eletrônica Pendente de Ciência (${p.dias || '15'} dias)`,
        court: p.juizo || 'TJRS · eproc 1º grau',
        source: 'eproc TJRS',
        date: isoSent,
        publishedAt: isoSent,
        status: 'pendente_confirmacao',
        unread: true,
        text: `Juízo: ${p.juizo || 'Vara Cível'}\nClasse: ${p.classe || 'Procedimento Judicial'}\nPartes: ${p.autor || 'Autor'} X ${p.reu || 'Réu'}\nExpedida/certificada a intimação eletrônica no eproc TJRS.`,
        createdAt: nowIso
      });
      importedIntimations++;
    }
  }

  // 3. Processar processos do relatório
  for (const cnj of extracted.processes || []) {
    const cnjNorm = cnj.replace(/\D/g, '');
    const procExists = target.processes.some(p => (p.number || '').replace(/\D/g, '') === cnjNorm);
    if (!procExists) {
      target.processes.push({
        id: `proc:eproc:${cnjNorm}`,
        number: cnj,
        title: `Processo TJRS ${cnj}`,
        client: 'Cliente do Escritório',
        court: 'TJRS · eproc 1º grau',
        status: 'ATIVO',
        source: 'eproc-tjrs',
        tags: ['eproc', 'tjrs', 'relatorio-processos'],
        createdAt: nowIso,
        updatedAt: nowIso
      });
      importedProcesses++;
    }
  }

  return {
    ok: true,
    imported: {
      tasks: importedTasks,
      intimations: importedIntimations,
      processes: importedProcesses
    }
  };
}
