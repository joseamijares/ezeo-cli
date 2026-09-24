import { describe, it, expect } from "vitest";
import { isMondayIsoDate } from "../src/commands/readout.js";

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
