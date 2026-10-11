#!/bin/sh
# brainrotnt installer and updater.
#
#   curl -fsSL https://raw.githubusercontent.com/IqbalLx/brainrotnt/main/install.sh | sh
#
# Running it again updates brainrotnt. It only ever replaces files in ~/.brainrotnt/bin; your problems,
# sessions and backups in ~/.brainrotnt/data are never touched. The app backs the database up itself
# before an update changes it.
#
# On Linux, where AppArmor blocks the user namespace the code sandbox needs (Ubuntu 23.10 and later), it
# also runs `brnt setup sandbox`, which asks for sudo once to add an AppArmor profile that allows it for
# the brainrotnt binary only (/etc/apparmor.d/brainrotnt). Nothing else is installed outside this folder.
#
# Overrides:
#   BRAINROTNT_VERSION=v0.3.0        install that release (default: the latest)
#   BRAINROTNT_HOME=...              install somewhere else (default: ~/.brainrotnt)
#   BRAINROTNT_NO_MODIFY_PATH=1      do not add brainrotnt to PATH in your shell's startup file
#   BRAINROTNT_FORCE=1               reinstall even if this version is already installed
#   BRAINROTNT_NO_SANDBOX_SETUP=1    do not add the AppArmor profile (see brnt setup sandbox)
set -eu

REPO="IqbalLx/brainrotnt"
APP_HOME="${BRAINROTNT_HOME:-$HOME/.brainrotnt}"
BIN_DIR="$APP_HOME/bin"
DOWNLOAD_BASE="${BRAINROTNT_DOWNLOAD_BASE:-https://github.com/$REPO/releases/download}"
# Keep these markers in sync with apps/bridge/src/cli/shell-path.ts, which removes the block on uninstall.
PATH_BEGIN="# >>> brainrotnt >>>"
PATH_END="# <<< brainrotnt <<<"

if [ -t 1 ] && [ -z "${NO_COLOR:-}" ]; then
  B=$(printf '\033[1m'); D=$(printf '\033[2m'); G=$(printf '\033[32m'); Y=$(printf '\033[33m'); R=$(printf '\033[31m'); N=$(printf '\033[0m')
else
  B=""; D=""; G=""; Y=""; R=""; N=""
fi
say() { printf '%s\n' "$*"; }
ok() { printf '  %s✓%s %s\n' "$G" "$N" "$*"; }
note() { printf '  %s!%s %s\n' "$Y" "$N" "$*"; }
err() { printf '\n  %serror:%s %s\n\n' "$R" "$N" "$*" >&2; exit 1; }
have() { command -v "$1" >/dev/null 2>&1; }

# ── tools ──
if have curl; then fetch() { curl -fsSL "$1"; }; fetch_to() { curl -fsSL -o "$2" "$1"; }
elif have wget; then fetch() { wget -qO- "$1"; }; fetch_to() { wget -qO "$2" "$1"; }
else err "brainrotnt needs curl or wget to download"; fi
have tar || err "brainrotnt needs tar to unpack the download"
if have sha256sum; then sha256() { sha256sum "$1" | cut -d' ' -f1; }
elif have shasum; then sha256() { shasum -a 256 "$1" | cut -d' ' -f1; }
else err "brainrotnt needs sha256sum or shasum to check the download"; fi

# ── platform ──
os=$(uname -s)
arch=$(uname -m)
case "$os" in
  Darwin)
    # A shell running under Rosetta reports x86_64 on Apple Silicon; the native build is better there.
    if [ "$arch" = "x86_64" ] && [ "$(sysctl -n sysctl.proc_translated 2>/dev/null || echo 0)" = "1" ]; then arch="arm64"; fi
    case "$arch" in
      arm64|aarch64) platform="darwin-arm64" ;;
      x86_64) platform="darwin-x64" ;;
      *) err "unsupported Mac architecture: $arch" ;;
    esac ;;
  Linux)
    case "$arch" in
      x86_64|amd64) platform="linux-x64" ;;
      aarch64|arm64) platform="linux-arm64" ;;
      *) err "unsupported Linux architecture: $arch" ;;
    esac ;;
  *) err "brainrotnt runs on macOS and Linux (found $os). Luvus agents on Windows are not supported yet." ;;
esac

# ── version ──
if [ -n "${BRAINROTNT_VERSION:-}" ]; then
  tag="$BRAINROTNT_VERSION"
else
  tag=$(fetch "https://api.github.com/repos/$REPO/releases/latest" | grep '"tag_name"' | head -1 | cut -d'"' -f4) || true
  [ -n "$tag" ] || err "could not find the latest release (set BRAINROTNT_VERSION=vX.Y.Z to pick one)"
fi

installed=""
if [ -x "$BIN_DIR/brainrotnt" ]; then installed=$("$BIN_DIR/brainrotnt" --version 2>/dev/null || true); fi

say ""
if [ -n "$installed" ] && [ "$installed" = "$tag" ] && [ -z "${BRAINROTNT_FORCE:-}" ]; then
  ok "brainrotnt $tag is already installed and up to date ${D}($BIN_DIR)${N}"
  update_only=1
  skip_download=1
  unchanged=1
else
  unchanged=""
  skip_download=""
  if [ -n "$installed" ]; then
    say "  ${B}Updating brainrotnt${N} $installed → $tag ${D}($platform)${N}"
    update_only=1
  else
    say "  ${B}Installing brainrotnt${N} $tag ${D}($platform)${N}"
    update_only=""
  fi
fi

if [ -z "$skip_download" ]; then
  asset="brainrotnt-$tag-$platform.tar.gz"
  tmp=$(mktemp -d)
  trap 'rm -rf "$tmp"' EXIT INT TERM
  fetch_to "$DOWNLOAD_BASE/$tag/$asset" "$tmp/$asset" || err "download failed: $DOWNLOAD_BASE/$tag/$asset"
  fetch_to "$DOWNLOAD_BASE/$tag/SHA256SUMS" "$tmp/SHA256SUMS" || err "could not download the checksums for $tag"
  expected=$(grep " $asset\$" "$tmp/SHA256SUMS" | cut -d' ' -f1 | head -1)
  [ -n "$expected" ] || err "$asset is not listed in the release checksums"
  actual=$(sha256 "$tmp/$asset")
  [ "$expected" = "$actual" ] || err "checksum mismatch for $asset (expected $expected, got $actual); nothing was installed"
  ok "downloaded and verified $asset"

  tar -xzf "$tmp/$asset" -C "$tmp" || err "could not unpack $asset"
  [ -f "$tmp/brainrotnt" ] || err "$asset did not contain brainrotnt"
  chmod +x "$tmp/brainrotnt"
  "$tmp/brainrotnt" --version >/dev/null 2>&1 || err "the downloaded brainrotnt does not run on this machine; nothing was installed"

  # Copy next to the target, then rename over it: atomic, and a running brainrotnt keeps its old file.
  mkdir -p "$BIN_DIR"
  cp "$tmp/brainrotnt" "$BIN_DIR/.brainrotnt.new"
  mv -f "$BIN_DIR/.brainrotnt.new" "$BIN_DIR/brainrotnt"
  ok "installed $BIN_DIR/brainrotnt"
fi
ln -sf brainrotnt "$BIN_DIR/brnt"

if [ -d "$APP_HOME/data" ]; then ok "your data in $APP_HOME/data was not touched"; fi

# ── PATH ──
case "$BIN_DIR" in
  "$HOME"/*) path_value="\$HOME/${BIN_DIR#"$HOME"/}" ;;
  *) path_value="$BIN_DIR" ;;
esac
rc=""
if [ -z "${BRAINROTNT_NO_MODIFY_PATH:-}" ]; then
  case "$(basename "${SHELL:-sh}")" in
    zsh) rc="${ZDOTDIR:-$HOME}/.zshrc" ;;
    bash) if [ "$os" = "Darwin" ]; then rc="$HOME/.bash_profile"; else rc="$HOME/.bashrc"; fi ;;
    fish) rc="$HOME/.config/fish/conf.d/brainrotnt.fish" ;;
    *) rc="$HOME/.profile" ;;
  esac
  if [ -f "$rc" ] && grep -qF "$PATH_BEGIN" "$rc"; then
    : # already there
  else
    mkdir -p "$(dirname "$rc")"
    case "$rc" in
      *.fish) printf '%s\nfish_add_path %s\n%s\n' "$PATH_BEGIN" "$path_value" "$PATH_END" >> "$rc" ;;
      *) printf '\n%s\nexport PATH="%s:$PATH"\n%s\n' "$PATH_BEGIN" "$path_value" "$PATH_END" >> "$rc" ;;
    esac
    ok "added $BIN_DIR to PATH in $rc"
  fi
fi

have python3 || note "python3 was not found: install it so Python code answers and new problems can be checked"

# ── sandbox (Linux): it only asks for sudo when AppArmor blocks the network isolation ──
if [ "$os" = "Linux" ] && have python3 && [ -z "${BRAINROTNT_NO_SANDBOX_SETUP:-}" ]; then
  "$BIN_DIR/brainrotnt" setup sandbox || note "code answers will not run until the sandbox works: run brnt setup sandbox"
fi

# ── Claude Code (first install only, and only when there is a terminal to ask on) ──
if [ -z "$update_only" ] && have claude && [ -r /dev/tty ] && ( : < /dev/tty ) 2>/dev/null; then
  say ""
  printf '  Set up Claude Code too (MCP server and the problem-writing skill)? [Y/n] '
  read -r answer < /dev/tty || answer="n"
  case "$answer" in
    ""|y|Y|yes|YES) "$BIN_DIR/brainrotnt" setup claude || note "Claude Code setup failed; run brnt setup claude later" ;;
    *) say "  ${D}Skipped. Run brnt setup claude any time.${N}" ;;
  esac
fi

# ── next steps ──
say ""
case ":$PATH:" in
  *":$BIN_DIR:"*) on_path=1 ;;
  *) on_path="" ;;
esac
if [ -n "$unchanged" ]; then
  say "  Run ${B}brnt${N} to start it."
elif [ -n "$update_only" ]; then
  # `brnt update` checks for a running instance itself and says so precisely.
  [ -n "${BRAINROTNT_FROM_UPDATE:-}" ] || say "  If brainrotnt is running, quit it (${B}q${N}) and start it again with ${B}brnt${N}."
elif [ -n "$on_path" ]; then
  say "  Run ${B}brnt${N} to start."
elif [ -n "$rc" ]; then
  say "  Open a new terminal, or run ${B}export PATH=\"$BIN_DIR:\$PATH\"${N}, then ${B}brnt${N} to start."
else
  say "  Add $BIN_DIR to your PATH, then run ${B}brnt${N} to start."
fi
say ""
