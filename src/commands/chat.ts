import * as readline from "node:readline";
import chalk from "chalk";
import ora from "ora";
import {
  fetchProjects,
  fetchGSCMetrics,
  fetchGA4Metrics,
  fetchGSCMetricsWoW,
  fetchGA4MetricsWoW,
  fetchGEOMetrics,
  fetchRankingsSummary,
  fetchInsights,
  fetchTopKeywords,
  type Project,
} from "../lib/api.js";
import { config } from "../lib/config.js";
import { classifyIntent, type Intent } from "../lib/router.js";
import {
  greeting,
  formatStatus,
  formatInsights,
  formatProjectList,
  formatChatResponse,
  formatError,
  logo,
} from "../lib/formatter.js";
import { loadCredentials } from "../lib/config.js";
import { appendToHistory, initProjectMemory } from "../lib/memory.js";

let projects: Project[] = [];
let currentProject: Project | undefined;

async function resolveProject(name?: string): Promise<Project | undefined> {
  if (name) {
    return projects.find(
      (p) =>
        p.name.toLowerCase().includes(name.toLowerCase()) ||
        p.domain?.toLowerCase().includes(name.toLowerCase())
    );
  }
  return currentProject;
}

async function handleIntent(intent: Intent): Promise<string | null> {
  switch (intent.type) {
    case "exit":
      return null; // signal to exit

    case "help":
      return [
        "",
        chalk.hex("#F5E642").bold("  Available commands:"),
        "",
        "  " + chalk.white("status") + chalk.gray("             — Project dashboard overview"),
        "  " + chalk.white("traffic") + chalk.gray("            — Search Console metrics"),
        "  " + chalk.white("rankings") + chalk.gray("           — Keyword ranking positions"),
        "  " + chalk.white("geo / citations") + chalk.gray("    — AI visibility metrics"),
        "  " + chalk.white("insights") + chalk.gray("           — Recent alerts and insights"),
        "  " + chalk.white("projects") + chalk.gray("           — List all projects"),
        "  " + chalk.white("competitors") + chalk.gray("        — Competitive analysis"),
        "  " + chalk.white("help") + chalk.gray("               — Show this message"),
        "  " + chalk.white("exit") + chalk.gray("               — Leave chat"),
        "",
        chalk.gray("  Tip: Add a project name after any command, e.g. 'status AquaProVac'"),
        "",
      ].join("\n");

    case "projects":
      return "\n" + formatProjectList(projects, config.get("defaultProject")) + "\n";

    case "status": {
      const project = await resolveProject(intent.project);
      if (!project) return formatError(`Project not found. Try 'projects' to see all.`);
      const spinner = ora("Loading...").start();
      const [gscWoW, ga4WoW, geo, rankings, insights, topKeywords] = await Promise.all([
        fetchGSCMetricsWoW(project.id).catch(() => ({
          current: { clicks: 0, impressions: 0, ctr: 0, position: 0, hasData: false },
          previous: { clicks: 0, impressions: 0, ctr: 0, position: 0, hasData: false },
          delta: {
            clicks: { value: 0, pct: null },
            impressions: { value: 0, pct: null },
            ctr: { value: 0, pct: null },
            position: { value: 0, pct: null },
          },
        })),
        fetchGA4MetricsWoW(project.id).catch(() => ({
          current: { sessions: 0, users: 0, bounceRate: 0, hasData: false },
          previous: { sessions: 0, users: 0, bounceRate: 0, hasData: false },
          delta: {
            sessions: { value: 0, pct: null },
            users: { value: 0, pct: null },
            bounceRate: { value: 0, pct: null },
          },
        })),
        fetchGEOMetrics(project.id).catch(() => ({ totalCitations: 0, platforms: {}, citationRate: 0, hasData: false })),
        fetchRankingsSummary(project.id).catch(() => ({ top3: 0, top10: 0, top20: 0, total: 0 })),
        fetchInsights(project.id, 3).catch(() => []),
        fetchTopKeywords(project.id, 5).catch(() => []),
      ]);
      spinner.stop();
      let result = formatStatus(project, gscWoW, ga4WoW, geo, rankings, topKeywords);
      if (insights.length > 0) result += "\n" + formatInsights(insights);
      return result;
    }

    case "traffic": {
      const project = await resolveProject(intent.project);
      if (!project) return formatError("Project not found.");
      const spinner = ora("Loading GSC data...").start();
      const gsc = await fetchGSCMetrics(project.id);
      spinner.stop();
      return formatChatResponse(
        `${project.name} (7d): ${gsc.clicks.toLocaleString()} clicks, ${gsc.impressions.toLocaleString()} impressions, ${(gsc.ctr * 100).toFixed(1)}% CTR, avg position ${gsc.position.toFixed(1)}`
      );
    }

    case "rankings": {
      const project = await resolveProject(intent.project);
      if (!project) return formatError("Project not found.");
      const spinner = ora("Loading rankings...").start();
      const r = await fetchRankingsSummary(project.id);
      spinner.stop();
      return formatChatResponse(
        `${project.name}: ${r.top3} in top 3, ${r.top10} in top 10, ${r.top20} in top 20 (${r.total} total tracked)`
      );
    }

    case "geo": {
      const project = await resolveProject(intent.project);
      if (!project) return formatError("Project not found.");
      const spinner = ora("Loading AI visibility...").start();
      const geo = await fetchGEOMetrics(project.id);
      spinner.stop();
      if (geo.totalCitations === 0) {
        return formatChatResponse(`${project.name}: No AI citations detected in the last 30 days.`);
      }
      const platformStr = Object.entries(geo.platforms)
        .sort(([, a], [, b]) => b - a)
        .map(([name, count]) => `${name} (${count})`)
        .join(", ");
      return formatChatResponse(
        `${project.name}: ${geo.totalCitations} citations, ${geo.citationRate.toFixed(1)}% citation rate. Platforms: ${platformStr}`
      );
    }

    case "insights": {
      const project = await resolveProject(intent.project);
      if (!project) return formatError("Project not found.");
      const spinner = ora("Loading insights...").start();
      const insights = await fetchInsights(project.id, 10);
      spinner.stop();
      return "\n" + formatInsights(insights);
    }

    case "keywords": {
      return formatChatResponse("Keyword details coming in Phase 2. Use 'rankings' for current summary.");
    }

    case "competitors": {
      return formatChatResponse("Competitive analysis coming in Phase 2. Use the Ezeo dashboard for now.");
    }

    case "audit": {
      return formatChatResponse(
        `Audit for ${intent.url ?? "your site"} coming in Phase 2. ` +
        `For now, run audits from the Ezeo dashboard.`
      );
    }

    case "unknown":
      return formatChatResponse(
        `I don't understand "${intent.raw}" yet. Type 'help' to see what I can do.`
      );
  }
}

export async function chatCommand(): Promise<void> {
  const creds = loadCredentials();
  if (!creds?.access_token) {
    console.log(formatError("Not logged in. Run `ezeo login` first."));
    process.exit(1);
  }

  const spinner = ora("Connecting...").start();

  try {
    projects = await fetchProjects();

    const defaultId = config.get("defaultProject");
    currentProject = projects.find((p) => p.id === defaultId) ?? projects[0];

    // Initialize memory for current project
    if (currentProject) {
      initProjectMemory(currentProject.name, currentProject.domain ?? "");
    }

    spinner.stop();

    console.log();
    console.log(greeting(creds.user_email, projects.length));

    if (currentProject) {
      console.log(
        chalk.gray(`   Active project: ${chalk.white(currentProject.name)}`)
      );
    }
    console.log();
    console.log(chalk.gray("   Type 'help' for commands, 'exit' to quit."));
    console.log();

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: chalk.hex("#F5E642")("ezeo > "),
    });

    rl.prompt();

    rl.on("line", async (line) => {
      const input = line.trim();
      if (!input) {
        rl.prompt();
        return;
      }

      try {
        const intent = classifyIntent(input);
        const result = await handleIntent(intent);

        if (result === null) {
          console.log(chalk.gray("\n  Bye!\n"));
          rl.close();
          return;
        }

        console.log(result);

        // Log to project history
        if (currentProject && intent.type !== "help" && intent.type !== "exit") {
          appendToHistory(
            currentProject.name,
            `- Query: \`${input}\` (${intent.type})`
          );
        }
      } catch (err) {
        console.log(
          formatError(err instanceof Error ? err.message : String(err))
        );
      }

      rl.prompt();
    });

    rl.on("close", () => {
      process.exit(0);
    });
  } catch (err) {
    spinner.fail("Failed to connect");
    console.log(formatError(err instanceof Error ? err.message : String(err)));
    process.exit(1);
  }
}
