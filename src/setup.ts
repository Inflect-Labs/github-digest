import { input, password, confirm } from "@inquirer/prompts";
import { writeFileSync, existsSync, readFileSync, mkdirSync } from "fs";
import { Octokit } from "octokit";
import { DigestConfig, RepoConfig } from "./types.js";
import { GHD_DIR, CONFIG_PATH, ENV_PATH } from "./paths.js";

// ─── First-time setup ────────────────────────────────────────────────────────

export async function main() {
  console.log("\nWelcome to GitHub Digest setup\n");

  const existingEnv = parseEnvFile();
  const existingConfig = loadExistingConfig();

  // --- GitHub Token ---
  let token: string;
  let octokit: Octokit;

  const existingToken = existingEnv["GITHUB_TOKEN"] ?? "";
  if (existingToken) {
    const update = await confirm({ message: "GitHub token already set. Update it?", default: false });
    if (update) {
      ({ token, octokit } = await promptToken());
    } else {
      token = existingToken;
      octokit = new Octokit({ auth: token });
    }
  } else {
    ({ token, octokit } = await promptToken());
  }

  // --- Repos ---
  const repos: RepoConfig[] = existingConfig?.repos ? [...existingConfig.repos] : [];

  if (repos.length > 0) {
    console.log(`\nYou have ${repos.length} repo${repos.length !== 1 ? "s" : ""} configured already.`);
    console.log("Use 'ghd repos add' or 'ghd repos remove' to manage them.\n");
  } else {
    console.log("\nAdd your first repo (owner/repo format, e.g. Inflect-Labs/github-digest)\n");
    const newRepos = await promptAddRepos(repos, octokit);
    repos.push(...newRepos);

    if (repos.length === 0) {
      console.error("\nNo repos added. Run 'ghd repos add' when you're ready.");
      process.exit(1);
    }
  }

  writeFiles(token, repos, existingConfig);
}

// ─── ghd repos add ───────────────────────────────────────────────────────────

export async function addRepos() {
  const existingEnv = parseEnvFile();
  const existingConfig = loadExistingConfig();

  const token = existingEnv["GITHUB_TOKEN"];
  if (!token) {
    console.error("No GitHub token found. Run 'ghd setup' first.");
    process.exit(1);
  }

  const octokit = new Octokit({ auth: token });
  const repos: RepoConfig[] = existingConfig?.repos ? [...existingConfig.repos] : [];

  if (repos.length > 0) {
    console.log(`\nCurrent repos:`);
    repos.forEach((r, i) => console.log(`  ${i + 1}. ${r.owner}/${r.repo}`));
    console.log("");
  }

  const newRepos = await promptAddRepos(repos, octokit);

  if (newRepos.length === 0) {
    console.log("No repos added.");
    return;
  }

  repos.push(...newRepos);
  saveConfig({ repos, defaults: existingConfig?.defaults ?? { daysBack: 14 } });

  console.log(`\nAdded ${newRepos.length} repo${newRepos.length !== 1 ? "s" : ""}. Total: ${repos.length}\n`);
}

// ─── Shared helpers ──────────────────────────────────────────────────────────

async function promptAddRepos(existing: RepoConfig[], octokit: Octokit): Promise<RepoConfig[]> {
  const added: RepoConfig[] = [];

  let adding = true;
  while (adding) {
    const repoInput = await input({
      message: `Repo (owner/repo):`,
      validate: (v) => {
        const parts = v.trim().split("/");
        if (parts.length !== 2 || !parts[0].length || !parts[1].length)
          return "Enter in owner/repo format, e.g. Inflect-Labs/github-digest";
        const alreadyExists = [...existing, ...added].some(
          (r) => `${r.owner}/${r.repo}`.toLowerCase() === v.trim().toLowerCase()
        );
        if (alreadyExists) return "That repo is already configured.";
        return true;
      },
    });

    const [owner, repo] = repoInput.trim().split("/");

    process.stdout.write(`  Checking ${owner}/${repo}...`);
    try {
      await octokit.rest.repos.get({ owner, repo });
      console.log(" found");
    } catch {
      console.log(" not found or no access");
      const skip = await confirm({ message: "  Skip this repo?", default: true });
      if (skip) continue;
    }

    added.push({ owner, repo });
    console.log("");

    adding = await confirm({ message: "Add another repo?", default: false });
  }

  return added;
}

export async function promptToken(): Promise<{ token: string; octokit: Octokit }> {
  console.log("  ┌─ GitHub token needed ──────────────────────────────────────┐");
  console.log("  │");
  console.log("  │  1. Open this URL in your browser:");
  console.log("  │     https://github.com/settings/tokens/new?scopes=repo");
  console.log("  │");
  console.log("  │  2. Fill in the form:");
  console.log("  │     • Note:       ghd");
  console.log("  │     • Expiration: No expiration (or your preferred period)");
  console.log("  │     • Scopes:     ✅ repo  (everything else unchecked)");
  console.log("  │");
  console.log("  │  3. Click \"Generate token\" and paste it below.");
  console.log("  │");
  console.log("  │  Why classic PAT? Fine-grained tokens for org repos require");
  console.log("  │  org owner approval — classic tokens work immediately.");
  console.log("  └────────────────────────────────────────────────────────────┘\n");

  let token = await password({
    message: "  GitHub token:",
    mask: "*",
    validate: (v) => v.trim().length > 0 || "Token cannot be empty",
  });
  token = token.trim();

  process.stdout.write("  Validating...");
  const octokit = new Octokit({ auth: token });
  try {
    await octokit.rest.users.getAuthenticated();
    console.log(" ok\n");
  } catch {
    console.log(" failed — token may be invalid or expired\n");
    const proceed = await confirm({ message: "  Continue anyway?", default: false });
    if (!proceed) process.exit(1);
  }

  return { token, octokit };
}

function writeFiles(token: string, repos: RepoConfig[], existingConfig: DigestConfig | null) {
  mkdirSync(GHD_DIR, { recursive: true });
  writeFileSync(ENV_PATH, `GITHUB_TOKEN=${token}\n`, { encoding: "utf-8", mode: 0o600 });
  saveConfig({ repos, defaults: existingConfig?.defaults ?? { daysBack: 14 } });

  console.log("\nSetup complete!");
  console.log(`  Config: ${CONFIG_PATH}`);
  console.log(`  Repos configured: ${repos.length}\n`);
  console.log("Next steps:");
  console.log("  ghd list             # view merged PRs");
  console.log("  ghd repos add        # add more repos");
  console.log("  ghd repos remove     # remove repos\n");
}

function saveConfig(config: DigestConfig) {
  mkdirSync(GHD_DIR, { recursive: true });
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + "\n", "utf-8");
}

function loadExistingConfig(): DigestConfig | null {
  if (!existsSync(CONFIG_PATH)) return null;
  try {
    return JSON.parse(readFileSync(CONFIG_PATH, "utf-8")) as DigestConfig;
  } catch {
    return null;
  }
}

export function parseEnvFile(): Record<string, string> {
  if (!existsSync(ENV_PATH)) return {};
  const lines = readFileSync(ENV_PATH, "utf-8").split("\n");
  const result: Record<string, string> = {};
  for (const line of lines) {
    const [key, ...rest] = line.split("=");
    if (key?.trim() && rest.length) result[key.trim()] = rest.join("=").trim();
  }
  return result;
}
