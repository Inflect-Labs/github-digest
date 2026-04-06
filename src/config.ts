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
    console.error(`Run 'ghd setup' to configure your repos.`);
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
    console.error(`Error: digest.config.json must have at least one repo. Run 'ghd setup'.`);
    process.exit(1);
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
    console.error(`Error: Missing required environment variable ${name}.`);
    console.error(`  Run 'ghd setup' to configure your GitHub token.`);
    process.exit(1);
  }
  return value;
}

const LAST_PERIODS: Record<string, number> = {
  day: 1,
  "1d": 1,
  "3d": 3,
  "3days": 3,
  week: 7,
  "1w": 7,
  "2w": 14,
  fortnight: 14,
  month: 30,
  "30d": 30,
};

export function parseLast(last: string): number {
  const key = last.toLowerCase().replace(/\s+/g, "");
  if (LAST_PERIODS[key] !== undefined) return LAST_PERIODS[key];
  // support arbitrary Nd / Ndays
  const match = key.match(/^(\d+)d(ays?)?$/);
  if (match) return parseInt(match[1], 10);
  console.error(`Error: unrecognised --last value "${last}".`);
  console.error(`  Supported: day, 3d, week, fortnight, month, or Nd (e.g. 5d)`);
  process.exit(1);
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
