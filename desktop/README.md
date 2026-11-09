# ATRIUM Senda — Aplicativo desktop (Windows)

Empacotamento **Tauri 2** (Rust + WebView2) do ATRIUM Senda. O instalador é auto-suficiente: ele carrega o Node.js oficial e o servidor local do ATRIUM, abre uma janela nativa e aplica atualizações pelo mecanismo interno do Tauri.

## Como funciona

```text
ATRIUM_Setup_3.0.0_x64.exe
  └─ ATRIUM.exe            (shell Rust: janela, atualização, ciclo de vida)
      └─ node.exe          (Node.js 24 win-x64, empacotado em resources/node)
          └─ server.mjs    (o servidor local do ATRIUM Senda, em resources/app)
```

- Na primeira abertura, o servidor sobe em `127.0.0.1:<porta dinâmica>` e os dados ficam em `%APPDATA%\ATRIUM\data`. Nada sai da máquina.
- O `ATRIUM.exe` espera o `/api/health` responder antes de navegar a janela; o processo Node é encerrado (árvore) junto com o aplicativo.
- Logs: `%APPDATA%\ATRIUM\logs\server.log` (+ `startup-error.log` e `update-check.log` quando houver).

## Pré-requisitos de build

- Windows 10/11 x64, Node.js 24+, pnpm 11.19.0 (ou o corepack correspondente).
- Rust estável (1.77+) e Microsoft C++ Build Tools (o `tauri` exige para compilar no Windows).
- WebView2 (já presente no Windows 11; no Windows 10 costuma vir com o sistema).
- NSIS e WiX são baixados automaticamente na primeira compilação pelo Tauri.

## Build local

```powershell
# 1. Montar o staging (copia o runtime, instala deps de produção, baixa o Node oficial)
node scripts/build-desktop-resources.mjs

# 2. Compilar e gerar os instaladores (NSIS + MSI) em src-tauri/target/release/bundle
pnpm exec tauri build
```

O passo 1 grava em `desktop/resources/` (ignorado pelo Git): `app/` (servidor + interface + dependências de produção) e `node/` (Node win-x64 + licença).

### Assinatura do atualizador (obrigatório para `createUpdaterArtifacts`)

O Tauri assina os artefatos de atualização com uma chave Ed25519. A chave **pública** fica em `src-tauri/tauri.conf.json` (`plugins.updater.pubkey`); a **privada** nunca entra no repositório.

```powershell
# Gerar um novo par (uma única vez; idealmente copie a saída do gerador no seu cofre)
pnpm exec tauri signer generate --ci -w atrium-senda-updater.key -p "<senha>"

# Build assinado
$env:TAURI_SIGNING_PRIVATE_KEY = 'C:\caminho\atrium-senda-updater.key'
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = '<senha>'
pnpm exec tauri build
```

Sem `TAURI_SIGNING_PRIVATE_KEY`/`..._PASSWORD` a compilação falha de propósito: melhor quebrar o build a publicar um instalador não assinado pelo mecanismo de atualização.

## Release (CI)

O workflow `.github/workflows/desktop-release.yml` roda em tags `v*` (ou via `workflow_dispatch`): instala as dependências, monta os recursos, compila e publica o release com instaladores, `.sig`, `latest.json` e `SHA256SUMS.txt`. Cadastre estes secrets no repositório:

- `TAURI_SIGNING_PRIVATE_KEY` — conteúdo literal do arquivo `.key` **ou** o caminho no runner;
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` — senha da chave (string vazia se não houver).

## Verificação antes de publicar

1. `computar checksums dos artefatos` e conferir as somas no `SHA256SUMS.txt`.
2. Instalar em uma máquina limpa (ou VM) e completar o primeiro cadastro.
3. Fechar e reabrir: o servidor reinicia e os dados persistem em `%APPDATA%\ATRIUM\data`.
4. Manter `.gitignore` com `desktop/resources/` e `desktop/src-tauri/target/` fora do versionamento.

## Escopo e limites

- Windows-only nesta versão. Linux/macOS continuam cobertos pela instalação manual documentada no repositório.
- Playwright/Chromium (para sessões assistidas eproc/A1) **não** são empacotados; quem usa coleta judicial instala pelo próprio aplicativo (tela de Integrações) ou via `pnpm exec playwright install chromium` na instalação manual.
