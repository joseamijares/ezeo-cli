import chalk from "chalk";
import Table from "cli-table3";
import type {
  Project,
  GSCMetrics,
  GSCMetricsWoW,
  GA4MetricsWoW,
  GA4Metrics,
  GEOMetrics,
  RankingsSummary,
  Insight,
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
      `Pageviews: ${chalk.white(fmtNum(ga4.pageviews))}${fmtDelta(ga4WoW.delta.pageviews)}  |  ` +
      `Bounce: ${chalk.white(ga4.bounceRate.toFixed(1) + "%")}${fmtDelta(ga4WoW.delta.bounceRate, true)}`
    );
    if (ga4.pagesPerSession > 0) {
      lines.push(
        chalk.gray(`    ${ga4.pagesPerSession.toFixed(1)} pages/session  |  Avg ${fmtDuration(ga4.avgDuration)}`)
      );
    }
  }
  lines.push("");

  // GEO — only show if there's actual data worth showing
  if (geo.hasData && geo.totalCitations > 0) {
    lines.push(cyan.bold("  AI Visibility (30d)"));
    const platformStr = Object.entries(geo.platforms)
      .sort(([, a], [, b]) => b - a)
      .map(([name, count]) => `${name}: ${count}`)
      .join(", ");
    lines.push(
      `    Citations: ${lime.bold(String(geo.totalCitations))}  |  ` +
      `Citation Rate: ${chalk.white(geo.citationRate.toFixed(1) + "%")}`
    );
    lines.push(`    Platforms: ${chalk.gray(platformStr)}`);
    lines.push("");
  }

  // Rankings — only show if there are ranked keywords
  if (rankings.total > 0) {
    const ranked = rankings.top3 + (rankings.top10 - rankings.top3) + (rankings.top20 - rankings.top10);
    const unranked = rankings.total - rankings.top20;
    lines.push(cyan.bold("  Rankings"));
    lines.push(
      `    Top 3: ${lime.bold(String(rankings.top3))}  |  ` +
      `Top 10: ${chalk.white(String(rankings.top10))}  |  ` +
      `Top 20: ${chalk.white(String(rankings.top20))}  |  ` +
      `Tracked: ${chalk.gray(String(rankings.total))}`
    );
    if (unranked > 0 && rankings.top20 < rankings.total) {
      lines.push(chalk.gray(`    ${unranked} keyword${unranked !== 1 ? "s" : ""} outside top 100`));
    }
    lines.push("");
  }

  // Top Keywords — filter out position >= 100 (not ranking), only show if meaningful
  if (topKeywords.length > 0) {
    const rankedKws = topKeywords.filter((kw) => kw.position < 100);
    if (rankedKws.length > 0) {
      lines.push(cyan.bold("  Top Keywords"));
      for (const kw of rankedKws) {
        let changeStr: string;
        if (kw.change === null) {
          changeStr = "";
        } else if (kw.change < 0) {
          changeStr = chalk.hex("#7CE850")(` ▲ ${Math.abs(kw.change)}`);
        } else if (kw.change > 0) {
          changeStr = chalk.hex("#FF3B30")(` ▼ ${kw.change}`);
        } else {
          changeStr = "";
        }

        const posColor = kw.position <= 3 ? lime : kw.position <= 10 ? chalk.white : warn;
        lines.push(
          `    ${chalk.white(kw.keyword.padEnd(40))} ${posColor.bold("#" + String(Math.round(kw.position)))}${changeStr}`
        );
      }
      lines.push("");
    } else {
      lines.push(chalk.gray("  No keywords ranking in top 100 yet"));
      lines.push("");
    }
  }

  return lines.join("\n");
}

function cleanText(str: string): string {
  if (!str) return "";
  return str
    .replace(/[\u{1F600}-\u{1F9FF}\u{2600}-\u{2B55}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}]/gu, "")
    .replace(/#null/g, "unranked")
    .replace(/\(#null → /g, "(unranked → ")
    .replace(/\n/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function truncate(str: string, maxLen: number): string {
  if (!str) return "";
  const clean = cleanText(str);
  if (clean.length <= maxLen) return clean;
  return clean.slice(0, maxLen - 3) + "...";
}

export function formatInsights(insights: Insight[]): string {
  if (insights.length === 0) return chalk.gray("  No recent insights.");

  const lines: string[] = [cyan.bold("  Recent Insights"), ""];

  for (const insight of insights) {
    const icon = severityIcon(insight.severity);
    const age = timeAgo(new Date(insight.created_at));
    lines.push(`  ${icon} ${chalk.white.bold(truncate(insight.title, 70))} ${chalk.gray(`(${age})`)}`);
    if (insight.summary) {
      lines.push(`    ${chalk.gray(truncate(insight.summary, 110))}`);
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

function fmtDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
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

// ---- New formatters for smart chat ----

export function formatTip(text: string): string {
  return `\n  ${chalk.hex("#F5E642")("💡")} ${chalk.gray(text)}\n`;
}

export function formatSuggestions(project: Project, suggestions: string[]): string {
  if (suggestions.length === 0) {
    return [
      "",
      lemon.bold(`  ${project.name} — Recommendations`),
      "",
      chalk.gray("    Everything looks healthy! No urgent actions detected."),
      chalk.gray("    Run 'status' for a full overview or 'compare' for trends."),
      "",
    ].join("\n");
  }

  const lines: string[] = [
    "",
    lemon.bold(`  ${project.name} — Recommendations`),
    "",
  ];

  suggestions.forEach((s, i) => {
    const icon = i === 0 ? chalk.hex("#FF3B30")("→") : i < 3 ? warn("→") : chalk.gray("→");
    lines.push(`  ${icon} ${chalk.white(s)}`);
    lines.push("");
  });

  return lines.join("\n");
}

export function formatCompare(
  project: Project,
  gscWoW: GSCMetricsWoW,
  ga4WoW: GA4MetricsWoW,
): string {
  const lines: string[] = [
    "",
    lemon.bold(`  ${project.name} — Week-over-Week`),
    "",
  ];

  if (gscWoW.current.hasData) {
    lines.push(cyan.bold("  Search Console"));
    lines.push(formatMetricRow("Clicks", gscWoW.previous.clicks, gscWoW.current.clicks, gscWoW.delta.clicks.pct));
    lines.push(formatMetricRow("Impressions", gscWoW.previous.impressions, gscWoW.current.impressions, gscWoW.delta.impressions.pct));
    lines.push(formatMetricRow("CTR", gscWoW.previous.ctr * 100, gscWoW.current.ctr * 100, gscWoW.delta.ctr.pct, true));
    lines.push(formatMetricRow("Avg Position", gscWoW.previous.position, gscWoW.current.position, gscWoW.delta.position.pct, true, true));
    lines.push("");
  }

  if (ga4WoW.current.hasData) {
    lines.push(cyan.bold("  Analytics"));
    lines.push(formatMetricRow("Sessions", ga4WoW.previous.sessions, ga4WoW.current.sessions, ga4WoW.delta.sessions.pct));
    lines.push(formatMetricRow("Pageviews", ga4WoW.previous.pageviews, ga4WoW.current.pageviews, ga4WoW.delta.pageviews.pct));
    lines.push(formatMetricRow("Bounce Rate", ga4WoW.previous.bounceRate, ga4WoW.current.bounceRate, ga4WoW.delta.bounceRate.pct, true, true));
    lines.push("");
  }

  if (!gscWoW.current.hasData && !ga4WoW.current.hasData) {
    lines.push(chalk.gray("    No data available for comparison."));
    lines.push("");
  }

  return lines.join("\n");
}

function formatMetricRow(
  label: string,
  previous: number,
  current: number,
  pctChange: number | null,
  isPercent: boolean = false,
  invertGood: boolean = false,
): string {
  const prevStr = isPercent ? previous.toFixed(1) + "%" : fmtNum(previous);
  const currStr = isPercent ? current.toFixed(1) + "%" : fmtNum(current);

  let changeStr: string;
  if (pctChange === null) {
    changeStr = chalk.gray("  --");
  } else if (Math.abs(pctChange) < 0.1) {
    changeStr = chalk.gray("  0%");
  } else {
    const positive = pctChange > 0;
    const arrow = positive ? "▲" : "▼";
    const absStr = Math.abs(pctChange).toFixed(1) + "%";
    const isGood = invertGood ? !positive : positive;
    const color = isGood ? chalk.hex("#7CE850") : chalk.hex("#FF3B30");
    changeStr = color(` ${arrow} ${positive ? "+" : "-"}${absStr}`);
  }

  return `    ${chalk.white(label.padEnd(16))} ${chalk.gray(prevStr.padStart(8))} → ${chalk.white.bold(currStr.padStart(8))}${changeStr}`;
}

export function formatWelcomeTips(): string {
  return [
    chalk.gray("   ┌─────────────────────────────────────────────┐"),
    chalk.gray("   │") + lemon("  Quick start:                               ") + chalk.gray("│"),
    chalk.gray("   │") + chalk.white("  status     ") + chalk.gray("Full project dashboard         │"),
    chalk.gray("   │") + chalk.white("  traffic    ") + chalk.gray("Search Console + Analytics      │"),
    chalk.gray("   │") + chalk.white("  suggest    ") + chalk.gray("Smart recommendations          │"),
    chalk.gray("   │") + chalk.white("  geo        ") + chalk.gray("AI visibility & citations      │"),
    chalk.gray("   │") + chalk.gray("                                             │"),
    chalk.gray("   │") + chalk.gray("  Or ask naturally: \"how's aquaprovac?\"       │"),
    chalk.gray("   └─────────────────────────────────────────────┘"),
  ].join("\n");
}
