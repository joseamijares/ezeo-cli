import { Command } from "commander";
import { loginCommand } from "./commands/login.js";
import { logoutCommand } from "./commands/logout.js";
import { projectsCommand, useProjectCommand } from "./commands/projects.js";
import { statusCommand } from "./commands/status.js";
import { chatCommand } from "./commands/chat.js";
import { whoamiCommand } from "./commands/whoami.js";
import { memoryCommand } from "./commands/memory.js";

const program = new Command();

program
  .name("ezeo")
  .description("Ezeo AI CLI — Talk to your SEO data")
  .version("0.1.0");

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
  .action((project?: string) => statusCommand(project));

program
  .command("chat")
  .description("Interactive conversational mode")
  .action(chatCommand);

program
  .command("memory [target]")
  .description("View memory files (soul, global, or project name)")
  .action((target?: string) => memoryCommand(target));

// Default to chat if no command specified
program.action(chatCommand);

program.parse();
