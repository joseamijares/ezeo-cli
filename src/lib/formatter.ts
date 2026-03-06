import chalk from "chalk";
import Table from "cli-table3";
import type {
  Project,
  GSCMetrics,
  GA4Metrics,
  GEOMetrics,
  RankingsSummary,
  Insight,
  GSCMetricsWoW,
  GA4MetricsWoW,
  MetricDelta,
  TopKeyword,
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

/**
 * Format a metric delta as a colored arrow + percentage string.
 * invertGood: set true when lower is better (e.g. position, bounceRate)
 */
function fmtDelta(delta: MetricDelta, invertGood: boolean = false): string {
  if (delta.pct === null) return chalk.gray(" —");

  const pct = delta.pct;
  const absStr = Math.abs(pct).toFixed(1) + "%";

  // Positive change
  if (pct > 0.1) {
    const str = ` ▲ +${absStr}`;
    return invertGood ? chalk.hex("#FF3B30")(str) : chalk.hex("#7CE850")(str);
  }
  // Negative change
  if (pct < -0.1) {
    const str = ` ▼ -${absStr}`;
    return invertGood ? chalk.hex("#7CE850")(str) : chalk.hex("#FF3B30")(str);
  }
  // No meaningful change
  return chalk.gray(" — 0%");
}

export function formatStatus(
  project: Project,
  gscWoW: GSCMetricsWoW,
  ga4WoW: GA4MetricsWoW,
  geo: GEOMetrics,
  rankings: RankingsSummary,
  topKeywords: TopKeyword[]
): string {
  const gsc: GSCMetrics = gscWoW.current;
  const ga4: GA4Metrics = ga4WoW.current;

  const lines: string[] = [
    "",
    lemon.bold(`  ${project.name}`) + chalk.gray(` (${project.domain})`),
    "",
  ];

  // GSC
  lines.push(cyan.bold("  Search Console (7d vs prev 7d)"));
  if (!gsc.hasData) {
    lines.push(chalk.gray("    No data yet"));
  } else {
    lines.push(
      `    Clicks: ${chalk.white.bold(fmtNum(gsc.clicks))}${fmtDelta(gscWoW.delta.clicks)}  |  ` +
      `Impressions: ${chalk.white(fmtNum(gsc.impressions))}${fmtDelta(gscWoW.delta.impressions)}  |  ` +
      `CTR: ${chalk.white((gsc.ctr * 100).toFixed(1) + "%")}${fmtDelta(gscWoW.delta.ctr)}  |  ` +
      `Avg Position: ${chalk.white(gsc.position.toFixed(1))}${fmtDelta(gscWoW.delta.position, true)}`
    );
  }
  lines.push("");

  // GA4
  lines.push(cyan.bold("  Analytics (7d vs prev 7d)"));
  if (!ga4.hasData) {
    lines.push(chalk.gray("    No data yet"));
  } else {
    lines.push(
      `    Sessions: ${chalk.white.bold(fmtNum(ga4.sessions))}${fmtDelta(ga4WoW.delta.sessions)}  |  ` +
      `Users: ${chalk.white(fmtNum(ga4.users))}${fmtDelta(ga4WoW.delta.users)}  |  ` +
      `Bounce Rate: ${chalk.white(ga4.bounceRate.toFixed(1) + "%")}${fmtDelta(ga4WoW.delta.bounceRate, true)}`
    );
  }
  lines.push("");

  // GEO
  lines.push(cyan.bold("  AI Visibility (30d)"));
  if (!geo.hasData) {
    lines.push(chalk.gray("    No data yet"));
  } else if (geo.totalCitations > 0) {
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

  // Top Keywords
  if (topKeywords.length > 0) {
    lines.push(cyan.bold("  Top Keywords"));
    const kwTable = new Table({
      head: [
        chalk.gray("Keyword"),
        chalk.gray("Position"),
        chalk.gray("Change"),
      ],
      style: { head: [], border: ["gray"] },
      colWidths: [40, 12, 12],
    });

    for (const kw of topKeywords) {
      let changeStr: string;
      if (kw.change === null) {
        changeStr = chalk.gray("—");
      } else if (kw.change < 0) {
        changeStr = chalk.hex("#7CE850")(`▲ ${Math.abs(kw.change)}`);
      } else if (kw.change > 0) {
        changeStr = chalk.hex("#FF3B30")(`▼ ${kw.change}`);
      } else {
        changeStr = chalk.gray("—");
      }

      kwTable.push([
        chalk.white(kw.keyword),
        chalk.white.bold(String(Math.round(kw.position))),
        changeStr,
      ]);
    }

    lines.push(kwTable.toString());
    lines.push("");
  }

  return lines.join("\n");
}

function truncate(str: string, maxLen: number): string {
  if (!str) return "";
  const singleLine = str.replace(/\n/g, " ").replace(/\s+/g, " ").trim();
  if (singleLine.length <= maxLen) return singleLine;
  return singleLine.slice(0, maxLen - 3) + "...";
}

export function formatInsights(insights: Insight[]): string {
  if (insights.length === 0) return chalk.gray("  No recent insights.");

  const lines: string[] = [cyan.bold("  Recent Insights"), ""];

  for (const insight of insights) {
    const icon = severityIcon(insight.severity);
    const age = timeAgo(new Date(insight.created_at));
    lines.push(`  ${icon} ${chalk.white.bold(truncate(insight.title, 60))} ${chalk.gray(`(${age})`)}`);
    if (insight.summary) {
      lines.push(`    ${chalk.gray(truncate(insight.summary, 100))}`);
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

export function formatWhoami(
  email: string,
  defaultProject: string | undefined,
  tokenExpiry: number
): string {
  const lemon = chalk.hex("#F5E642");
  const cyan = chalk.hex("#00D4FF");

  const now = Math.floor(Date.now() / 1000);
  const expiresIn = tokenExpiry - now;
  let tokenStatus: string;

  if (expiresIn <= 0) {
    tokenStatus = chalk.hex("#FF3B30")("Expired — run `ezeo login`");
  } else if (expiresIn < 3600) {
    const mins = Math.floor(expiresIn / 60);
    tokenStatus = chalk.hex("#FF9500")(`Expires in ${mins}m`);
  } else {
    const hrs = Math.floor(expiresIn / 3600);
    tokenStatus = chalk.hex("#7CE850")(`Valid (expires in ~${hrs}h)`);
  }

  return [
    "",
    lemon.bold("  Session Info"),
    `    Email:   ${cyan(email)}`,
    `    Project: ${defaultProject ? chalk.white(defaultProject) : chalk.gray("(none set — use `ezeo projects use <name>`)")}`,
    `    Token:   ${tokenStatus}`,
    "",
  ].join("\n");
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
