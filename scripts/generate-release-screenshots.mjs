import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  prepareUiV2ContactsFixture,
  prepareUiV2JudicialFixture,
  prepareUiV2Page,
  prepareUiV2ProcessesFixture,
  prepareUiV2PublicationsFixture,
  startUiV2Session,
  switchUiV2View,
  UI_V2_JUDICIAL_STATUS
} from '../tests/ui_v2_helpers.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT = path.join(ROOT, 'docs', 'assets', 'screenshots');
await mkdir(OUTPUT, { recursive: true });

const session = await startUiV2Session();
const captured = [];

async function withPage({ theme = 'light', viewport = { width: 1440, height: 900 } } = {}, callback) {
  const context = await session.createContext({ viewport, reducedMotion: 'reduce' });
  try {
    const { page, pageErrors } = await prepareUiV2Page(context, session.server.baseUrl, { theme });
    await callback(page);
    await page.waitForFunction(() => [...document.querySelectorAll('body *')]
      .flatMap(element => element.getAnimations?.({ subtree: false }) || [])
      .every(animation => animation.playState === 'finished'), null, { timeout: 5000 }).catch(() => {});
    if (pageErrors.length) throw new Error(`Page errors: ${pageErrors.join(' | ')}`);
  } finally {
    await context.close();
  }
}

async function capture(page, filename, options = {}) {
  const target = path.join(OUTPUT, filename);
  await page.screenshot({ path: target, fullPage: false, ...options });
  captured.push(target);
}

async function prepareDashboard(page) {
  await page.evaluate(() => {
    const { App, Store } = window.Atrium;
    Store.state.settings = {
      ...Store.state.settings,
      officeName: 'Escritório Horizonte Jurídico',
      officeSlogan: 'Organização, clareza e revisão humana',
      lawyerName: 'Advogada Responsável Sintética',
      lawyerOab: 'OAB/UF 000000',
      city: 'Cidade Modelo / UF'
    };
    Store.state.contacts = [
      { id: 'doc-contact-1', name: 'Marina Duarte Sintética', contactRole: 'cliente', city: 'Cidade Modelo', state: 'UF' },
      { id: 'doc-contact-2', name: 'Carlos Testemunha Sintético', contactRole: 'testemunha', city: 'Cidade Modelo', state: 'UF' }
    ];
    Store.state.processes = [
      { id: 'doc-process-1', number: '5004321-12.2026.8.21.0001', contactId: 'doc-contact-1', client: 'Marina Duarte Sintética', court: 'Tribunal Sintético', actionType: 'Obrigação de fazer', lastMovement: 'Conclusão sintética para decisão.', lastMovementAt: '2026-09-01', monitoring: 'active' },
      { id: 'doc-process-2', number: '5012345-67.2026.4.04.7100', client: 'Cliente Modelo Sintético', court: 'Tribunal Regional Sintético', actionType: 'Ação previdenciária', lastMovement: 'Recurso sintético recebido.', lastMovementAt: '2026-08-30', monitoring: 'active' }
    ];
    Store.state.tasks = [
      { id: 'doc-task-1', title: 'Revisar manifestação sintética', client: 'Marina Duarte Sintética', process: '5004321-12.2026.8.21.0001', responsible: 'Equipe Jurídica', status: 'prioridade', priority: 'importante', deadline: '2026-09-05', fatalDeadline: '2026-09-05', timeLogs: [] },
      { id: 'doc-task-2', title: 'Conferir documentos recebidos', client: 'Cliente Modelo Sintético', status: 'andamento', deadline: '2026-09-08', timeLogs: [{ minutes: 45 }] }
    ];
    Store.state.intimations = [
      { id: 'doc-pub-1', title: 'Publicação sintética aguardando triagem', process: '5004321-12.2026.8.21.0001', client: 'Marina Duarte Sintética', source: 'DJEN sintético', publishedAt: '2026-09-01', text: 'Conteúdo sintético para demonstração pública.', treatmentStatus: 'untreated', unread: true },
      { id: 'doc-pub-2', title: 'Decisão sintética em análise', process: '5012345-67.2026.4.04.7100', client: 'Cliente Modelo Sintético', source: 'DJEN sintético', publishedAt: '2026-08-31', text: 'Conteúdo sintético sob revisão humana.', treatmentStatus: 'in_review', unread: false }
    ];
    Store.state.agenda = [
      { id: 'doc-event-1', title: 'Audiência sintética', date: '2026-09-03', time: '10:00', client: 'Marina Duarte Sintética', location: 'Sala virtual de teste' },
      { id: 'doc-event-2', title: 'Reunião de estratégia', date: '2026-09-04', time: '14:30', client: 'Cliente Modelo Sintético' }
    ];
    Store.state.leads = [{ id: 'doc-lead-1', client: 'Interessado Sintético', serviceType: 'Consulta jurídica', status: 'novo' }];
    App.renderAll();
    App.switchView('dashboard');
    window.scrollTo(0, 0);
  });
  await page.locator('#view-dashboard.active').waitFor();
}

try {
  await withPage({ theme: 'light' }, async page => {
    await prepareDashboard(page);
    await capture(page, 'dashboard-light.png');
  });

  await withPage({ theme: 'dark' }, async page => {
    await prepareDashboard(page);
    await capture(page, 'dashboard-dark.png');
  });

  await withPage({ theme: 'light' }, async page => {
    await prepareUiV2PublicationsFixture(page);
    await capture(page, 'publications-workspace.png');
  });

  await withPage({ theme: 'light' }, async page => {
    await prepareUiV2ProcessesFixture(page);
    await page.locator('[data-process-id="ui-v2-process-tjrs"] [data-process-details]').click();
    await page.locator('#processInspectorBackdrop:not(.hidden)').waitFor();
    await capture(page, 'process-inspector.png', { clip: { x: 0, y: 0, width: 1440, height: 790 } });
  });

  await withPage({ theme: 'light' }, async page => {
    await prepareUiV2ContactsFixture(page);
    await page.evaluate(() => {
      const contact = window.Atrium.Store.state.contacts.find(item => item.id === 'ui-v2-contact-client');
      if (contact) {
        contact.document = 'DOCUMENTO SINTÉTICO';
        contact.rg = 'IDENTIFICAÇÃO SINTÉTICA';
      }
      window.Atrium.App.renderContacts();
    });
    await page.locator('[data-contact-id="ui-v2-contact-client"]').click();
    await page.locator('#contactInspector.is-open').waitFor();
    await capture(page, 'contacts-registry.png');
  });

  await withPage({ theme: 'light' }, async page => {
    await prepareUiV2JudicialFixture(page, UI_V2_JUDICIAL_STATUS);
    await switchUiV2View(page, 'integrations');
    await capture(page, 'integrations.png');
  });

  console.log(`✓ ${captured.length} screenshots públicos sintéticos gerados em ${OUTPUT}`);
  for (const file of captured) console.log(`  - ${path.relative(ROOT, file)}`);
} finally {
  await session.stop();
}
