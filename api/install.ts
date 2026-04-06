import type { IncomingMessage, ServerResponse } from "node:http";

const INSTALL_SCRIPT = `#!/bin/sh
set -e

REPO="Inflect-Labs/github-digest"
INSTALL_DIR="$HOME/.github-digest"
BIN_DIR="/usr/local/bin"

# ── dependency checks ────────────────────────────────────────────────────────
if ! command -v node >/dev/null 2>&1; then
  echo "Error: node is required. Install from https://nodejs.org" >&2
  exit 1
fi
if ! command -v npm >/dev/null 2>&1; then
  echo "Error: npm is required." >&2
  exit 1
fi
if ! command -v curl >/dev/null 2>&1; then
  echo "Error: curl is required." >&2
  exit 1
fi

# ── fetch latest release tarball URL ────────────────────────────────────────
echo "Fetching latest release..."
API_URL="https://api.github.com/repos/\${REPO}/releases/latest"
TARBALL_URL=$(curl -fsSL "$API_URL" | python3 -c "import sys,json; print(json.load(sys.stdin)['tarball_url'])" 2>/dev/null)

if [ -z "$TARBALL_URL" ]; then
  echo "Error: could not fetch latest release from GitHub." >&2
  exit 1
fi

# ── download & extract ───────────────────────────────────────────────────────
TMP_DIR="$(mktemp -d /tmp/ghd-install.XXXXXX)"
trap 'rm -rf "$TMP_DIR"' EXIT

echo "Downloading $TARBALL_URL ..."
curl -fsSL "$TARBALL_URL" -o "$TMP_DIR/ghd.tar.gz" || {
  echo "Error: download failed." >&2
  exit 1
}

# Extract — GitHub tarballs contain a single top-level directory
mkdir -p "$TMP_DIR/extracted"
tar -xzf "$TMP_DIR/ghd.tar.gz" -C "$TMP_DIR/extracted"
EXTRACTED=$(ls "$TMP_DIR/extracted" | head -1)

# Replace existing install
rm -rf "$INSTALL_DIR"
mv "$TMP_DIR/extracted/$EXTRACTED" "$INSTALL_DIR"

# ── install production dependencies ─────────────────────────────────────────
echo "Installing dependencies..."
npm install --production --prefix "$INSTALL_DIR" --silent

# ── symlink ghd ─────────────────────────────────────────────────────────────
chmod +x "$INSTALL_DIR/bin/ghd"

link_bin() {
  ln -sf "$INSTALL_DIR/bin/ghd" "$BIN_DIR/ghd"
}

if link_bin 2>/dev/null; then
  :
else
  echo "Could not write to $BIN_DIR, retrying with sudo..."
  sudo ln -sf "$INSTALL_DIR/bin/ghd" "$BIN_DIR/ghd"
fi

echo ""
echo "ghd installed successfully."
echo "Run 'ghd setup' to configure your GitHub token and OpenRouter API key."
`;

export default function handler(req: IncomingMessage, res: ServerResponse) {
  res.setHeader("Content-Type", "text/plain");
  res.setHeader("Cache-Control", "no-store");
  res.end(INSTALL_SCRIPT);
}
