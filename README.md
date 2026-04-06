# github-digest

Generate client-facing sprint update documents from GitHub PRs. Point it at your repos, run it, get a polished markdown summary ready to share.

## Installation

```sh
curl -fsSL https://github-digest-amber.vercel.app/api/install | sh
```

Then run the setup wizard:

```sh
ghd setup
```

## Setup

**1. Install dependencies**

```bash
npm install
```

**2. Run the setup wizard**

```bash
npm run setup
```

The wizard will:
- Ask for your GitHub token (validates it live)
- Ask for your OpenRouter API key
- Walk you through adding repos in `owner/repo` format (e.g. `Inflect-Labs/github-digest`)
- Let you set a display name for each repo (shown in the client document)

You can re-run `npm run setup` at any time to add repos or update your keys.

## Usage

```bash
# Last 14 days (uses defaults.daysBack from config)
npm run digest

# Custom date range
npm run digest -- --since 2024-03-01 --until 2024-03-15

# Preview which PRs would be included (no AI call)
npm run digest -- --dry-run

# Custom output file
npm run digest -- --output ./updates/march-sprint.md
```

Output files are saved to `./output/digest-YYYY-MM-DD-to-YYYY-MM-DD.md` by default.

## Workflow

1. Run `--dry-run` first to confirm the right PRs are captured
2. Run without `--dry-run` to generate the full AI summary
3. Copy the markdown into your client update doc or share directly

## Model

Default model is `anthropic/claude-sonnet-4-5` via OpenRouter. Change the `model` field in `digest.config.json` to use any model available on OpenRouter (e.g., `openai/gpt-4o`, `anthropic/claude-opus-4`).

## Releasing a New Version

The install script always pulls the latest GitHub Release. To ship a new version:

1. Bump the version in `package.json`
2. Commit: `git commit -m "chore: bump version to vX.Y.Z"`
3. Push to main: `git push origin main`
4. Create a GitHub Release:
   ```bash
   gh release create vX.Y.Z --title "vX.Y.Z" --notes "What changed"
   ```
   GitHub automatically attaches a source tarball. The install script picks it up on the next install.

> You can also ask Claude: "create a GitHub release for vX.Y.Z" and it will run the `gh release create` command for you.
