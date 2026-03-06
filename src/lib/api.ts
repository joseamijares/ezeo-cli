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
  const sb = await getClient();
  const { data, error } = await sb
    .from("projects")
    .select("id, name, domain, created_at, google_analytics_connected, search_console_connected, shopify_connected")
    .order("name");
  if (error) throw new Error(`Failed to fetch projects: ${error.message}`);
  return (data ?? []) as Project[];
}

export interface GSCMetrics {
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export async function fetchGSCMetrics(
  projectId: string,
  days: number = 7
): Promise<GSCMetrics> {
  const sb = await getClient();
  const since = new Date();
  since.setDate(since.getDate() - days);

  const { data, error } = await sb
    .from("search_console_data")
    .select("clicks, impressions, ctr, position")
    .eq("project_id", projectId)
    .gte("date", since.toISOString().split("T")[0]);

  if (error) throw new Error(`GSC query failed: ${error.message}`);
  if (!data || data.length === 0) return { clicks: 0, impressions: 0, ctr: 0, position: 0 };

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
  };
}

export interface GA4Metrics {
  sessions: number;
  users: number;
  bounceRate: number;
}

export async function fetchGA4Metrics(
  projectId: string,
  days: number = 7
): Promise<GA4Metrics> {
  const sb = await getClient();
  const since = new Date();
  since.setDate(since.getDate() - days);

  const { data, error } = await sb
    .from("analytics_data")
    .select("sessions, active_users, bounce_rate")
    .eq("project_id", projectId)
    .gte("date", since.toISOString().split("T")[0]);

  if (error) throw new Error(`GA4 query failed: ${error.message}`);
  if (!data || data.length === 0) return { sessions: 0, users: 0, bounceRate: 0 };

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
  };
}

export interface GEOMetrics {
  totalCitations: number;
  platforms: Record<string, number>;
  citationRate: number;
}

export async function fetchGEOMetrics(
  projectId: string,
  days: number = 30
): Promise<GEOMetrics> {
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
    return { totalCitations: 0, platforms: {}, citationRate: 0 };

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
  };
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
  const sb = await getClient();
  const { data, error } = await sb
    .from("project_insights")
    .select("id, detector_type, severity, title, summary, impact_score, created_at")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(`Insights query failed: ${error.message}`);
  return (data ?? []) as Insight[];
}
