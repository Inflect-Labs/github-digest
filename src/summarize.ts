import OpenAI from "openai";
import { RepoDigest } from "./types.js";

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

export async function summarize(
  digests: RepoDigest[],
  since: string,
  until: string,
  apiKey: string,
  model: string
): Promise<string> {
  const client = new OpenAI({
    baseURL: OPENROUTER_BASE_URL,
    apiKey,
  });

  const prContext = buildPRContext(digests);
  const prompt = buildPrompt(prContext, since, until);

  process.stderr.write(`Calling ${model} for summary...`);

  const response = await client.chat.completions.create({
    model,
    messages: [{ role: "user", content: prompt }],
    max_tokens: 4000,
  });

  process.stderr.write(` done\n`);

  return response.choices[0]?.message?.content ?? "";
}

function buildPRContext(digests: RepoDigest[]): string {
  const sections: string[] = [];

  for (const digest of digests) {
    if (digest.prs.length === 0) continue;

    sections.push(`## ${digest.displayName} (${digest.owner}/${digest.repo})`);

    for (const pr of digest.prs) {
      sections.push(`\n### PR #${pr.number}: ${pr.title}`);
      sections.push(`- Author: ${pr.author}`);
      sections.push(`- Merged: ${pr.mergedAt.split("T")[0]}`);
      if (pr.labels.length > 0) sections.push(`- Labels: ${pr.labels.join(", ")}`);
      if (pr.body?.trim()) {
        const body = pr.body.trim().slice(0, 1000);
        sections.push(`- Description: ${body}`);
      }

      if (pr.files.length > 0) {
        const filePaths = pr.files.map((f) => `  - ${f.status}: ${f.filename}`).join("\n");
        sections.push(`- Files changed (${pr.files.length}):\n${filePaths}`);
      }

      if (pr.commits.length > 0) {
        const commitLines = pr.commits.map((c) => `  - ${c.message}`).join("\n");
        sections.push(`- Commits:\n${commitLines}`);
      }
    }

    sections.push("");
  }

  return sections.join("\n");
}

function buildPrompt(prContext: string, since: string, until: string): string {
  return `You are helping a project manager at a software development agency create a client update document.

Below is a structured list of pull requests merged between ${since} and ${until}, organized by project. Each PR includes its title, description, files changed, and commit messages.

Your task is to write a professional, client-facing sprint update document. Follow these guidelines:

1. **Group changes by feature area or theme** — do not list PRs one by one. Synthesize related work into coherent sections.
2. **Use plain language** — the client is not a developer. Avoid jargon like "refactored", "PR", "commit", "merged", "branch". Instead say things like "we improved", "we added", "the team completed", etc.
3. **Use the project display names** (e.g., "Web App", "API") not the raw repo names.
4. **Focus on value and impact** — what does each change mean for the client or their users?
5. **Be concise but complete** — bullet points work well. Don't pad or add filler.
6. **If a section had no activity**, omit it entirely.
7. **Format**: Use markdown headings (##) for each project, and bullet points for updates within each.
8. **End with a brief "Summary" section** that gives a 2-3 sentence high-level overview of the sprint.

Do not include any preamble, explanation, or meta-commentary. Start directly with the document content.

---

${prContext}`;
}
