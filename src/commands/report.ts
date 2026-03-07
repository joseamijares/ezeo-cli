import chalk from "chalk";
import ora from "ora";
import {
  fetchProjects,
  fetchGSCMetricsWoW,
  fetchGA4MetricsWoW,
  fetchGEOMetrics,
  fetchRankingsSummary,
  fetchInsights,
  fetchTopKeywords,
  type GSCMetricsWoW,
  type GA4MetricsWoW,
  type GEOMetrics,
  type RankingsSummary,
  type TopKeyword,
  type Insight,
  type Project,
} from "../lib/api.js";
import { config } from "../lib/config.js";
import { formatError } from "../lib/formatter.js";
import { getGlobalOpts } from "../lib/globals.js";

const lemon = chalk.hex("#F5E642");
const cyan = chalk.hex("#00D4FF");
const lime = chalk.hex("#7CE850");
const warn = chalk.hex("#FF9500");
const danger = chalk.hex("#FF3B30");

function fmtNum(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return String(Math.round(n));
}

function fmtDelta(value: number, pct: number | null, invertGood = false): string {
  if (pct === null) return chalk.gray("—");
  const abs = Math.abs(pct).toFixed(1) + "%";
  const isPositive = pct > 0.1;
  const isNegative = pct < -0.1;
  if (!isPositive && !isNegative) return chalk.gray("±0%");
  if (isPositive) return (invertGood ? danger : lime)(`+${abs}`);
  return (invertGood ? lime : danger)(`-${abs}`);
}

function severityColor(severity: string): chalk.Chalk {
  switch (severity) {
    case "critical": return danger;
    case "high": return warn;
    case "medium": return chalk.yellow;
    default: return chalk.gray;
  }
}

function buildMarkdown(
  project: Project,
  gscWoW: GSCMetricsWoW,
  ga4WoW: GA4MetricsWoW,
  geo: GEOMetrics,
  rankings: RankingsSummary,
  topKeywords: TopKeyword[],
  insights: Insight[]
): string {
  const lines: string[] = [];
  const now = new Date().toLocaleDateString("en-US", { dateStyle: "full" });

  lines.push(`# Ezeo Report: ${project.name}`);
  lines.push(`**Domain:** ${project.domain}  |  **Generated:** ${now}`);
  lines.push("");

  lines.push("## Search Console (7d vs prev 7d)");
  const g = gscWoW.current;
  lines.push(`| Metric | Current | Change |`);
  lines.push(`|--------|---------|--------|`);
  lines.push(`| Clicks | ${fmtNum(g.clicks)} | ${gscWoW.delta.clicks.pct !== null ? (gscWoW.delta.clicks.pct > 0 ? "+" : "") + gscWoW.delta.clicks.pct.toFixed(1) + "%" : "—"} |`);
  lines.push(`| Impressions | ${fmtNum(g.impressions)} | ${gscWoW.delta.impressions.pct !== null ? (gscWoW.delta.impressions.pct > 0 ? "+" : "") + gscWoW.delta.impressions.pct.toFixed(1) + "%" : "—"} |`);
  lines.push(`| CTR | ${(g.ctr * 100).toFixed(1)}% | ${gscWoW.delta.ctr.pct !== null ? (gscWoW.delta.ctr.pct > 0 ? "+" : "") + gscWoW.delta.ctr.pct.toFixed(1) + "%" : "—"} |`);
  lines.push(`| Avg Position | ${g.position.toFixed(1)} | ${gscWoW.delta.position.pct !== null ? (gscWoW.delta.position.pct > 0 ? "+" : "") + gscWoW.delta.position.pct.toFixed(1) + "%" : "—"} |`);
  lines.push("");

  lines.push("## Analytics (7d vs prev 7d)");
  const a = ga4WoW.current;
  lines.push(`| Metric | Current | Change |`);
  lines.push(`|--------|---------|--------|`);
  lines.push(`| Sessions | ${fmtNum(a.sessions)} | ${ga4WoW.delta.sessions.pct !== null ? (ga4WoW.delta.sessions.pct > 0 ? "+" : "") + ga4WoW.delta.sessions.pct.toFixed(1) + "%" : "—"} |`);
  lines.push(`| Pageviews | ${fmtNum(a.pageviews)} | ${ga4WoW.delta.pageviews.pct !== null ? (ga4WoW.delta.pageviews.pct > 0 ? "+" : "") + ga4WoW.delta.pageviews.pct.toFixed(1) + "%" : "—"} |`);
  lines.push(`| Bounce Rate | ${a.bounceRate.toFixed(1)}% | ${ga4WoW.delta.bounceRate.pct !== null ? (ga4WoW.delta.bounceRate.pct > 0 ? "+" : "") + ga4WoW.delta.bounceRate.pct.toFixed(1) + "%" : "—"} |`);
  lines.push("");

  lines.push("## Rankings");
  lines.push(`Top 3: **${rankings.top3}** | Top 10: **${rankings.top10}** | Top 20: **${rankings.top20}** | Total: ${rankings.total}`);
  lines.push("");

  const rankedKws = topKeywords.filter((kw) => kw.position < 100);
  if (rankedKws.length > 0) {
    lines.push("## Top Keywords");
    lines.push(`| Keyword | Position | Change |`);
    lines.push(`|---------|----------|--------|`);
    for (const kw of rankedKws) {
      const change = kw.change !== null ? (kw.change < 0 ? `▲ ${Math.abs(kw.change)}` : kw.change > 0 ? `▼ ${kw.change}` : "—") : "—";
      lines.push(`| ${kw.keyword} | #${Math.round(kw.position)} | ${change} |`);
    }
    lines.push("");
  }

  if (geo.hasData && geo.totalCitations > 0) {
    lines.push("## GEO / AI Visibility (30d)");
    lines.push(`Citation Rate: **${geo.citationRate.toFixed(1)}%** (${geo.totalCitations} citations)`);
    const platforms = Object.entries(geo.platforms).sort(([, a], [, b]) => b - a);
    if (platforms.length > 0) {
      lines.push("");
      lines.push("| Platform | Citations |");
      lines.push("|----------|-----------|");
      for (const [p, c] of platforms) {
        lines.push(`| ${p} | ${c} |`);
      }
    }
    lines.push("");
  }

  if (insights.length > 0) {
    lines.push("## Recent Insights");
    for (const ins of insights) {
      const title = ins.title?.replace(/#null/g, "unranked").replace(/\(#null → /g, "(unranked → ");
      const summary = ins.summary
        ?.replace(/[\u{1F600}-\u{1F9FF}\u{2600}-\u{2B55}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}]/gu, "")
        ?.replace(/#null/g, "unranked")
        ?.replace(/\n/g, " ")
        ?.replace(/\s+/g, " ")
        ?.trim()
        ?.slice(0, 150);
      lines.push(`- **[${ins.severity.toUpperCase()}]** ${title}`);
      if (summary) lines.push(`  ${summary}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

function buildText(
  project: Project,
  gscWoW: GSCMetricsWoW,
  ga4WoW: GA4MetricsWoW,
  geo: GEOMetrics,
  rankings: RankingsSummary,
  topKeywords: TopKeyword[],
  insights: Insight[]
): string {
  const lines: string[] = [];
  const now = new Date().toLocaleDateString("en-US", { dateStyle: "full" });

  lines.push("");
  lines.push(lemon.bold(`  Ezeo Report — ${project.name}`) + chalk.gray(` (${project.domain})`));
  lines.push(chalk.gray(`  Generated: ${now}`));
  lines.push("");

  // GSC
  lines.push(cyan.bold("  Search Console (7d vs prev 7d)"));
  const g = gscWoW.current;
  if (!g.hasData) {
    lines.push(chalk.gray("    No data yet"));
  } else {
    lines.push(
      `    Clicks:      ${chalk.white.bold(fmtNum(g.clicks))}  ${fmtDelta(gscWoW.delta.clicks.value, gscWoW.delta.clicks.pct)}`
    );
    lines.push(
      `    Impressions: ${chalk.white(fmtNum(g.impressions))}  ${fmtDelta(gscWoW.delta.impressions.value, gscWoW.delta.impressions.pct)}`
    );
    lines.push(
      `    CTR:         ${chalk.white((g.ctr * 100).toFixed(1) + "%")}  ${fmtDelta(gscWoW.delta.ctr.value, gscWoW.delta.ctr.pct)}`
    );
    lines.push(
      `    Avg Position: ${chalk.white(g.position.toFixed(1))}  ${fmtDelta(gscWoW.delta.position.value, gscWoW.delta.position.pct, true)}`
    );
  }
  lines.push("");

  // GA4
  lines.push(cyan.bold("  Analytics (7d vs prev 7d)"));
  const a = ga4WoW.current;
  if (!a.hasData) {
    lines.push(chalk.gray("    No data yet"));
  } else {
    lines.push(`    Sessions:   ${chalk.white.bold(fmtNum(a.sessions))}  ${fmtDelta(ga4WoW.delta.sessions.value, ga4WoW.delta.sessions.pct)}`);
    lines.push(`    Pageviews:  ${chalk.white(fmtNum(a.pageviews))}  ${fmtDelta(ga4WoW.delta.pageviews.value, ga4WoW.delta.pageviews.pct)}`);
    lines.push(`    Bounce:     ${chalk.white(a.bounceRate.toFixed(1) + "%")}  ${fmtDelta(ga4WoW.delta.bounceRate.value, ga4WoW.delta.bounceRate.pct, true)}`);
  }
  lines.push("");

  // Rankings
  if (rankings.total > 0) {
    lines.push(cyan.bold("  Rankings"));
    lines.push(`    Top 3: ${lime.bold(String(rankings.top3))}  |  Top 10: ${chalk.white(String(rankings.top10))}  |  Top 20: ${chalk.white(String(rankings.top20))}  |  Tracked: ${chalk.gray(String(rankings.total))}`);
    lines.push("");
  }

  // Top Keywords — filter out unranked
  const rankedKws = topKeywords.filter((kw) => kw.position < 100);
  if (rankedKws.length > 0) {
    lines.push(cyan.bold("  Top Keywords"));
    for (const kw of rankedKws) {
      let changeStr = "";
      if (kw.change !== null && kw.change < 0) {
        changeStr = lime(` ▲ ${Math.abs(kw.change)}`);
      } else if (kw.change !== null && kw.change > 0) {
        changeStr = danger(` ▼ ${kw.change}`);
      }
      const posColor = kw.position <= 3 ? lime : kw.position <= 10 ? chalk.white : warn;
      lines.push(`    ${chalk.white(kw.keyword.padEnd(40))} ${posColor.bold("#" + String(Math.round(kw.position)))}${changeStr}`);
    }
    lines.push("");
  }

  // GEO — only show if citations exist
  if (geo.hasData && geo.totalCitations > 0) {
    lines.push(cyan.bold("  AI Visibility (30d)"));
    lines.push(`    Citation Rate: ${lime.bold(geo.citationRate.toFixed(1) + "%")}  (${geo.totalCitations} citations)`);
    const platforms = Object.entries(geo.platforms).sort(([, a], [, b]) => b - a);
    for (const [p, c] of platforms) {
      lines.push(`    ${chalk.gray(p.padEnd(20))} ${chalk.white(String(c))} citations`);
    }
    lines.push("");
  }

  // Insights
  if (insights.length > 0) {
    lines.push(cyan.bold("  Recent Insights"));
    for (const ins of insights) {
      const icon = ins.severity === "critical" ? danger("!!!") : ins.severity === "high" ? warn("!!") : chalk.yellow("!");
      const title = ins.title.length > 70 ? ins.title.slice(0, 67) + "..." : ins.title;
      const summary = ins.summary
        ?.replace(/[\u{1F600}-\u{1F9FF}\u{2600}-\u{2B55}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}]/gu, "")
        ?.replace(/\n/g, " ")?.replace(/\s+/g, " ")?.trim()?.slice(0, 120);
      lines.push(`  ${icon} ${chalk.white.bold(title)}`);
      if (summary) lines.push(`    ${chalk.gray(summary)}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

export async function reportCommand(
  projectName: string | undefined,
  opts: { json?: boolean; md?: boolean }
): Promise<void> {
  const globalOpts = getGlobalOpts();
  const useJson = opts.json || globalOpts.json;
  const useMd = opts.md;

  const spinner = ora("Generating report...").start();

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

    spinner.text = `Building report for ${project.name}...`;

    const [gscWoW, ga4WoW, geo, rankings, insights, topKeywords] = await Promise.all([
      fetchGSCMetricsWoW(project.id).catch(() => ({
        current: { clicks: 0, impressions: 0, ctr: 0, position: 0, hasData: false },
        previous: { clicks: 0, impressions: 0, ctr: 0, position: 0, hasData: false },
        delta: { clicks: { value: 0, pct: null }, impressions: { value: 0, pct: null }, ctr: { value: 0, pct: null }, position: { value: 0, pct: null } },
      })),
      fetchGA4MetricsWoW(project.id).catch(() => ({
        current: { sessions: 0, pageviews: 0, pagesPerSession: 0, bounceRate: 0, avgDuration: 0, hasData: false },
        previous: { sessions: 0, pageviews: 0, pagesPerSession: 0, bounceRate: 0, avgDuration: 0, hasData: false },
        delta: { sessions: { value: 0, pct: null }, pageviews: { value: 0, pct: null }, bounceRate: { value: 0, pct: null } },
      })),
      fetchGEOMetrics(project.id).catch(() => ({ totalCitations: 0, platforms: {}, citationRate: 0, hasData: false })),
      fetchRankingsSummary(project.id).catch(() => ({ top3: 0, top10: 0, top20: 0, total: 0 })),
      fetchInsights(project.id, 5).catch(() => []),
      fetchTopKeywords(project.id, 5).catch(() => []),
    ]);

    spinner.stop();

    if (useJson) {
      process.stdout.write(JSON.stringify({ project: { id: project.id, name: project.name, domain: project.domain }, gsc: gscWoW, ga4: ga4WoW, geo, rankings, topKeywords, insights }, null, 2) + "\n");
      return;
    }

    if (useMd) {
      process.stdout.write(buildMarkdown(project, gscWoW, ga4WoW, geo, rankings, topKeywords, insights) + "\n");
      return;
    }

    console.log(buildText(project, gscWoW, ga4WoW, geo, rankings, topKeywords, insights));
  } catch (err) {
    spinner.fail("Report failed");
    console.log(formatError(err instanceof Error ? err.message : String(err)));
    process.exit(1);
  }
}
