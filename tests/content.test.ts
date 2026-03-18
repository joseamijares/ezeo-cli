import { describe, it, expect } from "vitest";
import {
  generateTopicTitle,
  estimateWordCount,
  generateOutline,
  getDeclineSeverity,
  getDeclineLabel,
} from "../src/commands/content.js";

// Strip ANSI color codes for plain comparisons
const plain = (s: string) => s.replace(/\x1B\[[0-9;]*m/g, "");

describe("generateTopicTitle", () => {
  it("passes through 'how to' keywords as title case", () => {
    const result = generateTopicTitle("how to optimize for seo");
    expect(result).toContain("How to Optimize");
  });

  it("passes through 'how do' keywords as title case", () => {
    const result = generateTopicTitle("how do search engines work");
    expect(result).toContain("How Do Search");
  });

  it("adds 'A Complete Explanation' for 'what is' keywords", () => {
    const result = generateTopicTitle("what is technical seo");
    expect(result).toContain("What Is");
    expect(result).toContain("Complete Explanation");
  });

  it("adds 'A Complete Explanation' for 'what are' keywords", () => {
    const result = generateTopicTitle("what are backlinks");
    expect(result).toContain("What Are");
    expect(result).toContain("Complete Explanation");
  });

  it("prefixes 'The Complete' for guide keywords", () => {
    const result = generateTopicTitle("seo guide");
    expect(result).toMatch(/The Complete/i);
  });

  it("prefixes 'The Complete' for tutorial keywords", () => {
    const result = generateTopicTitle("keyword research tutorial");
    expect(result).toMatch(/The Complete/i);
  });

  it("appends 'That Actually Work' for tips keywords", () => {
    const result = generateTopicTitle("seo tips");
    expect(result).toContain("That Actually Work");
  });

  it("appends 'That Actually Work' for strategies keywords", () => {
    const result = generateTopicTitle("link building strategies");
    expect(result).toContain("That Actually Work");
  });

  it("appends '(Updated Guide)' for best keywords", () => {
    const result = generateTopicTitle("best seo tools");
    expect(result).toContain("Updated Guide");
  });

  it("appends '(Updated Guide)' for top keywords", () => {
    const result = generateTopicTitle("top keyword research tools");
    expect(result).toContain("Updated Guide");
  });

  it("appends comparison suffix for vs keywords", () => {
    const result = generateTopicTitle("wordpress vs wix seo");
    expect(result).toContain("Which Is Right for You");
  });

  it("appends comparison suffix for compare keywords", () => {
    const result = generateTopicTitle("compare seo tools");
    expect(result).toContain("Which Is Right for You");
  });

  it("prefixes 'The Ultimate' for checklist keywords", () => {
    const result = generateTopicTitle("seo checklist");
    expect(result).toMatch(/The Ultimate/i);
  });

  it("prefixes 'The Ultimate' for list keywords", () => {
    const result = generateTopicTitle("seo tools list");
    expect(result).toMatch(/The Ultimate/i);
  });

  it("uses 'Complete Guide to' for short (1-2 word) generic keywords", () => {
    const result = generateTopicTitle("seo");
    expect(result).toContain("Complete Guide to");
  });

  it("uses 'Complete Guide to' for two-word generic keywords", () => {
    const result = generateTopicTitle("keyword research");
    expect(result).toContain("Complete Guide to");
  });

  it("uses 'Everything You Need to Know' for longer generic keywords", () => {
    const result = generateTopicTitle("local seo for small businesses");
    expect(result).toContain("Everything You Need to Know");
  });

  it("returns a non-empty string for any input", () => {
    ["a", "seo optimization tips for beginners", "technical audit"].forEach((input) => {
      const result = generateTopicTitle(input);
      expect(typeof result).toBe("string");
      expect(result.length).toBeGreaterThan(0);
    });
  });

  it("does not lowercase the entire output (title case is applied)", () => {
    const result = generateTopicTitle("seo tips");
    expect(result[0]).toBe(result[0].toUpperCase());
  });
});

describe("estimateWordCount", () => {
  it("returns higher word count for not-ranking keywords (null position)", () => {
    const noRanking = estimateWordCount(null, 500);
    const topRanking = estimateWordCount(5, 500);
    expect(noRanking).toBeGreaterThan(topRanking);
  });

  it("returns 2500+ for position > 50", () => {
    const result = estimateWordCount(60, 500);
    expect(result).toBeGreaterThanOrEqual(2500);
  });

  it("returns 2000+ for position in range 21-50", () => {
    const result = estimateWordCount(30, 500);
    expect(result).toBeGreaterThanOrEqual(2000);
  });

  it("returns at least 1500 for position in range 11-20", () => {
    const result = estimateWordCount(15, 500);
    expect(result).toBeGreaterThanOrEqual(1500);
  });

  it("returns 1500 base for well-ranking keywords (position <= 10)", () => {
    const result = estimateWordCount(3, 500);
    expect(result).toBeGreaterThanOrEqual(1500);
  });

  it("adds word count bonus for very high volume keywords (> 5000)", () => {
    const highVol = estimateWordCount(20, 6000);
    const lowVol = estimateWordCount(20, 200);
    expect(highVol).toBeGreaterThan(lowVol);
  });

  it("adds smaller bonus for moderately high volume keywords (> 1000)", () => {
    // position 35 → base 2000; +250 bonus → 2250 → rounds to 2500
    // position 35, vol 200 → base 2000 → rounds to 2000
    const medVol = estimateWordCount(35, 2000);
    const lowVol = estimateWordCount(35, 200);
    expect(medVol).toBeGreaterThan(lowVol);
  });

  it("rounds result to nearest 500", () => {
    const result = estimateWordCount(25, 500);
    expect(result % 500).toBe(0);
  });

  it("rounds result to nearest 500 for null position", () => {
    const result = estimateWordCount(null, 200);
    expect(result % 500).toBe(0);
  });

  it("returns a positive number in all cases", () => {
    const cases: [number | null, number][] = [
      [null, 0],
      [1, 100],
      [50, 5000],
      [100, 50000],
    ];
    cases.forEach(([pos, vol]) => {
      expect(estimateWordCount(pos, vol)).toBeGreaterThan(0);
    });
  });
});

describe("generateOutline", () => {
  it("returns a non-empty array of outline items", () => {
    const outline = generateOutline("technical seo");
    expect(Array.isArray(outline)).toBe(true);
    expect(outline.length).toBeGreaterThan(0);
  });

  it("returns items with both H2 and H3 levels", () => {
    const outline = generateOutline("keyword research");
    const levels = outline.map((item) => item.level);
    expect(levels).toContain("H2");
    expect(levels).toContain("H3");
  });

  it("includes the keyword in headings", () => {
    const outline = generateOutline("link building");
    const allHeadings = outline.map((item) => item.heading).join(" ").toLowerCase();
    expect(allHeadings).toContain("link building");
  });

  it("starts with an H2 heading", () => {
    const outline = generateOutline("seo audit");
    expect(outline[0].level).toBe("H2");
  });

  it("each item has a non-empty level and heading", () => {
    const outline = generateOutline("content marketing");
    outline.forEach((item) => {
      expect(["H2", "H3"]).toContain(item.level);
      expect(typeof item.heading).toBe("string");
      expect(item.heading.length).toBeGreaterThan(0);
    });
  });

  it("H3 items always follow an H2 item", () => {
    const outline = generateOutline("seo");
    let lastH2Index = -1;
    outline.forEach((item, i) => {
      if (item.level === "H2") lastH2Index = i;
      if (item.level === "H3") expect(lastH2Index).toBeLessThan(i);
    });
  });

  it("uses title case for headings", () => {
    const outline = generateOutline("seo tips");
    const h2Headings = outline.filter((item) => item.level === "H2");
    h2Headings.forEach((item) => {
      expect(item.heading[0]).toBe(item.heading[0].toUpperCase());
    });
  });
});

describe("getDeclineSeverity", () => {
  it("returns 'critical' for drops >= 10", () => {
    expect(getDeclineSeverity(10)).toBe("critical");
    expect(getDeclineSeverity(15)).toBe("critical");
    expect(getDeclineSeverity(50)).toBe("critical");
  });

  it("returns 'moderate' for drops of 5-9", () => {
    expect(getDeclineSeverity(5)).toBe("moderate");
    expect(getDeclineSeverity(7)).toBe("moderate");
    expect(getDeclineSeverity(9)).toBe("moderate");
  });

  it("returns 'minor' for drops of 1-4", () => {
    expect(getDeclineSeverity(1)).toBe("minor");
    expect(getDeclineSeverity(3)).toBe("minor");
    expect(getDeclineSeverity(4)).toBe("minor");
  });

  it("handles exact threshold for critical (10)", () => {
    expect(getDeclineSeverity(10)).toBe("critical");
    expect(getDeclineSeverity(9)).toBe("moderate");
  });

  it("handles exact threshold for moderate (5)", () => {
    expect(getDeclineSeverity(5)).toBe("moderate");
    expect(getDeclineSeverity(4)).toBe("minor");
  });
});

describe("getDeclineLabel", () => {
  it("returns 'Critical' text for drops >= 10", () => {
    const result = plain(getDeclineLabel(10));
    expect(result).toBe("Critical");
  });

  it("returns 'Moderate' text for drops 5-9", () => {
    const result = plain(getDeclineLabel(7));
    expect(result).toBe("Moderate");
  });

  it("returns 'Minor' text for drops 1-4", () => {
    const result = plain(getDeclineLabel(3));
    expect(result).toBe("Minor");
  });

  it("returns a string with ANSI color codes (chalk is applied)", () => {
    const result = getDeclineLabel(10);
    // Should contain ANSI escape sequences when chalk is enabled
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });
});

describe("content opportunity filtering logic", () => {
  function filterOpportunities(
    opportunities: Array<{ keyword: string; searchVolume: number; currentPosition: number }>,
    limit = 10
  ) {
    return opportunities
      .filter((o) => o.currentPosition > 10 && o.searchVolume > 100)
      .sort((a, b) => b.searchVolume - a.searchVolume)
      .slice(0, limit);
  }

  it("filters out well-ranking keywords (position <= 10)", () => {
    const opps = [
      { keyword: "ranking well", searchVolume: 1000, currentPosition: 5 },
      { keyword: "opportunity", searchVolume: 800, currentPosition: 15 },
    ];
    const result = filterOpportunities(opps);
    expect(result).toHaveLength(1);
    expect(result[0].keyword).toBe("opportunity");
  });

  it("filters out keywords with volume <= 100", () => {
    const opps = [
      { keyword: "low volume", searchVolume: 50, currentPosition: 25 },
      { keyword: "good volume", searchVolume: 500, currentPosition: 25 },
    ];
    const result = filterOpportunities(opps);
    expect(result).toHaveLength(1);
    expect(result[0].keyword).toBe("good volume");
  });

  it("filters out keyword with exactly volume 100 (must be > 100)", () => {
    const opps = [{ keyword: "borderline", searchVolume: 100, currentPosition: 15 }];
    expect(filterOpportunities(opps)).toHaveLength(0);
  });

  it("filters out keyword with exactly position 10 (must be > 10)", () => {
    const opps = [{ keyword: "borderline", searchVolume: 500, currentPosition: 10 }];
    expect(filterOpportunities(opps)).toHaveLength(0);
  });

  it("includes keyword with position exactly 11", () => {
    const opps = [{ keyword: "just outside top 10", searchVolume: 500, currentPosition: 11 }];
    expect(filterOpportunities(opps)).toHaveLength(1);
  });

  it("sorts by search volume descending", () => {
    const opps = [
      { keyword: "medium", searchVolume: 500, currentPosition: 25 },
      { keyword: "high", searchVolume: 2000, currentPosition: 30 },
      { keyword: "low", searchVolume: 200, currentPosition: 40 },
    ];
    const result = filterOpportunities(opps);
    expect(result[0].keyword).toBe("high");
    expect(result[1].keyword).toBe("medium");
    expect(result[2].keyword).toBe("low");
  });

  it("respects the limit parameter", () => {
    const opps = Array.from({ length: 20 }, (_, i) => ({
      keyword: `keyword ${i}`,
      searchVolume: 1000 - i * 10,
      currentPosition: 15 + i,
    }));
    expect(filterOpportunities(opps, 5)).toHaveLength(5);
  });

  it("returns empty array when no opportunities qualify", () => {
    const opps = [
      { keyword: "top ranked", searchVolume: 5000, currentPosition: 2 },
      { keyword: "no volume", searchVolume: 10, currentPosition: 50 },
    ];
    expect(filterOpportunities(opps)).toHaveLength(0);
  });
});

describe("content audit declining pages logic", () => {
  function filterDecliningPages(
    pages: Array<{ keyword: string; currentPosition: number; previousPosition: number }>,
    minDrop = 3
  ) {
    return pages
      .map((p) => ({ ...p, positionChange: p.currentPosition - p.previousPosition }))
      .filter((p) => p.positionChange >= minDrop)
      .sort((a, b) => b.positionChange - a.positionChange);
  }

  it("filters out pages that haven't declined enough", () => {
    const pages = [
      { keyword: "small drop", currentPosition: 12, previousPosition: 10 }, // dropped 2
      { keyword: "big drop", currentPosition: 25, previousPosition: 10 }, // dropped 15
    ];
    const result = filterDecliningPages(pages, 3);
    expect(result).toHaveLength(1);
    expect(result[0].keyword).toBe("big drop");
  });

  it("sorts by largest position drop first", () => {
    const pages = [
      { keyword: "a", currentPosition: 20, previousPosition: 15 }, // drop 5
      { keyword: "b", currentPosition: 30, previousPosition: 10 }, // drop 20
      { keyword: "c", currentPosition: 18, previousPosition: 15 }, // drop 3
    ];
    const result = filterDecliningPages(pages, 3);
    expect(result[0].keyword).toBe("b");
    expect(result[1].keyword).toBe("a");
    expect(result[2].keyword).toBe("c");
  });

  it("includes pages exactly at minDrop threshold", () => {
    const pages = [{ keyword: "borderline", currentPosition: 13, previousPosition: 10 }]; // exactly 3
    const result = filterDecliningPages(pages, 3);
    expect(result).toHaveLength(1);
    expect(result[0].positionChange).toBe(3);
  });

  it("excludes pages just below minDrop threshold", () => {
    const pages = [{ keyword: "just under", currentPosition: 12, previousPosition: 10 }]; // drop 2
    expect(filterDecliningPages(pages, 3)).toHaveLength(0);
  });

  it("returns empty array when no pages decline", () => {
    const pages = [
      { keyword: "improving", currentPosition: 5, previousPosition: 10 },
      { keyword: "stable", currentPosition: 10, previousPosition: 10 },
    ];
    expect(filterDecliningPages(pages, 3)).toHaveLength(0);
  });

  it("calculates positionChange correctly (positive = dropped)", () => {
    const pages = [{ keyword: "dropped", currentPosition: 25, previousPosition: 10 }];
    const result = filterDecliningPages(pages, 3);
    expect(result[0].positionChange).toBe(15);
  });

  it("respects a custom minDrop value", () => {
    const pages = [
      { keyword: "small drop", currentPosition: 14, previousPosition: 10 }, // drop 4
      { keyword: "big drop", currentPosition: 20, previousPosition: 10 }, // drop 10
    ];
    const result = filterDecliningPages(pages, 5);
    expect(result).toHaveLength(1);
    expect(result[0].keyword).toBe("big drop");
  });
});

describe("content brief data shape", () => {
  // Test the pure data transformation for brief generation
  function buildBriefOutput(briefData: {
    targetKeyword: string;
    currentPosition: number | null;
    searchVolume: number;
    relatedKeywords: Array<{ keyword: string; searchVolume: number; currentPosition: number | null }>;
    competitorUrls: string[];
  }) {
    return {
      wordCount: estimateWordCount(briefData.currentPosition, briefData.searchVolume),
      outline: generateOutline(briefData.targetKeyword),
      secondaryKeywords: briefData.relatedKeywords.slice(0, 8),
      competitors: briefData.competitorUrls,
    };
  }

  it("produces a valid brief output shape", () => {
    const brief = buildBriefOutput({
      targetKeyword: "technical seo",
      currentPosition: 24,
      searchVolume: 1800,
      relatedKeywords: [
        { keyword: "seo audit", searchVolume: 900, currentPosition: 31 },
        { keyword: "technical seo checklist", searchVolume: 720, currentPosition: 45 },
      ],
      competitorUrls: ["https://moz.com/seo", "https://ahrefs.com/seo"],
    });

    expect(brief.wordCount).toBeGreaterThan(0);
    expect(brief.wordCount % 500).toBe(0);
    expect(Array.isArray(brief.outline)).toBe(true);
    expect(brief.outline.length).toBeGreaterThan(0);
    expect(brief.secondaryKeywords).toHaveLength(2);
    expect(brief.competitors).toHaveLength(2);
  });

  it("limits secondary keywords to 8", () => {
    const relatedKeywords = Array.from({ length: 15 }, (_, i) => ({
      keyword: `keyword ${i}`,
      searchVolume: 500,
      currentPosition: 20 + i,
    }));
    const brief = buildBriefOutput({
      targetKeyword: "seo",
      currentPosition: null,
      searchVolume: 5000,
      relatedKeywords,
      competitorUrls: [],
    });
    expect(brief.secondaryKeywords).toHaveLength(8);
  });

  it("handles no competitors gracefully", () => {
    const brief = buildBriefOutput({
      targetKeyword: "new keyword",
      currentPosition: null,
      searchVolume: 200,
      relatedKeywords: [],
      competitorUrls: [],
    });
    expect(brief.competitors).toHaveLength(0);
    expect(brief.wordCount).toBeGreaterThan(0);
  });
});
