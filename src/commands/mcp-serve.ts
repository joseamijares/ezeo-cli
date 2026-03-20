/**
 * `ezeo mcp-serve` — Start an MCP (Model Context Protocol) server over stdio.
 *
 * Exposes Ezeo data as MCP tools consumable by Claude Desktop, Cursor, etc.
 *
 * Usage:
 *   ezeo mcp-serve
 *   ezeo mcp-serve --project "Aqua Pro Vac"
 *   ezeo mcp-serve --no-cache
 *
 * MCP spec: https://spec.modelcontextprotocol.io
 */

import { createInterface } from "node:readline";
import {
  fetchProjects,
  fetchGSCMetricsWoW,
  fetchGA4MetricsWoW,
  fetchGEOMetrics,
  fetchRankingsSummary,
  fetchTopKeywords,
  fetchInsights,
} from "../lib/api.js";
import { getCached, TTL } from "../lib/cache.js";

// ---- MCP Types ----

interface MCPRequest {
  jsonrpc: "2.0";
  id: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

interface MCPResponse {
  jsonrpc: "2.0";
  id: string | number | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
}

// ---- Tool definitions ----

export const TOOLS: ToolDefinition[] = [
  {
    name: "ezeo_project_status",
    description:
      "Get the overall status of an Ezeo project: GSC traffic, GA4 sessions, keyword rankings summary, and AI (GEO) visibility score.",
    inputSchema: {
      type: "object",
      properties: {
        project: {
          type: "string",
          description: "Project name or domain (partial match OK). Defaults to the CLI default project.",
        },
      },
    },
  },
  {
    name: "ezeo_keywords",
    description:
      "Get top keyword rankings for a project including position, previous position, and change.",
    inputSchema: {
      type: "object",
      properties: {
        project: {
          type: "string",
          description: "Project name or domain (partial match OK).",
        },
        limit: {
          type: "number",
          description: "Number of keywords to return (default: 20, max: 100).",
        },
      },
    },
  },
  {
    name: "ezeo_geo_report",
    description:
      "Get the AI visibility (GEO) report: citation rate, total citations, and breakdown by AI platform (ChatGPT, Perplexity, etc.).",
    inputSchema: {
      type: "object",
      properties: {
        project: {
          type: "string",
          description: "Project name or domain (partial match OK).",
        },
        days: {
          type: "number",
          description: "Time window in days (default: 30).",
        },
      },
    },
  },
  {
    name: "ezeo_recommendations",
    description:
      "Get the latest optimization recommendations and insights for a project (ranking drops, traffic changes, opportunities).",
    inputSchema: {
      type: "object",
      properties: {
        project: {
          type: "string",
          description: "Project name or domain (partial match OK).",
        },
        limit: {
          type: "number",
          description: "Number of recommendations to return (default: 10).",
        },
      },
    },
  },
  {
    name: "ezeo_competitors",
    description:
      "Get competitor analysis for a project: top competing keywords and their ranking positions.",
    inputSchema: {
      type: "object",
      properties: {
        project: {
          type: "string",
          description: "Project name or domain (partial match OK).",
        },
      },
    },
  },
];

// ---- Helpers ----

function sendResponse(res: MCPResponse): void {
  process.stdout.write(JSON.stringify(res) + "\n");
}

function errorResponse(
  id: string | number | null,
  code: number,
  message: string,
  data?: unknown
): MCPResponse {
  return { jsonrpc: "2.0", id, error: { code, message, data } };
}

function textContent(text: string) {
  return [{ type: "text", text }];
}

async function resolveProject(nameHint?: string): Promise<{ id: string; name: string; domain: string } | null> {
  const projects = await fetchProjects();
  if (!nameHint) return projects[0] ?? null;
  return (
    projects.find(
      (p) =>
        p.name.toLowerCase().includes(nameHint.toLowerCase()) ||
        p.domain?.toLowerCase().includes(nameHint.toLowerCase())
    ) ?? null
  );
}

// ---- Tool handlers ----

async function handleProjectStatus(
  args: Record<string, unknown>,
  noCache: boolean
): Promise<string> {
  const project = await resolveProject(args.project as string | undefined);
  if (!project) return "No project found. Run `ezeo projects` to see available projects.";

  const cacheKey = `mcp:status:${project.id}`;
  const data = await getCached(
    cacheKey,
    TTL.PROJECT_STATUS,
    async () => {
      const [gsc, ga4, geo, rankings] = await Promise.all([
        fetchGSCMetricsWoW(project.id),
        fetchGA4MetricsWoW(project.id),
        fetchGEOMetrics(project.id, 30),
        fetchRankingsSummary(project.id),
      ]);
      return { gsc, ga4, geo, rankings };
    },
    noCache
  );

  const { gsc, ga4, geo, rankings } = data;

  return [
    `## Project: ${project.name} (${project.domain})`,
    "",
    "### Search Console (last 7 days)",
    `- Clicks: ${gsc.current.clicks.toLocaleString()} (${gsc.delta.clicks.pct != null ? (gsc.delta.clicks.pct >= 0 ? "+" : "") + gsc.delta.clicks.pct.toFixed(1) + "%" : "N/A"} WoW)`,
    `- Impressions: ${gsc.current.impressions.toLocaleString()} (${gsc.delta.impressions.pct != null ? (gsc.delta.impressions.pct >= 0 ? "+" : "") + gsc.delta.impressions.pct.toFixed(1) + "%" : "N/A"} WoW)`,
    `- CTR: ${(gsc.current.ctr * 100).toFixed(2)}%`,
    `- Avg Position: ${gsc.current.position.toFixed(1)}`,
    "",
    "### Analytics (last 7 days)",
    `- Sessions: ${ga4.current.sessions.toLocaleString()}`,
    `- Pageviews: ${ga4.current.pageviews.toLocaleString()}`,
    `- Bounce Rate: ${ga4.current.bounceRate.toFixed(1)}%`,
    "",
    "### Keyword Rankings",
    `- Top 3: ${rankings.top3}`,
    `- Top 10: ${rankings.top10}`,
    `- Top 20: ${rankings.top20}`,
    `- Total tracked: ${rankings.total}`,
    "",
    "### AI Visibility (GEO, last 30 days)",
    `- Citation Rate: ${geo.citationRate.toFixed(1)}%`,
    `- Total Citations: ${geo.totalCitations}`,
    `- Platforms: ${Object.entries(geo.platforms).map(([p, n]) => `${p} (${n})`).join(", ") || "None yet"}`,
  ].join("\n");
}

async function handleKeywords(
  args: Record<string, unknown>,
  noCache: boolean
): Promise<string> {
  const project = await resolveProject(args.project as string | undefined);
  if (!project) return "No project found.";

  const limit = Math.min(Number(args.limit ?? 20), 100);
  const cacheKey = `mcp:keywords:${project.id}:${limit}`;
  const keywords = await getCached(
    cacheKey,
    TTL.KEYWORDS,
    () => fetchTopKeywords(project.id, limit),
    noCache
  );

  if (!keywords.length) return `No keyword data for ${project.name}.`;

  const lines = [
    `## Keywords: ${project.name}`,
    "",
    "| # | Keyword | Position | Change |",
    "|---|---------|----------|--------|",
    ...keywords.map((kw, i) => {
      const change =
        kw.change === null
          ? "NEW"
          : kw.change < 0
          ? `▲ ${Math.abs(kw.change)}`
          : kw.change > 0
          ? `▼ ${kw.change}`
          : "—";
      return `| ${i + 1} | ${kw.keyword} | ${kw.position} | ${change} |`;
    }),
  ];

  return lines.join("\n");
}

async function handleGeoReport(
  args: Record<string, unknown>,
  noCache: boolean
): Promise<string> {
  const project = await resolveProject(args.project as string | undefined);
  if (!project) return "No project found.";

  const days = Number(args.days ?? 30);
  const cacheKey = `mcp:geo:${project.id}:${days}`;
  const geo = await getCached(
    cacheKey,
    TTL.ANALYSIS,
    () => fetchGEOMetrics(project.id, days),
    noCache
  );

  if (!geo.hasData) return `No GEO data for ${project.name} in the last ${days} days.`;

  const lines = [
    `## AI Visibility Report: ${project.name}`,
    `_Last ${days} days_`,
    "",
    `**Citation Rate:** ${geo.citationRate.toFixed(1)}%`,
    `**Total Citations:** ${geo.totalCitations}`,
    "",
    "### By Platform",
    ...Object.entries(geo.platforms).map(([p, n]) => `- ${p}: ${n} citations`),
  ];

  return lines.join("\n");
}

async function handleRecommendations(
  args: Record<string, unknown>,
  noCache: boolean
): Promise<string> {
  const project = await resolveProject(args.project as string | undefined);
  if (!project) return "No project found.";

  const limit = Number(args.limit ?? 10);
  const cacheKey = `mcp:insights:${project.id}:${limit}`;
  const insights = await getCached(
    cacheKey,
    TTL.PROJECT_STATUS,
    () => fetchInsights(project.id, limit),
    noCache
  );

  if (!insights.length) return `No recommendations for ${project.name} right now.`;

  const lines = [
    `## Recommendations: ${project.name}`,
    "",
    ...insights.map((ins, i) => [
      `### ${i + 1}. ${ins.title} [${ins.severity.toUpperCase()}]`,
      ins.summary,
      ins.estimated_impact_usd != null
        ? `_Estimated impact: $${ins.estimated_impact_usd.toLocaleString()}_`
        : "",
      "",
    ].filter(Boolean).join("\n")),
  ];

  return lines.join("\n");
}

async function handleCompetitors(
  args: Record<string, unknown>,
  noCache: boolean
): Promise<string> {
  const project = await resolveProject(args.project as string | undefined);
  if (!project) return "No project found.";

  // For competitor analysis we use top keywords as a proxy (keywords ranked 11-50)
  const cacheKey = `mcp:competitors:${project.id}`;
  const keywords = await getCached(
    cacheKey,
    TTL.ANALYSIS,
    () => fetchTopKeywords(project.id, 100),
    noCache
  );

  const competitorOpps = keywords.filter((k) => k.position > 10 && k.position <= 50);

  if (!competitorOpps.length) {
    return `No competitor analysis data for ${project.name}.`;
  }

  const lines = [
    `## Competitor Analysis: ${project.name}`,
    "",
    "Keywords ranked 11-50 (opportunities to overtake competitors):",
    "",
    "| Keyword | Position | Change |",
    "|---------|----------|--------|",
    ...competitorOpps.slice(0, 20).map((kw) => {
      const change =
        kw.change === null ? "NEW" : kw.change < 0 ? `▲ ${Math.abs(kw.change)}` : kw.change > 0 ? `▼ ${kw.change}` : "—";
      return `| ${kw.keyword} | ${kw.position} | ${change} |`;
    }),
  ];

  return lines.join("\n");
}

// ---- Main MCP server loop ----

interface MCPServeOptions {
  project?: string;
  noCache?: boolean;
}

export async function mcpServeCommand(opts: MCPServeOptions = {}): Promise<void> {
  const noCache = opts.noCache ?? false;

  // Signal readiness via stderr (not stdout — that's the JSON-RPC channel)
  process.stderr.write("[ezeo mcp] Server started. Listening on stdin...\n");

  const rl = createInterface({ input: process.stdin, terminal: false });

  rl.on("line", async (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;

    let req: MCPRequest;
    try {
      req = JSON.parse(trimmed) as MCPRequest;
    } catch {
      sendResponse(errorResponse(null, -32700, "Parse error"));
      return;
    }

    const { id, method, params = {} } = req;

    try {
      switch (method) {
        case "initialize": {
          sendResponse({
            jsonrpc: "2.0",
            id,
            result: {
              protocolVersion: "2024-11-05",
              capabilities: { tools: {} },
              serverInfo: {
                name: "ezeo-mcp-server",
                version: "0.3.0",
              },
            },
          });
          break;
        }

        case "initialized": {
          // Notification — no response needed
          break;
        }

        case "tools/list": {
          sendResponse({
            jsonrpc: "2.0",
            id,
            result: { tools: TOOLS },
          });
          break;
        }

        case "tools/call": {
          const toolName = params.name as string;
          const args = (params.arguments ?? {}) as Record<string, unknown>;

          // Allow per-call project override; fall back to CLI-level default
          const mergedArgs = opts.project
            ? { project: opts.project, ...args }
            : args;

          let text: string;
          switch (toolName) {
            case "ezeo_project_status":
              text = await handleProjectStatus(mergedArgs, noCache);
              break;
            case "ezeo_keywords":
              text = await handleKeywords(mergedArgs, noCache);
              break;
            case "ezeo_geo_report":
              text = await handleGeoReport(mergedArgs, noCache);
              break;
            case "ezeo_recommendations":
              text = await handleRecommendations(mergedArgs, noCache);
              break;
            case "ezeo_competitors":
              text = await handleCompetitors(mergedArgs, noCache);
              break;
            default:
              sendResponse(
                errorResponse(id, -32601, `Unknown tool: ${toolName}`)
              );
              return;
          }

          sendResponse({
            jsonrpc: "2.0",
            id,
            result: { content: textContent(text) },
          });
          break;
        }

        default: {
          sendResponse(errorResponse(id, -32601, `Method not found: ${method}`));
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      sendResponse(errorResponse(id, -32603, "Internal error", msg));
    }
  });

  rl.on("close", () => {
    process.stderr.write("[ezeo mcp] stdin closed. Exiting.\n");
    process.exit(0);
  });
}
