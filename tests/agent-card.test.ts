import { describe, it, expect } from "vitest";
import { buildAgentCard } from "../src/commands/agent-card.js";

describe("buildAgentCard", () => {
  it("returns an object with the required A2A fields", () => {
    const card = buildAgentCard();
    expect(card).toHaveProperty("name");
    expect(card).toHaveProperty("description");
    expect(card).toHaveProperty("url");
    expect(card).toHaveProperty("version");
    expect(card).toHaveProperty("capabilities");
    expect(card).toHaveProperty("authentication");
    expect(card).toHaveProperty("endpoints");
  });

  it("has the correct agent name and URL", () => {
    const card = buildAgentCard();
    expect(card.name).toBe("Ezeo SEO Agent");
    expect(card.url).toBe("https://ezeo.ai");
  });

  it("has all expected capabilities", () => {
    const card = buildAgentCard();
    expect(card.capabilities).toContain("seo-analysis");
    expect(card.capabilities).toContain("geo-visibility-monitoring");
    expect(card.capabilities).toContain("keyword-tracking");
    expect(card.capabilities).toContain("content-recommendations");
    expect(card.capabilities).toContain("competitor-analysis");
    expect(card.capabilities).toContain("pagespeed-monitoring");
    expect(card.capabilities.length).toBe(6);
  });

  it("has api-key authentication", () => {
    const card = buildAgentCard();
    expect(card.authentication.type).toBe("api-key");
    expect(card.authentication.description).toMatch(/ezeo\.ai/i);
  });

  it("has the three required endpoints", () => {
    const card = buildAgentCard();
    const names = card.endpoints.map((e) => e.name);
    expect(names).toContain("analyze");
    expect(names).toContain("status");
    expect(names).toContain("keywords");
    expect(card.endpoints.length).toBe(3);
  });

  it("analyze endpoint uses POST method", () => {
    const card = buildAgentCard();
    const analyze = card.endpoints.find((e) => e.name === "analyze");
    expect(analyze?.method).toBe("POST");
  });

  it("status and keywords endpoints use GET method", () => {
    const card = buildAgentCard();
    const status = card.endpoints.find((e) => e.name === "status");
    const keywords = card.endpoints.find((e) => e.name === "keywords");
    expect(status?.method).toBe("GET");
    expect(keywords?.method).toBe("GET");
  });

  it("serializes to valid JSON", () => {
    const card = buildAgentCard();
    const json = JSON.stringify(card, null, 2);
    expect(() => JSON.parse(json)).not.toThrow();
    const parsed = JSON.parse(json);
    expect(parsed.name).toBe(card.name);
  });

  it("version matches package version format", () => {
    const card = buildAgentCard();
    expect(card.version).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
