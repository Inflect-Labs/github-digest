import { mkdirSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { RepoDigest } from "./types.js";

export function buildDryRunOutput(digests: RepoDigest[], since: string, until: string): string {
  const lines: string[] = [];
  lines.push(`Dry run — PRs that would be included (${since} to ${until})\n`);

  let totalPRs = 0;

  for (const digest of digests) {
    lines.push(`${digest.displayName} (${digest.owner}/${digest.repo}) — ${digest.prs.length} PR${digest.prs.length !== 1 ? "s" : ""}`);

    if (digest.prs.length === 0) {
      lines.push("  (no merged PRs in this period)");
    } else {
      for (const pr of digest.prs) {
        const date = pr.mergedAt.split("T")[0];
        lines.push(`  #${pr.number}  ${date}  @${pr.author}  ${pr.title}`);
      }
    }

    lines.push("");
    totalPRs += digest.prs.length;
  }

  lines.push(`Total: ${totalPRs} merged PR${totalPRs !== 1 ? "s" : ""}`);
  return lines.join("\n");
}

export function buildDocument(summary: string, since: string, until: string): string {
  const generatedAt = new Date().toISOString().split("T")[0];

  return `# Sprint Update: ${since} – ${until}

_Generated on ${generatedAt}_

---

${summary.trim()}
`;
}

export function writeOutput(content: string, outputPath: string): string {
  const fullPath = resolve(process.cwd(), outputPath);
  mkdirSync(dirname(fullPath), { recursive: true });
  writeFileSync(fullPath, content, "utf-8");
  return fullPath;
}

export function defaultOutputPath(since: string, until: string, dir: string): string {
  return `${dir}/digest-${since}-to-${until}.md`;
}
