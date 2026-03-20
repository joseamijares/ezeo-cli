/**
 * Anthropic API wrapper — extracted from agent.ts for reuse.
 * Used as the primary driver for tool-use agent turns and as
 * a fallback when other providers are unavailable.
 */

import Anthropic from '@anthropic-ai/sdk';

export interface AnthropicOptions {
  apiKey: string;
  model?: string;
  maxTokens?: number;
  systemPrompt?: string;
}

export type SimpleMessage = {
  role: 'user' | 'assistant';
  content: string;
};

/**
 * Simple non-streaming text completion via Anthropic.
 * Good for single-shot tasks (summaries, classifications, etc.).
 */
export async function generateWithAnthropic(
  messages: SimpleMessage[],
  options: AnthropicOptions
): Promise<string> {
  const client = new Anthropic({ apiKey: options.apiKey });

  const response = await client.messages.create({
    model: options.model ?? 'claude-sonnet-4-6',
    max_tokens: options.maxTokens ?? 4096,
    ...(options.systemPrompt ? { system: options.systemPrompt } : {}),
    messages,
  });

  const textBlock = response.content.find((b) => b.type === 'text');
  return textBlock?.type === 'text' ? textBlock.text : '';
}

/**
 * Streaming agent turn with full tool-use support via Anthropic.
 * This is the primary path when no other provider is available.
 *
 * @param client    Pre-initialized Anthropic client
 * @param messages  Full conversation history (Anthropic MessageParam format)
 * @param tools     Tool definitions
 * @param systemPrompt System prompt string
 * @param model     Model to use (default: claude-sonnet-4-6)
 * @param maxTokens Max tokens (default: 4096)
 * @param onText    Callback for streaming text deltas
 * @returns         The final message from Anthropic
 */
export async function streamingAgentTurnAnthropic(
  client: Anthropic,
  messages: Anthropic.MessageParam[],
  tools: Anthropic.Tool[],
  systemPrompt: string,
  model: string,
  maxTokens: number,
  onText: (delta: string) => void
): Promise<Anthropic.Message> {
  const stream = client.messages.stream({
    model,
    max_tokens: maxTokens,
    system: systemPrompt,
    tools,
    messages,
  });

  stream.on('text', onText);
  return stream.finalMessage();
}
