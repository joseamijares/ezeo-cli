/**
 * Tests for the response cache module.
 * Uses fake timers to simulate TTL expiry without real delays.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { getCached, clearCache, invalidateCache, listCacheEntries, TTL } from "../src/lib/cache.js";

// We clear the cache before each test for isolation.
beforeEach(() => {
  clearCache();
  vi.useRealTimers(); // reset to real timers by default
});

describe("TTL constants", () => {
  it("PROJECT_STATUS TTL is 5 minutes", () => {
    expect(TTL.PROJECT_STATUS).toBe(5 * 60 * 1000);
  });

  it("KEYWORDS TTL is 1 hour", () => {
    expect(TTL.KEYWORDS).toBe(60 * 60 * 1000);
  });

  it("ANALYSIS TTL is 24 hours", () => {
    expect(TTL.ANALYSIS).toBe(24 * 60 * 60 * 1000);
  });
});

describe("getCached", () => {
  it("calls the fetcher on a cache miss", async () => {
    const fetcher = vi.fn().mockResolvedValue({ value: 42 });
    const result = await getCached("test:miss", TTL.PROJECT_STATUS, fetcher);
    expect(fetcher).toHaveBeenCalledOnce();
    expect(result).toEqual({ value: 42 });
  });

  it("returns cached data on second call (cache hit)", async () => {
    const fetcher = vi.fn().mockResolvedValue({ value: 99 });
    await getCached("test:hit", TTL.PROJECT_STATUS, fetcher);
    const result2 = await getCached("test:hit", TTL.PROJECT_STATUS, fetcher);
    expect(fetcher).toHaveBeenCalledOnce(); // only fetched once
    expect(result2).toEqual({ value: 99 });
  });

  it("re-fetches after TTL expiry", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn()
      .mockResolvedValueOnce("first")
      .mockResolvedValueOnce("second");

    await getCached("test:ttl", 1000, fetcher); // TTL = 1 second
    vi.advanceTimersByTime(1001); // expire the cache

    const result = await getCached("test:ttl", 1000, fetcher);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(result).toBe("second");
  });

  it("bypasses cache when noCache = true", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce("cached")
      .mockResolvedValueOnce("fresh");

    await getCached("test:nocache", TTL.KEYWORDS, fetcher, false);
    const result = await getCached("test:nocache", TTL.KEYWORDS, fetcher, true);

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(result).toBe("fresh");
  });

  it("still writes to cache after a no-cache fetch", async () => {
    const fetcher = vi.fn().mockResolvedValue("data");
    await getCached("test:write-after-nocache", TTL.KEYWORDS, fetcher, true);

    // Next call with cache should hit (value was stored after the no-cache fetch)
    const fetcher2 = vi.fn().mockResolvedValue("should-not-be-called");
    const result = await getCached("test:write-after-nocache", TTL.KEYWORDS, fetcher2);
    expect(fetcher2).not.toHaveBeenCalled();
    expect(result).toBe("data");
  });
});

describe("clearCache", () => {
  it("wipes all entries", async () => {
    const fetcher = vi.fn().mockResolvedValue("hello");
    await getCached("test:clear1", TTL.PROJECT_STATUS, fetcher);
    await getCached("test:clear2", TTL.PROJECT_STATUS, fetcher);

    clearCache();

    const fetcher2 = vi.fn().mockResolvedValue("world");
    await getCached("test:clear1", TTL.PROJECT_STATUS, fetcher2);
    expect(fetcher2).toHaveBeenCalledOnce(); // had to re-fetch after clear
  });
});

describe("invalidateCache", () => {
  it("removes a specific entry without touching others", async () => {
    const fetcherA = vi.fn().mockResolvedValue("A");
    const fetcherB = vi.fn().mockResolvedValue("B");

    await getCached("test:inv:a", TTL.PROJECT_STATUS, fetcherA);
    await getCached("test:inv:b", TTL.PROJECT_STATUS, fetcherB);

    invalidateCache("test:inv:a");

    // A should be re-fetched, B should still be cached
    const fetcherA2 = vi.fn().mockResolvedValue("A2");
    const fetcherB2 = vi.fn().mockResolvedValue("B2");

    await getCached("test:inv:a", TTL.PROJECT_STATUS, fetcherA2);
    await getCached("test:inv:b", TTL.PROJECT_STATUS, fetcherB2);

    expect(fetcherA2).toHaveBeenCalledOnce();
    expect(fetcherB2).not.toHaveBeenCalled();
  });
});

describe("listCacheEntries", () => {
  it("returns an empty array when the cache is empty", () => {
    expect(listCacheEntries()).toEqual([]);
  });

  it("lists all cached entries with expiry info", async () => {
    const fetcher = vi.fn().mockResolvedValue("data");
    await getCached("test:list:1", TTL.PROJECT_STATUS, fetcher);
    await getCached("test:list:2", TTL.KEYWORDS, fetcher);

    const entries = listCacheEntries();
    expect(entries.length).toBe(2);
    const keys = entries.map((e) => e.key);
    expect(keys).toContain("test:list:1");
    expect(keys).toContain("test:list:2");
  });

  it("marks expired entries correctly", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn().mockResolvedValue("x");
    await getCached("test:list:expired", 500, fetcher);

    vi.advanceTimersByTime(1000); // expire the entry
    const entries = listCacheEntries();
    const entry = entries.find((e) => e.key === "test:list:expired");
    expect(entry?.expired).toBe(true);
  });

  it("marks non-expired entries as not expired", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn().mockResolvedValue("y");
    await getCached("test:list:fresh", TTL.KEYWORDS, fetcher);

    vi.advanceTimersByTime(100); // well within TTL
    const entries = listCacheEntries();
    const entry = entries.find((e) => e.key === "test:list:fresh");
    expect(entry?.expired).toBe(false);
  });
});
