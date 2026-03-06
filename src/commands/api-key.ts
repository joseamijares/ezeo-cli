import inquirer from "inquirer";
import chalk from "chalk";
import { randomBytes } from "node:crypto";
import { loadApiKeys, saveApiKeys, type ApiKeyEntry } from "../lib/config.js";
import { getGlobalOpts } from "../lib/globals.js";

const lemon = chalk.hex("#F5E642");
const cyan = chalk.hex("#00D4FF");
const lime = chalk.hex("#7CE850");
const danger = chalk.hex("#FF3B30");

function generateKey(): string {
  return "ezeo_" + randomBytes(24).toString("hex");
}

function generateId(): string {
  return randomBytes(6).toString("hex");
}

export async function apiKeyCreateCommand(opts: { name?: string }): Promise<void> {
  const { json } = getGlobalOpts();

  let name = opts.name;
  if (!name) {
    if (json) {
      console.error(JSON.stringify({ error: "Provide --name <label> for the API key" }));
      process.exit(1);
    }
    const answers = await inquirer.prompt([
      {
        type: "input",
        name: "name",
        message: "Key name (label):",
        default: `key-${new Date().toISOString().slice(0, 10)}`,
        validate: (v: string) => (v.trim().length > 0 ? true : "Name is required"),
      },
    ]);
    name = answers.name as string;
  }

  const key = generateKey();
  const entry: ApiKeyEntry = {
    id: generateId(),
    name: name.trim(),
    key,
    created_at: new Date().toISOString(),
  };

  const keys = loadApiKeys();
  keys.push(entry);
  saveApiKeys(keys);

  if (json) {
    process.stdout.write(JSON.stringify(entry, null, 2) + "\n");
    return;
  }

  console.log();
  console.log(lime("  ✓ API key created"));
  console.log();
  console.log(`  ${chalk.gray("ID:")}      ${chalk.white(entry.id)}`);
  console.log(`  ${chalk.gray("Name:")}    ${chalk.white(entry.name)}`);
  console.log(`  ${chalk.gray("Key:")}     ${lemon.bold(entry.key)}`);
  console.log(`  ${chalk.gray("Created:")} ${chalk.gray(entry.created_at)}`);
  console.log();
  console.log(chalk.gray("  Store this key securely — it won't be shown again in full."));
  console.log(chalk.gray("  Use it via: EZEO_API_KEY=<key> or in your ~/.ezeo/.env"));
  console.log();
}

export async function apiKeyListCommand(): Promise<void> {
  const { json } = getGlobalOpts();
  const keys = loadApiKeys();

  if (json) {
    process.stdout.write(JSON.stringify(keys, null, 2) + "\n");
    return;
  }

  if (keys.length === 0) {
    console.log();
    console.log(chalk.gray("  No API keys found."));
    console.log(chalk.gray("  Create one with: ezeo api-key create --name my-key"));
    console.log();
    return;
  }

  console.log();
  console.log(lemon.bold("  API Keys"));
  console.log();

  for (const k of keys) {
    const masked = k.key.slice(0, 12) + "..." + k.key.slice(-4);
    console.log(`  ${cyan(k.id)}  ${chalk.white.bold(k.name)}`);
    console.log(`    ${chalk.gray("Key:")}     ${chalk.gray(masked)}`);
    console.log(`    ${chalk.gray("Created:")} ${chalk.gray(new Date(k.created_at).toLocaleDateString())}`);
    console.log();
  }
}

export async function apiKeyRevokeCommand(keyId: string): Promise<void> {
  const { json } = getGlobalOpts();
  const keys = loadApiKeys();
  const idx = keys.findIndex((k) => k.id === keyId);

  if (idx === -1) {
    if (json) {
      console.error(JSON.stringify({ error: `Key ID "${keyId}" not found` }));
      process.exit(1);
    }
    console.log();
    console.log(danger(`  Key ID "${keyId}" not found.`));
    console.log(chalk.gray("  Run `ezeo api-key list` to see your keys."));
    console.log();
    process.exit(1);
  }

  const removed = keys[idx];

  if (!json) {
    const { confirm } = await inquirer.prompt([
      {
        type: "confirm",
        name: "confirm",
        message: `Revoke key "${removed.name}" (${keyId})?`,
        default: false,
      },
    ]);
    if (!confirm) {
      console.log(chalk.gray("  Cancelled."));
      return;
    }
  }

  keys.splice(idx, 1);
  saveApiKeys(keys);

  if (json) {
    process.stdout.write(JSON.stringify({ revoked: keyId }) + "\n");
    return;
  }

  console.log();
  console.log(lime(`  ✓ Key "${removed.name}" revoked.`));
  console.log();
}
