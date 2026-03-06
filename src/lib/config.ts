import Conf from "conf";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const EZEO_DIR = join(homedir(), ".ezeo");
const CREDENTIALS_FILE = join(EZEO_DIR, "credentials.json");

export const SUPABASE_URL = "https://nnzukmaididuhuxsaotn.supabase.co";
export const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5uenVrbWFpZGlkdWh1eHNhb3RuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQxNTM4MjMsImV4cCI6MjA2OTcyOTgyM30.placeholder_anon_key";

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
