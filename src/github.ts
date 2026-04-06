import { Octokit } from "octokit";
import { RepoConfig, RepoDigest, PRData, PRFile, PRCommit } from "./types.js";

const MAX_FILES_PER_PR = 50;
const MAX_COMMITS_PER_PR = 30;

export async function fetchMergedPRs(
  repos: RepoConfig[],
  since: string,
  until: string,
  token: string
): Promise<RepoDigest[]> {
  const sinceDate = new Date(since);
  const untilDate = new Date(until);
  untilDate.setHours(23, 59, 59, 999);

  const octokit = new Octokit({ auth: token });

  return Promise.all(
    repos.map((repo) => fetchRepoDigest(octokit, repo, sinceDate, untilDate))
  );
}

async function fetchRepoDigest(
  octokit: Octokit,
  repoConfig: RepoConfig,
  since: Date,
  until: Date
): Promise<RepoDigest> {
  const { owner, repo } = repoConfig;
  process.stderr.write(`Fetching PRs for ${owner}/${repo}...`);

  const mergedPRs: PRData[] = [];

  for await (const response of octokit.paginate.iterator(octokit.rest.pulls.list, {
    owner,
    repo,
    state: "closed",
    sort: "updated",
    direction: "desc",
    per_page: 100,
  })) {
    let pastWindow = false;

    for (const pr of response.data) {
      if (!pr.merged_at) continue;

      const mergedAt = new Date(pr.merged_at);

      if (new Date(pr.updated_at) < since) {
        pastWindow = true;
        break;
      }

      if (mergedAt >= since && mergedAt <= until) {
        const prData = await fetchPRDetails(octokit, owner, repo, pr.number, pr.merged_at, pr);
        mergedPRs.push(prData);
      }
    }

    if (pastWindow) break;
  }

  process.stderr.write(` ${mergedPRs.length} merged PR${mergedPRs.length !== 1 ? "s" : ""}\n`);

  return { owner, repo, prs: mergedPRs };
}

async function fetchPRDetails(
  octokit: Octokit,
  owner: string,
  repo: string,
  prNumber: number,
  mergedAt: string,
  pr: {
    number: number;
    title: string;
    body: string | null;
    user: { login: string } | null;
    created_at: string;
    html_url: string;
    labels: Array<{ name?: string }>;
  }
): Promise<PRData> {
  const [filesResponse, commitsResponse] = await Promise.all([
    octokit.rest.pulls.listFiles({ owner, repo, pull_number: prNumber, per_page: 100 }),
    octokit.rest.pulls.listCommits({ owner, repo, pull_number: prNumber, per_page: 100 }),
  ]);

  const files: PRFile[] = filesResponse.data.slice(0, MAX_FILES_PER_PR).map((f) => ({
    filename: f.filename,
    status: f.status as PRFile["status"],
    additions: f.additions,
    deletions: f.deletions,
  }));

  const commits: PRCommit[] = commitsResponse.data.slice(0, MAX_COMMITS_PER_PR).map((c) => ({
    sha: c.sha.slice(0, 7),
    message: c.commit.message.split("\n")[0],
    author: c.commit.author?.name ?? c.author?.login ?? "unknown",
  }));

  return {
    number: pr.number,
    title: pr.title,
    body: pr.body,
    author: pr.user?.login ?? "unknown",
    createdAt: pr.created_at,
    mergedAt,
    url: pr.html_url,
    labels: pr.labels.map((l) => l.name ?? "").filter(Boolean),
    files,
    commits,
  };
}
