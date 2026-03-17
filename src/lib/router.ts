/**
 * Smart intent router for Ezeo CLI (Phase 1.5)
 * Fuzzy matching + synonyms + natural language patterns
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
  | { type: "cro"; project?: string }
  | { type: "image"; description?: string }
  | { type: "compare"; project?: string; metric?: string }
  | { type: "suggest"; project?: string }
  | { type: "switch"; project?: string }
  | { type: "projects" }
  | { type: "help" }
  | { type: "exit" }
  | { type: "unknown"; raw: string; suggestion?: string };

// Synonym map for fuzzy matching
const SYNONYMS: Record<string, string[]> = {
  status: ["dashboard", "overview", "summary", "show me", "whats up", "how is", "how are", "report card"],
  traffic: ["clicks", "impressions", "ctr", "search console", "gsc", "visitors", "visits", "sessions", "pageviews", "analytics", "ga4", "google analytics"],
  rankings: ["ranking", "positions", "position", "serp", "serps", "rank", "ranked", "where do i rank", "where am i"],
  geo: ["ai visibility", "citations", "citation", "cited", "ai overview", "perplexity", "chatgpt", "claude", "copilot", "ai search", "llm", "bing copilot", "gemini visibility"],
  insights: ["alerts", "alert", "issues", "problems", "warnings", "whats wrong", "whats new", "whats happening", "anything new", "news", "updates"],
  keywords: ["keyword", "tracked keywords", "kws", "queries", "search terms", "top queries"],
  competitors: ["competition", "competitive", "compare competitors", "vs", "versus", "who beats me", "who outranks"],
  cro: ["conversion", "conversions", "optimization", "audit results", "cro audit", "conversion rate"],
  projects: ["project", "list projects", "show projects", "my projects", "all projects", "switch to"],
  compare: ["compare", "comparison", "vs last", "week over week", "wow", "mom", "month over month", "trend", "trending"],
  suggest: ["suggest", "recommendations", "what should i do", "next steps", "action items", "priorities", "advice", "tips", "help me improve", "quick wins"],
};

// Build reverse lookup: word -> intent type
const WORD_TO_INTENT = new Map<string, string>();
for (const [intentType, words] of Object.entries(SYNONYMS)) {
  for (const word of words) {
    WORD_TO_INTENT.set(word.toLowerCase(), intentType);
  }
}

// Extract project name from natural language
function extractProject(input: string, matchedWords: string[]): string | undefined {
  let cleaned = input.toLowerCase();

  // Remove matched intent words
  for (const word of matchedWords) {
    cleaned = cleaned.replace(new RegExp(`\\b${escapeRegex(word)}\\b`, "gi"), "").trim();
  }

  // Remove filler words
  cleaned = cleaned
    .replace(/\b(for|of|on|the|my|about|show|me|please|can you|tell me|what|is|are|how|get)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();

  // Remove trailing question marks and common suffixes
  cleaned = cleaned.replace(/[?!.]+$/, "").trim();

  return cleaned.length > 0 ? cleaned : undefined;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Levenshtein distance for typo tolerance
function levenshtein(a: string, b: string): number {
  const matrix = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }
  return matrix[a.length][b.length];
}

// Find closest matching intent (with typo tolerance)
function findClosestIntent(word: string): { type: string; confidence: number } | null {
  const lower = word.toLowerCase();

  // Exact match first
  if (WORD_TO_INTENT.has(lower)) {
    return { type: WORD_TO_INTENT.get(lower)!, confidence: 1.0 };
  }

  // Direct intent type match
  const intentTypes = ["status", "traffic", "rankings", "geo", "insights", "keywords", "competitors", "cro", "projects", "compare", "suggest"];
  for (const t of intentTypes) {
    if (lower === t) return { type: t, confidence: 1.0 };
  }

  // Fuzzy match with Levenshtein (max distance 2)
  let bestMatch: { type: string; distance: number } | null = null;

  // Check all single-word synonyms
  for (const [phrase, intentType] of WORD_TO_INTENT.entries()) {
    if (phrase.includes(" ")) continue;
    const dist = levenshtein(lower, phrase);
    if (dist <= 2 && dist < (bestMatch?.distance ?? Infinity)) {
      bestMatch = { type: intentType, distance: dist };
    }
  }

  // Also check intent type names directly (for typos like "staus" -> "status")
  for (const t of intentTypes) {
    const dist = levenshtein(lower, t);
    if (dist <= 2 && dist < (bestMatch?.distance ?? Infinity)) {
      bestMatch = { type: t, distance: dist };
    }
  }

  if (bestMatch) {
    return { type: bestMatch.type, confidence: 1 - bestMatch.distance / Math.max(word.length, 3) };
  }

  return null;
}

// Suggest a command when unknown
function suggestCommand(input: string): string | undefined {
  const words = input.toLowerCase().split(/\s+/);
  for (const word of words) {
    const match = findClosestIntent(word);
    if (match && match.confidence > 0.5) {
      return match.type;
    }
  }
  return undefined;
}

const patterns: Array<{
  regex: RegExp;
  extract: (match: RegExpMatchArray) => Intent;
}> = [
  // Exit
  { regex: /^(exit|quit|bye|q|:q|ctrl-c)$/i, extract: () => ({ type: "exit" }) },
  // Help
  { regex: /^(help|commands|\?|h)$/i, extract: () => ({ type: "help" }) },
  // Projects
  { regex: /^(projects?|list projects?|show projects?|my projects?)$/i, extract: () => ({ type: "projects" }) },
  // Switch project
  { regex: /^(?:switch|use|set|change)\s+(?:to\s+)?(.+)$/i, extract: (m) => ({ type: "switch", project: m[1]?.trim() }) },
  // Compare
  { regex: /^(?:compare|comparison|vs last|week over week|wow|mom|trend)(?:\s+(.+))?$/i, extract: (m) => ({ type: "compare", project: m[1]?.trim() }) },
  // Suggest / what should I do
  { regex: /^(?:suggest|recommendations?|what should|next steps?|action items?|priorities?|advice|tips|help me|quick wins?|improve)(?:\s+(.+))?$/i, extract: (m) => ({ type: "suggest", project: m[1]?.trim() }) },
  // CRO
  { regex: /^(?:cro|conversion|optimization|audit\s+results?)(?:\s+(?:for\s+)?(.+))?$/i, extract: (m) => ({ type: "cro", project: m[1]?.trim() }) },
  // Image
  { regex: /^(?:image|generate\s+image|create\s+image|photo)(?:\s+(.+))?$/i, extract: (m) => ({ type: "image", description: m[1]?.trim() }) },
  // Status
  { regex: /^(status|dashboard|overview|summary|how.?s\s+(?:it|everything|things))$/i, extract: () => ({ type: "status" }) },
  // Status with project
  { regex: /^(?:how.?s|status\s+(?:of|for)?|show)\s+(.+?)(?:\s+doing)?$/i, extract: (m) => ({ type: "status", project: m[1]?.trim() }) },
  // Traffic
  { regex: /^(?:traffic|clicks|impressions|ctr|search\s+(?:console|performance)|gsc|ga4|analytics|sessions?|visitors?|pageviews?)(?:\s+(?:for\s+)?(.+))?$/i, extract: (m) => ({ type: "traffic", project: m[1]?.trim() }) },
  // Rankings
  { regex: /^(?:rankings?|positions?|top\s+keywords?|keyword\s+(?:rankings?|positions?)|serps?|where\s+(?:do\s+i|am\s+i)\s+rank)(?:\s+(?:for\s+)?(.+))?$/i, extract: (m) => ({ type: "rankings", project: m[1]?.trim() }) },
  // GEO
  { regex: /^(?:geo|ai\s+(?:visibility|search|overview)|citations?|cited|perplexity|chatgpt|copilot|gemini\s+visibility|llm)(?:\s+(?:for\s+)?(.+))?$/i, extract: (m) => ({ type: "geo", project: m[1]?.trim() }) },
  // Insights
  { regex: /^(?:insights?|alerts?|issues?|problems?|warnings?|what.?s\s+(?:wrong|new|happening)|anything\s+new|news|updates?)(?:\s+(?:for|with|on)\s+(.+))?$/i, extract: (m) => ({ type: "insights", project: m[1]?.trim() }) },
  // Keywords
  { regex: /^(?:keywords?|tracked\s+keywords?|kws?|queries|search\s+terms?|top\s+queries)(?:\s+(?:for\s+)?(.+))?$/i, extract: (m) => ({ type: "keywords", project: m[1]?.trim() }) },
  // Competitors
  { regex: /^(?:competitors?|competition|competitive|who\s+(?:beats|outranks)\s+me)(?:\s+(?:for\s+)?(.+))?$/i, extract: (m) => ({ type: "competitors", project: m[1]?.trim() }) },
  // Audit
  { regex: /^(?:audit|scan|check)\s+(.+)$/i, extract: (m) => ({ type: "audit", url: m[1]?.trim() }) },
];

export function classifyIntent(input: string): Intent {
  const trimmed = input.trim();
  if (!trimmed) return { type: "help" };

  // Try exact pattern match first
  for (const { regex, extract } of patterns) {
    const match = trimmed.match(regex);
    if (match) return extract(match);
  }

  // Try multi-word synonym matching
  const lower = trimmed.toLowerCase();
  for (const [intentType, synonyms] of Object.entries(SYNONYMS)) {
    for (const synonym of synonyms) {
      if (synonym.includes(" ") && lower.includes(synonym)) {
        const project = extractProject(trimmed, [synonym]);
        return { type: intentType as Intent["type"], project } as Intent;
      }
    }
  }

  // Try single-word exact match first (for performance)
  const singleWord = lower.split(/\s+/)[0];
  if (WORD_TO_INTENT.has(singleWord)) {
    const project = extractProject(trimmed, [singleWord]);
    return { type: WORD_TO_INTENT.get(singleWord) as Intent["type"], project } as Intent;
  }

  // Try single-word fuzzy matching (typo tolerance)
  const match = findClosestIntent(singleWord);
  if (match && match.confidence >= 0.7) {
    const project = extractProject(trimmed, [singleWord]);
    return { type: match.type as Intent["type"], project } as Intent;
  }

  // Unknown with suggestion
  const suggestion = suggestCommand(trimmed);
  return { type: "unknown", raw: trimmed, suggestion };
}
