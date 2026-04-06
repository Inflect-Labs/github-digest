# github-digest

Fetch and display merged PRs from your GitHub repos in the terminal.

## Installation

```sh
curl -fsSL https://github-digest-amber.vercel.app/install | sh
```

Then run the setup wizard:

```sh
ghd setup
```

## Setup

```bash
ghd setup
```

The wizard will:
- Ask for a GitHub token per org/account
- Walk you through adding repos in `owner/repo` format

You can re-run `ghd setup` at any time to add repos or update your tokens.

### GitHub Token

`ghd` needs a **classic personal access token** with the `repo` scope to read pull requests.

> **Why classic?** Fine-grained tokens for org repos require org owner approval. Classic tokens work immediately.

**Steps:**

1. Go to: https://github.com/settings/tokens/new?scopes=repo
2. Fill in:
   - **Note:** `ghd-<your-org>` (e.g. `ghd-Inflect-Labs`)
   - **Expiration:** No expiration *(or your preferred period)*
   - **Scopes:** ✅ `repo` — everything else unchecked
3. Click **Generate token** and paste it into `ghd setup` when prompted

The wizard will validate the token live and check repo access before saving.

## Usage

```bash
# List merged PRs — last 14 days (default)
ghd list

# Custom date range
ghd list --since 2024-03-01 --until 2024-03-15

# Filter to a specific repo
ghd list --repo podcast-buddy
ghd list --repo Inflect-Labs/podcast-buddy --since 2026-03-23
```

## Repos

```bash
# View configured repos
ghd repos

# Remove a repo
ghd repos remove
```

## Releasing a New Version

Use the release script — it bumps `package.json`, commits, pushes, creates the GitHub Release, and triggers a Vercel deploy in one command:

```bash
npm run release -- 1.0.8 "What changed in this release"
```

**What it does:**
1. Bumps `package.json` version (the single source of truth)
2. Commits `chore: release vX.Y.Z` and pushes to `main`
3. Creates a GitHub Release with the provided notes
4. Vercel auto-deploys from the `main` push

> You can also ask Claude: "release version 1.0.8 with notes: ..." and it will run the script for you.
