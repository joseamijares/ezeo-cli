import chalk from "chalk";
import Table from "cli-table3";
import type {
  Project,
  GSCMetrics,
  GA4Metrics,
  GEOMetrics,
  RankingsSummary,
  Insight,
} from "./api.js";

// Brand colors
const lemon = chalk.hex("#F5E642");
const cyan = chalk.hex("#00D4FF");
const lime = chalk.hex("#7CE850");
const warn = chalk.hex("#FF9500");
const danger = chalk.hex("#FF3B30");

export function logo(): string {
  return lemon.bold("🍋 Ezeo AI") + chalk.gray(" — Talk to your SEO data");
}

export function greeting(email: string, projectCount: number): string {
  return [
    logo(),
    chalk.gray(`   Connected as ${cyan(email)}`),
    chalk.gray(`   ${projectCount} project${projectCount !== 1 ? "s" : ""} loaded`),
    "",
  ].join("\n");
}

export function formatProjectList(
  projects: Project[],
  defaultId?: string
): string {
  if (projects.length === 0) return chalk.gray("No projects found.");

  const table = new Table({
    head: [
      chalk.gray("#"),
      chalk.gray("Name"),
      chalk.gray("Domain"),
      chalk.gray("GSC"),
      chalk.gray("GA4"),
      chalk.gray("Shopify"),
    ],
    style: { head: [], border: ["gray"] },
  });

  projects.forEach((p, i) => {
    const isDefault = p.id === defaultId;
    const marker = isDefault ? lime(" *") : "  ";
    table.push([
      chalk.gray(`${i + 1}`),
      (isDefault ? lime.bold : chalk.white)(p.name) + marker,
      chalk.gray(p.domain ?? "---"),
      p.search_console_connected ? lime("ON") : chalk.gray("---"),
      p.google_analytics_connected ? lime("ON") : chalk.gray("---"),
      p.shopify_connected ? lime("ON") : chalk.gray("---"),
    ]);
  });

  return table.toString();
}

export function formatStatus(
  project: Project,
  gsc: GSCMetrics,
  ga4: GA4Metrics,
  geo: GEOMetrics,
  rankings: RankingsSummary
): string {
  const lines: string[] = [
    "",
    lemon.bold(`  ${project.name}`) + chalk.gray(` (${project.domain})`),
    "",
  ];

  // GSC
  lines.push(cyan.bold("  Search Console (7d)"));
  lines.push(
    `    Clicks: ${chalk.white.bold(fmtNum(gsc.clicks))}  |  ` +
    `Impressions: ${chalk.white(fmtNum(gsc.impressions))}  |  ` +
    `CTR: ${chalk.white((gsc.ctr * 100).toFixed(1) + "%")}  |  ` +
    `Avg Position: ${chalk.white(gsc.position.toFixed(1))}`
  );
  lines.push("");

  // GA4
  lines.push(cyan.bold("  Analytics (7d)"));
  lines.push(
    `    Sessions: ${chalk.white.bold(fmtNum(ga4.sessions))}  |  ` +
    `Users: ${chalk.white(fmtNum(ga4.users))}  |  ` +
    `Bounce Rate: ${chalk.white(ga4.bounceRate.toFixed(1) + "%")}`
  );
  lines.push("");

  // GEO
  lines.push(cyan.bold("  AI Visibility (30d)"));
  if (geo.totalCitations > 0) {
    const platformStr = Object.entries(geo.platforms)
      .sort(([, a], [, b]) => b - a)
      .map(([name, count]) => `${name}: ${count}`)
      .join(", ");
    lines.push(
      `    Citations: ${lime.bold(String(geo.totalCitations))}  |  ` +
      `Citation Rate: ${chalk.white(geo.citationRate.toFixed(1) + "%")}`
    );
    lines.push(`    Platforms: ${chalk.gray(platformStr)}`);
  } else {
    lines.push(chalk.gray("    No AI citations detected yet"));
  }
  lines.push("");

  // Rankings
  lines.push(cyan.bold("  Rankings"));
  lines.push(
    `    Top 3: ${lime.bold(String(rankings.top3))}  |  ` +
    `Top 10: ${chalk.white(String(rankings.top10))}  |  ` +
    `Top 20: ${chalk.white(String(rankings.top20))}  |  ` +
    `Total tracked: ${chalk.gray(String(rankings.total))}`
  );
  lines.push("");

  return lines.join("\n");
}

export function formatInsights(insights: Insight[]): string {
  if (insights.length === 0) return chalk.gray("  No recent insights.");

  const lines: string[] = [cyan.bold("  Recent Insights"), ""];

  for (const insight of insights) {
    const icon = severityIcon(insight.severity);
    const age = timeAgo(new Date(insight.created_at));
    lines.push(`  ${icon} ${chalk.white.bold(insight.title)} ${chalk.gray(`(${age})`)}`);
    if (insight.summary) {
      lines.push(`    ${chalk.gray(insight.summary)}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

export function formatChatResponse(text: string): string {
  return `\n${lemon("  >")} ${chalk.white(text)}\n`;
}

export function formatError(msg: string): string {
  return `${danger.bold("  Error:")} ${chalk.white(msg)}`;
}

// -- Helpers --

function fmtNum(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return String(Math.round(n));
}

function severityIcon(severity: string): string {
  switch (severity) {
    case "critical":
      return danger("!!!");
    case "high":
      return warn("!!");
    case "medium":
      return chalk.yellow("!");
    default:
      return chalk.gray("i");
  }
}

function timeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}
