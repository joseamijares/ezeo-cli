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
import { config } from "./lib/config.js";

const require = createRequire(import.meta.url);
const pkg = require("../package.json") as { version: string };

const lemon = chalk.hex("#F5E642");
const cyan = chalk.hex("#00D4FF");

const program = new Command();

program
  .name("ezeo")
  .description("Ezeo AI CLI — Talk to your SEO data")
  .version(pkg.version);

program
  .command("login")
  .description("Authenticate with your Ezeo account")
  .action(loginCommand);

program
  .command("logout")
  .description("Clear stored credentials")
  .action(logoutCommand);

program
  .command("whoami")
  .description("Show current user, default project, and token status")
  .action(whoamiCommand);

const projectsCmd = program
  .command("projects")
  .description("List your projects")
  .action(projectsCommand);

projectsCmd
  .command("use <name>")
  .description("Set default project")
  .action(useProjectCommand);

program
  .command("status [project]")
  .description("Project dashboard overview")
  .option("--json", "Output as machine-readable JSON")
  .action((project: string | undefined, options: { json?: boolean }) =>
    statusCommand(project, options.json)
  );

program
  .command("cro [project]")
  .description("Show CRO audit score, findings, and pending deliverables")
  .action((project?: string) => croCommand(project));

program
  .command("image [description]")
  .description("Generate images for your content (coming soon)")
  .action((description?: string) => imageCommand(description));

program
  .command("chat")
  .description("Interactive conversational mode")
  .action(chatCommand);

program
  .command("memory [target]")
  .description("View memory files (soul, global, or project name)")
  .action((target?: string) => memoryCommand(target));

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
