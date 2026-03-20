/**
 * Response caching for Ezeo CLI using the `conf` package.
 * TTLs: project status (5 min), keywords (1 hour), analysis (24 hours)
 */

import Conf from "conf";

export const TTL = {
  PROJECT_STATUS: 5 * 60 * 1000,    // 5 minutes
  KEYWORDS: 60 * 60 * 1000,         // 1 hour
  ANALYSIS: 24 * 60 * 60 * 1000,    // 24 hours
} as const;

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

// Separate Conf store for cache (so it doesn't pollute main config)
const cacheStore = new Conf<Record<string, CacheEntry<unknown>>>({
  projectName: "ezeo-cache",
  clearInvalidConfig: true,
});

/**
 * Get a cached value or fetch fresh data.
 * @param key   Cache key (use a stable, descriptive string)
 * @param ttlMs Time-to-live in milliseconds
 * @param fetcher Async function that returns fresh data
 * @param noCache If true, skip cache and fetch fresh
 */
export async function getCached<T>(
  key: string,
  ttlMs: number,
  fetcher: () => Promise<T>,
  noCache = false
): Promise<T> {
  if (!noCache) {
    const entry = cacheStore.get(key) as CacheEntry<T> | undefined;
    if (entry && entry.expiresAt > Date.now()) {
      return entry.data;
    }
  }

  const data = await fetcher();
  cacheStore.set(key, { data, expiresAt: Date.now() + ttlMs });
  return data;
}

/**
 * Manually delete a single cache entry.
 */
export function invalidateCache(key: string): void {
  cacheStore.delete(key);
}

/**
 * Wipe the entire cache store.
 */
export function clearCache(): void {
  cacheStore.clear();
}

/**
 * Return a summary of all cached entries (key, expiresAt, expired).
 */
export function listCacheEntries(): Array<{
  key: string;
  expiresAt: number;
  expired: boolean;
}> {
  const now = Date.now();
  const store = cacheStore.store as Record<string, CacheEntry<unknown>>;
  return Object.entries(store).map(([key, entry]) => ({
    key,
    expiresAt: entry.expiresAt,
    expired: entry.expiresAt <= now,
  }));
}
