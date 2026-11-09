import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { safeImageSource } from '../js/core/link-safety.js';
import { renderCalculationsWorkspace } from '../js/views/ui-v2/calculations-presenter.js';

for (const input of [
  'javascript:alert(1)', 'java\tscript:alert(1)', 'data:text/html,<script>alert(1)</script>',
  'data:image/svg+xml,<svg onload=alert(1)>',
  'data:image/svg+xml;base64,' + Buffer.from('<svg onload="alert(1)"/>').toString('base64'),
  'vbscript:msgbox(1)', 'file:///etc/passwd', '//evil.example.test/image.png'
]) assert.equal(safeImageSource(input), '', `unsafe image: ${input}`);
assert.equal(safeImageSource('data:image/png;base64,iVBORw0KGgo='), 'data:image/png;base64,iVBORw0KGgo=');
assert.equal(safeImageSource('https://example.test/logo.png'), 'https://example.test/logo.png');
const staticSvgLogo = 'data:image/svg+xml;base64,' + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><rect width="2" height="2"/></svg>').toString('base64');
assert.equal(safeImageSource(staticSvgLogo), '', 'sem parser XML, validação SVG falha fechada');
const calculations = renderCalculationsWorkspace({ form: { itens: [{ id: 'synthetic', especie: 'debito', descricao: '<img src=x onerror=alert(1)>', data: '', valor: '', jurosDe: '' }] } });
assert.match(calculations, /&lt;img src=x onerror=alert\(1\)&gt;/);
assert.doesNotMatch(calculations, /<img src=x onerror=/);

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  for (const [directory, name] of [['core', 'html-safety'], ['core', 'link-safety'], ['components', 'modal'], ['components', 'panel-size'], ['components', 'field-suggest'], ['core', 'field-context']]) {
    await page.route(new RegExp(`/js/${directory}/${name}\\.js(\\?.*)?$`), route => route.fulfill({
      contentType: 'text/javascript',
      body: readFileSync(new URL(`../js/${directory}/${name}.js`, import.meta.url), 'utf8')
    }));
  }
  await page.route('http://atrium.test/', route => route.fulfill({
    contentType: 'text/html',
    body: '<html data-ui="v2"><body><div id="appShell"></div><div id="modalBackdrop" class="hidden"><div class="modal"><h2 id="modalTitle"></h2><p id="modalEyebrow"></p><form id="modalForm"><div id="modalFields"></div><footer><button class="button gold" type="submit">Salvar</button></footer></form><button id="modalClose"></button><button id="modalCancel"></button></div></div></body></html>'
  }));
  await page.goto('http://atrium.test/');
  const results = await page.evaluate(async () => {
    const { sanitizeRichHtml } = await import('/js/core/html-safety.js');
    const { safeImageSource } = await import('/js/core/link-safety.js');
    const { createModal } = await import('/js/components/modal.js');
    const asSvg = text => `data:image/svg+xml;base64,${btoa(text)}`;
    const internalSvg = asSvg('<svg xmlns="http://www.w3.org/2000/svg"><defs><symbol id="mark"><rect width="2" height="2"/></symbol></defs><use href="#mark"/></svg>');
    const dangerousSvg = asSvg('<svg xmlns="http://www.w3.org/2000/svg"><use href="javascript:alert(1)"/></svg>');
    const payloads = [
      '<script>window.__xss=1</script>',
      '<img src=x onerror="window.__xss=1">',
      '<svg onload="window.__xss=1"><use href="#x"></svg>',
      '<iframe src="javascript:window.__xss=1"></iframe>',
      '<a href="javascript:window.__xss=1">clique</a>',
      '<a href="data:text/html,<script>window.__xss=1</script>">d</a>',
      '<form action="javascript:window.__xss=1"><input name=x></form>',
      '<div style="background:url(javascript:window.__xss=1)">e</div>',
      '<div style="background:url(https://evil.test/pixel)">e</div>',
      '<div style="background-image:image-set(url(https://evil.test/pixel))">e</div>',
      '<template><img src=x onerror=window.__xss=1></template>',
      '<p onclick="window.__xss=1">texto</p>',
      '<a href="&#106;avascript:alert(1)">entidade</a>',
      '<img src=x onerror=alert(1)><b>após</b>'
    ];
    const sanitized = payloads.map(html => sanitizeRichHtml(html));
    const host = document.createElement('div');
    document.body.append(host);
    window.__xss = 0;
    for (const html of sanitized) host.innerHTML = html;
    await new Promise(resolve => setTimeout(resolve, 100));
    const executed = window.__xss;
    host.remove();
    const kept = sanitizeRichHtml('<table style="border-collapse:collapse"><tr><td style="padding:4px">Intimação</td></tr></table><div style="white-space:pre-wrap">linha 1\nlinha 2</div><p>texto <strong>negrito</strong></p>');
    const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
    const modal = createModal({ escapeHtml, onModeChange: () => {} });
    modal.open('test', 'Teste', 'Teste', [{ name: 'x" autofocus onfocus="window.__xss=1', label: '<img src=x onerror=window.__xss=1>', note: '<svg onload=window.__xss=1>' }]);
    return {
      sanitized,
      executed,
      kept,
      internalSvgAccepted: safeImageSource(internalSvg) === internalSvg,
      dangerousSvgRejected: safeImageSource(dangerousSvg) === '',
      modalMarkup: document.getElementById('modalFields').innerHTML,
      modalImages: document.getElementById('modalFields').querySelectorAll('img, svg').length
    };
  });
  assert.equal(results.executed, 0);
  assert.equal(results.internalSvgAccepted, true, 'SVG estático com referência interna permanece visível');
  assert.equal(results.dangerousSvgRejected, true, 'SVG com URL executável é rejeitado');
  for (const html of results.sanitized) assert.doesNotMatch(html, /<script|<svg|<iframe|onerror=|onload=|onclick=|javascript:|image-set\(|url\(/i);
  assert.match(results.kept, /<table/);
  assert.match(results.kept, /<strong>negrito<\/strong>/);
  assert.match(results.kept, /border-collapse/);
  assert.match(results.kept, /white-space:\s*pre-wrap/);
  assert.match(results.kept, /linha 1\nlinha 2/);
  assert.equal(results.modalImages, 0);
  assert.doesNotMatch(results.modalMarkup, / onfocus="window.__xss=1"/);
  console.log('xss_dom_hardening: PASS (módulos reais, DOM, 14 payloads e modal)');
} finally {
  await browser.close();
}
