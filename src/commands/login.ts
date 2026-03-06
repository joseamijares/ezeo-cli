import inquirer from "inquirer";
import chalk from "chalk";
import ora from "ora";
import { getAuthClient, fetchProjects } from "../lib/api.js";
import { saveCredentials, config, SUPABASE_ANON_KEY } from "../lib/config.js";
import { formatProjectList, logo } from "../lib/formatter.js";
import { initProjectMemory, getSoul } from "../lib/memory.js";

export async function loginCommand(): Promise<void> {
  console.log();
  console.log(logo());
  console.log();

  if (!SUPABASE_ANON_KEY) {
    console.log(chalk.red("  EZEO_SUPABASE_ANON_KEY environment variable is required."));
    console.log(chalk.gray("  Set it in your shell: export EZEO_SUPABASE_ANON_KEY=your_key"));
    console.log(chalk.gray("  Or add it to ~/.ezeo/.env"));
    process.exit(1);
  }

  const answers = await inquirer.prompt([
    {
      type: "input",
      name: "email",
      message: "Email:",
      validate: (v: string) =>
        v.includes("@") ? true : "Enter a valid email",
    },
    {
      type: "password",
      name: "password",
      message: "Password:",
      mask: "*",
      validate: (v: string) => (v.length > 0 ? true : "Password is required"),
    },
  ]);

  const spinner = ora("Authenticating...").start();

  try {
    const supabase = await getAuthClient();
    const { data, error } = await supabase.auth.signInWithPassword({
      email: answers.email,
      password: answers.password,
    });

    if (error || !data.session) {
      spinner.fail("Authentication failed");
      console.log(
        chalk.red(`  ${error?.message ?? "Invalid credentials"}`)
      );
      process.exit(1);
    }

    saveCredentials({
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      expires_at: data.session.expires_at ?? 0,
      user_email: answers.email,
    });

    spinner.succeed("Authenticated");

    // Fetch projects
    const projects = await fetchProjects();

    console.log();
    console.log(
      chalk.green(`  Logged in as ${chalk.bold(answers.email)}`)
    );
    console.log(
      chalk.gray(
        `  ${projects.length} project${projects.length !== 1 ? "s" : ""} found`
      )
    );

    // Initialize memory for each project
    for (const p of projects) {
      initProjectMemory(p.name, p.domain ?? "");
    }

    // Ensure soul.md exists
    getSoul();

    if (projects.length > 0) {
      console.log();
      console.log(formatProjectList(projects, config.get("defaultProject")));

      if (!config.get("defaultProject")) {
        // Auto-set first project as default
        config.set("defaultProject", projects[0].id);
        config.set("defaultProjectName", projects[0].name);
        console.log();
        console.log(
          chalk.gray(
            `  Default project set to ${chalk.white(projects[0].name)} (change with \`ezeo projects use <name>\`)`
          )
        );
      }
    }

    console.log();
    console.log(chalk.gray("  Run `ezeo status` or `ezeo chat` to get started."));
    console.log();
  } catch (err) {
    spinner.fail("Login failed");
    console.log(chalk.red(`  ${err instanceof Error ? err.message : String(err)}`));
    process.exit(1);
  }
}
