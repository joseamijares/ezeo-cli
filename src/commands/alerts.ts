import chalk from "chalk";
import ora from "ora";
import { fetchProjects, fetchInsights } from "../lib/api.js";
import { config } from "../lib/config.js";
import { formatError } from "../lib/formatter.js";
import { getGlobalOpts } from "../lib/globals.js";

const lemon = chalk.hex("#F5E642");
const cyan = chalk.hex("#00D4FF");
const lime = chalk.hex("#7CE850");
const warn = chalk.hex("#FF9500");
const danger = chalk.hex("#FF3B30");

function severityIcon(severity: string): string {
  switch (severity) {
    case "critical": return danger("⛔");
    case "high":     return warn("⚠️ ");
    case "medium":   return chalk.yellow("💡");
    default:         return chalk.gray("ℹ️ ");
  }
}

function timeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

function cleanText(str: string, maxLen: number = 120): string {
  if (!str) return "";
  const clean = str
    .replace(/[\u{1F600}-\u{1F9FF}\u{2600}-\u{2B55}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}]/gu, "")
    .replace(/#null/g, "unranked")
    .replace(/\(#null → /g, "(unranked → ")
    .replace(/\n/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (clean.length <= maxLen) return clean;
  return clean.slice(0, maxLen - 3) + "...";
}

export async function alertsCommand(projectName?: string): Promise<void> {
  const globalOpts = getGlobalOpts();
  const useJson = globalOpts.json;

  const spinner = ora("Loading alerts...").start();

  try {
    const projects = await fetchProjects();

    let project;
    const searchName = projectName ?? globalOpts.project;
    if (searchName) {
      project = projects.find(
        (p) =>
          p.name.toLowerCase().includes(searchName.toLowerCase()) ||
          p.domain?.toLowerCase().includes(searchName.toLowerCase())
      );
      if (!project) {
        spinner.fail(`Project "${searchName}" not found`);
        console.log(chalk.gray(`  Available: ${projects.map((p) => p.name).join(", ")}`));
        process.exit(1);
      }
    } else {
      const defaultId = config.get("defaultProject");
      if (defaultId) project = projects.find((p) => p.id === defaultId);
      if (!project) project = projects[0];
      if (!project) {
        spinner.fail("No projects found");
        process.exit(1);
      }
    }

    const insights = await fetchInsights(project.id, 20);
    spinner.stop();

    if (useJson) {
      process.stdout.write(JSON.stringify({ project: { id: project.id, name: project.name }, insights }, null, 2) + "\n");
      return;
    }

    console.log();
    console.log(lemon.bold(`  Alerts — ${project.name}`) + chalk.gray(` (${project.domain})`));
    console.log();

    if (insights.length === 0) {
      console.log(lime("  ✓ No active alerts. Everything looks good!"));
      console.log();
      return;
    }

    // Group by severity
    const critical = insights.filter((i) => i.severity === "critical");
    const high = insights.filter((i) => i.severity === "high");
    const medium = insights.filter((i) => i.severity === "medium");
    const low = insights.filter((i) => i.severity !== "critical" && i.severity !== "high" && i.severity !== "medium");

    const groups: [string, typeof insights][] = [
      ["Critical", critical],
      ["High Priority", high],
      ["Medium", medium],
      ["Info", low],
    ];

    for (const [label, items] of groups) {
      if (items.length === 0) continue;
      console.log(cyan.bold(`  ${label} (${items.length})`));
      for (const ins of items) {
        const age = timeAgo(new Date(ins.created_at));
        const title = cleanText(ins.title, 70);
        console.log(`  ${severityIcon(ins.severity)} ${chalk.white.bold(title)} ${chalk.gray(`(${age})`)}`);
        if (ins.summary) {
          console.log(`    ${chalk.gray(cleanText(ins.summary))}`);
        }
        console.log();
      }
    }
  } catch (err) {
    spinner.fail("Failed to load alerts");
    console.log(formatError(err instanceof Error ? err.message : String(err)));
    process.exit(1);
  }
}
