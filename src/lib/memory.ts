/**
 * Memory system for Ezeo CLI
 *
 * Structure (~/.ezeo/):
 *   soul.md              — CLI personality, voice, content style
 *   memory/
 *     global.md          — Cross-project learnings, user preferences
 *     <project-slug>/
 *       context.md       — Brand voice, audience, products, competitors
 *       history.md       — Conversation log, decisions made
 *       insights.md      — Curated insights, patterns noticed
 *       content.md       — Content ideas, published articles, what worked
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const EZEO_DIR = join(homedir(), ".ezeo");
const MEMORY_DIR = join(EZEO_DIR, "memory");

function ensureDir(dir: string): void {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

// ---- Soul ----

const DEFAULT_SOUL = `# Ezeo AI — Soul

You are Ezeo, an AI-powered SEO and GEO strategist.

## Voice
- Direct and data-driven. Lead with numbers, not fluff.
- Confident but not arrogant. Say "the data shows" not "I think."
- Action-oriented. Every insight should end with what to do next.
- Use the client's actual product names, pages, and metrics.

## Anti-Patterns
- Never use generic advice ("optimize your meta tags" without specifics)
- Never hallucinate metrics. If you don't have data, say so.
- Never use em dashes in content. It's an AI writing tell.
- Never write "comprehensive guide" or "in today's digital landscape."

## Content Style
- Short paragraphs (2-3 sentences max)
- Use real numbers: "$4,800/month in recovered revenue" not "improve revenue"
- Reference specific pages and products by name
- Include comparison data when available (vs competitors, vs last month)

## GEO Philosophy
- AI visibility is the new SEO. Track citations, not just rankings.
- Brand mentions correlate 3x more than backlinks for AI citation.
- YouTube presence is the #1 signal for AI visibility.
- Only 11% of domains get cited by both ChatGPT AND Google AI Overviews.

*Edit this file to customize Ezeo's personality and content standards.*
`;

export function getSoul(): string {
  const soulPath = join(EZEO_DIR, "soul.md");
  if (!existsSync(soulPath)) {
    ensureDir(EZEO_DIR);
    writeFileSync(soulPath, DEFAULT_SOUL, "utf-8");
  }
  return readFileSync(soulPath, "utf-8");
}

// ---- Project Memory ----

function projectDir(projectName: string): string {
  return join(MEMORY_DIR, slugify(projectName));
}

const DEFAULT_CONTEXT = (name: string, domain: string) => `# ${name} — Brand Context

## Domain
${domain}

## Brand Voice
<!-- How does this brand talk? Formal? Casual? Technical? -->

## Target Audience
<!-- Who are they trying to reach? -->

## Products / Services
<!-- Key products, categories, price ranges -->

## Competitors
<!-- Main competitors and how this brand differentiates -->

## Content Notes
<!-- What topics work? What to avoid? Preferred formats? -->

*This file is auto-created. Fill in details to improve content quality.*
`;

const DEFAULT_HISTORY = (name: string) => `# ${name} — Conversation History

<!-- Recent interactions, decisions, and requests are logged here -->
`;

const DEFAULT_INSIGHTS = (name: string) => `# ${name} — Curated Insights

<!-- Patterns, wins, and learnings noticed over time -->
`;

const DEFAULT_CONTENT = (name: string) => `# ${name} — Content Tracker

## Published
<!-- Articles published, dates, performance -->

## Ideas
<!-- Content ideas in the pipeline -->

## What Works
<!-- Topics, formats, lengths that perform well -->
`;

interface MemoryFile {
  name: string;
  defaultContent: (projectName: string, domain: string) => string;
}

const MEMORY_FILES: MemoryFile[] = [
  { name: "context.md", defaultContent: DEFAULT_CONTEXT },
  {
    name: "history.md",
    defaultContent: (name, _domain) => DEFAULT_HISTORY(name),
  },
  {
    name: "insights.md",
    defaultContent: (name, _domain) => DEFAULT_INSIGHTS(name),
  },
  {
    name: "content.md",
    defaultContent: (name, _domain) => DEFAULT_CONTENT(name),
  },
];

export function initProjectMemory(
  projectName: string,
  domain: string
): string {
  const dir = projectDir(projectName);
  ensureDir(dir);

  for (const file of MEMORY_FILES) {
    const filePath = join(dir, file.name);
    if (!existsSync(filePath)) {
      writeFileSync(filePath, file.defaultContent(projectName, domain), "utf-8");
    }
  }

  return dir;
}

export function getProjectMemory(
  projectName: string,
  file: "context" | "history" | "insights" | "content"
): string | null {
  const filePath = join(projectDir(projectName), `${file}.md`);
  try {
    if (!existsSync(filePath)) return null;
    return readFileSync(filePath, "utf-8");
  } catch {
    return null;
  }
}

export function appendToHistory(
  projectName: string,
  entry: string
): void {
  const dir = projectDir(projectName);
  ensureDir(dir);
  const filePath = join(dir, "history.md");

  const timestamp = new Date().toISOString().split("T")[0];
  const line = `\n## ${timestamp}\n${entry}\n`;

  try {
    if (existsSync(filePath)) {
      const existing = readFileSync(filePath, "utf-8");
      writeFileSync(filePath, existing + line, "utf-8");
    } else {
      writeFileSync(
        filePath,
        `# ${projectName} — Conversation History\n${line}`,
        "utf-8"
      );
    }
  } catch {
    // silently fail — memory is best-effort
  }
}

export function appendInsight(
  projectName: string,
  insight: string
): void {
  const dir = projectDir(projectName);
  ensureDir(dir);
  const filePath = join(dir, "insights.md");

  const timestamp = new Date().toISOString().split("T")[0];
  const line = `\n- **${timestamp}**: ${insight}\n`;

  try {
    if (existsSync(filePath)) {
      const existing = readFileSync(filePath, "utf-8");
      writeFileSync(filePath, existing + line, "utf-8");
    } else {
      writeFileSync(
        filePath,
        `# ${projectName} — Curated Insights\n${line}`,
        "utf-8"
      );
    }
  } catch {
    // silently fail
  }
}

// ---- Global Memory ----

const DEFAULT_GLOBAL = `# Ezeo — Global Memory

## User Preferences
<!-- Preferred report format, content length, tone, etc. -->

## Learnings
<!-- Cross-project patterns and insights -->

## Quick Notes
<!-- Anything worth remembering across projects -->
`;

export function getGlobalMemory(): string {
  const filePath = join(MEMORY_DIR, "global.md");
  if (!existsSync(filePath)) {
    ensureDir(MEMORY_DIR);
    writeFileSync(filePath, DEFAULT_GLOBAL, "utf-8");
  }
  return readFileSync(filePath, "utf-8");
}

export function appendGlobalNote(note: string): void {
  const filePath = join(MEMORY_DIR, "global.md");
  ensureDir(MEMORY_DIR);

  const timestamp = new Date().toISOString().split("T")[0];
  const line = `\n- **${timestamp}**: ${note}\n`;

  try {
    if (existsSync(filePath)) {
      const existing = readFileSync(filePath, "utf-8");
      writeFileSync(filePath, existing + line, "utf-8");
    } else {
      writeFileSync(filePath, DEFAULT_GLOBAL + line, "utf-8");
    }
  } catch {
    // silently fail
  }
}

// ---- Memory Summary (for LLM context in Phase 2) ----

export function getProjectContext(
  projectName: string,
  domain: string
): string {
  initProjectMemory(projectName, domain);

  const soul = getSoul();
  const context = getProjectMemory(projectName, "context") ?? "";
  const insights = getProjectMemory(projectName, "insights") ?? "";
  const global = getGlobalMemory();

  return [
    "## Soul (personality + standards)",
    soul,
    "",
    "## Brand Context",
    context,
    "",
    "## Recent Insights",
    insights,
    "",
    "## Global Notes",
    global,
  ].join("\n");
}

export function listProjectMemories(): string[] {
  try {
    if (!existsSync(MEMORY_DIR)) return [];
    const { readdirSync, statSync } = require("node:fs") as typeof import("node:fs");
    return readdirSync(MEMORY_DIR)
      .filter((f: string) => {
        const fullPath = join(MEMORY_DIR, f);
        return statSync(fullPath).isDirectory();
      });
  } catch {
    return [];
  }
}
