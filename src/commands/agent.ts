import * as readline from "node:readline";
import chalk from "chalk";
import ora from "ora";
import Anthropic from "@anthropic-ai/sdk";
import { fetchProjects, type Project } from "../lib/api.js";
import { config, loadCredentials } from "../lib/config.js";
import { AGENT_TOOLS, executeTool } from "../lib/agent/tools.js";
import { buildSystemPrompt } from "../lib/agent/prompts.js";
import {
  createSession,
  addUserMessage,
  addAssistantMessage,
  addToolResults,
  setProject,
  getMessages,
  type AgentSession,
} from "../lib/agent/context.js";
import { formatError, logo } from "../lib/formatter.js";
import { appendToHistory, initProjectMemory } from "../lib/memory.js";

const lemon = chalk.hex("#F5E642");
const lime = chalk.hex("#7CE850");

const MAX_TOOL_ITERATIONS = 10;

export async function runAgentTurn(
  client: Anthropic,
  session: AgentSession,
  userInput: string,
  onText: (delta: string) => void
): Promise<void> {
  addUserMessage(session, userInput);

  for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
    const stream = client.messages.stream({
      model: "claude-opus-4-6",
      max_tokens: 4096,
      system: buildSystemPrompt(session.currentProjectName),
      tools: AGENT_TOOLS,
      messages: getMessages(session),
    });

    stream.on("text", onText);

    const message = await stream.finalMessage();
    addAssistantMessage(session, message.content);

    if (message.stop_reason === "end_turn") break;
    if (message.stop_reason !== "tool_use") break;

    const toolUseBlocks = message.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
    );
    if (toolUseBlocks.length === 0) break;

    const toolResults: Anthropic.ToolResultBlockParam[] = [];

    for (const toolBlock of toolUseBlocks) {
      const label = toolBlock.name.replace(/_/g, " ");
      const spinner = ora({
        text: chalk.gray(`  Fetching ${label}...`),
        stream: process.stderr,
      }).start();

      const result = await executeTool(
        toolBlock.name,
        toolBlock.input as Record<string, unknown>
      );
      spinner.stop();

      toolResults.push({
        type: "tool_result",
        tool_use_id: toolBlock.id,
        content: result,
      });
    }

    addToolResults(session, toolResults);
  }
}

function resolveProject(
  projects: Project[],
  nameOrDomain: string
): Project | undefined {
  const lower = nameOrDomain.toLowerCase();
  return (
    projects.find((p) => p.name.toLowerCase() === lower) ??
    projects.find(
      (p) =>
        p.name.toLowerCase().includes(lower) ||
        p.domain?.toLowerCase().includes(lower)
    )
  );
}

export async function agentCommand(projectArg?: string): Promise<void> {
  const creds = loadCredentials();
  if (!creds?.access_token) {
    console.log(
      formatError("Not logged in. Run `ezeo login` or `ezeo setup` first.")
    );
    process.exit(1);
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.log(
      formatError(
        "ANTHROPIC_API_KEY not set.\n\n  Add it to ~/.ezeo/.env:\n    ANTHROPIC_API_KEY=sk-ant-..."
      )
    );
    process.exit(1);
  }

  const client = new Anthropic({ apiKey });

  const spinner = ora({ text: "Connecting...", stream: process.stderr }).start();
  let projects: Project[] = [];
  let currentProject: Project | undefined;

  try {
    projects = await fetchProjects();
    const defaultId = config.get("defaultProject");
    currentProject = projects.find((p) => p.id === defaultId) ?? projects[0];
    if (projectArg) {
      currentProject = resolveProject(projects, projectArg) ?? currentProject;
    }
    spinner.stop();
  } catch (err) {
    spinner.fail("Failed to connect");
    console.log(formatError(err instanceof Error ? err.message : String(err)));
    process.exit(1);
  }

  const session = createSession();

  if (currentProject) {
    setProject(session, currentProject.id, currentProject.name);
    initProjectMemory(currentProject.name, currentProject.domain ?? "");
  }

  console.log();
  console.log(logo());
  console.log();
  console.log(
    `  ${lime.bold("Agent Mode")}  ${chalk.gray("—")}  ${chalk.white("Claude Opus")}`
  );
  if (currentProject) {
    console.log(
      chalk.gray(
        `  Project: ${chalk.white(currentProject.name)} ${chalk.gray(
          `(${currentProject.domain})`
        )}`
      )
    );
  }
  console.log();
  console.log(
    chalk.gray(
      "  Ask anything about your SEO data. I'll fetch and chain the data I need."
    )
  );
  console.log(
    chalk.gray(
      `  Try: "What's driving my traffic drop?" or "How's my AI visibility?"`
    )
  );
  console.log(chalk.gray("  Type 'exit' or 'quit' to leave."));
  console.log();

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: lemon("agent > "),
  });

  rl.prompt();

  rl.on("line", async (line) => {
    const input = line.trim();
    if (!input) {
      rl.prompt();
      return;
    }

    if (input === "exit" || input === "quit") {
      console.log(
        chalk.gray("\n  Goodbye! Run `ezeo agent` to start a new session.\n")
      );
      rl.close();
      return;
    }

    console.log();
    let hasOutput = false;

    try {
      await runAgentTurn(client, session, input, (delta) => {
        process.stdout.write(chalk.white(delta));
        hasOutput = true;
      });

      if (hasOutput) console.log("\n");

      if (currentProject) {
        appendToHistory(currentProject.name, `- Agent: \`${input}\``);
      }
    } catch (err) {
      if (err instanceof Anthropic.AuthenticationError) {
        console.log(
          formatError(
            "Invalid Anthropic API key. Check ANTHROPIC_API_KEY in ~/.ezeo/.env"
          )
        );
      } else if (err instanceof Anthropic.RateLimitError) {
        console.log(
          formatError("Rate limited. Please wait a moment before trying again.")
        );
      } else {
        console.log(
          formatError(err instanceof Error ? err.message : String(err))
        );
      }
      console.log();
    }

    rl.prompt();
  });

  rl.on("close", () => {
    process.exit(0);
  });
}
