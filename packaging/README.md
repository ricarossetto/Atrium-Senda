# Empacotamento desktop

O aplicativo desktop é um shell Tauri 2 que inicia o servidor Node empacotado e abre a interface em `127.0.0.1`. O mesmo código gera os pacotes das três plataformas; muda o runner e o binário do Node.

## Windows

```powershell
pnpm install --frozen-lockfile
pnpm --dir desktop install
pnpm --dir desktop run build:resources
pnpm --dir desktop exec tauri build
```

Saída em `desktop/src-tauri/target/release/bundle/nsis` e `.../msi`. Requer Rust, MSVC e WebView2 (o Windows 10/11 já traz o runtime).

Para Windows ARM64 (Snapdragon), instale o componente **MSVC v143/v145 ARM64** no Visual Studio Build Tools e rode:

```powershell
rustup target add aarch64-pc-windows-msvc
$env:ATRIUM_DESKTOP_TARGET = "win32-arm64"
pnpm --dir desktop run build:resources
pnpm --dir desktop exec tauri build --target aarch64-pc-windows-msvc --bundles nsis
```

O staging baixa o Node 24 `win-arm64` oficial. O MSI continua restrito ao x64; o ARM64 usa NSIS.

## Linux

O build precisa de WebKitGTK 4.1. O caminho reproduzível é o runner Ubuntu 22.04 do GitHub Actions (glibc 2.35, compatível com Debian 12+ e Ubuntu 22.04+):

```bash
sudo apt-get install -y libwebkit2gtk-4.1-dev libayatana-appindicator3-dev \
  librsvg2-dev patchelf libgtk-3-dev libxdo-dev libssl-dev libfuse2 rpm
pnpm install --frozen-lockfile
pnpm --dir desktop install
ATRIUM_DESKTOP_TARGET=linux-x64 pnpm --dir desktop run build:resources
pnpm --dir desktop exec tauri build --bundles deb,rpm,appimage
```

O staging baixa o Node 24 Linux x64 oficial e copia `node` (sem `.exe`) para `desktop/resources/node`. O Tauri monta:

- `ATRIUM_<versão>_amd64.deb` — Debian, Ubuntu, Mint, Pop!_OS, Zorin, elementary, Kali;
- `ATRIUM-<versão>-1.x86_64.rpm` — Fedora, RHEL, CentOS Stream, Rocky, Alma, Oracle Linux, openSUSE, SLES;
- `ATRIUM_<versão>_amd64.AppImage` — qualquer distribuição x64, incluindo Arch, Manjaro, EndeavourOS, Garuda e CachyOS.

O `packaging/linux/install.sh` escolhe o formato pela distribuição e confere o `SHA256SUMS.txt`. O `packaging/arch/PKGBUILD` empacota o AppImage como `atrium-senda-bin`.

## macOS

O bundle exige um runner macOS (assinatura e SDK da Apple). Não há build cruzado a partir do Windows ou Linux.

```bash
pnpm --dir desktop install
ATRIUM_DESKTOP_TARGET=darwin-arm64 pnpm --dir desktop run build:resources   # ou darwin-x64
pnpm --dir desktop exec tauri build --bundles dmg
```

O workflow `.github/workflows/desktop-release.yml` compila Apple Silicon em `macos-15` e Intel em `macos-15-intel`. Sem os segredos Apple, o `.dmg` sai sem assinatura e sem notarização; o usuário confirma em Ajustes do Sistema > Privacidade e Segurança. Para assinar, cadastre `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`, `APPLE_SIGNING_IDENTITY`, `APPLE_ID`, `APPLE_PASSWORD` e `APPLE_TEAM_ID`. O binário do Node em `Resources/node` também precisa ser assinado nessa rodada.

## Release

O workflow roda em tag `v*`, publica um rascunho de release e envia:

- instaladores de cada plataforma;
- `SHA256SUMS.txt` único;
- `RELEASE_NOTES.md` da versão;
- `install.sh` e `PKGBUILD`.

Os segredos `TAURI_SIGNING_PRIVATE_KEY` e `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` assinam o updater. Sem eles, a compilação falha de propósito.

## Limites conhecidos

- Linux arm64 ainda não é publicado.
- Alpine (musl), NixOS e Solus usam outros formatos e ficam fora desta rodada.
- Os pacotes Linux não têm assinatura GPG; a integridade vem do `SHA256SUMS.txt`.
- O instalador Windows não tem assinatura Authenticode nesta edição.
