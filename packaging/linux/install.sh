#!/usr/bin/env bash
# Instalador do ATRIUM Senda para Linux.
#
# Uso:
#   curl -fsSL https://raw.githubusercontent.com/ricarossetto/Atrium-Senda/main/packaging/linux/install.sh | bash
#   bash install.sh --version 3.1.0
#   bash install.sh --appimage            # força o AppImage (sem sudo)
#   bash install.sh --deb | --rpm         # força o pacote nativo
#
# O script detecta a família da distribuição e escolhe o pacote adequado:
#   Debian/Ubuntu/Mint/Pop!_OS/Zorin  -> .deb
#   Fedora/RHEL/Rocky/Alma/openSUSE   -> .rpm
#   Arch/Manjaro/EndeavourOS          -> AppImage (ou PKGBUILD em packaging/arch)
#   Outras                            -> AppImage
set -euo pipefail

usage() {
  cat <<'EOF'
Instalador do ATRIUM Senda para Linux.

Uso:
  curl -fsSL https://raw.githubusercontent.com/ricarossetto/Atrium-Senda/main/packaging/linux/install.sh | bash
  bash install.sh --version 3.1.0
  bash install.sh --appimage            # força o AppImage (sem sudo)
  bash install.sh --deb | --rpm         # força o pacote nativo

O script detecta a família da distribuição e escolhe o pacote adequado:
  Debian/Ubuntu/Mint/Pop!_OS/Zorin  -> .deb
  Fedora/RHEL/Rocky/Alma/openSUSE   -> .rpm
  Arch/Manjaro/EndeavourOS          -> AppImage (ou PKGBUILD em packaging/arch)
  Outras                            -> AppImage
EOF
}

REPO="ricarossetto/Atrium-Senda"
VERSION="latest"
FORCE=""

while [ $# -gt 0 ]; do
  case "$1" in
    --version)
      [ $# -ge 2 ] || { echo "--version exige um valor (ex.: 3.1.0)." >&2; exit 2; }
      VERSION="$2"; shift 2 ;;
    --deb) FORCE="deb"; shift ;;
    --rpm) FORCE="rpm"; shift ;;
    --appimage) FORCE="appimage"; shift ;;
    --help|-h)
      usage
      exit 0
      ;;
    *) echo "Opção desconhecida: $1" >&2; exit 2 ;;
  esac
done

command -v curl >/dev/null 2>&1 || { echo "curl é necessário para baixar o ATRIUM." >&2; exit 1; }
command -v sha256sum >/dev/null 2>&1 || command -v shasum >/dev/null 2>&1 || {
  echo "sha256sum (ou shasum) é necessário para conferir o download." >&2; exit 1;
}

hash_file() {
  if command -v sha256sum >/dev/null 2>&1; then sha256sum "$1" | awk '{print $1}';
  else shasum -a 256 "$1" | awk '{print $1}'; fi
}

ARCH="$(uname -m)"
case "$ARCH" in
  x86_64|amd64) DEB_ARCH="amd64"; RPM_ARCH="x86_64" ;;
  aarch64|arm64) DEB_ARCH="arm64"; RPM_ARCH="aarch64" ;;
  *) echo "Arquitetura não suportada: $ARCH (há builds x86_64; arm64 quando publicado)." >&2; exit 1 ;;
esac

if [ "$VERSION" = "latest" ]; then
  API="https://api.github.com/repos/$REPO/releases/latest"
else
  API="https://api.github.com/repos/$REPO/releases/tags/v${VERSION#v}"
fi

echo "Consultando a release em $API…"
ASSETS_JSON="$(curl -fsSL "$API")"
ASSETS="$(printf '%s' "$ASSETS_JSON" | grep -o '"browser_download_url"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/.*"\(https[^"]*\)"/\1/')"
TAG="$(printf '%s' "$ASSETS_JSON" | sed -n 's/.*"tag_name"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -n1)"
[ -n "$TAG" ] || TAG="v${VERSION#v}"

pick_asset() {
  printf '%s\n' "$ASSETS" | grep -Ei "$1" | head -n1 || true
}

if [ -z "$FORCE" ]; then
  if command -v apt-get >/dev/null 2>&1; then FORCE="deb"
  elif command -v dnf >/dev/null 2>&1 || command -v yum >/dev/null 2>&1 || command -v zypper >/dev/null 2>&1; then FORCE="rpm"
  elif command -v pacman >/dev/null 2>&1; then FORCE="appimage"
  else FORCE="appimage"
  fi
fi

case "$FORCE" in
  deb) PATTERN="_${DEB_ARCH}\.deb$" ;;
  rpm) PATTERN="_${RPM_ARCH}\.rpm$|\.${RPM_ARCH}\.rpm$" ;;
  appimage) PATTERN="_${DEB_ARCH}\.AppImage$" ;;
  *) PATTERN="" ;;
esac

ASSET_URL="$(pick_asset "$PATTERN")"
if [ -z "$ASSET_URL" ]; then
  echo "Não encontrei o pacote $FORCE para $ARCH nesta release." >&2
  echo "Ativos disponíveis:" >&2
  printf '%s\n' "$ASSETS" >&2
  exit 1
fi

TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/atrium-install.XXXXXX")"
trap 'rm -rf "$TMP_DIR"' EXIT
FILE="$TMP_DIR/$(basename "$ASSET_URL")"

echo "Baixando $(basename "$ASSET_URL")…"
curl -fL --progress-bar "$ASSET_URL" -o "$FILE"

SUMS_URL="$(pick_asset 'SHA256SUMS\.txt$')"
if [ -n "$SUMS_URL" ]; then
  echo "Conferindo SHA-256…"
  curl -fsSL "$SUMS_URL" -o "$TMP_DIR/SHA256SUMS.txt"
  EXPECTED="$(awk -v f="$(basename "$ASSET_URL")" '$2 == f || $2 == "./" f { print $1; exit }' "$TMP_DIR/SHA256SUMS.txt")"
  if [ -n "$EXPECTED" ]; then
    ACTUAL="$(hash_file "$FILE")"
    if [ "$EXPECTED" != "$ACTUAL" ]; then
      echo "SHA-256 não confere. Download interrompido." >&2
      echo "esperado: $EXPECTED" >&2
      echo "obtido:   $ACTUAL" >&2
      exit 1
    fi
    echo "SHA-256 confere."
  else
    echo "Aviso: o arquivo não está listado no SHA256SUMS.txt; seguindo com a conferência disponível." >&2
  fi
else
  echo "Aviso: release sem SHA256SUMS.txt; não foi possível conferir o hash." >&2
fi

run_sudo() {
  if [ "$(id -u)" -eq 0 ]; then "$@"; else sudo "$@"; fi
}

case "$FORCE" in
  deb)
    command -v apt-get >/dev/null 2>&1 || { echo "Este sistema não usa apt/dpkg." >&2; exit 1; }
    echo "Instalando o pacote .deb (pede sudo)…"
    run_sudo apt-get install -y "$FILE"
    ;;
  rpm)
    if command -v dnf >/dev/null 2>&1; then
      echo "Instalando o pacote .rpm com dnf (pede sudo)…"
      run_sudo dnf install -y "$FILE"
    elif command -v zypper >/dev/null 2>&1; then
      echo "Instalando o pacote .rpm com zypper (pede sudo)…"
      run_sudo zypper --non-interactive install --allow-unsigned-rpm "$FILE"
    else
      echo "Instalando o pacote .rpm com yum (pede sudo)…"
      run_sudo yum install -y "$FILE"
    fi
    ;;
  appimage)
    DATA_HOME="${XDG_DATA_HOME:-$HOME/.local/share}"
    APP_DIR="$DATA_HOME/atrium-senda"
    BIN_DIR="$HOME/.local/bin"
    mkdir -p "$APP_DIR" "$BIN_DIR" "$DATA_HOME/applications" "$DATA_HOME/icons/hicolor/512x512/apps"
    install -m 755 "$FILE" "$APP_DIR/ATRIUM.AppImage"
    ln -sf "$APP_DIR/ATRIUM.AppImage" "$BIN_DIR/atrium-senda"
    ICON_URL="https://raw.githubusercontent.com/$REPO/${TAG}/desktop/src-tauri/icons/icon.png"
    if curl -fsSL "$ICON_URL" -o "$DATA_HOME/icons/hicolor/512x512/apps/atrium-senda.png" 2>/dev/null; then :; fi
    cat > "$DATA_HOME/applications/atrium-senda.desktop" <<DESKTOP
[Desktop Entry]
Type=Application
Name=ATRIUM
Comment=Gestão jurídica local e privada
Exec=$APP_DIR/ATRIUM.AppImage %U
Icon=atrium-senda
Terminal=false
Categories=Office;Finance;
StartupWMClass=ATRIUM
DESKTOP
    echo
    echo "ATRIUM instalado em $APP_DIR/ATRIUM.AppImage"
    echo "Comando: atrium-senda (garanta ~/.local/bin no PATH)"
    echo "Se a integração com o menu não aparecer, saia e entre na sessão."
    ;;
esac

echo
echo "ATRIUM Senda instalado. Abra pelo menu de aplicativos (ATRIUM)."
echo "Dados e logs ficam em \${XDG_DATA_HOME:-~/.local/share}/atrium."
