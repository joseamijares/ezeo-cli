import chalk from "chalk";
import ora from "ora";
import Table from "cli-table3";
import {
  fetchProjects,
  fetchContentOpportunities,
  fetchKeywordBriefData,
  fetchDecliningPages,
} from "../lib/api.js";
import { config } from "../lib/config.js";
import { MODEL_CONFIGS, getApiKey } from "../lib/models.js";
import { generateWithOpenAICompat } from "../lib/providers/openai-compat.js";
import { getGlobalOpts } from "../lib/globals.js";
import { formatError } from "../lib/formatter.js";

const cyan = chalk.hex("#00D4FF");
const lime = chalk.hex("#7CE850");
const danger = chalk.hex("#FF3B30");
const warn = chalk.hex("#FF9500");
const lemon = chalk.hex("#F5E642");

// ---- Pure helper functions (exported for testing) ----

function toTitleCase(str: string): string {
  const minorWords = new Set([
    "a", "an", "the", "and", "but", "or", "for", "nor",
    "on", "at", "to", "by", "in", "of", "up", "as",
  ]);
  return str
    .toLowerCase()
    .split(" ")
    .map((word, i) => {
      if (i === 0 || !minorWords.has(word)) {
        return word.charAt(0).toUpperCase() + word.slice(1);
      }
      return word;
    })
    .join(" ");
}

export function generateTopicTitle(keyword: string): string {
  const kw = keyword.toLowerCase().trim();

  if (kw.startsWith("how to") || kw.startsWith("how do")) {
    return toTitleCase(keyword);
  }
  if (kw.startsWith("what is") || kw.startsWith("what are")) {
    return toTitleCase(keyword) + ": A Complete Explanation";
  }
  if (kw.includes("guide") || kw.includes("tutorial")) {
    return "The Complete " + toTitleCase(keyword);
  }
  if (kw.includes("tips") || kw.includes("strategies") || kw.includes("tactics")) {
    return toTitleCase(keyword) + " That Actually Work";
  }
  if (kw.includes("best") || kw.includes("top")) {
    return toTitleCase(keyword) + " (Updated Guide)";
  }
  if (kw.includes(" vs ") || kw.includes("versus") || kw.includes("compare")) {
    return toTitleCase(keyword) + ": Which Is Right for You?";
  }
  if (kw.includes("checklist") || kw.includes("list")) {
    return "The Ultimate " + toTitleCase(keyword);
  }

  const words = keyword.trim().split(" ").filter(Boolean).length;
  if (words <= 2) {
    return "The Complete Guide to " + toTitleCase(keyword);
  }
  return toTitleCase(keyword) + ": Everything You Need to Know";
}

export function estimateWordCount(
  currentPosition: number | null,
  searchVolume: number
): number {
  let base = 1500;

  if (currentPosition === null || currentPosition > 50) {
    base = 2500;
  } else if (currentPosition > 20) {
    base = 2000;
  } else if (currentPosition > 10) {
    base = 1800;
  }

  if (searchVolume > 5000) base += 500;
  else if (searchVolume > 1000) base += 250;

  return Math.round(base / 500) * 500;
}

export interface OutlineItem {
  level: "H2" | "H3";
  heading: string;
}

export function generateOutline(keyword: string): OutlineItem[] {
  const kw = toTitleCase(keyword);
  return [
    { level: "H2", heading: `What Is ${kw}?` },
    { level: "H3", heading: "Definition and Overview" },
    { level: "H3", heading: "Why It Matters" },
    { level: "H2", heading: `How ${kw} Works` },
    { level: "H3", heading: "Key Components" },
    { level: "H3", heading: "Step-by-Step Process" },
    { level: "H2", heading: `Best Practices for ${kw}` },
    { level: "H3", heading: "Common Mistakes to Avoid" },
    { level: "H2", heading: "Tools and Resources" },
    { level: "H2", heading: "Measuring Results" },
    { level: "H3", heading: "Key Metrics to Track" },
    { level: "H2", heading: "Conclusion" },
  ];
}

/**
 * Generate an AI-enhanced outline using Kimi K2.5 if MOONSHOT_API_KEY is set.
 * Falls back to the template-based outline when Kimi is unavailable.
 */
export async function generateOutlineWithAI(
  keyword: string,
  opts?: { searchVolume?: number; currentPosition?: number | null; relatedKeywords?: string[] }
): Promise<OutlineItem[]> {
  const writerCfg = MODEL_CONFIGS.writer;
  const kimiKey = getApiKey(writerCfg);

  if (!kimiKey) {
    // Graceful degradation — no Kimi key, use template
    return generateOutline(keyword);
  }

  try {
    const context = [
      opts?.searchVolume ? `Search volume: ${opts.searchVolume.toLocaleString()}/mo` : "",
      opts?.currentPosition != null ? `Current ranking: #${opts.currentPosition}` : "Currently not ranking",
      opts?.relatedKeywords?.length ? `Related keywords: ${opts.relatedKeywords.slice(0, 5).join(", ")}` : "",
    ].filter(Boolean).join("\n");

    const prompt = `You are an expert SEO content strategist. Generate a detailed article outline for the keyword "${keyword}".

${context}

Requirements:
- Create 5-8 H2 sections with 2-3 H3 subsections each
- Focus on user intent and topical authority
- Include sections that address common questions
- Make headings specific and descriptive (not generic)

Respond with ONLY a JSON array like:
[{"level":"H2","heading":"..."},{"level":"H3","heading":"..."},...]`;

    const raw = await generateWithOpenAICompat(
      [{ role: "user", content: prompt }],
      {
        apiKey: kimiKey,
        baseUrl: writerCfg.baseUrl!,
        model: writerCfg.model,
        maxTokens: 1024,
        timeoutMs: 30_000,
        temperature: 0.6,
      }
    );

    // Parse the JSON response
    const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
    const parsed = JSON.parse(cleaned) as Array<{ level: string; heading: string }>;

    const outline: OutlineItem[] = parsed
      .filter((item) => item.level === "H2" || item.level === "H3")
      .map((item) => ({ level: item.level as "H2" | "H3", heading: item.heading }));

    return outline.length > 0 ? outline : generateOutline(keyword);
  } catch {
    // Any error → fall back to template
    return generateOutline(keyword);
  }
}

export function getDeclineSeverity(positionChange: number): "critical" | "moderate" | "minor" {
  if (positionChange >= 10) return "critical";
  if (positionChange >= 5) return "moderate";
  return "minor";
}

export function getDeclineLabel(positionChange: number): string {
  const severity = getDeclineSeverity(positionChange);
  if (severity === "critical") return danger("Critical");
  if (severity === "moderate") return warn("Moderate");
  return chalk.gray("Minor");
}

// ---- Shared project resolver ----

async function resolveProject(spinner: ReturnType<typeof ora>, projectName?: string) {
  const projects = await fetchProjects();
  let project;
  if (projectName) {
    project = projects.find(
      (p) =>
        p.name.toLowerCase().includes(projectName.toLowerCase()) ||
        p.domain?.toLowerCase().includes(projectName.toLowerCase())
    );
    if (!project) {
      spinner.fail(`Project "${projectName}" not found`);
      return null;
    }
  } else {
    const defaultId = config.get("defaultProject");
    if (defaultId) project = projects.find((p) => p.id === defaultId);
    if (!project) project = projects[0];
    if (!project) {
      spinner.fail("No projects found");
      return null;
    }
  }
  return project;
}

// ---- content suggest ----

export async function contentSuggestCommand(
  projectName?: string,
  opts?: { json?: boolean; limit?: number }
): Promise<void> {
  const globalOpts = getGlobalOpts();
  const useJson = opts?.json || globalOpts.json;
  const limit = opts?.limit ?? 10;
  const spinner = ora({ text: "Analyzing keyword gaps...", stream: process.stderr }).start();

  try {
    const project = await resolveProject(spinner, projectName);
    if (!project) return;

    spinner.text = `Finding content opportunities for ${project.name}...`;
    const opportunities = await fetchContentOpportunities(project.id, 50);
    spinner.stop();

    const suggestions = opportunities
      .filter((o) => o.currentPosition > 10 && o.searchVolume > 100)
      .sort((a, b) => b.searchVolume - a.searchVolume)
      .slice(0, limit)
      .map((o) => ({ ...o, suggestedTitle: generateTopicTitle(o.keyword) }));

    if (useJson) {
      process.stdout.write(
        JSON.stringify(
          { project: { id: project.id, name: project.name }, suggestions },
          null,
          2
        ) + "\n"
      );
      return;
    }

    if (suggestions.length === 0) {
      console.log(
        chalk.gray(
          "\n  No content opportunities found. All tracked keywords may already be ranking well.\n"
        )
      );
      return;
    }

    console.log("");
    console.log(
      `  ${lemon.bold("Content Suggestions")} ${chalk.gray("—")} ${cyan(project.name)}`
    );
    console.log(chalk.gray("  Keywords ranking outside top 10 with search volume > 100\n"));

    suggestions.forEach((s, i) => {
      console.log(`  ${chalk.gray(`${i + 1}.`)} ${chalk.white.bold(s.suggestedTitle)}`);
      console.log(
        `     ${chalk.gray("Keyword:")} ${cyan(s.keyword)}  ` +
          `${chalk.gray("Vol:")} ${lime(s.searchVolume.toLocaleString())}  ` +
          `${chalk.gray("Pos:")} ${warn(String(s.currentPosition))}`
      );
      console.log("");
    });

    const total = opportunities.filter((o) => o.currentPosition > 10 && o.searchVolume > 100).length;
    if (total > limit) {
      console.log(chalk.gray(`  Showing ${limit} of ${total} total opportunities.\n`));
    }
  } catch (err) {
    spinner.fail("Failed to fetch content opportunities");
    console.log(formatError(err instanceof Error ? err.message : String(err)));
    process.exit(1);
  }
}

// ---- content brief ----

export async function contentBriefCommand(
  keyword: string,
  projectName?: string,
  opts?: { json?: boolean }
): Promise<void> {
  const globalOpts = getGlobalOpts();
  const useJson = opts?.json || globalOpts.json;
  const spinner = ora({ text: "Generating content brief...", stream: process.stderr }).start();

  try {
    const project = await resolveProject(spinner, projectName);
    if (!project) return;

    spinner.text = `Building brief for "${keyword}"...`;
    const brief = await fetchKeywordBriefData(project.id, keyword);
    spinner.stop();

    if (!brief) {
      console.log(
        chalk.gray(`\n  Keyword "${keyword}" not found in project ${project.name}.\n`)
      );
      return;
    }

    const wordCount = estimateWordCount(brief.currentPosition, brief.searchVolume);

    // Use AI-enhanced outline if Kimi is available, fall back to template
    spinner.text = "Generating outline...";
    const outline = await generateOutlineWithAI(brief.targetKeyword, {
      searchVolume: brief.searchVolume,
      currentPosition: brief.currentPosition,
      relatedKeywords: brief.relatedKeywords.map((rk) => rk.keyword),
    });
    spinner.stop();

    if (useJson) {
      process.stdout.write(
        JSON.stringify(
          {
            project: { id: project.id, name: project.name },
            brief: { ...brief, suggestedWordCount: wordCount, outline },
          },
          null,
          2
        ) + "\n"
      );
      return;
    }

    console.log("");
    console.log(
      `  ${lemon.bold("Content Brief")} ${chalk.gray("—")} ${cyan(brief.targetKeyword)}`
    );
    console.log("");
    console.log(`  ${chalk.gray("Target keyword:")}    ${chalk.white.bold(brief.targetKeyword)}`);
    console.log(`  ${chalk.gray("Search volume:")}     ${lime(brief.searchVolume.toLocaleString())}`);
    console.log(
      `  ${chalk.gray("Current position:")}  ${
        brief.currentPosition != null
          ? warn(String(brief.currentPosition))
          : chalk.gray("Not ranking")
      }`
    );
    console.log(`  ${chalk.gray("Suggested words:")}   ${cyan(wordCount.toLocaleString())}`);

    if (brief.relatedKeywords.length > 0) {
      console.log("");
      console.log(`  ${chalk.gray("Secondary keywords:")}`);
      brief.relatedKeywords.slice(0, 8).forEach((rk) => {
        const posStr =
          rk.currentPosition != null ? chalk.gray(`  Pos: ${rk.currentPosition}`) : "";
        console.log(
          `    ${chalk.gray("·")} ${chalk.white(rk.keyword)}  ${chalk.gray("Vol:")} ${lime(
            rk.searchVolume.toLocaleString()
          )}${posStr}`
        );
      });
    }

    const kimiAvailable = !!getApiKey(MODEL_CONFIGS.writer);
    console.log("");
    console.log(
      `  ${chalk.gray("Suggested outline:")}` +
      (kimiAvailable ? chalk.gray("  (AI-enhanced via Kimi K2)") : "")
    );
    outline.forEach((item) => {
      const indent = item.level === "H3" ? "      " : "    ";
      const label =
        item.level === "H2" ? chalk.white.bold(item.heading) : chalk.gray(item.heading);
      console.log(`  ${indent}${chalk.gray(item.level)}  ${label}`);
    });

    if (brief.competitorUrls.length > 0) {
      console.log("");
      console.log(`  ${chalk.gray("Competitor URLs to analyze:")}`);
      brief.competitorUrls.forEach((url) => {
        console.log(`    ${chalk.gray("·")} ${chalk.blue(url)}`);
      });
    }

    console.log("");
  } catch (err) {
    spinner.fail("Failed to generate content brief");
    console.log(formatError(err instanceof Error ? err.message : String(err)));
    process.exit(1);
  }
}

// ---- content audit ----

export async function contentAuditCommand(
  projectName?: string,
  opts?: { json?: boolean; minDrop?: number }
): Promise<void> {
  const globalOpts = getGlobalOpts();
  const useJson = opts?.json || globalOpts.json;
  const minDrop = opts?.minDrop ?? 3;
  const spinner = ora({ text: "Auditing content rankings...", stream: process.stderr }).start();

  try {
    const project = await resolveProject(spinner, projectName);
    if (!project) return;

    spinner.text = `Analyzing ranking changes for ${project.name}...`;
    const decliningPages = await fetchDecliningPages(project.id, minDrop);
    spinner.stop();

    if (useJson) {
      const critical = decliningPages.filter(
        (p) => getDeclineSeverity(p.positionChange) === "critical"
      ).length;
      const moderate = decliningPages.filter(
        (p) => getDeclineSeverity(p.positionChange) === "moderate"
      ).length;
      const minor = decliningPages.filter(
        (p) => getDeclineSeverity(p.positionChange) === "minor"
      ).length;
      process.stdout.write(
        JSON.stringify(
          {
            project: { id: project.id, name: project.name },
            decliningPages,
            summary: { total: decliningPages.length, critical, moderate, minor },
          },
          null,
          2
        ) + "\n"
      );
      return;
    }

    console.log("");
    console.log(
      `  ${lemon.bold("Content Audit")} ${chalk.gray("—")} ${cyan(project.name)}`
    );
    console.log(chalk.gray("  Comparing current rankings vs. 30 days ago\n"));

    if (decliningPages.length === 0) {
      console.log(chalk.gray("  No pages with declining rankings found. Great job!\n"));
      return;
    }

    const critical = decliningPages.filter(
      (p) => getDeclineSeverity(p.positionChange) === "critical"
    );
    const moderate = decliningPages.filter(
      (p) => getDeclineSeverity(p.positionChange) === "moderate"
    );
    const minor = decliningPages.filter(
      (p) => getDeclineSeverity(p.positionChange) === "minor"
    );

    console.log(
      `  Found ${chalk.white(String(decliningPages.length))} pages with declining rankings  ` +
        `${danger(String(critical.length))} critical  ·  ` +
        `${warn(String(moderate.length))} moderate  ·  ` +
        `${chalk.gray(String(minor.length))} minor\n`
    );

    const table = new Table({
      head: [
        chalk.gray("Keyword"),
        chalk.gray("Now"),
        chalk.gray("Was"),
        chalk.gray("Drop"),
        chalk.gray("Severity"),
      ],
      style: { head: [], border: ["gray"] },
      colWidths: [40, 6, 6, 7, 12],
    });

    decliningPages.slice(0, 20).forEach((page) => {
      table.push([
        chalk.white(page.keyword),
        warn(String(page.currentPosition)),
        chalk.gray(String(page.previousPosition)),
        danger(`▼${page.positionChange}`),
        getDeclineLabel(page.positionChange),
      ]);
    });

    console.log(table.toString());

    if (decliningPages.length > 20) {
      console.log(chalk.gray(`\n  Showing 20 of ${decliningPages.length} total pages.\n`));
    } else {
      console.log("");
    }

    if (critical.length > 0) {
      console.log(
        `  ${danger.bold("Action needed:")} ${critical.length} page${
          critical.length > 1 ? "s have" : " has"
        } dropped 10+ positions and need immediate attention.\n`
      );
    }
  } catch (err) {
    spinner.fail("Failed to audit content");
    console.log(formatError(err instanceof Error ? err.message : String(err)));
    process.exit(1);
  }
}
