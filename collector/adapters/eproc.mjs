import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { generateTotp } from '../../lib/security.mjs';
import { generateAutosIndexPdf } from '../../lib/judicial/tjrs-autos-service.mjs';
import { sanitizeDocumentFilename } from '../../lib/documents/document-service.mjs';

/**
 * Autentica no eproc TJRS utilizando Certificado A1 (mTLS) e Segundo Fator (TOTP)
 */
export async function authenticateEprocWithCertAndTotp(page, portalUrl, credentials = {}) {
  const targetUrl = portalUrl || 'https://eproc1g.tjrs.jus.br/eproc/';
  console.log(`[eproc] Acessando portal: ${targetUrl}`);
  await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForTimeout(1_500);

  // Se já estiver logado no eproc
  if (await isEprocSessionActive(page)) {
    console.log('[eproc] Sessão já autenticada e ativa.');
    return { ok: true, state: 'CONNECTED' };
  }

  // Verifica se está na tela de login do Keycloak
  const certLoginBtn = page.locator('#kc-login-certificate, button[name="loginCertificate"]').first();
  if (await certLoginBtn.count() > 0 && await certLoginBtn.isVisible().catch(() => false)) {
    console.log('[eproc] Tela de login Keycloak detectada. Clicando em "Entrar com Certificado Digital"...');
    await certLoginBtn.click();
    await page.waitForLoadState('domcontentloaded', { timeout: 60_000 }).catch(() => {});
    await page.waitForTimeout(2_000);
  }

  // Verifica se a tela solicitou o código 2FA / TOTP
  const totpInput = page.locator('#otp, input[name="otp"], input[name="totp"], input[name="code"], input[placeholder*="código" i]').first();
  if (await totpInput.count() > 0 && await totpInput.isVisible().catch(() => false)) {
    console.log('[eproc] Desafio de Segundo Fator (2FA/TOTP) detectado.');
    const secret = credentials.totpSecret;
    if (!secret) {
      throw new Error('Segundo fator exigido pelo tribunal, mas nenhum segredo TOTP foi configurado.');
    }

    const code = generateTotp(secret);
    console.log(`[eproc] Injetando código TOTP de 6 dígitos gerado via RFC 6238...`);
    await totpInput.fill(code);
    await page.waitForTimeout(300);

    const submitBtn = page.locator('#kc-login, input[type="submit"], button[type="submit"]').first();
    if (await submitBtn.count() > 0) {
      await submitBtn.click();
    } else {
      await totpInput.press('Enter');
    }

    await page.waitForLoadState('domcontentloaded', { timeout: 60_000 }).catch(() => {});
    await page.waitForTimeout(3_000);
  }

  // Aguarda estabilização da navegação pós-login
  await page.waitForLoadState('domcontentloaded', { timeout: 60_000 }).catch(() => {});
  await page.waitForTimeout(2_000);

  // Valida a sessão final
  if (await isEprocSessionActive(page)) {
    console.log('[eproc] Autenticação com Certificado A1 + 2FA concluída com sucesso!');
    return { ok: true, state: 'CONNECTED' };
  }

  // Se ainda estiver na tela de login ou erro
  const bodyText = await page.textContent('body').catch(() => '');
  if (bodyText.includes('Certificado Inválido') || bodyText.includes('403 Forbidden')) {
    throw new Error('Certificado digital rejeitado pelo servidor do tribunal (403 Forbidden / Certificado Inválido).');
  }
  if (bodyText.includes('Código inválido') || bodyText.includes('Código incorreto')) {
    throw new Error('Código 2FA / TOTP incorreto ou rejeitado pelo Keycloak.');
  }

  console.log('[eproc] URL atual pós-login:', page.url());
  return { ok: await isEprocSessionActive(page), state: 'UNKNOWN' };
}

/**
 * Verifica se a página atual pertence à sessão logada do advogado no eproc
 */
export async function isEprocSessionActive(page) {
  const url = page.url();
  // Se estiver em qualquer tela do Keycloak ou autenticação, não está logado
  if (url.includes('keycloak') || url.includes('/login') || url.includes('openid-connect') || url.includes('/authenticate')) return false;

  // Se houver botão de certificado ou formulário de login visível, NÃO está logado
  const hasLoginBtn = await page.locator('#kc-login-certificate, #kc-form-login, #frm-login, input[name="loginCertificate"]').count().catch(() => 0);
  if (hasLoginBtn > 0) return false;

  // Sessão interna do controlador.php
  if (url.includes('controlador.php') && !url.includes('externo_controlador.php')) {
    if (url.includes('acao=painel_adv') || url.includes('acao=relatorio_processo') || url.includes('acao=processo_') || url.includes('hash=')) {
      return true;
    }
  }

  const hasLogout = await page.locator('a[href*="acao=usuario_sair"], a:has-text("Sair"), #lnkInfraSair').count().catch(() => 0);
  if (hasLogout > 0) return true;

  const hasPainel = await page.locator('a[href*="acao=painel_adv_listar"]').count().catch(() => 0);
  if (hasPainel > 0 && !url.includes('externo_controlador.php')) return true;

  return false;
}

/**
 * Extrai o hash de segurança da sessão do eproc da URL ou do DOM
 */
export async function extractEprocSessionHash(page) {
  try {
    const current = new URL(page.url());
    const hash = current.searchParams.get('hash');
    if (hash) return hash;
  } catch {}

  return page.evaluate(() => {
    const input = document.querySelector('input[name="hash"], #hdnInfraHash');
    if (input && input.value) return input.value;
    const link = document.querySelector('a[href*="hash="]');
    if (link) {
      const m = link.getAttribute('href').match(/[?&]hash=([a-f0-9]+)/i);
      if (m) return m[1];
    }
    return '';
  }).catch(() => '');
}

export async function getEprocUrlWithHash(page, acao, extraParams = {}) {
  const hash = await extractEprocSessionHash(page);
  const target = new URL('https://eproc1g.tjrs.jus.br/eproc/controlador.php');
  target.searchParams.set('acao', acao);
  if (hash) target.searchParams.set('hash', hash);
  for (const [k, v] of Object.entries(extraParams)) {
    target.searchParams.set(k, v);
  }
  return target.href;
}

/**
 * Navega até o Painel do Advogado
 */
export async function navigateToEprocPanel(page) {
  if (/acao=painel_adv(?:ogado)?_listar/i.test(page.url())) return;
  const panelLink = page.locator('a[href*="acao=painel_adv_listar"], a:has-text("Painel do Advogado")').first();
  if (await panelLink.count() > 0 && await panelLink.isVisible().catch(() => false)) {
    await panelLink.click();
  } else {
    const url = await getEprocUrlWithHash(page, 'painel_adv_listar');
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  }
  await page.waitForTimeout(1_500);
}

export async function firstVisibleHref(page, selector, predicate = () => true) {
  const links = await page.locator(selector).evaluateAll(elements => elements.map(element => ({
    href: element.href || '', text: element.textContent?.replace(/\s+/g, ' ').trim() || '', visible: Boolean(element.offsetWidth || element.offsetHeight || element.getClientRects().length)
  }))).catch(() => []);
  return links.find(link => link.visible && predicate(link.href, link.text))?.href || '';
}

export async function firstVisibleHrefAcrossFrames(page, selector, predicate = () => true) {
  for (const frame of page.frames()) {
    const href = await firstVisibleHref(frame, selector, predicate).catch(() => '');
    if (href) return href;
  }
  return '';
}

export async function hasEprocProcessTable(page) {
  return page.locator('table').evaluateAll(tables => tables.some(table => {
    const headers = [...table.querySelectorAll('th')].map(cell => cell.textContent.trim());
    return headers.some(h => /Número Processo/i.test(h)) && headers.some(h => /Último Evento/i.test(h));
  })).catch(() => false);
}

/**
 * Navega até o Relatório de Processos
 */
export async function navigateToEprocProcessReport(page) {
  if (await hasEprocProcessTable(page)) return;

  const isProcessReport = value => /acao=(?:relatorio_)?processo_(?:procurador_)?listar/i.test(value) && !/ord_ultimas_movimentacoes=/i.test(value);
  let href = await firstVisibleHrefAcrossFrames(page, 'a', isProcessReport);

  if (!href) {
    for (const frame of page.frames()) {
      const reports = frame.getByRole('link', { name: /relat[oó]rios/i }).first();
      if (!(await reports.count().catch(() => 0)) || !(await reports.isVisible().catch(() => false))) continue;
      await reports.click().catch(() => {});
      await page.waitForTimeout(500);
      href = await firstVisibleHrefAcrossFrames(page, 'a', isProcessReport);
      if (href) break;
    }
  }

  if (!href) {
    href = await firstVisibleHrefAcrossFrames(page, 'a', (_value, text) => /rela[cç][aã]o de processos|processos do procurador|meus processos/i.test(text));
  }

  if (href) {
    console.log(`[eproc] Acessando relação de processos: ${href}`);
    await page.goto(href, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.waitForTimeout(1_500);
    return;
  }

  throw new Error('A sessão foi autenticada, mas o atalho para a relação de processos não foi localizado no menu atual do eproc.');
}

/**
 * Abre a tela "Consulta Processual - Detalhes do Processo" para um determinado CNJ
 */
export async function openEprocProcessDetails(page, cnj) {
  const cleanCnj = cnj.replace(/\D/g, '');
  const formattedCnj = cnj.trim();
  console.log(`[eproc] Abrindo detalhes do processo: ${formattedCnj} (${cleanCnj})`);

  // 1. Navega até o Relatório de Processos do advogado
  console.log('[eproc] Navegando até a Relação de Processos...');
  await navigateToEprocProcessReport(page);

  // 2. Localiza o link específico do processo na tabela ou frames
  let procHref = await firstVisibleHrefAcrossFrames(page, 'a', (h, text) => {
    return (text && (text.includes(cleanCnj) || text.includes(formattedCnj))) || (h && h.includes(cleanCnj));
  });

  // Se não localizou na primeira página, clica no Buscar para garantir listagem completa
  if (!procHref) {
    const searchBtn = page.locator('#sbmBuscar, input[name="sbmBuscar"], button:has-text("Buscar")').first();
    if (await searchBtn.count() > 0 && await searchBtn.isVisible().catch(() => false)) {
      console.log('[eproc] Clicando em Buscar para carregar listagem do acervo...');
      await searchBtn.click();
      await page.waitForLoadState('domcontentloaded', { timeout: 45_000 }).catch(() => {});
      await page.waitForTimeout(2_000);

      procHref = await firstVisibleHrefAcrossFrames(page, 'a', (h, text) => {
        return (text && (text.includes(cleanCnj) || text.includes(formattedCnj))) || (h && h.includes(cleanCnj));
      });
    }
  }

  if (procHref) {
    console.log(`[eproc] Processo encontrado! Acessando detalhes: ${procHref}`);
    await page.goto(procHref, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.waitForTimeout(2_000);
    if (await isProcessDetailsPage(page)) {
      console.log('[eproc] Detalhes do processo carregados com sucesso!');
      return true;
    }
  }

  // 3. Tenta navegação com o hash capturado de qualquer link da página
  const sessionHash = await extractEprocSessionHash(page);
  if (sessionHash) {
    const directUrl = `https://eproc1g.tjrs.jus.br/eproc/controlador.php?acao=processo_selecionar&num_processo=${cleanCnj}&hash=${sessionHash}`;
    console.log(`[eproc] Tentando acesso com hash extraído (${sessionHash}): ${directUrl}`);
    await page.goto(directUrl, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await page.waitForTimeout(2_000);
    if (await isProcessDetailsPage(page)) {
      console.log('[eproc] Detalhes do processo carregados com sucesso!');
      return true;
    }
  }

  if (await isProcessDetailsPage(page)) return true;
  throw new Error(`Não foi possível localizar ou abrir os detalhes do processo ${formattedCnj} no eproc. URL atual: ${page.url()}`);
}

export async function isProcessDetailsPage(page) {
  const url = page.url();
  if (url.includes('acao=processo_selecionar') || url.includes('acao=processo_detalhes')) return true;
  const content = await page.textContent('body').catch(() => '');
  return content.includes('Detalhes do Processo') || content.includes('Eventos do Processo') || (content.includes('Partes e Representantes') && content.includes('Processo'));
}

/**
 * Coleta lista de prazos em aberto e pendentes no Painel do Advogado
 */
export async function collectEprocDeadlines(page) {
  await navigateToEprocPanel(page);
  const results = { openDeadlines: [], pendingIntimations: [] };

  // 1. Prazos em aberto
  const openLink = page.locator('a[href*="acao=citacao_intimacao_prazo_aberto_listar"], a:has-text("prazo em aberto"), a:has-text("Prazos em aberto"), a:has-text("Prazos em Aberto")').first();
  if (await openLink.count() > 0) {
    const href = await openLink.getAttribute('href');
    if (href) {
      await page.goto(new URL(href, page.url()).href, { waitUntil: 'domcontentloaded', timeout: 60_000 });
      results.openDeadlines = await readEprocDeadlineRows(page);
    }
  }

  // 2. Intimações pendentes
  await navigateToEprocPanel(page);
  const pendingLink = page.locator('a[href*="acao=citacao_intimacao_pendente_listar"], a:has-text("pendentes de citação"), a:has-text("pendente de citação"), a:has-text("Pendentes de Intimação")').first();
  if (await pendingLink.count() > 0) {
    const href = await pendingLink.getAttribute('href');
    if (href) {
      await page.goto(new URL(href, page.url()).href, { waitUntil: 'domcontentloaded', timeout: 60_000 });
      results.pendingIntimations = await readEprocDeadlineRows(page);
    }
  }

  return results;
}

/**
 * Lê as linhas da tabela de intimações/prazos do eproc
 */
export async function readEprocDeadlineRows(page) {
  return page.locator('table').evaluateAll(tables => {
    const table = tables.find(candidate => {
      const headers = [...candidate.querySelectorAll('th, td')].map(cell => cell.textContent.trim());
      return headers.some(h => /Processo/i.test(h)) && headers.some(h => /Evento|Prazo/i.test(h));
    }) || tables.find(candidate => candidate.innerText && /\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}/.test(candidate.innerText));
    if (!table) return [];

    const firstRowCells = [...(table.querySelector('tr') ? table.querySelector('tr').querySelectorAll('th, td') : [])];
    const headerTexts = firstRowCells.map(c => c.innerText.trim());
    const classIdx = headerTexts.findIndex(h => /Classe/i.test(h));
    const subjectIdx = headerTexts.findIndex(h => /Assunto/i.test(h));
    const eventIdx = headerTexts.findIndex(h => /Evento/i.test(h));
    const sentIdx = headerTexts.findIndex(h => /Expedi|Envio|Data/i.test(h));
    const startsIdx = headerTexts.findIndex(h => /Início|Ciência|Abertura/i.test(h));
    const deadlineIdx = headerTexts.findIndex(h => /Fim|Final|Término|Limite|Prazo/i.test(h));

    return [...table.rows].slice(1).map(row => {
      const cells = [...row.cells].map(cell => cell.innerText.trim().replace(/\s+/g, ' '));
      const rowText = row.innerText.trim().replace(/\s+/g, ' ');
      const processMatch = rowText.match(/\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}/);
      if (!processMatch) return null;

      const dateMatches = rowText.match(/\d{2}\/\d{2}\/\d{4}(?:\s+\d{2}:\d{2}(?::\d{2})?)?/g) || [];
      const rawDeadline = deadlineIdx >= 0 && cells[deadlineIdx] ? cells[deadlineIdx] : (dateMatches[dateMatches.length - 1] || '');
      const rawSent = sentIdx >= 0 && cells[sentIdx] ? cells[sentIdx] : (dateMatches[0] || '');
      const rawStarts = startsIdx >= 0 && cells[startsIdx] ? cells[startsIdx] : (dateMatches[1] || dateMatches[0] || '');

      return {
        processNumber: processMatch[0],
        processDetails: cells[1] || rowText.slice(0, 300),
        className: classIdx >= 0 && cells[classIdx] ? cells[classIdx] : (cells[2] || ''),
        subject: subjectIdx >= 0 && cells[subjectIdx] ? cells[subjectIdx] : (cells[3] || ''),
        event: eventIdx >= 0 && cells[eventIdx] ? cells[eventIdx] : (cells[4] || 'Intimação eletrônica'),
        sentAt: rawSent,
        startsAt: rawStarts,
        deadlineAt: rawDeadline
      };
    }).filter(Boolean);
  });
}

/**
 * Coleta processos do relatório do eproc (com paginação)
 */
export async function collectEprocProcessReport(page, maxPages = 5) {
  await navigateToEprocProcessReport(page);

  // Se houver botão "Buscar" ou filtro, clica para carregar tudo
  const searchBtn = page.locator('#sbmBuscar, input[name="sbmBuscar"], button:has-text("Buscar")').first();
  if (await searchBtn.count() > 0 && await searchBtn.isVisible().catch(() => false)) {
    await searchBtn.click();
    await page.waitForLoadState('domcontentloaded', { timeout: 60_000 }).catch(() => {});
    await page.waitForTimeout(1_500);
  }

  const collected = [];
  const pager = page.locator('select#selInfraPaginacaoSuperior, select[name="selInfraPaginacaoSuperior"]').first();
  const totalPages = (await pager.count()) > 0
    ? Math.min(maxPages, await pager.locator('option').count().catch(() => 1))
    : 1;

  for (let pageIdx = 0; pageIdx < totalPages; pageIdx++) {
    const rows = await page.locator('table').evaluateAll(tables => {
      const table = tables.find(candidate => {
        const headers = [...candidate.querySelectorAll('th')].map(cell => cell.textContent.trim());
        return headers.some(h => /Número Processo/i.test(h)) && headers.some(h => /Último Evento/i.test(h));
      });
      if (!table) return [];

      return [...table.rows].slice(1).map(row => {
        const cells = [...row.cells].map(c => c.innerText.trim().replace(/\s+/g, ' '));
        const numMatch = (cells[0] || cells[1] || '').match(/\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}/);
        const linkElem = row.querySelector('a[href*="processo_selecionar"], a[href*="processo_detalhes"]');
        return {
          number: numMatch ? numMatch[0] : '',
          actionClass: cells[1] || '',
          plaintiff: cells[2] || '',
          defendant: cells[3] || '',
          courtLocation: cells[4] || '',
          subject: cells[5] || '',
          lastEvent: cells[6] || '',
          lastEventDate: cells[7] || '',
          filedDate: cells[8] || '',
          caseValue: cells[9] || '',
          selectHref: linkElem ? linkElem.getAttribute('href') : null
        };
      }).filter(r => r.number);
    });

    collected.push(...rows);
    if (pageIdx + 1 >= totalPages) break;

    const nextVal = await pager.locator('option').nth(pageIdx + 1).getAttribute('value');
    if (nextVal !== null) {
      await pager.selectOption(nextVal);
      await page.waitForLoadState('domcontentloaded', { timeout: 60_000 }).catch(() => {});
      await page.waitForTimeout(1_000);
    }
  }

  return collected;
}

/**
 * Extrai todos os dados estruturados e a lista de movimentações (eventos) da página de detalhes
 */
export async function extractProcessDetails(page) {
  // 1. Expande o painel "Informações Adicionais" se a chave/conteúdo ainda não estiver visível
  try {
    const isChaveVisible = await page.locator('#imgChaveProcesso, #spnChaveProcesso').first().isVisible().catch(() => false);
    if (!isChaveVisible) {
      const infAdicionalBtn = page.locator('#imgStatusInfAdicional, [title*="Informações Adicionais" i], #fldInformacoesAdicionais legend, legend:has-text("Informações Adicionais")').first();
      if (await infAdicionalBtn.count() > 0) {
        await infAdicionalBtn.click().catch(() => {});
        await page.waitForTimeout(500);
      }
    }
  } catch {}

  // 2. Clica no ícone de chave/cadeado para buscar/revelar a Chave do Processo se ainda não estiver preenchida
  try {
    const hasKeyVal = await page.evaluate(() => {
      const s = document.querySelector('#spnChaveProcesso');
      return Boolean(s && s.innerText && s.innerText.replace(/\D/g, '').length >= 6);
    }).catch(() => false);

    if (!hasKeyVal) {
      const chaveBtn = page.locator('#imgChaveProcesso, [title*="Chave do Processo" i], [title*="Buscar Chave" i], [onclick*="buscarChaveProcesso" i]').first();
      if (await chaveBtn.count() > 0 && await chaveBtn.isVisible().catch(() => false)) {
        await chaveBtn.click().catch(() => {});
        await page.waitForTimeout(800);
      }
    }
  } catch {}

  return page.evaluate(() => {
    const getText = (selector) => {
      const el = document.querySelector(selector);
      return el ? el.innerText.trim().replace(/\s+/g, ' ') : '';
    };

    const cnjMatch = document.body.innerText.match(/\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}/);
    const number = cnjMatch ? cnjMatch[0] : '';

    // Extração dos campos da capa / cabeçalho
    const bodyText = document.body.innerText;
    const findField = (label) => {
      const regex = new RegExp(`${label}[:\\s]+([^\\n\\r]+)`, 'i');
      const m = bodyText.match(regex);
      return m ? m[1].trim() : '';
    };

    const actionClass = findField('Classe da ação') || findField('Classe');
    const competence = findField('Competência');
    const distributionDate = findField('Data de autuação') || findField('Data autuação');
    const court = findField('Órgão Julgador');
    const judge = findField('Juiz\\(a\\)') || findField('Magistrado');
    const status = findField('Situação');

    // Valor da Causa (suporta quebra de linha entre rótulo e valor)
    let caseValue = '';
    const mVal = bodyText.match(/Valor\s*(?:da)?\s*Causa[:\s]*[\r\n\s]*(R\$\s*[\d.,]+|[\d.,]+)/i);
    if (mVal) {
      caseValue = mVal[1].trim();
    } else {
      caseValue = findField('Valor da Causa');
    }

    // Chave do Processo
    let accessKey = '';
    const spnKey = document.querySelector('#spnChaveProcesso, [id*="ChaveProcesso"]');
    if (spnKey && spnKey.innerText.trim()) {
      const digits = spnKey.innerText.trim().replace(/\D/g, '');
      if (digits.length >= 6) accessKey = digits;
    }
    if (!accessKey) {
      const mKey = bodyText.match(/Chave\s*(?:do)?\s*Processo[:\s]*[\r\n\s]*(\d{6,30})/i);
      if (mKey) accessKey = mKey[1].trim();
    }

    // Segredo de Justiça
    const isSecrecy = /Segredo de Justiça/i.test(bodyText) || /Sigilo/i.test(bodyText);
    const secrecyLevelMatch = bodyText.match(/Segredo de Justiça\s*(\([^)]+\))?/i);
    const secrecyLevel = secrecyLevelMatch ? (secrecyLevelMatch[1] ? `Segredo de Justiça ${secrecyLevelMatch[1].trim()}` : 'Segredo de Justiça') : (isSecrecy ? 'Segredo de Justiça' : '');

    // Partes (ignora tabela de eventos/movimentações para não poluir com textos de intimação)
    // Partes e Representantes
    const parties = [];
    const partyTables = [...document.querySelectorAll('#tblPartesERepresentantes, table')].filter(t => {
      if (t.id === 'tblPartesERepresentantes') return true;
      const text = t.innerText;
      const isEvents = text.includes('Evento') && (text.includes('Data/Hora') || text.includes('Descrição'));
      return !isEvents && (/AUTOR|RÉU|EXEQUENTE|EXECUTADO|REQUERENTE|REQUERIDO|EMBARGANTE|EMBARGADO|IMPUGNANTE|IMPUGNADO|PACIENTE|AGRAVANTE|AGRAVADO|APELANTE|APELADO|Polo|Partes/i.test(text));
    });
    partyTables.forEach(table => {
      [...table.querySelectorAll('tr')].forEach(row => {
        const text = row.innerText.trim();
        if (text) parties.push(text.replace(/\s+/g, ' '));
      });
    });

    // Eventos do Processo (Movimentações)
    const movements = [];
    const eventsTable = [...document.querySelectorAll('table')].find(t => {
      const h = t.innerText;
      return h.includes('Evento') && (h.includes('Data/Hora') || h.includes('Descrição'));
    });

    if (eventsTable) {
      const rows = [...eventsTable.querySelectorAll('tr')].slice(1);
      rows.forEach(row => {
        const cells = [...row.querySelectorAll('td')].map(c => c.innerText.trim().replace(/\s+/g, ' '));
        if (cells.length >= 3) {
          const docs = [];
          const docLinks = [...row.querySelectorAll('a')].filter(a => {
            const h = a.getAttribute('href') || '';
            return h.includes('acessar_documento') || h.includes('documento_download') || h.includes('controlador.php');
          });
          docLinks.forEach(a => {
            docs.push({
              name: a.innerText.trim(),
              href: a.getAttribute('href')
            });
          });

          movements.push({
            sequence: cells[0] || '',
            date: cells[1] || '',
            description: cells[2] || '',
            user: cells[3] || '',
            documents: docs
          });
        }
      });
    }

    // Extração estruturada de pólos: Cliente e Adversa (Parte Contrária)
    let clientName = '';
    let clientDocument = '';
    let clientPosition = '';
    let opposingParty = '';
    let opposingPartyDocument = '';
    let opposingPosition = '';

    const lawyerRe = /RICARDO DE LUCA ROSSETTO|LEANDRO RICARDO ROSSETTO|RS135294|RS034110|04276712050|029238|057243|KELLER/i;

    const partesTable = document.querySelector('#tblPartesERepresentantes');
    if (partesTable) {
      const ths = [...partesTable.querySelectorAll('th')];
      const trs = [...partesTable.querySelectorAll('tr')];
      const dataRow = trs.find(tr => tr.querySelector('td.autorReu, td'));
      if (dataRow) {
        const tds = [...dataRow.querySelectorAll('td')];
        const poles = [];

        tds.forEach((td, idx) => {
          const header = ths[idx]?.innerText?.trim() || '';
          const nameEl = td.querySelector('.infraNomeParte, a[data-parte]');
          let name = nameEl ? nameEl.innerText.trim() : '';

          const cpfEl = td.querySelector('[id*="spnCpfParte"], [title*="Copiar CPF"]');
          let doc = cpfEl ? cpfEl.innerText.trim().replace(/\s+/g, '') : '';
          if (!doc) {
            const mDoc = td.innerText.match(/\((\d{2,3}\.?\d{3}\.?\d{3}[-\/]?\d{2,4}[-\/]?\d{0,2})\)/);
            if (mDoc) doc = mDoc[1].trim();
          }

          if (!name) {
            const lines = td.innerText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
            for (const l of lines) {
              if (/Tipo de Usuário|ADVOGADO|PROCURADOR|MINISTÉRIO/i.test(l)) continue;
              if (lawyerRe.test(l)) continue;
              const clean = l
                .replace(/^(AUTOR|RÉU|EXEQUENTE|EXECUTADO|REQUERENTE|REQUERIDO)[:\s]*/i, '')
                .replace(/\(\d{2,3}\.?\d{3}\.?\d{3}[-\/]?\d{2,4}[-\/]?\d{0,2}\).*/, '')
                .replace(/\(Sucessor.*?\).*/i, '')
                .replace(/-\s*Pessoa.*|JG.*|RS\d+.*/i, '')
                .trim();
              if (clean.length > 2 && !/^(AUTOR|RÉU|EXEQUENTE|EXECUTADO|REQUERENTE|REQUERIDO)$/i.test(clean)) {
                name = clean;
                break;
              }
            }
          }

          const isLawyerHere = lawyerRe.test(td.innerText);
          poles.push({
            role: header,
            name,
            document: doc,
            isLawyerHere,
            rawText: td.innerText.trim()
          });
        });

        const clientPole = poles.find(p => p.isLawyerHere) || poles[0];
        const oppPole = poles.find(p => p !== clientPole);

        if (clientPole) {
          clientName = clientPole.name;
          clientDocument = clientPole.document;
          clientPosition = clientPole.role;
        }
        if (oppPole) {
          opposingParty = oppPole.name;
          opposingPartyDocument = oppPole.document;
          opposingPosition = oppPole.role;
        }
      }
    }

    // Fallbacks para cliente
    if (!clientName) {
      if (partesTable) {
        const cells = [...partesTable.querySelectorAll('td, th, tr')];
        for (const cell of cells) {
          const cellText = cell.innerText || '';
          if (lawyerRe.test(cellText)) {
            const lines = cellText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
            for (const line of lines) {
              if (!lawyerRe.test(line) && !/Tipo de Usuário|ADVOGADO|OAB|PROCURADOR|MINISTÉRIO|PÚBLICO/i.test(line)) {
                const clean = line
                  .replace(/^(AUTOR|RÉU|EXEQUENTE|EXECUTADO|REQUERENTE|REQUERIDO)[:\s]*/i, '')
                  .replace(/\s*\(\d{2,3}\.?\d{3}\.?\d{3}[-\/]?\d{2,4}[-\/]?\d{0,2}\).*/, '')
                  .replace(/\s*\(Sucessor.*?\).*/i, '')
                  .replace(/\s*-\s*Pessoa.*|\s*JG.*|\s*RS\d+.*/i, '')
                  .trim();
                if (clean && clean.length > 2 && !/^(AUTOR|RÉU|EXEQUENTE|EXECUTADO|REQUERENTE|REQUERIDO)$/i.test(clean)) {
                  clientName = clean;
                  break;
                }
              }
            }
            if (clientName) break;
          }
        }
      }
    }

    if (!clientName) {
      const activePole = parties.find(p => /AUTOR|EXEQUENTE|REQUERENTE|EMBARGANTE|AGRAVANTE/i.test(p) && !/RÉU|EXECUTADO|REQUERIDO/i.test(p)) || parties[0];
      if (activePole) {
        clientName = activePole
          .replace(/^(AUTOR|RÉU|EXEQUENTE|EXECUTADO|REQUERENTE|REQUERIDO|EMBARGANTE|EMBARGADO)[:\s]*/i, '')
          .split('(')[0].split('-')[0].trim();
      }
    }
    if (!clientName) clientName = 'Cliente Geral';

    return {
      number,
      clientName,
      clientDocument,
      clientPosition,
      opposingParty,
      opposingPartyDocument,
      opposingPosition,
      actionClass,
      competence,
      distributionDate,
      court,
      judge,
      status,
      caseValue,
      accessKey,
      secrecy: isSecrecy,
      secrecyLevel,
      partiesSummary: parties.slice(0, 10).join(' | '),
      movementsCount: movements.length,
      movements
    };
  });
}

/**
 * Faz o download dos documentos do processo (agendamento do arquivo completo + download das peças individuais)
 * e organiza na pasta data/storage/processos/{cliente}/{processo}/
 */
export async function downloadAndOrganizeProcessDocuments(page, {
  cnj,
  clientName = 'Cliente Geral',
  targetBaseDir,
  state = null,
  maxPieces = 25
}) {
  const safeClient = sanitizeDocumentFilename(clientName).trim() || 'Cliente';
  const safeCnj = cnj.replace(/[^\w.-]/g, '_');
  const storageDir = targetBaseDir || path.join(process.cwd(), 'data', 'storage', 'processos', safeClient, safeCnj);
  await mkdir(storageDir, { recursive: true });

  console.log(`[eproc] Iniciando download das peças para: ${storageDir}`);
  const downloadedFiles = [];

  // 1. Aciona agendamento de Download Completo dos autos (Processo Integral)
  const downloadAllBtn = page.locator('#btnDownloadCompletoRS, a:has-text("DownloadCompleto"), a:has-text("Download Completo")').first();
  if (await downloadAllBtn.count() > 0 && await downloadAllBtn.isVisible().catch(() => false)) {
    try {
      console.log('[eproc] Botão "Download Completo" localizado. Solicitando geração dos autos integrais...');
      await downloadAllBtn.click();
      await page.waitForLoadState('domcontentloaded', { timeout: 30_000 }).catch(() => {});
      await page.waitForTimeout(1_500);

      const chkEventos = page.locator('#chkMostrarListaDeEventosNaCapaDoProcesso').first();
      if (await chkEventos.count() > 0) await chkEventos.check().catch(() => {});
      const chkAnexos = page.locator('#chkIncluirAnexosEletronicos').first();
      if (await chkAnexos.count() > 0) await chkAnexos.check().catch(() => {});

      const gerarBtn = page.locator('#btnGerar, button:has-text("Gerar Arquivo Completo")').first();
      if (await gerarBtn.count() > 0) {
        await gerarBtn.click();
        await page.waitForLoadState('domcontentloaded', { timeout: 30_000 }).catch(() => {});
        console.log('[eproc] Agendamento de Download Completo solicitado com sucesso no eproc TJRS!');
      }

      // Retorna para os detalhes do processo
      const voltarBtn = page.locator('#btnVoltar, button:has-text("Voltar"), a:has-text("Voltar")').first();
      if (await voltarBtn.count() > 0) {
        await voltarBtn.click();
        await page.waitForLoadState('domcontentloaded', { timeout: 30_000 }).catch(() => {});
      } else {
        await page.goBack().catch(() => {});
      }
      await page.waitForTimeout(1_500);
    } catch (err) {
      console.warn(`[eproc] Aviso ao agendar Download Completo: ${err.message}`);
    }
  }

  // 2. Coleta de peças individuais diretamente da tabela de eventos
  const piecesToDownload = await page.evaluate(() => {
    const list = [];
    const rows = [...document.querySelectorAll('table tr')];
    rows.forEach(row => {
      const cells = [...row.querySelectorAll('td')].map(c => c.innerText.trim().replace(/\s+/g, ' '));
      if (cells.length >= 3) {
        const seq = cells[0] || '';
        const desc = cells[2] || '';
        const links = [...row.querySelectorAll('a')].filter(a => {
          const h = a.getAttribute('href') || '';
          const t = a.innerText.trim();
          if (!t) return false;
          if (h.includes('processo_selecionar') || h.includes('painel_adv') || h.includes('#')) return false;
          return h.includes('acessar_documento') ||
                 h.includes('documento_download') ||
                 h.includes('documento_visualizar') ||
                 h.includes('arvore_documento') ||
                 /^(?:PET|PROC|DOC|SENT|DEC|DESP|TERMO|CERT|OFIC|MAND|LAUDO|CONTR|INF|INDICE|00\d|\d+)/i.test(t) ||
                 /download|peça|documento/i.test(t);
        });
        links.forEach(a => {
          list.push({
            seq,
            desc,
            linkText: a.innerText.trim(),
            href: a.getAttribute('href')
          });
        });
      }
    });
    return list;
  });

  console.log(`[eproc] Encontradas ${piecesToDownload.length} peças documentais anexadas aos eventos.`);
  const limit = Math.min(piecesToDownload.length, maxPieces);

  for (let i = 0; i < limit; i++) {
    const piece = piecesToDownload[i];
    const linkLocator = page.locator(`a[href="${piece.href}"]`).first();
    if (await linkLocator.count() === 0) continue;

    try {
      console.log(`[eproc] Baixando peça [${i + 1}/${limit}]: Evento ${piece.seq} — ${piece.linkText}...`);
      const [docPage] = await Promise.all([
        page.context().waitForEvent('page', { timeout: 15_000 }),
        linkLocator.click()
      ]);

      await docPage.waitForLoadState('domcontentloaded', { timeout: 20_000 }).catch(() => {});
      await docPage.waitForTimeout(1_000);

      const iframe = docPage.locator('iframe').first();
      if (await iframe.count() > 0) {
        const iframeSrc = await iframe.getAttribute('src');
        if (iframeSrc) {
          const base64Data = await docPage.evaluate(async (src) => {
            const resp = await fetch(src);
            const blob = await resp.blob();
            return new Promise((resolve) => {
              const reader = new FileReader();
              reader.onloadend = () => resolve(reader.result);
              reader.readAsDataURL(blob);
            });
          }, iframeSrc);

          if (base64Data && base64Data.includes(',')) {
            const buffer = Buffer.from(base64Data.split(',')[1], 'base64');
            const pad = String(piece.seq || i + 1).padStart(3, '0');
            const safePieceName = sanitizeDocumentFilename(`${pad} - ${piece.linkText} - ${piece.desc.slice(0, 40)}`);
            const filename = `${safePieceName}.pdf`;
            const targetPath = path.join(storageDir, filename);

            await writeFile(targetPath, buffer);
            downloadedFiles.push({
              name: filename,
              path: targetPath,
              type: 'peca',
              size: buffer.length,
              sequence: piece.seq,
              description: piece.desc
            });
            console.log(`[eproc] Peça gravada com sucesso: ${filename} (${buffer.length} bytes)`);
          }
        }
      }
      await docPage.close().catch(() => {});
    } catch (pieceErr) {
      console.warn(`[eproc] Aviso ao baixar peça ${piece.linkText}: ${pieceErr.message}`);
    }
  }

  // 3. Gera o Índice e Termo dos Autos em PDF
  console.log(`[eproc] Gerando termo de índice dos autos com ${downloadedFiles.length} peças registradas...`);
  const indexDoc = generateAutosIndexPdf({
    cnj,
    client: clientName,
    court: 'Tribunal de Justiça do Rio Grande do Sul - eproc 1G',
    secrecy: false,
    pieces: downloadedFiles.map(f => ({
      date: new Date().toISOString().slice(0, 10),
      title: f.name.replace(/\.pdf$/i, ''),
      fileName: f.name,
      pageCount: 1,
      size: f.size || 1024
    })),
    folderPath: storageDir
  });

  const indexFilePath = path.join(storageDir, indexDoc.fileName);
  await writeFile(indexFilePath, indexDoc.binary);
  downloadedFiles.unshift({
    name: indexDoc.fileName,
    path: indexFilePath,
    type: 'indice',
    size: indexDoc.binary.length
  });

  console.log(`[eproc] Termo de índice gravado: ${indexDoc.fileName}`);

  return {
    ok: true,
    storageDir,
    totalFiles: downloadedFiles.length,
    files: downloadedFiles
  };
}
