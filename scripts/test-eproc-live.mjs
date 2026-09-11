import { chromium } from 'playwright';
import { existsSync, readFileSync } from 'node:fs';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import readline from 'node:readline';
import { randomBytes } from 'node:crypto';

import { createModernizedPfx } from '../lib/judicial/a1-sandbox.mjs';
import { parseTotpUri } from '../lib/judicial/totp-sandbox.mjs';
import { SecurityManager, generateTotp } from '../lib/security.mjs';
import {
  authenticateEprocWithCertAndTotp,
  collectEprocDeadlines,
  openEprocProcessDetails,
  extractProcessDetails,
  downloadAndOrganizeProcessDocuments
} from '../collector/adapters/eproc.mjs';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.dirname(path.dirname(__filename));
const DATA_DIR = path.join(ROOT, 'data');
const APP_STATE_FILE = path.join(DATA_DIR, 'app-state.json');
const ENV_FILE = path.join(ROOT, '.env');

async function loadEnv(file) {
  if (!existsSync(file)) return;
  const source = await readFile(file, 'utf8');
  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const separator = line.indexOf('=');
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (!(key in process.env)) process.env[key] = value;
  }
}
await loadEnv(ENV_FILE);

// Padrões padrão configuráveis por ambiente ou CLI
const DEFAULT_PFX = process.env.A1_PFX_PATH || 'C:\\Users\\Ricardo PC\\OneDrive\\Escritorio\\BKP RICARDO\\OUTROS - PESSOAL\\certificado A1 RICARDO DE LUCA ROSSETTO_04276712050.pfx';
const DEFAULT_QR = process.env.TJRS_TOTP_QR_PATH || 'C:\\Users\\Ricardo PC\\Downloads\\tjrsqr.jpg';
const DEFAULT_CNJ = process.env.TARGET_CNJ || '5036499-16.2012.8.21.0001';

async function promptQuestion(query) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  return new Promise(resolve => rl.question(query, ans => {
    rl.close();
    resolve(ans.trim());
  }));
}

function extractQrText(qrImagePath) {
  const pyCode = `import cv2; d = cv2.QRCodeDetector(); val, _, _ = d.detectAndDecode(cv2.imread(r'${qrImagePath}')); print(val)`;
  const raw = execFileSync('python', ['-c', pyCode], { encoding: 'utf8' }).trim();
  if (!raw) throw new Error(`Não foi possível decodificar o QR code da imagem: ${qrImagePath}`);
  return raw;
}

function getTotpSecretFromImage(qrImagePath) {
  const qrText = extractQrText(qrImagePath);
  const parsed = parseTotpUri(qrText);
  if (parsed.type === 'migration') {
    const account = parsed.accounts.find(a => /eproc|tjrs/i.test(a.issuer) || /eproc|tjrs/i.test(a.name)) || parsed.accounts[0];
    if (!account) throw new Error('Nenhuma conta encontrada no payload de migração do QR code.');
    console.log(`[TOTP] Conta identificada: ${account.name} (Emissor: ${account.issuer})`);
    return account.secret;
  }
  if (parsed.account?.secret) {
    return parsed.account.secret;
  }
  throw new Error('Não foi possível extrair a chave secreta do QR code.');
}

async function main() {
  const args = process.argv.slice(2);
  const getArg = (flag, def = null) => {
    const idx = args.indexOf(flag);
    return idx >= 0 && args[idx + 1] ? args[idx + 1] : def;
  };
  const hasFlag = flag => args.includes(flag);

  const pfxPath = getArg('--pfx-path', DEFAULT_PFX);
  const qrPath = getArg('--qr-path', DEFAULT_QR);
  const targetCnj = getArg('--cnj', DEFAULT_CNJ);
  const headed = hasFlag('--headed') || !hasFlag('--headless');
  let passphrase = getArg('--pfx-pass', process.env.A1_PFX_PASSPHRASE || '');

  console.log('='.repeat(80));
  console.log(' ATRIUM — COLETOR EPROC TJRS (CERTIFICADO A1 + 2FA TOTP)');
  console.log('='.repeat(80));
  console.log(`PFX:     ${pfxPath}`);
  console.log(`QR Code: ${qrPath}`);
  console.log(`CNJ:     ${targetCnj}`);
  console.log(`Modo:    ${headed ? 'VISÍVEL (Headed)' : 'HEADLESS'}`);
  console.log('-'.repeat(80));

  if (!existsSync(pfxPath)) {
    console.error(`ERRO: Arquivo PFX não encontrado em: ${pfxPath}`);
    process.exit(1);
  }
  if (!existsSync(qrPath)) {
    console.error(`ERRO: Imagem do QR code não encontrada em: ${qrPath}`);
    process.exit(1);
  }

  // Solicita senha se não fornecida
  if (!passphrase) {
    passphrase = await promptQuestion('Digite a senha do certificado A1 (.pfx): ');
    if (!passphrase) {
      console.error('ERRO: A senha do certificado é obrigatória para prosseguir.');
      process.exit(1);
    }
  }

  // 1. Extração do Segredo TOTP
  console.log('\n[1/5] Decodificando QR Code e preparando gerador de segundo fator...');
  const totpSecret = getTotpSecretFromImage(qrPath);
  const sampleCode = generateTotp(totpSecret);
  console.log(`[1/5] Segredo 2FA validado com sucesso. Código TOTP atual gerado: ${sampleCode}`);

  // 2. Modernização e Preparação do Certificado PFX
  console.log('\n[2/5] Decifrando chave privada e modernizando PFX para o Chromium...');
  let modernCert;
  try {
    modernCert = await createModernizedPfx({ pfxPath, passphrase });
    console.log(`[2/5] Certificado modernizado criado temporariamente.`);
  } catch (err) {
    console.error(`[2/5] Falha ao decifrar certificado PFX: ${err.message}`);
    process.exit(1);
  }

  // 3. Inicialização do Navegador Playwright com mTLS
  console.log('\n[3/5] Inicializando Chromium com perfil isolado e mTLS configurado...');
  const profileDir = path.join(DATA_DIR, 'browser-profiles', 'agent-eproc-test');
  await mkdir(profileDir, { recursive: true });

  const clientCerts = [
    {
      origin: 'https://eproc1g.tjrs.jus.br',
      pfxPath: modernCert.modernPath,
      passphrase: modernCert.modernPassphrase
    },
    {
      origin: 'https://keycloak-httpd-mtls.tjrs.jus.br',
      pfxPath: modernCert.modernPath,
      passphrase: modernCert.modernPassphrase
    }
  ];

  const context = await chromium.launchPersistentContext(profileDir, {
    headless: !headed,
    viewport: { width: 1440, height: 960 },
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
    acceptDownloads: true,
    clientCertificates: clientCerts
  });

  const page = context.pages()[0] || (await context.newPage());

  try {
    // 4. Autenticação A1 + 2FA
    console.log('\n[4/5] Executando autenticação no eproc TJRS com mTLS + TOTP...');
    const authResult = await authenticateEprocWithCertAndTotp(page, 'https://eproc1g.tjrs.jus.br/eproc/', {
      totpSecret
    });

    if (!authResult.ok) {
      throw new Error('Não foi possível confirmar o login no eproc TJRS.');
    }
    console.log('[4/5] Sessão do advogado confirmada com sucesso!');
    console.log(`[eproc] URL pós-login confirmada: ${page.url()}`);

    const allLinks = await page.locator('a').evaluateAll(els => els.map(e => ({ text: e.innerText.replace(/\s+/g, ' ').trim(), href: e.href })).filter(e => e.text)).catch(() => []);
    console.log(`[eproc] Total de links detectados na página: ${allLinks.length}`);
    const relevantLinks = allLinks.filter(l => /relat|process|painel|consulta|intim/i.test(l.text) || /relat|process|painel|consulta/i.test(l.href));
    console.log('[eproc] Links relevantes encontrados:', JSON.stringify(relevantLinks.slice(0, 25), null, 2));

    // Coleta Prazos e Intimações no Painel
    console.log('\n[5/5] Coletando prazos em aberto e intimações pendentes do Painel...');
    const deadlines = await collectEprocDeadlines(page).catch(e => {
      console.warn(`Aviso ao ler prazos: ${e.message}`);
      return { openDeadlines: [], pendingIntimations: [] };
    });
    console.log(`-> Prazos em aberto encontrados: ${deadlines.openDeadlines?.length || 0}`);
    console.log(`-> Intimações pendentes:         ${deadlines.pendingIntimations?.length || 0}`);

    // Acessa o Processo Alvo
    if (targetCnj) {
      console.log(`\nConsultando detalhes e movimentações do processo: ${targetCnj}...`);
      await openEprocProcessDetails(page, targetCnj);
      const details = await extractProcessDetails(page);

      console.log('\n---------------- DADOS DO PROCESSO ----------------');
      console.log(`Número:       ${details.number}`);
      console.log(`Classe:       ${details.actionClass}`);
      console.log(`Competência:  ${details.competence}`);
      console.log(`Autuação:     ${details.distributionDate}`);
      console.log(`Juízo:        ${details.court}`);
      console.log(`Juiz:         ${details.judge}`);
      console.log(`Valor Causa:  ${details.caseValue}`);
      console.log(`Movimentações:${details.movementsCount} eventos registrados`);

      console.log('\nÚltimas movimentações:');
      details.movements.slice(0, 5).forEach(m => {
        console.log(`  [${m.sequence}] ${m.date} — ${m.description.slice(0, 70)} (Docs: ${m.documents.length})`);
      });

      // Baixa os documentos e organiza na pasta do sistema
      const clientName = details.clientName || '';
      console.log(`\nBaixando documentos e organizando na pasta (${clientName || 'Processos'})...`);

      const downloadResult = await downloadAndOrganizeProcessDocuments(page, {
        cnj: details.number || targetCnj,
        clientName,
        targetBaseDir: path.join(DATA_DIR, 'storage', 'processos', clientName.replace(/[^\w.-]/g, '_'), (details.number || targetCnj).replace(/[^\w.-]/g, '_')),
        maxPieces: 25
      });

      console.log('\n---------------- RESULTADO DO DOWNLOAD ----------------');
      console.log(`Pasta destino: ${downloadResult.storageDir}`);
      console.log(`Total de peças gravadas: ${downloadResult.totalFiles}`);
      downloadResult.files.forEach(f => {
        console.log(`  - [${f.type}] ${f.name} (${f.size || 0} bytes)`);
      });

      // Registra no app-state.json do ATRIUM se existir
      if (existsSync(APP_STATE_FILE)) {
        try {
          const rawContent = await readFile(APP_STATE_FILE, 'utf8');
          const parsed = JSON.parse(rawContent);
          let appState;
          let envelope = null;
          let secManager = null;

          if (parsed.encrypted && process.env.AUTH_SESSION_SECRET && process.env.AUTH_ENCRYPTION_KEY) {
            envelope = parsed;
            secManager = new SecurityManager({
              dataDirectory: DATA_DIR,
              sessionSecret: process.env.AUTH_SESSION_SECRET,
              encryptionKey: process.env.AUTH_ENCRYPTION_KEY
            });
            await secManager.init();
            appState = JSON.parse(secManager.decrypt(envelope.encrypted));
          } else {
            appState = parsed;
          }

          const nowIso = new Date().toISOString();

          // Atualiza dados do processo na base ATRIUM
          if (Array.isArray(appState.processes)) {
            let proc = appState.processes.find(p => p.number === targetCnj || p.id === targetCnj || (p.number && p.number.replace(/\D/g, '') === targetCnj.replace(/\D/g, '')));
            if (proc) {
              proc.court = details.court || proc.court;
              proc.judge = details.judge || proc.judge;
              proc.actionClass = details.actionClass || proc.actionClass;
              proc.competence = details.competence || proc.competence;
              proc.lastSyncAt = nowIso;
              proc.movementsCount = details.movementsCount || proc.movementsCount;
              proc.client = clientName;
              if (details.accessKey) {
                proc.accessKey = details.accessKey;
                proc.chaveAcesso = details.accessKey;
                if (!Array.isArray(proc.tags)) proc.tags = [];
                if (!proc.tags.includes('chave-disponivel')) proc.tags.push('chave-disponivel');
              }
              console.log(`[ATRIUM] Metadados do processo ${targetCnj} sincronizados com sucesso.`);
            }
          }

          // Registra os documentos baixados na base ATRIUM
          if (Array.isArray(appState.documents)) {
            let addedCount = 0;
            for (const f of downloadResult.files) {
              const already = appState.documents.some(d => d.name === f.name);
              if (!already) {
                appState.documents.push({
                  id: `doc-${Date.now()}-${randomBytes(4).toString('hex')}`,
                  name: f.name,
                  originalName: f.name,
                  mime: f.name.endsWith('.pdf') ? 'application/pdf' : 'application/octet-stream',
                  size: f.size || 1024,
                  createdAt: nowIso,
                  updatedAt: nowIso,
                  documentDate: nowIso.slice(0, 10),
                  ownerType: 'process',
                  ownerId: targetCnj,
                  documentType: f.type === 'indice' ? 'Índice de Autos' : 'Peça Processual',
                  metadata: {
                    origin: 'eproc TJRS',
                    tags: ['eproc', 'autos', 'tjrs'],
                    localPath: f.path,
                    description: f.description || ''
                  }
                });
                addedCount++;
              }
            }
            if (addedCount > 0) {
              if (secManager && envelope) {
                envelope.encrypted = secManager.encrypt(JSON.stringify(appState));
                envelope.updatedAt = nowIso;
                await writeFile(APP_STATE_FILE, JSON.stringify(envelope, null, 2), 'utf8');
              } else {
                await writeFile(APP_STATE_FILE, JSON.stringify(appState, null, 2), 'utf8');
              }
              console.log(`[ATRIUM] ${addedCount} documentos registrados com sucesso em app-state.json!`);
            }
          }
        } catch (stateErr) {
          console.warn(`Aviso ao atualizar app-state.json: ${stateErr.message}`);
        }
      }
    }

    console.log('\n' + '='.repeat(80));
    console.log(' OPERAÇÃO CONCLUÍDA COM SUCESSO NO EPROC TJRS!');
    console.log('='.repeat(80));
  } catch (error) {
    console.error('\nFALHA DURANTE A OPERAÇÃO:', error.message);
    if (headed) {
      console.log('Mantendo navegador aberto por 15 segundos para inspeção visual...');
      await page.waitForTimeout(15_000);
    }
  } finally {
    if (modernCert?.cleanup) await modernCert.cleanup().catch(() => {});
    await context.close().catch(() => {});
  }
}

main().catch(err => {
  console.error('Erro inesperado:', err);
  process.exit(1);
});
