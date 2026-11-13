# ATRIUM Senda 3.1.0 — 13/11/2026

Esta versão leva o aplicativo desktop para Linux e macOS, atualiza o instalador do Windows e inclui a camada de movimento da interface.

## Downloads

| Sistema | Arquivo | Observação |
| --- | --- | --- |
| Windows 10/11 x64 | `ATRIUM_3.1.0_x64-setup.exe` (NSIS) | Instalação por usuário, sem administrador |
| Windows 11 ARM64 | `ATRIUM_3.1.0_arm64-setup.exe` (NSIS) | Build nativo para Snapdragon/ARM64 |
| Windows 10/11 x64 | `ATRIUM_3.1.0_x64_pt-BR.msi` | Instalação corporativa via MSI |
| Debian 12+, Ubuntu 22.04+, Mint, Pop!_OS, Zorin | `ATRIUM_3.1.0_amd64.deb` | `sudo apt install ./ATRIUM_3.1.0_amd64.deb` |
| Fedora (webkit2gtk4.1), RHEL 9+, Rocky, Alma, openSUSE | `ATRIUM-3.1.0-1.x86_64.rpm` | `sudo dnf install ./ATRIUM-3.1.0-1.x86_64.rpm` |
| Arch, Manjaro, EndeavourOS | `ATRIUM_3.1.0_amd64.AppImage` + `PKGBUILD` | AppImage direto ou `packaging/arch/PKGBUILD` |
| Qualquer Linux x64 | `ATRIUM_3.1.0_amd64.AppImage` | Não depende de instalação; ideal para teste |
| macOS 11+ Apple Silicon | `ATRIUM_3.1.0_aarch64.dmg` | Macs M1, M2, M3, M4 |
| macOS 11+ Intel | `ATRIUM_3.1.0_x64.dmg` | Macs com processador Intel |

Confira sempre o `SHA256SUMS.txt` anexado ao release antes de instalar. O instalador de Linux também confere a soma automaticamente.

Cada pacote cobre a família inteira: o `.deb` serve Debian, Ubuntu, Mint, Pop!_OS, Zorin, elementary e Kali; o `.rpm` serve Fedora, RHEL, CentOS Stream, Rocky, Alma, Oracle Linux, openSUSE e SLES; o AppImage e o `PKGBUILD` servem Arch, Manjaro, EndeavourOS, Garuda e CachyOS. Alpine (musl), NixOS e Solus usam outro formato de pacote e ficam para uma rodada própria. Linux arm64 ainda não tem artefato publicado.

## Instalação no Linux

O caminho mais simples é o script oficial:

```bash
curl -fsSL https://raw.githubusercontent.com/ricarossetto/Atrium-Senda/main/packaging/linux/install.sh | bash
```

Ele detecta a distribuição, baixa o pacote adequado, confere o SHA-256 e instala. Para escolher o formato:

```bash
bash install.sh --deb        # Debian/Ubuntu
bash install.sh --rpm        # Fedora/RHEL/openSUSE
bash install.sh --appimage   # qualquer distro, sem sudo
```

### Arch Linux

O `PKGBUILD` em `packaging/arch/` empacota o AppImage oficial com integração ao menu:

```bash
cd packaging/arch
makepkg -si
```

O pacote se chama `atrium-senda-bin` e depende de `fuse2` e `gtk3`. O AppImage já carrega o WebKitGTK necessário.

### Fedora, RHEL e openSUSE

O `.rpm` é o pacote nativo. Em sistemas com SELinux, o aplicativo roda no perfil de usuário e não exige política adicional.

## Instalação no macOS

Abra o `.dmg`, arraste o ATRIUM para a pasta Aplicativos e abra pelo Launchpad. O aplicativo inclui o Node.js da plataforma; não é preciso instalar runtime.

O `.dmg` desta versão é gerado **sem assinatura e sem notarização Apple**. O Gatekeeper mostra o aviso padrão de desenvolvedor não identificado; use Ajustes do Sistema > Privacidade e Segurança > Abrir mesmo assim, ou:

```bash
xattr -dr com.apple.quarantine /Applications/ATRIUM.app
```

O workflow já aceita os segredos `APPLE_CERTIFICATE`, `APPLE_SIGNING_IDENTITY`, `APPLE_ID`, `APPLE_PASSWORD` e `APPLE_TEAM_ID` para uma rodada futura com assinatura. O binário do Node empacotado também precisa ser assinado nessa rodada.

## Onde ficam os dados

| Sistema | Dados e logs |
| --- | --- |
| Windows | `%APPDATA%\ATRIUM\data` e `%APPDATA%\ATRIUM\logs` |
| macOS | `~/Library/Application Support/ATRIUM/data` e `.../logs` |
| Linux | `${XDG_DATA_HOME:-~/.local/share}/atrium/data` e `.../logs` |

O servidor continua local: `127.0.0.1` em porta dinâmica, sem exposição à rede.

## Interface

- Camada de movimento com receitas gratuitas do transitions.dev: menus que nascem do gatilho, modal com entrada suave, toast, tooltip com 80 ms de intenção, troca de ícone do tema, selo de notificações e indicador Lista/Kanban alinhado aos tokens do sistema.
- A entrada de view passou a ter uma única animação, direcional, em vez de duas sobrepostas.
- `prefers-reduced-motion` continua respeitado em todas as superfícies.

## Correções e robustez

- **Linux/macOS**: diretório de dados por sistema (`XDG_DATA_HOME`, `~/Library/Application Support`), binário `node` sem sufixo `.exe`, encerramento do grupo de processos com `SIGTERM`/`SIGKILL` e geração de segredos a partir de `/dev/urandom`.
- **Build**: o script de recursos agora baixa o Node oficial da plataforma alvo (`win32`, `linux`, `darwin`, x64 e arm64) e extrai com `tar`, sem depender de PowerShell.
- **Ícones**: incluído `icon.icns` para o bundle macOS e `64x64.png` para a integração Linux.

## Limitações desta versão

- Linux arm64 (Raspberry Pi, servidores ARM) ainda não tem pacote publicado; o AppImage é x86_64.
- Windows ARM64 tem instalador NSIS; o MSI continua x64.
- Os pacotes Linux não são assinados com chave GPG. A conferência é feita pelo `SHA256SUMS.txt`.
- O atualizador automático usa `latest.json`; em Linux/macOS ele baixa o artefato do updater (AppImage/app) quando disponível.
- macOS Intel usa runner separado; a versão universal única não é publicada nesta rodada.
- A assinatura Authenticode do instalador Windows permanece fora desta edição, como nas versões anteriores.

## Verificação

- `node scripts/check-syntax.mjs`: 1.096 arquivos aprovados.
- `node tests/ui_v2_motion.mjs`, `ui_v2_visual_direction.mjs`, `ui_v2_tasks.mjs`, `ui_v2_leads.mjs`, `ui_v2_publications.mjs`: verdes.
- `stable_release_contract.mjs` atualizado para 3.1.0.
- `asset-version-manifest.mjs`: 166 referências versionadas, nenhuma sem bump.

As somas SHA-256 de cada artefato estão em `SHA256SUMS.txt` no release.
