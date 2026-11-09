import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { buildCloudFrontend } from '../scripts/build-cloud-frontend.mjs';

// A tela de entrada recebe a lista de módulos de uma vez, com o mesmo endereço que o navegador importa.
const parent = await mkdtemp(path.join(tmpdir(), 'atrium-preload-'));
const output = path.join(parent, 'atrium-dist-preload');
try {
  await buildCloudFrontend({ output, apiBaseUrl: 'https://api.example.test' });
  const html = readFileSync(path.join(output, 'index.html'), 'utf8');
  const links = [...html.matchAll(/<link rel="modulepreload" href="([^"]+)">/g)].map(match => match[1]);
  assert.ok(links.length > 50, `poucos módulos: ${links.length}`);
  assert.ok(html.indexOf('rel="modulepreload"') < html.indexOf('</head>'));
  assert.equal(new Set(links).size, links.length, 'sem repetição');
  assert.ok(links.some(link => /^js\/app\/bootstrap\.js\?v=/.test(link)), 'entrada presente');
  for (const link of links) assert.match(link, /^js\/.+\.js\?v=/, `mesmo endereço do import: ${link}`);
  console.log(`[PASS] Lista de módulos da tela de entrada: ${links.length}.`);
} finally {
  await rm(parent, { recursive: true, force: true });
}
