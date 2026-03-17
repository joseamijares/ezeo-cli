import { describe, it, expect } from "vitest";
import { classifyIntent, type Intent } from "../src/lib/router.js";

describe("classifyIntent", () => {
  // Exit
  it.each(["exit", "quit", "bye", "q", "EXIT", "Quit"])(
    'classifies "%s" as exit',
    (input) => {
      expect(classifyIntent(input)).toEqual({ type: "exit" });
    }
  );

  // Help
  it.each(["help", "commands", "?", "HELP"])(
    'classifies "%s" as help',
    (input) => {
      expect(classifyIntent(input)).toEqual({ type: "help" });
    }
  );

  it("returns help for empty input", () => {
    expect(classifyIntent("")).toEqual({ type: "help" });
    expect(classifyIntent("  ")).toEqual({ type: "help" });
  });

  // Projects
  it.each(["projects", "project", "list projects", "show projects"])(
    'classifies "%s" as projects',
    (input) => {
      expect(classifyIntent(input)).toEqual({ type: "projects" });
    }
  );

  // Status
  it("classifies 'status' as status", () => {
    expect(classifyIntent("status")).toEqual({ type: "status" });
  });

  it("classifies 'dashboard' as status", () => {
    expect(classifyIntent("dashboard")).toEqual({ type: "status" });
  });

  it("classifies 'how's everything' as status", () => {
    expect(classifyIntent("how's everything")).toEqual({ type: "status" });
  });

  it("classifies 'how's AquaProVac' as status with project", () => {
    const result = classifyIntent("how's AquaProVac");
    expect(result.type).toBe("status");
    expect((result as Extract<Intent, { type: "status" }>).project).toBe("AquaProVac");
  });

  it("classifies 'status of aqua' as status with project", () => {
    const result = classifyIntent("status of aqua");
    expect(result.type).toBe("status");
    expect((result as Extract<Intent, { type: "status" }>).project).toBe("aqua");
  });

  // Traffic
  it("classifies 'traffic' as traffic", () => {
    expect(classifyIntent("traffic")).toEqual({ type: "traffic", project: undefined });
  });

  it("classifies 'clicks for aqua' as traffic with project", () => {
    const result = classifyIntent("clicks for aqua");
    expect(result.type).toBe("traffic");
    expect((result as Extract<Intent, { type: "traffic" }>).project).toBe("aqua");
  });

  it("classifies 'search console' as traffic", () => {
    expect(classifyIntent("search console").type).toBe("traffic");
  });

  // Rankings
  it.each(["rankings", "positions", "top keywords", "keyword rankings"])(
    'classifies "%s" as rankings',
    (input) => {
      expect(classifyIntent(input).type).toBe("rankings");
    }
  );

  it("classifies 'rankings for gutter' as rankings with project", () => {
    const result = classifyIntent("rankings for gutter");
    expect(result.type).toBe("rankings");
    expect((result as Extract<Intent, { type: "rankings" }>).project).toBe("gutter");
  });

  // GEO
  it.each(["geo", "ai visibility", "citations", "perplexity", "chatgpt"])(
    'classifies "%s" as geo',
    (input) => {
      expect(classifyIntent(input).type).toBe("geo");
    }
  );

  // Insights
  it.each(["insights", "alerts", "issues", "what's wrong", "what's new"])(
    'classifies "%s" as insights',
    (input) => {
      expect(classifyIntent(input).type).toBe("insights");
    }
  );

  // CRO
  it.each(["cro", "conversion", "optimization"])(
    'classifies "%s" as cro',
    (input) => {
      expect(classifyIntent(input).type).toBe("cro");
    }
  );

  // Image
  it("classifies 'image hero banner' as image with description", () => {
    const result = classifyIntent("image hero banner");
    expect(result.type).toBe("image");
    expect((result as Extract<Intent, { type: "image" }>).description).toBe("hero banner");
  });

  // Keywords
  it("classifies 'keywords' as keywords", () => {
    expect(classifyIntent("keywords").type).toBe("keywords");
  });

  // Competitors
  it("classifies 'competitors' as competitors", () => {
    expect(classifyIntent("competitors").type).toBe("competitors");
  });

  // Audit
  it("classifies 'audit https://example.com' as audit with url", () => {
    const result = classifyIntent("audit https://example.com");
    expect(result.type).toBe("audit");
    expect((result as Extract<Intent, { type: "audit" }>).url).toBe("https://example.com");
  });

  // Unknown
  it("classifies gibberish as unknown", () => {
    const result = classifyIntent("asdfghjkl");
    expect(result.type).toBe("unknown");
    expect((result as Extract<Intent, { type: "unknown" }>).raw).toBe("asdfghjkl");
  });

  it("trims whitespace", () => {
    expect(classifyIntent("  status  ")).toEqual({ type: "status" });
  });
});
