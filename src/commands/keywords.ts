import chalk from "chalk";
import ora from "ora";
import Table from "cli-table3";
import { fetchProjects, fetchTopKeywords, type TopKeyword } from "../lib/api.js";
import { config } from "../lib/config.js";
import { getGlobalOpts } from "../lib/globals.js";
import { formatError } from "../lib/formatter.js";

const cyan = chalk.hex("#00D4FF");
const lime = chalk.hex("#7CE850");
const danger = chalk.hex("#FF3B30");
const warn = chalk.hex("#FF9500");

function positionColor(pos: number): string {
  if (pos <= 3) return lime.bold(String(pos));
  if (pos <= 10) return cyan(String(pos));
  if (pos <= 20) return chalk.white(String(pos));
  if (pos <= 50) return warn(String(pos));
  return chalk.gray(String(pos));
}

function changeIndicator(change: number | null): string {
  if (change === null) return chalk.gray("NEW");
  if (change < 0) return lime(`▲ ${Math.abs(change)}`); // improved (moved up)
  if (change > 0) return danger(`▼ ${change}`); // dropped
  return chalk.gray("—");
}

export async function keywordsCommand(
  projectName?: string,
  opts?: { limit?: number; json?: boolean }
): Promise<void> {
  const globalOpts = getGlobalOpts();
  const useJson = opts?.json || globalOpts.json;
  const limit = opts?.limit ?? 20;
  const spinner = ora("Loading keywords...").start();

  try {
    const projects = await fetchProjects();
    let project;

    if (projectName) {
      project = projects.find(
        (p) =>
          p.name.toLowerCase().includes(projectName.toLowerCase()) ||
          p.domain?.toLowerCase().includes(projectName.toLowerCase())
      );
      if (!project) {
        spinner.fail(`Project "${projectName}" not found`);
        return;
      }
    } else {
      const defaultId = config.get("defaultProject");
      if (defaultId) project = projects.find((p) => p.id === defaultId);
      if (!project) project = projects[0];
      if (!project) {
        spinner.fail("No projects found");
        return;
      }
    }

    spinner.text = `Loading keywords for ${project.name}...`;
    const keywords = await fetchTopKeywords(project.id, limit);
    spinner.stop();

    if (useJson) {
      process.stdout.write(
        JSON.stringify({ project: { id: project.id, name: project.name }, keywords }, null, 2) + "\n"
      );
      return;
    }

    if (keywords.length === 0) {
      console.log(chalk.gray("\n  No ranking keywords found.\n"));
      return;
    }

    console.log("");
    console.log(
      `  ${chalk.hex("#F5E642").bold("Keywords")} ${chalk.gray("—")} ${cyan(project.name)}`
    );
    console.log("");

    const table = new Table({
      head: [
        chalk.gray("#"),
        chalk.gray("Keyword"),
        chalk.gray("Pos"),
        chalk.gray("Change"),
      ],
      style: { head: [], border: ["gray"] },
      colWidths: [5, 50, 8, 10],
    });

    keywords.forEach((kw, i) => {
      table.push([
        chalk.gray(`${i + 1}`),
        chalk.white(kw.keyword),
        positionColor(kw.position),
        changeIndicator(kw.change),
      ]);
    });

    console.log(table.toString());

    // Summary
    const top3 = keywords.filter((k) => k.position <= 3).length;
    const top10 = keywords.filter((k) => k.position <= 10).length;
    const improved = keywords.filter((k) => k.change !== null && k.change < 0).length;
    const dropped = keywords.filter((k) => k.change !== null && k.change > 0).length;

    console.log("");
    console.log(
      `  ${lime(`${top3}`)} in top 3  ·  ${cyan(`${top10}`)} in top 10  ·  ` +
      `${lime(`${improved}`)} improved  ·  ${danger(`${dropped}`)} dropped`
    );
    console.log("");
  } catch (err) {
    spinner.fail("Failed to load keywords");
    console.log(formatError(err instanceof Error ? err.message : String(err)));
    process.exit(1);
  }
}
