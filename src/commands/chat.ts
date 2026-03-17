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
  type GSCMetricsWoW,
  type GA4MetricsWoW,
  type GEOMetrics,
  type RankingsSummary,
  type TopKeyword,
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
  formatTip,
  formatSuggestions,
  formatCompare,
  formatWelcomeTips,
  logo,
} from "../lib/formatter.js";
import { loadCredentials } from "../lib/config.js";
import { appendToHistory, initProjectMemory } from "../lib/memory.js";

const lemon = chalk.hex("#F5E642");
const cyan = chalk.hex("#00D4FF");
const lime = chalk.hex("#7CE850");

let projects: Project[] = [];
let currentProject: Project | undefined;
let interactionCount = 0;

async function resolveProject(name?: string): Promise<Project | undefined> {
  if (name) {
    // Exact match first
    const exact = projects.find((p) => p.name.toLowerCase() === name.toLowerCase());
    if (exact) return exact;
    // Partial match
    return projects.find(
      (p) =>
        p.name.toLowerCase().includes(name.toLowerCase()) ||
        p.domain?.toLowerCase().includes(name.toLowerCase())
    );
  }
  return currentProject;
}

// Generate smart suggestions based on current data
function generateSuggestions(
  project: Project,
  gscWoW: GSCMetricsWoW,
  ga4WoW: GA4MetricsWoW,
  geo: GEOMetrics,
  rankings: RankingsSummary,
  topKeywords: TopKeyword[],
): string[] {
  const suggestions: string[] = [];

  // Traffic suggestions
  if (gscWoW.current.hasData) {
    const clickDelta = gscWoW.delta.clicks.pct;
    if (clickDelta !== null && clickDelta < -10) {
      suggestions.push(`Traffic dropped ${Math.abs(clickDelta).toFixed(0)}% WoW. Check for ranking losses with \`rankings\`, or run \`insights\` for automated diagnosis.`);
    }
    if (clickDelta !== null && clickDelta > 15) {
      suggestions.push(`Traffic up ${clickDelta.toFixed(0)}% WoW! Check which keywords are driving growth with \`keywords\`.`);
    }
    if (gscWoW.current.ctr < 0.02) {
      suggestions.push(`CTR is ${(gscWoW.current.ctr * 100).toFixed(1)}% (below 2%). Title tags and meta descriptions may need work. Run \`cro\` for specifics.`);
    }
  }

  // Rankings
  if (rankings.total > 0) {
    const nearMiss = rankings.top10 - rankings.top3;
    if (nearMiss > 3) {
      suggestions.push(`${nearMiss} keywords in positions 4-10 could move to top 3 with content optimization. Run \`keywords\` to see them.`);
    }
    if (rankings.top20 < rankings.total * 0.3) {
      suggestions.push(`Only ${Math.round((rankings.top20 / rankings.total) * 100)}% of tracked keywords are in top 20. Focus on your strongest pages and build authority.`);
    }
  }

  // GEO
  if (geo.totalCitations === 0 && geo.hasData) {
    suggestions.push(`No AI citations detected. Check \`geo\` for your citation rate and consider adding structured data, FAQ sections, and authoritative content.`);
  }
  if (geo.citationRate > 0 && geo.citationRate < 20) {
    suggestions.push(`Citation rate is ${geo.citationRate.toFixed(0)}%. YouTube content and brand mentions can boost AI visibility significantly.`);
  }

  // Top keywords
  const positionGainers = topKeywords.filter((kw) => kw.change !== null && kw.change < -3);
  if (positionGainers.length > 0) {
    suggestions.push(`${positionGainers.length} keyword${positionGainers.length > 1 ? "s" : ""} moved up 3+ positions. Great momentum on: "${positionGainers[0].keyword}"`);
  }

  // If no data at all
  if (!gscWoW.current.hasData && !ga4WoW.current.hasData) {
    suggestions.push(`No analytics data yet. Make sure Google Search Console and GA4 are connected in the Ezeo dashboard.`);
  }

  return suggestions;
}

async function handleIntent(intent: Intent): Promise<string | null> {
  interactionCount++;

  switch (intent.type) {
    case "exit":
      return null;

    case "help": {
      const sections = [
        "",
        lemon.bold("  Commands"),
        "",
        `  ${chalk.white("status")}${chalk.gray(" [project]")}      Dashboard overview with trends`,
        `  ${chalk.white("traffic")}${chalk.gray(" [project]")}     Search Console metrics`,
        `  ${chalk.white("rankings")}${chalk.gray(" [project]")}    Keyword positions + changes`,
        `  ${chalk.white("geo")}${chalk.gray(" [project]")}         AI visibility + citations`,
        `  ${chalk.white("keywords")}${chalk.gray(" [project]")}    Top ranking keywords`,
        `  ${chalk.white("insights")}${chalk.gray(" [project]")}    Alerts and recent changes`,
        `  ${chalk.white("suggest")}${chalk.gray(" [project]")}     Smart recommendations`,
        `  ${chalk.white("compare")}${chalk.gray(" [project]")}     Week-over-week comparison`,
        `  ${chalk.white("cro")}${chalk.gray(" [project]")}         Conversion audit status`,
        `  ${chalk.white("projects")}               List all projects`,
        `  ${chalk.white("switch")} ${chalk.gray("<name>")}          Change active project`,
        "",
        chalk.gray("  You can also ask naturally:"),
        chalk.gray(`    "how's aquaprovac doing?"    "any alerts?"     "where do I rank?"`),
        chalk.gray(`    "what should I do?"          "show traffic"    "ai visibility"`),
        "",
      ];
      return sections.join("\n");
    }

    case "projects":
      return "\n" + formatProjectList(projects, config.get("defaultProject")) + "\n";

    case "switch": {
      const project = await resolveProject(intent.project);
      if (!project) return formatError(`Project "${intent.project}" not found. Type 'projects' to see all.`);
      currentProject = project;
      config.set("defaultProject", project.id);
      config.set("defaultProjectName", project.name);
      return formatChatResponse(`Switched to ${chalk.white.bold(project.name)} (${chalk.gray(project.domain ?? "")})`);
    }

    case "status": {
      const project = await resolveProject(intent.project);
      if (!project) return formatError(`Project not found. Try 'projects' to see all.`);
      const spinner = ora({ text: "Loading dashboard...", stream: process.stderr }).start();
      const [gscWoW, ga4WoW, geo, rankings, insights, topKeywords] = await Promise.all([
        fetchGSCMetricsWoW(project.id).catch(() => nullGSCWoW()),
        fetchGA4MetricsWoW(project.id).catch(() => nullGA4WoW()),
        fetchGEOMetrics(project.id).catch(() => ({ totalCitations: 0, platforms: {}, citationRate: 0, hasData: false })),
        fetchRankingsSummary(project.id).catch(() => ({ top3: 0, top10: 0, top20: 0, total: 0 })),
        fetchInsights(project.id, 3).catch(() => []),
        fetchTopKeywords(project.id, 5).catch(() => []),
      ]);
      spinner.stop();
      let result = formatStatus(project, gscWoW, ga4WoW, geo, rankings, topKeywords);
      if (insights.length > 0) result += "\n" + formatInsights(insights);

      // Show contextual tip on first few interactions
      if (interactionCount <= 3) {
        result += formatTip("Try 'suggest' for personalized recommendations based on your data.");
      }

      return result;
    }

    case "traffic": {
      const project = await resolveProject(intent.project);
      if (!project) return formatError("Project not found.");
      const spinner = ora({ text: "Loading traffic...", stream: process.stderr }).start();
      const [gsc, ga4] = await Promise.all([
        fetchGSCMetrics(project.id),
        fetchGA4Metrics(project.id).catch(() => null),
      ]);
      spinner.stop();

      const lines: string[] = [
        "",
        lemon.bold(`  ${project.name} — Traffic (7d)`),
        "",
        cyan.bold("  Search Console"),
        `    Clicks: ${chalk.white.bold(fmtNum(gsc.clicks))}  |  Impressions: ${chalk.white(fmtNum(gsc.impressions))}`,
        `    CTR: ${chalk.white((gsc.ctr * 100).toFixed(1) + "%")}  |  Avg Position: ${chalk.white(gsc.position.toFixed(1))}`,
      ];

      if (ga4) {
        lines.push(
          "",
          cyan.bold("  Google Analytics"),
          `    Sessions: ${chalk.white.bold(fmtNum(ga4.sessions))}  |  Pageviews: ${chalk.white(fmtNum(ga4.pageviews))}`,
          `    Bounce Rate: ${chalk.white(ga4.bounceRate.toFixed(1) + "%")}  |  Avg Duration: ${chalk.white(fmtDuration(ga4.avgDuration))}`,
        );
      }

      lines.push("");

      // Contextual tip
      if (gsc.ctr < 0.02) {
        lines.push(formatTip(`CTR is below 2%. Consider improving title tags and meta descriptions for top pages.`));
      } else if (gsc.clicks > 0 && gsc.position > 15) {
        lines.push(formatTip(`Avg position is ${gsc.position.toFixed(0)}. Focus on content that's already ranking 5-15 for quick wins.`));
      }

      return lines.join("\n");
    }

    case "rankings": {
      const project = await resolveProject(intent.project);
      if (!project) return formatError("Project not found.");
      const spinner = ora({ text: "Loading rankings...", stream: process.stderr }).start();
      const [r, topKw] = await Promise.all([
        fetchRankingsSummary(project.id),
        fetchTopKeywords(project.id, 10),
      ]);
      spinner.stop();

      const lines: string[] = [
        "",
        lemon.bold(`  ${project.name} — Rankings`),
        "",
        `    ${lime.bold(String(r.top3))} in top 3  |  ${chalk.white(String(r.top10))} in top 10  |  ${chalk.white(String(r.top20))} in top 20  |  ${chalk.gray(String(r.total) + " tracked")}`,
        "",
      ];

      // Show rank distribution bar
      if (r.total > 0) {
        const bar = rankDistributionBar(r);
        lines.push(`    ${bar}`);
        lines.push("");
      }

      // Top keywords
      if (topKw.length > 0) {
        const ranked = topKw.filter((kw) => kw.position < 100);
        if (ranked.length > 0) {
          lines.push(cyan.bold("  Top Keywords"));
          for (const kw of ranked) {
            const changeStr = formatChange(kw.change);
            const posColor = kw.position <= 3 ? lime : kw.position <= 10 ? chalk.white : chalk.hex("#FF9500");
            lines.push(
              `    ${chalk.white(kw.keyword.padEnd(40))} ${posColor.bold("#" + String(Math.round(kw.position)))}${changeStr}`
            );
          }
          lines.push("");
        }
      }

      // Near-miss tip
      const nearMiss = r.top10 - r.top3;
      if (nearMiss > 2) {
        lines.push(formatTip(`${nearMiss} keywords at positions 4-10 are close to top 3. Internal linking and content refresh could push them up.`));
      }

      return lines.join("\n");
    }

    case "geo": {
      const project = await resolveProject(intent.project);
      if (!project) return formatError("Project not found.");
      const spinner = ora({ text: "Loading AI visibility...", stream: process.stderr }).start();
      const geo = await fetchGEOMetrics(project.id);
      spinner.stop();

      const lines: string[] = [
        "",
        lemon.bold(`  ${project.name} — AI Visibility (30d)`),
        "",
      ];

      if (geo.totalCitations === 0) {
        lines.push(chalk.gray("    No AI citations detected in the last 30 days."));
        lines.push("");
        lines.push(formatTip("To improve AI visibility: add FAQ schema, create YouTube content, build brand authority with PR mentions."));
      } else {
        lines.push(`    Citations: ${lime.bold(String(geo.totalCitations))}  |  Citation Rate: ${chalk.white(geo.citationRate.toFixed(1) + "%")}`);
        lines.push("");

        // Platform breakdown with visual bars
        const platforms = Object.entries(geo.platforms).sort(([, a], [, b]) => b - a);
        const maxCount = Math.max(...platforms.map(([, c]) => c));
        lines.push(cyan.bold("  By Platform"));
        for (const [name, count] of platforms) {
          const barLen = Math.max(1, Math.round((count / maxCount) * 20));
          const bar = lime("█".repeat(barLen)) + chalk.gray("░".repeat(20 - barLen));
          lines.push(`    ${chalk.white(name.padEnd(16))} ${bar} ${chalk.white(String(count))}`);
        }
        lines.push("");

        if (geo.citationRate < 30) {
          lines.push(formatTip(`Citation rate is ${geo.citationRate.toFixed(0)}%. YouTube content and structured FAQ pages are the strongest signals for AI citation.`));
        }
      }

      return lines.join("\n");
    }

    case "insights": {
      const project = await resolveProject(intent.project);
      if (!project) return formatError("Project not found.");
      const spinner = ora({ text: "Loading insights...", stream: process.stderr }).start();
      const insights = await fetchInsights(project.id, 10);
      spinner.stop();
      let result = "\n" + formatInsights(insights);
      if (insights.length === 0) {
        result += formatTip("No recent insights. This usually means things are stable. Run 'status' for a full overview.");
      }
      return result;
    }

    case "keywords": {
      return formatChatResponse("Use `ezeo keywords` for full keyword list with positions and changes.");
    }

    case "compare": {
      const project = await resolveProject(intent.project);
      if (!project) return formatError("Project not found.");
      const spinner = ora({ text: "Loading comparison...", stream: process.stderr }).start();
      const [gscWoW, ga4WoW] = await Promise.all([
        fetchGSCMetricsWoW(project.id).catch(() => nullGSCWoW()),
        fetchGA4MetricsWoW(project.id).catch(() => nullGA4WoW()),
      ]);
      spinner.stop();
      return formatCompare(project, gscWoW, ga4WoW);
    }

    case "suggest": {
      const project = await resolveProject(intent.project);
      if (!project) return formatError("Project not found.");
      const spinner = ora({ text: "Analyzing your data...", stream: process.stderr }).start();
      const [gscWoW, ga4WoW, geo, rankings, topKeywords] = await Promise.all([
        fetchGSCMetricsWoW(project.id).catch(() => nullGSCWoW()),
        fetchGA4MetricsWoW(project.id).catch(() => nullGA4WoW()),
        fetchGEOMetrics(project.id).catch(() => ({ totalCitations: 0, platforms: {}, citationRate: 0, hasData: false })),
        fetchRankingsSummary(project.id).catch(() => ({ top3: 0, top10: 0, top20: 0, total: 0 })),
        fetchTopKeywords(project.id, 10).catch(() => []),
      ]);
      spinner.stop();

      const suggestions = generateSuggestions(project, gscWoW, ga4WoW, geo, rankings, topKeywords);
      return formatSuggestions(project, suggestions);
    }

    case "competitors": {
      return formatChatResponse("Competitive analysis coming in Phase 2. Use the Ezeo dashboard for now.");
    }

    case "audit": {
      return formatChatResponse(
        `Audit for ${intent.url ?? "your site"} coming in Phase 2. Run audits from the Ezeo dashboard for now.`
      );
    }

    case "cro": {
      return formatChatResponse(
        `Run 'ezeo cro${intent.project ? " " + intent.project : ""}' for CRO audit details and pending deliverables.`
      );
    }

    case "image": {
      return formatChatResponse("Image generation coming soon. Will support: product photos, blog images, social media graphics.");
    }

    case "unknown": {
      let response = formatError(`I don't understand "${intent.raw}" yet.`);
      if (intent.suggestion) {
        response += `\n  ${chalk.gray("Did you mean:")} ${cyan(intent.suggestion)}${chalk.gray("?")}`;
      }
      response += `\n  ${chalk.gray("Type 'help' to see available commands.")}`;
      return response;
    }
  }
}

export async function chatCommand(): Promise<void> {
  const creds = loadCredentials();
  if (!creds?.access_token) {
    console.log(formatError("Not logged in. Run `ezeo login` or `ezeo setup` first."));
    process.exit(1);
  }

  const spinner = ora({ text: "Connecting...", stream: process.stderr }).start();

  try {
    projects = await fetchProjects();
    const defaultId = config.get("defaultProject");
    currentProject = projects.find((p) => p.id === defaultId) ?? projects[0];

    if (currentProject) {
      initProjectMemory(currentProject.name, currentProject.domain ?? "");
    }

    spinner.stop();

    console.log();
    console.log(greeting(creds.user_email, projects.length));

    if (currentProject) {
      console.log(chalk.gray(`   Active project: ${chalk.white(currentProject.name)} ${chalk.gray(`(${currentProject.domain})`)}`));
    }
    console.log();

    // Welcome tips for new users (only show first time)
    const hasUsedChat = config.get("hasUsedChat");
    if (!hasUsedChat) {
      console.log(formatWelcomeTips());
      config.set("hasUsedChat", true);
    } else {
      console.log(chalk.gray("   Type 'help' for commands, or just ask a question."));
    }
    console.log();

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: lemon("ezeo > "),
      completer: completer,
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
          console.log(chalk.gray("\n  See you! Run `ezeo chat` to pick up where you left off.\n"));
          rl.close();
          return;
        }

        console.log(result);

        // Log to project history
        if (currentProject && intent.type !== "help" && intent.type !== "exit") {
          appendToHistory(currentProject.name, `- Query: \`${input}\` (${intent.type})`);
        }
      } catch (err) {
        console.log(formatError(err instanceof Error ? err.message : String(err)));
        console.log(chalk.gray("  Run 'ezeo doctor' to check connectivity.\n"));
      }

      rl.prompt();
    });

    rl.on("close", () => {
      process.exit(0);
    });
  } catch (err) {
    spinner.fail("Failed to connect");
    console.log(formatError(err instanceof Error ? err.message : String(err)));
    console.log();
    console.log(chalk.gray("  Troubleshooting:"));
    console.log(chalk.gray("    1. Check internet connection"));
    console.log(chalk.gray("    2. Run `ezeo doctor` to verify API access"));
    console.log(chalk.gray("    3. Run `ezeo login` to refresh credentials"));
    console.log();
    process.exit(1);
  }
}

// Tab completion
function completer(line: string): [string[], string] {
  const commands = [
    "status", "traffic", "rankings", "geo", "keywords", "insights",
    "suggest", "compare", "cro", "projects", "switch", "help", "exit",
  ];
  const hits = commands.filter((c) => c.startsWith(line.toLowerCase()));
  return [hits.length ? hits : commands, line];
}

// Helpers

function nullGSCWoW(): GSCMetricsWoW {
  return {
    current: { clicks: 0, impressions: 0, ctr: 0, position: 0, hasData: false },
    previous: { clicks: 0, impressions: 0, ctr: 0, position: 0, hasData: false },
    delta: { clicks: { value: 0, pct: null }, impressions: { value: 0, pct: null }, ctr: { value: 0, pct: null }, position: { value: 0, pct: null } },
  };
}

function nullGA4WoW(): GA4MetricsWoW {
  return {
    current: { sessions: 0, pageviews: 0, pagesPerSession: 0, bounceRate: 0, avgDuration: 0, hasData: false },
    previous: { sessions: 0, pageviews: 0, pagesPerSession: 0, bounceRate: 0, avgDuration: 0, hasData: false },
    delta: { sessions: { value: 0, pct: null }, pageviews: { value: 0, pct: null }, bounceRate: { value: 0, pct: null } },
  };
}

function fmtNum(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return String(Math.round(n));
}

function fmtDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

function formatChange(change: number | null): string {
  if (change === null) return "";
  if (change < 0) return chalk.hex("#7CE850")(` ▲ ${Math.abs(change)}`);
  if (change > 0) return chalk.hex("#FF3B30")(` ▼ ${change}`);
  return "";
}

function rankDistributionBar(r: { top3: number; top10: number; top20: number; total: number }): string {
  const total = r.total || 1;
  const top3Pct = Math.round((r.top3 / total) * 30);
  const top10Pct = Math.round(((r.top10 - r.top3) / total) * 30);
  const top20Pct = Math.round(((r.top20 - r.top10) / total) * 30);
  const restPct = 30 - top3Pct - top10Pct - top20Pct;

  return (
    lime("█".repeat(top3Pct)) +
    chalk.hex("#00D4FF")("█".repeat(top10Pct)) +
    chalk.hex("#FF9500")("█".repeat(top20Pct)) +
    chalk.gray("░".repeat(Math.max(0, restPct))) +
    "  " +
    lime("█") + chalk.gray(" 1-3  ") +
    chalk.hex("#00D4FF")("█") + chalk.gray(" 4-10  ") +
    chalk.hex("#FF9500")("█") + chalk.gray(" 11-20")
  );
}
