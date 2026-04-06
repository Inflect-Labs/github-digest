import "dotenv/config";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { Command } from "commander";
import { loadConfig, saveConfig, filterByRepo, requireEnv, getDateRange, loadTokens } from "./config.js";
import { fetchMergedPRs } from "./github.js";
import { summarize } from "./summarize.js";
import { buildDryRunOutput, buildDocument, writeOutput, defaultOutputPath } from "./output.js";
import { checkForUpdate, uninstall } from "./update.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const { version } = JSON.parse(readFileSync(join(__dirname, "../package.json"), "utf-8")) as { version: string };

const program = new Command();

program
  .name("ghd")
  .description("Generate client-facing sprint update documents from GitHub PRs")
  .version(version);

// ─── ghd setup ───────────────────────────────────────────────────────────────
program
  .command("setup")
  .description("Interactive setup — configure repos and API keys")
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
  .option("--config <path>", "Path to config file", "digest.config.json")
  .action((opts: { config: string }) => {
    const config = loadConfig(opts.config);
    console.log(`\nConfigured repos (${config.repos.length}):\n`);
    config.repos.forEach((r, i) => {
      console.log(`  ${i + 1}. ${r.owner}/${r.repo}  [${r.tokenEnvVar ?? "GITHUB_TOKEN"}]`);
    });
    console.log("");
  });

reposCmd
  .command("remove")
  .description("Remove one or more configured repos")
  .option("--config <path>", "Path to config file", "digest.config.json")
  .action(async (opts: { config: string }) => {
    const config = loadConfig(opts.config);
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
    saveConfig(config, opts.config);
    console.log(`\nRemoved: ${toRemove.join(", ")}`);
    console.log(`Remaining repos: ${config.repos.length}\n`);
  });

// ─── ghd list ────────────────────────────────────────────────────────────────
program
  .command("list")
  .description("Show merged PRs and their details for a date range")
  .option("--since <date>", "Start date (YYYY-MM-DD)")
  .option("--until <date>", "End date (YYYY-MM-DD)")
  .option("--repo <name>", "Filter to a single repo (e.g. podcast-buddy or Inflect-Labs/podcast-buddy)")
  .option("--config <path>", "Path to config file", "digest.config.json")
  .action(async (opts: { since?: string; until?: string; repo?: string; config: string }) => {
    const config = loadConfig(opts.config);
    const repos = opts.repo ? filterByRepo(config.repos, opts.repo) : config.repos;
    const { since, until } = getDateRange(opts.since, opts.until, config.defaults.daysBack);
    const tokens = loadTokens(repos);

    process.stderr.write(`\nFetching PRs — ${since} to ${until}\n\n`);

    const digests = await fetchMergedPRs(repos, since, until, tokens);
    const totalPRs = digests.reduce((sum, d) => sum + d.prs.length, 0);

    if (totalPRs === 0) {
      console.log(`No merged PRs found between ${since} and ${until}.`);
      return;
    }

    for (const digest of digests) {
      const header = `${digest.displayName} (${digest.owner}/${digest.repo})`;
      console.log(`\n${"─".repeat(header.length)}`);
      console.log(header);
      console.log(`${"─".repeat(header.length)}`);

      if (digest.prs.length === 0) {
        console.log("  No merged PRs in this period.\n");
        continue;
      }

      for (const pr of digest.prs) {
        console.log(`\n  #${pr.number} ${pr.title}`);
        console.log(`  @${pr.author} · merged ${pr.mergedAt.split("T")[0]} · ${pr.url}`);

        if (pr.labels.length > 0) {
          console.log(`  Labels: ${pr.labels.join(", ")}`);
        }

        if (pr.body?.trim()) {
          const preview = pr.body.trim().replace(/\r?\n/g, " ").slice(0, 200);
          console.log(`  "${preview}${pr.body.trim().length > 200 ? "…" : ""}"`);
        }

        if (pr.commits.length > 0) {
          console.log(`  Commits (${pr.commits.length}):`);
          pr.commits.slice(0, 5).forEach((c) => console.log(`    ${c.sha}  ${c.message}`));
          if (pr.commits.length > 5) console.log(`    … and ${pr.commits.length - 5} more`);
        }

        if (pr.files.length > 0) {
          console.log(`  Files (${pr.files.length}):`);
          pr.files.slice(0, 8).forEach((f) => console.log(`    ${f.status.padEnd(10)} ${f.filename}`));
          if (pr.files.length > 8) console.log(`    … and ${pr.files.length - 8} more`);
        }
      }
    }

    console.log(`\n${"─".repeat(40)}`);
    console.log(`Total: ${totalPRs} merged PR${totalPRs !== 1 ? "s" : ""} across ${digests.filter((d) => d.prs.length > 0).length} repo${digests.filter((d) => d.prs.length > 0).length !== 1 ? "s" : ""}\n`);
  });

// ─── ghd run ─────────────────────────────────────────────────────────────────
program
  .command("run")
  .description("Generate an AI sprint summary for a date range")
  .option("--since <date>", "Start date (YYYY-MM-DD)")
  .option("--until <date>", "End date (YYYY-MM-DD)")
  .option("--repo <name>", "Filter to a single repo (e.g. podcast-buddy or Inflect-Labs/podcast-buddy)")
  .option("--output <path>", "Output file path")
  .option("--config <path>", "Path to config file", "digest.config.json")
  .action(async (opts: { since?: string; until?: string; repo?: string; output?: string; config: string }) => {
    const config = loadConfig(opts.config);
    const repos = opts.repo ? filterByRepo(config.repos, opts.repo) : config.repos;
    const { since, until } = getDateRange(opts.since, opts.until, config.defaults.daysBack);
    const tokens = loadTokens(repos);

    process.stderr.write(`\nGitHub Digest — ${since} to ${until}\n`);
    process.stderr.write(`Repos: ${repos.map((r) => r.displayName).join(", ")}\n\n`);

    const digests = await fetchMergedPRs(repos, since, until, tokens);

    const totalPRs = digests.reduce((sum, d) => sum + d.prs.length, 0);
    if (totalPRs === 0) {
      process.stderr.write("\nNo merged PRs found in this period. Nothing to summarize.\n");
      process.exit(0);
    }

    process.stderr.write(`\nFound ${totalPRs} merged PR${totalPRs !== 1 ? "s" : ""} total. Summarizing...\n`);

    const openrouterKey = requireEnv("OPENROUTER_API_KEY");
    const model = config.model ?? "anthropic/claude-sonnet-4-5";

    const summary = await summarize(digests, since, until, openrouterKey, model);
    const document = buildDocument(summary, since, until);

    const outputPath = opts.output ?? defaultOutputPath(since, until, config.output.dir);
    const writtenPath = writeOutput(document, outputPath);

    process.stderr.write(`\nWritten to: ${writtenPath}\n\n`);
    console.log(document);
  });

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
