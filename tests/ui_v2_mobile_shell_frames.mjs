import assert from 'node:assert/strict';
import { webkit } from 'playwright';
import { prepareUiV2Page, startUiV2Session } from './ui_v2_helpers.mjs';

const session = await startUiV2Session();
let safari;
try {
  safari = await webkit.launch({ headless: true });
  for (const [engine, browser] of [['chromium', session.browser], ['webkit', safari]]) {
    for (const viewport of [{ width: 390, height: 844 }, { width: 844, height: 390 }, { width: 860, height: 640 }]) {
      for (const theme of ['light', 'dark']) {
        for (const reducedMotion of ['no-preference', 'reduce']) {
          const context = engine === 'chromium'
            ? await session.createContext({ viewport, reducedMotion })
            : await browser.newContext({ viewport, reducedMotion, locale: 'pt-BR' });
          try {
            if (engine === 'webkit') {
              const authContext = await session.createContext();
              try {
                await context.addCookies(await authContext.cookies(session.server.baseUrl));
              } finally {
                await authContext.close();
              }
            }
            const { page, pageErrors } = await prepareUiV2Page(context, session.server.baseUrl, { theme });
            await page.evaluate(() => {
              document.documentElement.style.setProperty('--atrium-safe-top', '47px');
              document.documentElement.style.setProperty('--atrium-safe-bottom', '34px');
            });
            await page.evaluate(() => document.fonts.ready);
            await page.waitForFunction(() => document.documentElement.dataset.v2MobileChrome === 'expanded'
              && document.querySelector('.topbar-actions').getBoundingClientRect().height >= 80);
            const capture = async target => page.evaluate(async top => {
              const body = document.body;
              const header = document.querySelector('.topbar');
              const actions = document.querySelector('.topbar-actions');
              const nav = document.getElementById('v2MobileNav');
              const anchor = document.getElementById('v2DashboardOpening');
              const firstAction = document.getElementById('btnDashboardNewTask');
              const frames = [];
              const transitions = [];
              const onTransitionRun = event => {
                if (event.target !== nav || event.propertyName !== 'transform') return;
                const styles = getComputedStyle(nav);
                transitions.push({
                  chrome: document.documentElement.dataset.v2MobileChrome,
                  navHidden: nav.classList.contains('is-chrome-hidden'),
                  rootHidden: document.documentElement.classList.contains('is-mobile-nav-hidden'),
                  navInert: nav.inert,
                  navVisibility: styles.visibility,
                  navColor: styles.backgroundColor,
                  rootColor: getComputedStyle(document.documentElement).backgroundColor,
                  transitionProperty: styles.transitionProperty,
                  transitionDuration: styles.transitionDuration
                });
              };
              nav.addEventListener('transitionrun', onTransitionRun);
              const sample = () => frames.push({
                scroll: body.scrollTop,
                chrome: document.documentElement.dataset.v2MobileChrome,
                headerTop: header.getBoundingClientRect().top,
                headerHeight: header.getBoundingClientRect().height,
                headerBottom: header.getBoundingClientRect().bottom,
                actionsHeight: actions.getBoundingClientRect().height,
                viewTop: document.getElementById('view-dashboard').getBoundingClientRect().top,
                contentTop: anchor.getBoundingClientRect().top,
                firstActionTop: firstAction.getBoundingClientRect().top,
                firstActionBottom: firstAction.getBoundingClientRect().bottom,
                navTop: nav.getBoundingClientRect().top,
                navBottom: nav.getBoundingClientRect().bottom,
                navVisibility: getComputedStyle(nav).visibility,
                navHidden: nav.classList.contains('is-chrome-hidden'),
                rootHidden: document.documentElement.classList.contains('is-mobile-nav-hidden'),
                navInert: nav.inert,
                navPaddingBottom: parseFloat(getComputedStyle(nav).paddingBottom),
                navColor: getComputedStyle(nav).backgroundColor,
                rootColor: getComputedStyle(document.documentElement).backgroundColor,
                bodyColor: getComputedStyle(body).backgroundColor,
                appColor: getComputedStyle(document.getElementById('appShell')).backgroundColor
              });
              try {
                await new Promise(resolve => requestAnimationFrame(() => {
                  sample();
                  body.scrollTo({ top, behavior: 'instant' });
                  let remaining = 42;
                  const tick = () => {
                    sample();
                    if (--remaining) requestAnimationFrame(tick);
                    else resolve();
                  };
                  requestAnimationFrame(tick);
                }));
              } finally {
                nav.removeEventListener('transitionrun', onTransitionRun);
              }
              return { frames, transitions };
            }, target);
            const { frames: down, transitions: downTransitions } = await capture(150);
            if (engine === 'webkit' && reducedMotion === 'no-preference') await page.screenshot({ path: `artifacts/mobile-review/shell-layer-${viewport.width}-${theme}-reading.png` });
            const { frames: up } = await capture(0);
            if (engine === 'webkit' && reducedMotion === 'no-preference') await page.screenshot({ path: `artifacts/mobile-review/shell-layer-${viewport.width}-${theme}-expanded.png` });
            const label = `${engine}/${viewport.width}x${viewport.height}/${theme}/${reducedMotion}`;
            assert.equal(down.at(-1).chrome, 'reading', `${label}: descer recolhe chrome`);
            assert.equal(up.at(-1).chrome, 'expanded', `${label}: voltar ao topo expande chrome`);
            for (const [direction, frames] of [['down', down], ['up', up]]) {
              const stable = frames.slice(1).flatMap((frame, index) => Math.abs(frame.scroll - frames[index].scroll) < 1 ? [[frames[index], frame]] : []);
              assert.ok(stable.length >= 3, `${label}/${direction}: frames de animacao com scroll estacionario`);
              const contentDrift = Math.max(...stable.map(([previous, frame]) => Math.abs(frame.contentTop - previous.contentTop)));
              const viewDrift = Math.max(...stable.map(([previous, frame]) => Math.abs(frame.viewTop - previous.viewTop)));
              const headerDrift = Math.max(...frames.map(frame => Math.abs(frame.headerTop)));
              const actionDrift = Math.max(...stable.map(([previous, frame]) => Math.abs(frame.firstActionTop - previous.firstActionTop)));
              const overflow = await page.evaluate(() => Math.max(document.body.scrollWidth, document.documentElement.scrollWidth) - innerWidth);
              assert.ok(contentDrift <= 2, `${label}/${direction}: conteudo deve permanecer na posicao absoluta com scroll estacionario (deslocou ${contentDrift.toFixed(1)}px)`);
              assert.ok(viewDrift <= 2, `${label}/${direction}: inicio da view permanece estavel (${viewDrift.toFixed(1)}px)`);
              assert.ok(actionDrift <= 2, `${label}/${direction}: primeira acao permanece estavel (${actionDrift.toFixed(1)}px)`);
              assert.ok(headerDrift <= 2, `${label}/${direction}: topbar nao descola do topo (${headerDrift.toFixed(1)}px)`);
              assert.ok(overflow <= 2, `${label}/${direction}: sem overflow horizontal (${overflow.toFixed(1)}px)`);
              for (const frame of frames) {
                assert.equal(frame.rootHidden, frame.navHidden, `${label}/${direction}: estado do fundo e da barra coincidem`);
                assert.equal(frame.rootColor, frame.navHidden && frame.chrome === 'reading' ? frame.appColor : frame.navColor, `${label}/${direction}: fundo root acompanha visibilidade da barra`);
                assert.equal(frame.bodyColor, frame.rootColor, `${label}/${direction}: body acompanha root em todo frame`);
                if (frame.chrome === 'reading' && !frame.navHidden) {
                  assert.equal(frame.navVisibility, 'visible', `${label}/${direction}: barra permanece pintada durante a transicao`);
                  assert.equal(frame.navInert, true, `${label}/${direction}: barra em transicao nao recebe foco`);
                }
              }
              if (reducedMotion === 'no-preference' && direction === 'down') {
                assert.ok(downTransitions.some(transition => transition.chrome === 'reading'
                  && !transition.navHidden && !transition.rootHidden && transition.navInert
                  && transition.navVisibility === 'visible' && transition.rootColor === transition.navColor
                  && transition.transitionProperty.split(',').some(property => property.trim() === 'transform' || property.trim() === 'all')
                  && transition.transitionDuration.split(',').some(duration => parseFloat(duration) > 0)), `${label}/${direction}: transform inicia com barra visivel e fundo original (${JSON.stringify(downTransitions)})`);
              }
            }
            const start = down[0];
            const reading = down.at(-1);
            const expanded = up.at(-1);
            assert.ok(start.headerHeight - reading.headerHeight >= 80, `${label}: header recolhe busca e utilidades`);
            assert.ok(start.viewTop >= start.headerBottom - 1 && expanded.viewTop >= expanded.headerBottom - 1, `${label}: view inicia abaixo do cabecalho expandido`);
            assert.ok(start.firstActionTop >= start.headerBottom - 1 && expanded.firstActionTop >= expanded.headerBottom - 1, `${label}: primeira acao nao fica atras do cabecalho`);
            if (viewport.height >= 640) assert.ok(start.firstActionBottom <= start.navTop + 1 && expanded.firstActionBottom <= expanded.navTop + 1, `${label}: primeira acao nao fica atras da barra`);
            assert.ok(reading.actionsHeight < 2, `${label}: acoes nao ocupam altura na leitura`);
            assert.ok(start.navTop < viewport.height - 34 && start.navBottom >= viewport.height - 1, `${label}: barra e inset inferior inicialmente visiveis`);
            assert.ok(reading.navTop >= viewport.height - 1 && reading.navVisibility === 'hidden' && reading.navInert, `${label}: botoes e area inferior saem juntos`);
            assert.ok(reading.navPaddingBottom >= 34 && reading.navColor === start.navColor, `${label}: a faixa segura pertence a barra deslocada`);
            assert.equal(reading.rootColor, reading.appColor, `${label}: fundo atras do indicador segue conteudo em leitura`);
            assert.equal(reading.bodyColor, reading.appColor, `${label}: body nao deixa faixa clara ao ocultar a barra`);
            assert.equal(expanded.rootColor, expanded.navColor, `${label}: fundo da area inferior acompanha a barra expandida`);
            assert.equal(expanded.bodyColor, expanded.navColor, `${label}: body acompanha a barra expandida`);
            assert.ok(expanded.navTop < viewport.height - 34 && expanded.navBottom >= viewport.height - 1, `${label}: barra e faixa retornam juntas`);
            assert.ok(Math.abs((reading.viewTop + reading.scroll) - (start.viewTop + start.scroll)) <= 2, `${label}: inicio da view nao depende do chrome`);
            assert.ok(Math.abs((reading.contentTop + reading.scroll) - (start.contentTop + start.scroll)) <= 2, `${label}: posicao documental do conteudo nao depende do chrome`);
            assert.ok(Math.abs((reading.firstActionTop + reading.scroll) - (start.firstActionTop + start.scroll)) <= 2, `${label}: posicao documental da primeira acao nao depende do chrome`);
            if (reducedMotion === 'reduce') {
              assert.ok(parseFloat(await page.locator('#v2MobileNav').evaluate(element => getComputedStyle(element).transitionDuration)) < .01, `${label}: movimento reduzido`);
            }
            if (theme === 'light' && reducedMotion === 'reduce') {
              await page.evaluate(() => document.body.scrollTo({ top: 150, behavior: 'instant' }));
              await page.waitForFunction(() => document.getElementById('v2MobileNav').classList.contains('is-chrome-hidden'));
              await page.keyboard.press('Tab');
              await page.waitForFunction(() => document.documentElement.dataset.v2MobileChrome === 'expanded');
              assert.equal(await page.evaluate(() => getComputedStyle(document.body).backgroundColor === getComputedStyle(document.getElementById('v2MobileNav')).backgroundColor), true, `${label}: teclado restaura fundo com barra`);
              await page.locator('#menuToggle').click();
              await page.locator('#sidebar.open').waitFor();
              const sidebar = await page.evaluate(() => ({
                expanded: document.documentElement.dataset.v2MobileChrome,
                rootColor: getComputedStyle(document.documentElement).backgroundColor,
                bodyColor: getComputedStyle(document.body).backgroundColor,
                navColor: getComputedStyle(document.getElementById('v2MobileNav')).backgroundColor,
                overflow: getComputedStyle(document.body).overflowY,
                focusedInside: document.getElementById('sidebar').contains(document.activeElement)
              }));
              assert.equal(sidebar.expanded, 'expanded', `${label}: sidebar aberta expande chrome`);
              assert.equal(sidebar.rootColor, sidebar.navColor, `${label}: sidebar aberta restaura fundo`);
              assert.equal(sidebar.bodyColor, sidebar.navColor, `${label}: sidebar aberta restaura body`);
              assert.equal(sidebar.overflow, 'hidden', `${label}: sidebar bloqueia scroll`);
              assert.equal(sidebar.focusedInside, true, `${label}: foco entra no menu`);
              await page.keyboard.press('Escape');
              assert.equal(await page.locator('#sidebar.open').count(), 0, `${label}: Escape fecha sidebar`);
              assert.equal(await page.evaluate(() => document.activeElement?.id), 'menuToggle', `${label}: foco retorna ao gatilho`);
              await page.evaluate(() => document.activeElement?.blur());
            }
            if (theme === 'light' && reducedMotion === 'reduce') {
              const anchor = await page.evaluate(() => {
                const button = document.createElement('button');
                button.id = 'syntheticReadingAnchor';
                button.textContent = 'Destino sintético';
                button.style.marginTop = '650px';
                document.getElementById('view-dashboard').append(button);
                button.scrollIntoView({ block: 'start', behavior: 'instant' });
                return { bodyScroll: document.body.scrollTop, top: button.getBoundingClientRect().top, headerBottom: document.querySelector('.topbar').getBoundingClientRect().bottom, bodyPadding: getComputedStyle(document.body).scrollPaddingTop };
              });
              assert.ok(anchor.bodyScroll > 0 && anchor.top >= anchor.headerBottom + 1, `${label}: ancora no body nao fica atras do header expandido (${JSON.stringify(anchor)})`);
              await page.waitForFunction(() => document.documentElement.dataset.v2MobileChrome === 'reading');
              await page.evaluate(() => {
                document.getElementById('syntheticReadingAnchor').remove();
                document.activeElement?.blur();
                document.body.scrollTo({ top: 0, behavior: 'instant' });
              });
              await page.waitForFunction(() => document.body.scrollTop === 0 && document.documentElement.dataset.v2MobileChrome === 'expanded');
              await page.evaluate(() => document.body.scrollTo({ top: 500, behavior: 'instant' }));
              await page.waitForFunction(() => document.documentElement.dataset.v2MobileChrome === 'reading');
              const readingAnchor = await page.evaluate(() => {
                const button = document.createElement('button');
                button.id = 'syntheticReadingAnchor';
                button.textContent = 'Destino sintético';
                button.style.marginTop = '650px';
                document.getElementById('view-dashboard').append(button);
                button.scrollIntoView({ block: 'start', behavior: 'instant' });
                return { bodyScroll: document.body.scrollTop, top: button.getBoundingClientRect().top, headerBottom: document.querySelector('.topbar').getBoundingClientRect().bottom, bodyPadding: getComputedStyle(document.body).scrollPaddingTop };
              });
              assert.ok(readingAnchor.bodyScroll > 0 && readingAnchor.top >= readingAnchor.headerBottom + 1, `${label}: ancora em leitura nao fica atras do header (${JSON.stringify(readingAnchor)})`);
              await page.evaluate(() => document.getElementById('syntheticReadingAnchor').remove());
              await page.evaluate(() => {
                document.body.scrollTo({ top: 0, behavior: 'instant' });
                const button = document.createElement('button');
                button.id = 'syntheticReadingAnchor';
                button.textContent = 'Destino sintético';
                button.style.marginTop = '650px';
                document.getElementById('view-dashboard').append(button);
                button.focus();
              });
              await page.waitForFunction(() => document.body.scrollTop > 0 && document.getElementById('syntheticReadingAnchor').getBoundingClientRect().top >= document.querySelector('.topbar').getBoundingClientRect().bottom + 1);
              const focus = await page.evaluate(() => ({ top: document.getElementById('syntheticReadingAnchor').getBoundingClientRect().top, headerBottom: document.querySelector('.topbar').getBoundingClientRect().bottom, bodyScroll: document.body.scrollTop }));
              assert.ok(focus.bodyScroll > 0 && focus.top >= focus.headerBottom + 1, `${label}: foco nao fica atras do header (${JSON.stringify(focus)})`);
              await page.evaluate(() => document.getElementById('syntheticReadingAnchor').remove());
            }
            if (theme === 'light' && reducedMotion === 'no-preference') {
              await page.evaluate(() => {
                const nav = document.getElementById('v2MobileNav');
                nav.style.transition = 'none';
                document.activeElement?.blur();
                document.body.scrollTo({ top: 0, behavior: 'instant' });
              });
              await page.waitForFunction(() => document.documentElement.dataset.v2MobileChrome === 'expanded');
              await page.evaluate(() => document.body.scrollTo({ top: 150, behavior: 'instant' }));
              await page.waitForFunction(() => document.documentElement.dataset.v2MobileChrome === 'reading');
              await page.waitForFunction(() => document.getElementById('v2MobileNav').classList.contains('is-chrome-hidden'), null, { timeout: 1200 });
              const noMotion = await page.evaluate(() => ({
                navTop: document.getElementById('v2MobileNav').getBoundingClientRect().top,
                rootHidden: document.documentElement.classList.contains('is-mobile-nav-hidden'),
                rootColor: getComputedStyle(document.documentElement).backgroundColor,
                appColor: getComputedStyle(document.getElementById('appShell')).backgroundColor
              }));
              assert.ok(noMotion.navTop >= viewport.height - 1 && noMotion.rootHidden && noMotion.rootColor === noMotion.appColor, `${label}: sem transitionend nav e fundo terminam juntos`);
              await page.evaluate(() => {
                const nav = document.getElementById('v2MobileNav');
                nav.style.transition = 'transform 2s linear';
                document.body.scrollTo({ top: 0, behavior: 'instant' });
              });
              await page.waitForFunction(() => document.documentElement.dataset.v2MobileChrome === 'expanded');
              await page.evaluate(() => document.body.scrollTo({ top: 150, behavior: 'instant' }));
              await page.waitForFunction(() => document.documentElement.dataset.v2MobileChrome === 'reading');
              await page.evaluate(() => {
                const nav = document.getElementById('v2MobileNav');
                getComputedStyle(nav).transform;
                nav.style.transition = 'none';
              });
              await page.waitForFunction(() => document.getElementById('v2MobileNav').classList.contains('is-chrome-hidden'), null, { timeout: 1200 });
              assert.equal(await page.evaluate(() => document.documentElement.classList.contains('is-mobile-nav-hidden')), true, `${label}: cancelamento termina pintura junto com a barra`);
            }
            assert.deepEqual(pageErrors, [], `${label}: sem erros na pagina`);
            console.log(`${label}: ${down.length + up.length} frames, conteudo estavel e faixa inferior sincronizada`);
          } finally {
            await context.close();
          }
        }
      }
    }
  }
} finally {
  await safari?.close();
  await session.stop();
}
