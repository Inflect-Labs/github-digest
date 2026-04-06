import { readFileSync, writeFileSync } from "fs";
import { resolve } from "path";
import { DigestConfig, RepoConfig } from "./types.js";

export function loadConfig(configPath = "digest.config.json"): DigestConfig {
  const fullPath = resolve(process.cwd(), configPath);
  let raw: string;
  try {
    raw = readFileSync(fullPath, "utf-8");
  } catch {
    console.error(`Error: Could not read config file at ${fullPath}`);
    console.error(`Create a digest.config.json in your project root. See digest.config.example.json for reference.`);
    process.exit(1);
  }

  let config: DigestConfig;
  try {
    config = JSON.parse(raw);
  } catch {
    console.error(`Error: digest.config.json is not valid JSON.`);
    process.exit(1);
  }

  if (!config.repos || config.repos.length === 0) {
    console.error(`Error: digest.config.json must have at least one repo in the "repos" array.`);
    process.exit(1);
  }

  for (const repo of config.repos) {
    if (!repo.owner || !repo.repo || !repo.displayName) {
      console.error(`Error: Each repo must have "owner", "repo", and "displayName" fields.`);
      process.exit(1);
    }
  }

  return config;
}

export function saveConfig(config: DigestConfig, configPath = "digest.config.json"): void {
  const fullPath = resolve(process.cwd(), configPath);
  writeFileSync(fullPath, JSON.stringify(config, null, 2) + "\n", "utf-8");
}

export function filterByRepo(repos: RepoConfig[], repoArg: string): RepoConfig[] {
  const lower = repoArg.toLowerCase();
  const filtered = repos.filter(
    (r) =>
      r.repo.toLowerCase() === lower ||
      `${r.owner}/${r.repo}`.toLowerCase() === lower
  );
  if (filtered.length === 0) {
    console.error(`Error: no configured repo matches "${repoArg}".`);
    console.error(`Configured repos: ${repos.map((r) => `${r.owner}/${r.repo}`).join(", ")}`);
    process.exit(1);
  }
  return filtered;
}

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    const hints: Record<string, string> = {
      OPENROUTER_API_KEY: "Get your API key at https://openrouter.ai/keys",
    };
    console.error(`Error: Missing required environment variable ${name}.`);
    if (hints[name]) console.error(`  ${hints[name]}`);
    else console.error(`  Create a fine-grained PAT at https://github.com/settings/tokens and add it to your .env file.`);
    console.error(`  Run 'ghd setup' to configure tokens interactively.`);
    process.exit(1);
  }
  return value;
}

// Collect all GitHub tokens referenced by repos in the config
export function loadTokens(repos: { tokenEnvVar?: string }[]): Record<string, string> {
  const envVars = new Set(repos.map((r) => r.tokenEnvVar ?? "GITHUB_TOKEN"));
  const tokens: Record<string, string> = {};
  for (const envVar of envVars) {
    tokens[envVar] = requireEnv(envVar);
  }
  return tokens;
}

export function getDateRange(
  sinceArg: string | undefined,
  untilArg: string | undefined,
  daysBack: number
): { since: string; until: string } {
  const until = untilArg ?? new Date().toISOString().split("T")[0];
  let since: string;

  if (sinceArg) {
    since = sinceArg;
  } else {
    const d = new Date(until);
    d.setDate(d.getDate() - daysBack);
    since = d.toISOString().split("T")[0];
  }

  return { since, until };
}
