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
} from "../lib/api.js";
import { config } from "../lib/config.js";
import { getGlobalOpts } from "../lib/globals.js";
import { formatStatus, formatInsights, formatError } from "../lib/formatter.js";

export async function statusCommand(
  projectName?: string,
  jsonOutput?: boolean
): Promise<void> {
  // Merge with global opts (Commander doesn't always pass global --json to subcommands)
  const globalOpts = getGlobalOpts();
  const useJson = jsonOutput || globalOpts.json;
  const spinner = ora("Loading...").start();

  try {
    const projects = await fetchProjects();

    // Find project
    let project;
    if (projectName) {
      project = projects.find(
        (p) =>
          p.name.toLowerCase().includes(projectName.toLowerCase()) ||
          p.domain?.toLowerCase().includes(projectName.toLowerCase())
      );
      if (!project) {
        spinner.fail(`Project "${projectName}" not found`);
        console.log(
          chalk.gray(
            `  Available: ${projects.map((p) => p.name).join(", ")}`
          )
        );
        return;
      }
    } else {
      const defaultId = config.get("defaultProject");
      if (defaultId) {
        project = projects.find((p) => p.id === defaultId);
      }
      if (!project) {
        project = projects[0];
      }
      if (!project) {
        spinner.fail("No projects found");
        return;
      }
    }

    spinner.text = `Loading ${project.name}...`;

    // Fetch all metrics in parallel
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
      fetchGEOMetrics(project.id).catch(() => ({
        totalCitations: 0,
        platforms: {},
        citationRate: 0,
        hasData: false,
      })),
      fetchRankingsSummary(project.id).catch(() => ({
        top3: 0,
        top10: 0,
        top20: 0,
        total: 0,
      })),
      fetchInsights(project.id).catch(() => []),
      fetchTopKeywords(project.id, 20).catch(() => []),
    ]);

    spinner.stop();

    if (useJson) {
      const output = {
        project: {
          id: project.id,
          name: project.name,
          domain: project.domain,
        },
        gsc: {
          current: gscWoW.current,
          previous: gscWoW.previous,
          delta: gscWoW.delta,
        },
        ga4: {
          current: ga4WoW.current,
          previous: ga4WoW.previous,
          delta: ga4WoW.delta,
        },
        geo,
        rankings,
        insights,
        topKeywords,
      };
      process.stdout.write(JSON.stringify(output, null, 2) + "\n");
      return;
    }

    console.log(formatStatus(project, gscWoW, ga4WoW, geo, rankings, topKeywords));

    if (insights.length > 0) {
      console.log(formatInsights(insights));
    }
  } catch (err) {
    spinner.fail("Failed to load status");
    console.log(formatError(err instanceof Error ? err.message : String(err)));
    process.exit(1);
  }
}
