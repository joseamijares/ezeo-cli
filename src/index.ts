import { Command } from "commander";
import { createRequire } from "node:module";
import chalk from "chalk";
import { loginCommand } from "./commands/login.js";
import { logoutCommand } from "./commands/logout.js";
import { projectsCommand, useProjectCommand } from "./commands/projects.js";
import { statusCommand } from "./commands/status.js";
import { chatCommand } from "./commands/chat.js";
import { whoamiCommand } from "./commands/whoami.js";
import { memoryCommand } from "./commands/memory.js";
import { croCommand } from "./commands/cro.js";
import { imageCommand } from "./commands/image.js";
import { setupCommand } from "./commands/setup.js";
import { apiKeyCreateCommand, apiKeyListCommand, apiKeyRevokeCommand } from "./commands/api-key.js";
import { reportCommand } from "./commands/report.js";
import { alertsCommand } from "./commands/alerts.js";
import { geoCommand } from "./commands/geo.js";
import { doctorCommand } from "./commands/doctor.js";
import { config } from "./lib/config.js";
import { setGlobalOpts } from "./lib/globals.js";

// Catch unhandled rejections with a friendly error
process.on("unhandledRejection", (reason) => {
  const msg = reason instanceof Error ? reason.message : String(reason);
  console.error(chalk.hex("#FF3B30")("\n  Unexpected error: ") + chalk.white(msg));
  console.error(chalk.gray("  Run `ezeo doctor` to check system status.\n"));
  process.exit(1);
});

const require = createRequire(import.meta.url);
const pkg = require("../package.json") as { version: string };

const lemon = chalk.hex("#F5E642");
const cyan = chalk.hex("#00D4FF");

const program = new Command();

program
  .name("ezeo")
  .description("Ezeo AI CLI — Talk to your SEO data")
  .version(pkg.version)
  // Global flags available on every command
  .option("--json", "Output as machine-readable JSON")
  .option("--no-color", "Disable colors (for piping)")
  .option("-q, --quiet", "Suppress non-essential output")
  .option("--project <name>", "Override default project for this command")
  .option("--format <format>", "Output format: text, json, md", "text")
  .hook("preAction", (thisCommand) => {
    const opts = thisCommand.opts() as {
      json?: boolean;
      color?: boolean;
      quiet?: boolean;
      project?: string;
      format?: string;
    };
    setGlobalOpts({
      json: opts.json ?? false,
      noColor: opts.color === false,
      quiet: opts.quiet ?? false,
      project: opts.project,
      format: (opts.format as "text" | "json" | "md") ?? "text",
    });
  });

// ---- setup ----
program
  .command("setup")
  .description("Guided first-run wizard — login, pick a project, configure CLI")
  .addHelpText(
    "after",
    `
Examples:
  ezeo setup               # First-time setup wizard
  ezeo setup               # Re-run to change default project`
  )
  .action(setupCommand);

// ---- login / logout / whoami ----
program
  .command("login")
  .description("Authenticate with your Ezeo account")
  .option("--email <email>", "Email address (skip prompt)")
  .option("--password <password>", "Password (skip prompt)")
  .addHelpText(
    "after",
    `
Examples:
  ezeo login                                    # Interactive login prompt
  ezeo login --email user@co.com --password pw  # Non-interactive`
  )
  .action((opts: { email?: string; password?: string }) => loginCommand(opts));

program
  .command("logout")
  .description("Clear stored credentials")
  .addHelpText(
    "after",
    `
Examples:
  ezeo logout`
  )
  .action(logoutCommand);

program
  .command("whoami")
  .description("Show current user, default project, and token status")
  .addHelpText(
    "after",
    `
Examples:
  ezeo whoami
  ezeo whoami --json`
  )
  .action(whoamiCommand);

// ---- projects ----
const projectsCmd = program
  .command("projects")
  .description("List your projects and sync status")
  .addHelpText(
    "after",
    `
Examples:
  ezeo projects             # List all projects
  ezeo projects use Aqua    # Set Aqua as default project
  ezeo projects --json`
  )
  .action(projectsCommand);

projectsCmd
  .command("use <name>")
  .description("Set default project by name")
  .addHelpText(
    "after",
    `
Examples:
  ezeo projects use "Aqua Pro Vac"
  ezeo projects use aqua       # Partial match works`
  )
  .action(useProjectCommand);

// ---- status ----
program
  .command("status [project]")
  .description("Project dashboard — GSC, GA4, GEO, rankings overview")
  .addHelpText(
    "after",
    `
Examples:
  ezeo status                   # Default project
  ezeo status "Aqua Pro Vac"    # Specific project
  ezeo --json status aqua       # JSON output
  ezeo --project aqua status    # Via global flag`
  )
  .action((project: string | undefined) => {
    return statusCommand(project);
  });

// ---- report ----
program
  .command("report [project]")
  .description("Full performance report — GSC, GA4, keywords, GEO, insights")
  .option("--json", "Output as JSON")
  .option("--md", "Output as Markdown")
  .addHelpText(
    "after",
    `
Examples:
  ezeo report                   # Default project, text output
  ezeo report aqua --md         # Markdown report for Aqua
  ezeo report --json            # Machine-readable JSON
  ezeo report > report.md --md  # Save to file`
  )
  .action((project: string | undefined, opts: { json?: boolean; md?: boolean }) =>
    reportCommand(project, opts)
  );

// ---- alerts ----
program
  .command("alerts [project]")
  .description("Show recent alerts and insights — ranking drops, traffic changes")
  .addHelpText(
    "after",
    `
Examples:
  ezeo alerts                   # Default project
  ezeo alerts aqua              # Specific project
  ezeo alerts --json`
  )
  .action((project?: string) => alertsCommand(project));

// ---- geo ----
program
  .command("geo [project]")
  .description("AI visibility summary — citation rate, platform breakdown")
  .addHelpText(
    "after",
    `
Examples:
  ezeo geo                      # Default project
  ezeo geo aqua                 # Specific project
  ezeo geo --json`
  )
  .action((project?: string) => geoCommand(project));

// ---- doctor ----
program
  .command("doctor")
  .description("Check connectivity, auth, and API access")
  .addHelpText(
    "after",
    `
Examples:
  ezeo doctor
  ezeo doctor --json`
  )
  .action(doctorCommand);

// ---- cro ----
program
  .command("cro [project]")
  .description("CRO audit score, findings, and pending deliverables")
  .addHelpText(
    "after",
    `
Examples:
  ezeo cro
  ezeo cro aqua`
  )
  .action((project?: string) => croCommand(project));

// ---- image ----
program
  .command("image [description]")
  .description("Generate images for your content (coming soon)")
  .addHelpText(
    "after",
    `
Examples:
  ezeo image "hero banner for aquaprovac.com"`
  )
  .action((description?: string) => imageCommand(description));

// ---- chat ----
program
  .command("chat")
  .description("Interactive conversational mode — ask anything about your data")
  .option("--model <model>", "AI model to use (default: auto)")
  .addHelpText(
    "after",
    `
Examples:
  ezeo chat
  ezeo chat --model gpt-4
  ezeo           # Default action is chat`
  )
  .action(chatCommand);

// ---- memory ----
program
  .command("memory [target]")
  .description("View memory files (soul, global, or project name)")
  .addHelpText(
    "after",
    `
Examples:
  ezeo memory                   # Global memory
  ezeo memory soul              # Soul/personality file
  ezeo memory aqua              # Project-specific memory`
  )
  .action((target?: string) => memoryCommand(target));

// ---- api-key ----
const apiKeyCmd = program
  .command("api-key")
  .description("Manage API keys for programmatic/CI access")
  .addHelpText(
    "after",
    `
Examples:
  ezeo api-key create --name "CI pipeline"
  ezeo api-key list
  ezeo api-key revoke <key-id>`
  );

apiKeyCmd
  .command("create")
  .description("Generate a new API key")
  .option("--name <label>", "Label for this key")
  .addHelpText(
    "after",
    `
Examples:
  ezeo api-key create --name "CI pipeline"
  ezeo api-key create --name "Alex laptop"`
  )
  .action((opts: { name?: string }) => apiKeyCreateCommand(opts));

apiKeyCmd
  .command("list")
  .description("List active API keys")
  .addHelpText(
    "after",
    `
Examples:
  ezeo api-key list
  ezeo api-key list --json`
  )
  .action(() => apiKeyListCommand());

apiKeyCmd
  .command("revoke <key-id>")
  .description("Revoke an API key by ID")
  .addHelpText(
    "after",
    `
Examples:
  ezeo api-key revoke abc123`
  )
  .action((keyId: string) => apiKeyRevokeCommand(keyId));

// ---- version ----
program
  .command("version")
  .description("Show version, Node.js version, and config path")
  .action(() => {
    console.log("");
    console.log(`  ${lemon.bold("ezeo")}  v${pkg.version}`);
    console.log(`  ${chalk.gray("Node:")}    ${cyan(process.version)}`);
    console.log(`  ${chalk.gray("Config:")}  ${chalk.white(config.path)}`);
    console.log("");
  });

// Default to chat if no command specified
program.action(chatCommand);

program.parse();
