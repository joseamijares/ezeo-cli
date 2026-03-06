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
      .select("id, name, domain, created_at, google_analytics_connected, search_console_connected, shopify_connected")
      .order("name");
    if (error) throw new Error(`Failed to fetch projects: ${error.message}`);
    return (data ?? []) as Project[];
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
      .select("clicks, impressions, ctr, position")
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
        ctr: acc.ctr + (row.ctr ?? 0),
        position: acc.position + (row.position ?? 0),
      }),
      { clicks: 0, impressions: 0, ctr: 0, position: 0 }
    );

    const count = data.length;
    return {
      clicks: totals.clicks,
      impressions: totals.impressions,
      ctr: count > 0 ? totals.ctr / count : 0,
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
    users: MetricDelta;
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
      .select("clicks, impressions, ctr, position")
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
        ctr: acc.ctr + (row.ctr ?? 0),
        position: acc.position + (row.position ?? 0),
      }),
      { clicks: 0, impressions: 0, ctr: 0, position: 0 }
    );

    const count = data.length;
    return {
      clicks: totals.clicks,
      impressions: totals.impressions,
      ctr: count > 0 ? totals.ctr / count : 0,
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
  users: number;
  bounceRate: number;
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
      .select("sessions, active_users, bounce_rate")
      .eq("project_id", projectId)
      .gte("date", since.toISOString().split("T")[0]);

    if (error) throw new Error(`GA4 query failed: ${error.message}`);
    if (!data || data.length === 0) {
      return { sessions: 0, users: 0, bounceRate: 0, hasData: false };
    }

    const totals = data.reduce(
      (acc, row) => ({
        sessions: acc.sessions + (row.sessions ?? 0),
        users: acc.users + (row.active_users ?? 0),
        bounceRate: acc.bounceRate + (row.bounce_rate ?? 0),
      }),
      { sessions: 0, users: 0, bounceRate: 0 }
    );

    const count = data.length;
    return {
      sessions: totals.sessions,
      users: totals.users,
      bounceRate: count > 0 ? totals.bounceRate / count : 0,
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
      .select("sessions, active_users, bounce_rate")
      .eq("project_id", projectId)
      .gte("date", start.toISOString().split("T")[0])
      .lt("date", end.toISOString().split("T")[0]);

    if (error) throw new Error(`GA4 period query failed: ${error.message}`);
    if (!data || data.length === 0) {
      return { sessions: 0, users: 0, bounceRate: 0, hasData: false };
    }

    const totals = data.reduce(
      (acc, row) => ({
        sessions: acc.sessions + (row.sessions ?? 0),
        users: acc.users + (row.active_users ?? 0),
        bounceRate: acc.bounceRate + (row.bounce_rate ?? 0),
      }),
      { sessions: 0, users: 0, bounceRate: 0 }
    );

    const count = data.length;
    return {
      sessions: totals.sessions,
      users: totals.users,
      bounceRate: count > 0 ? totals.bounceRate / count : 0,
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
      users: calcDelta(current.users, previous.users),
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

    const { data, error } = await sb
      .from("keyword_rankings")
      .select("keyword, position, previous_position")
      .eq("project_id", projectId)
      .not("position", "is", null)
      .order("position", { ascending: true })
      .limit(limit);

    if (error) throw new Error(`Top keywords query failed: ${error.message}`);
    if (!data || data.length === 0) return [];

    return data.map((row) => {
      const pos = row.position as number;
      const prev = row.previous_position != null ? (row.previous_position as number) : null;
      const change = prev != null ? pos - prev : null; // negative = moved up (good)
      return {
        keyword: row.keyword as string,
        position: pos,
        previousPosition: prev,
        change,
      };
    });
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
      .select("platform, is_cited, checked_at")
      .eq("project_id", projectId)
      .gte("checked_at", since.toISOString());

    if (error) throw new Error(`GEO query failed: ${error.message}`);
    if (!data || data.length === 0)
      return { totalCitations: 0, platforms: {}, citationRate: 0, hasData: false };

    const platforms: Record<string, number> = {};
    let cited = 0;

    for (const row of data) {
      if (row.is_cited) {
        cited++;
        const p = row.platform ?? "unknown";
        platforms[p] = (platforms[p] ?? 0) + 1;
      }
    }

    return {
      totalCitations: cited,
      platforms,
      citationRate: data.length > 0 ? (cited / data.length) * 100 : 0,
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

    const { data, error } = await sb
      .from("keyword_rankings")
      .select("position")
      .eq("project_id", projectId)
      .not("position", "is", null);

    if (error) throw new Error(`Rankings query failed: ${error.message}`);
    if (!data) return { top3: 0, top10: 0, top20: 0, total: 0 };

    let top3 = 0, top10 = 0, top20 = 0;
    for (const row of data) {
      const pos = row.position as number;
      if (pos <= 3) top3++;
      if (pos <= 10) top10++;
      if (pos <= 20) top20++;
    }

    return { top3, top10, top20, total: data.length };
  } catch (err) {
    if (err instanceof Error) throw err;
    throw new Error(`Network error fetching rankings: ${String(err)}`);
  }
}

export interface Insight {
  id: string;
  detector_type: string;
  severity: string;
  title: string;
  summary: string;
  impact_score: number;
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
      .select("id, detector_type, severity, title, summary, impact_score, created_at")
      .eq("project_id", projectId)
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
  findings: unknown;
  score: number | null;
}

export interface CRODeliverable {
  id: string;
  project_id: string;
  title: string;
  status: string;
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
      .select("id, project_id, status, created_at, findings, score")
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
      .select("id, project_id, title, status, priority, created_at")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false });

    if (error) throw new Error(`CRO deliverables query failed: ${error.message}`);
    return (data ?? []) as CRODeliverable[];
  } catch (err) {
    if (err instanceof Error) throw err;
    throw new Error(`Network error fetching CRO deliverables: ${String(err)}`);
  }
}
