import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { isTokenExpired, type Credentials } from "../src/lib/config.js";

describe("isTokenExpired", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns false when token is fresh", () => {
    vi.setSystemTime(new Date("2026-03-16T12:00:00Z"));
    const creds: Credentials = {
      access_token: "test",
      refresh_token: "test",
      expires_at: Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
      user_email: "test@test.com",
    };
    expect(isTokenExpired(creds)).toBe(false);
  });

  it("returns true when token is expired", () => {
    vi.setSystemTime(new Date("2026-03-16T12:00:00Z"));
    const creds: Credentials = {
      access_token: "test",
      refresh_token: "test",
      expires_at: Math.floor(Date.now() / 1000) - 60, // 1 minute ago
      user_email: "test@test.com",
    };
    expect(isTokenExpired(creds)).toBe(true);
  });

  it("returns true within 5-minute buffer before expiry", () => {
    vi.setSystemTime(new Date("2026-03-16T12:00:00Z"));
    const creds: Credentials = {
      access_token: "test",
      refresh_token: "test",
      expires_at: Math.floor(Date.now() / 1000) + 200, // 3.3 min from now (< 5 min buffer)
      user_email: "test@test.com",
    };
    expect(isTokenExpired(creds)).toBe(true);
  });

  it("returns false when exactly at 5-minute buffer", () => {
    vi.setSystemTime(new Date("2026-03-16T12:00:00Z"));
    const creds: Credentials = {
      access_token: "test",
      refresh_token: "test",
      expires_at: Math.floor(Date.now() / 1000) + 301, // just over 5 min
      user_email: "test@test.com",
    };
    expect(isTokenExpired(creds)).toBe(false);
  });
});
