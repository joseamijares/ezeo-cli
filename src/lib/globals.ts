/**
 * Global runtime options — set once from CLI flags, read anywhere.
 * This avoids threading opts through every function call.
 */
export interface GlobalOpts {
  json: boolean;
  noColor: boolean;
  quiet: boolean;
  project?: string;
  format: "text" | "json" | "md";
}

const _opts: GlobalOpts = {
  json: false,
  noColor: false,
  quiet: false,
  project: undefined,
  format: "text",
};

export function setGlobalOpts(partial: Partial<GlobalOpts>): void {
  Object.assign(_opts, partial);
  if (_opts.json) _opts.format = "json";
  if (_opts.noColor) {
    // Disable chalk colors for piping
    process.env.FORCE_COLOR = "0";
    process.env.NO_COLOR = "1";
  }
}

export function getGlobalOpts(): Readonly<GlobalOpts> {
  return _opts;
}
