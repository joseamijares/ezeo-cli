import chalk from "chalk";
import ora from "ora";
import Table from "cli-table3";
import { fetchProjects, fetchGEOMetrics } from "../lib/api.js";
import { config } from "../lib/config.js";
import { formatError } from "../lib/formatter.js";
import { getGlobalOpts } from "../lib/globals.js";

const lemon = chalk.hex("#F5E642");
const cyan = chalk.hex("#00D4FF");
const lime = chalk.hex("#7CE850");
const warn = chalk.hex("#FF9500");
const danger = chalk.hex("#FF3B30");

function citationRateColor(rate: number): typeof chalk {
  if (rate >= 50) return lime;
  if (rate >= 20) return warn;
  return danger;
}

export async function geoCommand(projectName?: string): Promise<void> {
  const globalOpts = getGlobalOpts();
  const useJson = globalOpts.json;

  const spinner = ora("Loading GEO visibility...").start();

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

    const geo = await fetchGEOMetrics(project.id, 30);
    spinner.stop();

    if (useJson) {
      process.stdout.write(JSON.stringify({ project: { id: project.id, name: project.name, domain: project.domain }, geo }, null, 2) + "\n");
      return;
    }

    console.log();
    console.log(lemon.bold(`  AI Visibility — ${project.name}`) + chalk.gray(` (${project.domain})`));
    console.log(chalk.gray("  Last 30 days"));
    console.log();

    if (!geo.hasData) {
      console.log(chalk.gray("  No AI citation data yet."));
      console.log(chalk.gray("  Connect your project at app.ezeo.ai to start tracking."));
      console.log();
      return;
    }

    const rateColor = citationRateColor(geo.citationRate);

    // Summary row
    console.log(`  Citation Rate:  ${rateColor.bold(geo.citationRate.toFixed(1) + "%")}`);
    console.log(`  Total Citations: ${chalk.white.bold(String(geo.totalCitations))}`);
    console.log();

    // Platform breakdown
    const platforms = Object.entries(geo.platforms).sort(([, a], [, b]) => b - a);

    if (platforms.length > 0) {
      console.log(cyan.bold("  Platform Breakdown"));
      console.log();

      const table = new Table({
        head: [chalk.gray("Platform"), chalk.gray("Citations"), chalk.gray("Share")],
        style: { head: [], border: ["gray"] },
        colWidths: [25, 12, 12],
      });

      for (const [platform, count] of platforms) {
        const share = geo.totalCitations > 0 ? ((count / geo.totalCitations) * 100).toFixed(0) + "%" : "—";
        table.push([chalk.white(platform), lime.bold(String(count)), chalk.gray(share)]);
      }

      console.log(table.toString());
      console.log();
    }

    // Advice
    if (geo.citationRate < 20) {
      console.log(warn("  ⚠️  Low citation rate.") + chalk.gray(" Consider publishing more authoritative content."));
    } else if (geo.citationRate < 50) {
      console.log(chalk.yellow("  💡 Growing citation rate.") + chalk.gray(" Keep building topical authority."));
    } else {
      console.log(lime("  ✓ Strong AI visibility!") + chalk.gray(" You're showing up well in AI responses."));
    }
    console.log();
  } catch (err) {
    spinner.fail("Failed to load GEO data");
    console.log(formatError(err instanceof Error ? err.message : String(err)));
    process.exit(1);
  }
}
