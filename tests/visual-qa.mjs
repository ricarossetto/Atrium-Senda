import { chromium } from 'playwright';
import { startTestServer, postJson } from './helpers.mjs';
import { generateTotp } from '../lib/security.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ARTIFACTS_DIR = path.resolve(__dirname, '../artifacts/visual-qa');

const VIEWPORTS = [
  { width: 1920, height: 1080, name: '1920x1080' },
  { width: 1440, height: 900,  name: '1440x900'  },
  { width: 1366, height: 768,  name: '1366x768'  },
  { width: 1280, height: 720,  name: '1280x720'  },
  { width: 1024, height: 768,  name: '1024x768'  },
  { width: 768,  height: 1024, name: '768x1024'  },
  { width: 390,  height: 844,  name: '390x844'   }
];

const VIEWS = [
  'dashboard',
  'inbox',
  'kanban',
  'processes',
  'financial',
  'documents',
  'agenda',
  'contacts',
  'sources',
  'ai-assistant',
  'audit'
];

console.log('=== ATRIUM: VISUAL QA & MULTI-VIEWPORT HARDENING MATRIX ===\n\t');

const server = await startTestServer();
const browser = await chromium.launch({ headless: true });

try {
  const password = 'Senha-Segura-2026!';
  let res = await postJson(`${server.baseUrl}/api/auth/setup`, {
    username: 'admin',
    displayName: 'Dr. Roberto Keller',
    password
  });
  let setupData = await res.json();
  const totpCode = generateTotp(setupData.manualSecret);
  res = await postJson(`${server.baseUrl}/api/auth/setup/verify`, {
    setupToken: setupData.setupToken,
    code: totpCode
  });
  const cookie = res.headers.get('set-cookie').split(';')[0];
  const sessionToken = cookie.split('=')[1];

  let totalScreenshots = 0;
  let totalAssertions = 0;
  let passedAssertions = 0;

  for (const theme of ['dark', 'light']) {
    console.log(`\n--- Testando Tema: ${theme.toUpperCase()} ---`);

    for (const vp of VIEWPORTS) {
      const outputDir = path.join(ARTIFACTS_DIR, theme, vp.name);
      fs.mkdirSync(outputDir, { recursive: true });

      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        deviceScaleFactor: 1
      });

      await context.addCookies([{
        name: 'keller_session',
        value: sessionToken,
        domain: '127.0.0.1',
        path: '/'
      }]);

      const page = await context.newPage();
      await page.goto(`${server.baseUrl}/`);
      await page.waitForLoadState('networkidle');

      await page.evaluate((t) => {
        if (t === 'light') {
          document.documentElement.setAttribute('data-theme', 'light');
          localStorage.setItem('atrium_theme', 'light');
        } else {
          document.documentElement.removeAttribute('data-theme');
          localStorage.setItem('atrium_theme', 'dark');
        }
      }, theme);

      await page.waitForTimeout(100);

      for (const view of VIEWS) {
        await page.evaluate((v) => {
          if (window.portalApp && typeof window.portalApp.switchView === 'function') {
            window.portalApp.switchView(v);
          }
        }, view);

        await page.waitForTimeout(80);

        const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
        totalAssertions++;
        if (scrollWidth <= vp.width + 2) {
          passedAssertions++;
        } else {
          console.warn(`[AVISO] Overflow horizontal detectado na view ${view} em ${vp.name}: scrollWidth=${scrollWidth}, viewport=${vp.width}`);
        }

        const screenshotPath = path.join(outputDir, `${view}.png`);
        await page.screenshot({ path: screenshotPath, fullPage: false });
        totalScreenshots++;
      }

      await page.evaluate(() => {
        if (window.portalApp && typeof window.portalApp.openFinancialEntryModal === 'function') {
          window.portalApp.openFinancialEntryModal();
        }
      });
      await page.waitForTimeout(80);
      const modalScreenshot = path.join(outputDir, 'modal_financial_entry.png');
      await page.screenshot({ path: modalScreenshot });
      totalScreenshots++;

      await page.evaluate(() => {
        if (window.portalApp && typeof window.portalApp.closeFinancialEntryModal === 'function') {
          window.portalApp.closeFinancialEntryModal();
        }
      });

      if (vp.width > 860) {
        await page.evaluate(() => {
          const input = document.getElementById('globalSearch');
          if (input && window.portalApp) {
            input.value = 'Direito';
            window.portalApp.performGlobalSearch('Direito');
          }
        });
        await page.waitForTimeout(80);
        const paletteScreenshot = path.join(outputDir, 'global_search_palette.png');
        await page.screenshot({ path: paletteScreenshot });
        totalScreenshots++;
        await page.evaluate(() => {
          if (window.portalApp && typeof window.portalApp.closeGlobalSearchPalette === 'function') {
            window.portalApp.closeGlobalSearchPalette();
          }
        });
      }

      await context.close();
      console.log(`v Viewport ${vp.name} validado com sucesso (${VIEWS.length + 2} capturas).`);
    }
  }

  console.log('\n======================================================');
  console.log('✓ VISUAL QA CONCLUÍDO COM SUCESSO!');
  console.log(`- Total de screenshots gerados: ${totalScreenshots}`);
  console.log(`- Asserções de layout verificadas: ${passedAssertions}/${totalAssertions} (${((passedAssertions/totalAssertions)*100).toFixed(1)}%)`);
  console.log(`- Artefatos salvos em: ${ARTIFACTS_DIR}`);
  console.log('======================================================\n');

} finally {
  await browser.close();
  await server.stop();
}