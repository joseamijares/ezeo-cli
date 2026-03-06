import chalk from "chalk";
import ora from "ora";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_ANON_KEY, loadCredentials, isTokenExpired } from "../lib/config.js";
import { fetchProjects } from "../lib/api.js";
import { getGlobalOpts } from "../lib/globals.js";

const lemon = chalk.hex("#F5E642");
const cyan = chalk.hex("#00D4FF");
const lime = chalk.hex("#7CE850");
const warn = chalk.hex("#FF9500");
const danger = chalk.hex("#FF3B30");

interface CheckResult {
  name: string;
  status: "ok" | "warn" | "fail";
  message: string;
}

async function runChecks(): Promise<CheckResult[]> {
  const results: CheckResult[] = [];

  // 1. Anon key present
  results.push({
    name: "Supabase anon key",
    status: SUPABASE_ANON_KEY ? "ok" : "fail",
    message: SUPABASE_ANON_KEY ? "Bundled ✓" : "Missing — reinstall CLI",
  });

  // 2. Credentials file
  const creds = loadCredentials();
  if (!creds) {
    results.push({ name: "Auth credentials", status: "fail", message: "Not logged in — run `ezeo login` or `ezeo setup`" });
  } else {
    results.push({ name: "Auth credentials", status: "ok", message: `Logged in as ${creds.user_email}` });

    // 3. Token expiry
    if (isTokenExpired(creds)) {
      results.push({ name: "Session token", status: "warn", message: "Token expired — run `ezeo login`" });
    } else {
      const expiresIn = Math.floor(creds.expires_at - Date.now() / 1000);
      const hrs = Math.floor(expiresIn / 3600);
      results.push({ name: "Session token", status: "ok", message: `Valid (expires in ~${hrs}h)` });
    }
  }

  // 4. Network connectivity (ping Supabase)
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const resp = await fetch(`${SUPABASE_URL}/rest/v1/`, { signal: controller.signal });
    clearTimeout(timeout);
    results.push({
      name: "Supabase connectivity",
      status: resp.status < 500 ? "ok" : "fail",
      message: `HTTP ${resp.status}`,
    });
  } catch {
    results.push({ name: "Supabase connectivity", status: "fail", message: "Cannot reach Supabase — check your internet connection" });
  }

  // 5. API access (fetch projects if logged in)
  if (creds && !isTokenExpired(creds)) {
    try {
      const projects = await fetchProjects();
      results.push({
        name: "API access",
        status: "ok",
        message: `${projects.length} project${projects.length !== 1 ? "s" : ""} accessible`,
      });
    } catch (err) {
      results.push({
        name: "API access",
        status: "fail",
        message: err instanceof Error ? err.message : "API call failed",
      });
    }
  } else if (!creds) {
    results.push({ name: "API access", status: "warn", message: "Skipped (not logged in)" });
  }

  // 6. Node version
  const nodeVer = parseInt(process.version.slice(1).split(".")[0] ?? "0", 10);
  results.push({
    name: "Node.js version",
    status: nodeVer >= 18 ? "ok" : "warn",
    message: `${process.version}${nodeVer < 18 ? " (requires ≥18)" : ""}`,
  });

  return results;
}

export async function doctorCommand(): Promise<void> {
  const { json } = getGlobalOpts();

  if (!json) {
    console.log();
    console.log(lemon.bold("  Ezeo Doctor — System Check"));
    console.log();
  }

  const spinner = ora("Running checks...").start();
  const results = await runChecks();
  spinner.stop();

  if (json) {
    process.stdout.write(JSON.stringify(results, null, 2) + "\n");
    return;
  }

  let allOk = true;

  for (const r of results) {
    let icon: string;
    let label: string;
    if (r.status === "ok") {
      icon = lime("✓");
      label = chalk.white(r.name);
    } else if (r.status === "warn") {
      icon = warn("⚠");
      label = chalk.white(r.name);
      allOk = false;
    } else {
      icon = danger("✗");
      label = chalk.white(r.name);
      allOk = false;
    }
    console.log(`  ${icon}  ${label.padEnd(30)} ${chalk.gray(r.message)}`);
  }

  console.log();
  if (allOk) {
    console.log(lime("  All checks passed. Ezeo CLI is ready to use."));
  } else {
    const fails = results.filter((r) => r.status === "fail").length;
    const warns = results.filter((r) => r.status === "warn").length;
    if (fails > 0) {
      console.log(danger(`  ${fails} check(s) failed.`) + chalk.gray(" Fix the issues above to use the CLI."));
    } else {
      console.log(warn(`  ${warns} warning(s).`) + chalk.gray(" CLI may work but some features could be limited."));
    }
  }
  console.log();
}
