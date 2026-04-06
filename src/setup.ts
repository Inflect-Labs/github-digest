import { input, password, confirm, select } from "@inquirer/prompts";
import { writeFileSync, existsSync, readFileSync } from "fs";
import { resolve } from "path";
import { Octokit } from "octokit";
import { DigestConfig, RepoConfig } from "./types.js";

const ENV_PATH = resolve(process.cwd(), ".env");
const CONFIG_PATH = resolve(process.cwd(), "digest.config.json");

export async function main() {
  console.log("\nWelcome to GitHub Digest setup\n");

  const existingEnv = parseEnvFile();
  const existingConfig = existsSync(CONFIG_PATH)
    ? (JSON.parse(readFileSync(CONFIG_PATH, "utf-8")) as DigestConfig)
    : null;

  // --- GitHub Token ---
  let token: string;
  let octokit: Octokit;

  const existingToken = existingEnv["GITHUB_TOKEN"] ?? "";
  if (existingToken) {
    const keep = await confirm({ message: "GitHub token already set. Keep it?", default: true });
    if (keep) {
      token = existingToken;
      octokit = new Octokit({ auth: token });
    } else {
      ({ token, octokit } = await promptToken());
    }
  } else {
    ({ token, octokit } = await promptToken());
  }

  // --- Repos ---
  console.log("\nAdd repos in owner/repo format (e.g. Inflect-Labs/github-digest)\n");

  const repos: RepoConfig[] = existingConfig?.repos ? [...existingConfig.repos] : [];

  if (repos.length > 0) {
    console.log("Current repos:");
    repos.forEach((r, i) => console.log(`  ${i + 1}. ${r.owner}/${r.repo}`));
    console.log("");

    const action = await select({
      message: "What would you like to do?",
      choices: [
        { name: "Keep existing repos and add more", value: "add" },
        { name: "Replace all repos", value: "replace" },
        { name: "Keep as-is", value: "keep" },
      ],
    });

    if (action === "replace") repos.length = 0;
    if (action === "keep") {
      writeFiles(token, repos, existingConfig);
      return;
    }
  }

  let addingRepos = true;
  while (addingRepos) {
    const repoInput = await input({
      message: `Repo ${repos.length + 1} (owner/repo):`,
      validate: (v) => {
        const parts = v.trim().split("/");
        return parts.length === 2 && parts[0].length > 0 && parts[1].length > 0
          ? true
          : "Enter in owner/repo format, e.g. Inflect-Labs/github-digest";
      },
    });

    const [owner, repoName] = repoInput.trim().split("/");

    process.stdout.write(`  Checking ${owner}/${repoName}...`);
    try {
      await octokit.rest.repos.get({ owner, repo: repoName });
      console.log(" found");
    } catch {
      console.log(" not found or no access");
      const skip = await confirm({ message: "  Skip this repo?", default: true });
      if (skip) continue;
    }

    repos.push({ owner, repo: repoName });
    console.log("");

    addingRepos = await confirm({ message: "Add another repo?", default: true });
  }

  if (repos.length === 0) {
    console.error("\nNo repos added. Run setup again when you're ready.");
    process.exit(1);
  }

  writeFiles(token, repos, existingConfig);
}

async function promptToken(): Promise<{ token: string; octokit: Octokit }> {
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
  writeFileSync(ENV_PATH, `GITHUB_TOKEN=${token}\n`, { encoding: "utf-8", mode: 0o600 });

  const config: DigestConfig = {
    repos,
    defaults: existingConfig?.defaults ?? { daysBack: 14 },
  };
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + "\n", "utf-8");

  console.log("\nSetup complete!");
  console.log(`  Repos configured: ${repos.length}`);
  console.log(`  .env and digest.config.json updated\n`);
  console.log("Run your first digest:");
  console.log("  ghd list    # view merged PRs\n");
}

function parseEnvFile(): Record<string, string> {
  if (!existsSync(ENV_PATH)) return {};
  const lines = readFileSync(ENV_PATH, "utf-8").split("\n");
  const result: Record<string, string> = {};
  for (const line of lines) {
    const [key, ...rest] = line.split("=");
    if (key?.trim() && rest.length) result[key.trim()] = rest.join("=").trim();
  }
  return result;
}
