/**
 * `ezeo agent-card` — generate an A2A-compatible agent card JSON file.
 *
 * Usage:
 *   ezeo agent-card
 *   ezeo agent-card --output ./public/.well-known/agent-card.json
 *   ezeo agent-card --print          # Print to stdout only (no file)
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import chalk from "chalk";

export interface AgentCard {
  name: string;
  description: string;
  url: string;
  version: string;
  capabilities: string[];
  authentication: {
    type: string;
    description: string;
  };
  endpoints: Array<{
    name: string;
    description: string;
    method: string;
  }>;
}

export function buildAgentCard(): AgentCard {
  return {
    name: "Ezeo SEO Agent",
    description:
      "AI-powered SEO and GEO analysis agent. Monitors AI visibility, keyword rankings, and provides content optimization recommendations.",
    url: "https://ezeo.ai",
    version: "0.3.0",
    capabilities: [
      "seo-analysis",
      "geo-visibility-monitoring",
      "keyword-tracking",
      "content-recommendations",
      "competitor-analysis",
      "pagespeed-monitoring",
    ],
    authentication: {
      type: "api-key",
      description: "Ezeo API key from ezeo.ai/settings",
    },
    endpoints: [
      {
        name: "analyze",
        description: "Run SEO/GEO analysis on a project",
        method: "POST",
      },
      {
        name: "status",
        description: "Get project health status",
        method: "GET",
      },
      {
        name: "keywords",
        description: "Get keyword rankings and changes",
        method: "GET",
      },
    ],
  };
}

interface AgentCardOptions {
  output?: string;
  print?: boolean;
}

export async function agentCardCommand(opts: AgentCardOptions): Promise<void> {
  const card = buildAgentCard();
  const json = JSON.stringify(card, null, 2);

  if (opts.print) {
    process.stdout.write(json + "\n");
    return;
  }

  const outputPath = resolve(
    opts.output ?? ".well-known/agent-card.json"
  );

  // Ensure parent directory exists
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, json + "\n", "utf-8");

  console.log("");
  console.log(
    `  ${chalk.hex("#7CE850").bold("✓")} Agent card written to ${chalk.cyan(outputPath)}`
  );
  console.log(
    `  ${chalk.gray("Serve this file at:")} ${chalk.white("/.well-known/agent-card.json")}`
  );
  console.log("");
}
