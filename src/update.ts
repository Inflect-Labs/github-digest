import { execSync } from "child_process";
import { readFileSync } from "fs";
import { homedir } from "os";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const REPO = "Inflect-Labs/github-digest";
const INSTALL_URL = "https://github-digest-amber.vercel.app/install";

function currentVersion(): string {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const pkg = JSON.parse(readFileSync(join(__dirname, "../package.json"), "utf-8")) as { version: string };
  return pkg.version;
}

function isNewer(current: string, latest: string): boolean {
  const parse = (v: string) => v.replace(/^v/, "").split(".").map(Number) as [number, number, number];
  const [maj1, min1, pat1] = parse(current);
  const [maj2, min2, pat2] = parse(latest);
  return maj2 > maj1 || (maj2 === maj1 && min2 > min1) || (maj2 === maj1 && min2 === min1 && pat2 > pat1);
}

export async function checkForUpdate(): Promise<void> {
  const current = currentVersion();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3000);

  try {
    const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
      signal: controller.signal,
      headers: { "User-Agent": "ghd-cli" },
    });
    clearTimeout(timeout);

    if (!res.ok) return;

    const data = (await res.json()) as { tag_name: string };
    const latest = data.tag_name.replace(/^v/, "");

    if (!isNewer(current, latest)) return;

    const { confirm } = await import("@inquirer/prompts");
    const shouldUpdate = await confirm({
      message: `Update available: v${current} → v${latest}. Update now?`,
      default: true,
    });

    if (shouldUpdate) {
      execSync(`curl -fsSL ${INSTALL_URL} | sh`, { stdio: "inherit" });
      process.exit(0);
    }
  } catch {
    clearTimeout(timeout);
    // Silently ignore — network errors or no releases yet
  }
}

export async function uninstall(): Promise<void> {
  const { confirm } = await import("@inquirer/prompts");

  // Resolve the actual binary path (handles npm link, nvm, custom installs)
  let binaryPath = "/usr/local/bin/ghd";
  try {
    binaryPath = execSync("which ghd", { encoding: "utf-8" }).trim();
  } catch {
    // fall back to default
  }

  const installDir = join(homedir(), ".github-digest");

  const confirmed = await confirm({
    message: `This will remove ghd from ${binaryPath} and ${installDir}. Continue?`,
    default: false,
  });

  if (!confirmed) {
    console.log("Uninstall cancelled.");
    return;
  }

  // Remove binary
  try {
    execSync(`rm -f ${JSON.stringify(binaryPath)}`);
  } catch {
    try {
      execSync(`sudo rm -f ${JSON.stringify(binaryPath)}`);
    } catch {
      console.error(`Could not remove ${binaryPath} — you may need to delete it manually.`);
    }
  }

  // Remove install directory (only present for curl installs, not npm link)
  try {
    execSync(`rm -rf ${JSON.stringify(installDir)}`);
  } catch {
    console.error(`Could not remove ${installDir} — you may need to delete it manually.`);
  }

  console.log("ghd uninstalled successfully.");
}
