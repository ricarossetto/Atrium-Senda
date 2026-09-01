import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  collectUiV2LayoutEvidence,
  prepareUiV2Page,
  startUiV2Session,
  switchUiV2View
} from './ui_v2_helpers.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT = path.join(ROOT, 'artifacts', 'visual-qa', 'ui-v2-iconography');
fs.mkdirSync(OUTPUT, { recursive: true });

const SCENARIOS = [
  { file: '01-sidebar-expanded-light.png', theme: 'light', viewport: { width: 1440, height: 900 }, view: 'dashboard', nav: 'dashboard' },
  { file: '02-sidebar-expanded-dark.png', theme: 'dark', viewport: { width: 1440, height: 900 }, view: 'dashboard', nav: 'dashboard' },
  { file: '03-sidebar-collapsed-light.png', theme: 'light', viewport: { width: 1440, height: 900 }, view: 'processes', nav: 'processes', collapsed: true },
  { file: '04-sidebar-collapsed-dark.png', theme: 'dark', viewport: { width: 1440, height: 900 }, view: 'inbox', nav: 'inbox', collapsed: true },
  { file: '05-topbar-actions-light.png', theme: 'light', viewport: { width: 1280, height: 800 }, view: 'dashboard', nav: 'dashboard', focus: '#syncButton' },
  { file: '06-processes-publications-dark.png', theme: 'dark', viewport: { width: 1280, height: 800 }, view: 'processes', nav: 'processes' },
  { file: '07-tasks-agenda-light.png', theme: 'light', viewport: { width: 1280, height: 800 }, view: 'kanban', nav: 'kanban' },
  { file: '08-contacts-leads-dark.png', theme: 'dark', viewport: { width: 1280, height: 800 }, view: 'contacts', nav: 'contacts' },
  { file: '09-financial-documents-light.png', theme: 'light', viewport: { width: 1280, height: 800 }, view: 'financial', nav: 'financial' },
  { file: '10-assistant-prompts-dark.png', theme: 'dark', viewport: { width: 1280, height: 800 }, view: 'assistant', nav: 'assistant' },
  { file: '11-system-group-light.png', theme: 'light', viewport: { width: 1024, height: 768 }, view: 'integrations', nav: 'integrations' },
  { file: '12-audit-links-dark.png', theme: 'dark', viewport: { width: 1024, height: 768 }, view: 'audit', nav: 'audit' },
  { file: '13-mobile-navigation-light.png', theme: 'light', viewport: { width: 390, height: 844 }, view: 'dashboard', nav: 'dashboard', mobile: true },
  { file: '14-mobile-navigation-dark.png', theme: 'dark', viewport: { width: 390, height: 844 }, view: 'links', nav: 'links', mobile: true }
];

async function waitForStableLayout(page) {
  await page.waitForFunction(() => new Promise(resolve => {
    let frames = 0;
    let previous = '';
    const observe = () => {
      const sidebar = document.getElementById('sidebar')?.getBoundingClientRect();
      const active = document.querySelector('.view.active')?.getBoundingClientRect();
      const state = [scrollX, scrollY, sidebar?.x, sidebar?.width, active?.x, active?.width, active?.height]
        .map(value => Math.round((value || 0) * 10) / 10).join('|');
      const animationsDone = document.getAnimations().every(animation => animation.playState === 'finished');
      frames = state === previous && animationsDone ? frames + 1 : 0;
      previous = state;
      if (frames >= 4) resolve(true);
      else requestAnimationFrame(observe);
    };
    requestAnimationFrame(observe);
  }));
}

const session = await startUiV2Session();
const hashes = new Set();
let assertions = 0;
try {
  for (const scenario of SCENARIOS) {
    const context = await session.createContext({ viewport: scenario.viewport, reducedMotion: 'reduce' });
    try {
      const { page, pageErrors } = await prepareUiV2Page(context, session.server.baseUrl, { theme: scenario.theme });
      await switchUiV2View(page, scenario.view);
      if (scenario.collapsed) {
        await page.locator('#sidebarToggleBtn').click();
        await page.locator('#sidebar.collapsed').waitFor();
      }
      if (scenario.mobile) {
        await page.locator('#menuToggle').click();
        await page.locator('#sidebar.open').waitFor();
      }
      const activeNav = page.locator(`.nav-item[data-view="${scenario.nav}"]`);
      await activeNav.scrollIntoViewIfNeeded();
      if (scenario.focus) await page.locator(scenario.focus).focus();
      await waitForStableLayout(page);

      const evidence = await page.evaluate(({ selectedNav, isCollapsed, isMobile }) => {
        const navItems = [...document.querySelectorAll('.nav-item[data-view]')];
        const activeItem = document.querySelector(`.nav-item[data-view="${selectedNav}"]`);
        const activeIcon = activeItem?.querySelector('svg.atrium-icon');
        const iconRects = navItems.map(item => {
          const itemRect = item.getBoundingClientRect();
          const icon = item.querySelector('svg.atrium-icon');
          const iconRect = icon?.getBoundingClientRect();
          return {
            width: iconRect?.width || 0,
            height: iconRect?.height || 0,
            within: iconRect ? iconRect.left >= itemRect.left - 1 && iconRect.right <= itemRect.right + 1 && iconRect.top >= itemRect.top - 1 && iconRect.bottom <= itemRect.bottom + 1 : false,
            centered: iconRect ? Math.abs((itemRect.top + itemRect.height / 2) - (iconRect.top + iconRect.height / 2)) <= 2 : false
          };
        });
        const activeStyle = activeIcon ? getComputedStyle(activeIcon) : null;
        const mobileControls = isMobile ? [...document.querySelectorAll('#menuToggle, #themeToggleButton, #syncButton, .notification-button')].map(control => {
          const rect = control.getBoundingClientRect();
          return { width: rect.width, height: rect.height };
        }) : [];
        return {
          navCount: navItems.length,
          iconRects,
          active: activeItem?.classList.contains('active'),
          activeColor: activeStyle?.color,
          activeOpacity: activeStyle?.opacity,
          sidebarState: isMobile ? document.getElementById('sidebar')?.classList.contains('open') : document.getElementById('sidebar')?.classList.contains('collapsed') === isCollapsed,
          mobileControls,
          globalOverflow: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth,
          duplicateIds: [...document.querySelectorAll('[id]')].map(element => element.id).filter((id, index, ids) => ids.indexOf(id) !== index)
        };
      }, { selectedNav: scenario.nav, isCollapsed: Boolean(scenario.collapsed), isMobile: Boolean(scenario.mobile) });

      assert.equal(evidence.navCount, 17); assertions++;
      assert.ok(evidence.iconRects.every(rect => rect.width >= 18 && rect.width <= 20 && rect.height >= 18 && rect.height <= 20)); assertions++;
      assert.ok(evidence.iconRects.every(rect => rect.within && rect.centered)); assertions++;
      assert.equal(evidence.active, true); assertions++;
      assert.ok(evidence.activeColor && evidence.activeColor !== 'rgba(0, 0, 0, 0)' && evidence.activeOpacity !== '0'); assertions++;
      assert.equal(evidence.sidebarState, true); assertions++;
      assert.ok(evidence.mobileControls.every(rect => rect.width >= 43.5 && rect.height >= 43.5)); assertions++;
      assert.ok(evidence.globalOverflow <= 2, `${scenario.file}: overflow ${evidence.globalOverflow}px.`); assertions++;
      assert.deepEqual(evidence.duplicateIds, []); assertions++;
      const layout = await collectUiV2LayoutEvidence(page);
      assert.equal(layout.activeViews.length, 1); assertions++;
      assert.deepEqual(pageErrors, [], `${scenario.file}: ${pageErrors.join(' | ')}`); assertions++;

      const screenshotPath = path.join(OUTPUT, scenario.file);
      await page.screenshot({ path: screenshotPath, fullPage: false });
      hashes.add(crypto.createHash('sha256').update(fs.readFileSync(screenshotPath)).digest('hex'));
    } finally {
      await context.close();
    }
  }
} finally {
  await session.stop();
}

assert.equal(hashes.size, SCENARIOS.length, 'Os 14 cenários devem produzir imagens distintas.');
assertions++;
console.log(`✓ ${SCENARIOS.length}/${SCENARIOS.length} screenshots gerados.`);
console.log(`✓ ${hashes.size}/${SCENARIOS.length} hashes únicos.`);
console.log(`✓ ${assertions}/${assertions} asserções de iconografia e layout aprovadas.`);
