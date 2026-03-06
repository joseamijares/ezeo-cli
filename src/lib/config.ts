import Conf from "conf";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const EZEO_DIR = join(homedir(), ".ezeo");

// Load ~/.ezeo/.env if it exists
function loadDotEnv(): void {
  const envFile = join(EZEO_DIR, ".env");
  try {
    if (!existsSync(envFile)) return;
    const content = readFileSync(envFile, "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, "");
      if (!process.env[key]) process.env[key] = val;
    }
  } catch {
    // ignore
  }
}

loadDotEnv();
const CREDENTIALS_FILE = join(EZEO_DIR, "credentials.json");

export const SUPABASE_URL =
  process.env.EZEO_SUPABASE_URL ?? "https://nnzukmaididuhuxsaotn.supabase.co";
export const SUPABASE_ANON_KEY =
  process.env.EZEO_SUPABASE_ANON_KEY ?? "";

export interface Credentials {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  user_email: string;
}

export const config = new Conf<{
  defaultProject?: string;
  defaultProjectName?: string;
}>({
  projectName: "ezeo",
});

function ensureDir(): void {
  if (!existsSync(EZEO_DIR)) {
    mkdirSync(EZEO_DIR, { recursive: true });
  }
}

export function saveCredentials(creds: Credentials): void {
  ensureDir();
  writeFileSync(CREDENTIALS_FILE, JSON.stringify(creds, null, 2), "utf-8");
}

export function loadCredentials(): Credentials | null {
  try {
    if (!existsSync(CREDENTIALS_FILE)) return null;
    const data = readFileSync(CREDENTIALS_FILE, "utf-8");
    return JSON.parse(data) as Credentials;
  } catch {
    return null;
  }
}

export function clearCredentials(): void {
  try {
    if (existsSync(CREDENTIALS_FILE)) {
      writeFileSync(CREDENTIALS_FILE, "{}", "utf-8");
    }
  } catch {
    // ignore
  }
}

export function isTokenExpired(creds: Credentials): boolean {
  // Refresh 5 minutes before expiry
  return Date.now() / 1000 > creds.expires_at - 300;
}
