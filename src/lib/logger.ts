/**
 * Structured logger for Ezeo CLI.
 * Respects --quiet, --json, and --verbose flags.
 * User-facing output goes to stdout; debug/errors to stderr.
 */
import chalk from "chalk";
import { getGlobalOpts } from "./globals.js";

export const logger = {
  /** User-facing output (stdout). Suppressed by --quiet. */
  info(...args: unknown[]): void {
    if (!getGlobalOpts().quiet) {
      console.log(...args);
    }
  },

  /** Blank line for formatting. Suppressed by --quiet. */
  blank(): void {
    if (!getGlobalOpts().quiet) {
      console.log("");
    }
  },

  /** Warning (stderr, yellow). Always shown. */
  warn(...args: unknown[]): void {
    console.error(chalk.yellow("  ⚠"), ...args);
  },

  /** Error (stderr, red). Always shown. */
  error(...args: unknown[]): void {
    console.error(chalk.red("  ✗"), ...args);
  },

  /** Success (stdout, green checkmark). Suppressed by --quiet. */
  success(...args: unknown[]): void {
    if (!getGlobalOpts().quiet) {
      console.log(chalk.green("  ✓"), ...args);
    }
  },

  /** Debug output (stderr). Only shown with --verbose. */
  debug(...args: unknown[]): void {
    if (getGlobalOpts().verbose) {
      process.stderr.write(`${chalk.gray("[debug]")} ${args.map(String).join(" ")}\n`);
    }
  },

  /** JSON output (stdout). Ignores --quiet (explicit request for data). */
  json(data: unknown): void {
    process.stdout.write(JSON.stringify(data, null, 2) + "\n");
  },

  /** Raw write to stdout (tables, formatted output). Suppressed by --quiet. */
  raw(text: string): void {
    if (!getGlobalOpts().quiet) {
      process.stdout.write(text);
    }
  },
};
