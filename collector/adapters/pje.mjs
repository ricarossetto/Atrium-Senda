const PROCESS_RE = /\b\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}\b/;
const DATE_RE = /\b(\d{2})\/(\d{2})\/(\d{4})\b/;
const DANGEROUS_ACTION_RE = /tomar\s+ci[eê]ncia|dar\s+ci[eê]ncia|registrar\s+ci[eê]ncia|responder|peticionar|assinar|protocolar|visualizar\s+expediente/i;

export async function collectPje(page, portal, config, target) {
  assertTrustedPortal(page.url(), portal);
  const seenLines = [];

  await collectVisibleProcessLines(page, seenLines);
  for (const tabName of portal.safeTabs || ['Expedientes', 'Acervo']) {
    await activateSafeTab(page, tabName);
    await collectVisibleProcessLines(page, seenLines);
  }

  const uniqueLines = [...new Set(seenLines.map(normalizeLine).filter(line => PROCESS_RE.test(line)))];
  const result = { processes: 0, intimations: 0 };
  const processNumbers = new Set();
  const now = new Date().toISOString();
  const term = `${config.monitoredTerm?.name || 'Ricardo De Luca Rossetto'} · ${config.monitoredTerm?.registration || 'OAB/RS 135294'}`;

  for (const line of uniqueLines) {
    const process = line.match(PROCESS_RE)?.[0];
    if (!process) continue;
    if (!processNumbers.has(process)) {
      processNumbers.add(process);
      target.processes.push({
        id: `${portal.id}:process:${process}`,
        externalId: `${portal.id}:process:${process}`,
        number: process,
        client: inferParties(line, process),
        court: portal.court || portal.name,
        secrecy: /segredo|sigilo/i.test(line),
        lastMovement: line.slice(0, 2_000),
        lastMovementAt: parseBrazilianDate(line) || now.slice(0, 10),
        monitoring: 'active',
        source: portal.name,
        collectedAt: now
      });
      result.processes += 1;
    }

    if (!/intima[cç][aã]o|cita[cç][aã]o|notifica[cç][aã]o|expediente|prazo|pendente\s+de\s+ci[eê]ncia|pendente\s+de\s+manifesta[cç][aã]o/i.test(line)) continue;
    const externalId = `${portal.id}:intimation:${process}:${stableHash(line)}`;
    const pendingScience = /pendente\s+de\s+ci[eê]ncia|apenas\s+pendentes\s+de\s+ci[eê]ncia/i.test(line);
    const publishedAt = parseBrazilianDate(line) || now.slice(0, 10);
    target.intimations.push({
      id: externalId,
      externalId,
      source: portal.name,
      status: 'nova',
      unread: true,
      title: pendingScience ? 'Expediente pendente de ciência no PJe' : 'Expediente no PJe',
      process,
      client: inferParties(line, process),
      court: portal.court || portal.name,
      publishedAt,
      text: line.slice(0, 10_000),
      term,
      createdAt: now,
      publicationStatus: pendingScience ? 'Pendente de ciência — não aberta pelo coletor' : 'Pendente de análise'
    });
    target.tasks.push({
      id: `task:${externalId}`,
      externalId: `task:${externalId}`,
      title: pendingScience ? 'Revisar expediente PJe sem abrir ciência' : 'Analisar expediente PJe',
      description: line.slice(0, 10_000),
      status: 'triagem',
      source: portal.name,
      client: inferParties(line, process),
      process,
      deadline: '',
      priority: pendingScience ? 'urgente' : 'importante',
      responsible: 'Ricardo',
      createdAt: now
    });
    result.intimations += 1;
  }

  return result;
}

async function collectVisibleProcessLines(page, target) {
  for (const frame of page.frames()) {
    const lines = await frame.locator('tr, [role="row"], .rich-table-row, .ui-datatable-data > tr, [class*="processo" i], [class*="expediente" i]')
      .allInnerTexts()
      .catch(() => []);
    target.push(...lines.filter(line => PROCESS_RE.test(line)));
  }
}

async function activateSafeTab(page, name) {
  if (DANGEROUS_ACTION_RE.test(name)) throw new Error(`A ação PJe "${name}" foi bloqueada pelo modo somente leitura.`);
  for (const frame of page.frames()) {
    const candidates = [
      frame.getByRole('tab', { name: new RegExp(`^${escapeRegex(name)}$`, 'i') }),
      frame.getByRole('link', { name: new RegExp(`^${escapeRegex(name)}$`, 'i') }),
      frame.getByText(new RegExp(`^${escapeRegex(name)}$`, 'i'), { exact: true })
    ];
    for (const candidate of candidates) {
      if (!(await candidate.count().catch(() => 0))) continue;
      const element = candidate.first();
      const text = await element.innerText().catch(() => name);
      const href = await element.getAttribute('href').catch(() => '');
      if (DANGEROUS_ACTION_RE.test(`${text} ${href || ''}`)) continue;
      await element.click({ timeout: 5_000 }).catch(() => {});
      await page.waitForTimeout(900);
      return true;
    }
  }
  return false;
}

export function assertTrustedPortal(value, portal) {
  const current = new URL(value);
  const configured = new URL(portal.url);
  const allowed = new Set([configured.origin, ...(portal.trustedAuthOrigins || [])]);
  if (current.protocol !== 'https:' || !/(^|\.)jus\.br$/i.test(current.hostname) || !allowed.has(current.origin)) {
    throw new Error(`Navegação PJe fora das origens permitidas: ${current.origin}.`);
  }
}

function inferParties(line, process) {
  return normalizeLine(String(line || '').replace(process, '').replace(/\b\d{2}\/\d{2}\/\d{4}\b/g, '')).slice(0, 240) || 'Partes não identificadas';
}

function parseBrazilianDate(value) {
  const match = String(value || '').match(DATE_RE);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : '';
}

function normalizeLine(value) { return String(value || '').replace(/\s+/g, ' ').trim(); }
function escapeRegex(value) { return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function stableHash(value) { let result = 2166136261; for (const character of value) { result ^= character.charCodeAt(0); result = Math.imul(result, 16777619); } return (result >>> 0).toString(36); }

export const pjeInternals = { DANGEROUS_ACTION_RE, inferParties, parseBrazilianDate, stableHash };
