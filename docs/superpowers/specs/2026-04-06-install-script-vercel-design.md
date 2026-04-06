# Design: install.sh + Vercel API Route

**Date:** 2026-04-06
**Repo:** https://github.com/Inflect-Labs/github-digest

---

## Overview

Users install the `ghd` CLI by running:

```sh
curl -fsSL https://<project>.vercel.app/api/install | sh
```

A Vercel serverless API route returns the install script as `text/plain`. The script downloads the latest GitHub release tarball, extracts it to `~/.github-digest`, installs production dependencies, and symlinks `ghd` into `/usr/local/bin`.

Vercel is used (vs. raw GitHub) specifically for **install logging** — every `curl` request appears in Vercel's runtime logs, giving visibility into installs.

---

## Architecture

```
User
 └── curl -fsSL https://<project>.vercel.app/api/install | sh
        │
        ▼
Vercel API Route: /api/install.ts
 └── returns install.sh content as text/plain
 └── logged in Vercel runtime logs (timestamp, IP, user-agent)
        │
        ▼
install.sh (executed locally by user's shell)
 ├── checks dependencies: node, npm, curl
 ├── fetches latest release from GitHub Releases API
 │     └── GET https://api.github.com/repos/Inflect-Labs/github-digest/releases/latest
 ├── downloads tarball to /tmp/ghd-install/
 ├── extracts to ~/.github-digest/
 ├── runs: npm install --production --prefix ~/.github-digest
 ├── symlinks ~/.github-digest/bin/ghd → /usr/local/bin/ghd (sudo if needed)
 └── prints: "ghd installed. Run 'ghd setup' to configure."
```

---

## Components

### 1. `api/install.ts` (Vercel serverless function)

- Method: `GET`
- Returns the install shell script as `Content-Type: text/plain`
- The script content is embedded as a template string in the function
- Every request is logged by Vercel automatically (no extra instrumentation needed)

### 2. `install.sh` (shell script content, embedded in API route)

Steps:
1. **Dependency check** — verify `node`, `npm`, and `curl` are available; exit with clear error if not
2. **Fetch latest release** — call GitHub Releases API to get the tarball URL for the latest tag
3. **Download** — `curl` tarball into `/tmp/ghd-install/`
4. **Extract** — `tar -xzf` into `~/.github-digest/`
5. **Install deps** — `npm install --production` in `~/.github-digest/`
6. **Symlink** — create `/usr/local/bin/ghd → ~/.github-digest/bin/ghd`; if `/usr/local/bin` is not writable, retry with `sudo`
7. **Confirm** — print success message with next steps

### 3. `vercel.json`

Minimal config. No rewrites needed — Vercel routes `/api/install` automatically. Sets `framework: null` since this is not a frontend project.

---

## GitHub Releases

The install script always targets the `latest` release via the GitHub Releases API. To ship a new version:

1. Bump the version in `package.json`
2. Create a GitHub Release with a tag (e.g. `v1.0.1`)
3. GitHub automatically attaches a source tarball — the install script picks it up on the next install

No manual tarball upload needed.

---

## Error Handling

| Scenario | Behavior |
|---|---|
| `node` not found | Exit with: "Error: node is required. Install from nodejs.org" |
| `npm` not found | Exit with: "Error: npm is required." |
| GitHub API rate limit / no releases | Exit with: "Error: could not fetch latest release from GitHub." |
| Download failure | Exit with: "Error: download failed." |
| `/usr/local/bin` not writable | Retry symlink with `sudo` |
| Already installed | Overwrite silently (re-install = upgrade) |

---

## Files Changed / Created

| File | Action |
|---|---|
| `api/install.ts` | Create |
| `vercel.json` | Create |

No changes to existing source files.
