/**
 * Provider wrapper tests — all external API calls are mocked.
 */

import { describe, it, expect, vi, afterEach } from "vitest";

// ── Hoist mock fn references so vi.mock factories can close over them ────────
const {
  mockGenerateContent,
  mockSendMessage,
  mockStartChat,
  mockGetGenerativeModel,
  mockOpenAICreate,
} = vi.hoisted(() => {
  const _mockGenerateContent = vi.fn();
  const _mockSendMessage = vi.fn();
  const _mockStartChat = vi.fn(() => ({ sendMessage: _mockSendMessage }));
  const _mockGetGenerativeModel = vi.fn(() => ({
    generateContent: _mockGenerateContent,
    startChat: _mockStartChat,
  }));
  const _mockOpenAICreate = vi.fn();
  return {
    mockGenerateContent: _mockGenerateContent,
    mockSendMessage: _mockSendMessage,
    mockStartChat: _mockStartChat,
    mockGetGenerativeModel: _mockGetGenerativeModel,
    mockOpenAICreate: _mockOpenAICreate,
  };
});

// ── Mock @google/generative-ai ───────────────────────────────────────────────
vi.mock("@google/generative-ai", () => ({
  GoogleGenerativeAI: class MockGAI {
    getGenerativeModel = mockGetGenerativeModel;
  },
}));

// ── Mock openai (default export is the OpenAI class) ─────────────────────────
vi.mock("openai", () => ({
  default: class MockOpenAI {
    chat = { completions: { create: mockOpenAICreate } };
  },
}));

// ── Import providers AFTER mocks are set up ──────────────────────────────────
import { generateWithGemini, chatWithGemini } from "../src/lib/providers/gemini.js";
import {
  generateWithOpenAICompat,
  agentTurnWithOpenAICompat,
  toOpenAITool,
} from "../src/lib/providers/openai-compat.js";

afterEach(() => {
  vi.clearAllMocks();
});

// ── Gemini provider ──────────────────────────────────────────────────────────

describe("generateWithGemini", () => {
  it("returns text from response", async () => {
    mockGenerateContent.mockResolvedValueOnce({
      response: { text: () => "Hello from Gemini" },
    });

    const result = await generateWithGemini("Say hello", {
      apiKey: "test-key",
      model: "gemini-2.5-flash",
    });
    expect(result).toBe("Hello from Gemini");
  });

  it("passes the correct model to getGenerativeModel", async () => {
    mockGenerateContent.mockResolvedValueOnce({
      response: { text: () => "ok" },
    });

    await generateWithGemini("test", { apiKey: "key", model: "gemini-2.5-flash" });
    expect(mockGetGenerativeModel).toHaveBeenCalledWith(
      expect.objectContaining({ model: "gemini-2.5-flash" })
    );
  });

  it("uses default model when none specified", async () => {
    mockGenerateContent.mockResolvedValueOnce({
      response: { text: () => "ok" },
    });

    await generateWithGemini("test", { apiKey: "key" });
    expect(mockGetGenerativeModel).toHaveBeenCalledWith(
      expect.objectContaining({ model: "gemini-2.5-flash" })
    );
  });

  it("rejects on timeout", async () => {
    mockGenerateContent.mockImplementationOnce(
      () => new Promise((resolve) => setTimeout(resolve, 99999))
    );

    await expect(
      generateWithGemini("test", { apiKey: "key", timeoutMs: 1 })
    ).rejects.toThrow(/timeout/i);
  });

  it("propagates API errors", async () => {
    mockGenerateContent.mockRejectedValueOnce(new Error("API quota exceeded"));

    await expect(
      generateWithGemini("test", { apiKey: "key" })
    ).rejects.toThrow("API quota exceeded");
  });
});

describe("chatWithGemini", () => {
  it("sends the user message to chat session", async () => {
    mockSendMessage.mockResolvedValueOnce({
      response: { text: () => "Chat response" },
    });

    const history = [{ role: "user" as const, parts: [{ text: "Hello" }] }];
    const result = await chatWithGemini(history, "How are you?", { apiKey: "key" });

    expect(result).toBe("Chat response");
    expect(mockSendMessage).toHaveBeenCalledWith("How are you?");
  });

  it("passes history to startChat", async () => {
    mockSendMessage.mockResolvedValueOnce({
      response: { text: () => "ok" },
    });

    const history = [
      { role: "user" as const, parts: [{ text: "Hi" }] },
      { role: "model" as const, parts: [{ text: "Hello!" }] },
    ];
    await chatWithGemini(history, "Next message", { apiKey: "key" });

    expect(mockStartChat).toHaveBeenCalledWith({ history });
  });
});

// ── OpenAI-compatible provider ───────────────────────────────────────────────

describe("generateWithOpenAICompat", () => {
  it("returns message content from completion", async () => {
    mockOpenAICreate.mockResolvedValueOnce({
      choices: [{ message: { content: "Hello from Kimi" }, finish_reason: "stop" }],
    });

    const result = await generateWithOpenAICompat(
      [{ role: "user", content: "Say hello" }],
      {
        apiKey: "key",
        baseUrl: "https://api.moonshot.ai/v1",
        model: "kimi-k2",
      }
    );

    expect(result).toBe("Hello from Kimi");
  });

  it("passes the correct model and messages", async () => {
    mockOpenAICreate.mockResolvedValueOnce({
      choices: [{ message: { content: "ok" }, finish_reason: "stop" }],
    });

    await generateWithOpenAICompat(
      [{ role: "system", content: "You are helpful" }, { role: "user", content: "Hi" }],
      { apiKey: "key", baseUrl: "https://api.minimax.chat/v1", model: "MiniMax-M1" }
    );

    expect(mockOpenAICreate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "MiniMax-M1",
        messages: [
          { role: "system", content: "You are helpful" },
          { role: "user", content: "Hi" },
        ],
      })
    );
  });

  it("returns empty string when choices is empty", async () => {
    mockOpenAICreate.mockResolvedValueOnce({ choices: [] });

    const result = await generateWithOpenAICompat(
      [{ role: "user", content: "test" }],
      { apiKey: "key", baseUrl: "https://api.moonshot.ai/v1", model: "kimi-k2" }
    );

    expect(result).toBe("");
  });

  it("propagates API errors", async () => {
    mockOpenAICreate.mockRejectedValueOnce(new Error("Invalid API key"));

    await expect(
      generateWithOpenAICompat(
        [{ role: "user", content: "test" }],
        { apiKey: "bad-key", baseUrl: "https://api.moonshot.ai/v1", model: "kimi-k2" }
      )
    ).rejects.toThrow("Invalid API key");
  });
});

describe("agentTurnWithOpenAICompat", () => {
  const tools = [
    {
      type: "function" as const,
      function: {
        name: "get_data",
        description: "Gets data",
        parameters: { type: "object" as const, properties: {}, required: [] },
      },
    },
  ];

  it("returns end_turn when no tool calls", async () => {
    mockOpenAICreate.mockResolvedValueOnce({
      choices: [{ message: { content: "Here is your answer", tool_calls: null }, finish_reason: "stop" }],
    });

    const result = await agentTurnWithOpenAICompat(
      [{ role: "user", content: "What's my traffic?" }],
      tools,
      { apiKey: "key", baseUrl: "https://api.minimax.chat/v1", model: "MiniMax-M1" }
    );

    expect(result.stopReason).toBe("end_turn");
    expect(result.text).toBe("Here is your answer");
    expect(result.toolCalls).toHaveLength(0);
  });

  it("returns tool_use when model calls a tool", async () => {
    mockOpenAICreate.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: null,
            tool_calls: [
              {
                id: "call_abc",
                type: "function",
                function: { name: "get_data", arguments: '{"project_id":"p1"}' },
              },
            ],
          },
          finish_reason: "tool_calls",
        },
      ],
    });

    const result = await agentTurnWithOpenAICompat(
      [{ role: "user", content: "Run get_data" }],
      tools,
      { apiKey: "key", baseUrl: "https://api.minimax.chat/v1", model: "MiniMax-M1" }
    );

    expect(result.stopReason).toBe("tool_use");
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0].name).toBe("get_data");
    expect(result.toolCalls[0].id).toBe("call_abc");
    expect(result.toolCalls[0].arguments).toEqual({ project_id: "p1" });
  });

  it("throws when API returns no choices", async () => {
    mockOpenAICreate.mockResolvedValueOnce({ choices: [] });

    await expect(
      agentTurnWithOpenAICompat(
        [{ role: "user", content: "test" }],
        tools,
        { apiKey: "key", baseUrl: "https://api.minimax.chat/v1", model: "MiniMax-M1" }
      )
    ).rejects.toThrow(/no choices/i);
  });
});

// ── toOpenAITool ─────────────────────────────────────────────────────────────

describe("toOpenAITool", () => {
  it("converts Anthropic tool to OpenAI format", () => {
    const anthropicTool = {
      name: "get_keywords",
      description: "Get top keywords",
      input_schema: {
        type: "object" as const,
        properties: {
          project_id: { type: "string", description: "Project ID" },
          limit: { type: "number", description: "Max results" },
        },
        required: ["project_id"],
      },
    };

    const openAiTool = toOpenAITool(anthropicTool);

    expect(openAiTool.type).toBe("function");
    expect(openAiTool.function.name).toBe("get_keywords");
    expect(openAiTool.function.description).toBe("Get top keywords");
    expect(openAiTool.function.parameters.type).toBe("object");
    expect(openAiTool.function.parameters.properties).toHaveProperty("project_id");
    expect(openAiTool.function.parameters.required).toContain("project_id");
  });

  it("converts a tool with no required fields", () => {
    const tool = {
      name: "list_projects",
      description: "List projects",
      input_schema: {
        type: "object" as const,
        properties: {},
        required: [],
      },
    };

    const result = toOpenAITool(tool);
    expect(result.function.parameters.required).toHaveLength(0);
  });
});
