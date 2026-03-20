/**
 * Gemini API wrapper using @google/generative-ai SDK.
 * Used for intent routing (gemini-2.5-flash) and chat fallback.
 */

import { GoogleGenerativeAI } from '@google/generative-ai';

export interface GeminiOptions {
  apiKey: string;
  model?: string;
  maxOutputTokens?: number;
  timeoutMs?: number;
}

/**
 * Generate a text completion using the Gemini API.
 * @throws on API error or timeout
 */
export async function generateWithGemini(
  prompt: string,
  options: GeminiOptions
): Promise<string> {
  const genAI = new GoogleGenerativeAI(options.apiKey);
  const modelName = options.model ?? 'gemini-2.5-flash';

  const genModel = genAI.getGenerativeModel({
    model: modelName,
    generationConfig: {
      maxOutputTokens: options.maxOutputTokens ?? 512,
    },
  });

  // Wrap in a timeout race
  const timeoutMs = options.timeoutMs ?? 15000;
  const generatePromise = genModel.generateContent(prompt);
  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(`Gemini timeout after ${timeoutMs}ms`)), timeoutMs)
  );

  const result = await Promise.race([generatePromise, timeoutPromise]);
  return result.response.text();
}

/**
 * Generate a chat-style completion (multi-turn) using Gemini.
 */
export interface GeminiChatMessage {
  role: 'user' | 'model';
  parts: Array<{ text: string }>;
}

export async function chatWithGemini(
  history: GeminiChatMessage[],
  userMessage: string,
  options: GeminiOptions
): Promise<string> {
  const genAI = new GoogleGenerativeAI(options.apiKey);
  const genModel = genAI.getGenerativeModel({
    model: options.model ?? 'gemini-2.5-flash',
    generationConfig: {
      maxOutputTokens: options.maxOutputTokens ?? 2048,
    },
  });

  const chat = genModel.startChat({ history });

  const timeoutMs = options.timeoutMs ?? 30000;
  const sendPromise = chat.sendMessage(userMessage);
  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(`Gemini chat timeout after ${timeoutMs}ms`)), timeoutMs)
  );

  const result = await Promise.race([sendPromise, timeoutPromise]);
  return result.response.text();
}
