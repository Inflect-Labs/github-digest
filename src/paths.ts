import { homedir } from "os";
import { join } from "path";

export const GHD_DIR = join(homedir(), ".config", "ghd");
export const CONFIG_PATH = join(GHD_DIR, "config.json");
export const ENV_PATH = join(GHD_DIR, ".env");
