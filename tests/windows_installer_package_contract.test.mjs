import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const installerPath = path.join(ROOT, 'install.ps1');
const installer = fs.readFileSync(installerPath, 'utf8');

assert.match(
  installer,
  /@\('atrium', 'atrium-senda'\)\s*-notcontains\s+\$package\.name/,
  'O instalador deve aceitar o nome real do pacote atrium-senda e preservar a compatibilidade com atrium.'
);

if (process.platform !== 'win32') {
  console.log('Contrato do pacote do instalador Windows validado estaticamente; execução PowerShell disponível apenas no Windows.');
  process.exit(0);
}

const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'tmp-senda-release-3.4.0-installer-'));
const fixtureDirectory = path.join(temporaryDirectory, 'pacote-sintetico');
fs.mkdirSync(fixtureDirectory, { recursive: true });

for (const relativePath of [
  'ATRIUM.bat',
  'pnpm-lock.yaml',
  'server.mjs',
  'index.html',
  'scripts/windows/atrium-bootstrap.ps1',
  'scripts/windows/atrium-server.ps1'
]) {
  const filePath = path.join(fixtureDirectory, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, 'fixture sintética\n', 'utf8');
}

const powershellScript = String.raw`
$ErrorActionPreference = 'Stop'
$installer = Get-Content -LiteralPath $env:ATRIUM_INSTALLER_PATH -Raw
$tokens = $null
$parseErrors = $null
$ast = [System.Management.Automation.Language.Parser]::ParseInput($installer, [ref]$tokens, [ref]$parseErrors)
if ($parseErrors.Count -gt 0) {
    throw "install.ps1 contém erros de sintaxe: $($parseErrors.Message -join ' | ')"
}
$functionNames = @('Stop-Install', 'Assert-DownloadedPackage')
$functions = $ast.FindAll({
    param($node)
    $node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $functionNames -contains $node.Name
}, $true)
foreach ($function in $functions) {
    Invoke-Expression $function.Extent.Text
}

function Test-PackageContract([string]$Name, [string]$Version, [string]$ExpectedVersion) {
    $packagePath = Join-Path $env:ATRIUM_INSTALLER_FIXTURE 'package.json'
    @{ name = $Name; version = $Version } | ConvertTo-Json | Set-Content -LiteralPath $packagePath -Encoding utf8
    try {
        Assert-DownloadedPackage $env:ATRIUM_INSTALLER_FIXTURE $ExpectedVersion *> $null
        return $true
    } catch {
        return $false
    }
}

$acceptedSenda = Test-PackageContract 'atrium-senda' '3.4.0' '3.4.0'
$acceptedLegacy = Test-PackageContract 'atrium' '3.4.0' '3.4.0'
$rejectedOtherName = Test-PackageContract 'outro-pacote' '3.4.0' '3.4.0'
$rejectedVersionMismatch = Test-PackageContract 'atrium-senda' '3.3.2' '3.4.0'

[pscustomobject][ordered]@{ acceptedSenda = $acceptedSenda; acceptedLegacy = $acceptedLegacy; rejectedOtherName = $rejectedOtherName; rejectedVersionMismatch = $rejectedVersionMismatch } | ConvertTo-Json -Compress
`;

try {
  const result = spawnSync('powershell.exe', [
    '-NoLogo',
    '-NoProfile',
    '-NonInteractive',
    '-Command',
    '-'
  ], {
    input: powershellScript,
    encoding: 'utf8',
    env: {
      ...process.env,
      ATRIUM_INSTALLER_PATH: installerPath,
      ATRIUM_INSTALLER_FIXTURE: fixtureDirectory
    },
    timeout: 30000
  });

  assert.equal(result.error, undefined, `Não foi possível executar o PowerShell: ${result.error?.message || ''}`);
  assert.equal(result.status, 0, `PowerShell falhou:\n${result.stdout}\n${result.stderr}`);
  const contract = JSON.parse(result.stdout.trim());
  assert.deepEqual(contract, {
    acceptedSenda: true,
    acceptedLegacy: true,
    rejectedOtherName: false,
    rejectedVersionMismatch: false
  });
} finally {
  fs.rmSync(temporaryDirectory, { recursive: true, force: true });
}

console.log('Instalador Windows aceita atrium-senda, preserva atrium e rejega nome ou versão incompatíveis.');
