import chalk from "chalk";
import ora from "ora";
import {
  fetchProjects,
  fetchGSCMetrics,
  fetchGA4Metrics,
  fetchGEOMetrics,
  fetchRankingsSummary,
  fetchInsights,
} from "../lib/api.js";
import { config } from "../lib/config.js";
import { formatStatus, formatInsights, formatError } from "../lib/formatter.js";

export async function statusCommand(projectName?: string): Promise<void> {
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
    const [gsc, ga4, geo, rankings, insights] = await Promise.all([
      fetchGSCMetrics(project.id).catch(() => ({
        clicks: 0,
        impressions: 0,
        ctr: 0,
        position: 0,
      })),
      fetchGA4Metrics(project.id).catch(() => ({
        sessions: 0,
        users: 0,
        bounceRate: 0,
      })),
      fetchGEOMetrics(project.id).catch(() => ({
        totalCitations: 0,
        platforms: {},
        citationRate: 0,
      })),
      fetchRankingsSummary(project.id).catch(() => ({
        top3: 0,
        top10: 0,
        top20: 0,
        total: 0,
      })),
      fetchInsights(project.id).catch(() => []),
    ]);

    spinner.stop();

    console.log(formatStatus(project, gsc, ga4, geo, rankings));

    if (insights.length > 0) {
      console.log(formatInsights(insights));
    }
  } catch (err) {
    spinner.fail("Failed to load status");
    console.log(formatError(err instanceof Error ? err.message : String(err)));
    process.exit(1);
  }
}
