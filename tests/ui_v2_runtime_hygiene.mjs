import assert from 'node:assert/strict';
import {
  collectUiV2LayoutEvidence,
  prepareUiV2Page,
  startUiV2Session,
  switchUiV2View,
  UI_V2_CANONICAL_VIEWS
} from './ui_v2_helpers.mjs';

console.log('\n===============================================================');
console.log('  ATRIUM — UI V2 RUNTIME HYGIENE');
console.log('===============================================================\n');

const session = await startUiV2Session();
try {
  const context = await session.createContext({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });
  try {
    const { page, pageErrors } = await prepareUiV2Page(context, session.server.baseUrl, { theme: 'dark', probe: true });
    for (const view of UI_V2_CANONICAL_VIEWS) await switchUiV2View(page, view);

    const baseline = await page.evaluate(() => {
      const { App, Store } = window.Atrium;
      globalThis.__runtimeHygieneIdentity = { App, Store, timer: App.autoSyncTimer };
      return {
        startedAt: performance.now(),
        state: JSON.stringify(Store.state),
        revision: Store.revision,
        audit: Store.state.audit.length,
        requests: globalThis.__uiV2RuntimeProbe.mutationRequests.length,
        intervals: globalThis.__uiV2RuntimeProbe.intervals,
        listeners: structuredClone(globalThis.__uiV2RuntimeProbe.listeners),
        nodes: document.getElementsByTagName('*').length,
        stylesheets: document.styleSheets.length,
        heap: performance.memory?.usedJSHeapSize ?? null
      };
    });

    for (let cycle = 0; cycle < 3; cycle++) {
      for (const view of UI_V2_CANONICAL_VIEWS) await switchUiV2View(page, view);
    }

    for (let cycle = 0; cycle < 3; cycle++) {
      for (const view of UI_V2_CANONICAL_VIEWS) await switchUiV2View(page, view);
    }
    await switchUiV2View(page, 'configuration');

    const result = await page.evaluate(() => {
      const { App, Store } = window.Atrium;
      const identity = globalThis.__runtimeHygieneIdentity;
      return {
        elapsedMs: Math.round((performance.now() - globalThis.__runtimeHygieneStart || performance.now()) * 10) / 10,
        state: JSON.stringify(Store.state),
        revision: Store.revision,
        audit: Store.state.audit.length,
        requests: globalThis.__uiV2RuntimeProbe.mutationRequests.length,
        intervals: globalThis.__uiV2RuntimeProbe.intervals,
        listeners: structuredClone(globalThis.__uiV2RuntimeProbe.listeners),
        nodes: document.getElementsByTagName('*').length,
        stylesheets: document.styleSheets.length,
        heap: performance.memory?.usedJSHeapSize ?? null,
        sameApp: App === identity.App,
        sameStore: Store === identity.Store,
        sameTimer: App.autoSyncTimer === identity.timer,
        bodyLocked: document.body.style.overflow === 'hidden' || document.body.classList.contains('modal-open'),
        mode: document.documentElement.dataset.ui,
        modeControls: document.querySelectorAll('#uiModeControl, [data-ui-mode]').length
      };
    });
    const layout = await collectUiV2LayoutEvidence(page);

    assert.equal(result.state, baseline.state);
    assert.equal(result.revision, baseline.revision);
    assert.equal(result.audit, baseline.audit);
    assert.equal(result.requests, baseline.requests);
    assert.equal(result.intervals, baseline.intervals);
    assert.deepEqual(result.listeners, baseline.listeners);
    assert.equal(result.sameApp, true);
    assert.equal(result.sameStore, true);
    assert.equal(result.sameTimer, true);
    assert.equal(result.bodyLocked, false);
    assert.equal(result.mode, 'v2');
    assert.equal(result.modeControls, 0);
    assert.equal(layout.navItems, 17);
    assert.equal(layout.navGroups, 6);
    assert.equal(layout.activeViews.length, 1);
    assert.deepEqual(layout.duplicateIds, []);
    assert.deepEqual(layout.visibleOverlays, []);
    assert.deepEqual(pageErrors, [], `Page errors: ${pageErrors.join(' | ')}`);

    console.log('Observational metrics:', JSON.stringify({
      cycles: 3,
      viewsPerCycle: 17,
      nodesBefore: baseline.nodes,
      nodesAfter: result.nodes,
      stylesheetsBefore: baseline.stylesheets,
      stylesheetsAfter: result.stylesheets,
      heapBefore: baseline.heap,
      heapAfter: result.heap,
      intervals: result.intervals,
      trackedListeners: Object.values(result.listeners).reduce((sum, count) => sum + count, 0)
    }));
    console.log('✓ Repeated V2 navigation preserved App, Store, timer, state, listeners and overlays.');
  } finally {
    await context.close();
  }
} finally {
  await session.stop();
}
