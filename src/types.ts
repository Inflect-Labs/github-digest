export interface RepoConfig {
  owner: string;
  repo: string;
  displayName: string;
  tokenEnvVar?: string; // env var name for this repo's GitHub token, e.g. "GITHUB_TOKEN_INFLECT"
}

export interface DigestConfig {
  repos: RepoConfig[];
  defaults: {
    daysBack: number;
  };
  output: {
    dir: string;
  };
  model?: string;
}

export interface PRFile {
  filename: string;
  status: "added" | "removed" | "modified" | "renamed" | "copied" | "changed" | "unchanged";
  additions: number;
  deletions: number;
}

export interface PRCommit {
  sha: string;
  message: string;
  author: string;
}

export interface PRData {
  number: number;
  title: string;
  body: string | null;
  author: string;
  createdAt: string;
  mergedAt: string;
  url: string;
  labels: string[];
  files: PRFile[];
  commits: PRCommit[];
}

export interface RepoDigest {
  owner: string;
  repo: string;
  displayName: string;
  prs: PRData[];
}

export interface RunOptions {
  since: string;
  until: string;
  outputPath?: string;
  dryRun: boolean;
}
