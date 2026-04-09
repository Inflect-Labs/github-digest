import { readFileSync } from "fs";
import { execSync } from "child_process";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { config as loadEnv } from "dotenv";
import { Command } from "commander";
import { ENV_PATH } from "./paths.js";
import { loadConfig, saveConfig, filterByRepo, requireEnv, getDateRange, parseLast } from "./config.js";
import { fetchMergedPRs } from "./github.js";
import { checkForUpdate, uninstall } from "./update.js";

loadEnv({ path: ENV_PATH });

const __dirname = dirname(fileURLToPath(import.meta.url));
const { version } = JSON.parse(readFileSync(join(__dirname, "../package.json"), "utf-8")) as { version: string };

const program = new Command();

program
  .name("ghd")
  .description("Fetch and display merged PRs from your GitHub repos")
  .version(version);

// ─── ghd setup ───────────────────────────────────────────────────────────────
program
  .command("setup")
  .description("Interactive setup — configure repos and GitHub token")
  .action(async () => {
    const { main } = await import("./setup.js");
    await main();
  });

// ─── ghd repos ───────────────────────────────────────────────────────────────
const reposCmd = program
  .command("repos")
  .description("View and manage configured repos");

reposCmd
  .command("list", { isDefault: true })
  .description("Show all configured repos")
  .action(() => {
    const config = loadConfig();
    console.log(`\nConfigured repos (${config.repos.length}):\n`);
    config.repos.forEach((r, i) => {
      console.log(`  ${i + 1}. ${r.owner}/${r.repo}`);
    });
    console.log("");
  });

reposCmd
  .command("add [repo]")
  .description("Add a repo (e.g. owner/repo), or run interactively if no argument given")
  .action(async (repo?: string) => {
    const { addRepos } = await import("./setup.js");
    await addRepos(repo);
  });

reposCmd
  .command("remove")
  .description("Remove one or more configured repos")
  .action(async () => {
    const config = loadConfig();
    const { checkbox } = await import("@inquirer/prompts");

    const toRemove = await checkbox({
      message: "Select repos to remove:",
      choices: config.repos.map((r) => ({
        name: `${r.owner}/${r.repo}`,
        value: `${r.owner}/${r.repo}`,
      })),
    });

    if (toRemove.length === 0) {
      console.log("Nothing removed.");
      return;
    }

    config.repos = config.repos.filter((r) => !toRemove.includes(`${r.owner}/${r.repo}`));
    saveConfig(config);
    console.log(`\nRemoved: ${toRemove.join(", ")}`);
    console.log(`Remaining repos: ${config.repos.length}\n`);
  });

// ─── ghd list ────────────────────────────────────────────────────────────────
program
  .command("list")
  .description("Show merged PRs for a date range (copies to clipboard by default)")
  .option("--since <date>", "Start date (YYYY-MM-DD)")
  .option("--until <date>", "End date (YYYY-MM-DD)")
  .option("--last <period>", "Shorthand period: day, 3d, week, fortnight, month")
  .option("--repo <name>", "Filter to a single repo (e.g. podcast-buddy or Inflect-Labs/podcast-buddy)")
  .option("--no-copy", "Print only, do not copy to clipboard")
  .action(async (opts: { since?: string; until?: string; last?: string; repo?: string; copy: boolean }) => {
    const config = loadConfig();
    const repos = opts.repo ? filterByRepo(config.repos, opts.repo) : config.repos;
    const daysBack = opts.last ? parseLast(opts.last) : config.defaults.daysBack;
    const { since, until, sinceExact, untilExact } = getDateRange(opts.since, opts.until, daysBack);
    const token = requireEnv("GITHUB_TOKEN");

    process.stderr.write(`\nFetching PRs — ${since} to ${until}\n\n`);

    const digests = await fetchMergedPRs(repos, sinceExact, untilExact, token);
    const totalPRs = digests.reduce((sum, d) => sum + d.prs.length, 0);

    if (totalPRs === 0) {
      console.log(`No merged PRs found between ${since} and ${until}.`);
      return;
    }

    const lines: string[] = [];

    for (const digest of digests) {
      const header = `${digest.owner}/${digest.repo}`;
      lines.push(`\n${"─".repeat(header.length)}`);
      lines.push(header);
      lines.push(`${"─".repeat(header.length)}`);

      if (digest.prs.length === 0) {
        lines.push("  No merged PRs in this period.\n");
        continue;
      }

      for (const pr of digest.prs) {
        lines.push(`\n  #${pr.number} ${pr.title}`);
        lines.push(`  @${pr.author} · merged ${pr.mergedAt.split("T")[0]} · ${pr.url}`);

        if (pr.labels.length > 0) {
          lines.push(`  Labels: ${pr.labels.join(", ")}`);
        }

        if (pr.body?.trim()) {
          pr.body.trim().split(/\r?\n/).forEach((line) => lines.push(`  ${line}`));
        }

        if (pr.commits.length > 0) {
          lines.push(`  Commits (${pr.commits.length}):`);
          pr.commits.slice(0, 5).forEach((c) => lines.push(`    ${c.sha}  ${c.message}`));
          if (pr.commits.length > 5) lines.push(`    … and ${pr.commits.length - 5} more`);
        }

        if (pr.files.length > 0) {
          lines.push(`  Files (${pr.files.length}):`);
          pr.files.slice(0, 8).forEach((f) => lines.push(`    ${f.status.padEnd(10)} ${f.filename}`));
          if (pr.files.length > 8) lines.push(`    … and ${pr.files.length - 8} more`);
        }
      }
    }

    lines.push(`\n${"─".repeat(40)}`);
    lines.push(`Total: ${totalPRs} merged PR${totalPRs !== 1 ? "s" : ""} across ${digests.filter((d) => d.prs.length > 0).length} repo${digests.filter((d) => d.prs.length > 0).length !== 1 ? "s" : ""}`);

    const output = lines.join("\n");
    console.log(output);

    if (opts.copy) {
      const copied = copyToClipboard(output);
      process.stderr.write(copied ? "\nCopied to clipboard.\n" : "\nCould not copy — pipe to pbcopy/xclip manually.\n");
    }
  });

function copyToClipboard(text: string): boolean {
  try {
    if (process.platform === "darwin") {
      execSync("pbcopy", { input: text });
    } else {
      try {
        execSync("xclip -selection clipboard", { input: text });
      } catch {
        execSync("xsel --clipboard --input", { input: text });
      }
    }
    return true;
  } catch {
    return false;
  }
}

// ─── ghd uninstall ───────────────────────────────────────────────────────────
program
  .command("uninstall")
  .description("Remove ghd from your system")
  .action(async () => {
    await uninstall();
  });

// ─── update check (skipped for uninstall/setup/repos to avoid noise) ─────────
const command = process.argv[2];
if (command !== "uninstall" && command !== "setup" && command !== "repos") {
  await checkForUpdate();
}

program.parse(process.argv);
