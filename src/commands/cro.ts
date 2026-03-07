import chalk from "chalk";
import ora from "ora";
import Table from "cli-table3";
import {
  fetchProjects,
  fetchCROAudits,
  fetchCRODeliverables,
  type CROAudit,
  type CRODeliverable,
} from "../lib/api.js";
import { config } from "../lib/config.js";

const lemon = chalk.hex("#F5E642");
const cyan = chalk.hex("#00D4FF");
const lime = chalk.hex("#7CE850");

function scoreColor(score: number): string {
  if (score >= 80) return lime.bold(String(score));
  if (score >= 60) return chalk.hex("#FF9500").bold(String(score));
  return chalk.hex("#FF3B30").bold(String(score));
}

function priorityLabel(priority: string): string {
  switch (priority.toLowerCase()) {
    case "high":
    case "critical":
      return chalk.hex("#FF3B30")(priority.toUpperCase());
    case "medium":
      return chalk.hex("#FF9500")(priority.toUpperCase());
    default:
      return chalk.gray(priority.toUpperCase());
  }
}

function formatFindings(findings: unknown): string[] {
  if (!findings) return [];
  if (Array.isArray(findings)) {
    return (findings as unknown[])
      .slice(0, 5)
      .map((f) => {
        if (typeof f === "string") return f;
        if (typeof f === "object" && f !== null) {
          const obj = f as Record<string, unknown>;
          return String(obj.title ?? obj.description ?? obj.message ?? JSON.stringify(f));
        }
        return String(f);
      });
  }
  if (typeof findings === "object" && findings !== null) {
    const obj = findings as Record<string, unknown>;
    if (Array.isArray(obj.items)) return formatFindings(obj.items);
    if (Array.isArray(obj.findings)) return formatFindings(obj.findings);
  }
  return [];
}

export async function croCommand(projectName?: string): Promise<void> {
  const spinner = ora("Loading CRO data...").start();

  try {
    const projects = await fetchProjects();

    let project;
    if (projectName) {
      project = projects.find(
        (p) =>
          p.name.toLowerCase().includes(projectName.toLowerCase()) ||
          p.domain?.toLowerCase().includes(projectName.toLowerCase())
      );
      if (!project) {
        spinner.fail(`Project "${projectName}" not found`);
        console.log(
          chalk.gray(`  Available: ${projects.map((p) => p.name).join(", ")}`)
        );
        return;
      }
    } else {
      const defaultId = config.get("defaultProject");
      if (defaultId) project = projects.find((p) => p.id === defaultId);
      if (!project) project = projects[0];
      if (!project) {
        spinner.fail("No projects found");
        return;
      }
    }

    spinner.text = `Loading CRO data for ${project.name}...`;

    const [audits, deliverables] = await Promise.all([
      fetchCROAudits(project.id).catch(() => [] as CROAudit[]),
      fetchCRODeliverables(project.id).catch(() => [] as CRODeliverable[]),
    ]);

    spinner.stop();

    if (audits.length === 0 && deliverables.length === 0) {
      console.log(
        chalk.gray(
          "\n  No CRO audits yet. Run one from the Ezeo dashboard."
        )
      );
      return;
    }

    console.log("");
    console.log(lemon.bold(`  ${project.name}`) + chalk.gray(` (${project.domain})`));
    console.log("");

    // Latest audit
    if (audits.length > 0) {
      const latest = audits[0];
      const score = latest.overall_score;
      const findings = formatFindings(latest.findings);
      const dateStr = new Date(latest.created_at).toLocaleDateString();

      console.log(cyan.bold("  Latest CRO Audit"));
      if (latest.title) {
        console.log(`    ${chalk.white.bold(latest.title)}`);
      }
      console.log(
        `    Date: ${chalk.white(dateStr)}  |  ` +
        `Status: ${chalk.white(latest.status)}` +
        (score != null ? `  |  Score: ${scoreColor(score)}/100` : "")
      );
      if (latest.target_url) {
        console.log(`    URL:  ${chalk.gray(latest.target_url)}`);
      }

      // Sub-scores
      const subs = [
        latest.ux_score != null ? `UX ${scoreColor(latest.ux_score)}` : null,
        latest.performance_score != null ? `Perf ${scoreColor(latest.performance_score)}` : null,
        latest.conversion_score != null ? `Conv ${scoreColor(latest.conversion_score)}` : null,
        latest.mobile_score != null ? `Mobile ${scoreColor(latest.mobile_score)}` : null,
      ].filter(Boolean);
      if (subs.length > 0) {
        console.log(`    ${subs.join("  |  ")}`);
      }

      if (findings.length > 0) {
        console.log("");
        console.log(cyan.bold("  Findings"));
        for (const finding of findings) {
          console.log(`    ${chalk.hex("#FF3B30")("▸")} ${chalk.white(finding)}`);
        }
      }

      // Quick wins
      const quickWins = latest.quick_wins;
      if (quickWins && quickWins.length > 0) {
        console.log("");
        console.log(cyan.bold("  Quick Wins"));
        for (const qw of quickWins.slice(0, 5)) {
          const effort = qw.effort === "low" ? lime("easy") : qw.effort === "medium" ? chalk.hex("#FF9500")("medium") : chalk.hex("#FF3B30")("hard");
          const impact = qw.impact === "high" ? lime("high impact") : qw.impact === "medium" ? chalk.hex("#FF9500")("med impact") : chalk.gray("low impact");
          console.log(`    ${lime("✦")} ${chalk.white(qw.title)}  ${chalk.gray("—")} ${effort}, ${impact}`);
        }
      }
      console.log("");
    }

    // Pending deliverables
    const pending = deliverables.filter(
      (d) => d.status.toLowerCase() !== "done" && d.status.toLowerCase() !== "completed"
    );

    if (pending.length > 0) {
      console.log(cyan.bold("  Pending Deliverables"));

      const table = new Table({
        head: [
          chalk.gray("Title"),
          chalk.gray("Priority"),
          chalk.gray("Status"),
        ],
        style: { head: [], border: ["gray"] },
        colWidths: [42, 12, 14],
      });

      for (const d of pending.slice(0, 10)) {
        table.push([
          chalk.white(d.title),
          priorityLabel(d.priority),
          chalk.gray(d.status),
        ]);
      }

      console.log(table.toString());
      console.log("");
    } else if (deliverables.length > 0) {
      console.log(lime("  All deliverables completed."));
      console.log("");
    }
  } catch (err) {
    spinner.fail("Failed to load CRO data");
    console.log(
      `${chalk.hex("#FF3B30").bold("  Error:")} ${chalk.white(err instanceof Error ? err.message : String(err))}`
    );
    process.exit(1);
  }
}
