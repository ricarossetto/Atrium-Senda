import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const preferenceInitSource = await readFile(new URL('../js/views/ui-v2/preference-init.js', import.meta.url), 'utf8');
const shellSource = await readFile(new URL('../js/views/ui-v2/shell.js', import.meta.url), 'utf8');
const cssSource = await readFile(new URL('../css/views/ui-v2/shell.css', import.meta.url), 'utf8');
const configurationCssSource = await readFile(new URL('../css/views/ui-v2/configuration.css', import.meta.url), 'utf8');
const specSource = await readFile(new URL('../specs/ui-mode.md', import.meta.url), 'utf8');

function makeSandbox({ hostname, stored }) {
  const data = { ui: null, uiDensity: null, theme: 'light', route: 'app' };
  const documentElement = { dataset: data };
  const storage = new Map(stored ? [['atrium_ui_density', stored]] : []);
  const sandbox = {
    location: { hostname, pathname: '/', search: '', hash: '' },
    localStorage: {
      getItem: key => (storage.has(key) ? storage.get(key) : null),
      setItem: (key, value) => { storage.set(key, String(value)); }
    },
    document: {
      documentElement,
      querySelector: () => ({ setAttribute: () => {} })
    },
    window: { matchMedia: () => ({ matches: false }) }
  };
  sandbox.window.localStorage = sandbox.localStorage;
  sandbox.globalThis = sandbox;
  return { sandbox, data };
}

function runPrepaint({ hostname, stored }) {
  const { sandbox, data } = makeSandbox({ hostname, stored });
  vm.createContext(sandbox);
  vm.runInContext(preferenceInitSource, sandbox);
  return data.uiDensity;
}

assert.equal(runPrepaint({ hostname: 'basic.atrium.adv.br', stored: null }), 'basic', 'Host basic.atrium.adv.br deve usar densidade basic por padrao.');
assert.equal(runPrepaint({ hostname: 'app.basic.atrium.adv.br', stored: null }), 'basic', 'Subdominio de basic.atrium.adv.br deve usar densidade basic.');
assert.equal(runPrepaint({ hostname: 'basic.evil.test', stored: null }), 'pro', 'Host fora do dominio canonico nao ativa Basic.');
assert.equal(runPrepaint({ hostname: 'atrium.adv.br', stored: null }), 'pro', 'Host principal deve permanecer pro por padrao.');
assert.equal(runPrepaint({ hostname: 'basic.atrium.adv.br', stored: 'pro' }), 'pro', 'Preferencia local pro prevalece sobre o host basic.');
assert.equal(runPrepaint({ hostname: 'atrium.adv.br', stored: 'basic' }), 'basic', 'Preferencia local basic prevalece sobre o host principal.');

assert.match(shellSource, /applyBasicGroupVisibility/, 'Shell deve ocultar grupos totalmente filtrados no Basic.');
assert.ok(cssSource.includes('[data-v2-nav-group="management"][hidden]'), 'CSS deve respeitar [hidden] dos grupos filtrados.');
assert.match(shellSource, /BASIC_SECONDARY_VIEWS/, 'Shell deve filtrar views secundarias no Basic sem criar segunda arvore.');
assert.ok(shellSource.includes("'documents'") && shellSource.includes("'assistant'"), 'Basic deve filtrar Documentos e Assistente para nao orfanar grupos.');
assert.doesNotMatch(shellSource, /fetch\(|Store\.save|Store\.flush|revision/, 'Basic nao pode criar request, Store paralelo ou revision.');
assert.match(cssSource, /data-ui-density="basic"/, 'CSS deve escopar o filtro visual do Basic por data-ui-density.');
assert.ok(!cssSource.includes('[data-v2-nav-toggle="management"]') && !cssSource.includes('[data-v2-nav-toggle="intelligence"]'), 'CSS nao pode esconder toggles de grupos que continuam com itens.');
assert.match(specSource, /uiDensity/, 'Spec ui-mode deve documentar o filtro Basic.');
assert.match(specSource, /preferência local/, 'Spec deve preservar persistencia local sem Store/revision.');

const indexSource = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const configurationSource = await readFile(new URL('../js/features/configuration.js', import.meta.url), 'utf8');
const portalSource = await readFile(new URL('../js/portal.js', import.meta.url), 'utf8');
const widgetsSource = await readFile(new URL('../js/core/dashboard-widgets.js', import.meta.url), 'utf8');
assert.ok(indexSource.includes('brand-density-chip') && indexSource.includes('data-density-chip'), 'Identidade do menu deve expor o chip honesto de densidade.');
assert.ok(indexSource.includes('atrium-icon-list'), 'Chip de densidade deve usar o sprite canonico.');
assert.doesNotMatch(indexSource.slice(indexSource.indexOf('brand-density-chip'), indexSource.indexOf('brand-density-chip') + 400), /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u, 'Chip de densidade nao pode usar emoji.');
assert.ok(cssSource.includes('.brand-density-chip'), 'CSS deve estilizar o chip de densidade no menu.');
assert.ok(configurationCssSource.includes('.experimental-density-status'), 'CSS deve estilizar o estado atual da densidade.');
assert.ok(configurationSource.includes('appliedDensity') && configurationSource.includes('experimental-density-status'), 'Configuracao deve expor a densidade aplicada junto do controle.');
assert.ok(configurationSource.includes('densityStatusText') && configurationSource.includes('role="status"'), 'Estado deve ser atualizado em linha com live region.');
assert.ok(configurationSource.includes('.persisted === true'), 'Gravacao deve ser confirmada antes de anunciar sucesso.');
assert.ok(configurationSource.includes('Não foi possível gravar'), 'Falha de gravacao precisa de mensagem honesta.');
assert.ok(!configurationSource.includes('effectiveDensity'), 'Nao pode sobrar codigo morto na preferencia de densidade.');
assert.match(widgetsSource, /persisted: storage\.getItem\(UI_DENSITY_STORAGE_KEY\) === normalized/, 'A gravacao deve reler o valor para provar persistencia.');
assert.ok(configurationSource.includes('Preferência gravada'), 'Estado deve distinguir densidade aplicada de preferência gravada.');
assert.doesNotMatch(configurationSource.slice(configurationSource.indexOf('experimentalDensityHeading'), configurationSource.indexOf('experimentalDensityHeading') + 1200), /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u, 'Bloco de densidade nao pode usar emoji.');
assert.ok(!cssSource.includes('transition: all') && !cssSource.includes('will-change: all'), 'Movimento do filtro Basic deve declarar propriedades explicitas.');
assert.match(cssSource, /@media \(min-width: 861px\)[\s\S]*brand-density-chip/, 'Chip deve sumir apenas no desktop recolhido, permanecendo no drawer mobile.');
assert.ok(configurationSource.includes('is-density-block') && configurationCssSource.includes('is-density-block'), 'Bloco de densidade deve ser identificado por classe estavel, nao por id de ARIA.');
assert.ok(!configurationCssSource.includes('[aria-labelledby="experimentalDensityHeading"]'), 'CSS nao pode se acoplar ao id de ARIA do bloco de densidade.');
const brandTag = indexSource.slice(indexSource.indexOf('class="brand"'), indexSource.indexOf('class="brand"') + 220);
assert.ok(brandTag.includes('aria-label='), 'O botao da marca precisa de nome acessivel proprio.');
const chipTag = indexSource.slice(indexSource.indexOf('brand-density-chip'), indexSource.indexOf('brand-density-chip') + 200);
assert.ok(chipTag.includes('aria-hidden="true"'), 'O chip deve ser redundancia visual fora do nome acessivel da marca.');
const densityBridge = portalSource.slice(portalSource.indexOf('density: Object.freeze('), portalSource.indexOf('density: Object.freeze(') + 260);
assert.ok(densityBridge.includes('readUiDensityPreference') && densityBridge.includes('writeUiDensityPreference'), 'Bridge de densidade deve usar apenas o storage local.');
assert.doesNotMatch(densityBridge, /Store\.|fetch\(|secureFetch|revision/, 'Bridge de densidade nao pode tocar Store, rede ou revision.');
const densitySetter = configurationSource.slice(configurationSource.indexOf('setDensityPreference('), configurationSource.indexOf('setDensityPreference(') + 520);
assert.doesNotMatch(densitySetter, /Store\.|fetch\(|secureFetch|revision/, 'A troca de densidade nao pode tocar Store, rede ou revision.');
assert.doesNotMatch(widgetsSource.slice(widgetsSource.indexOf('UI_DENSITY_STORAGE_KEY')), /fetch\(|secureFetch|Store\./, 'Preferencia de densidade nao pode criar request nem tocar Store.');

console.log('✓ Basic aprovado: mesma App/Store/backend, filtro visual local, chip honesto, estado aplicado x gravado, pro preservado.');
