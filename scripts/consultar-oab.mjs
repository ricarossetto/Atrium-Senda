#!/usr/bin/env node
// Manual, read-only diagnostic. Does not decrypt the workspace or import records.
import { OmniCollectorHub } from '../lib/judicial/omni/hub.mjs';
const args = process.argv.slice(2);
const value = name => args[args.indexOf(name) + 1];
const oab = args.includes('--oab') ? value('--oab') : '';
const uf = args.includes('--uf') ? value('--uf')?.toUpperCase() : '';
if (!/^\d{1,10}$/.test(oab) || !/^[A-Z]{2}$/.test(uf)) {
  console.error('Uso: node scripts/consultar-oab.mjs --oab <NUMERO> --uf <UF>');
  process.exitCode = 1;
} else {
  try {
    const result = await new OmniCollectorHub().discoverByOab({ oab, uf });
    console.log(JSON.stringify({ success: result.success, count: result.count, source: result.court }));
    if (!result.success) process.exitCode = 1;
  } catch {
    console.error('Consulta indisponível. Verifique a configuração ou a necessidade de ação humana.');
    process.exitCode = 1;
  }
}
