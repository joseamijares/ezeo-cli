import { createClient, SupabaseClient } from "@supabase/supabase-js";
import {
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  loadCredentials,
  saveCredentials,
  isTokenExpired,
  type Credentials,
} from "./config.js";
import {
  GSC_LAG_DAYS,
  aggregateGA4Days,
  aggregateGSCDays,
  isMeasuredPosition,
  summarizeRankings,
  windowEndingDaysAgo,
  type GA4DayRow,
  type GSCDayRow,
  type KeywordRankingRow,
  type RankingsSummaryAggregate,
} from "./metrics.js";

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
  /** Days Google actually reported in the window (placeholders excluded). */
  daysMeasured: number;
  hasData: boolean;
}

/**
 * Search Console totals for `days` reported days ending `endOffset` days ago.
 * Reads Google's own site-wide daily series, the same source the dashboard's
 * `get_project_search_metrics` uses; see src/lib/metrics.ts for why.
 */
async function fetchGSCWindow(
  projectId: string,
  days: number,
  endOffset: number
): Promise<GSCMetrics> {
  try {
    const sb = await getClient();
    const { start, end } = windowEndingDaysAgo(days, endOffset);
    const { data, error } = await sb
      .from("search_console_sitewide_daily")
      .select("clicks, impressions, average_position")
      .eq("project_id", projectId)
      .eq("reported_by_source", true)
      .gte("date", start)
      .lte("date", end);

    if (error) throw new Error(`GSC query failed: ${error.message}`);
    return aggregateGSCDays((data ?? []) as GSCDayRow[]);
  } catch (err) {
    if (err instanceof Error) throw err;
    throw new Error(`Network error fetching GSC metrics: ${String(err)}`);
  }
}

export async function fetchGSCMetrics(
  projectId: string,
  days: number = 7
): Promise<GSCMetrics> {
  return fetchGSCWindow(projectId, days, GSC_LAG_DAYS);
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

export function calcDelta(current: number, previous: number): MetricDelta {
  const value = current - previous;
  const pct = previous !== 0 ? (value / previous) * 100 : null;
  return { value, pct };
}

/** A delta is only meaningful when both windows were measured. */
function measuredDelta(
  current: { hasData: boolean },
  previous: { hasData: boolean },
  a: number,
  b: number
): MetricDelta {
  if (!current.hasData || !previous.hasData) return { value: 0, pct: null };
  return calcDelta(a, b);
}

/** Last 7 reported days vs the 7 before them, both ending before GSC's lag. */
export async function fetchGSCMetricsWoW(projectId: string): Promise<GSCMetricsWoW> {
  const [current, previous] = await Promise.all([
    fetchGSCWindow(projectId, 7, GSC_LAG_DAYS),
    fetchGSCWindow(projectId, 7, GSC_LAG_DAYS + 7),
  ]);

  return {
    current,
    previous,
    delta: {
      clicks: measuredDelta(current, previous, current.clicks, previous.clicks),
      impressions: measuredDelta(current, previous, current.impressions, previous.impressions),
      ctr: measuredDelta(current, previous, current.ctr, previous.ctr),
      position: measuredDelta(current, previous, current.position, previous.position),
    },
  };
}

export interface GA4Metrics {
  sessions: number;
  pageviews: number;
  pagesPerSession: number;
  bounceRate: number;
  avgDuration: number;
  daysMeasured: number;
  hasData: boolean;
}

/** GA4 site-wide totals for `days` days ending `endOffset` days ago. */
async function fetchGA4Window(
  projectId: string,
  days: number,
  endOffset: number
): Promise<GA4Metrics> {
  try {
    const sb = await getClient();
    const { start, end } = windowEndingDaysAgo(days, endOffset);
    const { data, error } = await sb
      .from("analytics_data")
      .select("sessions, metrics")
      .eq("project_id", projectId)
      .eq("page_path", "__sitewide__")
      .gte("date", start)
      .lte("date", end);

    if (error) throw new Error(`GA4 query failed: ${error.message}`);
    return aggregateGA4Days((data ?? []) as GA4DayRow[]);
  } catch (err) {
    if (err instanceof Error) throw err;
    throw new Error(`Network error fetching GA4 metrics: ${String(err)}`);
  }
}

/** Last `days` complete days (yesterday backwards). Today is still partial. */
export async function fetchGA4Metrics(
  projectId: string,
  days: number = 7
): Promise<GA4Metrics> {
  return fetchGA4Window(projectId, days, 1);
}

/** Last 7 complete days vs the 7 before them. */
export async function fetchGA4MetricsWoW(projectId: string): Promise<GA4MetricsWoW> {
  const [current, previous] = await Promise.all([
    fetchGA4Window(projectId, 7, 1),
    fetchGA4Window(projectId, 7, 8),
  ]);

  return {
    current,
    previous,
    delta: {
      sessions: measuredDelta(current, previous, current.sessions, previous.sessions),
      pageviews: measuredDelta(current, previous, current.pageviews, previous.pageviews),
      bounceRate: measuredDelta(current, previous, current.bounceRate, previous.bounceRate),
    },
  };
}

// ---- Keyword rankings ----

/**
 * Every tracked keyword with its latest and previous ranking row, via the
 * `get_project_keyword_rankings` RPC the Rankings page uses (EZE-1653).
 * The old two-query approach sent every keyword id in a URL and read an
 * unbounded `rankings` query, which PostgREST silently caps at 1,000 rows —
 * EquipMaxx alone has 1,938 keywords and 15,821 ranking rows.
 */
export async function fetchKeywordRankings(projectId: string): Promise<KeywordRankingRow[]> {
  const sb = await getClient();
  const PAGE = 1000;
  const rows: KeywordRankingRow[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await sb.rpc("get_project_keyword_rankings", {
      p_project_id: projectId,
      p_limit: PAGE,
      p_offset: offset,
    });
    if (error) throw new Error(`Rankings query failed: ${error.message}`);
    const page = (data ?? []) as KeywordRankingRow[];
    rows.push(...page);
    if (page.length < PAGE) break;
  }
  return rows;
}

export interface TopKeyword {
  keyword: string;
  position: number;
  previousPosition: number | null;
  change: number | null; // negative = improved (moved up)
}

export function toTopKeywords(rows: KeywordRankingRow[], limit: number): TopKeyword[] {
  return rows
    .filter((r) => isMeasuredPosition(r.latest_position))
    .map((r) => {
      const position = r.latest_position as number;
      const prev = isMeasuredPosition(r.previous_position) ? r.previous_position : null;
      return {
        keyword: r.keyword,
        position,
        previousPosition: prev,
        change: prev != null ? position - prev : null,
      };
    })
    .sort((a, b) => a.position - b.position)
    .slice(0, limit);
}

export async function fetchTopKeywords(
  projectId: string,
  limit: number = 5
): Promise<TopKeyword[]> {
  try {
    return toTopKeywords(await fetchKeywordRankings(projectId), limit);
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

export type RankingsSummary = RankingsSummaryAggregate;

export async function fetchRankingsSummary(
  projectId: string
): Promise<RankingsSummary> {
  try {
    return summarizeRankings(await fetchKeywordRankings(projectId));
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

// ---- Content ----

export interface ContentOpportunity {
  keywordId: string;
  keyword: string;
  searchVolume: number;
  currentPosition: number;
}

/** Tracked keywords ranking 11..100 with >100 monthly searches, by volume. */
export function toContentOpportunities(
  rows: KeywordRankingRow[],
  limit: number
): ContentOpportunity[] {
  return rows
    .filter(
      (r) =>
        isMeasuredPosition(r.latest_position) &&
        r.latest_position > 10 &&
        Number(r.search_volume ?? 0) > 100
    )
    .map((r) => ({
      keywordId: r.id,
      keyword: r.keyword,
      searchVolume: Number(r.search_volume ?? 0),
      currentPosition: r.latest_position as number,
    }))
    .sort((a, b) => b.searchVolume - a.searchVolume)
    .slice(0, limit);
}

export async function fetchContentOpportunities(
  projectId: string,
  limit: number = 50
): Promise<ContentOpportunity[]> {
  try {
    return toContentOpportunities(await fetchKeywordRankings(projectId), limit);
  } catch (err) {
    if (err instanceof Error) throw err;
    throw new Error(`Network error fetching content opportunities: ${String(err)}`);
  }
}

export interface KeywordBriefData {
  targetKeyword: string;
  keywordId: string;
  currentPosition: number | null;
  searchVolume: number;
  relatedKeywords: Array<{ keyword: string; searchVolume: number; currentPosition: number | null }>;
  rankingUrls: string[];
}

export async function fetchKeywordBriefData(
  projectId: string,
  keyword: string
): Promise<KeywordBriefData | null> {
  try {
    const rows = await fetchKeywordRankings(projectId);
    const needle = keyword.trim().toLowerCase();
    const byVolume = [...rows].sort(
      (a, b) => Number(b.search_volume ?? 0) - Number(a.search_volume ?? 0)
    );
    const target =
      byVolume.find((r) => r.keyword.toLowerCase() === needle) ??
      byVolume.find((r) => r.keyword.toLowerCase().includes(needle));
    if (!target) return null;

    // The page WE rank with, from the latest check. This used to be labelled
    // "Competitor URLs": `rankings.url` is our own URL, never another site's.
    const rankingUrls = target.latest_url ? [target.latest_url] : [];

    const relatedKeywords = byVolume
      .filter((r) => r.id !== target.id && Number(r.search_volume ?? 0) > 0)
      .slice(0, 10)
      .map((r) => ({
        keyword: r.keyword,
        searchVolume: Number(r.search_volume ?? 0),
        currentPosition: isMeasuredPosition(r.latest_position) ? r.latest_position : null,
      }));

    return {
      targetKeyword: target.keyword,
      keywordId: target.id,
      currentPosition: isMeasuredPosition(target.latest_position) ? target.latest_position : null,
      searchVolume: Number(target.search_volume ?? 0),
      relatedKeywords,
      rankingUrls,
    };
  } catch (err) {
    if (err instanceof Error) throw err;
    throw new Error(`Network error fetching keyword brief: ${String(err)}`);
  }
}

export interface PageAuditEntry {
  keywordId: string;
  keyword: string;
  url: string | null;
  currentPosition: number;
  previousPosition: number;
  positionChange: number; // positive = dropped (worse)
  latestCheckDate: string;
}

/**
 * Keywords whose latest measured position is at least `minDrop` worse than
 * the previous check. A keyword that fell out of the top 100 is not listed
 * here: 101 is a sentinel, not a position, so its "drop" has no size.
 */
export function toDecliningPages(rows: KeywordRankingRow[], minDrop: number): PageAuditEntry[] {
  return rows
    .filter(
      (r) =>
        isMeasuredPosition(r.latest_position) &&
        isMeasuredPosition(r.previous_position) &&
        r.latest_position - r.previous_position >= minDrop
    )
    .map((r) => ({
      keywordId: r.id,
      keyword: r.keyword,
      url: r.latest_url,
      currentPosition: r.latest_position as number,
      previousPosition: r.previous_position as number,
      positionChange: (r.latest_position as number) - (r.previous_position as number),
      latestCheckDate: (r.latest_created_at ?? "").slice(0, 10),
    }))
    .sort((a, b) => b.positionChange - a.positionChange);
}

export async function fetchDecliningPages(
  projectId: string,
  minDrop: number = 3
): Promise<PageAuditEntry[]> {
  try {
    return toDecliningPages(await fetchKeywordRankings(projectId), minDrop);
  } catch (err) {
    if (err instanceof Error) throw err;
    throw new Error(`Network error fetching declining pages: ${String(err)}`);
  }
}

// ---- Weekly readout ----

/**
 * The document Ezeo composes for each active project every Monday 12:00 UTC
 * (`project_weekly_readouts`, EZE-1550): regressions, quick wins, GEO
 * movement and CRO signals, each section carrying its own coverage.
 *
 * Columns are named on purpose. A client's grant on this table excludes
 * `error` (raw provider strings), so `select('*')` fails for them with 42501.
 */
export interface WeeklyReadout {
  id: string;
  week_start: string;
  generated_at: string;
  status: string;
  markdown: string;
  coverage: unknown;
}

export async function fetchWeeklyReadout(
  projectId: string,
  weekStart?: string
): Promise<WeeklyReadout | null> {
  try {
    const sb = await getClient();
    let q = sb
      .from("project_weekly_readouts")
      .select("id, week_start, generated_at, status, markdown, coverage")
      .eq("project_id", projectId);
    if (weekStart) q = q.eq("week_start", weekStart);
    const { data, error } = await q
      .order("week_start", { ascending: false })
      .order("generated_at", { ascending: false })
      .limit(1);
    if (error) throw new Error(`Readout query failed: ${error.message}`);
    return ((data ?? [])[0] as WeeklyReadout | undefined) ?? null;
  } catch (err) {
    if (err instanceof Error) throw err;
    throw new Error(`Network error fetching weekly readout: ${String(err)}`);
  }
}
