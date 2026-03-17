import { describe, it, expect } from "vitest";
import {
  formatTip,
  formatSuggestions,
  formatWelcomeTips,
  formatCompare,
  formatChatResponse,
  formatError,
  formatProjectList,
  formatInsights,
  greeting,
  logo,
} from "../src/lib/formatter.js";
import type { Project, GSCMetricsWoW, GA4MetricsWoW } from "../src/lib/api.js";

const mockProject: Project = {
  id: "test-id",
  name: "Acme Corp",
  domain: "acme.com",
  search_console_connected: true,
  google_analytics_connected: true,
  shopify_connected: false,
};

describe("logo", () => {
  it("returns brand name", () => {
    expect(logo()).toContain("Ezeo");
  });
});

describe("greeting", () => {
  it("includes email and project count", () => {
    const result = greeting("test@example.com", 3);
    expect(result).toContain("test@example.com");
    expect(result).toContain("3");
  });
});

describe("formatTip", () => {
  it("formats a tip with lightbulb", () => {
    const result = formatTip("Try this command");
    expect(result).toContain("Try this command");
  });
});

describe("formatSuggestions", () => {
  it("shows no-action message when empty", () => {
    const result = formatSuggestions(mockProject, []);
    expect(result).toContain("healthy");
    expect(result).toContain("Acme Corp");
  });

  it("formats multiple suggestions", () => {
    const suggestions = [
      "Traffic dropped 15% WoW.",
      "CTR is below 2%.",
      "No AI citations detected.",
    ];
    const result = formatSuggestions(mockProject, suggestions);
    expect(result).toContain("Traffic dropped");
    expect(result).toContain("CTR is below");
    expect(result).toContain("No AI citations");
    expect(result).toContain("Acme Corp");
  });
});

describe("formatWelcomeTips", () => {
  it("includes quick start commands", () => {
    const result = formatWelcomeTips();
    expect(result).toContain("status");
    expect(result).toContain("traffic");
    expect(result).toContain("suggest");
    expect(result).toContain("geo");
  });
});

describe("formatCompare", () => {
  it("handles no data", () => {
    const gsc: GSCMetricsWoW = {
      current: { clicks: 0, impressions: 0, ctr: 0, position: 0, hasData: false },
      previous: { clicks: 0, impressions: 0, ctr: 0, position: 0, hasData: false },
      delta: { clicks: { value: 0, pct: null }, impressions: { value: 0, pct: null }, ctr: { value: 0, pct: null }, position: { value: 0, pct: null } },
    };
    const ga4: GA4MetricsWoW = {
      current: { sessions: 0, pageviews: 0, pagesPerSession: 0, bounceRate: 0, avgDuration: 0, hasData: false },
      previous: { sessions: 0, pageviews: 0, pagesPerSession: 0, bounceRate: 0, avgDuration: 0, hasData: false },
      delta: { sessions: { value: 0, pct: null }, pageviews: { value: 0, pct: null }, bounceRate: { value: 0, pct: null } },
    };
    const result = formatCompare(mockProject, gsc, ga4);
    expect(result).toContain("No data available");
  });

  it("shows comparison when data exists", () => {
    const gsc: GSCMetricsWoW = {
      current: { clicks: 150, impressions: 5000, ctr: 0.03, position: 12.5, hasData: true },
      previous: { clicks: 100, impressions: 4000, ctr: 0.025, position: 15.0, hasData: true },
      delta: { clicks: { value: 50, pct: 50 }, impressions: { value: 1000, pct: 25 }, ctr: { value: 0.005, pct: 20 }, position: { value: -2.5, pct: -16.6 } },
    };
    const ga4: GA4MetricsWoW = {
      current: { sessions: 200, pageviews: 500, pagesPerSession: 2.5, bounceRate: 45, avgDuration: 120, hasData: true },
      previous: { sessions: 180, pageviews: 450, pagesPerSession: 2.5, bounceRate: 50, avgDuration: 100, hasData: true },
      delta: { sessions: { value: 20, pct: 11.1 }, pageviews: { value: 50, pct: 11.1 }, bounceRate: { value: -5, pct: -10 } },
    };
    const result = formatCompare(mockProject, gsc, ga4);
    expect(result).toContain("Search Console");
    expect(result).toContain("Analytics");
    expect(result).toContain("Clicks");
    expect(result).toContain("Sessions");
  });
});

describe("formatChatResponse", () => {
  it("wraps text with brand color", () => {
    const result = formatChatResponse("Hello world");
    expect(result).toContain("Hello world");
  });
});

describe("formatError", () => {
  it("formats error message", () => {
    const result = formatError("Something broke");
    expect(result).toContain("Something broke");
    expect(result).toContain("Error");
  });
});

describe("formatProjectList", () => {
  it("shows empty message for no projects", () => {
    const result = formatProjectList([]);
    expect(result).toContain("No projects found");
  });

  it("formats project list with connection status", () => {
    const result = formatProjectList([mockProject]);
    expect(result).toContain("Acme Corp");
    expect(result).toContain("acme.com");
  });
});

describe("formatInsights", () => {
  it("shows empty message for no insights", () => {
    const result = formatInsights([]);
    expect(result).toContain("No recent insights");
  });

  it("formats insights with severity icons", () => {
    const insights = [
      { id: "1", title: "Traffic dropped", summary: "Clicks down 20%", severity: "high", created_at: new Date().toISOString(), project_id: "1" },
      { id: "2", title: "New keyword found", summary: "Ranking for test", severity: "low", created_at: new Date().toISOString(), project_id: "1" },
    ];
    const result = formatInsights(insights);
    expect(result).toContain("Traffic dropped");
    expect(result).toContain("New keyword found");
  });
});
