/**
 * OpenAI-compatible API wrapper using the `openai` package.
 * Handles MiniMax (M1), Kimi K2, and Qwen via their OpenAI-compatible endpoints.
 * All three providers expose /v1/chat/completions with the same request format.
 */

import OpenAI from 'openai';

export interface OpenAICompatOptions {
  apiKey: string;
  baseUrl: string;
  model: string;
  maxTokens?: number;
  timeoutMs?: number;
  temperature?: number;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * Simple text completion via an OpenAI-compatible endpoint.
 * @throws on API error, auth failure, or timeout
 */
export async function generateWithOpenAICompat(
  messages: ChatMessage[],
  options: OpenAICompatOptions
): Promise<string> {
  const client = new OpenAI({
    apiKey: options.apiKey,
    baseURL: options.baseUrl,
    timeout: options.timeoutMs ?? 60000,
    maxRetries: 0,
  });

  const completion = await client.chat.completions.create({
    model: options.model,
    messages,
    max_tokens: options.maxTokens ?? 4096,
    temperature: options.temperature ?? 0.7,
  });

  return completion.choices[0]?.message?.content ?? '';
}

// ---- Tool use types (mirrors OpenAI function calling spec) ----

export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, unknown>;
      required: string[];
    };
  };
}

export interface ToolCallResult {
  tool_call_id: string;
  name: string;
  content: string;
}

/**
 * Run a single agentic turn with tool use via OpenAI-compatible API.
 * Returns { text, toolCalls } where toolCalls may be empty if the model ended.
 */
export interface AgentTurnResult {
  text: string;
  toolCalls: Array<{
    id: string;
    name: string;
    arguments: Record<string, unknown>;
  }>;
  stopReason: 'end_turn' | 'tool_use' | 'unknown';
}

export async function agentTurnWithOpenAICompat(
  messages: OpenAI.Chat.ChatCompletionMessageParam[],
  tools: ToolDefinition[],
  options: OpenAICompatOptions
): Promise<AgentTurnResult> {
  const client = new OpenAI({
    apiKey: options.apiKey,
    baseURL: options.baseUrl,
    timeout: options.timeoutMs ?? 60000,
    maxRetries: 0,
  });

  const response = await client.chat.completions.create({
    model: options.model,
    messages,
    tools,
    max_tokens: options.maxTokens ?? 4096,
    temperature: options.temperature ?? 0.7,
  });

  const choice = response.choices[0];
  if (!choice) throw new Error('No choices returned from OpenAI-compatible API');

  const message = choice.message;
  const text = message.content ?? '';

  if (choice.finish_reason === 'tool_calls' && message.tool_calls && message.tool_calls.length > 0) {
    const toolCalls = message.tool_calls.map((tc) => ({
      id: tc.id,
      name: tc.function.name,
      arguments: JSON.parse(tc.function.arguments || '{}') as Record<string, unknown>,
    }));
    return { text, toolCalls, stopReason: 'tool_use' };
  }

  return { text, toolCalls: [], stopReason: 'end_turn' };
}

/**
 * Build an OpenAI-format tool definition from an Anthropic-style tool.
 * Converts Anthropic's `input_schema` → OpenAI's `parameters`.
 */
export function toOpenAITool(anthropicTool: {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, unknown>;
    required: string[];
  };
}): ToolDefinition {
  return {
    type: 'function',
    function: {
      name: anthropicTool.name,
      description: anthropicTool.description,
      parameters: {
        type: 'object',
        properties: anthropicTool.input_schema.properties,
        required: anthropicTool.input_schema.required,
      },
    },
  };
}
