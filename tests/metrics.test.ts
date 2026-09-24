import { describe, it, expect, vi } from "vitest";

vi.mock("../src/lib/config.js", () => ({
  SUPABASE_URL: "http://localhost",
  SUPABASE_ANON_KEY: "anon",
  loadCredentials: vi.fn(),
  saveCredentials: vi.fn(),
  isTokenExpired: vi.fn(),
}));

import {
  aggregateGA4Days,
  aggregateGSCDays,
  isMeasuredPosition,
  isoDateDaysAgo,
  summarizeRankings,
  windowEndingDaysAgo,
  type KeywordRankingRow,
} from "../src/lib/metrics.js";
import {
  toContentOpportunities,
  toDecliningPages,
  toTopKeywords,
} from "../src/lib/api.js";

const NOW = new Date("2026-09-24T14:00:00Z");

function kw(
  id: string,
  latest: number | null,
  previous: number | null = null,
  volume: number | null = 500
): KeywordRankingRow {
  return {
    id,
    keyword: `kw ${id}`,
    search_volume: volume,
    latest_position: latest,
    latest_url: `https://example.com/${id}`,
    latest_created_at: "2026-09-20T03:00:00Z",
    previous_position: previous,
  };
}

describe("date windows", () => {
  it("counts back in UTC days", () => {
    expect(isoDateDaysAgo(0, NOW)).toBe("2026-09-24");
    expect(isoDateDaysAgo(4, NOW)).toBe("2026-09-20");
  });

  it("builds an inclusive 7-day window that ends before the GSC lag", () => {
    expect(windowEndingDaysAgo(7, 4, NOW)).toEqual({ start: "2026-09-14", end: "2026-09-20" });
    // The previous window abuts it with no overlap and no gap.
    expect(windowEndingDaysAgo(7, 11, NOW)).toEqual({ start: "2026-09-07", end: "2026-09-13" });
  });
});

describe("aggregateGSCDays", () => {
  it("weights position by impressions instead of averaging rows", () => {
    const r = aggregateGSCDays([
      { clicks: 10, impressions: 900, average_position: 5 },
      { clicks: 0, impressions: 100, average_position: 45 },
    ]);
    // A plain row mean would say 25.
    expect(r.position).toBeCloseTo(9);
    expect(r.clicks).toBe(10);
    expect(r.impressions).toBe(1000);
    expect(r.ctr).toBeCloseTo(0.01);
    expect(r.daysMeasured).toBe(2);
    expect(r.hasData).toBe(true);
  });

  it("reports an empty window as unmeasured, not as zero traffic", () => {
    const r = aggregateGSCDays([]);
    expect(r.hasData).toBe(false);
    expect(r.daysMeasured).toBe(0);
  });
});

describe("aggregateGA4Days", () => {
  it("sums site-wide sessions and weights bounce rate by sessions", () => {
    const r = aggregateGA4Days([
      { sessions: 300, metrics: { screenPageViews: 600, bounceRate: 0.5, averageSessionDuration: 100 } },
      { sessions: 100, metrics: { screenPageViews: 100, bounceRate: 0.9, averageSessionDuration: 20 } },
    ]);
    expect(r.sessions).toBe(400);
    expect(r.pageviews).toBe(700);
    expect(r.pagesPerSession).toBeCloseTo(1.75);
    // (0.5*300 + 0.9*100) / 400 = 0.6
    expect(r.bounceRate).toBeCloseTo(60);
    expect(r.avgDuration).toBeCloseTo(80);
  });

  it("falls back to metrics.sessions when the column is null", () => {
    const r = aggregateGA4Days([{ sessions: null, metrics: { sessions: 42 } }]);
    expect(r.sessions).toBe(42);
  });
});

describe("rankings", () => {
  it("treats 101, 0 and null as not ranking", () => {
    expect(isMeasuredPosition(101)).toBe(false);
    expect(isMeasuredPosition(0)).toBe(false);
    expect(isMeasuredPosition(null)).toBe(false);
    expect(isMeasuredPosition(100)).toBe(true);
    expect(isMeasuredPosition(1)).toBe(true);
  });

  it("summarizes every tracked keyword, counting only measured positions in bands", () => {
    const s = summarizeRankings([kw("a", 2), kw("b", 8), kw("c", 15), kw("d", 101), kw("e", null)]);
    expect(s).toEqual({ top3: 1, top10: 2, top20: 3, ranking: 3, total: 5 });
  });

  it("top keywords drop the sentinel and ignore a sentinel previous position", () => {
    const top = toTopKeywords([kw("a", 7, 101), kw("b", 101, 9), kw("c", 3, 5)], 5);
    expect(top.map((t) => t.keyword)).toEqual(["kw c", "kw a"]);
    expect(top[0].change).toBe(-2);
    expect(top[1].previousPosition).toBeNull();
    expect(top[1].change).toBeNull();
  });

  it("content opportunities are 11..100 with >100 searches, by volume", () => {
    const ops = toContentOpportunities(
      [kw("a", 12, null, 900), kw("b", 5, null, 5000), kw("c", 101, null, 9000), kw("d", 40, null, 50), kw("e", 30, null, 2000)],
      10
    );
    expect(ops.map((o) => o.keywordId)).toEqual(["e", "a"]);
  });

  it("declining pages need two measured positions", () => {
    const d = toDecliningPages([kw("a", 20, 5), kw("b", 101, 4), kw("c", 6, 5), kw("d", 12, 8)], 3);
    expect(d.map((p) => [p.keywordId, p.positionChange])).toEqual([["a", 15], ["d", 4]]);
    expect(d[0].latestCheckDate).toBe("2026-09-20");
  });
});
