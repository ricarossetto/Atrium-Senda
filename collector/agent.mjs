import { chromium } from 'playwright';
import { readFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateTotp, SecurityManager } from '../lib/security.mjs';
import { collectDjen } from './adapters/djen.mjs';
import { collectDatajud } from './adapters/datajud.mjs';
import { collectPje } from './adapters/pje.mjs';

const COLLECTOR_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.dirname(COLLECTOR_DIR);
const PROFILE_DIR = path.join(COLLECTOR_DIR, '.profile');
const JUDICIAL_INTEGRATIONS_FILE = path.join(ROOT, 'data', 'judicial-integrations.json');
const PROCESS_RE = /\b\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}\b/;
const DATE_RE = /\b(\d{2})\/(\d{2})\/(\d{4})\b/;

await loadEnv(path.join(ROOT, '.env'));
await loadEnv(path.join(ROOT, '.env.collector'));
const judicialSecrets = await loadJudicialSecrets();

const CENTRAL_URL = process.env.CENTRAL_URL || 'http://127.0.0.1:4173';
const headless = String(process.env.COLLECTOR_HEADLESS).toLowerCase() === 'true';
const interactive = String(process.env.COLLECTOR_INTERACTIVE ?? 'true').toLowerCase() === 'true';
const loginWaitMs = Math.max(0, Number(process.env.LOGIN_WAIT_SECONDS || 180)) * 1000;
const configFile = existsSync(path.join(COLLECTOR_DIR, 'portals.json')) ? path.join(COLLECTOR_DIR, 'portals.json') : path.join(COLLECTOR_DIR, 'portals.example.json');
const config = JSON.parse(await readFile(configFile, 'utf8'));
const requestedPortalIds = new Set(String(process.env.COLLECTOR_PORTAL_IDS || '').split(',').map(value => value.trim()).filter(Boolean));
const portals = (config.portals || []).filter(portal => requestedPortalIds.size ? requestedPortalIds.has(portal.id) : portal.enabled);

if (!portals.length) throw new Error('Nenhum portal habilitado em collector/portals.json.');

const publicPortals = portals.filter(portal => ['djen', 'datajud'].includes(portal.strategy));
const preBrowserPortals = publicPortals.filter(portal => portal.strategy === 'djen');
const postBrowserPortals = publicPortals.filter(portal => portal.strategy === 'datajud');
const browserPortals = portals.filter(portal => !['djen', 'datajud'].includes(portal.strategy));
const certificates = [];
for (const portal of browserPortals) {
  if (portal.usesCertificate && portal.certificateMode === 'pfx-mtls') {
    const pfxPath = judicialSecrets.certificate?.path || process.env.A1_PFX_PATH;
    const passphrase = judicialSecrets.certificate?.passphrase || process.env.A1_PFX_PASSPHRASE;
    if (pfxPath && passphrase && existsSync(pfxPath)) {
      certificates.push({ origin: new URL(portal.url).origin, pfxPath, passphrase });
    } else if (!interactive) {
      throw new Error(`O portal ${portal.name} exige A1, mas o certificado não foi configurado na Central.`);
    }
  }
}

const payload = { events: [], tasks: [], intimations: [], processes: [], sources: [] };
const existingProcessNumbers = await loadExistingProcessNumbers();

try {
  for (const portal of preBrowserPortals) await collectPublicPortal(portal, payload);
  if (browserPortals.length) {
    await mkdir(PROFILE_DIR, { recursive: true });
    const context = await chromium.launchPersistentContext(PROFILE_DIR, {
      headless,
      viewport: { width: 1440, height: 960 },
      locale: 'pt-BR',
      timezoneId: 'America/Sao_Paulo',
      clientCertificates: certificates.length ? certificates : undefined
    });
    try {
      for (const portal of browserPortals) await collectPortal(context, portal, payload);
    } finally { await context.close(); }
  }
  for (const portal of postBrowserPortals) await collectPublicPortal(portal, payload);
  const response = await fetch(`${CENTRAL_URL}/api/ingest`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(process.env.COLLECTOR_INGEST_TOKEN ? { Authorization: `Bearer ${process.env.COLLECTOR_INGEST_TOKEN}` } : {})
    },
    body: JSON.stringify(payload)
  });
  if (!response.ok) throw new Error(`A Central recusou a coleta (HTTP ${response.status}).`);
  const result = await response.json();
  console.log(`Coleta concluída: ${result.imported} registro(s) recebido(s) pela Central.`);
} catch (error) { throw error; }

async function collectPublicPortal(portal, target) {
  const checkedAt = new Date().toISOString();
  try {
    console.log(`Verificando ${portal.name}…`);
    if (portal.strategy === 'datajud') {
      const result = await collectDatajud(portal, config, target, { seedProcessNumbers: existingProcessNumbers });
      const status = result.complete ? 'ok' : 'attention';
      const refresh = result.refreshedKey ? ' Chave pública atualizada pela página oficial do CNJ.' : '';
      target.sources.push(source(portal, status, checkedAt, `${result.queried} processo(s) consultado(s) · ${result.found} localizado(s) · ${result.updated} atualizado(s) · ${result.failed} falha(s) · ${result.partial} resposta(s) parcial(is).${refresh}`));
      return;
    }
    const result = await collectDjen(portal, config, target);
    const status = result.complete ? 'ok' : 'attention';
    const completeness = result.complete ? '' : ' Coleta parcial; será repetida no próximo ciclo.';
    target.sources.push(source(portal, status, checkedAt, `${result.records} publicação(ões) única(s) entre ${result.start} e ${result.end}.${completeness}`));
  } catch (error) {
    target.sources.push(source(portal, 'error', checkedAt, safeMessage(error)));
    console.error(`${portal.name}: ${safeMessage(error)}`);
  }
}

async function collectPortal(context, portal, target) {
  const checkedAt = new Date().toISOString();
  const page = await context.newPage();
  try {
    console.log(`Verificando ${portal.name}…`);
    if (portal.certificateMode === 'pjeoffice' && !(await pjeOfficeAvailable())) {
      target.sources.push(source(portal, 'attention', checkedAt, 'PJeOffice Pro oficial não está respondendo em 127.0.0.1:8800. Inicie o aplicativo e autentique novamente.'));
      return;
    }
    await page.goto(portal.dataUrl || portal.url, { waitUntil: 'domcontentloaded', timeout: 90_000 });
    await page.waitForTimeout(2_000);

    if (await needsHumanAuthentication(page)) {
      await tryAutomatedCertificateLogin(page, portal);
      await tryAutomatedTotp(page, portal);
      await page.waitForTimeout(2_000);
      if (interactive && !headless) {
        console.log(`${portal.name}: conclua login, QR code, CAPTCHA ou 2FA na janela aberta. Aguardando até ${Math.round(loginWaitMs / 1000)} segundos…`);
        await waitForHumanAuthentication(page, portal, loginWaitMs);
      }
      if (await needsHumanAuthentication(page)) {
        target.sources.push(source(portal, 'attention', checkedAt, 'Autenticação manual necessária; nenhuma tentativa de contornar CAPTCHA ou 2FA foi feita.'));
        return;
      }
    }

    if (portal.dataUrl && page.url() !== portal.dataUrl) {
      await page.goto(portal.dataUrl, { waitUntil: 'domcontentloaded', timeout: 90_000 });
      await page.waitForTimeout(2_000);
    }

    if (portal.strategy === 'eproc') {
      const result = await collectEproc(page, portal, target);
      target.sources.push(source(portal, 'ok', checkedAt, `${result.processes} processo(s) · ${result.deadlines} prazo(s) · ${result.pending} intimação(ões) pendente(s).`));
      return;
    }

    if (portal.strategy === 'pje') {
      const result = await collectPje(page, portal, config, target);
      target.sources.push(source(portal, 'ok', checkedAt, `${result.processes} processo(s) · ${result.intimations} expediente(s), em modo somente leitura.`));
      return;
    }

    const selector = portal.itemSelector || 'table tbody tr';
    const items = await page.locator(selector).allInnerTexts();
    const unique = [...new Set(items.map(normalizeLine).filter(text => text.length > 5))].slice(0, Number(portal.maxItems || 500));
    if (portal.strategy === 'processes') collectProcesses(unique, portal, target);
    else if (portal.strategy === 'intimations') collectIntimations(unique, portal, target);
    else collectTasks(unique, portal, target);
    target.sources.push(source(portal, 'ok', checkedAt, `${unique.length} item(ns) visível(is) analisado(s).`));
  } catch (error) {
    target.sources.push(source(portal, 'error', checkedAt, safeMessage(error)));
    console.error(`${portal.name}: ${safeMessage(error)}`);
  } finally {
    await page.close();
  }
}

async function collectEproc(page, portal, target) {
  await navigateToEprocProcessReport(page);
  const processes = await collectEprocProcessPages(page, portal);
  target.processes.push(...processes);

  await navigateToEprocPanel(page);
  const deadlineHref = await firstVisibleHref(page, 'a[href*="acao=citacao_intimacao_prazo_aberto_listar"]', href => !/urgente=true|vence_hoje=/i.test(href) && !/acao=controlador_links/i.test(href));
  let deadlines = [];
  if (deadlineHref) {
    await page.goto(deadlineHref, { waitUntil: 'domcontentloaded', timeout: 90_000 });
    deadlines = await readEprocDeadlineRows(page);
    appendEprocNotifications(deadlines, portal, target, false);
  }

  await navigateToEprocPanel(page);
  const pendingHref = await firstVisibleHref(page, 'a[href*="acao=citacao_intimacao_pendente_listar"]', href => /[?&]acao=citacao_intimacao_pendente_listar(?:&|$)/i.test(href));
  let pending = [];
  if (pendingHref) {
    const count = await linkVisibleText(page, pendingHref);
    if (Number(count) > 0) {
      await page.goto(pendingHref, { waitUntil: 'domcontentloaded', timeout: 90_000 });
      pending = await readEprocDeadlineRows(page);
      appendEprocNotifications(pending, portal, target, true);
    }
  }

  return { processes: processes.length, deadlines: deadlines.length, pending: pending.length };
}

async function navigateToEprocProcessReport(page) {
  if (await hasEprocProcessTable(page)) return;
  let href = await firstVisibleHref(page, 'a', value => /acao=relatorio_processo_procurador_listar/i.test(value) && !/ord_ultimas_movimentacoes=/i.test(value));
  if (!href) {
    const reports = page.getByRole('link', { name: 'Relatórios', exact: true });
    if (await reports.count()) {
      await reports.first().click();
      await page.waitForTimeout(250);
      href = await firstVisibleHref(page, 'a', value => /acao=relatorio_processo_procurador_listar/i.test(value) && !/ord_ultimas_movimentacoes=/i.test(value));
    }
  }
  if (!href) throw new Error('O relatório "Relação de Processos" não foi localizado no eproc.');
  await page.goto(href, { waitUntil: 'domcontentloaded', timeout: 90_000 });
  if (!(await hasEprocProcessTable(page))) throw new Error('A tabela de processos do eproc não foi carregada.');
}

async function navigateToEprocPanel(page) {
  if (/acao=painel_adv(?:ogado)?_listar/i.test(page.url())) return;
  const href = await firstVisibleHref(page, 'a', value => /acao=painel_adv(?:ogado)?_listar/i.test(value));
  if (!href) throw new Error('O Painel do Advogado não foi localizado no eproc.');
  await page.goto(href, { waitUntil: 'domcontentloaded', timeout: 90_000 });
}

async function hasEprocProcessTable(page) {
  return page.locator('table').evaluateAll(tables => tables.some(table => {
    const headers = [...table.querySelectorAll('th')].map(cell => cell.textContent.trim());
    return headers.includes('Número Processo') && headers.includes('Último Evento');
  })).catch(() => false);
}

async function collectEprocProcessPages(page, portal) {
  const collected = [];
  const totalPages = Math.max(1, await page.locator('select#selInfraPaginacaoSuperior option').count().catch(() => 0));
  for (let pageIndex = 0; pageIndex < totalPages; pageIndex += 1) {
    const rows = await page.locator('table').evaluateAll((tables, metadata) => {
      const table = tables.find(candidate => {
        const headers = [...candidate.querySelectorAll('th')].map(cell => cell.textContent.trim());
        return headers.includes('Número Processo') && headers.includes('Último Evento');
      });
      if (!table) return [];
      return [...table.rows].slice(1).map(row => {
        const cells = [...row.cells].map(cell => cell.innerText.trim().replace(/\s+/g, ' '));
        const number = (cells[1] || '').match(/\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}/)?.[0] || '';
        const secrecy = Boolean(row.querySelector('[title*="sigilo" i], [title*="segredo" i], [aria-label*="sigilo" i], [aria-label*="segredo" i]')) || /sigilo|segredo/i.test(row.innerText);
        return {
          id: `${metadata.id}:process:${number}`, externalId: `${metadata.id}:process:${number}`, number,
          client: cells[3] || 'Cliente não identificado', opposingParty: cells[4] || '',
          court: `${metadata.court}${cells[5] ? ` · ${cells[5]}` : ''}`, locality: cells[5] || '',
          actionType: cells[2] || '', subject: cells[6] || '', lastMovement: cells[7] || '',
          lastMovementAt: cells[8] || '', filedAt: cells[9] || '', caseValue: cells[10] || '',
          secrecy, monitoring: 'active', source: metadata.name, collectedAt: new Date().toISOString()
        };
      }).filter(record => record.number);
    }, { id: portal.id, name: portal.name, court: portal.court || portal.name });
    for (const row of rows) row.lastMovementAt = parseBrazilianDate(row.lastMovementAt);
    collected.push(...rows);
    if (pageIndex + 1 >= totalPages) break;
    const pager = page.locator('select#selInfraPaginacaoSuperior').first();
    const nextValue = await pager.locator('option').nth(pageIndex + 1).getAttribute('value');
    if (nextValue === null) break;
    await pager.selectOption(nextValue).catch(() => {});
    await page.waitForLoadState('domcontentloaded', { timeout: 30_000 }).catch(() => {});
    await page.waitForTimeout(700);
  }
  return uniqueBy(collected, 'number');
}

async function readEprocDeadlineRows(page) {
  return page.locator('table').evaluateAll(tables => {
    const table = tables.find(candidate => {
      const headers = [...candidate.querySelectorAll('th')].map(cell => cell.textContent.trim());
      return headers.includes('Processo') && headers.includes('Evento e Prazo') && headers.includes('Final Prazo');
    });
    if (!table) return [];
    return [...table.rows].slice(1).map(row => {
      const cells = [...row.cells].map(cell => cell.innerText.trim().replace(/\s+/g, ' '));
      return {
        process: (cells[1] || '').match(/\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}/)?.[0] || '',
        processDetails: cells[1] || '', className: cells[2] || '', subject: cells[3] || '',
        event: cells[4] || 'Intimação eletrônica', sentAt: cells[5] || '', startsAt: cells[6] || '', deadlineAt: cells[7] || ''
      };
    }).filter(record => record.process);
  });
}

function appendEprocNotifications(rows, portal, target, pending) {
  const now = new Date().toISOString();
  const term = `${config.monitoredTerm?.name || 'Ricardo De Luca Rossetto'} · ${config.monitoredTerm?.registration || 'OAB/RS 135294'}`;
  for (const row of rows) {
    const publishedAt = parseBrazilianDate(row.sentAt) || now.slice(0, 10);
    const startsAt = parseBrazilianDate(row.startsAt);
    const deadline = parseBrazilianDate(row.deadlineAt);
    const parties = sanitizeEprocParties(row.processDetails, row.process);
    const externalId = `${portal.id}:${pending ? 'pending' : 'deadline'}:${row.process}:${hash(`${row.event}:${publishedAt}:${deadline}`)}`;
    const description = normalizeLine([row.className, row.subject, parties, pending ? row.startsAt : `Prazo de ${startsAt || '—'} a ${deadline || '—'}`].filter(Boolean).join(' · '));
    target.intimations.push({
      id: `int:${externalId}`, externalId: `int:${externalId}`, source: portal.name, status: 'nova', unread: true,
      title: row.event, process: row.process, client: parties, court: portal.court || portal.name,
      publishedAt, text: description, term, createdAt: now, deadline, publicationStatus: pending ? row.startsAt : ''
    });
    target.tasks.push({
      id: `task:${externalId}`, externalId: `task:${externalId}`,
      title: pending ? 'Acompanhar publicação no DJEN' : row.event, description,
      status: pending ? 'aguardando' : 'triagem', source: portal.name, client: parties, process: row.process,
      deadline, priority: deadline && daysUntil(deadline) <= 2 ? 'urgente' : deadline && daysUntil(deadline) <= 7 ? 'importante' : 'normal',
      responsible: 'Ricardo', createdAt: now
    });
  }
}

async function firstVisibleHref(page, selector, predicate = () => true) {
  const links = await page.locator(selector).evaluateAll(elements => elements.map(element => ({
    href: element.href || '', visible: Boolean(element.offsetWidth || element.offsetHeight || element.getClientRects().length)
  })));
  return links.find(link => link.visible && predicate(link.href))?.href || '';
}

async function linkVisibleText(page, href) {
  return page.locator(`a[href="${cssEscape(href)}"]`).first().innerText().catch(() => '');
}

function sanitizeEprocParties(value, number) {
  return normalizeLine(String(value || '')
    .replace(number, '')
    .replace(/Juízo:\s*\S+/i, '')
    .replace(/Cadastrar Lembrete/gi, '')
    .replace(/\s*\(\d{11,14}\)/g, ''));
}

function uniqueBy(records, key) {
  return [...new Map(records.map(record => [record[key] || record.id, record])).values()];
}

function daysUntil(date) {
  if (!date) return 999;
  return Math.ceil((new Date(`${date}T23:59:59`).getTime() - Date.now()) / 86_400_000);
}

function cssEscape(value) {
  return String(value).replace(/(["\\])/g, '\\$1');
}

function collectTasks(lines, portal, target) {
  const now = new Date().toISOString();
  for (const [index, text] of lines.entries()) {
    const process = text.match(PROCESS_RE)?.[0] || '';
    const date = parseBrazilianDate(text);
    const externalId = `${portal.id}:task:${hash(`${text}:${index}`)}`;
    target.tasks.push({
      id: externalId, externalId, title: text.slice(0, 180), description: text,
      status: 'triagem', source: portal.name, client: '', process,
      deadline: date, priority: 'normal', responsible: 'Ricardo', createdAt: now
    });
  }
}

function collectProcesses(lines, portal, target) {
  const now = new Date().toISOString();
  for (const text of lines) {
    const number = text.match(PROCESS_RE)?.[0];
    if (!number) continue;
    target.processes.push({
      id: `${portal.id}:process:${number}`, externalId: `${portal.id}:process:${number}`, number,
      client: inferClient(text, number), court: portal.name, secrecy: /segredo|sigilo/i.test(text),
      lastMovement: text.slice(0, 500), lastMovementAt: parseBrazilianDate(text) || now.slice(0, 10), monitoring: 'active'
    });
  }
}

function collectIntimations(lines, portal, target) {
  const now = new Date().toISOString();
  const term = `${config.monitoredTerm?.name || 'Ricardo De Luca Rossetto'} · ${config.monitoredTerm?.registration || 'OAB/RS 135294'}`;
  for (const [index, text] of lines.entries()) {
    if (!portal.accountScoped && !matchesMonitoredTerm(text)) continue;
    const process = text.match(PROCESS_RE)?.[0] || '';
    const externalId = `${portal.id}:intimation:${hash(`${text}:${index}`)}`;
    target.intimations.push({
      id: externalId, externalId, source: portal.name, status: 'nova', unread: true,
      title: text.slice(0, 180), process, client: '', court: portal.name,
      publishedAt: parseBrazilianDate(text) || now.slice(0, 10), text, term, createdAt: now
    });
  }
}

async function needsHumanAuthentication(page) {
  const url = page.url().toLowerCase();
  if (/login|signin|sign-in|autenticacao|authentication/.test(url)) return true;
  const body = (await page.locator('body').innerText({ timeout: 10_000 }).catch(() => '')).slice(0, 12_000).toLowerCase();
  const passwordField = await page.locator('input[type="password"]').count().catch(() => 0);
  const loggedIn = /painel do advogado|rela[cç][aã]o de processos|n[uú]mero do processo/.test(body);
  return !loggedIn && (passwordField > 0 || /entrar na conta|faça seu login|leia o qr code|captcha|código de verificação|acesso com certificado digital/.test(body));
}

async function waitForHumanAuthentication(page, portal, timeout) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    await page.waitForTimeout(2_000);
    await tryAutomatedTotp(page, portal);
    if (!(await needsHumanAuthentication(page))) return;
  }
  console.log(`${portal.name}: tempo de autenticação manual encerrado.`);
}

function matchesMonitoredTerm(text) {
  const compact = normalizeSearch(text);
  const name = normalizeSearch(config.monitoredTerm?.name || 'Ricardo De Luca Rossetto');
  return compact.includes(name) || /135[.]?294/.test(compact);
}

function source(portal, status, lastCheck, detail) {
  const method = portal.strategy === 'djen'
    ? 'API pública oficial CNJ'
    : portal.strategy === 'datajud'
      ? 'API Pública DataJud/CNJ'
    : portal.certificateMode === 'pjeoffice'
      ? 'PJeOffice Pro oficial + sessão local'
      : portal.certificateMode === 'windows-store'
        ? 'Certificado do Windows + sessão'
        : portal.usesCertificate ? 'Certificado A1' : 'Sessão local';
  return { id: portal.id, name: portal.name, short: portal.short || portal.name.slice(0, 3).toUpperCase(), method, status, lastCheck, detail };
}

async function pjeOfficeAvailable() {
  try {
    const response = await fetch('http://127.0.0.1:8800/pjeOffice/', { signal: AbortSignal.timeout(3_000) });
    return response.ok && /image\/gif/i.test(response.headers.get('content-type') || '');
  } catch { return false; }
}

async function tryAutomatedTotp(page, portal) {
  const secret = judicialSecrets.totpSecrets?.[portal.id]?.secret || (portal.autoTotpEnv ? process.env[portal.autoTotpEnv] : '');
  if (!secret) return false;
  const allowedOrigins = new Set([new URL(portal.url).origin, ...(portal.trustedAuthOrigins || [])]);
  if (!allowedOrigins.has(new URL(page.url()).origin)) return false;

  // Seletores abrangentes para captura de campos 2FA/TOTP em eproc, PJe, PDPJ e portais de autenticação
  const selectors = [
    'input[autocomplete="one-time-code"]',
    'input#txtCodAutenticacao',
    'input#txtCodigo',
    'input[name="txtCodAutenticacao"]',
    'input[name="txtCodigo"]',
    'input[name*="otp" i]',
    'input[id*="otp" i]',
    'input[name*="token" i]',
    'input[id*="token" i]',
    'input[name*="codigo" i]',
    'input[id*="codigo" i]',
    'input[name*="2fa" i]',
    'input[id*="2fa" i]',
    'input[name*="totp" i]',
    'input[id*="totp" i]',
    'input[placeholder*="código" i]',
    'input[placeholder*="digite" i]',
    'input[maxlength="6"]'
  ];

  let input = null;
  for (const sel of selectors) {
    const candidate = page.locator(sel).first();
    if (await candidate.count().catch(() => 0) && await candidate.isVisible().catch(() => false)) {
      input = candidate;
      break;
    }
  }

  if (!input) {
    for (const frame of page.frames()) {
      for (const sel of selectors) {
        const candidate = frame.locator(sel).first();
        if (await candidate.count().catch(() => 0) && await candidate.isVisible().catch(() => false)) {
          input = candidate;
          break;
        }
      }
      if (input) break;
    }
  }

  if (!input) return false;

  const currentCode = generateTotp(secret);
  console.log(`[2FA Robô]: Injetando código TOTP gerado automaticamente (${currentCode}) em ${portal.name}…`);
  await input.fill(currentCode).catch(() => {});
  await page.waitForTimeout(300);

  const submitCandidates = [
    page.locator('button[type="submit"], input[type="submit"], input#sbmEntrar, button#btnEntrar, input#btnEntrar, button#sbmEntrar').first(),
    page.getByRole('button', { name: /^(validar|entrar|continuar|confirmar|acessar|verificar)$/i }).first()
  ];

  for (const submit of submitCandidates) {
    if (await submit.count().catch(() => 0) && await submit.isVisible().catch(() => false)) {
      await submit.click().catch(() => {});
      await page.waitForLoadState('domcontentloaded', { timeout: 15_000 }).catch(() => {});
      await page.waitForTimeout(1_500);
      return true;
    }
  }

  await input.press('Enter').catch(() => {});
  await page.waitForLoadState('domcontentloaded', { timeout: 15_000 }).catch(() => {});
  await page.waitForTimeout(1_500);
  return true;
}

async function tryAutomatedCertificateLogin(page, portal) {
  const allowedOrigins = new Set([new URL(portal.url).origin, ...(portal.trustedAuthOrigins || [])]);
  if (!allowedOrigins.has(new URL(page.url()).origin)) return false;

  const candidates = [
    page.getByRole('button', { name: /certificado\s+digital/i }),
    page.getByRole('link', { name: /certificado\s+digital/i }),
    page.getByText(/acesso\s+com\s+certificado\s+digital/i, { exact: false }),
    page.getByRole('button', { name: /certificado\s+a1/i }),
    page.getByRole('link', { name: /certificado\s+a1/i }),
    page.getByRole('button', { name: /entrar\s+com\s+certificado/i }),
    page.getByRole('link', { name: /entrar\s+com\s+certificado/i }),
    page.locator('button#btnCertificado, a#btnCertificado, button#btn-login-cert, a#btn-login-cert').first()
  ];
  for (const candidate of candidates) {
    if (!(await candidate.count().catch(() => 0))) continue;
    const element = candidate.first();
    if (!(await element.isVisible().catch(() => false))) continue;
    console.log(`[A1 Robô]: Clicando automaticamente no acesso por Certificado em ${portal.name}…`);
    await element.click({ timeout: 5_000 }).catch(() => {});
    await page.waitForLoadState('domcontentloaded', { timeout: 15_000 }).catch(() => {});
    await page.waitForTimeout(1_500);
    return true;
  }
  return false;
}

function normalizeLine(value) { return String(value || '').replace(/\s+/g, ' ').trim(); }
function normalizeSearch(value) { return normalizeLine(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); }
function parseBrazilianDate(text) { const match = text.match(DATE_RE); return match ? `${match[3]}-${match[2]}-${match[1]}` : ''; }
function inferClient(text, number) { return normalizeLine(text.replace(number, '')).slice(0, 120) || 'Cliente não identificado'; }
function safeMessage(error) { return String(error?.message || error || 'Falha não identificada').replace(/(?:password|senha|token|passphrase)=[^\s&]+/gi, '[segredo oculto]').slice(0, 300); }
function hash(value) { let hashValue = 2166136261; for (const char of value) { hashValue ^= char.charCodeAt(0); hashValue = Math.imul(hashValue, 16777619); } return (hashValue >>> 0).toString(36); }

async function loadEnv(file) {
  if (!existsSync(file)) return;
  const source = await readFile(file, 'utf8');
  const parsed = {};
  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const separator = line.indexOf('=');
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    parsed[key] = value;
  }
  for (const [key, value] of Object.entries(parsed)) if (!(key in process.env)) process.env[key] = value;
}

async function loadExistingProcessNumbers() {
  const runtimeFile = path.join(ROOT, 'data', 'runtime.json');
  if (!existsSync(runtimeFile) || !process.env.AUTH_SESSION_SECRET || !process.env.AUTH_ENCRYPTION_KEY) return [];
  try {
    const security = new SecurityManager({
      dataDirectory: path.join(ROOT, 'data'),
      sessionSecret: process.env.AUTH_SESSION_SECRET,
      encryptionKey: process.env.AUTH_ENCRYPTION_KEY,
      secureCookies: false
    });
    await security.init();
    const envelope = JSON.parse(await readFile(runtimeFile, 'utf8'));
    const state = JSON.parse(security.decrypt(envelope.encrypted));
    return [...new Set((state.processes || []).map(record => record.number).filter(Boolean))];
  } catch {
    return [];
  }
}

async function loadJudicialSecrets() {
  if (!existsSync(JUDICIAL_INTEGRATIONS_FILE) || !process.env.AUTH_SESSION_SECRET || !process.env.AUTH_ENCRYPTION_KEY) return { certificate: null, totpSecrets: {}, allowAutomatedTotp: false };
  try {
    const security = new SecurityManager({
      dataDirectory: path.join(ROOT, 'data'),
      sessionSecret: process.env.AUTH_SESSION_SECRET,
      encryptionKey: process.env.AUTH_ENCRYPTION_KEY,
      secureCookies: false
    });
    await security.init();
    const envelope = JSON.parse(await readFile(JUDICIAL_INTEGRATIONS_FILE, 'utf8'));
    return { certificate: null, totpSecrets: {}, allowAutomatedTotp: false, ...JSON.parse(security.decrypt(envelope.encrypted)) };
  } catch {
    return { certificate: null, totpSecrets: {}, allowAutomatedTotp: false };
  }
}
