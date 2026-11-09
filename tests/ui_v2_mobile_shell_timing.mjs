import assert from 'node:assert/strict';
import { createUiV2Shell } from '../js/views/ui-v2/shell.js';

function createFixture(duration = '0s') {
  const listeners = new Map();
  const classes = () => {
    const values = new Set();
    return {
      contains: value => values.has(value),
      add: value => values.add(value),
      remove: value => values.delete(value),
      toggle: (value, enabled) => enabled ? values.add(value) : values.delete(value)
    };
  };
  const element = () => ({
    classList: classes(),
    inert: false,
    addEventListener(type, listener) { listeners.set(`${this.id || 'body'}:${type}`, listener); },
    removeAttribute(name) { if (name === 'inert') this.inert = false; },
    getBoundingClientRect() { return { top: this.top }; }
  });
  const root = { dataset: { ui: 'v2' }, classList: classes(), removeAttribute(name) { if (name === 'data-v2-mobile-chrome') delete this.dataset.v2MobileChrome; } };
  const nav = Object.assign(element(), { id: 'v2MobileNav', top: 700 });
  const appShell = Object.assign(element(), { id: 'appShell' });
  const notificationPanel = Object.assign(element(), { id: 'notificationPanel' });
  notificationPanel.classList.add('hidden');
  const body = Object.assign(element(), { id: 'body', scrollTop: 0 });
  const documentRef = {
    documentElement: root, body, activeElement: null,
    getElementById(id) { return { v2MobileNav: nav, appShell, notificationPanel }[id] || null; },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    addEventListener(type, listener) { listeners.set(`document:${type}`, listener); }
  };
  let now = 0;
  let nextId = 1;
  let frames = [];
  const timers = new Map();
  const windowRef = {
    innerWidth: 390, innerHeight: 844,
    performance: { now: () => now },
    getComputedStyle() { return { transitionProperty: 'transform', transitionDuration: duration, transitionDelay: '0s' }; },
    requestAnimationFrame(callback) { const id = nextId++; frames.push({ id, callback }); return id; },
    cancelAnimationFrame(id) { frames = frames.filter(frame => frame.id !== id); },
    setTimeout(callback, delay) { const id = nextId++; timers.set(id, { at: now + delay, callback }); return id; },
    clearTimeout(id) { timers.delete(id); },
    addEventListener(type, listener) {
      const key = `window:${type}`;
      const previous = listeners.get(key);
      listeners.set(key, previous ? (...args) => { previous(...args); listener(...args); } : listener);
    }
  };
  const shell = createUiV2Shell({ documentRef, windowRef });
  shell.init('v2');
  const frame = () => {
    const current = frames;
    frames = [];
    current.forEach(({ callback }) => callback(now));
  };
  const advance = ms => {
    now += ms;
    for (const [id, timer] of [...timers]) {
      if (timer.at > now) continue;
      timers.delete(id);
      timer.callback();
    }
  };
  const reading = () => {
    body.scrollTop = 150;
    listeners.get('body:scroll')();
    frame();
    assert.equal(root.dataset.v2MobileChrome, 'reading');
    assert.equal(nav.inert, true);
  };
  const hidden = () => nav.classList.contains('is-chrome-hidden') && root.classList.contains('is-mobile-nav-hidden');
  return { root, nav, windowRef, listeners, timers, reading, frame, advance, hidden, setDuration(value) { duration = value; }, get pendingFrames() { return frames.length; } };
}

{
  const f = createFixture();
  f.reading();
  f.frame();
  assert.equal(f.hidden(), false, 'zero duration must not hide before the nav leaves the viewport');
  f.nav.top = 844;
  f.frame();
  assert.equal(f.hidden(), true, 'zero duration must recheck after delayed layout');
  assert.equal(f.pendingFrames, 0, 'successful hide cancels pending frames');
}

{
  const f = createFixture();
  f.reading();
  for (let i = 0; i < 32; i++) f.frame();
  f.advance(1000);
  assert.equal(f.pendingFrames, 0, 'stalled geometry cannot queue frames forever');
  assert.equal(f.timers.size, 0, 'stalled geometry cannot queue full-duration retries');
  assert.equal(f.hidden(), false, 'stalled geometry keeps the nav painted');
}

{
  const f = createFixture('0.1s');
  f.reading();
  f.advance(150);
  assert.equal(f.hidden(), false, 'pending transform remains painted');
  assert.equal(f.timers.size, 0, 'elapsed transition is not queued again for its full duration');
  f.nav.top = 844;
  f.frame();
  assert.equal(f.hidden(), true, 'fallback must not wait for another full transition after layout');
  assert.equal(f.timers.size, 0, 'fallback timer is cleared after hiding');
}

{
  const f = createFixture('0.1s');
  f.reading();
  f.nav.top = 844;
  f.listeners.get('document:visibilitychange')();
  f.frame();
  assert.equal(f.hidden(), true, 'visibility return synchronizes paint without a transition event');
  assert.equal(f.timers.size, 0, 'visibility return clears the stale transition timer');
}

{
  const f = createFixture('0.1s');
  f.reading();
  f.advance(50);
  f.listeners.get('document:visibilitychange')();
  f.advance(100);
  assert.equal(f.timers.size, 0, 'visibility return does not restart a pending full-duration timer');
  assert.equal(f.hidden(), false, 'visibility return does not hide before layout is complete');
  f.nav.top = 844;
  f.frame();
  assert.equal(f.hidden(), true, 'visibility return completes once layout is ready');
}

{
  const f = createFixture();
  f.reading();
  f.windowRef.innerHeight = 700;
  f.listeners.get('window:resize')();
  assert.equal(f.root.dataset.v2MobileChrome, 'expanded', 'resize restores expanded state');
  f.frame();
  assert.equal(f.hidden(), false, 'resize invalidates stale hide callbacks');
}

{
  const f = createFixture('2s');
  f.reading();
  f.setDuration('0s');
  f.listeners.get('v2MobileNav:transitioncancel')({ target: f.nav, propertyName: 'transform' });
  assert.equal(f.timers.size, 1, 'interruption replaces the full-duration fallback with bounded recovery');
  assert.equal([...f.timers.values()][0].at, 50, 'interruption checks layout without waiting for the old duration');
  f.frame();
  assert.equal(f.hidden(), false, 'interrupted transition must not hide early');
  f.nav.top = 844;
  f.frame();
  assert.equal(f.hidden(), true, 'interrupted transition rechecks without full-duration wait');
  f.listeners.get('document:keydown')({ key: 'Tab' });
  assert.equal(f.hidden(), false, 'expansion restores both paint layers');
  f.advance(2500);
  f.frame();
  assert.equal(f.hidden(), false, 'stale fallback cannot hide expanded navigation');
}

for (const duration of ['2s', '0s']) {
  const f = createFixture(duration);
  f.reading();
  f.listeners.get('v2MobileNav:transitioncancel')({ target: f.nav, propertyName: 'transform' });
  for (let i = 0; i < 16; i++) f.frame();
  assert.equal(f.pendingFrames, 0, `${duration}: cancellation stops frame polling`);
  assert.equal(f.hidden(), false, `${duration}: cancellation does not hide visible nav`);
  f.advance(250);
  assert.equal(f.hidden(), false, `${duration}: recovery does not hide before layout is offscreen`);
  f.nav.top = 844;
  f.advance(50);
  assert.equal(f.hidden(), true, `${duration}: late layout finishes without another transition event`);
  assert.equal(f.timers.size, 0, `${duration}: completed recovery clears timers`);
}

{
  const f = createFixture('0s');
  f.reading();
  f.listeners.get('v2MobileNav:transitioncancel')({ target: f.nav, propertyName: 'transform' });
  for (let i = 0; i < 16; i++) f.frame();
  for (let i = 0; i < 24; i++) f.advance(50);
  assert.equal(f.hidden(), false, 'stalled cancellation never hides visible nav');
  assert.equal(f.timers.size, 0, 'stalled cancellation has a bounded wall-clock recovery');
  assert.equal(f.pendingFrames, 0, 'stalled cancellation does not spin frames');
}

{
  const f = createFixture('0s');
  f.reading();
  f.listeners.get('v2MobileNav:transitioncancel')({ target: f.nav, propertyName: 'transform' });
  f.advance(1200);
  assert.equal(f.hidden(), false, 'throttled recovery does not hide visible nav');
  assert.equal(f.timers.size, 0, 'throttled callback does not extend the wall-clock deadline');
}

{
  const f = createFixture('0s');
  f.reading();
  f.listeners.get('v2MobileNav:transitioncancel')({ target: f.nav, propertyName: 'transform' });
  for (let i = 0; i < 16; i++) f.frame();
  f.listeners.get('document:keydown')({ key: 'Tab' });
  f.nav.top = 844;
  f.advance(1200);
  f.frame();
  assert.equal(f.root.dataset.v2MobileChrome, 'expanded', 'expansion invalidates recovery');
  assert.equal(f.hidden(), false, 'recovery cannot hide expanded nav');
  assert.equal(f.timers.size, 0, 'expansion clears recovery timer');
}

console.log('Mobile shell timing: deterministic fallback, visibility and interruption passed.');
