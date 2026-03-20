import { describe, it, expect, vi, afterEach } from "vitest";

// ── Hoist mock fn so vi.mock factory can close over it ───────────────────────
const { mockGeminiGenerate } = vi.hoisted(() => ({
  mockGeminiGenerate: vi.fn(),
}));

// ── Mock the Gemini provider so we don't make real API calls ────────────────
vi.mock("../src/lib/providers/gemini.js", () => ({
  generateWithGemini: mockGeminiGenerate,
}));

import { classifyIntentWithLLM } from "../src/lib/llm-router.js";

afterEach(() => {
  vi.clearAllMocks();
  delete process.env.GEMINI_API_KEY;
});

// ── Pass 1: keyword router handles known intents ─────────────────────────────

describe("classifyIntentWithLLM — keyword router first pass", () => {
  it("classifies 'traffic' without calling Gemini", async () => {
    const intent = await classifyIntentWithLLM("traffic");
    expect(intent.type).toBe("traffic");
    expect(mockGeminiGenerate).not.toHaveBeenCalled();
  });

  it("classifies 'rankings' without calling Gemini", async () => {
    const intent = await classifyIntentWithLLM("rankings");
    expect(intent.type).toBe("rankings");
    expect(mockGeminiGenerate).not.toHaveBeenCalled();
  });

  it("classifies 'geo' without calling Gemini", async () => {
    const intent = await classifyIntentWithLLM("geo");
    expect(intent.type).toBe("geo");
    expect(mockGeminiGenerate).not.toHaveBeenCalled();
  });

  it("classifies 'status' without calling Gemini", async () => {
    const intent = await classifyIntentWithLLM("status");
    expect(intent.type).toBe("status");
    expect(mockGeminiGenerate).not.toHaveBeenCalled();
  });

  it("classifies 'exit' without calling Gemini", async () => {
    const intent = await classifyIntentWithLLM("exit");
    expect(intent.type).toBe("exit");
    expect(mockGeminiGenerate).not.toHaveBeenCalled();
  });
});

// ── Pass 2: Gemini fallback for unknown intents ───────────────────────────────

// Inputs that are guaranteed to return "unknown" from the keyword router
const TRULY_UNKNOWN_INPUTS = [
  "xqzprt flibble wump",  // nonsense
  "please do the magic thing",
  "I need assistance with my online situation",
  "run the thing now",
];

describe("classifyIntentWithLLM — Gemini fallback for unknown inputs", () => {
  it("skips Gemini call when GEMINI_API_KEY is not set", async () => {
    delete process.env.GEMINI_API_KEY;
    const intent = await classifyIntentWithLLM("xqzprt flibble wump");
    expect(intent.type).toBe("unknown");
    expect(mockGeminiGenerate).not.toHaveBeenCalled();
  });

  it("calls Gemini when input is unknown and key is available", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    mockGeminiGenerate.mockResolvedValueOnce('{"intent":"traffic"}');

    const intent = await classifyIntentWithLLM("xqzprt flibble wump");
    expect(mockGeminiGenerate).toHaveBeenCalledTimes(1);
    expect(intent.type).toBe("traffic");
  });

  it("returns Gemini-classified intent with project", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    mockGeminiGenerate.mockResolvedValueOnce(
      '{"intent":"rankings","project":"aquaprovac.com"}'
    );

    const intent = await classifyIntentWithLLM("xqzprt flibble wump");
    expect(intent.type).toBe("rankings");
    if (intent.type === "rankings") {
      expect(intent.project).toBe("aquaprovac.com");
    }
  });

  it("handles Gemini returning markdown-wrapped JSON", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    mockGeminiGenerate.mockResolvedValueOnce(
      '```json\n{"intent":"geo"}\n```'
    );

    const intent = await classifyIntentWithLLM("xqzprt flibble wump");
    expect(intent.type).toBe("geo");
  });

  it("falls back to 'unknown' when Gemini returns invalid JSON", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    mockGeminiGenerate.mockResolvedValueOnce("I cannot classify this.");

    const intent = await classifyIntentWithLLM("xqzprt flibble wump");
    expect(intent.type).toBe("unknown");
  });

  it("falls back to 'unknown' when Gemini returns unknown intent type", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    mockGeminiGenerate.mockResolvedValueOnce('{"intent":"banana"}');

    const intent = await classifyIntentWithLLM("xqzprt flibble wump");
    expect(intent.type).toBe("unknown");
  });

  it("falls back to 'unknown' when Gemini throws an error", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    mockGeminiGenerate.mockRejectedValueOnce(new Error("API error"));

    const intent = await classifyIntentWithLLM("xqzprt flibble wump");
    expect(intent.type).toBe("unknown");
  });

  it("falls back to 'unknown' on Gemini timeout", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    mockGeminiGenerate.mockRejectedValueOnce(new Error("Gemini timeout after 10000ms"));

    const intent = await classifyIntentWithLLM("xqzprt flibble wump");
    expect(intent.type).toBe("unknown");
  });
});

// ── All valid intent types ────────────────────────────────────────────────────

describe("classifyIntentWithLLM — all Gemini-returned intent types", () => {
  const intentTypes = [
    "status", "traffic", "rankings", "geo", "insights",
    "keywords", "competitors", "audit", "cro", "image",
    "compare", "suggest", "switch", "projects", "help", "exit",
  ];

  for (const intentType of intentTypes) {
    it(`parses "${intentType}" intent from Gemini response`, async () => {
      process.env.GEMINI_API_KEY = "test-key";
      mockGeminiGenerate.mockResolvedValueOnce(
        JSON.stringify({ intent: intentType })
      );
      // Use a clearly unknown input so keyword router won't match
      const intent = await classifyIntentWithLLM("xqzprt flibble wump");
      expect(intent.type).toBe(intentType);
    });
  }
});

// ── Intent type preservation for project field ────────────────────────────────

describe("classifyIntentWithLLM — project field handling", () => {
  it("omits project field when Gemini does not return one", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    mockGeminiGenerate.mockResolvedValueOnce('{"intent":"traffic"}');

    const intent = await classifyIntentWithLLM("xqzprt flibble wump");
    expect(intent.type).toBe("traffic");
    if (intent.type === "traffic") {
      expect(intent.project).toBeUndefined();
    }
  });

  it("handles empty project string gracefully", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    mockGeminiGenerate.mockResolvedValueOnce('{"intent":"geo","project":""}');

    const intent = await classifyIntentWithLLM("xqzprt flibble wump");
    expect(intent.type).toBe("geo");
    if (intent.type === "geo") {
      expect(intent.project).toBeUndefined();
    }
  });

  it("sets url field for audit intent when project is provided", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    mockGeminiGenerate.mockResolvedValueOnce('{"intent":"audit","project":"aquaprovac.com"}');

    const intent = await classifyIntentWithLLM("xqzprt flibble wump");
    expect(intent.type).toBe("audit");
    if (intent.type === "audit") {
      expect(intent.url).toBe("aquaprovac.com");
    }
  });
});
