import { prepareUiV2AgendaFixture, prepareUiV2Page, prepareUiV2PublicationsFixture, prepareUiV2TasksFixture, startUiV2Session } from './ui_v2_helpers.mjs';

const views = {
  hoje: null,
  tarefas: prepareUiV2TasksFixture,
  publicacoes: prepareUiV2PublicationsFixture,
  agenda: prepareUiV2AgendaFixture
};
const view = process.argv[2] || 'hoje';
const width = Number(process.argv[3] || 390);
if (!Object.hasOwn(views, view) || !Number.isInteger(width) || width < 320 || width > 860) {
  console.error('Uso: node tests/mobile_viewport.mjs [hoje|tarefas|publicacoes|agenda] [largura 320–860]');
  process.exitCode = 1;
} else {
  let session;
  try {
    session = await startUiV2Session({ headless: false });
    const context = await session.createContext({ viewport: { width, height: 844 } });
    const { page } = await prepareUiV2Page(context, session.server.baseUrl);
    if (views[view]) await views[view](page);
    console.log(`Viewport local ${width}×844 — ${view}. Feche a janela do navegador para encerrar.`);
    await new Promise(resolve => page.once('close', resolve));
  } finally {
    await session?.stop();
  }
}
