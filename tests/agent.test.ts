import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createSession,
  addUserMessage,
  addAssistantMessage,
  addToolResults,
  setProject,
  getMessages,
  getMessageCount,
} from "../src/lib/agent/context.js";
import { buildSystemPrompt } from "../src/lib/agent/prompts.js";
import { executeTool, AGENT_TOOLS } from "../src/lib/agent/tools.js";

// ---- Mock the API module ----
vi.mock("../src/lib/api.js", () => ({
  fetchProjects: vi.fn(),
  fetchGSCMetrics: vi.fn(),
  fetchGA4Metrics: vi.fn(),
  fetchGSCMetricsWoW: vi.fn(),
  fetchGA4MetricsWoW: vi.fn(),
  fetchGEOMetrics: vi.fn(),
  fetchRankingsSummary: vi.fn(),
  fetchInsights: vi.fn(),
  fetchTopKeywords: vi.fn(),
}));

import * as api from "../src/lib/api.js";

// ---- Context tests ----

describe("createSession", () => {
  it("creates a session with empty messages", () => {
    const session = createSession();
    expect(session.messages).toHaveLength(0);
  });

  it("sets null project fields by default", () => {
    const session = createSession();
    expect(session.currentProjectId).toBeNull();
    expect(session.currentProjectName).toBeNull();
  });

  it("records the session start time", () => {
    const before = new Date();
    const session = createSession();
    const after = new Date();
    expect(session.sessionStart.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(session.sessionStart.getTime()).toBeLessThanOrEqual(after.getTime());
  });
});

describe("addUserMessage", () => {
  it("appends a user message to the session", () => {
    const session = createSession();
    addUserMessage(session, "How is my traffic?");
    expect(session.messages).toHaveLength(1);
    expect(session.messages[0].role).toBe("user");
    expect(session.messages[0].content).toBe("How is my traffic?");
  });

  it("accumulates multiple messages", () => {
    const session = createSession();
    addUserMessage(session, "First question");
    addUserMessage(session, "Second question");
    expect(session.messages).toHaveLength(2);
  });
});

describe("addAssistantMessage", () => {
  it("appends an assistant message with content blocks", () => {
    const session = createSession();
    const contentBlocks = [{ type: "text" as const, text: "Here is your data." }];
    addAssistantMessage(session, contentBlocks);
    expect(session.messages).toHaveLength(1);
    expect(session.messages[0].role).toBe("assistant");
  });

  it("preserves the full content array", () => {
    const session = createSession();
    const blocks = [
      { type: "text" as const, text: "Analysis complete." },
      { type: "text" as const, text: "Additional detail." },
    ];
    addAssistantMessage(session, blocks);
    const msg = session.messages[0];
    expect(Array.isArray(msg.content)).toBe(true);
    if (Array.isArray(msg.content)) {
      expect(msg.content).toHaveLength(2);
    }
  });
});

describe("addToolResults", () => {
  it("appends a user message with tool results", () => {
    const session = createSession();
    const results = [
      {
        type: "tool_result" as const,
        tool_use_id: "tool_123",
        content: '{"clicks": 500}',
      },
    ];
    addToolResults(session, results);
    expect(session.messages).toHaveLength(1);
    expect(session.messages[0].role).toBe("user");
  });

  it("includes the tool_use_id in the result", () => {
    const session = createSession();
    const results = [
      {
        type: "tool_result" as const,
        tool_use_id: "tool_abc",
        content: "result data",
      },
    ];
    addToolResults(session, results);
    const msg = session.messages[0];
    if (Array.isArray(msg.content)) {
      const block = msg.content[0] as { type: string; tool_use_id: string };
      expect(block.tool_use_id).toBe("tool_abc");
    }
  });
});

describe("setProject", () => {
  it("sets the current project id and name", () => {
    const session = createSession();
    setProject(session, "proj_123", "Acme Corp");
    expect(session.currentProjectId).toBe("proj_123");
    expect(session.currentProjectName).toBe("Acme Corp");
  });

  it("overwrites a previously set project", () => {
    const session = createSession();
    setProject(session, "proj_1", "Old Project");
    setProject(session, "proj_2", "New Project");
    expect(session.currentProjectId).toBe("proj_2");
    expect(session.currentProjectName).toBe("New Project");
  });
});

describe("getMessages", () => {
  it("returns the messages array", () => {
    const session = createSession();
    addUserMessage(session, "Hello");
    const msgs = getMessages(session);
    expect(msgs).toHaveLength(1);
    expect(msgs[0].content).toBe("Hello");
  });

  it("reflects subsequent mutations", () => {
    const session = createSession();
    const msgs = getMessages(session);
    addUserMessage(session, "Added later");
    expect(msgs).toHaveLength(1);
  });
});

describe("getMessageCount", () => {
  it("returns 0 for a new session", () => {
    expect(getMessageCount(createSession())).toBe(0);
  });

  it("increments with each message added", () => {
    const session = createSession();
    addUserMessage(session, "one");
    addUserMessage(session, "two");
    expect(getMessageCount(session)).toBe(2);
  });
});

describe("conversation turn ordering", () => {
  it("builds alternating user/assistant/user structure", () => {
    const session = createSession();
    addUserMessage(session, "What's my traffic?");
    addAssistantMessage(session, [{ type: "text", text: "Here is your traffic." }]);
    addUserMessage(session, "What about rankings?");

    const msgs = getMessages(session);
    expect(msgs[0].role).toBe("user");
    expect(msgs[1].role).toBe("assistant");
    expect(msgs[2].role).toBe("user");
  });

  it("tool results are sent as user messages", () => {
    const session = createSession();
    addUserMessage(session, "Get status");
    addAssistantMessage(session, [
      { type: "tool_use", id: "t1", name: "get_status", input: {} },
    ]);
    addToolResults(session, [
      { type: "tool_result", tool_use_id: "t1", content: "{}" },
    ]);
    const msgs = getMessages(session);
    expect(msgs[2].role).toBe("user");
  });
});

// ---- Prompt tests ----

describe("buildSystemPrompt", () => {
  it("includes the project name when provided", () => {
    const prompt = buildSystemPrompt("Aqua Pro Vac");
    expect(prompt).toContain("Aqua Pro Vac");
  });

  it("includes a message about no project when null", () => {
    const prompt = buildSystemPrompt(null);
    expect(prompt).toContain("list_projects");
  });

  it("mentions all available tools", () => {
    const prompt = buildSystemPrompt("Test");
    expect(prompt).toContain("list_projects");
    expect(prompt).toContain("get_status");
    expect(prompt).toContain("get_keywords");
    expect(prompt).toContain("get_insights");
    expect(prompt).toContain("get_geo");
    expect(prompt).toContain("get_traffic");
  });

  it("returns a non-empty string", () => {
    expect(buildSystemPrompt(null).length).toBeGreaterThan(100);
  });

  it("includes SEO domain guidance", () => {
    const prompt = buildSystemPrompt("Site");
    expect(prompt.toLowerCase()).toContain("ctr");
    expect(prompt.toLowerCase()).toContain("ranking");
  });
});

// ---- AGENT_TOOLS schema tests ----

describe("AGENT_TOOLS definitions", () => {
  const toolNames = AGENT_TOOLS.map((t) => t.name);

  it("defines all 6 expected tools", () => {
    expect(toolNames).toContain("list_projects");
    expect(toolNames).toContain("get_status");
    expect(toolNames).toContain("get_keywords");
    expect(toolNames).toContain("get_insights");
    expect(toolNames).toContain("get_geo");
    expect(toolNames).toContain("get_traffic");
    expect(AGENT_TOOLS).toHaveLength(6);
  });

  it("every tool has a name, description, and input_schema", () => {
    for (const tool of AGENT_TOOLS) {
      expect(typeof tool.name).toBe("string");
      expect(tool.name.length).toBeGreaterThan(0);
      expect(typeof tool.description).toBe("string");
      expect(tool.description.length).toBeGreaterThan(0);
      expect(tool.input_schema).toBeDefined();
      expect(tool.input_schema.type).toBe("object");
    }
  });

  it("tools that need a project_id mark it as required", () => {
    const projectTools = AGENT_TOOLS.filter((t) => t.name !== "list_projects");
    for (const tool of projectTools) {
      expect(tool.input_schema.properties).toHaveProperty("project_id");
      expect(tool.input_schema.required).toContain("project_id");
    }
  });

  it("list_projects has no required parameters", () => {
    const tool = AGENT_TOOLS.find((t) => t.name === "list_projects")!;
    expect(tool.input_schema.required).toHaveLength(0);
  });

  it("get_keywords has an optional limit parameter", () => {
    const tool = AGENT_TOOLS.find((t) => t.name === "get_keywords")!;
    expect(tool.input_schema.properties).toHaveProperty("limit");
    expect(tool.input_schema.required).not.toContain("limit");
  });

  it("get_insights has an optional limit parameter", () => {
    const tool = AGENT_TOOLS.find((t) => t.name === "get_insights")!;
    expect(tool.input_schema.properties).toHaveProperty("limit");
    expect(tool.input_schema.required).not.toContain("limit");
  });
});

// ---- executeTool tests ----

describe("executeTool — list_projects", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns serialized project list", async () => {
    vi.mocked(api.fetchProjects).mockResolvedValue([
      {
        id: "p1",
        name: "Acme",
        domain: "acme.com",
        created_at: "2024-01-01",
        search_console_connected: true,
        google_analytics_connected: false,
        shopify_connected: false,
      },
    ]);

    const result = await executeTool("list_projects", {});
    const parsed = JSON.parse(result);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed[0].name).toBe("Acme");
    expect(parsed[0].domain).toBe("acme.com");
    expect(parsed[0].gsc_connected).toBe(true);
    expect(parsed[0].ga4_connected).toBe(false);
  });

  it("returns 'No projects found.' when list is empty", async () => {
    vi.mocked(api.fetchProjects).mockResolvedValue([]);
    const result = await executeTool("list_projects", {});
    expect(result).toBe("No projects found.");
  });

  it("returns error string when fetchProjects throws", async () => {
    vi.mocked(api.fetchProjects).mockRejectedValue(new Error("Network error"));
    const result = await executeTool("list_projects", {});
    expect(result).toContain("Error");
    expect(result).toContain("list_projects");
  });
});

describe("executeTool — get_keywords", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches keywords for the given project_id", async () => {
    vi.mocked(api.fetchTopKeywords).mockResolvedValue([
      { keyword: "seo tools", position: 5, change: -2, impressions: 1000, clicks: 50 },
    ]);

    const result = await executeTool("get_keywords", { project_id: "p1" });
    const parsed = JSON.parse(result);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed[0].keyword).toBe("seo tools");
    expect(api.fetchTopKeywords).toHaveBeenCalledWith("p1", 20);
  });

  it("respects a custom limit (capped at 50)", async () => {
    vi.mocked(api.fetchTopKeywords).mockResolvedValue([]);
    await executeTool("get_keywords", { project_id: "p1", limit: 100 });
    expect(api.fetchTopKeywords).toHaveBeenCalledWith("p1", 50);
  });

  it("uses default limit of 20 when none provided", async () => {
    vi.mocked(api.fetchTopKeywords).mockResolvedValue([]);
    await executeTool("get_keywords", { project_id: "p1" });
    expect(api.fetchTopKeywords).toHaveBeenCalledWith("p1", 20);
  });
});

describe("executeTool — get_insights", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches insights for the given project_id", async () => {
    vi.mocked(api.fetchInsights).mockResolvedValue([
      { id: "i1", severity: "warning", title: "CTR drop", summary: "CTR dropped 20%", estimated_impact_usd: 0 },
    ]);

    const result = await executeTool("get_insights", { project_id: "p1" });
    const parsed = JSON.parse(result);
    expect(parsed[0].title).toBe("CTR drop");
    expect(api.fetchInsights).toHaveBeenCalledWith("p1", 10);
  });

  it("uses default limit of 10", async () => {
    vi.mocked(api.fetchInsights).mockResolvedValue([]);
    await executeTool("get_insights", { project_id: "p1" });
    expect(api.fetchInsights).toHaveBeenCalledWith("p1", 10);
  });

  it("respects a custom limit", async () => {
    vi.mocked(api.fetchInsights).mockResolvedValue([]);
    await executeTool("get_insights", { project_id: "p1", limit: 5 });
    expect(api.fetchInsights).toHaveBeenCalledWith("p1", 5);
  });
});

describe("executeTool — get_geo", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches GEO metrics for the given project_id", async () => {
    const mockGeo = {
      totalCitations: 42,
      citationRate: 35.5,
      platforms: { ChatGPT: 20, Perplexity: 15, Gemini: 7 },
      hasData: true,
    };
    vi.mocked(api.fetchGEOMetrics).mockResolvedValue(mockGeo);

    const result = await executeTool("get_geo", { project_id: "p1" });
    const parsed = JSON.parse(result);
    expect(parsed.totalCitations).toBe(42);
    expect(parsed.citationRate).toBe(35.5);
    expect(api.fetchGEOMetrics).toHaveBeenCalledWith("p1");
  });
});

describe("executeTool — get_traffic", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches both GSC and GA4 metrics", async () => {
    vi.mocked(api.fetchGSCMetrics).mockResolvedValue({
      clicks: 1000,
      impressions: 50000,
      ctr: 0.02,
      position: 12.5,
      hasData: true,
    });
    vi.mocked(api.fetchGA4Metrics).mockResolvedValue({
      sessions: 800,
      pageviews: 2400,
      bounceRate: 45,
      avgDuration: 180,
      pagesPerSession: 3,
      hasData: true,
    });

    const result = await executeTool("get_traffic", { project_id: "p1" });
    const parsed = JSON.parse(result);
    expect(parsed.gsc.clicks).toBe(1000);
    expect(parsed.ga4.sessions).toBe(800);
  });

  it("includes null for ga4 when it fails", async () => {
    vi.mocked(api.fetchGSCMetrics).mockResolvedValue({
      clicks: 500,
      impressions: 10000,
      ctr: 0.05,
      position: 8,
      hasData: true,
    });
    vi.mocked(api.fetchGA4Metrics).mockRejectedValue(new Error("Not connected"));

    const result = await executeTool("get_traffic", { project_id: "p1" });
    const parsed = JSON.parse(result);
    expect(parsed.gsc).toBeDefined();
    expect(parsed.ga4).toBeNull();
  });
});

describe("executeTool — get_status", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns combined status data as JSON", async () => {
    vi.mocked(api.fetchGSCMetricsWoW).mockResolvedValue({
      current: { clicks: 500, impressions: 10000, ctr: 0.05, position: 8, hasData: true },
      previous: { clicks: 400, impressions: 9000, ctr: 0.044, position: 9, hasData: true },
      delta: {
        clicks: { value: 100, pct: 25 },
        impressions: { value: 1000, pct: 11.1 },
        ctr: { value: 0.006, pct: 13.6 },
        position: { value: -1, pct: -11.1 },
      },
    });
    vi.mocked(api.fetchGA4MetricsWoW).mockRejectedValue(new Error("no data"));
    vi.mocked(api.fetchGEOMetrics).mockRejectedValue(new Error("no data"));
    vi.mocked(api.fetchRankingsSummary).mockResolvedValue({ top3: 5, top10: 20, top20: 40, total: 60 });
    vi.mocked(api.fetchInsights).mockResolvedValue([]);
    vi.mocked(api.fetchTopKeywords).mockResolvedValue([]);

    const result = await executeTool("get_status", { project_id: "p1" });
    const parsed = JSON.parse(result);
    expect(parsed).toHaveProperty("gscWoW");
    expect(parsed).toHaveProperty("rankings");
    expect(parsed.rankings.top3).toBe(5);
    expect(parsed.ga4WoW).toBeNull();
    expect(parsed.geo).toBeNull();
  });
});

describe("executeTool — unknown tool", () => {
  it("returns an unknown tool message", async () => {
    const result = await executeTool("nonexistent_tool", {});
    expect(result).toContain("Unknown tool");
    expect(result).toContain("nonexistent_tool");
  });
});

// ---- Tool chaining simulation ----

describe("multi-tool session simulation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("session accumulates messages across multiple tool calls", async () => {
    const session = createSession();
    setProject(session, "p1", "Test Project");

    // Simulate: user asks → assistant uses tool → tool result → assistant responds
    addUserMessage(session, "How are my rankings?");

    addAssistantMessage(session, [
      { type: "tool_use", id: "t1", name: "get_keywords", input: { project_id: "p1" } },
    ]);

    addToolResults(session, [
      { type: "tool_result", tool_use_id: "t1", content: '[{"keyword":"seo","position":3,"change":-1}]' },
    ]);

    addAssistantMessage(session, [
      { type: "text", text: "Your top keyword 'seo' is at position 3, up 1 from last week." },
    ]);

    const msgs = getMessages(session);
    expect(msgs).toHaveLength(4);
    expect(msgs[0].role).toBe("user");
    expect(msgs[1].role).toBe("assistant");
    expect(msgs[2].role).toBe("user"); // tool results come back as user
    expect(msgs[3].role).toBe("assistant");
  });

  it("session preserves project context across turns", () => {
    const session = createSession();
    setProject(session, "p1", "Aqua Pro Vac");

    addUserMessage(session, "What are my top keywords?");
    addUserMessage(session, "And my traffic?");

    expect(session.currentProjectId).toBe("p1");
    expect(session.currentProjectName).toBe("Aqua Pro Vac");
  });
});
