#!/bin/sh
set -e

OWNER=bruin-data
REPO=dac
PROJECT=dac
GITHUB_BASE_URL=${DAC_GITHUB_BASE_URL:-https://github.com}
GITHUB_API_URL=${DAC_GITHUB_API_URL:-https://api.github.com}
DOWNLOAD_BASE_URL=${DAC_DOWNLOAD_BASE_URL:-${GITHUB_BASE_URL}/${OWNER}/${REPO}/releases/download}
LATEST_RELEASE_URL=${DAC_LATEST_RELEASE_URL:-${GITHUB_BASE_URL}/${OWNER}/${REPO}/releases/latest}
EDGE_RELEASES_API_URL=${DAC_EDGE_RELEASES_API_URL:-${GITHUB_API_URL}/repos/${OWNER}/${REPO}/releases?per_page=30}
BRUIN_INSTALL_URL=${DAC_BRUIN_INSTALL_URL:-https://getbruin.com/install/cli}

usage() {
  cat <<EOF
Usage: $0 [-b bindir] [-d] [--channel stable|edge] [tag]

Install DAC from GitHub releases.

Options:
  -b bindir                 installation directory (default: ~/.local/bin)
  -d                        enable debug logging
  -h                        show this help
  --channel stable|edge     install from the stable or edge channel (default: stable)

If tag is omitted, the latest release in the selected channel is installed.

Environment:
  DAC_SKIP_BRUIN_INSTALL=1  skip installing the Bruin CLI
EOF
  exit 2
}

log() {
  printf '%s\n' "$*"
}

debug() {
  if [ "${DEBUG:-0}" = "1" ]; then
    printf 'debug: %s\n' "$*" >&2
  fi
}

parse_args() {
  BINDIR=${BINDIR:-"$HOME/.local/bin"}
  DEBUG=0
  CHANNEL=stable
  TAG=

  while [ $# -gt 0 ]; do
    case "$1" in
      -b)
        shift
        [ $# -gt 0 ] || usage
        BINDIR=$1
        shift
        ;;
      -d)
        DEBUG=1
        shift
        ;;
      -h|--help)
        usage
        ;;
      --channel)
        shift
        [ $# -gt 0 ] || usage
        CHANNEL=$1
        shift
        ;;
      --channel=*)
        CHANNEL=${1#--channel=}
        shift
        ;;
      --)
        shift
        if [ $# -gt 0 ]; then
          TAG=$1
        fi
        break
        ;;
      -*)
        usage
        ;;
      *)
        TAG=$1
        shift
        break
        ;;
    esac
  done

  case "$CHANNEL" in
    stable|edge) ;;
    *)
      log "invalid channel: $CHANNEL"
      usage
      ;;
  esac
}

need_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    log "missing required command: $1"
    exit 1
  fi
}

detect_platform() {
  raw_os=$(uname -s)
  raw_arch=$(uname -m)

  case "$raw_os" in
    Darwin) OS=Darwin ;;
    Linux) OS=Linux ;;
    MINGW*|MSYS*|CYGWIN*) OS=Windows ;;
    *)
      log "unsupported operating system: $raw_os"
      exit 1
      ;;
  esac

  case "$raw_arch" in
    x86_64|amd64) ARCH=x86_64 ;;
    arm64|aarch64) ARCH=arm64 ;;
    *)
      log "unsupported architecture: $raw_arch"
      exit 1
      ;;
  esac

  if [ "$OS" = "Windows" ] && [ "$ARCH" != "x86_64" ]; then
    log "unsupported platform: Windows/$ARCH"
    exit 1
  fi

  if [ "$OS" = "Windows" ]; then
    FORMAT=zip
    BINARY=dac.exe
  else
    FORMAT=tar.gz
    BINARY=dac
  fi

  ARCHIVE="${PROJECT}_${OS}_${ARCH}.${FORMAT}"
  debug "detected platform: ${OS}/${ARCH}"
}

download() {
  url=$1
  output=$2

  if command -v curl >/dev/null 2>&1; then
    curl -fsSL "$url" -o "$output"
    return
  fi

  if command -v wget >/dev/null 2>&1; then
    wget -qO "$output" "$url"
    return
  fi

  log "either curl or wget is required"
  exit 1
}

install_bruin_cli() {
  if [ "${DAC_SKIP_BRUIN_INSTALL:-0}" = "1" ]; then
    debug "skipping Bruin CLI install because DAC_SKIP_BRUIN_INSTALL=1"
    return
  fi

  if command -v bruin >/dev/null 2>&1; then
    debug "Bruin CLI already installed at $(command -v bruin)"
    return
  fi

  bruin_tmpdir=$(mktemp -d)
  trap 'rm -rf "$bruin_tmpdir"' EXIT INT TERM

  log "Installing Bruin CLI..."
  download "$BRUIN_INSTALL_URL" "$bruin_tmpdir/install-bruin.sh"
  sh "$bruin_tmpdir/install-bruin.sh" -b "$BINDIR"

  trap - EXIT INT TERM
  rm -rf "$bruin_tmpdir"
}

resolve_tag() {
  if [ -n "$TAG" ]; then
    VERSION_TAG=$TAG
    return
  fi

  need_cmd uname

  if [ "$CHANNEL" = "edge" ]; then
    VERSION_TAG=$(resolve_latest_edge_tag)
  elif command -v curl >/dev/null 2>&1; then
    VERSION_TAG=$(curl -fsSLI -o /dev/null -w '%{url_effective}' "$LATEST_RELEASE_URL" | awk -F/ '{print $NF}')
  else
    VERSION_TAG=$(wget -S --max-redirect=0 -O /dev/null "$LATEST_RELEASE_URL" 2>&1 | awk '/Location:/ {print $2}' | tr -d '\r' | awk -F/ '{print $NF}' | tail -1)
  fi

  if [ -z "$VERSION_TAG" ]; then
    log "failed to resolve latest ${CHANNEL} release tag"
    exit 1
  fi
}

download_to_stdout() {
  url=$1

  if command -v curl >/dev/null 2>&1; then
    curl -fsSL "$url"
    return
  fi

  if command -v wget >/dev/null 2>&1; then
    wget -qO - "$url"
    return
  fi

  log "either curl or wget is required"
  exit 1
}

resolve_latest_edge_tag() {
  json=$(download_to_stdout "$EDGE_RELEASES_API_URL")

  if command -v jq >/dev/null 2>&1; then
    printf '%s' "$json" | jq -r '.[] | select(.prerelease == true and (.tag_name | startswith("v0.0.0-edge."))) | .tag_name' | head -n 1
    return
  fi

  if command -v python3 >/dev/null 2>&1; then
    printf '%s' "$json" | python3 -c '
import json
import sys

prefix = "v0.0.0-edge."
releases = json.load(sys.stdin)
for release in releases:
    tag = release.get("tag_name", "")
    if release.get("prerelease") and tag.startswith(prefix):
        print(tag)
        break
'
    return
  fi

  printf '%s' "$json" | tr '{' '\n' | grep -o '"tag_name":"v0\.0\.0-edge\.[^"]*"' | head -n 1 | cut -d'"' -f4
}

extract_archive() {
  archive=$1
  dest=$2

  case "$FORMAT" in
    tar.gz)
      tar -xzf "$archive" -C "$dest"
      ;;
    zip)
      need_cmd unzip
      unzip -q "$archive" -d "$dest"
      ;;
  esac
}

ensure_path_hint() {
  case ":$PATH:" in
    *:"$BINDIR":*) return ;;
  esac

  log ""
  log "Add ${BINDIR} to your PATH if it is not already there."
}

install_binary() {
  tmpdir=$(mktemp -d)
  trap 'rm -rf "$tmpdir"' EXIT INT TERM

  url="${DOWNLOAD_BASE_URL}/${VERSION_TAG}/${ARCHIVE}"
  archive_path="${tmpdir}/${ARCHIVE}"

  log "Installing ${PROJECT} ${VERSION_TAG} (${CHANNEL}) for ${OS}/${ARCH}..."
  debug "download url: $url"
  download "$url" "$archive_path"
  extract_archive "$archive_path" "$tmpdir"

  mkdir -p "$BINDIR"
  install "$tmpdir/$BINARY" "$BINDIR/$BINARY"

  trap - EXIT INT TERM
  rm -rf "$tmpdir"
}

main() {
  parse_args "$@"
  detect_platform
  install_bruin_cli
  resolve_tag
  install_binary
  log ""
  log "${PROJECT} ${VERSION_TAG} installed to ${BINDIR}/${BINARY}"
  ensure_path_hint
}

main "$@"
