/**
 * Pure aggregation over Ezeo's canonical per-day series.
 *
 * These mirror what the Ezeo dashboard computes, so a number the CLI prints is
 * the number the app prints. Every rule here is one the backend learned the
 * hard way (see EZEO_JAMAK_SEO/CLAUDE.md):
 *
 * - Search Console totals come from `search_console_sitewide_daily`, Google's
 *   own per-day figures. The query x page table double-counts a click that
 *   appears under several rows and drops privacy-filtered long-tail rows.
 * - Search Console lags ~3 days, so windows end at today - 4. Ending at today
 *   averages in days Google has not reported yet and every week reads as a drop.
 * - Only days with `reported_by_source` count: the sync zero-fills days the API
 *   omitted, and a placeholder zero is not a measurement.
 * - Average position is impression-weighted, never a mean of row positions.
 * - GA4 sessions come from the `__sitewide__` row only. Per-page rows do not
 *   sum (a session is counted on every page it touched: +59% on EquipMaxx).
 * - A ranking position outside 1..100 is the absent-from-SERP sentinel (101),
 *   not a measured position.
 */

export const GSC_LAG_DAYS = 4;

/** YYYY-MM-DD in UTC, `offsetDays` before `now`. */
export function isoDateDaysAgo(offsetDays: number, now: Date = new Date()): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  d.setUTCDate(d.getUTCDate() - offsetDays);
  return d.toISOString().slice(0, 10);
}

/**
 * Inclusive date window of `days` days ending `endOffset` days ago.
 * `windowEndingDaysAgo(7, 4)` is the 7 reported days before GSC's lag.
 */
export function windowEndingDaysAgo(
  days: number,
  endOffset: number,
  now: Date = new Date()
): { start: string; end: string } {
  return {
    start: isoDateDaysAgo(endOffset + days - 1, now),
    end: isoDateDaysAgo(endOffset, now),
  };
}

export interface GSCDayRow {
  clicks: number | null;
  impressions: number | null;
  average_position: number | null;
}

export interface GSCAggregate {
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
  daysMeasured: number;
  hasData: boolean;
}

export function aggregateGSCDays(rows: GSCDayRow[]): GSCAggregate {
  let clicks = 0;
  let impressions = 0;
  let weightedPosition = 0;
  for (const r of rows) {
    const imp = Number(r.impressions ?? 0);
    clicks += Number(r.clicks ?? 0);
    impressions += imp;
    weightedPosition += Number(r.average_position ?? 0) * imp;
  }
  return {
    clicks,
    impressions,
    ctr: impressions > 0 ? clicks / impressions : 0,
    position: impressions > 0 ? weightedPosition / impressions : 0,
    daysMeasured: rows.length,
    hasData: rows.length > 0,
  };
}

export interface GA4DayRow {
  sessions: number | null;
  metrics: Record<string, unknown> | null;
}

export interface GA4Aggregate {
  sessions: number;
  pageviews: number;
  pagesPerSession: number;
  /** Percentage, session-weighted across days. */
  bounceRate: number;
  /** Seconds, session-weighted across days. */
  avgDuration: number;
  daysMeasured: number;
  hasData: boolean;
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Aggregate `__sitewide__` rows only; callers must filter on page_path. */
export function aggregateGA4Days(rows: GA4DayRow[]): GA4Aggregate {
  let sessions = 0;
  let pageviews = 0;
  let bounceWeighted = 0;
  let durationWeighted = 0;
  for (const r of rows) {
    const m = r.metrics ?? {};
    const s = r.sessions != null ? num(r.sessions) : num(m.sessions);
    sessions += s;
    pageviews += num(m.screenPageViews);
    // GA4 reports bounceRate as a 0..1 fraction of that day's sessions.
    bounceWeighted += num(m.bounceRate) * s;
    durationWeighted += num(m.averageSessionDuration) * s;
  }
  return {
    sessions,
    pageviews,
    pagesPerSession: sessions > 0 ? pageviews / sessions : 0,
    bounceRate: sessions > 0 ? (bounceWeighted / sessions) * 100 : 0,
    avgDuration: sessions > 0 ? durationWeighted / sessions : 0,
    daysMeasured: rows.length,
    hasData: rows.length > 0,
  };
}

/** A measured SERP position: 1..100. 0, null and the 101 sentinel are not. */
export function isMeasuredPosition(p: number | null | undefined): p is number {
  return p != null && Number.isFinite(p) && p >= 1 && p <= 100;
}

export interface KeywordRankingRow {
  id: string;
  keyword: string;
  search_volume: number | null;
  latest_position: number | null;
  latest_url: string | null;
  latest_created_at: string | null;
  previous_position: number | null;
}

export interface RankingsSummaryAggregate {
  top3: number;
  top10: number;
  top20: number;
  /** Keywords with a measured latest position (1..100). */
  ranking: number;
  /** Every tracked keyword, ranked or not. */
  total: number;
}

export function summarizeRankings(rows: KeywordRankingRow[]): RankingsSummaryAggregate {
  let top3 = 0, top10 = 0, top20 = 0, ranking = 0;
  for (const r of rows) {
    if (!isMeasuredPosition(r.latest_position)) continue;
    ranking++;
    if (r.latest_position <= 3) top3++;
    if (r.latest_position <= 10) top10++;
    if (r.latest_position <= 20) top20++;
  }
  return { top3, top10, top20, ranking, total: rows.length };
}
