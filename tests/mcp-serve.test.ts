/**
 * Tests for MCP server tool definitions (no network calls needed).
 * We test the tool list shape and the JSON-RPC scaffolding without
 * starting the server loop.
 */

import { describe, it, expect } from "vitest";

// Re-export TOOLS from mcp-serve so we can inspect them in tests.
// We import the module directly; the server loop only starts when
// mcpServeCommand() is called explicitly.
import { TOOLS } from "../src/commands/mcp-serve.js";

describe("MCP server tool definitions", () => {
  const toolNames = TOOLS.map((t) => t.name);

  it("exposes exactly 5 tools", () => {
    expect(TOOLS.length).toBe(5);
  });

  it("includes all required tool names", () => {
    expect(toolNames).toContain("ezeo_project_status");
    expect(toolNames).toContain("ezeo_keywords");
    expect(toolNames).toContain("ezeo_geo_report");
    expect(toolNames).toContain("ezeo_recommendations");
    expect(toolNames).toContain("ezeo_competitors");
  });

  it("each tool has a name, description, and inputSchema", () => {
    for (const tool of TOOLS) {
      expect(tool.name).toBeTruthy();
      expect(tool.description.length).toBeGreaterThan(10);
      expect(tool.inputSchema).toBeDefined();
      expect(tool.inputSchema.type).toBe("object");
      expect(tool.inputSchema.properties).toBeDefined();
    }
  });

  it("ezeo_project_status accepts an optional 'project' argument", () => {
    const tool = TOOLS.find((t) => t.name === "ezeo_project_status");
    expect(tool?.inputSchema.properties).toHaveProperty("project");
  });

  it("ezeo_keywords accepts 'project' and 'limit' arguments", () => {
    const tool = TOOLS.find((t) => t.name === "ezeo_keywords");
    expect(tool?.inputSchema.properties).toHaveProperty("project");
    expect(tool?.inputSchema.properties).toHaveProperty("limit");
  });

  it("ezeo_geo_report accepts 'days' argument", () => {
    const tool = TOOLS.find((t) => t.name === "ezeo_geo_report");
    expect(tool?.inputSchema.properties).toHaveProperty("days");
  });

  it("no tool marks arguments as required (all optional for easy use)", () => {
    for (const tool of TOOLS) {
      // required array should be absent or empty — all args are optional
      const req = tool.inputSchema.required ?? [];
      expect(req.length).toBe(0);
    }
  });

  it("tool definitions serialize to valid JSON (for MCP tools/list response)", () => {
    const json = JSON.stringify({ tools: TOOLS });
    expect(() => JSON.parse(json)).not.toThrow();
    const parsed = JSON.parse(json) as { tools: typeof TOOLS };
    expect(parsed.tools.length).toBe(TOOLS.length);
  });
});
