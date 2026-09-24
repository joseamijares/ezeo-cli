import { describe, it, expect } from "vitest";
import {
  clampRequestCount,
  requestArticlesErrorCopy,
  summarizeRequestArticles,
} from "../src/lib/articles.js";

describe("clampRequestCount", () => {
  it("mirrors the RPC's [1, 10] clamp", () => {
    expect(clampRequestCount(0)).toBe(1);
    expect(clampRequestCount(NaN)).toBe(1);
    expect(clampRequestCount(3.7)).toBe(3);
    expect(clampRequestCount(25)).toBe(10);
  });
});

describe("requestArticlesErrorCopy", () => {
  it("strips nested function-name prefixes", () => {
    expect(
      requestArticlesErrorCopy(
        "request_content_articles: approve_topic: automation not enabled or allowance exhausted for project x"
      )
    ).toBe("automation not enabled or allowance exhausted for project x");
  });
});

describe("summarizeRequestArticles", () => {
  it("reports created runs as started", () => {
    const s = summarizeRequestArticles({ ok: true, iso_week: "2026-W39", created: 2, run_ids: ["a", "b"] });
    expect(s.tone).toBe("started");
    expect(s.headline).toMatch(/^2 articles started for 2026-W39\./);
  });

  it("never calls existing runs 'started'", () => {
    const s = summarizeRequestArticles({ ok: true, created: 0, run_ids: [], existing_run_ids: ["a"] });
    expect(s.tone).toBe("nothing_new");
    expect(s.details[0]).toMatch(/1 topic already had a run/);
  });

  it("lists every skipped topic with its reason, prefix stripped", () => {
    const s = summarizeRequestArticles({
      ok: false,
      created: 0,
      skipped: [{ rank: 2, reason: "approve_topic: allowance exhausted" }],
    });
    expect(s.details).toContain("Skipped topic #2: allowance exhausted");
  });

  it("explains a missing cycle", () => {
    const s = summarizeRequestArticles({ ok: false, reason: "no_cycle", detail: { why: "x" } });
    expect(s.headline).toMatch(/No topics could be prepared/);
    expect(s.details[0]).toContain('{"why":"x"}');
  });
});
