import * as readline from "node:readline";
import chalk from "chalk";
import ora from "ora";
import Anthropic from "@anthropic-ai/sdk";
import type OpenAI from "openai";
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
import { MODEL_CONFIGS, ANTHROPIC_FALLBACK, getApiKey } from "../lib/models.js";
import {
  agentTurnWithOpenAICompat,
  toOpenAITool,
  type ToolDefinition,
} from "../lib/providers/openai-compat.js";

const lemon = chalk.hex("#F5E642");
const lime = chalk.hex("#7CE850");

const MAX_TOOL_ITERATIONS = 10;

// ---- OpenAI-compat agent turn (MiniMax primary) --------------------------------

/**
 * Run one agentic turn using the OpenAI-compatible API (MiniMax M2.7).
 * Manages tool call loops internally.
 */
async function runAgentTurnOpenAICompat(
  apiKey: string,
  session: AgentSession,
  userInput: string,
  onText: (delta: string) => void
): Promise<void> {
  addUserMessage(session, userInput);

  const agentCfg = MODEL_CONFIGS.agent;
  const openAiTools: ToolDefinition[] = AGENT_TOOLS.map(toOpenAITool);

  // Build OpenAI-format message history from session
  function buildOpenAIMessages(): OpenAI.Chat.ChatCompletionMessageParam[] {
    const systemMsg: OpenAI.Chat.ChatCompletionSystemMessageParam = {
      role: "system",
      content: buildSystemPrompt(session.currentProjectName),
    };
    const history: OpenAI.Chat.ChatCompletionMessageParam[] = getMessages(session).map((m) => {
      if (m.role === "user") {
        if (typeof m.content === "string") {
          return { role: "user" as const, content: m.content };
        }
        // Tool results — convert array content to string for OpenAI format
        const content = Array.isArray(m.content)
          ? m.content
          : [m.content];
        return { role: "user" as const, content: JSON.stringify(content) };
      }
      if (m.role === "assistant") {
        if (typeof m.content === "string") {
          return { role: "assistant" as const, content: m.content };
        }
        // Extract text from content blocks
        const blocks = Array.isArray(m.content) ? m.content : [m.content];
        const text = blocks
          .filter((b): b is { type: "text"; text: string } => (b as { type: string }).type === "text")
          .map((b) => b.text)
          .join("\n");
        return { role: "assistant" as const, content: text || null };
      }
      return { role: "user" as const, content: "" };
    });
    return [systemMsg, ...history];
  }

  // Track current OpenAI messages separately so we can append tool results
  let currentMessages: OpenAI.Chat.ChatCompletionMessageParam[] = buildOpenAIMessages();

  for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
    const result = await agentTurnWithOpenAICompat(currentMessages, openAiTools, {
      apiKey,
      baseUrl: agentCfg.baseUrl!,
      model: agentCfg.model,
      maxTokens: agentCfg.maxTokens,
      timeoutMs: 60_000,
    });

    if (result.text) {
      onText(result.text);
    }

    if (result.stopReason === "end_turn" || result.toolCalls.length === 0) {
      // Sync final text back to session
      if (result.text) {
        addAssistantMessage(session, [{ type: "text", text: result.text }]);
      }
      break;
    }

    // Build the assistant message with tool_calls for the OpenAI thread
    const assistantMsg: OpenAI.Chat.ChatCompletionAssistantMessageParam = {
      role: "assistant",
      content: result.text || null,
      tool_calls: result.toolCalls.map((tc) => ({
        id: tc.id,
        type: "function" as const,
        function: {
          name: tc.name,
          arguments: JSON.stringify(tc.arguments),
        },
      })),
    };
    currentMessages.push(assistantMsg);

    // Also record in session context (for memory)
    addAssistantMessage(session, [{ type: "text", text: result.text || "" }]);

    // Execute tools
    const toolResultMessages: OpenAI.Chat.ChatCompletionToolMessageParam[] = [];

    for (const toolCall of result.toolCalls) {
      const label = toolCall.name.replace(/_/g, " ");
      const spinner = ora({
        text: chalk.gray(`  Fetching ${label}...`),
        stream: process.stderr,
      }).start();

      const toolResult = await executeTool(
        toolCall.name,
        toolCall.arguments
      );
      spinner.stop();

      toolResultMessages.push({
        role: "tool" as const,
        tool_call_id: toolCall.id,
        content: toolResult,
      });
    }

    currentMessages = [...currentMessages, ...toolResultMessages];

    // Also record tool results in session context
    const anthropicToolResults: Anthropic.ToolResultBlockParam[] = toolResultMessages.map((tr) => ({
      type: "tool_result" as const,
      tool_use_id: tr.tool_call_id,
      content: tr.content as string,
    }));
    addToolResults(session, anthropicToolResults);
  }
}

// ---- Anthropic agent turn (fallback) -------------------------------------------

export async function runAgentTurn(
  client: Anthropic,
  session: AgentSession,
  userInput: string,
  onText: (delta: string) => void
): Promise<void> {
  addUserMessage(session, userInput);

  const model = ANTHROPIC_FALLBACK.model;
  const maxTokens = ANTHROPIC_FALLBACK.maxTokens;

  for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
    const stream = client.messages.stream({
      model,
      max_tokens: maxTokens,
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

// ---- Project helpers -------------------------------------------------------

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

// ---- Main command ----------------------------------------------------------

export async function agentCommand(projectArg?: string): Promise<void> {
  const creds = loadCredentials();
  if (!creds?.access_token) {
    console.log(
      formatError("Not logged in. Run `ezeo login` or `ezeo setup` first.")
    );
    process.exit(1);
  }

  // ── Resolve which provider to use ──────────────────────────────────────────
  const minimaxKey = getApiKey(MODEL_CONFIGS.agent);
  const anthropicKey = getApiKey(ANTHROPIC_FALLBACK);

  if (!minimaxKey && !anthropicKey) {
    console.log(
      formatError(
        "No AI provider configured.\n\n" +
        "  Add at least one to ~/.ezeo/.env:\n" +
        "    MINIMAX_API_KEY=...   (primary — MiniMax M2.7)\n" +
        "    ANTHROPIC_API_KEY=sk-ant-...   (fallback — Claude Sonnet)"
      )
    );
    process.exit(1);
  }

  const useMiniMax = !!minimaxKey;
  const providerLabel = useMiniMax ? "MiniMax M2.7" : "Claude Sonnet";

  // Anthropic client (kept for fallback path)
  const anthropicClient = anthropicKey ? new Anthropic({ apiKey: anthropicKey }) : null;

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
    `  ${lime.bold("Agent Mode")}  ${chalk.gray("—")}  ${chalk.white(providerLabel)}`
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
      if (useMiniMax) {
        // ── Primary: MiniMax M2.7 ──────────────────────────────────────────
        try {
          await runAgentTurnOpenAICompat(minimaxKey!, session, input, (delta) => {
            process.stdout.write(chalk.white(delta));
            hasOutput = true;
          });
        } catch (primaryErr) {
          // ── Fallback: Claude Sonnet ────────────────────────────────────────
          if (anthropicClient) {
            console.log(chalk.gray("\n  (MiniMax unavailable — falling back to Claude Sonnet)\n"));
            await runAgentTurn(anthropicClient, session, input, (delta) => {
              process.stdout.write(chalk.white(delta));
              hasOutput = true;
            });
          } else {
            throw primaryErr;
          }
        }
      } else {
        // ── Anthropic-only path ────────────────────────────────────────────
        await runAgentTurn(anthropicClient!, session, input, (delta) => {
          process.stdout.write(chalk.white(delta));
          hasOutput = true;
        });
      }

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
