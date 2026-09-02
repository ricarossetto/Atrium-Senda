import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const bat = await readFile(new URL('../ATRIUM.bat', import.meta.url));
const wrapper = await readFile(new URL('../iniciar-atrium.bat', import.meta.url));
const bootstrap = await readFile(new URL('../scripts/windows/atrium-bootstrap.ps1', import.meta.url));
const batText = bat.toString('utf8');
const wrapperText = wrapper.toString('utf8');
const bootstrapText = bootstrap.toString('utf8').replace(/^\uFEFF/, '');

assert.ok(bat.includes(Buffer.from('\r\n')), 'ATRIUM.bat deve usar CRLF para execução confiável por duplo clique.');
assert.ok(wrapper.includes(Buffer.from('\r\n')), 'O wrapper legado deve usar CRLF.');
assert.ok(bootstrap.includes(Buffer.from('\r\n')), 'O helper PowerShell deve usar CRLF.');
assert.ok(bootstrap.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf])), 'PowerShell 5 requer BOM UTF-8 para os textos em português.');

assert.match(batText, /-NoLogo -NoProfile -ExecutionPolicy Bypass -File/i);
assert.match(wrapperText, /^@echo off\r?\ncall "%~dp0ATRIUM\.bat" %\*/i);
assert.match(bootstrapText, /\[switch\]\$Doctor/);
assert.match(bootstrapText, /\[switch\]\$InstallOnly/);
assert.match(bootstrapText, /Assert-RequiredFiles/);
assert.match(bootstrapText, /Assert-Toolchain -AllowNodeInstall/);
assert.match(bootstrapText, /Install-AtriumDependencies/);
assert.match(bootstrapText, /if \(\$serverState -eq 'atrium'\)[\s\S]*Start-Process \$AtriumUrl/);
assert.match(bootstrapText, /if \(\$serverState -eq 'other'\)[\s\S]*porta 4173 está ocupada/i);
assert.match(bootstrapText, /Nenhum servidor foi iniciado e nenhum dado foi alterado/i);
assert.match(bootstrapText, /Nenhum servidor foi iniciado e os dados existentes foram preservados/i);

console.log('✓ Contrato Windows: ZIP/duplo clique, doctor, install-only, UTF-8, execução idempotente e preservação de dados PASS.');
