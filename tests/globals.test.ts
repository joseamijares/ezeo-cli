import { describe, it, expect } from "vitest";
import { setGlobalOpts, getGlobalOpts } from "../src/lib/globals.js";

describe("GlobalOpts", () => {
  it("starts with defaults", () => {
    const opts = getGlobalOpts();
    expect(opts.json).toBe(false);
    expect(opts.noColor).toBe(false);
    expect(opts.quiet).toBe(false);
    expect(opts.format).toBe("text");
    expect(opts.project).toBeUndefined();
  });

  it("sets json and auto-updates format", () => {
    setGlobalOpts({ json: true });
    const opts = getGlobalOpts();
    expect(opts.json).toBe(true);
    expect(opts.format).toBe("json");
  });

  it("sets project", () => {
    setGlobalOpts({ project: "aquaprovac" });
    expect(getGlobalOpts().project).toBe("aquaprovac");
  });

  it("sets noColor and updates env", () => {
    setGlobalOpts({ noColor: true });
    expect(getGlobalOpts().noColor).toBe(true);
    expect(process.env.NO_COLOR).toBe("1");
  });

  it("merges partial opts without overwriting others", () => {
    setGlobalOpts({ quiet: true });
    expect(getGlobalOpts().quiet).toBe(true);
    expect(getGlobalOpts().project).toBe("aquaprovac"); // from previous test
  });
});
