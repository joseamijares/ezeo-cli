import { describe, it, expect } from "vitest";
import { isMondayIsoDate, pickProject } from "../src/commands/readout.js";

describe("isMondayIsoDate", () => {
  it("accepts a real Monday", () => {
    expect(isMondayIsoDate("2026-09-21")).toBe(true);
  });

  it("rejects other weekdays, impossible dates and other formats", () => {
    expect(isMondayIsoDate("2026-09-15")).toBe(false); // Tuesday
    expect(isMondayIsoDate("2026-02-30")).toBe(false);
    expect(isMondayIsoDate("2026-9-21")).toBe(false);
    expect(isMondayIsoDate("21/09/2026")).toBe(false);
  });
});

describe("pickProject", () => {
  const mk = (name: string, domain: string) => ({
    id: name,
    name,
    domain,
    created_at: "",
    google_analytics_connected: false,
    search_console_connected: false,
    shopify_connected: false,
  });

  it("prefers an exact domain over an earlier substring match", () => {
    const projects = [mk("Old Acme", "old-acme.com"), mk("Acme", "acme.com")];
    expect(pickProject(projects, "acme.com")?.name).toBe("Acme");
  });

  it("falls back to a case-insensitive substring match", () => {
    const projects = [mk("Wendella Boats", "wendellaboats.com")];
    expect(pickProject(projects, "WENDELLA")?.name).toBe("Wendella Boats");
  });
});
