import chalk from "chalk";
import ora from "ora";
import { fetchProjects, fetchWeeklyReadout, type Project } from "../lib/api.js";
import { config } from "../lib/config.js";
import { formatError } from "../lib/formatter.js";
import { getGlobalOpts } from "../lib/globals.js";

const lemon = chalk.hex("#F5E642");

function pickProject(projects: Project[], searchName?: string): Project | undefined {
  if (searchName) {
    const needle = searchName.toLowerCase();
    return projects.find(
      (p) => p.name.toLowerCase().includes(needle) || p.domain?.toLowerCase().includes(needle)
    );
  }
  const defaultId = config.get("defaultProject");
  return (defaultId && projects.find((p) => p.id === defaultId)) || projects[0];
}

/**
 * Print the weekly readout Ezeo already composed for a project. Nothing is
 * computed here: the readout is the same stored document the app shows, so
 * the CLI cannot disagree with it.
 */
export async function readoutCommand(
  projectName: string | undefined,
  opts: { week?: string; json?: boolean }
): Promise<void> {
  const globalOpts = getGlobalOpts();
  const useJson = opts.json || globalOpts.json;
  const spinner = ora("Loading weekly readout...").start();

  try {
    if (opts.week && !/^\d{4}-\d{2}-\d{2}$/.test(opts.week)) {
      spinner.fail(`--week must be a Monday as YYYY-MM-DD, got "${opts.week}"`);
      process.exit(1);
    }

    const projects = await fetchProjects();
    const project = pickProject(projects, projectName ?? globalOpts.project);
    if (!project) {
      spinner.fail(projectName ? `Project "${projectName}" not found` : "No projects found");
      if (projects.length > 0) {
        console.log(chalk.gray(`  Available: ${projects.map((p) => p.name).join(", ")}`));
      }
      process.exit(1);
    }

    const readout = await fetchWeeklyReadout(project.id, opts.week);
    spinner.stop();

    if (useJson) {
      process.stdout.write(
        JSON.stringify({ project: { id: project.id, name: project.name }, readout }, null, 2) + "\n"
      );
      return;
    }

    if (!readout) {
      console.log();
      console.log(
        chalk.gray(
          opts.week
            ? `  No readout for ${project.name} for the week of ${opts.week}.`
            : `  No weekly readout for ${project.name} yet. Ezeo composes one every Monday at 12:00 UTC.`
        )
      );
      console.log();
      return;
    }

    console.log();
    console.log(
      lemon.bold(`  Weekly readout — ${project.name}`) +
        chalk.gray(`  week of ${readout.week_start} · ${readout.status}`)
    );
    console.log();
    process.stdout.write(readout.markdown.trimEnd() + "\n\n");
  } catch (err) {
    spinner.fail("Failed to load weekly readout");
    console.log(formatError(err instanceof Error ? err.message : String(err)));
    process.exit(1);
  }
}
