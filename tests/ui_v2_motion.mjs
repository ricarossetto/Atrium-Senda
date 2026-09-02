import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepareUiV2Page, startUiV2Session, switchUiV2View } from './ui_v2_helpers.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [tokens, motion, index] = await Promise.all([
  readFile(path.join(ROOT, 'css/views/ui-v2/tokens.css'), 'utf8'),
  readFile(path.join(ROOT, 'css/views/ui-v2/motion.css'), 'utf8'),
  readFile(path.join(ROOT, 'index.html'), 'utf8')
]);

console.log('\nATRIUM — MOTION SYSTEM MINERAL EDITORIAL');

for (const [token, value] of [['instant', '100ms'], ['fast', '150ms'], ['base', '200ms'], ['slow', '280ms'], ['max', '340ms']]) {
  assert.match(tokens, new RegExp(`--v2-duration-${token}:\\s*${value}`));
}
assert.match(tokens, /--v2-ease-standard:/);
assert.match(tokens, /--v2-ease-emphasized:/);
assert.match(tokens, /--v2-ease-exit:/);
assert.match(index, /css\/views\/ui-v2\/motion\.css/);
assert.match(motion, /prefers-reduced-motion:\s*reduce/);
assert.doesNotMatch(motion, /infinite|bounce|pulse|glow|scale\s*\(/i);

const session = await startUiV2Session();
try {
  const normalContext = await session.createContext({ viewport: { width: 1280, height: 800 } });
  const normal = await prepareUiV2Page(normalContext, session.server.baseUrl, { theme: 'light' });
  await switchUiV2View(normal.page, 'contacts');
  const normalEvidence = await normal.page.evaluate(() => {
    const button = document.getElementById('newContactButton');
    const input = document.getElementById('contactSearch');
    const view = document.getElementById('view-contacts');
    return {
      buttonDuration: getComputedStyle(button).transitionDuration,
      inputDuration: getComputedStyle(input).transitionDuration,
      viewAnimations: view.getAnimations().map(animation => animation.effect?.getTiming().duration || 0)
    };
  });
  assert.ok(normalEvidence.buttonDuration.split(',').map(value => parseFloat(value)).every(value => value > 0 && value <= 0.2));
  assert.match(normalEvidence.inputDuration, /0\.15s/);
  assert.ok(normalEvidence.viewAnimations.every(duration => duration <= 340));
  assert.deepEqual(normal.pageErrors, []);
  await normalContext.close();

  const reducedContext = await session.createContext({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });
  const reduced = await prepareUiV2Page(reducedContext, session.server.baseUrl, { theme: 'dark' });
  await switchUiV2View(reduced.page, 'configuration');
  const reducedEvidence = await reduced.page.evaluate(() => {
    const elements = [document.querySelector('.nav-item'), document.querySelector('.button'), document.querySelector('input'), document.querySelector('.view.active')].filter(Boolean);
    return elements.map(element => ({
      transition: getComputedStyle(element).transitionDuration.split(',').map(value => parseFloat(value) || 0),
      animation: getComputedStyle(element).animationDuration.split(',').map(value => parseFloat(value) || 0)
    }));
  });
  for (const entry of reducedEvidence) {
    assert.ok(entry.transition.every(value => value <= 0.001));
    assert.ok(entry.animation.every(value => value <= 0.001));
  }
  assert.deepEqual(reduced.pageErrors, []);
  await reducedContext.close();
} finally {
  await session.stop();
}

console.log('✓ Tokens, interações, limite de 340ms e reduced-motion global aprovados.');
