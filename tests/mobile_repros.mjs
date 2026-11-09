import fs from 'node:fs';
import path from 'node:path';
import {
  prepareUiV2ConfigurationAdminFixture,
  prepareUiV2ContactsFixture,
  prepareUiV2FinancialFixture,
  prepareUiV2LinksFixture,
  prepareUiV2Page,
  prepareUiV2TasksFixture,
  startUiV2Session
} from './ui_v2_helpers.mjs';

const width = Number(process.argv[2] || 390);
const requested = process.argv[3] || 'all';
const outputs = path.resolve('artifacts', 'mobile-repros');
fs.mkdirSync(outputs, { recursive: true });

const session = await startUiV2Session();
const report = {};
try {
  const run = async (id, { fixture = null, action = null, dump }) => {
    if (requested !== 'all' && requested !== id) return;
    const context = await session.createContext({ viewport: { width, height: 844 } });
    try {
      const { page, pageErrors } = await prepareUiV2Page(context, session.server.baseUrl, { theme: 'light' });
      if (fixture) await fixture(page);
      if (action) await action(page);
      await page.waitForTimeout(320);
      const data = await page.evaluate(dump);
      const file = path.join(outputs, `${id}-${width}.png`);
      await page.screenshot({ path: file });
      report[id] = { ...data, pageErrors, file };
    } finally {
      await context.close();
    }
  };

  await run('config', {
    fixture: prepareUiV2ConfigurationAdminFixture,
    action: async page => { await page.evaluate(() => window.Atrium.App.switchView('configuration')); },
    dump: () => {
      const rect = element => { const value = element.getBoundingClientRect(); return { t: Math.round(value.top), l: Math.round(value.left), r: Math.round(value.right), b: Math.round(value.bottom), w: Math.round(value.width), h: Math.round(value.height) }; };
      const entries = [...document.querySelectorAll('#configurationTabs .configuration-nav-heading, #configurationTabs .configuration-nav-group > button, #configurationTabs .configuration-identity-entry, #configurationTabs .configuration-audit-entry')].filter(element => element.getClientRects().length);
      const overlaps = [];
      for (let index = 0; index < entries.length; index++) {
        for (let next = index + 1; next < entries.length; next++) {
          const a = entries[index].getBoundingClientRect();
          const b = entries[next].getBoundingClientRect();
          const overlapX = Math.min(a.right, b.right) - Math.max(a.left, b.left);
          const overlapY = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
          if (overlapX > 2 && overlapY > 2) overlaps.push({ a: entries[index].textContent.trim().slice(0, 24), b: entries[next].textContent.trim().slice(0, 24), overlapX: Math.round(overlapX), overlapY: Math.round(overlapY) });
        }
      }
      const topbar = document.querySelector('.topbar');
      const topbarOverlaps = topbar ? entries.filter(element => {
        const a = element.getBoundingClientRect();
        const b = topbar.getBoundingClientRect();
        return Math.min(a.right, b.right) - Math.max(a.left, b.left) > 2 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 2;
      }).map(element => element.textContent.replace(/\s+/g, ' ').trim().slice(0, 30)) : [];
      const identityEntry = document.querySelector('.configuration-identity-entry');
      const identity = identityEntry ? {
        entry: rect(identityEntry),
        overflow: identityEntry.scrollHeight - identityEntry.clientHeight,
        mark: identityEntry.querySelector('.configuration-identity-mark') ? rect(identityEntry.querySelector('.configuration-identity-mark')) : null,
        strong: identityEntry.querySelector('strong') ? rect(identityEntry.querySelector('strong')) : null,
        small: identityEntry.querySelector('small') ? rect(identityEntry.querySelector('small')) : null
      } : null;
      return {
        overflow: document.documentElement.scrollWidth - innerWidth,
        nav: document.getElementById('configurationTabs') ? rect(document.getElementById('configurationTabs')) : null,
        overlaps,
        topbarOverlaps,
        identity,
        entries: entries.map(element => ({ cls: String(element.className).slice(0, 44), text: element.textContent.replace(/\s+/g, ' ').trim().slice(0, 30), ...rect(element) }))
      };
    }
  });

  await run('office', {
    fixture: prepareUiV2ConfigurationAdminFixture,
    action: async page => {
      await page.evaluate(() => window.Atrium.App.switchView('configuration'));
      await page.locator('#openOfficeIdentityFromConfiguration').click();
      await page.locator('#officeSetupBackdrop:not(.hidden)').waitFor();
    },
    dump: () => {
      const rect = element => { const value = element.getBoundingClientRect(); return { t: Math.round(value.top), l: Math.round(value.left), r: Math.round(value.right), b: Math.round(value.bottom), w: Math.round(value.width), h: Math.round(value.height) }; };
      const modal = document.querySelector('.office-setup-modal');
      const layout = document.querySelector('.office-identity-layout');
      const form = document.getElementById('officeSetupForm');
      return {
        overflow: document.documentElement.scrollWidth - innerWidth,
        modal: modal ? rect(modal) : null,
        layout: layout ? { ...rect(layout), columns: getComputedStyle(layout).gridTemplateColumns, overflow: layout.scrollWidth - layout.clientWidth } : null,
        formOverflow: form ? form.scrollWidth - form.clientWidth : null,
        offscreen: modal ? [...modal.querySelectorAll('*')].filter(element => element.getClientRects().length).filter(element => element.getBoundingClientRect().right > innerWidth + 1).slice(0, 8).map(element => ({ cls: String(element.className).slice(0, 40), right: Math.round(element.getBoundingClientRect().right) })) : []
      };
    }
  });

  await run('office-sidebar', {
    fixture: prepareUiV2ConfigurationAdminFixture,
    action: async page => {
      await page.locator('#v2MobileMore').click();
      await page.locator('.sidebar.open').waitFor();
      await page.locator('.sidebar-office').click();
    },
    dump: () => {
      const rect = element => { const value = element.getBoundingClientRect(); return { t: Math.round(value.top), l: Math.round(value.left), r: Math.round(value.right), b: Math.round(value.bottom), w: Math.round(value.width), h: Math.round(value.height) }; };
      const sidebar = document.querySelector('.sidebar');
      const scrim = document.getElementById('sidebarScrim');
      const backdrop = document.getElementById('officeSetupBackdrop');
      const modal = document.querySelector('#officeSetupBackdrop .office-setup-modal');
      const centerTarget = document.elementFromPoint(Math.round(innerWidth / 2), Math.round(innerHeight / 2));
      return {
        overflow: document.documentElement.scrollWidth - innerWidth,
        sidebarOpen: sidebar?.classList.contains('open'),
        sidebarZ: sidebar ? getComputedStyle(sidebar).zIndex : null,
        sidebarRect: sidebar ? rect(sidebar) : null,
        scrim: scrim ? { visibility: getComputedStyle(scrim).visibility, opacity: getComputedStyle(scrim).opacity, z: getComputedStyle(scrim).zIndex } : null,
        backdropHidden: backdrop ? backdrop.classList.contains('hidden') : null,
        backdropZ: backdrop ? getComputedStyle(backdrop).zIndex : null,
        modal: modal ? { ...rect(modal), z: getComputedStyle(modal).zIndex } : null,
        topAtCenter: centerTarget ? { tag: centerTarget.tagName.toLowerCase(), cls: String(centerTarget.className).slice(0, 50) } : null,
        centerInsideModal: Boolean(modal && centerTarget && modal.contains(centerTarget)),
        htmlNavOpen: document.documentElement.hasAttribute('data-v2-nav-open')
      };
    }
  });

  await run('reports', {
    action: async page => { await page.evaluate(() => window.Atrium.App.switchView('reports')); },
    dump: () => {
      const rect = element => { const value = element.getBoundingClientRect(); return { t: Math.round(value.top), l: Math.round(value.left), r: Math.round(value.right), b: Math.round(value.bottom), w: Math.round(value.width), h: Math.round(value.height) }; };
      const wrap = document.querySelector('#view-reports .reports-table-wrap');
      const table = document.querySelector('#view-reports .reports-table');
      const empty = document.querySelector('#view-reports .reports-table td[colspan]');
      return {
        overflow: document.documentElement.scrollWidth - innerWidth,
        wrap: wrap ? { client: wrap.clientWidth, scroll: wrap.scrollWidth } : null,
        table: table ? rect(table) : null,
        blocks: [...document.querySelectorAll('#view-reports .reports-block')].map(element => ({ ...rect(element), head: element.querySelector('h3')?.textContent })),
        emptyCell: empty ? rect(empty) : null
      };
    }
  });

  await run('dashboard', {
    fixture: prepareUiV2TasksFixture,
    action: async page => { await page.evaluate(() => { window.Atrium.App.switchView('dashboard'); window.Atrium.App.renderAll(); }); },
    dump: () => {
      const rect = element => { const value = element.getBoundingClientRect(); return { t: Math.round(value.top), l: Math.round(value.left), r: Math.round(value.right), b: Math.round(value.bottom), w: Math.round(value.width), h: Math.round(value.height) }; };
      const item = document.querySelector('#dashboardTaskList .dashboard-task-item');
      if (!item) return { empty: true, overflow: document.documentElement.scrollWidth - innerWidth };
      const parts = {};
      for (const [key, selector] of Object.entries({ check: ':scope > input', body: '.dashboard-task-body', title: '.dashboard-task-title', process: '.dashboard-task-process', tags: '.dashboard-task-tags', date: '.dashboard-task-date' })) {
        const element = item.querySelector(selector);
        if (element) parts[key] = { ...rect(element), fontSize: getComputedStyle(element).fontSize };
      }
      return {
        overflow: document.documentElement.scrollWidth - innerWidth,
        item: rect(item),
        parts,
        contextChildren: [...item.querySelectorAll('.dashboard-task-process > *')].map(element => ({ cls: String(element.className).slice(0, 40), text: element.textContent.replace(/\s+/g, ' ').trim().slice(0, 28), ...rect(element) })),
        tagChildren: [...item.querySelectorAll('.dashboard-task-tags > *')].map(element => ({ cls: String(element.className).slice(0, 30), text: element.textContent.trim().slice(0, 22), ...rect(element) }))
      };
    }
  });

  await run('financial', {
    fixture: prepareUiV2FinancialFixture,
    dump: () => {
      const rect = element => { const value = element.getBoundingClientRect(); return { t: Math.round(value.top), l: Math.round(value.left), r: Math.round(value.right), b: Math.round(value.bottom), w: Math.round(value.width), h: Math.round(value.height) }; };
      const cards = [...document.querySelectorAll('#view-financial .financial-summary-band .metric-card')];
      return {
        overflow: document.documentElement.scrollWidth - innerWidth,
        cards: cards.map(card => {
          const strong = card.querySelector('strong');
          const copy = card.querySelector('div');
          return {
            ...rect(card),
            strong: strong ? { ...rect(strong), text: strong.textContent.trim().slice(0, 22) } : null,
            strongOverflow: strong ? Math.round(strong.getBoundingClientRect().right - card.getBoundingClientRect().right) : null,
            copyOverflow: copy ? copy.scrollWidth - copy.clientWidth : null
          };
        })
      };
    }
  });

  await run('contacts', {
    fixture: prepareUiV2ContactsFixture,
    dump: () => {
      const rect = element => { const value = element.getBoundingClientRect(); return { t: Math.round(value.top), l: Math.round(value.left), r: Math.round(value.right), b: Math.round(value.bottom), w: Math.round(value.width), h: Math.round(value.height) }; };
      const count = document.getElementById('contactCount');
      const actions = document.querySelector('#view-contacts .toolbar-actions');
      return {
        overflow: document.documentElement.scrollWidth - innerWidth,
        count: count ? { ...rect(count), display: getComputedStyle(count).display } : null,
        children: actions ? [...actions.children].filter(element => element.getClientRects().length).map(element => ({ tag: element.tagName.toLowerCase(), cls: String(element.className).slice(0, 30), text: element.textContent.trim().slice(0, 22), ...rect(element) })) : []
      };
    }
  });

  await run('links', {
    fixture: prepareUiV2LinksFixture,
    dump: () => {
      const rect = element => { const value = element.getBoundingClientRect(); return { t: Math.round(value.top), l: Math.round(value.left), r: Math.round(value.right), b: Math.round(value.bottom), w: Math.round(value.width), h: Math.round(value.height) }; };
      const grids = [...document.querySelectorAll('#view-links .links-grid')];
      const first = grids.find(grid => grid.children.length > 1);
      const cards = first ? [...first.children].slice(0, 3) : [];
      return {
        overflow: document.documentElement.scrollWidth - innerWidth,
        grids: grids.map(grid => ({ group: grid.dataset.linksGroup || 'custom', items: grid.children.length, gap: getComputedStyle(grid).rowGap })),
        firstCards: cards.map(card => rect(card))
      };
    }
  });

  await run('integrations', {
    action: async page => { await page.evaluate(() => window.Atrium.App.switchView('integrations')); },
    dump: () => {
      const rect = element => { const value = element.getBoundingClientRect(); return { t: Math.round(value.top), l: Math.round(value.left), r: Math.round(value.right), b: Math.round(value.bottom), w: Math.round(value.width), h: Math.round(value.height) }; };
      const snapshot = selector => {
        const copy = document.querySelector(selector);
        if (!copy) return null;
        const p = copy.querySelector('p');
        const h3 = copy.querySelector('h3');
        const chip = copy.querySelector('.status-chip');
        const button = copy.querySelector('.button');
        return {
          card: rect(copy.closest('.integration-card')),
          copy: rect(copy),
          p: p ? { ...rect(p), fontSize: getComputedStyle(p).fontSize, lineHeight: getComputedStyle(p).lineHeight } : null,
          h3: h3 ? { ...rect(h3), fontSize: getComputedStyle(h3).fontSize, fontFamily: getComputedStyle(h3).fontFamily.slice(0, 40) } : null,
          chip: chip ? { ...rect(chip), fontSize: getComputedStyle(chip).fontSize, text: chip.textContent.trim().slice(0, 24) } : null,
          button: button ? rect(button) : null
        };
      };
      return {
        overflow: document.documentElement.scrollWidth - innerWidth,
        judicial: snapshot('.judicial-integration-card .integration-copy'),
        calendar: snapshot('.external-calendar-integration-card .integration-copy'),
        importer: snapshot('.importer-integration-card .integration-copy')
      };
    }
  });

  console.log(JSON.stringify(report, null, 2));
} finally {
  await session.stop();
}
