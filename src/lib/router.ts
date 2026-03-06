/**
 * Local intent router (Phase 1 - pattern matching, no LLM)
 * Phase 2+ will use Gemini 3.1 Flash-Lite for classification
 */

export type Intent =
  | { type: "status"; project?: string }
  | { type: "traffic"; project?: string; period?: string }
  | { type: "rankings"; project?: string }
  | { type: "geo"; project?: string }
  | { type: "insights"; project?: string }
  | { type: "keywords"; project?: string }
  | { type: "competitors"; project?: string }
  | { type: "audit"; url?: string }
  | { type: "projects" }
  | { type: "help" }
  | { type: "exit" }
  | { type: "unknown"; raw: string };

const patterns: Array<{
  regex: RegExp;
  extract: (match: RegExpMatchArray) => Intent;
}> = [
  // Exit
  {
    regex: /^(exit|quit|bye|q)$/i,
    extract: () => ({ type: "exit" }),
  },
  // Help
  {
    regex: /^(help|commands|\?)$/i,
    extract: () => ({ type: "help" }),
  },
  // Projects
  {
    regex: /^(projects?|list projects?|show projects?)$/i,
    extract: () => ({ type: "projects" }),
  },
  // Status - generic
  {
    regex: /^(status|dashboard|overview|how.?s\s+(?:it|everything|things))$/i,
    extract: () => ({ type: "status" }),
  },
  // Status - with project name
  {
    regex: /^(?:how.?s|status\s+(?:of|for)?|show)\s+(.+?)(?:\s+doing)?$/i,
    extract: (m) => ({ type: "status", project: m[1]?.trim() }),
  },
  // Traffic / clicks
  {
    regex: /^(?:traffic|clicks|impressions|ctr|search\s+(?:console|performance))(?:\s+(?:for\s+)?(.+))?$/i,
    extract: (m) => ({ type: "traffic", project: m[1]?.trim() }),
  },
  // Rankings
  {
    regex: /^(?:rankings?|positions?|top\s+keywords?|keyword\s+(?:rankings?|positions?))(?:\s+(?:for\s+)?(.+))?$/i,
    extract: (m) => ({ type: "rankings", project: m[1]?.trim() }),
  },
  // GEO / AI visibility
  {
    regex: /^(?:geo|ai\s+visibility|citations?|ai\s+overview|perplexity|chatgpt|cited)(?:\s+(?:for\s+)?(.+))?$/i,
    extract: (m) => ({ type: "geo", project: m[1]?.trim() }),
  },
  // Insights
  {
    regex: /^(?:insights?|alerts?|issues?|problems?|what.?s\s+(?:wrong|new|happening))(?:\s+(?:for|with|on)\s+(.+))?$/i,
    extract: (m) => ({ type: "insights", project: m[1]?.trim() }),
  },
  // Keywords
  {
    regex: /^(?:keywords?|tracked\s+keywords?)(?:\s+(?:for\s+)?(.+))?$/i,
    extract: (m) => ({ type: "keywords", project: m[1]?.trim() }),
  },
  // Competitors
  {
    regex: /^(?:competitors?|competition|compare|competitive)(?:\s+(?:for\s+)?(.+))?$/i,
    extract: (m) => ({ type: "competitors", project: m[1]?.trim() }),
  },
  // Audit
  {
    regex: /^(?:audit|scan|check)\s+(.+)$/i,
    extract: (m) => ({ type: "audit", url: m[1]?.trim() }),
  },
];

export function classifyIntent(input: string): Intent {
  const trimmed = input.trim();
  if (!trimmed) return { type: "help" };

  for (const { regex, extract } of patterns) {
    const match = trimmed.match(regex);
    if (match) return extract(match);
  }

  return { type: "unknown", raw: trimmed };
}
