import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const bat = await readFile(new URL('../ATRIUM.bat', import.meta.url));
const wrapper = await readFile(new URL('../iniciar-atrium.bat', import.meta.url));
const installer = await readFile(new URL('../install.ps1', import.meta.url));
const bootstrap = await readFile(new URL('../scripts/windows/atrium-bootstrap.ps1', import.meta.url));
const serverLauncher = await readFile(new URL('../scripts/windows/atrium-server.ps1', import.meta.url));
const batText = bat.toString('utf8');
const wrapperText = wrapper.toString('utf8');
const installerText = installer.toString('utf8').replace(/^\uFEFF/, '');
const bootstrapText = bootstrap.toString('utf8').replace(/^\uFEFF/, '');
const serverLauncherText = serverLauncher.toString('utf8').replace(/^\uFEFF/, '');

const hasOnlyCrLf = buffer => !buffer.toString('binary').replaceAll('\r\n', '').includes('\n');
for (const [name, source] of [
  ['ATRIUM.bat', bat], ['iniciar-atrium.bat', wrapper], ['install.ps1', installer],
  ['atrium-bootstrap.ps1', bootstrap], ['atrium-server.ps1', serverLauncher]
]) {
  assert.ok(source.includes(Buffer.from('\r\n')), `${name} deve usar CRLF.`);
  assert.equal(hasOnlyCrLf(source), true, `${name} não pode misturar LF e CRLF.`);
}
assert.equal(bat.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf])), false, 'ATRIUM.bat não deve usar BOM.');
for (const [name, source] of [['install.ps1', installer], ['atrium-bootstrap.ps1', bootstrap], ['atrium-server.ps1', serverLauncher]]) {
  assert.ok(source.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf])), `${name}: PowerShell 5 requer BOM UTF-8 para os textos em português.`);
}

assert.match(batText, /-NoLogo -NoProfile -ExecutionPolicy Bypass -File/i);
assert.match(wrapperText, /^@echo off\r?\ncall "%~dp0ATRIUM\.bat" %\*/i);
assert.match(bootstrapText, /\[switch\]\$Doctor/);
assert.match(bootstrapText, /\[switch\]\$InstallOnly/);
assert.match(bootstrapText, /Assert-RequiredFiles/);
assert.match(bootstrapText, /Assert-Toolchain -AllowNodeInstall/);
assert.match(bootstrapText, /Install-AtriumDependencies/);
assert.match(bootstrapText, /if \(\$serverState -eq 'atrium'\)[\s\S]*Start-Process \$AtriumUrl/);
assert.match(bootstrapText, /if \(\$serverState -eq 'other'\)[\s\S]*porta 4173 está ocupada/i);
assert.match(bootstrapText, /Start-AtriumServerProcess[\s\S]*Wait-AtriumHealthy[\s\S]*Start-Process \$AtriumUrl/);
assert.match(bootstrapText, /winget \$verb[\s\S]*Refresh-ProcessPath/);
assert.match(bootstrapText, /corepack enable/);
assert.match(bootstrapText, /corepack prepare "pnpm@\$RequiredPnpm" --activate/);
assert.match(bootstrapText, /node_modules\\\.atrium-install\.json/);
assert.match(bootstrapText, /Get-DependencyFingerprint/);
assert.match(serverLauncherText, /corepack pnpm start/);
assert.match(serverLauncherText, /Mantenha esta janela aberta/);
assert.match(bootstrapText, /Nenhum servidor foi iniciado e nenhum dado foi alterado/i);
assert.match(bootstrapText, /Nenhum servidor foi iniciado e os dados existentes foram preservados/i);

assert.match(installerText, /\[string\]\$ReleaseTag\s*=\s*'v2\.0\.0'/);
assert.match(installerText, /\[string\]\$SourceRef\s*=\s*''/);
assert.match(installerText, /\$Repository\s*=\s*'ricarossetto\/Atrium-Senda'/);
assert.match(installerText, /archive\/refs\/heads\/\$SourceRef\.zip/);
assert.match(installerText, /archive\/refs\/tags\/\$ReleaseTag\.zip/);
assert.match(installerText, /\.env', '\.env\.collector', 'data'/);
assert.doesNotMatch(installerText, /\$PSScriptRoot|\bexit\b/i, 'O instalador deve funcionar com irm ... | iex sem encerrar o host.');
assert.match(installerText, /New-Object -ComObject WScript\.Shell/);
assert.match(installerText, /GetFolderPath\('Desktop'\)/);
assert.match(installerText, /GetFolderPath\('Programs'\)/);
assert.match(installerText, /\.TargetPath\s*=\s*Join-Path \$ResolvedInstallDirectory 'ATRIUM\.bat'/);
assert.match(installerText, /\.WorkingDirectory\s*=\s*\$ResolvedInstallDirectory/);
assert.match(installerText, /\.IconLocation\s*=.*powershell\.exe,0/);
const installOnlyIndex = installerText.indexOf('-InstallOnly');
const shortcutIndex = installerText.indexOf('Install-AtriumShortcuts', installOnlyIndex);
const startIndex = installerText.indexOf('-File $bootstrap', shortcutIndex);
assert.ok(installOnlyIndex >= 0 && shortcutIndex > installOnlyIndex && startIndex > shortcutIndex, 'Preparação, atalhos e inicialização devem ocorrer nessa ordem.');

for (const source of [batText, wrapperText, installerText, bootstrapText, serverLauncherText]) {
  assert.doesNotMatch(source, /taskkill|Stop-Process|netsh\s+advfirewall|Set-MpPreference|Add-MpPreference|Set-ExecutionPolicy/i, 'A experiência Windows não pode matar processos nem alterar firewall, Defender ou política global.');
}

console.log('✓ Contrato Windows: instalação estável/dev oficial, atalhos, toolchain, CRLF/BOM, health check, navegador e preservação de dados PASS.');
