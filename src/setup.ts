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

  // --- OpenRouter Key ---
  console.log("Step 1 of 2 — OpenRouter API key");
  console.log("Get your key at: https://openrouter.ai/keys\n");

  const existingOpenRouterKey = existingEnv["OPENROUTER_API_KEY"] ?? "";
  let openrouterKey: string;

  if (existingOpenRouterKey) {
    const keep = await confirm({ message: "OpenRouter key already set. Keep it?", default: true });
    openrouterKey = keep ? existingOpenRouterKey : await promptOpenRouterKey();
  } else {
    openrouterKey = await promptOpenRouterKey();
  }

  // --- Repos + Tokens ---
  console.log("\nStep 2 of 2 — Repositories & GitHub tokens");
  console.log("Add repos in owner/repo format (e.g. Inflect-Labs/github-digest)");
  console.log("Each GitHub account or org needs its own fine-grained token.\n");

  const repos: RepoConfig[] = existingConfig?.repos ? [...existingConfig.repos] : [];

  // tokenMap: envVarName -> token value (start from existing .env)
  const tokenMap: Record<string, string> = { ...existingEnv };
  delete tokenMap["OPENROUTER_API_KEY"];

  if (repos.length > 0) {
    console.log("Current repos:");
    repos.forEach((r, i) =>
      console.log(`  ${i + 1}. ${r.owner}/${r.repo} → "${r.displayName}" [${r.tokenEnvVar ?? "GITHUB_TOKEN"}]`)
    );
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
      await writeFiles(openrouterKey, tokenMap, repos, existingConfig);
      return;
    }
  }

  // ownerTokenCache: owner -> { envVarName, octokit } — avoid re-asking for same owner
  const ownerTokenCache: Record<string, { envVarName: string; octokit: Octokit }> = {};

  // Pre-populate cache from existing repos
  for (const repo of repos) {
    const envVar = repo.tokenEnvVar ?? "GITHUB_TOKEN";
    if (tokenMap[envVar] && !ownerTokenCache[repo.owner]) {
      ownerTokenCache[repo.owner] = {
        envVarName: envVar,
        octokit: new Octokit({ auth: tokenMap[envVar] }),
      };
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

    // Get or create token for this owner
    if (!ownerTokenCache[owner]) {
      const envVarName = toEnvVarName(owner);
      console.log(`\n  New account/org detected: ${owner}`);
      console.log(`  Create a fine-grained token at: https://github.com/settings/tokens/new`);
      console.log(`  Set Resource owner to "${owner}", grant Read access to Pull requests & Metadata.\n`);

      let token = await password({
        message: `  GitHub token for ${owner}:`,
        mask: "*",
        validate: (v) => v.trim().length > 0 || "Token cannot be empty",
      });
      token = token.trim();

      process.stdout.write(`  Validating...`);
      const octokit = new Octokit({ auth: token });
      try {
        await octokit.rest.users.getAuthenticated();
        console.log(` ok\n`);
      } catch {
        console.log(` failed — token may be invalid or expired\n`);
        const skip = await confirm({ message: "  Continue anyway?", default: false });
        if (!skip) continue;
      }

      tokenMap[envVarName] = token;
      ownerTokenCache[owner] = { envVarName, octokit };
    }

    const { octokit, envVarName } = ownerTokenCache[owner];

    // Validate repo exists
    process.stdout.write(`  Checking ${owner}/${repoName}...`);
    try {
      await octokit.rest.repos.get({ owner, repo: repoName });
      console.log(" found");
    } catch {
      console.log(" not found or no access");
      const skip = await confirm({ message: "  Skip this repo?", default: true });
      if (skip) continue;
    }

    const displayName = await input({
      message: "  Display name (shown in the client summary):",
      default: repoName,
      validate: (v) => v.trim().length > 0 || "Display name cannot be empty",
    });

    repos.push({ owner, repo: repoName, displayName: displayName.trim(), tokenEnvVar: envVarName });
    console.log("");

    addingRepos = await confirm({ message: "Add another repo?", default: true });
  }

  if (repos.length === 0) {
    console.error("\nNo repos added. Run setup again when you're ready.");
    process.exit(1);
  }

  await writeFiles(openrouterKey, tokenMap, repos, existingConfig);
}

async function promptOpenRouterKey(): Promise<string> {
  let key = await password({
    message: "Paste your OpenRouter API key:",
    mask: "*",
    validate: (v) => v.trim().length > 0 || "Key cannot be empty",
  });
  return key.trim();
}

async function writeFiles(
  openrouterKey: string,
  tokenMap: Record<string, string>,
  repos: RepoConfig[],
  existingConfig: DigestConfig | null
) {
  // Write .env — all tokens + openrouter key
  const envLines = Object.entries(tokenMap)
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}=${v}`);
  envLines.push(`OPENROUTER_API_KEY=${openrouterKey}`);
  writeFileSync(ENV_PATH, envLines.join("\n") + "\n", { encoding: "utf-8", mode: 0o600 });

  // Write digest.config.json
  const config: DigestConfig = {
    repos,
    defaults: existingConfig?.defaults ?? { daysBack: 14 },
    output: existingConfig?.output ?? { dir: "./output" },
    model: existingConfig?.model ?? "anthropic/claude-sonnet-4-5",
  };
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + "\n", "utf-8");

  console.log("\nSetup complete!");
  console.log(`  Repos configured: ${repos.length}`);
  const uniqueTokens = new Set(repos.map((r) => r.tokenEnvVar ?? "GITHUB_TOKEN"));
  console.log(`  GitHub tokens: ${[...uniqueTokens].join(", ")}`);
  console.log(`  .env and digest.config.json updated\n`);
  console.log("Run your first digest:");
  console.log("  ghd list --dry-run    # preview PRs");
  console.log("  ghd run               # generate AI summary\n");
}

// Convert an owner name to a safe env var name, e.g. "Inflect-Labs" -> "GITHUB_TOKEN_INFLECT_LABS"
function toEnvVarName(owner: string): string {
  return "GITHUB_TOKEN_" + owner.toUpperCase().replace(/[^A-Z0-9]/g, "_");
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
