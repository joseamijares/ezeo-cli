import { loadCredentials } from "../lib/config.js";
import { config } from "../lib/config.js";
import { formatWhoami, formatError } from "../lib/formatter.js";

export async function whoamiCommand(): Promise<void> {
  const creds = loadCredentials();

  if (!creds || !creds.access_token) {
    console.log(formatError("Not logged in. Run `ezeo login` first."));
    process.exit(1);
    return;
  }

  const defaultProjectName = config.get("defaultProjectName") as string | undefined;

  console.log(
    formatWhoami(creds.user_email, defaultProjectName, creds.expires_at)
  );
}
