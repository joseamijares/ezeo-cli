import { createClient, SupabaseClient } from "@supabase/supabase-js";
import {
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  loadCredentials,
  saveCredentials,
  isTokenExpired,
  type Credentials,
} from "./config.js";

let client: SupabaseClient | null = null;

export async function getClient(): Promise<SupabaseClient> {
  const creds = loadCredentials();
  if (!creds || !creds.access_token) {
    throw new Error("Not logged in. Run `ezeo login` first.");
  }

  if (!client) {
    client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
      global: {
        headers: {
          Authorization: `Bearer ${creds.access_token}`,
        },
      },
    });
  }

  // Refresh token if expired
  if (isTokenExpired(creds)) {
    const freshClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const { data, error } = await freshClient.auth.refreshSession({
      refresh_token: creds.refresh_token,
    });
    if (error || !data.session) {
      throw new Error("Session expired. Run `ezeo login` again.");
    }
    const newCreds: Credentials = {
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      expires_at: data.session.expires_at ?? 0,
      user_email: creds.user_email,
    };
    saveCredentials(newCreds);

    // Recreate client with new token
    client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: {
        headers: { Authorization: `Bearer ${newCreds.access_token}` },
      },
    });
  }

  return client;
}

export async function getAuthClient(): Promise<SupabaseClient> {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

// ---- Data fetching helpers ----

export interface Project {
  id: string;
  name: string;
  domain: string;
  created_at: string;
  google_analytics_connected: boolean;
  search_console_connected: boolean;
  shopify_connected: boolean;
}

export async function fetchProjects(): Promise<Project[]> {
  try {
    const sb = await getClient();
    const { data, error } = await sb
      .from("projects")
      .select("id, name, domain, created_at, ga_property_id, gsc_site_url, shopify_shop_domain, status")
      .eq("status", "active")
      .order("name");
    if (error) throw new Error(`Failed to fetch projects: ${error.message}`);
    return (data ?? []).map((p: Record<string, unknown>) => ({
      id: p.id as string,
      name: p.name as string,
      domain: (p.domain as string) ?? "",
      created_at: p.created_at as string,
      google_analytics_connected: !!(p.ga_property_id),
      search_console_connected: !!(p.gsc_site_url),
      shopify_connected: !!(p.shopify_shop_domain),
    }));
  } catch (err) {
    if (err instanceof Error) throw err;
    throw new Error(`Network error fetching projects: ${String(err)}`);
  }
}

export interface GSCMetrics {
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
  hasData: boolean;
}

export async function fetchGSCMetrics(
  projectId: string,
  days: number = 7
): Promise<GSCMetrics> {
  try {
    const sb = await getClient();
    const since = new Date();
    since.setDate(since.getDate() - days);

    const { data, error } = await sb
      .from("search_console_data")
      .select("clicks, impressions, ctr, average_position")
      .eq("project_id", projectId)
      .gte("date", since.toISOString().split("T")[0]);

    if (error) throw new Error(`GSC query failed: ${error.message}`);
    if (!data || data.length === 0) {
      return { clicks: 0, impressions: 0, ctr: 0, position: 0, hasData: false };
    }

    const totals = data.reduce(
      (acc, row) => ({
        clicks: acc.clicks + (row.clicks ?? 0),
        impressions: acc.impressions + (row.impressions ?? 0),
        position: acc.position + (row.average_position ?? 0),
      }),
      { clicks: 0, impressions: 0, position: 0 }
    );

    const count = data.length;
    // CTR = total clicks / total impressions (not average of per-row CTRs)
    const ctr = totals.impressions > 0 ? totals.clicks / totals.impressions : 0;
    return {
      clicks: totals.clicks,
      impressions: totals.impressions,
      ctr,
      position: count > 0 ? totals.position / count : 0,
      hasData: true,
    };
  } catch (err) {
    if (err instanceof Error) throw err;
    throw new Error(`Network error fetching GSC metrics: ${String(err)}`);
  }
}

// ---- Week-over-Week types ----

export interface MetricDelta {
  value: number;
  pct: number | null; // null when previous = 0
}

export interface GSCMetricsWoW {
  current: GSCMetrics;
  previous: GSCMetrics;
  delta: {
    clicks: MetricDelta;
    impressions: MetricDelta;
    ctr: MetricDelta;
    position: MetricDelta; // lower = better; negative delta is good
  };
}

export interface GA4MetricsWoW {
  current: GA4Metrics;
  previous: GA4Metrics;
  delta: {
    sessions: MetricDelta;
    pageviews: MetricDelta;
    bounceRate: MetricDelta; // lower = better
  };
}

function calcDelta(current: number, previous: number): MetricDelta {
  const value = current - previous;
  const pct = previous !== 0 ? (value / previous) * 100 : null;
  return { value, pct };
}

/** Fetch current 7d vs previous 7d GSC metrics with delta % */
export async function fetchGSCMetricsWoW(projectId: string): Promise<GSCMetricsWoW> {
  const [current, previous] = await Promise.all([
    fetchGSCMetrics(projectId, 7),
    fetchGSCMetricsPeriod(projectId, 14, 7),
  ]);

  return {
    current,
    previous,
    delta: {
      clicks: calcDelta(current.clicks, previous.clicks),
      impressions: calcDelta(current.impressions, previous.impressions),
      ctr: calcDelta(current.ctr, previous.ctr),
      position: calcDelta(current.position, previous.position),
    },
  };
}

/** Fetch GSC data for a specific window (daysAgo to daysAgo - windowSize) */
async function fetchGSCMetricsPeriod(
  projectId: string,
  daysAgo: number,
  windowSize: number
): Promise<GSCMetrics> {
  try {
    const sb = await getClient();
    const start = new Date();
    start.setDate(start.getDate() - daysAgo);
    const end = new Date();
    end.setDate(end.getDate() - (daysAgo - windowSize));

    const { data, error } = await sb
      .from("search_console_data")
      .select("clicks, impressions, ctr, average_position")
      .eq("project_id", projectId)
      .gte("date", start.toISOString().split("T")[0])
      .lt("date", end.toISOString().split("T")[0]);

    if (error) throw new Error(`GSC period query failed: ${error.message}`);
    if (!data || data.length === 0) {
      return { clicks: 0, impressions: 0, ctr: 0, position: 0, hasData: false };
    }

    const totals = data.reduce(
      (acc, row) => ({
        clicks: acc.clicks + (row.clicks ?? 0),
        impressions: acc.impressions + (row.impressions ?? 0),
        position: acc.position + (row.average_position ?? 0),
      }),
      { clicks: 0, impressions: 0, position: 0 }
    );

    const count = data.length;
    const ctr = totals.impressions > 0 ? totals.clicks / totals.impressions : 0;
    return {
      clicks: totals.clicks,
      impressions: totals.impressions,
      ctr,
      position: count > 0 ? totals.position / count : 0,
      hasData: true,
    };
  } catch (err) {
    if (err instanceof Error) throw err;
    throw new Error(`Network error: ${String(err)}`);
  }
}

export interface GA4Metrics {
  sessions: number;
  pageviews: number;
  pagesPerSession: number;
  bounceRate: number;
  avgDuration: number;
  hasData: boolean;
}

export async function fetchGA4Metrics(
  projectId: string,
  days: number = 7
): Promise<GA4Metrics> {
  try {
    const sb = await getClient();
    const since = new Date();
    since.setDate(since.getDate() - days);

    const { data, error } = await sb
      .from("analytics_data")
      .select("metrics")
      .eq("project_id", projectId)
      .gte("date", since.toISOString().split("T")[0]);

    if (error) throw new Error(`GA4 query failed: ${error.message}`);
    if (!data || data.length === 0) {
      return { sessions: 0, pageviews: 0, pagesPerSession: 0, bounceRate: 0, avgDuration: 0, hasData: false };
    }

    const totals = data.reduce(
      (acc, row) => {
        const m = (row.metrics ?? {}) as Record<string, number>;
        return {
          sessions: acc.sessions + (m.sessions ?? 0),
          pageviews: acc.pageviews + (m.screenPageViews ?? 0),
          bounceCount: acc.bounceCount + (m.bounceRate ?? 0), // bounceRate is 0 or 1 per row
          avgDuration: acc.avgDuration + (m.averageSessionDuration ?? 0),
          count: acc.count + 1,
        };
      },
      { sessions: 0, pageviews: 0, bounceCount: 0, avgDuration: 0, count: 0 }
    );

    return {
      sessions: totals.sessions,
      pageviews: totals.pageviews,
      pagesPerSession: totals.sessions > 0 ? totals.pageviews / totals.sessions : 0,
      bounceRate: totals.count > 0 ? (totals.bounceCount / totals.count) * 100 : 0, // convert to percentage
      avgDuration: totals.count > 0 ? totals.avgDuration / totals.count : 0,
      hasData: true,
    };
  } catch (err) {
    if (err instanceof Error) throw err;
    throw new Error(`Network error fetching GA4 metrics: ${String(err)}`);
  }
}

/** Fetch GA4 data for a specific window */
async function fetchGA4MetricsPeriod(
  projectId: string,
  daysAgo: number,
  windowSize: number
): Promise<GA4Metrics> {
  try {
    const sb = await getClient();
    const start = new Date();
    start.setDate(start.getDate() - daysAgo);
    const end = new Date();
    end.setDate(end.getDate() - (daysAgo - windowSize));

    const { data, error } = await sb
      .from("analytics_data")
      .select("metrics")
      .eq("project_id", projectId)
      .gte("date", start.toISOString().split("T")[0])
      .lt("date", end.toISOString().split("T")[0]);

    if (error) throw new Error(`GA4 period query failed: ${error.message}`);
    if (!data || data.length === 0) {
      return { sessions: 0, pageviews: 0, pagesPerSession: 0, bounceRate: 0, avgDuration: 0, hasData: false };
    }

    const totals = data.reduce(
      (acc, row) => {
        const m = (row.metrics ?? {}) as Record<string, number>;
        return {
          sessions: acc.sessions + (m.sessions ?? 0),
          pageviews: acc.pageviews + (m.screenPageViews ?? 0),
          bounceCount: acc.bounceCount + (m.bounceRate ?? 0),
          avgDuration: acc.avgDuration + (m.averageSessionDuration ?? 0),
          count: acc.count + 1,
        };
      },
      { sessions: 0, pageviews: 0, bounceCount: 0, avgDuration: 0, count: 0 }
    );

    return {
      sessions: totals.sessions,
      pageviews: totals.pageviews,
      pagesPerSession: totals.sessions > 0 ? totals.pageviews / totals.sessions : 0,
      bounceRate: totals.count > 0 ? (totals.bounceCount / totals.count) * 100 : 0,
      avgDuration: totals.count > 0 ? totals.avgDuration / totals.count : 0,
      hasData: true,
    };
  } catch (err) {
    if (err instanceof Error) throw err;
    throw new Error(`Network error: ${String(err)}`);
  }
}

/** Fetch current 7d vs previous 7d GA4 metrics with delta % */
export async function fetchGA4MetricsWoW(projectId: string): Promise<GA4MetricsWoW> {
  const [current, previous] = await Promise.all([
    fetchGA4Metrics(projectId, 7),
    fetchGA4MetricsPeriod(projectId, 14, 7),
  ]);

  return {
    current,
    previous,
    delta: {
      sessions: calcDelta(current.sessions, previous.sessions),
      pageviews: calcDelta(current.pageviews, previous.pageviews),
      bounceRate: calcDelta(current.bounceRate, previous.bounceRate),
    },
  };
}

// ---- Top Keywords ----

export interface TopKeyword {
  keyword: string;
  position: number;
  previousPosition: number | null;
  change: number | null; // negative = improved (moved up)
}

export async function fetchTopKeywords(
  projectId: string,
  limit: number = 5
): Promise<TopKeyword[]> {
  try {
    const sb = await getClient();

    // Get latest ranking per keyword via rankings table (joined through keywords)
    // Use RPC or raw query approach: get keywords with their latest ranking
    const { data, error } = await sb.rpc("get_top_keywords", {
      p_project_id: projectId,
      p_limit: limit,
    });

    if (!error && data && data.length > 0) {
      return data.map((row: Record<string, unknown>) => ({
        keyword: row.keyword as string,
        position: row.position as number,
        previousPosition: (row.previous_position as number) ?? null,
        change: row.previous_position != null
          ? (row.position as number) - (row.previous_position as number)
          : null,
      }));
    }

    // Fallback: manual join via two queries
    const { data: keywords, error: kwErr } = await sb
      .from("keywords")
      .select("id, keyword")
      .eq("project_id", projectId)
      .limit(100);

    if (kwErr || !keywords || keywords.length === 0) return [];

    const keywordIds = keywords.map((k) => k.id as string);
    const { data: rankings, error: rkErr } = await sb
      .from("rankings")
      .select("keyword_id, position, check_date")
      .in("keyword_id", keywordIds)
      .not("position", "is", null)
      .order("check_date", { ascending: false });

    if (rkErr || !rankings || rankings.length === 0) return [];

    // Get latest + previous position per keyword (rankings sorted by check_date desc)
    const latestByKeyword = new Map<string, { position: number; check_date: string }>();
    const previousByKeyword = new Map<string, number>();
    for (const r of rankings) {
      const kid = r.keyword_id as string;
      if (!latestByKeyword.has(kid)) {
        latestByKeyword.set(kid, { position: r.position as number, check_date: r.check_date as string });
      } else if (!previousByKeyword.has(kid)) {
        // Second entry for this keyword = previous position
        previousByKeyword.set(kid, r.position as number);
      }
    }

    // Build keyword map
    const kwMap = new Map(keywords.map((k) => [k.id as string, k.keyword as string]));

    // Sort by position, filter out 101+ (not meaningfully ranking), take top N
    const results = Array.from(latestByKeyword.entries())
      .map(([kid, { position }]) => {
        const prev = previousByKeyword.get(kid) ?? null;
        return {
          keyword: kwMap.get(kid) ?? "unknown",
          position,
          previousPosition: prev,
          change: prev != null ? position - prev : null,
        };
      })
      .filter((r) => r.position <= 100)
      .sort((a, b) => a.position - b.position)
      .slice(0, limit);

    return results;
  } catch (err) {
    if (err instanceof Error) throw err;
    throw new Error(`Network error fetching top keywords: ${String(err)}`);
  }
}

export interface GEOMetrics {
  totalCitations: number;
  platforms: Record<string, number>;
  citationRate: number;
  hasData: boolean;
}

export async function fetchGEOMetrics(
  projectId: string,
  days: number = 30
): Promise<GEOMetrics> {
  try {
    const sb = await getClient();
    const since = new Date();
    since.setDate(since.getDate() - days);

    const { data, error } = await sb
      .from("ai_platform_citations")
      .select("platform, cited, created_at")
      .eq("project_id", projectId)
      .gte("created_at", since.toISOString());

    if (error) throw new Error(`GEO query failed: ${error.message}`);
    if (!data || data.length === 0)
      return { totalCitations: 0, platforms: {}, citationRate: 0, hasData: false };

    const platforms: Record<string, number> = {};
    let citedCount = 0;

    for (const row of data) {
      if (row.cited) {
        citedCount++;
        const p = (row.platform as string) ?? "unknown";
        platforms[p] = (platforms[p] ?? 0) + 1;
      }
    }

    return {
      totalCitations: citedCount,
      platforms,
      citationRate: data.length > 0 ? (citedCount / data.length) * 100 : 0,
      hasData: true,
    };
  } catch (err) {
    if (err instanceof Error) throw err;
    throw new Error(`Network error fetching GEO metrics: ${String(err)}`);
  }
}

export interface RankingsSummary {
  top3: number;
  top10: number;
  top20: number;
  total: number;
}

export async function fetchRankingsSummary(
  projectId: string
): Promise<RankingsSummary> {
  try {
    const sb = await getClient();

    // Get all keywords for project, then their latest rankings
    const { data: keywords, error: kwErr } = await sb
      .from("keywords")
      .select("id")
      .eq("project_id", projectId)
      .limit(500);

    if (kwErr || !keywords || keywords.length === 0) return { top3: 0, top10: 0, top20: 0, total: 0 };

    const keywordIds = keywords.map((k) => k.id as string);
    const { data: rankings, error: rkErr } = await sb
      .from("rankings")
      .select("keyword_id, position, check_date")
      .in("keyword_id", keywordIds)
      .not("position", "is", null)
      .order("check_date", { ascending: false });

    if (rkErr || !rankings) return { top3: 0, top10: 0, top20: 0, total: 0 };

    // Get latest position per keyword
    const latestByKeyword = new Map<string, number>();
    for (const r of rankings) {
      const kid = r.keyword_id as string;
      if (!latestByKeyword.has(kid)) {
        latestByKeyword.set(kid, r.position as number);
      }
    }

    let top3 = 0, top10 = 0, top20 = 0;
    for (const pos of latestByKeyword.values()) {
      if (pos <= 3) top3++;
      if (pos <= 10) top10++;
      if (pos <= 20) top20++;
    }

    return { top3, top10, top20, total: latestByKeyword.size };
  } catch (err) {
    if (err instanceof Error) throw err;
    throw new Error(`Network error fetching rankings: ${String(err)}`);
  }
}

export interface Insight {
  id: string;
  detector: string;
  severity: string;
  title: string;
  summary: string;
  estimated_impact_usd: number | null;
  created_at: string;
}

export async function fetchInsights(
  projectId: string,
  limit: number = 5
): Promise<Insight[]> {
  try {
    const sb = await getClient();
    const { data, error } = await sb
      .from("project_insights")
      .select("id, detector, severity, title, summary, estimated_impact_usd, created_at")
      .eq("project_id", projectId)
      .eq("dismissed", false)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) throw new Error(`Insights query failed: ${error.message}`);
    return (data ?? []) as Insight[];
  } catch (err) {
    if (err instanceof Error) throw err;
    throw new Error(`Network error fetching insights: ${String(err)}`);
  }
}

// ---- CRO ----

export interface CROAudit {
  id: string;
  project_id: string;
  status: string;
  created_at: string;
  findings: Array<{ category: string; severity: string; description: string }>;
  quick_wins: Array<{ title: string; effort: string; impact: string }>;
  overall_score: number | null;
  ux_score: number | null;
  performance_score: number | null;
  conversion_score: number | null;
  mobile_score: number | null;
  title: string;
  target_url: string | null;
}

export interface CRODeliverable {
  id: string;
  project_id: string;
  title: string;
  status: string;
  type: string;
  priority: string;
  created_at: string;
}

export async function fetchCROAudits(
  projectId: string,
  limit: number = 3
): Promise<CROAudit[]> {
  try {
    const sb = await getClient();
    const { data, error } = await sb
      .from("cro_audits")
      .select("id, project_id, status, created_at, findings, quick_wins, overall_score, ux_score, performance_score, conversion_score, mobile_score, title, target_url")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) throw new Error(`CRO audits query failed: ${error.message}`);
    return (data ?? []) as CROAudit[];
  } catch (err) {
    if (err instanceof Error) throw err;
    throw new Error(`Network error fetching CRO audits: ${String(err)}`);
  }
}

export async function fetchCRODeliverables(
  projectId: string
): Promise<CRODeliverable[]> {
  try {
    const sb = await getClient();
    const { data, error } = await sb
      .from("cro_deliverables")
      .select("id, project_id, title, status, type, priority, created_at")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false });

    if (error) throw new Error(`CRO deliverables query failed: ${error.message}`);
    return (data ?? []) as CRODeliverable[];
  } catch (err) {
    if (err instanceof Error) throw err;
    throw new Error(`Network error fetching CRO deliverables: ${String(err)}`);
  }
}
