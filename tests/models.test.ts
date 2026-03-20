import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  MODEL_CONFIGS,
  ANTHROPIC_FALLBACK,
  getApiKey,
  isAvailable,
  resolveFirstAvailable,
  getModelAvailability,
  type ModelRole,
} from "../src/lib/models.js";

describe("MODEL_CONFIGS", () => {
  it("defines all six roles", () => {
    const roles: ModelRole[] = ["router", "analyst", "writer", "agent", "batch", "chat"];
    for (const role of roles) {
      expect(MODEL_CONFIGS[role]).toBeDefined();
      expect(MODEL_CONFIGS[role].role).toBe(role);
    }
  });

  it("each config has required fields", () => {
    for (const cfg of Object.values(MODEL_CONFIGS)) {
      expect(typeof cfg.model).toBe("string");
      expect(cfg.model.length).toBeGreaterThan(0);
      expect(typeof cfg.apiKeyEnv).toBe("string");
      expect(cfg.apiKeyEnv.length).toBeGreaterThan(0);
      expect(typeof cfg.maxTokens).toBe("number");
      expect(cfg.maxTokens).toBeGreaterThan(0);
      expect(typeof cfg.description).toBe("string");
    }
  });

  it("openai-compatible configs have a baseUrl", () => {
    for (const cfg of Object.values(MODEL_CONFIGS)) {
      if (cfg.provider === "openai-compatible") {
        expect(typeof cfg.baseUrl).toBe("string");
        expect(cfg.baseUrl!.startsWith("https://")).toBe(true);
      }
    }
  });

  it("google configs do not need a baseUrl", () => {
    for (const cfg of Object.values(MODEL_CONFIGS)) {
      if (cfg.provider === "google") {
        // baseUrl is optional for google provider
        expect(cfg.apiKeyEnv).toBe("GEMINI_API_KEY");
      }
    }
  });

  it("router and chat use Gemini", () => {
    expect(MODEL_CONFIGS.router.provider).toBe("google");
    expect(MODEL_CONFIGS.chat.provider).toBe("google");
  });

  it("agent and batch use MiniMax via openai-compatible", () => {
    expect(MODEL_CONFIGS.agent.provider).toBe("openai-compatible");
    expect(MODEL_CONFIGS.batch.provider).toBe("openai-compatible");
    expect(MODEL_CONFIGS.agent.baseUrl).toContain("minimax");
  });

  it("writer uses Kimi via openai-compatible", () => {
    expect(MODEL_CONFIGS.writer.provider).toBe("openai-compatible");
    expect(MODEL_CONFIGS.writer.apiKeyEnv).toBe("MOONSHOT_API_KEY");
  });
});

describe("ANTHROPIC_FALLBACK", () => {
  it("uses Anthropic provider", () => {
    expect(ANTHROPIC_FALLBACK.provider).toBe("anthropic");
  });

  it("uses claude-sonnet model", () => {
    expect(ANTHROPIC_FALLBACK.model).toContain("claude");
  });

  it("uses ANTHROPIC_API_KEY", () => {
    expect(ANTHROPIC_FALLBACK.apiKeyEnv).toBe("ANTHROPIC_API_KEY");
  });
});

describe("getApiKey", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    // Restore env
    for (const key of ["GEMINI_API_KEY", "MINIMAX_API_KEY", "ANTHROPIC_API_KEY"]) {
      delete process.env[key];
    }
    Object.assign(process.env, originalEnv);
  });

  it("returns the env var value when set", () => {
    process.env.GEMINI_API_KEY = "test-gemini-key";
    expect(getApiKey(MODEL_CONFIGS.router)).toBe("test-gemini-key");
  });

  it("returns undefined when env var is not set", () => {
    delete process.env.GEMINI_API_KEY;
    expect(getApiKey(MODEL_CONFIGS.router)).toBeUndefined();
  });
});

describe("isAvailable", () => {
  afterEach(() => {
    delete process.env.GEMINI_API_KEY;
    delete process.env.MINIMAX_API_KEY;
  });

  it("returns true when the API key env var is set", () => {
    process.env.GEMINI_API_KEY = "some-key";
    expect(isAvailable(MODEL_CONFIGS.router)).toBe(true);
  });

  it("returns false when the API key env var is not set", () => {
    delete process.env.GEMINI_API_KEY;
    expect(isAvailable(MODEL_CONFIGS.router)).toBe(false);
  });

  it("returns false for empty string", () => {
    process.env.MINIMAX_API_KEY = "";
    expect(isAvailable(MODEL_CONFIGS.agent)).toBe(false);
  });
});

describe("resolveFirstAvailable", () => {
  afterEach(() => {
    delete process.env.GEMINI_API_KEY;
    delete process.env.MINIMAX_API_KEY;
    delete process.env.TOGETHER_API_KEY;
  });

  it("returns the first role with an API key configured", () => {
    delete process.env.GEMINI_API_KEY;
    process.env.MINIMAX_API_KEY = "key";
    const cfg = resolveFirstAvailable(["router", "agent"]);
    expect(cfg?.role).toBe("agent");
  });

  it("returns null when no roles have API keys", () => {
    delete process.env.GEMINI_API_KEY;
    delete process.env.MINIMAX_API_KEY;
    delete process.env.TOGETHER_API_KEY;
    const cfg = resolveFirstAvailable(["router", "agent", "analyst"]);
    expect(cfg).toBeNull();
  });

  it("returns the first match in priority order", () => {
    process.env.GEMINI_API_KEY = "key1";
    process.env.MINIMAX_API_KEY = "key2";
    const cfg = resolveFirstAvailable(["router", "agent"]);
    expect(cfg?.role).toBe("router");
  });
});

describe("getModelAvailability", () => {
  it("returns an array with one entry per unique config", () => {
    const availability = getModelAvailability();
    expect(Array.isArray(availability)).toBe(true);
    expect(availability.length).toBeGreaterThan(0);
  });

  it("each entry has required fields", () => {
    const availability = getModelAvailability();
    for (const item of availability) {
      expect(typeof item.role).toBe("string");
      expect(typeof item.model).toBe("string");
      expect(typeof item.apiKeyEnv).toBe("string");
      expect(typeof item.available).toBe("boolean");
      expect(typeof item.description).toBe("string");
    }
  });

  it("available reflects actual env var state", () => {
    process.env.GEMINI_API_KEY = "test";
    const availability = getModelAvailability();
    const routerEntry = availability.find((a) => a.role === "router");
    expect(routerEntry?.available).toBe(true);
    delete process.env.GEMINI_API_KEY;
  });
});
