# install.sh + Vercel API Route Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Serve an `install.sh` script via a Vercel API route so users can install the `ghd` CLI with `curl -fsSL https://<project>.vercel.app/api/install | sh`.

**Architecture:** A single Vercel serverless function at `api/install.ts` returns the install shell script as `text/plain`. Every request is logged in Vercel's runtime logs. The shell script downloads the latest GitHub release tarball, extracts it to `~/.github-digest`, installs production dependencies, and symlinks `ghd` to `/usr/local/bin/ghd`.

**Tech Stack:** TypeScript, Vercel serverless functions, POSIX shell, GitHub Releases API

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `api/install.ts` | Create | Vercel serverless function — returns install script as `text/plain` |
| `vercel.json` | Create | Vercel project config — marks framework as null |

---

### Task 1: Create `vercel.json`

**Files:**
- Create: `vercel.json`

- [ ] **Step 1: Create `vercel.json`**

```json
{
  "framework": null
}
```

- [ ] **Step 2: Commit**

```bash
git add vercel.json
git commit -m "chore: add vercel.json config"
```

---

### Task 2: Create the Vercel API route `api/install.ts`

**Files:**
- Create: `api/install.ts`

- [ ] **Step 1: Create `api/install.ts` with the install script embedded**

```typescript
import type { IncomingMessage, ServerResponse } from "node:http";

const INSTALL_SCRIPT = `#!/bin/sh
set -e

REPO="Inflect-Labs/github-digest"
INSTALL_DIR="\$HOME/.github-digest"
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
TARBALL_URL=\$(curl -fsSL "\$API_URL" | grep '"tarball_url"' | sed 's/.*"tarball_url": "//;s/".*//')

if [ -z "\$TARBALL_URL" ]; then
  echo "Error: could not fetch latest release from GitHub." >&2
  exit 1
fi

# ── download & extract ───────────────────────────────────────────────────────
TMP_DIR="\$(mktemp -d /tmp/ghd-install.XXXXXX)"
trap 'rm -rf "\$TMP_DIR"' EXIT

echo "Downloading \$TARBALL_URL ..."
curl -fsSL "\$TARBALL_URL" -o "\$TMP_DIR/ghd.tar.gz" || {
  echo "Error: download failed." >&2
  exit 1
}

# Extract — GitHub tarballs contain a single top-level directory
mkdir -p "\$TMP_DIR/extracted"
tar -xzf "\$TMP_DIR/ghd.tar.gz" -C "\$TMP_DIR/extracted"
EXTRACTED=\$(ls "\$TMP_DIR/extracted" | head -1)

# Replace existing install
rm -rf "\$INSTALL_DIR"
mv "\$TMP_DIR/extracted/\$EXTRACTED" "\$INSTALL_DIR"

# ── install production dependencies ─────────────────────────────────────────
echo "Installing dependencies..."
npm install --production --prefix "\$INSTALL_DIR" --silent

# ── symlink ghd ─────────────────────────────────────────────────────────────
chmod +x "\$INSTALL_DIR/bin/ghd"

link_bin() {
  ln -sf "\$INSTALL_DIR/bin/ghd" "\$BIN_DIR/ghd"
}

if link_bin 2>/dev/null; then
  :
else
  echo "Could not write to \$BIN_DIR, retrying with sudo..."
  sudo ln -sf "\$INSTALL_DIR/bin/ghd" "\$BIN_DIR/ghd"
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
```

- [ ] **Step 2: Commit**

```bash
git add api/install.ts
git commit -m "feat: add Vercel API route serving install.sh"
```

---

### Task 3: Deploy to Vercel

**Files:** none (deployment only)

- [ ] **Step 1: Install Vercel CLI if not present**

```bash
npm install -g vercel
```

- [ ] **Step 2: Deploy**

From the repo root:

```bash
vercel --prod
```

When prompted:
- **Set up and deploy?** → Yes
- **Which scope?** → select your team/account
- **Link to existing project?** → No (first deploy) or Yes if already exists
- **Project name?** → `github-digest` (or your preferred name)
- **In which directory is your code located?** → `./` (repo root)
- **Want to modify settings?** → No

Vercel will output a production URL like:
```
https://github-digest.vercel.app
```

- [ ] **Step 3: Verify the API route returns the script**

```bash
curl -fsSL https://<your-project>.vercel.app/api/install
```

Expected: the full shell script printed to stdout (starts with `#!/bin/sh`)

- [ ] **Step 4: Create first GitHub Release so the install script has something to download**

Go to https://github.com/Inflect-Labs/github-digest/releases/new, set tag `v1.0.0`, title `v1.0.0`, and publish. GitHub auto-attaches a source tarball.

- [ ] **Step 5: Test full install end-to-end**

```bash
curl -fsSL https://<your-project>.vercel.app/api/install | sh
```

Expected output:
```
Fetching latest release...
Downloading https://api.github.com/repos/Inflect-Labs/github-digest/tarball/v1.0.0 ...
Installing dependencies...

ghd installed successfully.
Run 'ghd setup' to configure your GitHub token and OpenRouter API key.
```

Verify:
```bash
which ghd        # should print /usr/local/bin/ghd
ghd --version    # or ghd --help to confirm it runs
```

- [ ] **Step 6: Check Vercel logs**

Go to https://vercel.com → your project → **Logs** tab. Confirm the install request appeared with timestamp and request metadata.

- [ ] **Step 7: Update README with install command**

In `README.md`, add an **Installation** section above **Setup**:

```markdown
## Installation

```sh
curl -fsSL https://<your-project>.vercel.app/api/install | sh
```

Then run the setup wizard:

```sh
ghd setup
```
```

- [ ] **Step 8: Commit README update**

```bash
git add README.md
git commit -m "docs: add curl install instructions to README"
```
