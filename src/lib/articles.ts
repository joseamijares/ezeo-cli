/**
 * Pure helpers for `ezeo articles`, ported from the Ezeo app's
 * `src/features/content-pipeline/requestArticles.ts` so the CLI reports a
 * request exactly as the app's Articles page and week planner do.
 *
 * Starting articles is one RPC, `request_content_articles(project, count)`.
 * It composes produce cycle -> surface topics -> approve_topic for the CURRENT
 * ISO week under the caller's own auth, and every real gate (org membership,
 * automation enabled, weekly quota, pay-per-work credits, Prompt Maestro
 * binding, eligible candidates) lives server-side. The CLI adds no authority.
 */

export interface RequestArticlesResult {
  ok?: boolean;
  reason?: string | null;
  detail?: unknown;
  cycle_id?: string | null;
  iso_week?: string | null;
  requested?: number | null;
  created?: number | null;
  run_ids?: string[] | null;
  existing_run_ids?: string[] | null;
  skipped?: Array<{ opportunity_id?: string; rank?: number | null; reason?: string }> | null;
}

export interface RequestArticlesSummary {
  /** `started` = at least one NEW run was created. */
  tone: "started" | "nothing_new";
  headline: string;
  details: string[];
}

/** The RPC clamps p_count to [1, 10] itself; mirrored so the CLI can say so first. */
export const REQUEST_ARTICLES_RPC_MAX = 10;

export function clampRequestCount(requested: number): number {
  return Math.min(Math.max(Math.floor(requested) || 1, 1), REQUEST_ARTICLES_RPC_MAX);
}

/**
 * Parse `--count`. Missing means 1. Anything that is not a positive whole
 * number is rejected (null) rather than clamped, because clamping `0` or
 * `abc` up to 1 would start a paid article nobody asked for.
 */
export function parseRequestCount(raw: string | undefined): number | null {
  if (raw === undefined) return 1;
  const text = raw.trim();
  if (!/^\d+$/.test(text)) return null;
  const n = Number(text);
  return n >= 1 ? n : null;
}

/** Postgres RAISE text without the `function_name: ` prefixes (up to 3 deep). */
export function requestArticlesErrorCopy(message: string): string {
  let text = message.trim();
  for (let i = 0; i < 3; i++) {
    const next = text.replace(
      /^(request_content_articles|produce_content_pipeline_cycle|surface_cycle_topics|approve_topic|consume_allowance_for_run):\s*/i,
      ""
    );
    if (next === text) break;
    text = next;
  }
  return text;
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

/**
 * Name every bucket the RPC reports (created, already existing, skipped).
 * "3 started" when 0 were created and 3 already existed would be false.
 */
export function summarizeRequestArticles(
  result: RequestArticlesResult | null | undefined
): RequestArticlesSummary {
  const created = result?.created ?? (Array.isArray(result?.run_ids) ? result.run_ids.length : 0);
  const existing = Array.isArray(result?.existing_run_ids) ? result.existing_run_ids.length : 0;
  const skipped = result?.skipped ?? [];
  const week = result?.iso_week ? ` for ${result.iso_week}` : "";
  const details: string[] = [];

  if (result?.ok === false && result?.reason === "no_cycle") {
    const detail =
      result.detail == null
        ? "the RPC returned no detail"
        : typeof result.detail === "string"
          ? result.detail
          : JSON.stringify(result.detail);
    return {
      tone: "nothing_new",
      headline: `No topics could be prepared${week}.`,
      details: [`The weekly cycle was not produced: ${detail}`],
    };
  }

  if (existing > 0) {
    details.push(
      `${plural(existing, "topic")} already had a run this week and ${existing === 1 ? "was" : "were"} not started again.`
    );
  }
  for (const s of skipped) {
    const why = s?.reason ? requestArticlesErrorCopy(s.reason) : "refused";
    details.push(`Skipped topic${typeof s?.rank === "number" ? ` #${s.rank}` : ""}: ${why}`);
  }

  if (created > 0) {
    return {
      tone: "started",
      headline: `${plural(created, "article")} started${week}. Writing runs in the background; anything that needs approval appears under Pending approvals in the app.`,
      details,
    };
  }

  if (details.length === 0) details.push("The pipeline returned no new runs and gave no reason.");
  return { tone: "nothing_new", headline: `No new articles were started${week}.`, details };
}
