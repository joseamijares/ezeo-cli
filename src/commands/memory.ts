import chalk from "chalk";
import { homedir } from "node:os";
import { join } from "node:path";
import { existsSync, readdirSync, statSync, readFileSync } from "node:fs";
import { config } from "../lib/config.js";
import { fetchProjects } from "../lib/api.js";
import {
  getProjectMemory,
  getSoul,
  getGlobalMemory,
  initProjectMemory,
} from "../lib/memory.js";

const EZEO_DIR = join(homedir(), ".ezeo");
const MEMORY_DIR = join(EZEO_DIR, "memory");

const lemon = chalk.hex("#F5E642");
const cyan = chalk.hex("#00D4FF");

export async function memoryCommand(target?: string): Promise<void> {
  if (target === "soul") {
    console.log();
    console.log(lemon.bold("  ~/.ezeo/soul.md"));
    console.log(chalk.gray("  ─".repeat(30)));
    console.log();
    console.log(getSoul());
    return;
  }

  if (target === "global") {
    console.log();
    console.log(lemon.bold("  ~/.ezeo/memory/global.md"));
    console.log(chalk.gray("  ─".repeat(30)));
    console.log();
    console.log(getGlobalMemory());
    return;
  }

  // Show specific project memory
  if (target) {
    const projects = await fetchProjects();
    const project = projects.find(
      (p) =>
        p.name.toLowerCase().includes(target.toLowerCase()) ||
        p.domain?.toLowerCase().includes(target.toLowerCase())
    );

    if (project) {
      initProjectMemory(project.name, project.domain ?? "");
      const slug = project.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");

      console.log();
      console.log(lemon.bold(`  ${project.name} Memory Files`));
      console.log(chalk.gray(`  ~/.ezeo/memory/${slug}/`));
      console.log();

      for (const file of ["context", "history", "insights", "content"] as const) {
        const content = getProjectMemory(project.name, file);
        const lines = content?.split("\n").length ?? 0;
        const isEmpty = lines <= 5;
        const icon = isEmpty ? chalk.gray("○") : chalk.green("●");
        console.log(`  ${icon} ${cyan(file + ".md")} ${chalk.gray(`(${lines} lines)`)}`);
      }

      console.log();
      console.log(
        chalk.gray(
          `  Edit these files to improve content quality and recommendations.`
        )
      );
      console.log(
        chalk.gray(`  Path: ${join(MEMORY_DIR, slug)}/`)
      );
      console.log();
      return;
    }
  }

  // Default: show memory overview
  console.log();
  console.log(lemon.bold("  Ezeo Memory System"));
  console.log();

  // Soul
  const soulPath = join(EZEO_DIR, "soul.md");
  const soulExists = existsSync(soulPath);
  console.log(
    `  ${soulExists ? chalk.green("●") : chalk.gray("○")} ${cyan("soul.md")} ${chalk.gray("— CLI personality and content standards")}`
  );

  // Global
  const globalPath = join(MEMORY_DIR, "global.md");
  const globalExists = existsSync(globalPath);
  console.log(
    `  ${globalExists ? chalk.green("●") : chalk.gray("○")} ${cyan("memory/global.md")} ${chalk.gray("— Cross-project notes")}`
  );

  console.log();

  // Projects
  if (existsSync(MEMORY_DIR)) {
    const dirs = readdirSync(MEMORY_DIR).filter((f) => {
      try {
        return statSync(join(MEMORY_DIR, f)).isDirectory();
      } catch {
        return false;
      }
    });

    if (dirs.length > 0) {
      console.log(cyan.bold("  Project Memories:"));
      for (const dir of dirs) {
        const files = readdirSync(join(MEMORY_DIR, dir));
        const filledCount = files.filter((f) => {
          try {
            const content = readFileSync(join(MEMORY_DIR, dir, f), "utf-8");
            return content.split("\n").length > 5;
          } catch {
            return false;
          }
        }).length;
        console.log(
          `    ${chalk.white(dir)}/ ${chalk.gray(`(${filledCount}/${files.length} files populated)`)}`
        );
      }
    }
  }

  console.log();
  console.log(chalk.gray("  Usage:"));
  console.log(chalk.gray("    ezeo memory soul      — View soul.md"));
  console.log(chalk.gray("    ezeo memory global    — View global notes"));
  console.log(chalk.gray("    ezeo memory <project> — View project memory"));
  console.log();
  console.log(
    chalk.gray("  Edit files directly at: ~/.ezeo/")
  );
  console.log();
}
