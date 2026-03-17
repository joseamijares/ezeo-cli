import { describe, it, expect } from "vitest";
import { changeIndicator } from "../src/commands/keywords.js";

describe("changeIndicator", () => {
  it("returns NEW for null (no previous data)", () => {
    const result = changeIndicator(null);
    // Strip ANSI color codes for comparison
    const plain = result.replace(/\x1B\[[0-9;]*m/g, "");
    expect(plain).toBe("NEW");
  });

  it("returns an up arrow for negative change (improved)", () => {
    const result = changeIndicator(-5);
    const plain = result.replace(/\x1B\[[0-9;]*m/g, "");
    expect(plain).toContain("▲");
    expect(plain).toContain("5");
  });

  it("returns a down arrow for positive change (dropped)", () => {
    const result = changeIndicator(3);
    const plain = result.replace(/\x1B\[[0-9;]*m/g, "");
    expect(plain).toContain("▼");
    expect(plain).toContain("3");
  });

  it("returns em-dash for zero change (unchanged)", () => {
    const result = changeIndicator(0);
    const plain = result.replace(/\x1B\[[0-9;]*m/g, "");
    expect(plain).toBe("—");
  });

  it("abs value is used for negative (e.g. -10 shows '10' not '-10')", () => {
    const result = changeIndicator(-10);
    const plain = result.replace(/\x1B\[[0-9;]*m/g, "");
    expect(plain).toContain("10");
    expect(plain).not.toContain("-10");
  });
});

describe("fetchTopKeywords RPC position filter logic", () => {
  // Test the pure filter+map logic extracted from fetchTopKeywords
  function applyRpcMapping(
    rows: Array<{ keyword: string; position: unknown; previous_position: unknown }>
  ) {
    return rows
      .filter((row) => Number(row.position) <= 100)
      .map((row) => {
        const pos = Number(row.position);
        const prevPos =
          row.previous_position != null && Number(row.previous_position) > 0
            ? Number(row.previous_position)
            : null;
        return {
          keyword: row.keyword,
          position: pos,
          previousPosition: prevPos,
          change: prevPos != null ? pos - prevPos : null,
        };
      });
  }

  it("filters out positions > 100", () => {
    const rows = [
      { keyword: "seo tips", position: 45, previous_position: 50 },
      { keyword: "invisible keyword", position: 101, previous_position: 105 },
      { keyword: "another invisible", position: 200, previous_position: null },
    ];
    const result = applyRpcMapping(rows);
    expect(result).toHaveLength(1);
    expect(result[0].keyword).toBe("seo tips");
  });

  it("keeps positions exactly at 100", () => {
    const rows = [{ keyword: "borderline", position: 100, previous_position: null }];
    const result = applyRpcMapping(rows);
    expect(result).toHaveLength(1);
  });

  it("computes change correctly (improvement)", () => {
    const rows = [{ keyword: "seo tips", position: 8, previous_position: 15 }];
    const result = applyRpcMapping(rows);
    expect(result[0].change).toBe(-7); // moved up 7 positions
  });

  it("computes change correctly (drop)", () => {
    const rows = [{ keyword: "seo tips", position: 20, previous_position: 10 }];
    const result = applyRpcMapping(rows);
    expect(result[0].change).toBe(10); // dropped 10 positions
  });

  it("sets change to null when previous_position is null", () => {
    const rows = [{ keyword: "new keyword", position: 42, previous_position: null }];
    const result = applyRpcMapping(rows);
    expect(result[0].previousPosition).toBeNull();
    expect(result[0].change).toBeNull();
  });

  it("sets change to null when previous_position is 0 (invalid)", () => {
    const rows = [{ keyword: "bad data", position: 30, previous_position: 0 }];
    const result = applyRpcMapping(rows);
    expect(result[0].previousPosition).toBeNull();
    expect(result[0].change).toBeNull();
  });

  it("handles string-coerced number values from RPC", () => {
    const rows = [{ keyword: "coerced", position: "15", previous_position: "20" }];
    const result = applyRpcMapping(rows);
    expect(result[0].position).toBe(15);
    expect(result[0].previousPosition).toBe(20);
    expect(result[0].change).toBe(-5);
  });
});
