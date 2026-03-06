import chalk from "chalk";
import { clearCredentials, config } from "../lib/config.js";

export async function logoutCommand(): Promise<void> {
  clearCredentials();
  config.clear();
  console.log();
  console.log(chalk.green("  Logged out successfully."));
  console.log();
}
