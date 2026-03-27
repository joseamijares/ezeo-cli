import type Anthropic from "@anthropic-ai/sdk";
import {
  fetchProjects,
  fetchGSCMetricsWoW,
  fetchGA4MetricsWoW,
  fetchGEOMetrics,
  fetchRankingsSummary,
  fetchInsights,
  fetchTopKeywords,
  fetchGSCMetrics,
  fetchGA4Metrics,
  fetchCROAudits,
  fetchCRODeliverables,
  fetchContentOpportunities,
  fetchDecliningPages,
  fetchKeywordBriefData,
} from "../api.js";

export const AGENT_TOOLS: Anthropic.Tool[] = [
  {
    name: "list_projects",
    description: "List all SEO projects the user has access to, with their connection status for GSC, GA4, and Shopify.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "get_status",
    description:
      "Get the full SEO dashboard for a project: GSC traffic (clicks, impressions, CTR, position), GA4 analytics (sessions, pageviews, bounce rate), GEO/AI citation metrics, rankings summary, and top insights/alerts.",
    input_schema: {
      type: "object" as const,
      properties: {
        project_id: {
          type: "string",
          description: "The project ID to get status for",
        },
      },
      required: ["project_id"],
    },
  },
  {
    name: "get_keywords",
    description:
      "Get top ranking keywords with their current positions and week-over-week position changes. Negative change means improvement (moved up). Positive change means drop (moved down).",
    input_schema: {
      type: "object" as const,
      properties: {
        project_id: {
          type: "string",
          description: "The project ID to get keywords for",
        },
        limit: {
          type: "number",
          description: "Number of keywords to fetch (default: 20, max: 50)",
        },
      },
      required: ["project_id"],
    },
  },
  {
    name: "get_insights",
    description:
      "Get automated SEO alerts and insights for a project: ranking drops, traffic anomalies, CTR issues, and improvement opportunities. Each insight has a severity (critical, warning, info).",
    input_schema: {
      type: "object" as const,
      properties: {
        project_id: {
          type: "string",
          description: "The project ID to get insights for",
        },
        limit: {
          type: "number",
          description: "Number of insights to fetch (default: 10)",
        },
      },
      required: ["project_id"],
    },
  },
  {
    name: "get_geo",
    description:
      "Get AI/GEO visibility metrics: total citations, citation rate percentage, and breakdown by AI platform (ChatGPT, Perplexity, Gemini, Claude, Bing Copilot, etc.).",
    input_schema: {
      type: "object" as const,
      properties: {
        project_id: {
          type: "string",
          description: "The project ID to get GEO metrics for",
        },
      },
      required: ["project_id"],
    },
  },
  {
    name: "get_traffic",
    description:
      "Get detailed traffic metrics from Google Search Console (clicks, impressions, CTR, average position) and Google Analytics 4 (sessions, pageviews, bounce rate, average session duration).",
    input_schema: {
      type: "object" as const,
      properties: {
        project_id: {
          type: "string",
          description: "The project ID to get traffic metrics for",
        },
      },
      required: ["project_id"],
    },
  },
  {
    name: "get_cro",
    description:
      "Get CRO (Conversion Rate Optimization) audit scores and findings plus pending CRO deliverables for a project.",
    input_schema: {
      type: "object" as const,
      properties: {
        project_id: {
          type: "string",
          description: "The project ID to get CRO data for",
        },
      },
      required: ["project_id"],
    },
  },
  {
    name: "get_content_opportunities",
    description:
      "Get content gap opportunities: keywords the site ranks for but not in the top 10, sorted by search volume. These are high-priority pages to refresh or improve.",
    input_schema: {
      type: "object" as const,
      properties: {
        project_id: {
          type: "string",
          description: "The project ID to get content opportunities for",
        },
        limit: {
          type: "number",
          description: "Number of opportunities to fetch (default: 20)",
        },
      },
      required: ["project_id"],
    },
  },
  {
    name: "get_declining_pages",
    description:
      "Get pages with declining rankings over the past 30 days. Returns keywords where current position is worse than the position 30 days ago by at least the minimum drop threshold.",
    input_schema: {
      type: "object" as const,
      properties: {
        project_id: {
          type: "string",
          description: "The project ID to get declining pages for",
        },
        min_drop: {
          type: "number",
          description: "Minimum position drop to include (default: 3). A drop of 3 means the keyword fell at least 3 positions.",
        },
      },
      required: ["project_id"],
    },
  },
  {
    name: "get_keyword_brief",
    description:
      "Generate a content brief for a specific keyword: current ranking position, search volume, related keywords, and competitor URLs. Use this before writing or refreshing content.",
    input_schema: {
      type: "object" as const,
      properties: {
        project_id: {
          type: "string",
          description: "The project ID",
        },
        keyword: {
          type: "string",
          description: "The keyword to generate a brief for",
        },
      },
      required: ["project_id", "keyword"],
    },
  },
];

export async function executeTool(
  name: string,
  input: Record<string, unknown>
): Promise<string> {
  try {
    switch (name) {
      case "list_projects": {
        const projects = await fetchProjects();
        if (projects.length === 0) return "No projects found.";
        return JSON.stringify(
          projects.map((p) => ({
            id: p.id,
            name: p.name,
            domain: p.domain,
            gsc_connected: p.search_console_connected,
            ga4_connected: p.google_analytics_connected,
            shopify_connected: p.shopify_connected,
          }))
        );
      }

      case "get_status": {
        const projectId = input.project_id as string;
        const [gscWoW, ga4WoW, geo, rankings, insights, topKeywords] =
          await Promise.all([
            fetchGSCMetricsWoW(projectId).catch(() => null),
            fetchGA4MetricsWoW(projectId).catch(() => null),
            fetchGEOMetrics(projectId).catch(() => null),
            fetchRankingsSummary(projectId).catch(() => null),
            fetchInsights(projectId, 5).catch(() => []),
            fetchTopKeywords(projectId, 10).catch(() => []),
          ]);
        return JSON.stringify({ gscWoW, ga4WoW, geo, rankings, insights, topKeywords });
      }

      case "get_keywords": {
        const projectId = input.project_id as string;
        const limit = Math.min((input.limit as number | undefined) ?? 20, 50);
        const keywords = await fetchTopKeywords(projectId, limit);
        return JSON.stringify(keywords);
      }

      case "get_insights": {
        const projectId = input.project_id as string;
        const limit = (input.limit as number | undefined) ?? 10;
        const insights = await fetchInsights(projectId, limit);
        return JSON.stringify(insights);
      }

      case "get_geo": {
        const projectId = input.project_id as string;
        const geo = await fetchGEOMetrics(projectId);
        return JSON.stringify(geo);
      }

      case "get_traffic": {
        const projectId = input.project_id as string;
        const [gsc, ga4] = await Promise.all([
          fetchGSCMetrics(projectId).catch(() => null),
          fetchGA4Metrics(projectId).catch(() => null),
        ]);
        return JSON.stringify({ gsc, ga4 });
      }

      case "get_cro": {
        const projectId = input.project_id as string;
        const [audits, deliverables] = await Promise.all([
          fetchCROAudits(projectId).catch(() => []),
          fetchCRODeliverables(projectId).catch(() => []),
        ]);
        return JSON.stringify({ audits, deliverables });
      }

      case "get_content_opportunities": {
        const projectId = input.project_id as string;
        const limit = (input.limit as number | undefined) ?? 20;
        const opportunities = await fetchContentOpportunities(projectId, limit);
        return JSON.stringify(opportunities);
      }

      case "get_declining_pages": {
        const projectId = input.project_id as string;
        const minDrop = (input.min_drop as number | undefined) ?? 3;
        const pages = await fetchDecliningPages(projectId, minDrop);
        return JSON.stringify(pages);
      }

      case "get_keyword_brief": {
        const projectId = input.project_id as string;
        const keyword = input.keyword as string;
        const brief = await fetchKeywordBriefData(projectId, keyword);
        if (!brief) return `No data found for keyword: ${keyword}`;
        return JSON.stringify(brief);
      }

      default:
        return `Unknown tool: ${name}`;
    }
  } catch (err) {
    return `Error executing ${name}: ${err instanceof Error ? err.message : String(err)}`;
  }
}
