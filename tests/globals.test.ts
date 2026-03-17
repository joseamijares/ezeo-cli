import { describe, it, expect, vi, afterEach } from "vitest";
import { setGlobalOpts, getGlobalOpts, debug } from "../src/lib/globals.js";

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

  it("starts with verbose=false", () => {
    // Reset to known state
    setGlobalOpts({ verbose: false });
    expect(getGlobalOpts().verbose).toBe(false);
  });

  it("sets verbose to true", () => {
    setGlobalOpts({ verbose: true });
    expect(getGlobalOpts().verbose).toBe(true);
  });
});

describe("debug()", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    setGlobalOpts({ verbose: false });
  });

  it("writes to stderr when verbose is true", () => {
    setGlobalOpts({ verbose: true });
    const spy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    debug("hello", "world");
    expect(spy).toHaveBeenCalledOnce();
    expect(spy.mock.calls[0][0]).toContain("hello world");
  });

  it("does not write to stderr when verbose is false", () => {
    setGlobalOpts({ verbose: false });
    const spy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    debug("should not appear");
    expect(spy).not.toHaveBeenCalled();
  });

  it("prefixes output with [debug]", () => {
    setGlobalOpts({ verbose: true });
    const spy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    debug("test message");
    expect(spy.mock.calls[0][0]).toContain("[debug]");
  });
});
