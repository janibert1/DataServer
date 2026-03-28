#!/usr/bin/env bash
set -euo pipefail

# DataServer Desktop Client Installer
# Usage: curl -fsSL https://raw.githubusercontent.com/<owner>/Dataserver/master/desktop/install.sh | bash

REPO="jan/Dataserver"
BINARY_NAME="dataserver"
INSTALL_DIR="${INSTALL_DIR:-/usr/local/bin}"

# Detect OS and architecture
OS="$(uname -s | tr '[:upper:]' '[:lower:]')"
ARCH="$(uname -m)"

case "$ARCH" in
  x86_64|amd64) ARCH="amd64" ;;
  aarch64|arm64) ARCH="arm64" ;;
  *) echo "Error: Unsupported architecture: $ARCH"; exit 1 ;;
esac

case "$OS" in
  linux) EXT="tar.gz" ;;
  darwin) EXT="tar.gz" ;;
  *) echo "Error: Unsupported OS: $OS"; exit 1 ;;
esac

echo "DataServer Desktop Client Installer"
echo "===================================="
echo "OS:   $OS"
echo "Arch: $ARCH"
echo ""

# Get latest release
echo "Fetching latest release..."
LATEST=$(curl -fsSL "https://api.github.com/repos/$REPO/releases" | \
  grep -o '"tag_name": *"desktop/v[^"]*"' | head -1 | grep -o 'desktop/v[^"]*')

if [ -z "$LATEST" ]; then
  echo "Error: Could not find a desktop release."
  exit 1
fi

VERSION="${LATEST#desktop/v}"
echo "Latest version: $VERSION"

# Determine asset name
ASSET_NAME="dataserver-desktop_${VERSION}_${OS}_${ARCH}"
# Try headless variant if on Linux without GUI deps
DOWNLOAD_URL="https://github.com/$REPO/releases/download/$LATEST/${ASSET_NAME}.${EXT}"

echo "Downloading from: $DOWNLOAD_URL"

# Download and extract
TMP_DIR=$(mktemp -d)
trap 'rm -rf "$TMP_DIR"' EXIT

curl -fsSL "$DOWNLOAD_URL" -o "$TMP_DIR/archive.$EXT"

cd "$TMP_DIR"
if [ "$EXT" = "tar.gz" ]; then
  tar xzf "archive.$EXT"
elif [ "$EXT" = "zip" ]; then
  unzip -q "archive.$EXT"
fi

# Install
if [ -w "$INSTALL_DIR" ]; then
  cp "$BINARY_NAME" "$INSTALL_DIR/$BINARY_NAME"
  chmod +x "$INSTALL_DIR/$BINARY_NAME"
else
  echo "Installing to $INSTALL_DIR (requires sudo)..."
  sudo cp "$BINARY_NAME" "$INSTALL_DIR/$BINARY_NAME"
  sudo chmod +x "$INSTALL_DIR/$BINARY_NAME"
fi

echo ""
echo "Installed $BINARY_NAME to $INSTALL_DIR/$BINARY_NAME"
echo ""
echo "Next steps:"
echo "  1. Run: dataserver login"
echo "  2. Follow the browser prompt to authorize"
echo "  3. Run: dataserver daemon"
echo ""
echo "The daemon will sync your files to ~/DataServer/"
