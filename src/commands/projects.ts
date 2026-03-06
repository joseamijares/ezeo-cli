import chalk from "chalk";
import ora from "ora";
import { fetchProjects } from "../lib/api.js";
import { config } from "../lib/config.js";
import { formatProjectList, logo } from "../lib/formatter.js";

export async function projectsCommand(): Promise<void> {
  const spinner = ora("Loading projects...").start();

  try {
    const projects = await fetchProjects();
    spinner.stop();

    console.log();
    console.log(
      formatProjectList(projects, config.get("defaultProject"))
    );
    console.log();

    if (config.get("defaultProject")) {
      console.log(
        chalk.gray(
          `  Default: ${chalk.white(config.get("defaultProjectName") ?? "---")} (marked with *)`
        )
      );
      console.log(
        chalk.gray("  Change with: ezeo projects use <name>")
      );
    }
    console.log();
  } catch (err) {
    spinner.fail("Failed to load projects");
    console.log(
      chalk.red(`  ${err instanceof Error ? err.message : String(err)}`)
    );
    process.exit(1);
  }
}

export async function useProjectCommand(name: string): Promise<void> {
  const spinner = ora("Finding project...").start();

  try {
    const projects = await fetchProjects();
    const match = projects.find(
      (p) =>
        p.name.toLowerCase().includes(name.toLowerCase()) ||
        p.domain?.toLowerCase().includes(name.toLowerCase())
    );

    if (!match) {
      spinner.fail("Project not found");
      console.log(
        chalk.gray(
          `  Available: ${projects.map((p) => p.name).join(", ")}`
        )
      );
      return;
    }

    config.set("defaultProject", match.id);
    config.set("defaultProjectName", match.name);
    spinner.succeed(`Default project set to ${chalk.bold(match.name)}`);
  } catch (err) {
    spinner.fail("Failed");
    console.log(
      chalk.red(`  ${err instanceof Error ? err.message : String(err)}`)
    );
  }
}
