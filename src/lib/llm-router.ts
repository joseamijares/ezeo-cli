/**
 * LLM-enhanced intent router for Ezeo CLI.
 *
 * First pass: keyword router (router.ts) — fast, no API call.
 * Second pass: Gemini Flash — only triggered when keyword router returns "unknown".
 *
 * Gracefully degrades: if GEMINI_API_KEY is not set, returns the keyword result.
 */

import { classifyIntent, type Intent } from './router.js';
import { MODEL_CONFIGS, getApiKey } from './models.js';
import { generateWithGemini } from './providers/gemini.js';

const VALID_INTENTS = [
  'status', 'traffic', 'rankings', 'geo', 'insights',
  'keywords', 'competitors', 'audit', 'cro', 'image',
  'compare', 'suggest', 'switch', 'projects', 'help', 'exit',
] as const;

type KnownIntent = (typeof VALID_INTENTS)[number];

function isValidIntent(s: string): s is KnownIntent {
  return (VALID_INTENTS as readonly string[]).includes(s);
}

/**
 * Classify user intent using the keyword router first,
 * falling back to Gemini Flash for unknown inputs.
 *
 * @param input       Raw user input string
 * @param timeoutMs   Max time to wait for Gemini (default 10s)
 */
export async function classifyIntentWithLLM(
  input: string,
  timeoutMs = 10_000
): Promise<Intent> {
  // ── Pass 1: keyword router (instant, no API call) ──────────────────────────
  const keywordResult = classifyIntent(input);
  if (keywordResult.type !== 'unknown') return keywordResult;

  // ── Pass 2: Gemini Flash (only if API key is configured) ───────────────────
  const geminiKey = getApiKey(MODEL_CONFIGS.router);
  if (!geminiKey) return keywordResult;

  try {
    const prompt = buildClassificationPrompt(input);
    const raw = await generateWithGemini(prompt, {
      apiKey: geminiKey,
      model: MODEL_CONFIGS.router.model,
      maxOutputTokens: MODEL_CONFIGS.router.maxTokens,
      timeoutMs,
    });

    const parsed = parseClassificationResponse(raw.trim(), input);
    return parsed;
  } catch {
    // Any error (timeout, API failure) → fall through to keyword result
    return keywordResult;
  }
}

function buildClassificationPrompt(input: string): string {
  return `You are an intent classifier for an SEO CLI tool called Ezeo.

Classify the following user input into exactly ONE of these intents:
- status: General dashboard or overview of a project
- traffic: Website traffic, clicks, impressions, CTR, Google Search Console, GA4
- rankings: Keyword positions, SERP rankings
- geo: AI search visibility, citations, Perplexity/ChatGPT/Claude mentions
- insights: Alerts, issues, problems, warnings, what's wrong
- keywords: List of tracked keywords
- competitors: Competitor analysis
- audit: Technical SEO audit of a URL
- cro: Conversion rate optimization
- image: Generate an image
- compare: Compare metrics across time periods
- suggest: Get recommendations or action items
- switch: Switch to a different project
- projects: List all projects
- help: Show help / list commands
- exit: Exit the application
- unknown: None of the above

User input: "${input}"

Respond with ONLY a JSON object like:
{"intent": "traffic", "project": "aquaprovac.com"}

The "project" field is optional — include it only if the user mentioned a specific project name or domain.
The "intent" field must be one of the values listed above.`;
}

function parseClassificationResponse(raw: string, originalInput: string): Intent {
  try {
    // Strip markdown code blocks if present
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
    const obj = JSON.parse(cleaned) as { intent?: string; project?: string };

    const intentType = obj.intent?.toLowerCase();
    if (!intentType || !isValidIntent(intentType)) {
      return { type: 'unknown', raw: originalInput };
    }

    const project = typeof obj.project === 'string' && obj.project.length > 0
      ? obj.project
      : undefined;

    // Build Intent with optional project field
    switch (intentType) {
      case 'status':    return { type: 'status', ...(project ? { project } : {}) };
      case 'traffic':   return { type: 'traffic', ...(project ? { project } : {}) };
      case 'rankings':  return { type: 'rankings', ...(project ? { project } : {}) };
      case 'geo':       return { type: 'geo', ...(project ? { project } : {}) };
      case 'insights':  return { type: 'insights', ...(project ? { project } : {}) };
      case 'keywords':  return { type: 'keywords', ...(project ? { project } : {}) };
      case 'competitors': return { type: 'competitors', ...(project ? { project } : {}) };
      case 'audit':     return { type: 'audit', ...(project ? { url: project } : {}) };
      case 'cro':       return { type: 'cro', ...(project ? { project } : {}) };
      case 'image':     return { type: 'image' };
      case 'compare':   return { type: 'compare', ...(project ? { project } : {}) };
      case 'suggest':   return { type: 'suggest', ...(project ? { project } : {}) };
      case 'switch':    return { type: 'switch', ...(project ? { project } : {}) };
      case 'projects':  return { type: 'projects' };
      case 'help':      return { type: 'help' };
      case 'exit':      return { type: 'exit' };
      default:          return { type: 'unknown', raw: originalInput };
    }
  } catch {
    return { type: 'unknown', raw: originalInput };
  }
}
