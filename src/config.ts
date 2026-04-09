import { readFileSync, writeFileSync } from "fs";
import { DigestConfig, RepoConfig } from "./types.js";
import { CONFIG_PATH } from "./paths.js";

export function loadConfig(): DigestConfig {
  let raw: string;
  try {
    raw = readFileSync(CONFIG_PATH, "utf-8");
  } catch {
    console.error(`Error: No config found at ${CONFIG_PATH}`);
    console.error(`Run 'ghd setup' to get started.`);
    process.exit(1);
  }

  let config: DigestConfig;
  try {
    config = JSON.parse(raw);
  } catch {
    console.error(`Error: config.json is not valid JSON.`);
    process.exit(1);
  }

  if (!config.repos || config.repos.length === 0) {
    console.error(`Error: No repos configured. Run 'ghd repos add'.`);
    process.exit(1);
  }

  return config;
}

export function saveConfig(config: DigestConfig): void {
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + "\n", "utf-8");
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
): { since: string; until: string; sinceExact: Date; untilExact: Date } {
  const nowMs = Date.now();

  // Display strings (YYYY-MM-DD)
  const until = untilArg ?? new Date(nowMs).toISOString().split("T")[0];

  let since: string;
  if (sinceArg) {
    since = sinceArg;
  } else {
    // Exactly N days before now, not before start-of-today.
    since = new Date(nowMs - daysBack * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0];
  }

  // Exact Date boundaries used for filtering.
  // When explicit date strings are given, treat them as UTC day boundaries.
  const sinceExact = sinceArg
    ? (() => { const d = new Date(sinceArg); d.setUTCHours(0, 0, 0, 0); return d; })()
    : new Date(nowMs - daysBack * 24 * 60 * 60 * 1000);

  const untilExact = untilArg
    ? (() => { const d = new Date(untilArg); d.setUTCHours(23, 59, 59, 999); return d; })()
    : new Date(nowMs);

  return { since, until, sinceExact, untilExact };
}
