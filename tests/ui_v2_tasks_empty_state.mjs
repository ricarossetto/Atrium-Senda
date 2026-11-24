import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => fs.readFileSync(path.join(ROOT, relative), 'utf8');
const presenterSource = read('js/views/ui-v2/tasks-presenter.js');
const tasksCss = read('css/views/ui-v2/tasks.css');
const tokensCss = read('css/views/ui-v2/tokens.css');
const license = 'Lucian UX/UI Prompt #440 · MIT License (c) 2026 Seokwoooo · https://lucianlabs.dev/uxui-prompt/#440';
const terminalStatuses = ['concluida', 'concluido', 'arquivada', 'arquivado', 'finalizada', 'cancelada'];

assert.ok(presenterSource.includes(license), 'O presenter deve preservar a licença do elemento #440.');
assert.ok(tasksCss.includes(license), 'O CSS deve preservar a licença do elemento #440.');
assert.match(presenterSource, /data-task-empty-action="\$\{content\.action\}"/);
assert.match(presenterSource, /newTaskButton\.click\(\)/, 'A criação deve delegar ao botão existente.');
assert.doesNotMatch(presenterSource, /Create first project|No projects yet/);

const referencedUxTokens = [...new Set([...tasksCss.matchAll(/var\((--ux-[\w-]+)\)/g)].map(match => match[1]))];
for (const token of referencedUxTokens) {
  assert.match(tokensCss, new RegExp(`${token}:\\s*var\\(--v2-`), `${token} deve apontar para um token V2 existente.`);
}
for (const selector of tasksCss.matchAll(/^([^{@\n][^{]*\.u440[^{]*)\{/gm)) {
  assert.ok(selector[1].includes('html[data-ui="v2"]'), `Seletor Lucian fora da UI V2: ${selector[1].trim()}`);
}

const assets = new Map([
  ['/js/views/ui-v2/tasks-presenter.js', ['js/views/ui-v2/tasks-presenter.js', 'text/javascript']],
  ['/js/views/ui-v2/icons.js', ['js/views/ui-v2/icons.js', 'text/javascript']],
  ['/js/core/member-avatar.js', ['js/core/member-avatar.js', 'text/javascript']],
  ['/css/views/ui-v2/tokens.css', ['css/views/ui-v2/tokens.css', 'text/css']],
  ['/css/views/ui-v2/primitives.css', ['css/views/ui-v2/primitives.css', 'text/css']],
  ['/css/views/ui-v2/motion.css', ['css/views/ui-v2/motion.css', 'text/css']],
  ['/css/views/ui-v2/tasks.css', ['css/views/ui-v2/tasks.css', 'text/css']],
  ['/css/views/ui-v2/icons.css', ['css/views/ui-v2/icons.css', 'text/css']],
  ['/assets/icons/atrium-ui-icons.svg', ['assets/icons/atrium-ui-icons.svg', 'image/svg+xml']]
]);
const html = `<!doctype html>
<html lang="pt-BR" data-ui="v2" data-theme="light">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="stylesheet" href="/css/views/ui-v2/tokens.css">
  <link rel="stylesheet" href="/css/views/ui-v2/primitives.css">
  <link rel="stylesheet" href="/css/views/ui-v2/motion.css">
  <link rel="stylesheet" href="/css/views/ui-v2/icons.css">
  <link rel="stylesheet" href="/css/views/ui-v2/tasks.css">
  <style>body { margin: 0; min-width: 0; }</style>
</head>
<body>
  <button type="button" id="focusOrigin">Origem do foco</button>
  <main class="main-content">
    <section class="view active" id="view-kanban" data-task-view="list">
      <section class="task-list-panel" id="taskListPanel" aria-label="Tarefas em lista">
        <div class="task-list" id="taskList" role="list"></div>
      </section>
    </section>
  </main>
  <button type="button" id="newTaskButton" style="display:none">Nova tarefa da barra</button>
  <button type="button" id="taskFiltersToggle" aria-expanded="false">Filtros e análises</button>
  <label><span>Pesquisar tarefas</span><input id="taskListSearch" type="search"></label>
  <span id="taskResultCount" aria-live="polite"></span>
  <script>
    window.__newTaskClicks = 0;
    document.getElementById('newTaskButton').addEventListener('click', () => { window.__newTaskClicks += 1; });
    document.getElementById('taskFiltersToggle').addEventListener('click', event => {
      const expanded = document.getElementById('view-kanban').classList.toggle('filters-expanded');
      event.currentTarget.setAttribute('aria-expanded', String(expanded));
    });
  </script>
</body>
</html>`;

const browser = await chromium.launch({ headless: true });
const pageErrors = [];
const consoleErrors = [];
try {
  const context = await browser.newContext({ viewport: { width: 375, height: 812 }, locale: 'pt-BR', reducedMotion: 'no-preference' });
  await context.route('http://atrium.test/**', async route => {
    const url = new URL(route.request().url());
    if (url.pathname === '/') {
      await route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: html });
      return;
    }
    const asset = assets.get(url.pathname);
    if (!asset) {
      await route.fulfill({ status: 404, body: 'Não encontrado' });
      return;
    }
    await route.fulfill({ status: 200, contentType: asset[1], body: read(asset[0]) });
  });
  const page = await context.newPage();
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  await page.goto('http://atrium.test/', { waitUntil: 'networkidle' });
  await page.evaluate(async () => {
    const { createTasksV2Presenter } = await import('/js/views/ui-v2/tasks-presenter.js?v=test');
    window.__emptyPresenter = createTasksV2Presenter({
      escapeHtml: value => String(value ?? ''),
      formatDate: String,
      formatMinutes: minutes => `${minutes}m`,
      totalTimeMinutes: () => 0,
      daysUntil: () => 0,
      initials: () => 'AT'
    });
  });

  async function renderEmpty(state, status = state === 'completed' ? 'concluida' : 'andamento') {
    await page.evaluate(({ selectedState, selectedStatus }) => {
      const allTasks = selectedState === 'first-run' ? [] : [{
        id: `synthetic-${selectedState}`,
        title: 'Tarefa sintética',
        status: selectedStatus,
        timeLogs: []
      }];
      window.__emptyPresenter.renderList({
        container: document.getElementById('taskList'),
        summary: null,
        tasks: [],
        allTasks,
        columns: [],
        activeTaskId: null,
        elapsedLabel: '00:00:00',
        sourceLabel: String,
        activeFilter: 'active'
      });
    }, { selectedState: state, selectedStatus: status });
    await page.locator('.task-list-empty').waitFor();
  }

  async function geometry() {
    return page.evaluate(() => {
      const root = document.querySelector('.task-list-empty');
      const button = root.querySelector('.u440-go');
      const list = document.getElementById('taskList');
      const rootRect = root.getBoundingClientRect();
      const buttonRect = button.getBoundingClientRect();
      return {
        state: root.dataset.taskEmptyState,
        title: root.querySelector('.u440-title').textContent,
        description: root.querySelector('.u440-description').textContent,
        action: button.textContent.trim(),
        rootWidth: rootRect.width,
        rootHeight: rootRect.height,
        rootLeft: rootRect.left,
        rootRight: rootRect.right,
        listWidth: list.clientWidth,
        buttonHeight: buttonRect.height,
        pageOverflow: document.documentElement.scrollWidth - innerWidth,
        rootOverflow: root.scrollWidth - root.clientWidth,
        contentOverflow: root.scrollHeight - root.clientHeight,
        illustrationHidden: root.querySelector('.u440-ill').getAttribute('aria-hidden'),
        role: root.getAttribute('role'),
        liveRole: root.querySelector('.u440-live').getAttribute('role')
      };
    });
  }

  const screenshotDirectory = process.env.ATRIUM_EMPTY_STATE_SCREENSHOTS;
  async function screenshot(name) {
    if (!screenshotDirectory) return;
    fs.mkdirSync(screenshotDirectory, { recursive: true });
    await page.screenshot({ path: path.join(screenshotDirectory, name), fullPage: true });
  }

  for (const theme of ['light', 'dark']) {
    await page.evaluate(selectedTheme => { document.documentElement.dataset.theme = selectedTheme; }, theme);
    await renderEmpty('first-run');
    const firstRun = await geometry();
    assert.equal(firstRun.state, 'first-run');
    assert.equal(firstRun.title, 'Nenhuma tarefa ainda');
    assert.equal(firstRun.action, 'Nova tarefa');
    assert.equal(firstRun.role, 'listitem');
    assert.equal(firstRun.liveRole, 'status');
    assert.equal(firstRun.illustrationHidden, 'true');
    assert.ok(firstRun.rootWidth <= firstRun.listWidth + 1, 'O estado vazio deve caber na lista em 375px.');
    assert.ok(firstRun.rootLeft >= -1 && firstRun.rootRight <= 376, 'O estado vazio não pode ultrapassar o viewport.');
    assert.ok(firstRun.buttonHeight >= 44, 'O alvo de toque deve ter pelo menos 44px.');
    assert.ok(firstRun.pageOverflow <= 1, `Overflow global em ${theme}: ${firstRun.pageOverflow}px.`);
    assert.ok(firstRun.rootOverflow <= 1, `Overflow interno em ${theme}: ${firstRun.rootOverflow}px.`);
    assert.ok(firstRun.contentOverflow <= 1, `Conteúdo cortado em ${theme}: ${firstRun.contentOverflow}px.`);

    const contrast = await page.evaluate(() => {
      const parse = value => {
        const channels = (value.match(/[\d.]+/g) || []).map(Number);
        return { r: channels[0], g: channels[1], b: channels[2], a: channels[3] ?? 1 };
      };
      const composite = (foreground, background) => ({
        r: foreground.r * foreground.a + background.r * (1 - foreground.a),
        g: foreground.g * foreground.a + background.g * (1 - foreground.a),
        b: foreground.b * foreground.a + background.b * (1 - foreground.a),
        a: 1
      });
      const luminance = color => {
        const channels = [color.r, color.g, color.b].map(channel => {
          const normalized = channel / 255;
          return normalized <= .04045 ? normalized / 12.92 : ((normalized + .055) / 1.055) ** 2.4;
        });
        return .2126 * channels[0] + .7152 * channels[1] + .0722 * channels[2];
      };
      const ratio = (foreground, background) => {
        const front = luminance(foreground);
        const back = luminance(background);
        return (Math.max(front, back) + .05) / (Math.min(front, back) + .05);
      };
      const root = document.querySelector('.task-list-empty');
      const rootBackground = parse(getComputedStyle(root).backgroundColor);
      const button = root.querySelector('.u440-go');
      const buttonStyle = getComputedStyle(button);
      const buttonBackground = composite(parse(buttonStyle.backgroundColor), rootBackground);
      return {
        title: ratio(parse(getComputedStyle(root.querySelector('.u440-title')).color), rootBackground),
        description: ratio(parse(getComputedStyle(root.querySelector('.u440-description')).color), rootBackground),
        button: ratio(parse(buttonStyle.color), buttonBackground)
      };
    });
    for (const [part, value] of Object.entries(contrast)) {
      assert.ok(value >= 4.5, `Contraste insuficiente em ${theme} (${part}): ${value.toFixed(2)}:1.`);
    }
    await screenshot(`375-${theme}-first-run.png`);
  }

  await page.evaluate(() => { document.documentElement.dataset.theme = 'light'; });
  await renderEmpty('first-run');
  await page.locator('#focusOrigin').focus();
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement?.matches('[data-task-empty-action="new"]')), true, 'Tab deve alcançar Nova tarefa.');
  const focus = await page.locator('[data-task-empty-action="new"]').evaluate(button => {
    const style = getComputedStyle(button);
    return { outlineStyle: style.outlineStyle, outlineWidth: style.outlineWidth };
  });
  assert.notEqual(focus.outlineStyle, 'none', 'O foco de teclado deve permanecer visível.');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__newTaskClicks === 1);
  assert.match(await page.locator('.u440-live').textContent(), /Abrindo o formulário/);
  await page.waitForFunction(() => !document.querySelector('.u440')?.classList.contains('is-launching'));

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.keyboard.press('Space');
  await page.waitForFunction(() => window.__newTaskClicks === 2);
  await page.waitForFunction(() => !document.querySelector('.u440')?.classList.contains('is-launching'));
  const reducedDuration = await page.locator('.u440-il').evaluate(element => getComputedStyle(element).animationDuration);
  assert.ok(parseFloat(reducedDuration) <= 0.011, `Movimento reduzido deve encerrar imediatamente: ${reducedDuration}.`);

  for (const theme of ['light', 'dark']) {
    await page.evaluate(selectedTheme => { document.documentElement.dataset.theme = selectedTheme; }, theme);
    await renderEmpty('filtered');
    const filtered = await geometry();
    assert.equal(filtered.state, 'filtered');
    assert.equal(filtered.title, 'Nenhuma tarefa neste filtro.');
    assert.equal(filtered.description, 'Ajuste a busca ou o filtro de situação.');
    assert.equal(filtered.action, 'Revisar filtros');
    assert.ok(filtered.pageOverflow <= 1 && filtered.rootOverflow <= 1 && filtered.contentOverflow <= 1);
    await screenshot(`375-${theme}-filtered.png`);
  }

  await page.evaluate(() => { document.documentElement.dataset.theme = 'light'; });
  await renderEmpty('filtered');
  await page.locator('#focusOrigin').focus();
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement?.matches('[data-task-empty-action="filters"]')), true);
  await page.keyboard.press('Enter');
  assert.equal(await page.locator('#taskFiltersToggle').getAttribute('aria-expanded'), 'true');
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'taskListSearch');
  assert.match(await page.locator('.u440-live').textContent(), /Filtros de tarefas abertos/);
  assert.equal(await page.evaluate(() => window.__newTaskClicks), 2, 'Revisar filtros não pode criar tarefa.');

  for (const status of terminalStatuses) {
    await renderEmpty('completed', status);
    const completed = await geometry();
    assert.equal(completed.state, 'completed', `Status terminal ${status} deve mostrar o acervo sem tarefas abertas.`);
    assert.equal(completed.title, 'Nenhuma tarefa aberta.');
    assert.match(completed.description, /Não há tarefas abertas/);
    assert.equal(completed.action, 'Nova tarefa');
  }

  await page.fill('#taskListSearch', 'tarefa sintética');
  await renderEmpty('completed');
  const completedFiltered = await geometry();
  assert.equal(completedFiltered.state, 'filtered', 'Busca ativa não deve esconder que o resultado vazio vem do filtro.');
  assert.equal(completedFiltered.action, 'Revisar filtros');
  await page.fill('#taskListSearch', '');

  await page.setViewportSize({ width: 1280, height: 800 });
  await renderEmpty('first-run');
  const desktop = await geometry();
  assert.equal(Math.round(desktop.rootWidth), 340, 'No desktop o elemento mantém a largura original.');
  assert.ok(Math.abs((desktop.rootLeft + desktop.rootRight) / 2 - 640) <= 1, 'O elemento deve ficar centralizado na lista.');
  assert.ok(desktop.pageOverflow <= 1 && desktop.contentOverflow <= 1);

  assert.deepEqual(pageErrors, [], `Erros de página: ${pageErrors.join(' | ')}`);
  assert.deepEqual(consoleErrors, [], `Erros de console: ${consoleErrors.join(' | ')}`);
  await context.close();
} finally {
  await browser.close();
}

console.log('✓ Estado vazio de Tarefas V2: primeiro uso, filtro e status terminais; 375px; claro/escuro; teclado; movimento reduzido.');
