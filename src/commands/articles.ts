import chalk from "chalk";
import ora from "ora";
import inquirer from "inquirer";
import { fetchArticles, fetchProjects, requestArticles } from "../lib/api.js";
import { clampRequestCount, summarizeRequestArticles } from "../lib/articles.js";
import { formatError } from "../lib/formatter.js";
import { getGlobalOpts } from "../lib/globals.js";
import { pickProject } from "./readout.js";

const lemon = chalk.hex("#F5E642");
const lime = chalk.hex("#7CE850");
const warn = chalk.hex("#FF9500");

const STATUS_COLOR: Record<string, (s: string) => string> = {
  draft: chalk.gray,
  in_review: chalk.cyan,
  revision_requested: warn,
  approved: lime,
  published: lime.bold,
  archived: chalk.dim,
};

async function resolveProject(spinner: ReturnType<typeof ora>, name?: string) {
  const projects = await fetchProjects();
  const project = pickProject(projects, name ?? getGlobalOpts().project);
  if (!project) {
    spinner.fail(name ? `Project "${name}" not found` : "No projects found");
    if (projects.length > 0) {
      console.log(chalk.gray(`  Available: ${projects.map((p) => p.name).join(", ")}`));
    }
    process.exit(1);
  }
  return project;
}

export async function articlesListCommand(
  projectName: string | undefined,
  opts: { status?: string; limit?: string; json?: boolean }
): Promise<void> {
  const useJson = opts.json || getGlobalOpts().json;
  const spinner = ora("Loading articles...").start();
  try {
    const project = await resolveProject(spinner, projectName);
    const limit = opts.limit ? parseInt(opts.limit, 10) : 20;
    const articles = await fetchArticles(project.id, { status: opts.status, limit });
    spinner.stop();

    if (useJson) {
      process.stdout.write(
        JSON.stringify({ project: { id: project.id, name: project.name }, articles }, null, 2) + "\n"
      );
      return;
    }

    console.log();
    console.log(lemon.bold(`  Articles — ${project.name}`) + chalk.gray(opts.status ? `  status: ${opts.status}` : ""));
    console.log();
    if (articles.length === 0) {
      console.log(chalk.gray("  No articles yet. Start one with `ezeo articles request`."));
      console.log();
      return;
    }
    for (const a of articles) {
      const color = STATUS_COLOR[a.status] ?? chalk.white;
      const meta = [
        a.target_keyword ? `kw: ${a.target_keyword}` : null,
        a.word_count != null ? `${a.word_count} words` : null,
        a.qa_score != null ? `QA ${a.qa_score}` : null,
        `updated ${a.updated_at.slice(0, 10)}`,
      ].filter(Boolean);
      console.log(`  ${color(a.status.padEnd(18))} ${chalk.white.bold(a.title)}`);
      console.log(`  ${" ".repeat(18)} ${chalk.gray(meta.join(" · "))}`);
      if (a.published_url) console.log(`  ${" ".repeat(18)} ${chalk.gray(a.published_url)}`);
    }
    console.log();
  } catch (err) {
    spinner.fail("Failed to load articles");
    console.log(formatError(err instanceof Error ? err.message : String(err)));
    process.exit(1);
  }
}

export async function articlesRequestCommand(
  projectName: string | undefined,
  opts: { count?: string; yes?: boolean; json?: boolean }
): Promise<void> {
  const useJson = opts.json || getGlobalOpts().json;
  const spinner = ora("Resolving project...").start();
  try {
    const project = await resolveProject(spinner, projectName);
    spinner.stop();

    const asked = opts.count ? parseInt(opts.count, 10) : 1;
    const count = clampRequestCount(asked);

    if (!opts.yes) {
      if (useJson || !process.stdin.isTTY) {
        const msg = "Starting articles spends allowance or credits; pass --yes to confirm non-interactively.";
        if (useJson) console.error(JSON.stringify({ error: msg }));
        else console.log(formatError(msg));
        process.exit(1);
      }
      if (asked !== count) {
        console.log(chalk.gray(`  One request starts at most ${count}; asking for ${count}.`));
      }
      const { confirm } = await inquirer.prompt([
        {
          type: "confirm",
          name: "confirm",
          default: false,
          message: `Start ${count} article${count === 1 ? "" : "s"} for ${project.name} this week? Each new one uses a weekly allowance or pay-per-work credit.`,
        },
      ]);
      if (!confirm) {
        console.log(chalk.gray("  Nothing started."));
        return;
      }
    }

    const running = ora(`Starting ${count} article${count === 1 ? "" : "s"}...`).start();
    const result = await requestArticles(project.id, count);
    const summary = summarizeRequestArticles(result);
    running.stop();

    if (useJson) {
      process.stdout.write(
        JSON.stringify({ project: { id: project.id, name: project.name }, summary, result }, null, 2) + "\n"
      );
      return;
    }

    console.log();
    console.log(summary.tone === "started" ? lime(`  ✓ ${summary.headline}`) : warn(`  ${summary.headline}`));
    for (const d of summary.details) console.log(chalk.gray(`    ${d}`));
    console.log();
  } catch (err) {
    spinner.stop();
    console.log(formatError(err instanceof Error ? err.message : String(err)));
    process.exit(1);
  }
}
