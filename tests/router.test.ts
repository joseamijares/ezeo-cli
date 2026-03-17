import { describe, it, expect } from "vitest";
import { classifyIntent } from "../src/lib/router.js";

describe("classifyIntent", () => {
  // Exit
  it.each(["exit", "quit", "bye", "q", ":q"])("recognizes exit: %s", (input) => {
    expect(classifyIntent(input).type).toBe("exit");
  });

  // Help
  it.each(["help", "commands", "?", "h"])("recognizes help: %s", (input) => {
    expect(classifyIntent(input).type).toBe("help");
  });

  // Projects
  it.each(["projects", "project", "list projects", "show projects", "my projects"])(
    "recognizes projects: %s",
    (input) => {
      expect(classifyIntent(input).type).toBe("projects");
    }
  );

  // Status
  it.each(["status", "dashboard", "overview", "summary"])(
    "recognizes status: %s",
    (input) => {
      expect(classifyIntent(input).type).toBe("status");
    }
  );

  it("extracts project from status", () => {
    const intent = classifyIntent("status AquaProVac");
    expect(intent.type).toBe("status");
    if (intent.type === "status") {
      expect(intent.project).toBe("aquaprovac"); // lowercased for fuzzy matching
    }
  });

  it("handles natural language status", () => {
    expect(classifyIntent("how's everything").type).toBe("status");
  });

  it("handles 'how's [project] doing'", () => {
    const intent = classifyIntent("how's aquaprovac doing");
    expect(intent.type).toBe("status");
  });

  // Traffic
  it.each(["traffic", "clicks", "impressions", "ctr", "gsc", "ga4", "analytics", "sessions", "visitors", "pageviews"])(
    "recognizes traffic: %s",
    (input) => {
      expect(classifyIntent(input).type).toBe("traffic");
    }
  );

  it("extracts project from traffic", () => {
    const intent = classifyIntent("traffic for AquaProVac");
    expect(intent.type).toBe("traffic");
    if (intent.type === "traffic") {
      expect(intent.project).toBe("AquaProVac");
    }
  });

  // Rankings
  it.each(["rankings", "ranking", "positions", "rank", "serp", "serps"])(
    "recognizes rankings: %s",
    (input) => {
      expect(classifyIntent(input).type).toBe("rankings");
    }
  );

  it("handles 'where do I rank'", () => {
    expect(classifyIntent("where do i rank").type).toBe("rankings");
  });

  // GEO
  it.each(["geo", "ai visibility", "citations", "cited", "perplexity", "chatgpt", "copilot", "llm"])(
    "recognizes geo: %s",
    (input) => {
      expect(classifyIntent(input).type).toBe("geo");
    }
  );

  // Insights
  it.each(["insights", "alerts", "issues", "problems", "warnings"])(
    "recognizes insights: %s",
    (input) => {
      expect(classifyIntent(input).type).toBe("insights");
    }
  );

  it.each(["whats wrong", "whats new", "anything new", "updates"])(
    "recognizes insights from natural language: %s",
    (input) => {
      expect(classifyIntent(input).type).toBe("insights");
    }
  );

  // Keywords
  it.each(["keywords", "keyword", "tracked keywords", "kws", "queries", "search terms", "top queries"])(
    "recognizes keywords: %s",
    (input) => {
      expect(classifyIntent(input).type).toBe("keywords");
    }
  );

  // Competitors
  it.each(["competitors", "competition", "competitive"])(
    "recognizes competitors: %s",
    (input) => {
      expect(classifyIntent(input).type).toBe("competitors");
    }
  );

  // CRO
  it.each(["cro", "conversion", "optimization"])(
    "recognizes cro: %s",
    (input) => {
      expect(classifyIntent(input).type).toBe("cro");
    }
  );

  // Switch
  it("recognizes switch project", () => {
    const intent = classifyIntent("switch to AquaProVac");
    expect(intent.type).toBe("switch");
    if (intent.type === "switch") {
      expect(intent.project).toBe("AquaProVac");
    }
  });

  it("recognizes 'use' as switch", () => {
    const intent = classifyIntent("use Gutter");
    expect(intent.type).toBe("switch");
    if (intent.type === "switch") {
      expect(intent.project).toBe("Gutter");
    }
  });

  // Compare
  it.each(["compare", "comparison", "week over week", "wow", "trend"])(
    "recognizes compare: %s",
    (input) => {
      expect(classifyIntent(input).type).toBe("compare");
    }
  );

  // Suggest
  it.each(["suggest", "recommendations", "what should I do", "next steps", "action items", "tips", "quick wins"])(
    "recognizes suggest: %s",
    (input) => {
      expect(classifyIntent(input).type).toBe("suggest");
    }
  );

  // Audit
  it("recognizes audit with URL", () => {
    const intent = classifyIntent("audit aquaprovac.com");
    expect(intent.type).toBe("audit");
    if (intent.type === "audit") {
      expect(intent.url).toBe("aquaprovac.com");
    }
  });

  // Image
  it("recognizes image command", () => {
    const intent = classifyIntent("image hero banner");
    expect(intent.type).toBe("image");
  });

  // Typo tolerance (fuzzy matching)
  it("handles typos: 'staus' -> status", () => {
    expect(classifyIntent("staus").type).toBe("status");
  });

  it("handles typos: 'trafic' -> traffic", () => {
    expect(classifyIntent("trafic").type).toBe("traffic");
  });

  it("handles typos: 'rannkings' -> rankings", () => {
    expect(classifyIntent("rannkings").type).toBe("rankings");
  });

  // Unknown with suggestion
  it("returns unknown for unrecognized input", () => {
    const intent = classifyIntent("banana phone");
    expect(intent.type).toBe("unknown");
  });

  it("provides suggestion for close matches", () => {
    const intent = classifyIntent("statuss");
    if (intent.type === "unknown") {
      expect(intent.suggestion).toBeDefined();
    }
  });

  // Empty input
  it("returns help for empty input", () => {
    expect(classifyIntent("").type).toBe("help");
  });

  it("returns help for whitespace", () => {
    expect(classifyIntent("   ").type).toBe("help");
  });

  // Multi-word natural language with project
  it("handles 'search console for aqua'", () => {
    const intent = classifyIntent("search console for aqua");
    expect(intent.type).toBe("traffic");
  });

  it("handles 'ai visibility for gutterprovac'", () => {
    const intent = classifyIntent("ai visibility for gutterprovac");
    expect(intent.type).toBe("geo");
  });

  // Case insensitive
  it("is case insensitive", () => {
    expect(classifyIntent("STATUS").type).toBe("status");
    expect(classifyIntent("Traffic").type).toBe("traffic");
    expect(classifyIntent("GEO").type).toBe("geo");
  });
});
